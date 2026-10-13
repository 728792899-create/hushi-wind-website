#!/usr/bin/env node
// Local synthetic capacity evidence only. No dotenv, deployment or existing database inputs.
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');
const { performance, monitorEventLoopDelay } = require('node:perf_hooks');

const apiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(apiRoot, '..');
const logsRoot = path.join(repoRoot, 'logs');
const MiB = 1024 * 1024;
const MAX_DISK = 8 * 1024 * MiB;
const MAX_RSS = 2 * 1024 * MiB;
const RUN_BUDGET_MS = 20 * 60 * 1000;
const profiles = Object.freeze({
  empty: { auditRows: 0, historyRows: 0, assetMiB: 0 },
  medium: { auditRows: 10000, historyRows: 10000, assetMiB: 16 },
  large: { auditRows: 100000, historyRows: 100000, assetMiB: 128 },
});
const inside = (child, parent) => child.startsWith(parent + path.sep);
const failure = (code, message) => Object.assign(new Error(message), { code });
const coreFiles = ['server.js', 'lib/audit-integrity.js', 'lib/audit-snapshot.js', 'lib/database-backup.js',
  'lib/restore-drill.js', 'lib/sqlite-transaction.js', 'lib/scheduled-audit.js', 'lib/service-lifecycle.js', 'prisma/schema.prisma',
  'scripts/drill-capacity.js', 'tests/fixtures/shutdown-preload.cjs'];
const activeChildren = new Set();
const coreHashes = async () => Object.fromEntries(await Promise.all(coreFiles.map(async file =>
  [file, await hashFile(path.join(apiRoot, file)).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error))])));

function parseArgs(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index], value = args[index + 1];
    if (!['--scratch-root', '--profile'].includes(key) || !value || values[key])
      throw failure('CAPACITY_ARGUMENTS', 'Require --scratch-root ABS_INSIDE_REPO_LOGS and --profile empty|medium|large');
    values[key] = value;
  }
  const scratchRoot = values['--scratch-root'];
  if (!scratchRoot || !path.isAbsolute(scratchRoot) || !inside(path.resolve(scratchRoot), logsRoot))
    throw failure('CAPACITY_SCRATCH_PATH', 'Scratch root must be an explicit absolute child of this repository logs directory');
  if (!Object.hasOwn(profiles, values['--profile']))
    throw failure('CAPACITY_PROFILE', 'Choose the fixed empty, medium or large synthetic profile');
  return { scratchRoot: path.resolve(scratchRoot), profile: values['--profile'] };
}

async function validateScratchRoot(value) {
  if (!path.isAbsolute(value || '') || !inside(path.resolve(value), logsRoot))
    throw failure('CAPACITY_SCRATCH_PATH', 'Scratch must remain inside repository logs');
  // Reject any existing symlink component, including the repository/logs ancestors.
  let current = path.parse(value).root;
  for (const segment of path.resolve(value).slice(current.length).split(path.sep)) {
    current = path.join(current, segment);
    try {
      const stat = await fs.lstat(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw failure('CAPACITY_SCRATCH_PATH', 'Scratch ancestors must be regular directories');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await fs.mkdir(value, { recursive: true, mode: 0o700 });
  if (await fs.realpath(value) !== path.resolve(value)) throw failure('CAPACITY_SCRATCH_PATH', 'Scratch path must not redirect');
  return value;
}

function isolatedEnv(root) {
  return {
    ...Object.fromEntries(['PATH', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'SystemRoot']
      .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]])),
    NODE_ENV: 'test', NODE_OPTIONS: '', TOKIO_WORKER_THREADS: '2', TMPDIR: root,
    DATABASE_URL: `file:${path.join(root, 'source.db')}`,
    ALERT_WEBHOOK_URL: '', ALERT_EMAIL_TO: '',
  };
}

