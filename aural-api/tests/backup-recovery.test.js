const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { createDatabaseBackup, verifyBackupBundle, pruneBackups } = require('../lib/database-backup');
const { restoreBackupDrill } = require('../lib/restore-drill');
const { runMaintenance } = require('../lib/maintenance');
const { initializeAuditIntegrity, appendOperationLog, verifyAuditIntegrity } = require('../lib/audit-integrity');
const apiRoot = path.resolve(__dirname, '..');
const hash = async (file) => createHash('sha256').update(await fs.readFile(file)).digest('hex');
const readManifest = async (file) => JSON.parse(await fs.readFile(file + '.manifest.json', 'utf8'));
const writeManifest = (file, manifest) => fs.writeFile(file + '.manifest.json', JSON.stringify(manifest));

async function fixture(t, { legacy = false, unsealed = false, historicalAudit = false } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hushi-backup-recovery-'));
  const source = path.join(root, 'source.db'), uploads = path.join(root, 'uploads'), backups = path.join(root, 'backups');
  await fs.mkdir(uploads);
  await fs.mkdir(backups);
  await fs.writeFile(path.join(uploads, 'fixture.txt'), '虚构素材，不含客户数据');
  const migrations = path.join(apiRoot, 'prisma/migrations');
  const names = (await fs.readdir(migrations)).filter((name) => /^\d/.test(name)).sort();
  const sql = (await Promise.all(names.filter((name) => !legacy || name < '20261012170000_audit_integrity_and_inquiry_scope')
    .map(async (name) => (historicalAudit && name === '20261012170000_audit_integrity_and_inquiry_scope'
      ? `INSERT INTO "OperationLog" (action,module,summary,createdAt) VALUES ('FIXTURE','security','虚构旧历史基线',${Date.UTC(2000, 0, 1)});\n`
      : '') + await fs.readFile(path.join(migrations, name, 'migration.sql'), 'utf8')))).join('\n');
  const applied = spawnSync('sqlite3', [source], { input: sql, encoding: 'utf8' });
  assert.equal(applied.status, 0, applied.stderr);
  const db = new PrismaClient({ datasourceUrl: `file:${source}` });
  t.after(async () => { await db.$disconnect(); await fs.rm(root, { recursive: true, force: true }); });
  await db.product.create({ data: {
    title: '虚构恢复夹具', slug: 'restore-fixture', type: 'fixture', categoryName: 'fixture',
    description: '隔离测试', imageUrl: '/uploads/fixture.txt',
  } });
  if (!legacy && !unsealed) {
    await initializeAuditIntegrity(db);
    await appendOperationLog(db, { action: 'FIXTURE', module: 'security', summary: '虚构审计一' });
    await appendOperationLog(db, { action: 'FIXTURE', module: 'security', summary: '虚构审计二' });
  }
  const backup = path.join(backups, 'database.manual.fixture.db');
  return { root, source, db, uploads, backups, backup, options: { uploadsRoot: uploads, requireCurrentSchema: !legacy, requireAssets: true } };
}
async function rewriteChecksum(file) {
  const manifest = await readManifest(file);
  manifest.sha256 = await hash(file);
  manifest.databaseBytes = (await fs.stat(file)).size;
  await writeManifest(file, manifest);
}
async function corruptAudit(file) {
  const db = new PrismaClient({ datasourceUrl: `file:${file}` });
  try {
    const [{ sql }] = await db.$queryRawUnsafe("SELECT sql FROM sqlite_master WHERE name='OperationLog_no_update'");
    await db.$executeRawUnsafe('DROP TRIGGER OperationLog_no_update');
    await db.operationLog.update({ where: { id: 1 }, data: { summary: '篡改但结构仍有效' } });
    await db.$executeRawUnsafe(sql);
  } finally { await db.$disconnect(); }
}

test('new backups seal manifest checkpoints from the snapshot and preserve the live audit/source fields', async (t) => {
  const f = await fixture(t);
  const before = await verifyAuditIntegrity(f.db), original = await hash(f.source);
  const created = await createDatabaseBackup(f.source, f.backup, f.options);
  const checked = await verifyBackupBundle(f.backup, { requireAssets: true });
  assert.equal(created.audit.status, 'verified');
  assert.equal(checked.audit.headHash, before.headHash);
  assert.equal(checked.audit.entryCount, 2);
  assert.equal(checked.assetCount, 1);
  assert.equal(checked.tables.find((row) => row.name === 'OperationLog').count, 2);
  const manifest = await readManifest(f.backup);
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.databaseBytes, (await fs.stat(f.backup)).size);
  assert.equal(await hash(f.source), original);
  assert.deepEqual(await verifyAuditIntegrity(f.db), before);
});

