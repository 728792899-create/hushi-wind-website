const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { initializeAuditIntegrity, appendOperationLog, verifyAuditIntegrity } = require('../lib/audit-integrity');
const { verifyBackupBundle } = require('../lib/database-backup');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hushi-backup-api-'));
const apiRoot = path.resolve(__dirname, '..');
const databaseFile = path.join(temp, 'test.db');
const uploads = path.join(temp, 'uploads');
const backupRoot = path.join(temp, 'backups');
Object.assign(process.env, {
  DATABASE_URL: `file:${databaseFile}`, NODE_ENV: 'test', HOST: '127.0.0.1',
  UPLOAD_DIR: uploads, DATABASE_BACKUP_DIR: backupRoot,
  ADMIN_USERNAME: 'backup_fixture_super', ADMIN_PASSWORD: 'BackupFixture9!',
  ADMIN_TOKEN_SECRET: crypto.randomBytes(32).toString('hex'),
  ADMIN_IP_ALLOWLIST: '127.0.0.1', TRUST_PROXY: 'false', ALERT_WEBHOOK_URL: '',
  API_RATE_LIMIT: '10000', PUBLIC_FORM_RATE_LIMIT: '1000',
});
let api, db, server, origin, product, inquiry;
const tokens = {};
const confirmation = { confirmation: '确认执行' };
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const call = async (route, { role = 'super_admin', method = 'GET', body } = {}) => {
  const response = await fetch(origin + route, {
    method, headers: { Authorization: `Bearer ${tokens[role]}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};
const verify = (id, options = {}) => call(`/api/admin/backups/${id}/verify-restore`, {
  method: 'POST', body: confirmation, ...options,
});
const sourceBusiness = async () => ({
  product: await db.product.findUnique({ where: { id: product.id } }),
  inquiry: await db.inquiry.findUnique({ where: { id: inquiry.id } }),
  asset: hash(path.join(uploads, 'fixture.txt')),
});
function bundleFiles(filename) {
  const file = path.join(backupRoot, filename);
  return [file, file + '.manifest.json', file + '.assets/fixture.txt'];
}
const bundleSnapshot = (filename) => bundleFiles(filename).map((file) => ({
  name: path.basename(file), exists: fs.existsSync(file), hash: fs.existsSync(file) ? hash(file) : null,
}));
async function createBackup() {
  const response = await call('/api/admin/backups', { method: 'POST', body: confirmation });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const row = response.body.data;
  assert.equal(row.status, 'success');
  assert.equal(row.verificationStatus, 'never');
  assert.equal(row.verifiedAt, null);
  return row;
}

before(async () => {
  fs.writeFileSync(databaseFile, '');
  fs.mkdirSync(uploads);
  fs.writeFileSync(path.join(uploads, 'fixture.txt'), 'original backup fixture asset');
  const migrated = spawnSync(process.execPath, [
    path.join(apiRoot, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy',
    '--schema', path.join(apiRoot, 'prisma/schema.prisma'),
  ], { cwd: apiRoot, env: process.env, encoding: 'utf8' });
  assert.equal(migrated.status, 0, migrated.stdout + migrated.stderr);
  api = require('../server');
  db = api.database;
  await initializeAuditIntegrity(db);
  for (const role of ['super_admin', 'readonly']) {
    const { salt, hash: passwordHash } = api.hashPassword('BackupFixture9!');
    const user = await db.adminUser.create({ data: {
      username: `backup_fixture_${role}`, role, passwordSalt: salt, passwordHash,
    } });
    tokens[role] = api.createAdminToken(user);
  }
  product = await db.product.create({ data: {
    title: '备份测试产品', slug: 'backup-fixture', type: 'piano', categoryName: '钢琴',
    description: '备份源正文', status: 'published', imageUrl: '/uploads/fixture.txt',
  } });
  inquiry = await db.inquiry.create({ data: {
    customerName: '备份测试客户', contactInfo: '13800008888', message: '原始咨询',
  } });
  await appendOperationLog(db, {
    operator: 'backup-fixture', action: 'BACKUP_FIXTURE', module: 'system', summary: '可验证审计记录',
  });
  server = api.app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await db?.$disconnect();
  fs.rmSync(temp, { recursive: true, force: true });
});

test('backup operations retain confirmation and role boundaries without changing verification state', async () => {
  const row = await createBackup();
  const before = await db.backupRecord.findUnique({ where: { id: row.id } });
  const files = bundleSnapshot(row.filename);
  assert.equal((await call('/api/admin/backups', { role: 'readonly' })).status, 200);
  assert.equal((await call('/api/admin/backups', { role: 'readonly', method: 'POST', body: confirmation })).status, 403);
  assert.equal((await verify(row.id, { role: 'readonly' })).status, 403);
  assert.equal((await verify(row.id, { body: {} })).status, 400);
  assert.equal((await call('/api/admin/backups', { method: 'POST', body: {} })).status, 400);
  assert.deepEqual(await db.backupRecord.findUnique({ where: { id: row.id } }), before);
  assert.deepEqual(bundleSnapshot(row.filename), files);
});

test('successful API restore drill persists structured counts, keeps creation status and preserves the source', async () => {
  const row = await createBackup();
  const business = await sourceBusiness();
  const files = bundleSnapshot(row.filename);
  const response = await verify(row.id);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const { report, backup } = response.body.data;
  assert.equal(report.status, 'verified');
  assert.equal(report.sourceUnchanged, true);
  assert.equal(report.cleanupVerified, true);
  assert.equal(report.audit.appendVerified, true);
  assert.ok(report.database.tableCount >= 32);
  assert.equal(report.assets.count, 1);
  assert.ok(report.audit.logCount >= 1);
  assert.ok(Number.isFinite(Date.parse(report.snapshotAt)));
  assert.equal(backup.status, 'success');
  assert.equal(backup.verificationStatus, 'verified');
  assert.deepEqual(backup.verificationReport, report);
  const stored = await db.backupRecord.findUnique({ where: { id: row.id } });
  assert.deepEqual(JSON.parse(stored.verificationReport), report);
  assert.equal(stored.verifiedAt.toISOString(), report.completedAt);
  const listed = await call('/api/admin/backups', { role: 'readonly' });
  assert.deepEqual(listed.body.data.find((item) => item.id === row.id).verificationReport, report);
  assert.deepEqual(await sourceBusiness(), business);
  assert.deepEqual(bundleSnapshot(row.filename), files);
  assert.equal(await db.operationLog.count({ where: { action: 'RESTORE_DRILL' } }), 0, 'fictional append stays in the isolated copy');
  assert.equal((await verifyAuditIntegrity(db)).ok, true);
});

for (const damage of ['asset', 'audit', 'missing']) {
  test(`a previous successful restore is replaced by a persisted failure for ${damage} damage`, async () => {
    const row = await createBackup();
    const passed = await verify(row.id);
    assert.equal(passed.status, 200, JSON.stringify(passed.body));
    const oldReport = passed.body.data.report;
    const file = path.join(backupRoot, row.filename);
    if (damage === 'asset') {
      fs.writeFileSync(file + '.assets/fixture.txt', 'PRIVATE_BROKEN_ASSET');
    } else if (damage === 'audit') {
      const copy = new PrismaClient({ datasourceUrl: `file:${file}` });
      try {
        const [trigger] = await copy.$queryRawUnsafe("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='OperationLog_no_update'");
        await copy.$executeRawUnsafe('DROP TRIGGER OperationLog_no_update');
        await copy.$executeRawUnsafe("UPDATE OperationLog SET summary='PRIVATE_BROKEN_AUDIT' WHERE action='BACKUP_FIXTURE'");
        await copy.$executeRawUnsafe(trigger.sql);
      } finally { await copy.$disconnect(); }
      const manifestFile = file + '.manifest.json';
      const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
      manifest.sha256 = hash(file);
      manifest.databaseBytes = fs.statSync(file).size;
      fs.writeFileSync(manifestFile, JSON.stringify(manifest));
      assert.equal(manifest.databaseBytes, row.size, 'the damaged audit must pass the API file-size guard');
      await assert.rejects(verifyBackupBundle(file, { requireCurrentSchema: false, requireAssets: true }), { code: 'AUDIT_INTEGRITY_FAILED' });
    } else {
      fs.unlinkSync(file);
    }
    const business = await sourceBusiness();
    const damagedSource = bundleSnapshot(row.filename);
    const failed = await verify(row.id);
    assert.equal(failed.status, 500, JSON.stringify(failed.body));
    assert.equal(failed.body.error.code, 'RESTORE_VERIFY_FAILED');
    const { backup, report } = failed.body.data;
    assert.equal(backup.status, 'success', 'creation status does not become the drill status');
    assert.equal(backup.verificationStatus, 'failed');
    assert.equal(report.status, 'failed');
    assert.notDeepEqual(report, oldReport);
    assert.ok(Date.parse(backup.verifiedAt) > Date.parse(passed.body.data.backup.verifiedAt));
    assert.equal(report.audit?.appendVerified, undefined, 'old successful evidence is not retained');
    const serialized = JSON.stringify(failed.body);
    assert.ok(!serialized.includes(temp));
    assert.ok(!serialized.includes('PRIVATE_BROKEN'));
    assert.ok(!serialized.includes(inquiry.contactInfo));
    const stored = await db.backupRecord.findUnique({ where: { id: row.id } });
    assert.equal(stored.verificationStatus, 'failed');
    assert.deepEqual(JSON.parse(stored.verificationReport), report);
    const listed = await call('/api/admin/backups', { role: 'readonly' });
    const listedRow = listed.body.data.find((item) => item.id === row.id);
    assert.equal(listedRow.verificationStatus, 'failed');
    assert.deepEqual(listedRow.verificationReport, report);
    assert.deepEqual(await sourceBusiness(), business);
    assert.deepEqual(bundleSnapshot(row.filename), damagedSource);
    assert.equal((await verifyAuditIntegrity(db)).ok, true);
  });
}