async function treeBytes(root) {
  let bytes = 0, allocatedBytes = 0, files = 0;
  for (const item of await fs.readdir(root, { withFileTypes: true })) {
    const file = path.join(root, item.name), stat = await fs.lstat(file);
    if (stat.isSymbolicLink()) throw failure('CAPACITY_LINK', 'Synthetic workspace must not contain symbolic links');
    if (stat.isDirectory()) {
      const nested = await treeBytes(file); bytes += nested.bytes; allocatedBytes += nested.allocatedBytes; files += nested.files;
    } else if (stat.isFile()) { bytes += stat.size; allocatedBytes += stat.blocks * 512; files++; }
    else throw failure('CAPACITY_FILE_TYPE', 'Unexpected synthetic workspace entry');
  }
  return { bytes, allocatedBytes, files };
}

async function hashFile(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of syncFs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

function startMetrics() {
  const started = performance.now(), before = process.memoryUsage(), cpu = process.cpuUsage();
  const lag = monitorEventLoopDelay({ resolution: 10 }); lag.enable();
  let peakRss = before.rss;
  const timer = setInterval(() => {
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
    if (peakRss > MAX_RSS) {
      console.error('CAPACITY_RSS_LIMIT: local measurement exceeded 2 GiB');
      process.exit(2);
    }
  }, 50);
  timer.unref();
  return () => {
    clearInterval(timer); lag.disable();
    const after = process.memoryUsage(), usage = process.cpuUsage(cpu);
    return { wallMs: performance.now() - started, rssBefore: before.rss, rssAfter: after.rss,
      peakRss: Math.max(peakRss, after.rss, process.resourceUsage().maxRSS * 1024),
      heapUsedAfter: after.heapUsed, cpuUserMs: usage.user / 1000, cpuSystemMs: usage.system / 1000,
      eventLoop: { samples: lag.count, meanMs: lag.count ? lag.mean / 1e6 : null,
        p99Ms: lag.count ? lag.percentile(99) / 1e6 : null, maxMs: lag.count ? lag.max / 1e6 : null } };
  };
}

async function prepareFixture(root, profile) {
  const { PrismaClient } = require('@prisma/client');
  const { initializeAuditIntegrity, appendOperationLog } = require('../lib/audit-integrity');
  const source = path.join(root, 'source.db'), uploads = path.join(root, 'uploads');
  await fs.mkdir(uploads); await fs.mkdir(path.join(root, 'backups'));
  const migrations = path.join(apiRoot, 'prisma/migrations');
  const names = (await fs.readdir(migrations)).filter(name => /^\d/.test(name)).sort();
  const sql = (await Promise.all(names.map(name => fs.readFile(path.join(migrations, name, 'migration.sql'), 'utf8')))).join('\n');
  const migrated = spawnSync('sqlite3', [source], { input: sql, encoding: 'utf8', env: isolatedEnv(root), timeout: 30000 });
  if (migrated.status !== 0) throw failure('CAPACITY_MIGRATION', migrated.stderr || migrated.error?.message || 'Synthetic migration failed');
  const assetCount = Math.ceil(profile.assetMiB / 16);
  for (let file = 0; file < assetCount; file++) {
    const handle = await fs.open(path.join(uploads, `asset-${file}.bin`), 'wx', 0o600);
    try {
      for (let block = 0; block < Math.min(16, profile.assetMiB - file * 16); block++)
        await handle.writeFile(crypto.randomBytes(MiB));
      await handle.sync();
    } finally { await handle.close(); }
  }
  const db = new PrismaClient({ datasourceUrl: `file:${source}` });
  try {
    await db.adminUser.create({ data: { username: 'capacity_fixture', role: 'super_admin', passwordSalt: 'synthetic-only', passwordHash: 'synthetic-only' } });
    await db.systemConfig.create({ data: { id: 1, aboutTitle: 'Local synthetic capacity fixture' } });
    await db.product.create({ data: { title: 'Synthetic capacity product', slug: 'capacity-fixture', type: 'fixture', categoryName: 'fixture', description: 'local fixture', imageUrl: assetCount ? '/uploads/asset-0.bin' : '' } });
    await initializeAuditIntegrity(db);
    const summary = 'Synthetic capacity log '.padEnd(1024, 'x');
    for (let start = 0; start < profile.auditRows; start += 100) {
      await db.$transaction(async tx => {
        for (let index = start; index < Math.min(start + 100, profile.auditRows); index++)
          await appendOperationLog(tx, { action: 'CAPACITY_FIXTURE', module: 'security', operator: 'synthetic-only', targetId: String(index), summary });
      }, { maxWait: 10000, timeout: 15000 });
    }
    const base = { content: '', ...(assetCount ? { imageUrl: '/uploads/asset-0.bin' } : {}) };
    base.content = 'x'.repeat(1024 - Buffer.byteLength(JSON.stringify(base)));
    const snapshot = JSON.stringify(base);
    for (let start = 0; start < profile.historyRows; start += 100)
      await db.contentVersion.createMany({ data: Array.from({ length: Math.min(100, profile.historyRows - start) }, (_, i) => ({ module: 'products', recordId: start + i + 1, title: 'Synthetic history', snapshot })) });
    return { ...profile, assetCount, historyPayloadBytes: Buffer.byteLength(snapshot), auditPayloadBytes: Buffer.byteLength(summary),
      signedAuditRows: await db.auditLogEntry.count(), databaseBytes: (await fs.stat(source)).size, assets: await treeBytes(uploads) };
  } finally { await db.$disconnect(); }
}

async function phaseAction(phase, root, profile) {
  if (phase === 'prepare') return prepareFixture(root, profile);
  const { PrismaClient } = require('@prisma/client');
  const { verifyAuditIntegrity } = require('../lib/audit-integrity');
  const { createDatabaseBackup, verifyBackupBundle } = require('../lib/database-backup');
  const { restoreBackupDrill } = require('../lib/restore-drill');
  const source = path.join(root, 'source.db'), backup = path.join(root, 'backups/database.manual.capacity.db');
  if (phase === 'audit') {
    const db = new PrismaClient({ datasourceUrl: `file:${source}` });
    try { return await verifyAuditIntegrity(db); } finally { await db.$disconnect(); }
  }
  if (phase === 'auditSnapshot') return require('../lib/audit-snapshot').verifyLiveAuditSnapshot(source, { scratchRoot: path.join(root, 'audit-checks') });
  if (phase === 'backup') return createDatabaseBackup(source, backup, { uploadsRoot: path.join(root, 'uploads'), requireAssets: true });
  if (phase === 'verify') return verifyBackupBundle(backup, { requireAssets: true });
  if (phase === 'restore') return restoreBackupDrill(backup, { scratchRoot: path.join(root, 'restore-checks') });
  throw failure('CAPACITY_PHASE', 'Unknown synthetic measurement phase');
}

async function internalWorker() {
  if (!process.send || !process.env.CAPACITY_WORKSPACE) throw failure('CAPACITY_INTERNAL', 'Internal worker requires parent IPC');
  const root = process.env.CAPACITY_WORKSPACE;
  await validateScratchRoot(root);
  process.once('message', async message => {
    const finish = startMetrics();
    try {
      const result = await phaseAction(message.phase, root, profiles[message.profile]);
      process.send({ ok: true, result, metrics: finish() }, () => process.disconnect());
    } catch (error) {
      process.send({ ok: false, error: { code: error.code || 'CAPACITY_PHASE_FAILED', message: error.message }, metrics: finish() }, () => { process.exitCode = 1; process.disconnect(); });
    }
  });
}

function runChild(command, args, { root, env, deadline, label, onMessage } = {}) {
  const child = spawn(command, args, { cwd: apiRoot, env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  activeChildren.add(child);
  const messages = [], waiters = new Set();
  let ended, terminalError;
  for (const [stream, suffix] of [[child.stdout, 'stdout'], [child.stderr, 'stderr']])
    stream.on('data', data => syncFs.appendFileSync(path.join(root, `${label}-${suffix}.log`), data));
  const timer = setTimeout(() => { terminalError = failure('CAPACITY_DEADLINE', 'Local drill exceeded its 20 minute safety deadline'); child.kill('SIGKILL'); }, Math.max(1, deadline - Date.now()));
  const exited = new Promise(resolve => {
    const finish = (code, signal) => {
      if (ended) return;
      clearTimeout(timer); ended = { code, signal };
      activeChildren.delete(child);
      for (const waiter of waiters) waiter.reject(terminalError || failure('CAPACITY_CHILD_EXIT', `${label} exited before ${waiter.label}: ${code}/${signal}`));
      waiters.clear(); resolve({ ...ended, error: terminalError?.code });
    };
    child.once('error', error => { terminalError = error; finish(null, null); });
    child.once('exit', finish);
  });
  child.on('message', message => {
    messages.push(message); onMessage?.(message);
    for (const waiter of waiters) if (waiter.matches(message)) { waiters.delete(waiter); waiter.resolve(message); }
  });
  const wait = (matches, label) => {
    const found = messages.find(matches);
    if (found !== undefined) return Promise.resolve(found);
    if (ended) return Promise.reject(failure('CAPACITY_CHILD_EXIT', `${label} unavailable after exit`));
    return new Promise((resolve, reject) => waiters.add({ matches, label, resolve, reject }));
  };
  return { child, exited, messages, wait };
}

async function measurePhase(phase, root, profile, deadline) {
  const runtime = runChild(process.execPath, [__filename, '--internal-worker'], {
    root, label: phase, deadline, env: { ...isolatedEnv(root), CAPACITY_WORKSPACE: root },
  });
  runtime.child.send({ phase, profile });
  const message = await runtime.wait(item => typeof item?.ok === 'boolean', `${phase} report`);
  const exit = await runtime.exited;
  return { ...message, exit };
}

function request(origin, token, route, body) {
  return new Promise(resolve => {
    const req = http.request(origin + route, { method: body ? 'POST' : 'GET', agent: false,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }, res => {
      let text = ''; res.on('data', chunk => { text += chunk; });
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(text) }); } catch { resolve({ status: res.statusCode }); } });
      res.on('error', error => resolve({ error: error.code }));
    });
    req.on('error', error => resolve({ error: error.code }));
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

async function measureShutdown(kind, root, deadline) {
  const { PrismaClient } = require('@prisma/client');
  const { verifyAuditIntegrity } = require('../lib/audit-integrity');
  const serviceRoot = path.join(root, `service-${kind}`), backups = path.join(serviceRoot, 'backups');
  await fs.mkdir(backups, { recursive: true });
  const source = path.join(root, 'source.db'), database = path.join(serviceRoot, 'source.db');
  await fs.copyFile(source, database, syncFs.constants.COPYFILE_EXCL);
  const filename = 'database.scheduled.capacity.db', backup = path.join(backups, filename);
  for (const suffix of ['', '.manifest.json', '.assets'])
    await fs.cp(path.join(root, 'backups/database.manual.capacity.db') + suffix, backup + suffix, { recursive: true, force: false, errorOnExist: true });
  const db = new PrismaClient({ datasourceUrl: `file:${database}` });
  let runtime;
  try {
    const record = await db.backupRecord.create({ data: { filename, size: (await fs.stat(backup)).size, status: 'success', operator: 'scheduled' } });
    const admin = await db.adminUser.findUnique({ where: { username: 'capacity_fixture' } });
    await db.$disconnect();
    const secret = crypto.randomBytes(32).toString('hex'), now = Date.now();
    const payload = Buffer.from(JSON.stringify({ kind: 'admin-session', sub: admin.username, uid: admin.id, role: admin.role, tv: admin.tokenVersion, iat: now, auth: now, exp: now + RUN_BUDGET_MS })).toString('base64url');
    const token = `${payload}.${crypto.createHmac('sha256', secret).update(payload).digest('base64url')}`;
    runtime = runChild(process.execPath, ['--require', __filename, '--require', path.join(apiRoot, 'tests/fixtures/shutdown-preload.cjs'), 'server.js'], {
      root, label: `shutdown-${kind}`, deadline, env: { ...isolatedEnv(serviceRoot),
        DATABASE_URL: `file:${database}`, HOST: '127.0.0.1', PORT: '0', UPLOAD_DIR: path.join(root, 'uploads'), DATABASE_BACKUP_DIR: backups,
        ADMIN_USERNAME: 'capacity_fixture', ADMIN_PASSWORD: 'CapacitySynthetic9!', ADMIN_TOKEN_SECRET: secret,
        ADMIN_IP_ALLOWLIST: '127.0.0.1', TRUST_PROXY: 'false', API_RATE_LIMIT: '10000', DEPLOY_WRITE_GATE_FILE: '',
        API_PUBLIC_URL: 'http://127.0.0.1', UPLOAD_PUBLIC_BASE: 'http://127.0.0.1', PUBLIC_SITE_URL: 'http://127.0.0.1', PUBLIC_ADMIN_URL: 'http://127.0.0.1', ALLOWED_ORIGINS: 'http://127.0.0.1',
        SHUTDOWN_FIXTURE_ROOT: serviceRoot, SHUTDOWN_TIMEOUT_MS: '60000', CAPACITY_PRELOAD: '1',
        CAPACITY_AUDIT_GATE: kind === 'audit' ? '1' : '',
        CAPACITY_METRICS_FILE: path.join(serviceRoot, 'metrics.json'),
      },
    });
    await runtime.wait(item => item === 'ready', 'main ready');
    const listening = await runtime.wait(item => item?.type === 'listening', 'bound port');
    const origin = `http://127.0.0.1:${listening.port}`;
    await runtime.wait(item => item?.type === 'background-done' && item.task === 'backup', 'initial backup verification');
    await runtime.wait(item => item?.type === 'background-done' && item.task === 'maintenance', 'initial maintenance');
    let response = Promise.resolve({});
    if (kind !== 'audit') {
      await runtime.wait(item => item?.type === 'capacity-audit-done', 'initial periodic audit');
      const id = crypto.randomUUID(); runtime.child.send({ command: 'arm', kind, id });
      await runtime.wait(item => item?.type === 'ack' && item.id === id, 'barrier armed');
      response = request(origin, token, kind === 'backup' ? '/api/admin/backups' : `/api/admin/backups/${record.id}/verify-restore`, { confirmation: '确认执行' });
    }
    await runtime.wait(item => item?.type === 'gate' && item.kind === kind, 'real copy barrier');
    const signalAt = performance.now(); runtime.child.kill('SIGTERM');
    await runtime.wait(item => item?.type === 'ingress-closed', 'ingress closed');
    const rejected = await request(origin, token, '/health');
    const releasedAt = performance.now(); runtime.child.send({ command: kind === 'audit' ? 'capacity-audit-release' : 'release' });
    const exit = await runtime.exited, drainMs = performance.now() - signalAt;
    const result = await response;
    const persisted = kind === 'audit' ? await db.maintenanceRun.findFirst({ where: { task: 'scheduled-audit' }, orderBy: { id: 'desc' } }) : kind === 'backup'
      ? await db.backupRecord.findFirst({ where: { operator: 'capacity_fixture' }, orderBy: { id: 'desc' } })
      : await db.backupRecord.findUnique({ where: { id: record.id } });
    const names = await fs.readdir(backups);
    const scratch = await fs.readdir(path.join(backups, 'restore-checks')).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error));
    const audit = await verifyAuditIntegrity(db);
    const metrics = JSON.parse(await fs.readFile(path.join(serviceRoot, 'metrics.json'), 'utf8'));
    const clean = !names.some(name => name.startsWith('.backup-') || name.startsWith('.audit-check-') || name.endsWith('.lock')) && scratch.length === 0;
    return { ok: Boolean(exit.code === 0 && (kind === 'audit' || result.status === (kind === 'backup' ? 201 : 200)) && clean && audit.ok && (rejected.error || rejected.status === 503) && (kind !== 'restore' ? persisted?.status === 'success' : persisted?.verificationStatus === 'verified')),
      exit, drainMs, gateDuringDrainMs: releasedAt - signalAt, metrics, httpStatus: result.status,
      rejectedIngress: rejected.error || rejected.status, persistedStatus: kind !== 'restore' ? persisted?.status : persisted?.verificationStatus,
      cleanupVerified: clean, auditLogCount: audit.logCount };
  } finally {
    if (runtime && runtime.child.exitCode === null && runtime.child.signalCode === null) { runtime.child.kill('SIGKILL'); await runtime.exited; }
    await db.$disconnect();
  }
}