test('audit corruption is rejected before publishing even though SQLite integrity and table shape still pass', async (t) => {
  const f = await fixture(t);
  await corruptAudit(f.source);
  await assert.rejects(createDatabaseBackup(f.source, f.backup, f.options), /digest mismatch/);
  assert.deepEqual(await fs.readdir(f.backups), [], 'no published or staged remnants');
});

test('unsealed and partial audit schemas cannot be reclassified or automatically sealed by backup', async (t) => {
  const f = await fixture(t, { unsealed: true });
  await assert.rejects(createDatabaseBackup(f.source, f.backup, f.options), /not sealed/);
  assert.equal((await f.db.auditIntegrityState.findUnique({ where: { id: 1 } })).baselineHash, null);
  await f.db.$executeRawUnsafe('DROP TABLE AuditLogEntry');
  await assert.rejects(createDatabaseBackup(f.source, f.backup, { ...f.options, requireCurrentSchema: false }), /Incomplete audit schema/);
  assert.deepEqual(await fs.readdir(f.backups), []);
});

test('a matching recomputed file checksum never bypasses audit verification or checkpoint matching', async (t) => {
  const f = await fixture(t);
  await createDatabaseBackup(f.source, f.backup, f.options);
  const wrongCheckpoint = await readManifest(f.backup);
  wrongCheckpoint.audit.headHash = '0'.repeat(64);
  await writeManifest(f.backup, wrongCheckpoint);
  await assert.rejects(verifyBackupBundle(f.backup), /checkpoint mismatch/);
  wrongCheckpoint.audit.headHash = (await verifyAuditIntegrity(f.db)).headHash;
  await writeManifest(f.backup, wrongCheckpoint);
  await corruptAudit(f.backup);
  await rewriteChecksum(f.backup);
  await assert.rejects(verifyBackupBundle(f.backup), /digest mismatch/);
});

test('legacy bundles are clearly identified, while older metadata with an existing good chain is readonly-verifiable', async (t) => {
  const old = await fixture(t, { legacy: true });
  await createDatabaseBackup(old.source, old.backup, old.options);
  const legacy = await verifyBackupBundle(old.backup, { requireCurrentSchema: false, requireAssets: true });
  assert.deepEqual(legacy.audit, { status: 'legacy', reason: 'missing-audit-schema' });
  await assert.rejects(restoreBackupDrill(old.backup, { scratchRoot: path.join(old.root, 'scratch') }), { code: 'RESTORE_DRILL_LEGACY_AUDIT' });
  const current = await fixture(t);
  await createDatabaseBackup(current.source, current.backup, current.options);
  const manifest = await readManifest(current.backup);
  delete manifest.audit;
  delete manifest.schemaVersion;
  delete manifest.databaseBytes;
  await writeManifest(current.backup, manifest);
  const original = await hash(current.backup);
  const checked = await verifyBackupBundle(current.backup);
  assert.equal(checked.audit.status, 'verified');
  assert.equal(checked.audit.metadata, 'legacy');
  assert.equal(await hash(current.backup), original);
});

test('complete recovery points require explicit assets while database-only library backups remain supported', async (t) => {
  const f = await fixture(t);
  await createDatabaseBackup(f.source, f.backup);
  assert.equal((await verifyBackupBundle(f.backup)).includesAssets, false);
  await assert.rejects(verifyBackupBundle(f.backup, { requireAssets: true }), /requires an asset/);
  await assert.rejects(restoreBackupDrill(f.backup, { scratchRoot: path.join(f.root, 'scratch') }), { code: 'RESTORE_DRILL_FAILED' });
});

