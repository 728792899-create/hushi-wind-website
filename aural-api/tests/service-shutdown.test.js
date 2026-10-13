const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { appendFileSync } = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { initializeAuditIntegrity, verifyAuditIntegrity } = require('../lib/audit-integrity');
const { verifyBackupBundle } = require('../lib/database-backup');

const apiRoot = path.resolve(__dirname, '..');
const logRoot = path.resolve(apiRoot, '../logs/step8-20261013');
const confirmation = { confirmation: '确认执行' };
const bounded = (promise, label, milliseconds = 12000) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), milliseconds);
  })]).finally(() => clearTimeout(timer));
};

async function fixture(t) {
  await fs.mkdir(logRoot, { recursive: true });
  const root = await fs.mkdtemp(path.join(logRoot, 'shutdown-'));
  const database = path.join(root, 'database.db');
  const uploads = path.join(root, 'uploads');
  const backups = path.join(root, 'backups');
  await fs.mkdir(uploads); await fs.mkdir(backups);
  await fs.writeFile(path.join(uploads, 'fixture.txt'), 'synthetic shutdown fixture');
  const secret = crypto.randomBytes(32).toString('hex');
  const env = {
    ...Object.fromEntries(['PATH', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'SystemRoot']
      .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]])),
    NODE_ENV: 'test', NODE_OPTIONS: '', TOKIO_WORKER_THREADS: '2', TMPDIR: root,
    DATABASE_URL: `file:${database}`, HOST: '127.0.0.1', PORT: '0',
    UPLOAD_DIR: uploads, DATABASE_BACKUP_DIR: backups,
    ADMIN_USERNAME: 'shutdown_fixture', ADMIN_PASSWORD: 'ShutdownFixture9!', ADMIN_TOKEN_SECRET: secret,
    ADMIN_IP_ALLOWLIST: '127.0.0.1', TRUST_PROXY: 'false', API_RATE_LIMIT: '10000',
    ALERT_WEBHOOK_URL: '', ALERT_EMAIL_TO: '', DEPLOY_WRITE_GATE_FILE: '',
    API_PUBLIC_URL: 'http://127.0.0.1', UPLOAD_PUBLIC_BASE: 'http://127.0.0.1',
    PUBLIC_SITE_URL: 'http://127.0.0.1', PUBLIC_ADMIN_URL: 'http://127.0.0.1',
    ALLOWED_ORIGINS: 'http://127.0.0.1', SHUTDOWN_FIXTURE_ROOT: root, SHUTDOWN_TIMEOUT_MS: '8000',
  };
  const migrated = spawnSync(process.execPath, [path.join(apiRoot, 'node_modules/prisma/build/index.js'),
    'migrate', 'deploy', '--schema', path.join(apiRoot, 'prisma/schema.prisma')],
  { cwd: apiRoot, env, encoding: 'utf8' });
  assert.equal(migrated.status, 0, migrated.stdout + migrated.stderr);
  const db = new PrismaClient({ datasourceUrl: `file:${database}` });
  const admin = await db.adminUser.create({ data: {
    username: 'shutdown_fixture', role: 'super_admin', passwordSalt: 'synthetic', passwordHash: 'synthetic',
  } });
  await db.systemConfig.create({ data: { id: 1, aboutTitle: '合成停机夹具' } });
  await db.product.create({ data: {
    title: '合成停机产品', slug: 'shutdown-fixture', type: 'fixture', categoryName: 'fixture',
    description: 'synthetic', imageUrl: '/uploads/fixture.txt',
  } });
  await initializeAuditIntegrity(db);
  await db.$disconnect();
  const now = Date.now();
  const payload = Buffer.from(JSON.stringify({ kind: 'admin-session', sub: admin.username,
    uid: admin.id, role: admin.role, tv: admin.tokenVersion, iat: now, auth: now, exp: now + 600000 })).toString('base64url');
  const token = `${payload}.${crypto.createHmac('sha256', secret).update(payload).digest('base64url')}`;
  const children = [];
  t.after(async () => {
    for (const runtime of children) {
      if (runtime.child.exitCode === null && runtime.child.signalCode === null) {
        runtime.child.kill('SIGKILL');
        await runtime.exited;
      }
    }
    await db.$disconnect();
    // Keep per-process transcripts as local evidence; remove synthetic data.
    for (const name of await fs.readdir(root)) {
      if (!['events.jsonl', 'stdout.log', 'stderr.log'].includes(name))
        await fs.rm(path.join(root, name), { recursive: true, force: true });
    }
  });
  function start(overrides = {}) {
    const child = spawn(process.execPath, ['--require', path.join(__dirname, 'fixtures/shutdown-preload.cjs'), 'server.js'], {
      cwd: apiRoot, env: { ...env, ...overrides }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    const messages = [], waiters = new Set();
    let stdout = '', stderr = '', ended;
    const exited = new Promise((resolve) => child.once('exit', (code, signal) => {
      ended = { code, signal }; resolve(ended);
      for (const waiter of waiters) waiter.reject(new Error(`Child exited before ${waiter.label}: ${code}/${signal}\n${stderr}`));
    }));
    child.stdout.on('data', data => { stdout += data; appendFileSync(path.join(root, 'stdout.log'), data); });
    child.stderr.on('data', data => { stderr += data; appendFileSync(path.join(root, 'stderr.log'), data); });
    child.on('message', (message) => {
      messages.push(message);
      for (const waiter of waiters) {
        if (waiter.matches(message)) { waiters.delete(waiter); waiter.resolve(message); }
      }
    });
    const wait = (matches, label) => {
      const existing = messages.find(matches);
      if (existing !== undefined) return Promise.resolve(existing);
      if (ended) return Promise.reject(new Error(`Child already exited before ${label}: ${JSON.stringify(ended)}\n${stderr}`));
      let waiter;
      return bounded(new Promise((resolve, reject) => {
        waiter = { matches, label, resolve, reject }; waiters.add(waiter);
      }), label).finally(() => waiters.delete(waiter));
    };
    const command = async (command, options = {}) => {
      const id = crypto.randomUUID();
      const acknowledged = wait(message => message?.type === 'ack' && message.id === id, command);
      child.send({ command, id, ...options });
      return acknowledged;
    };
    const runtime = { child, root, messages, exited, wait, command, get stdout() { return stdout; }, get stderr() { return stderr; } };
    runtime.ready = async ({ background = true } = {}) => {
      await wait(message => message === 'ready', 'main ready');
      const listening = await wait(message => message?.type === 'listening', 'listening');
      runtime.origin = `http://127.0.0.1:${listening.port}`;
      if (background) {
        await wait(message => message?.type === 'background-done' && message.task === 'backup', 'initial backup');
        await wait(message => message?.type === 'background-done' && message.task === 'maintenance', 'initial maintenance');
        await wait(message => message?.type === 'background-done' && message.task === 'audit', 'initial audit');
      }
      return runtime;
    };
    runtime.request = (route, body, { method = body ? 'POST' : 'GET' } = {}) => {
      let request;
      const promise = new Promise((resolve) => {
        request = http.request(runtime.origin + route, { method, agent: false,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }, response => {
          let text = ''; response.setEncoding('utf8'); response.on('data', chunk => { text += chunk; });
          response.on('end', () => resolve({ status: response.statusCode, body: text ? JSON.parse(text) : null }));
          response.on('error', error => resolve({ error: error.code }));
        });
        request.on('error', error => resolve({ error: error.code }));
        request.end(body ? JSON.stringify(body) : undefined);
      });
      return { promise, abort: () => request.destroy() };
    };
    children.push(runtime);
    return runtime;
  }
  return { root, database, uploads, backups, db, start };
}

async function beginStop(runtime, signal = 'SIGTERM') {
  const closing = runtime.wait(message => message?.type === 'ingress-closed', 'stop ingress');
  assert.ok(runtime.child.kill(signal));
  await closing;
  const starts = runtime.messages.filter(message => message?.type === 'background-start').length;
  await runtime.command('tick');
  assert.equal(runtime.messages.filter(message => message?.type === 'background-start').length, starts, 'queued timer callbacks must not start work after stop');
  assert.equal(runtime.child.exitCode, null, 'held work must keep main alive');
  const rejected = await bounded(runtime.request('/api/auth/policy').promise, 'new request rejected');
  assert.ok(rejected.error || rejected.status === 503, 'stopping main must not accept new application work');
}
async function assertStopped(runtime, { timerCount = 5 } = {}) {
  assert.deepEqual(await bounded(runtime.exited, 'clean main exit'), { code: 0, signal: null });
  assert.match(runtime.stdout, /Service stopped/);
  assert.doesNotMatch(runtime.stdout + runtime.stderr, /shutdown_failed|API log failed/);
  const events = (await fs.readFile(path.join(runtime.root, 'events.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  assert.equal(events.filter(message => message?.type === 'disconnected').length, 1);
  const exit = events.find(message => message?.type === 'exit');
  // IPC may close during process.exit; synchronous fixture transcript is authoritative.
  assert.ok(exit);
  assert.deepEqual(exit.remainingTimers, []);
  const created = events.filter(message => message?.type === 'timer-created').map(message => message.id).sort();
  const cleared = events.filter(message => message?.type === 'timer-cleared').map(message => message.id).sort();
  assert.equal(created.length, timerCount);
  assert.deepEqual(cleared, created, 'every real background timer is cleared exactly once');
}

test('disconnected HTTP client does not release an unfinished write during shutdown', { timeout: 25000 }, async (t) => {
  const f = await fixture(t), runtime = await f.start().ready();
  await runtime.command('arm', { kind: 'transaction' });
  const request = runtime.request('/api/admin/export-records', { module: 'fixture', filename: 'disconnected.csv', rowCount: 1 });
  await runtime.wait(message => message?.type === 'gate' && message.kind === 'transaction', 'disconnected write barrier');
  request.abort();
  assert.ok((await request.promise).error);
  const queued = runtime.request('/api/admin/export-records', { module: 'fixture', filename: 'connected.csv', rowCount: 2 });
  await runtime.wait(message => message?.type === 'write-entered' && message.filename === 'connected.csv', 'connected queued write');
  await beginStop(runtime);
  await runtime.command('release');
  assert.equal((await queued.promise).status, 201);
  await assertStopped(runtime);
  assert.equal(await f.db.exportRecord.count({ where: { filename: 'disconnected.csv' } }), 1);
  assert.equal(await f.db.exportRecord.count({ where: { filename: 'connected.csv' } }), 1);
  assert.equal(await f.db.operationLog.count({ where: { action: 'EXPORT' } }), 2);
  assert.equal(await f.db.apiRequestLog.count({ where: { path: '/api/admin/export-records', status: 201 } }), 1, 'connected response-finish logging drains; disconnected response has no finish event');
  assert.equal((await verifyAuditIntegrity(f.db)).ok, true);
});

const hash = async file => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const bundleHashes = (file) => Promise.all([file, file + '.manifest.json', file + '.assets/fixture.txt'].map(hash));
async function assertNoBackupStaging(root) {
  const names = await fs.readdir(root);
  assert.deepEqual(names.filter(name => name.startsWith('.backup-') || name.endsWith('.lock')), []);
}

for (const fail of [false, true]) {
  test(`main drains a manual backup through ${fail ? 'copy failure cleanup' : 'successful publication'}`, { timeout: 25000 }, async (t) => {
    const f = await fixture(t), runtime = await f.start().ready();
    const before = (await fs.readdir(f.backups)).sort();
    await runtime.command('arm', { kind: 'backup' });
    const request = runtime.request('/api/admin/backups', confirmation);
    const gate = await runtime.wait(message => message?.type === 'gate' && message.kind === 'backup', 'manual backup copy');
    await fs.access(path.dirname(gate.destination));
    await beginStop(runtime);
    await runtime.command('release', { fail });
    assert.equal((await request.promise).status, fail ? 500 : 201);
    await assertStopped(runtime);
    const record = await f.db.backupRecord.findFirst({ where: { operator: 'shutdown_fixture' } });
    assert.equal(record.status, fail ? 'failed' : 'success');
    await assertNoBackupStaging(f.backups);
    if (fail) assert.deepEqual((await fs.readdir(f.backups)).sort(), before, 'failed copy must publish no partial bundle');
    else assert.equal((await verifyBackupBundle(path.join(f.backups, record.filename), { requireAssets: true })).audit.status, 'verified');
    assert.equal((await verifyAuditIntegrity(f.db)).ok, true);
    assert.equal(await f.db.notificationDelivery.count(), 0);
  });
}

for (const fail of [false, true]) {
  test(`main drains a restore drill through ${fail ? 'copy failure cleanup' : 'successful verification'} after client disconnect`, { timeout: 25000 }, async (t) => {
    const f = await fixture(t), runtime = await f.start().ready();
    const created = await runtime.request('/api/admin/backups', confirmation).promise;
    assert.equal(created.status, 201);
    const backup = created.body.data;
    const file = path.join(f.backups, backup.filename);
    const hashes = await bundleHashes(file);
    await runtime.command('arm', { kind: 'restore' });
    const request = runtime.request(`/api/admin/backups/${backup.id}/verify-restore`, confirmation);
    const gate = await runtime.wait(message => message?.type === 'gate' && message.kind === 'restore', 'restore copy');
    await fs.access(path.dirname(gate.destination));
    assert.equal((await f.db.backupRecord.findUnique({ where: { id: backup.id } })).verificationStatus, 'running');
    request.abort();
    assert.ok((await request.promise).error);
    await beginStop(runtime);
    await runtime.command('release', { fail });
    await assertStopped(runtime);
    const record = await f.db.backupRecord.findUnique({ where: { id: backup.id } });
    assert.equal(record.status, 'success');
    assert.equal(record.verificationStatus, fail ? 'failed' : 'verified');
    assert.equal(JSON.parse(record.verificationReport).status, fail ? 'failed' : 'verified');
    assert.deepEqual(await fs.readdir(path.join(f.backups, 'restore-checks')), []);
    assert.deepEqual(await bundleHashes(file), hashes, 'source bundle is unchanged after stopped drill');
    assert.equal((await verifyBackupBundle(file, { requireAssets: true })).audit.status, 'verified');
    assert.equal((await verifyAuditIntegrity(f.db)).ok, true);
  });
}

test('main waits for an in-flight scheduled backup after stopping future ticks', { timeout: 25000 }, async (t) => {
  const f = await fixture(t), runtime = await f.start({ SHUTDOWN_FIXTURE_GATE: 'backup' }).ready({ background: false });
  await runtime.wait(message => message?.type === 'gate' && message.kind === 'backup', 'scheduled backup copy');
  await beginStop(runtime);
  await runtime.command('release');
  await assertStopped(runtime);
  const records = await f.db.backupRecord.findMany();
  assert.equal(records.length, 1);
  assert.equal(records[0].operator, 'scheduled');
  assert.equal(records[0].status, 'success');
  assert.equal((await verifyBackupBundle(path.join(f.backups, records[0].filename), { requireAssets: true })).audit.status, 'verified');
  await assertNoBackupStaging(f.backups);
});

for (const corrupt of [false, true]) {
  test(`main drains an in-flight scheduled audit through ${corrupt ? 'integrity failure and persisted alert' : 'successful verification'} after SIGTERM`, { timeout: 25000 }, async (t) => {
    const f = await fixture(t);
    const runtime = await f.start({ SHUTDOWN_FIXTURE_GATE: 'scheduled-audit' }).ready({ background: false });
    const gate = await runtime.wait(message => message?.type === 'gate' && message.kind === 'scheduled-audit', 'periodic audit snapshot');
    assert.equal((await f.db.maintenanceRun.findFirst({ where: { task: 'scheduled-audit' } })).status, 'running');
    const snapshotDirectory = path.dirname(gate.destination);
    assert.ok(snapshotDirectory.startsWith(f.backups + path.sep));
    await fs.access(gate.destination);
    if (corrupt) {
      // Damage only this private copy. The verifier and failure path remain real.
      const snapshot = new PrismaClient({ datasourceUrl: `file:${gate.destination}` });
      try { await snapshot.operationLog.create({ data: { action: 'UPDATE', module: 'fixture', summary: 'unsigned synthetic snapshot' } }); }
      finally { await snapshot.$disconnect(); }
    }
    await beginStop(runtime);
    await runtime.command('release');
    await assertStopped(runtime);
    const records = await f.db.maintenanceRun.findMany({ where: { task: 'scheduled-audit' } });
    assert.equal(records.length, 1, 'queued ticks do not start a second audit');
    assert.equal(records[0].status, corrupt ? 'failed' : 'success');
    const alerts = await f.db.alertRecord.findMany({ where: { type: 'audit_integrity_failed' } });
    assert.equal(alerts.length, corrupt ? 1 : 0);
    if (corrupt) {
      assert.equal(alerts[0].level, 'critical');
      assert.match(records[0].details, /未自动重签/);
      assert.doesNotMatch(JSON.stringify([records, alerts]), /database\.db|\.audit-check-|unsigned synthetic snapshot/);
    }
    assert.equal(await f.db.notificationDelivery.count(), 0);
    assert.equal((await verifyAuditIntegrity(f.db)).ok, true, 'source remains valid and was not resealed');
    await assert.rejects(fs.access(snapshotDirectory), { code: 'ENOENT' });
    const done = runtime.messages.findIndex(message => message?.type === 'background-done' && message.task === 'audit');
    const disconnect = runtime.messages.findIndex(message => message?.type === 'disconnecting');
    assert.ok(done >= 0 && disconnect > done, 'audit result, alert and cleanup settle before disconnect');
  });
}

test('main reports an undrained deadline and exits nonzero instead of claiming a clean stop', { timeout: 20000 }, async (t) => {
  const f = await fixture(t), runtime = await f.start({ SHUTDOWN_TIMEOUT_MS: '250' }).ready();
  await runtime.command('arm', { kind: 'transaction' });
  const request = runtime.request('/api/admin/export-records', { module: 'fixture', filename: 'never-committed.csv', rowCount: 1 });
  await runtime.wait(message => message?.type === 'gate' && message.kind === 'transaction', 'deadline transaction barrier');
  assert.ok(runtime.child.kill('SIGTERM'));
  assert.deepEqual(await bounded(runtime.exited, 'forced deadline exit', 5000), { code: 1, signal: null });
  await request.promise;
  assert.match(runtime.stdout + runtime.stderr, /shutdown_failed/);
  assert.match(runtime.stdout + runtime.stderr, /SHUTDOWN_TIMEOUT/);
  assert.doesNotMatch(runtime.stdout, /Service stopped/);
  assert.equal(runtime.messages.some(message => message?.type === 'disconnected'), false);
  assert.equal(await f.db.exportRecord.count(), 0, 'uncommitted write must not survive forced process exit');
  assert.equal((await verifyAuditIntegrity(f.db)).ok, true);
});

test('actual main rejects an occupied port before initialization or background side effects', { timeout: 20000 }, async (t) => {
  const f = await fixture(t);
  const occupied = net.createServer();
  occupied.listen(0, '127.0.0.1');
  await new Promise(resolve => occupied.once('listening', resolve));
  t.after(() => new Promise(resolve => occupied.close(resolve)));
  const runtime = f.start({ PORT: String(occupied.address().port) });
  assert.deepEqual(await bounded(runtime.exited, 'bind failure'), { code: 1, signal: null });
  assert.match(runtime.stderr, /EADDRINUSE/);
  assert.equal(runtime.messages.some(message => ['initializing', 'background-start'].includes(message?.type)), false);
  assert.equal(await f.db.backupRecord.count(), 0);
  assert.equal(await f.db.maintenanceRun.count(), 0);
  assert.deepEqual(await fs.readdir(f.backups), []);
});

test('actual initialization integrity failure starts no periodic audit or other background producer', { timeout: 20000 }, async (t) => {
  const f = await fixture(t);
  await f.db.operationLog.create({ data: { action: 'UPDATE', module: 'fixture', summary: 'unsigned startup fixture' } });
  await f.db.$disconnect();
  const runtime = f.start();
  assert.deepEqual(await bounded(runtime.exited, 'audit initialization failure'), { code: 1, signal: null });
  assert.match(runtime.stderr, /AUDIT_INTEGRITY_FAILED/);
  assert.equal(runtime.messages.includes('ready'), false);
  assert.equal(runtime.messages.some(message => ['background-start', 'timer-created'].includes(message?.type)), false);
  assert.equal(await f.db.maintenanceRun.count(), 0);
  assert.equal(await f.db.alertRecord.count(), 0, 'startup failure exits without silently running alert producers');
  assert.equal(await f.db.backupRecord.count(), 0);
  assert.deepEqual(await fs.readdir(f.backups), []);
  assert.equal(await f.db.operationLog.count(), 1, 'damaged source is never automatically repaired');
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  test(`actual main drains an active and queued SQLite request before ${signal} exit`, { timeout: 25000 }, async (t) => {
    const f = await fixture(t), runtime = await f.start().ready();
    await runtime.command('arm', { kind: 'transaction' });
    const first = runtime.request('/api/admin/export-records', { module: 'fixture', filename: 'first.csv', rowCount: 1 });
    await runtime.wait(message => message?.type === 'gate' && message.kind === 'transaction', 'real transaction barrier');
    const second = runtime.request('/api/admin/export-records', { module: 'fixture', filename: 'second.csv', rowCount: 2 });
    await runtime.wait(message => message?.type === 'write-entered' && message.filename === 'second.csv', 'second accepted write');
    await beginStop(runtime, signal);
    await runtime.command('release');
    assert.equal((await first.promise).status, 201);
    assert.equal((await second.promise).status, 201);
    await assertStopped(runtime);
    assert.equal(await f.db.exportRecord.count(), 2);
    assert.equal(await f.db.operationLog.count({ where: { action: 'EXPORT' } }), 2);
    assert.equal(await f.db.apiRequestLog.count({ where: { path: '/api/admin/export-records', status: 201 } }), 2, 'response-finish work must persist before disconnect');
    assert.equal((await verifyAuditIntegrity(f.db)).ok, true);
  });
}

test('actual main stops during initialization without becoming ready or starting producers', { timeout: 20000 }, async (t) => {
  const f = await fixture(t), runtime = f.start({ SHUTDOWN_FIXTURE_GATE: 'initialization' });
  const listening = await runtime.wait(message => message?.type === 'listening', 'initial listener');
  runtime.origin = `http://127.0.0.1:${listening.port}`;
  await runtime.wait(message => message?.type === 'gate' && message.kind === 'initialization', 'initialization barrier');
  const starting = await runtime.request('/health').promise;
  assert.equal(starting.status, 503);
  assert.equal(starting.body.error.code, 'SERVICE_STARTING');
  await beginStop(runtime);
  await runtime.command('release');
  await assertStopped(runtime, { timerCount: 0 });
  assert.equal(runtime.messages.includes('ready'), false);
  assert.equal(runtime.messages.some(message => message?.type === 'background-start'), false);
  assert.equal(await f.db.backupRecord.count(), 0);
  assert.equal(await f.db.maintenanceRun.count(), 0);
  assert.deepEqual(await fs.readdir(f.backups), []);
  assert.equal((await verifyAuditIntegrity(f.db)).ok, true);
});