async function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  await validateScratchRoot(options.scratchRoot);
  const profile = profiles[options.profile], estimated = 4 * ((profile.auditRows + profile.historyRows) * 2048 + profile.assetMiB * MiB) + 128 * MiB;
  const disk = await fs.statfs(options.scratchRoot);
  if (disk.bavail * disk.bsize < estimated + 2048 * MiB) throw failure('CAPACITY_DISK_RESERVE', 'Insufficient local disk reserve for the chosen profile');
  const root = await fs.mkdtemp(path.join(options.scratchRoot, `capacity-${options.profile}-`));
  const report = { schemaVersion: 1, profile: options.profile, dimensions: profile, startedAt: new Date().toISOString(),
    node: process.version, platform: process.platform, limits: { wallMs: RUN_BUDGET_MS, diskBytes: MAX_DISK, rssBytes: MAX_RSS, shutdownMs: 60000, tokioWorkers: 2 },
    phases: {}, shutdown: {}, coreBefore: await coreHashes(), status: 'running' };
  const deadline = Date.now() + RUN_BUDGET_MS;
  let interrupted;
  const stop = signal => {
    interrupted = signal;
    for (const child of activeChildren) child.kill('SIGKILL');
  };
  const interrupt = () => stop('SIGINT'), terminate = () => stop('SIGTERM');
  process.on('SIGINT', interrupt); process.on('SIGTERM', terminate);
  const checkBudget = () => {
    if (interrupted) throw failure('CAPACITY_INTERRUPTED', `Local drill interrupted by ${interrupted}; no completion claimed`);
    if (Date.now() >= deadline) throw failure('CAPACITY_DEADLINE', 'Local drill exceeded its 20 minute safety deadline');
  };
  const save = () => fs.writeFile(path.join(root, 'report.json'), JSON.stringify(report, null, 2));
  const fail = error => { report.status = 'failed'; report.error = { code: error.code || 'CAPACITY_FAILED', message: error.message }; };
  try {
    for (const phase of ['prepare', 'audit', 'auditSnapshot', 'backup', 'verify', 'restore']) {
      checkBudget();
      report.phases[phase] = await measurePhase(phase, root, options.profile, deadline);
      report.phases[phase].disk = await treeBytes(root); await save();
      if (report.phases[phase].disk.bytes > MAX_DISK) throw failure('CAPACITY_DISK_LIMIT', 'Synthetic workspace exceeded 8 GiB');
      if (!report.phases[phase].ok || report.phases[phase].exit.code !== 0) throw failure('CAPACITY_MEASUREMENT_FAILED', `${phase} failed; evidence retained`);
    }
    const sourceBefore = await hashFile(path.join(root, 'source.db'));
    const backup = path.join(root, 'backups/database.manual.capacity.db');
    report.backupHashes = { database: await hashFile(backup), manifest: await hashFile(backup + '.manifest.json'),
      assets: JSON.parse(await fs.readFile(backup + '.manifest.json', 'utf8')).assets };
    for (const kind of ['backup', 'restore', 'audit']) {
      checkBudget();
      report.shutdown[kind] = await measureShutdown(kind, root, deadline);
      report.shutdown[kind].disk = await treeBytes(root); await save();
      if (!report.shutdown[kind].ok) throw failure('CAPACITY_DRAIN_FAILED', `${kind} shutdown did not meet its existing contract`);
      if (report.shutdown[kind].disk.bytes > MAX_DISK) throw failure('CAPACITY_DISK_LIMIT', 'Synthetic workspace exceeded 8 GiB');
    }
    report.sourceUnchanged = sourceBefore === await hashFile(path.join(root, 'source.db'));
    if (!report.sourceUnchanged) throw failure('CAPACITY_SOURCE_CHANGED', 'Synthetic source unexpectedly changed');
    checkBudget();
  } catch (error) { fail(error); }
  finally {
    try {
      report.coreAfter = await coreHashes();
      report.stableCore = JSON.stringify(report.coreBefore) === JSON.stringify(report.coreAfter);
      for (const kind of ['backup', 'restore', 'audit']) {
        for (const name of ['events.jsonl', 'capacity-events.jsonl', 'metrics.json']) {
          const file = path.join(root, `service-${kind}`, name);
          await fs.copyFile(file, path.join(root, `shutdown-${kind}-${name}.log`)).catch(error => { if (error.code !== 'ENOENT') throw error; });
        }
      }
      // Only this invocation's generated data is removed. Transcripts and report remain.
      for (const item of await fs.readdir(root)) if (!item.endsWith('.log') && item !== 'report.json')
        await fs.rm(path.join(root, item), { recursive: true, force: true });
      checkBudget();
      if (!report.error) report.status = report.stableCore ? 'passed' : 'implementation-in-progress';
    } catch (error) { fail(error); }
    report.completedAt = new Date().toISOString();
    try {
      await save();
      // Signals remain handled through cleanup and the final asynchronous write.
      // An interrupt or expired budget during that write must replace a passed report.
      checkBudget();
    } catch (error) {
      fail(error); await save();
    } finally {
      process.off('SIGINT', interrupt); process.off('SIGTERM', terminate);
    }
  }
  console.log(JSON.stringify({ status: report.status, report: path.join(root, 'report.json') }));
  if (report.status !== 'passed') process.exitCode = 1;
  return report;
}