test('manifest arrays, safe paths, uniqueness, file sizes and exact asset sets are enforced', async (t) => {
  const f = await fixture(t);
  await createDatabaseBackup(f.source, f.backup, f.options);
  const original = await readManifest(f.backup);
  for (const mutate of [
    (m) => { m.assets = {}; },
    (m) => { m.tables = {}; },
    (m) => { m.assets.push(m.assets[0]); },
    (m) => { m.assets[0].path = '../outside'; },
    (m) => { m.assets[0].path = '/absolute'; },
    (m) => { m.assets[0].path = 'folder\\fixture.txt'; },
    (m) => { m.assets[0].bytes++; },
    (m) => { m.databaseBytes++; },
    (m) => { m.tables[0].count++; },
    (m) => { m.assetOrigins = ['not-an-origin']; },
  ]) {
    const changed = structuredClone(original);
    mutate(changed);
    await writeManifest(f.backup, changed);
    await assert.rejects(verifyBackupBundle(f.backup, { requireAssets: true }));
  }
  await writeManifest(f.backup, original);
  await fs.writeFile(path.join(f.backup + '.assets', 'unexpected.txt'), 'extra');
  await assert.rejects(verifyBackupBundle(f.backup), /Asset set mismatch/);
  await fs.rm(path.join(f.backup + '.assets', 'unexpected.txt'));
  await fs.rm(path.join(f.backup + '.assets', 'fixture.txt'));
  await assert.rejects(verifyBackupBundle(f.backup), /Asset set mismatch/);
});

test('media-library-only references cannot be omitted from a backup or bypassed by rewriting its asset manifest', async (t) => {
  const f = await fixture(t);
  const filename = 'library-only.txt', url = '/uploads/' + filename;
  await f.db.mediaAsset.create({ data: {
    url, name: '虚构素材库独立文件', type: 'text/plain', bytes: 7, metadata: '{}',
  } });
  assert.equal(await f.db.product.count({ where: { imageUrl: url } }), 0);
  await assert.rejects(createDatabaseBackup(f.source, f.backup, f.options), /Backup references missing upload/);
  assert.deepEqual(await fs.readdir(f.backups), []);
  await fs.writeFile(path.join(f.uploads, filename), 'fixture');
  await createDatabaseBackup(f.source, f.backup, f.options);
  assert.equal((await verifyBackupBundle(f.backup, { requireAssets: true })).assetCount, 2);
  await fs.rm(path.join(f.backup + '.assets', filename));
  const manifest = await readManifest(f.backup);
  manifest.assets = manifest.assets.filter((asset) => asset.path !== filename);
  await writeManifest(f.backup, manifest);
  await assert.rejects(verifyBackupBundle(f.backup, { requireAssets: true }), /Backup references missing upload/);
  await assert.rejects(restoreBackupDrill(f.backup, { scratchRoot: path.join(f.root, 'scratch') }), /Backup references missing upload/);
});

test('symbolic-link files, directories and SQLite sidecars cannot masquerade as a standalone bundle', async (t) => {
  const f = await fixture(t);
  await createDatabaseBackup(f.source, f.backup, f.options);
  const linked = path.join(f.backups, 'linked.db');
  await fs.symlink(f.backup, linked);
  await assert.rejects(verifyBackupBundle(linked), /symbolic links/);
  const asset = path.join(f.backup + '.assets', 'fixture.txt');
  await fs.rm(asset);
  await fs.symlink(path.join(f.uploads, 'fixture.txt'), asset);
  await assert.rejects(verifyBackupBundle(f.backup), /Symbolic links/);
  await fs.rm(asset);
  await fs.copyFile(path.join(f.uploads, 'fixture.txt'), asset);
  await fs.rename(f.backup + '.assets', f.backup + '.actual-assets');
  await fs.symlink(f.backup + '.actual-assets', f.backup + '.assets', 'dir');
  await assert.rejects(verifyBackupBundle(f.backup), /symbolic link/);
  await fs.rm(f.backup + '.assets');
  await fs.rename(f.backup + '.actual-assets', f.backup + '.assets');
  await fs.writeFile(f.backup + '-wal', 'fixture sidecar');
  await assert.rejects(verifyBackupBundle(f.backup), /sidecar/);
});

test('local restore copies every artifact, continues the audit chain only in the copy, and cleans the unique workspace', async (t) => {
  const f = await fixture(t);
  await createDatabaseBackup(f.source, f.backup, f.options);
  // A standalone historical WAL database exercises temporary WAL/SHM creation
  // during copy verification/append, without supplying replayable source sidecars.
  const wal = spawnSync('sqlite3', [f.backup, 'PRAGMA journal_mode=WAL;'], { encoding: 'utf8' });
  assert.equal(wal.status, 0, wal.stderr);
  assert.equal(wal.stdout.trim(), 'wal');
  await rewriteChecksum(f.backup);
  const before = await verifyBackupBundle(f.backup, { requireAssets: true });
  const original = await hash(f.source), sourceBackupHash = await hash(f.backup);
  const scratch = path.join(f.root, 'scratch');
  await fs.mkdir(scratch);
  await fs.writeFile(path.join(scratch, 'keep.txt'), 'preexisting unrelated file');
  const report = await restoreBackupDrill(f.backup, { scratchRoot: scratch });
  assert.equal(report.status, 'verified');
  assert.equal(report.database.tableCount, before.tables.length);
  assert.equal(report.assets.count, 1);
  assert.equal(report.audit.entryCount, 2);
  assert.equal(report.audit.appendEntryCount, 3);
  assert.equal(report.audit.appendVerified, true);
  assert.equal(report.sourceUnchanged, true);
  assert.equal(report.cleanupVerified, true);
  assert.ok(report.durationMs >= 0);
  assert.deepEqual(await verifyBackupBundle(f.backup, { requireAssets: true }), before);
  assert.equal(await hash(f.source), original);
  assert.equal(await hash(f.backup), sourceBackupHash);
  for (const suffix of ['-wal', '-shm', '-journal']) await assert.rejects(fs.access(f.backup + suffix));
  assert.deepEqual(await fs.readdir(scratch), ['keep.txt']);
  assert.ok(!JSON.stringify(report).includes(f.root), 'report omits filesystem paths and record contents');
});

test('bundle verification drains every owned private reader before returning or opening the next reader', async (t) => {
  for (const reader of [1, 2, 4]) await t.test(`reader ${reader}`, async (subtest) => {
    const f = await fixture(subtest);
    await createDatabaseBackup(f.source, f.backup, f.options);
    const before = await hash(f.backup);
    const disconnect = PrismaClient.prototype.$disconnect;
    let closed = 0, timer, cleaned = false;
    subtest.mock.method(PrismaClient.prototype, '$disconnect', async function () {
      await disconnect.call(this);
      if (++closed !== reader) return;
      await fs.writeFile(f.backup + '-shm', 'owned reader closing');
      timer = setTimeout(() => { syncFs.unlinkSync(f.backup + '-shm'); cleaned = true; }, 100);
    });
    try {
      assert.equal((await verifyBackupBundle(f.backup, { requireAssets: true })).audit.status, 'verified');
      assert.equal(closed, 4, 'table, schema, audit and asset readers all closed');
      assert.equal(cleaned, true, 'last reader cleanup finishes before bundle succeeds');
      assert.equal(await hash(f.backup), before);
      await assert.rejects(fs.access(f.backup + '-shm'));
    } finally { clearTimeout(timer); await fs.rm(f.backup + '-shm', { force: true }); }
  });
});

test('private schema reader close still rejects persistent sidecars and same-content file replacement', async (t) => {
  for (const replacement of [false, true]) await t.test(replacement ? 'replacement' : 'persistent sidecar', async (subtest) => {
    const f = await fixture(subtest);
    await createDatabaseBackup(f.source, f.backup, f.options);
    const before = await hash(f.backup);
    const disconnect = PrismaClient.prototype.$disconnect;
    let closed = 0, timer;
    subtest.mock.method(PrismaClient.prototype, '$disconnect', async function () {
      await disconnect.call(this);
      if (++closed !== 2) return;
      await fs.writeFile(f.backup + '-shm', 'owned reader closing');
      if (replacement) timer = setTimeout(() => {
        syncFs.copyFileSync(f.backup, f.backup + '.swap');
        syncFs.renameSync(f.backup + '.swap', f.backup);
        syncFs.unlinkSync(f.backup + '-shm');
      }, 100);
    });
    try {
      await assert.rejects(verifyBackupBundle(f.backup), { code: 'AUDIT_INTEGRITY_FAILED' });
      if (!replacement) assert.equal(await fs.readFile(f.backup + '-shm', 'utf8'), 'owned reader closing');
      assert.equal(await hash(f.backup), before);
    } finally { clearTimeout(timer); await fs.rm(f.backup + '-shm', { force: true }); }
  });
});