// A private, explicit preload measures the actual server child without modifying server code.
if (require.main !== module && process.env.CAPACITY_PRELOAD === '1' && process.send) {
  const target = process.env.CAPACITY_METRICS_FILE;
  if (!target || !inside(path.resolve(target), logsRoot)) throw failure('CAPACITY_INTERNAL', 'Invalid synthetic metrics path');
  const finish = startMetrics();
  process.once('exit', () => syncFs.writeFileSync(target, JSON.stringify(finish())));
  const event = value => {
    syncFs.appendFileSync(path.join(path.dirname(target), 'capacity-events.jsonl'), JSON.stringify(value) + '\n');
    if (process.connected) process.send(value, () => {});
  };
  const scheduler = require('../lib/scheduled-audit'), create = scheduler.createAuditScheduler;
  scheduler.createAuditScheduler = (...args) => {
    const instance = create(...args), run = instance.run;
    instance.run = async (...params) => {
      event({ type: 'capacity-audit-start' });
      try { return await run(...params); }
      finally { event({ type: 'capacity-audit-done' }); }
    };
    return instance;
  };
  if (process.env.CAPACITY_AUDIT_GATE === '1') {
    const audit = require('../lib/audit-integrity'), verify = audit.verifyAuditSnapshot;
    let armed = true;
    audit.verifyAuditSnapshot = async (file, ...args) => {
      if (armed && file.includes(`${path.sep}.audit-check-`)) {
        armed = false;
        await new Promise(resolve => {
          const release = message => { if (message?.command === 'capacity-audit-release') { process.off('message', release); resolve(); } };
          process.on('message', release); event({ type: 'gate', kind: 'audit' });
        });
      }
      return verify(file, ...args);
    };
  }
}
if (require.main === module) {
  const action = process.argv[2] === '--internal-worker' ? internalWorker() : main();
  action.catch(error => { console.error(JSON.stringify({ status: 'failed', error: { code: error.code || 'CAPACITY_FAILED', message: error.message } })); process.exitCode = 1; });
}
module.exports = { parseArgs, validateScratchRoot, isolatedEnv, profiles, main };