test('restore drains its private copy writer before scanning the continued audit chain', async (t) => {
  const f = await fixture(t);
  await createDatabaseBackup(f.source, f.backup, f.options);
  const scratch = path.join(f.root, 'scratch'), before = await hash(f.backup);
  const disconnect = PrismaClient.prototype.$disconnect;
  let closed = 0, timer, injected = false;
  t.mock.method(PrismaClient.prototype, '$disconnect', async function () {
    await disconnect.call(this);
    // Four source readers, four copy readers, then the copy's audit writer.
    if (++closed !== 9) return;
    const [workspace] = await fs.readdir(scratch);
    const sidecar = path.join(scratch, workspace, 'database.db-shm');
    await fs.writeFile(sidecar, 'owned copy writer closing');
    injected = true;
    timer = setTimeout(() => { syncFs.unlinkSync(sidecar); }, 100);
  });
  try {
    const report = await restoreBackupDrill(f.backup, { scratchRoot: scratch });
    assert.equal(injected, true);
    assert.equal(report.audit.appendVerified, true);
    assert.equal(report.cleanupVerified, true);
    assert.equal(await hash(f.backup), before);
    assert.deepEqual(await fs.readdir(scratch), []);
  } finally { clearTimeout(timer); }
});

test('failed continuation cleans copied database, assets and sidecars without altering source', async (t) => {
  const f = await fixture(t);
  await f.db.$executeRawUnsafe("CREATE TRIGGER fixture_drill_append_failure BEFORE INSERT ON OperationLog WHEN NEW.action = 'RESTORE_DRILL' BEGIN SELECT RAISE(ABORT, 'fixture unavailable'); END");
  await createDatabaseBackup(f.source, f.backup, f.options);
  const before = await verifyBackupBundle(f.backup), sourceBackupHash = await hash(f.backup), scratch = path.join(f.root, 'scratch');
  await assert.rejects(restoreBackupDrill(f.backup, { scratchRoot: scratch }), { code: 'RESTORE_DRILL_FAILED' });
  assert.deepEqual(await fs.readdir(scratch), []);
  assert.deepEqual(await verifyBackupBundle(f.backup), before);
  assert.equal(await hash(f.backup), sourceBackupHash);
});

test('scratch paths inside source assets are rejected before creating or changing any source directories', async (t) => {
  const f = await fixture(t);
  await createDatabaseBackup(f.source, f.backup, f.options);
  const before = await verifyBackupBundle(f.backup);
  await assert.rejects(restoreBackupDrill(f.backup, { scratchRoot: path.join(f.backup + '.assets', 'new-dir') }), /outside the source asset/);
  assert.deepEqual(await fs.readdir(f.backup + '.assets'), ['fixture.txt']);
  assert.deepEqual(await verifyBackupBundle(f.backup), before);
});

test('retention keeps two genuine recovery points; corrupted audit with a recomputed checksum cannot replace one', async (t) => {
  const f = await fixture(t);
  const files = [];
  for (let n = 0; n < 3; n++) {
    const file = path.join(f.backups, `database.manual.${n}.db`);
    await createDatabaseBackup(f.source, file, f.options);
    const old = new Date(Date.now() - (40 - n) * 86400000);
    await fs.utimes(file, old, old);
    files.push(file);
  }
  await corruptAudit(files[2]);
  await rewriteChecksum(files[2]);
  const old = new Date(Date.now() - 35 * 86400000);
  await fs.utimes(files[2], old, old);
  await pruneBackups(f.backups, 14);
  for (const file of files.slice(0, 2)) assert.equal((await verifyBackupBundle(file)).audit.status, 'verified');
  await assert.rejects(fs.access(files[2]));
  await corruptAudit(files[1]);
  await rewriteChecksum(files[1]);
  await pruneBackups(f.backups, 14);
  await fs.access(files[0]);
  await fs.access(files[1]);
});

test('maintenance expires old login records but retains old audit history, baseline and chain without any rewrite', async (t) => {
  const f = await fixture(t, { historicalAudit: true });
  const createdAt = new Date('2000-01-01T00:00:00.000Z');
  await appendOperationLog(f.db, { action: 'FIXTURE_OLD', module: 'security', summary: '虚构旧链条记录', createdAt });
  await f.db.loginRecord.create({ data: { username: 'fixture-old-login', success: true, createdAt } });
  const before = {
    logs: await f.db.operationLog.findMany({ orderBy: { id: 'asc' } }),
    entries: await f.db.auditLogEntry.findMany({ orderBy: { sequence: 'asc' } }),
    state: await f.db.auditIntegrityState.findUnique({ where: { id: 1 } }),
    verified: await verifyAuditIntegrity(f.db),
  };
  assert.equal(before.verified.baselineCount, 1);
  assert.equal(before.logs[0].createdAt.toISOString(), createdAt.toISOString());
  assert.equal(before.logs.at(-1).createdAt.toISOString(), createdAt.toISOString());
  const result = await runMaintenance(f.db, f.backups);
  assert.equal(result.loginRecord, 1);
  assert.equal(await f.db.loginRecord.count(), 0);
  assert.deepEqual(await f.db.operationLog.findMany({ orderBy: { id: 'asc' } }), before.logs);
  assert.deepEqual(await f.db.auditLogEntry.findMany({ orderBy: { sequence: 'asc' } }), before.entries);
  assert.deepEqual(await f.db.auditIntegrityState.findUnique({ where: { id: 1 } }), before.state);
  assert.deepEqual(await verifyAuditIntegrity(f.db), before.verified);
  assert.equal((await f.db.maintenanceRun.findFirst()).status, 'success');
});

test('legacy bundles do not replace verified recovery points and follow the existing expiry once two points exist', async (t) => {
  const current = await fixture(t), legacy = await fixture(t, { legacy: true });
  const first = path.join(current.backups, 'database.manual.current-0.db');
  await createDatabaseBackup(current.source, first, current.options);
  const firstOld = new Date(Date.now() - 40 * 86400000);
  await fs.utimes(first, firstOld, firstOld);
  const legacyFile = path.join(current.backups, 'database.manual.legacy.db');
  await createDatabaseBackup(legacy.source, legacyFile, legacy.options);
  const old = new Date(Date.now() - 20 * 86400000);
  await fs.utimes(legacyFile, old, old);
  // One valid chain plus one newer legacy bundle is still below the minimum.
  await pruneBackups(current.backups, 14);
  assert.equal((await verifyBackupBundle(first)).audit.status, 'verified');
  assert.equal((await verifyBackupBundle(legacyFile, { requireCurrentSchema: false })).audit.status, 'legacy');
  const second = path.join(current.backups, 'database.manual.current-1.db');
  await createDatabaseBackup(current.source, second, current.options);
  const secondOld = new Date(Date.now() - 39 * 86400000);
  await fs.utimes(second, secondOld, secondOld);
  await pruneBackups(current.backups, 14);
  for (const file of [first, second]) assert.equal((await verifyBackupBundle(file)).audit.status, 'verified');
  await assert.rejects(fs.access(legacyFile));
});

test('restore CLI requires both explicit absolute paths, ignores ambient database env, and reports failure nonzero', async (t) => {
  const f = await fixture(t);
  await createDatabaseBackup(f.source, f.backup, f.options);
  const cli = path.join(apiRoot, 'scripts/restore-drill.js'), scratch = path.join(f.root, 'scratch');
  const run = (args) => spawnSync(process.execPath, [cli, ...args], {
    cwd: apiRoot, env: { ...process.env, DATABASE_URL: 'file:/must-never-use-ambient-database.db' }, encoding: 'utf8',
  });
  for (const args of [[], ['--backup', f.backup], ['--backup', 'relative.db', '--scratch-root', scratch]]) {
    const bad = run(args);
    assert.equal(bad.status, 1);
    assert.equal(JSON.parse(bad.stderr).error.code, 'RESTORE_DRILL_PATH_REQUIRED');
  }
  const good = run(['--backup', f.backup, '--scratch-root', scratch]);
  assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(good.stdout).audit.appendVerified, true);
  await fs.rm(path.join(f.backup + '.assets', 'fixture.txt'));
  const bad = run(['--backup', f.backup, '--scratch-root', scratch]);
  assert.equal(bad.status, 1);
  assert.equal(JSON.parse(bad.stderr).status, 'failed');
  assert.ok(!bad.stderr.includes(f.root));
});
