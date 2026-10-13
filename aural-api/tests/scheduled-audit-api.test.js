const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { initializeAuditIntegrity, appendOperationLog, verifyAuditIntegrity } = require('../lib/audit-integrity');
const { verifyBackupBundle } = require('../lib/database-backup');

const apiRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.resolve(apiRoot, '../logs/step13-20261013/audit-api-fixtures');
fs.mkdirSync(fixtureRoot, { recursive: true });
const temp = fs.mkdtempSync(path.join(fixtureRoot, 'run-'));
const source = path.join(temp, 'source.db');
const uploads = path.join(temp, 'uploads');
const backupRoot = path.join(temp, 'backups');
const asset = path.join(uploads, 'private-fixture-asset.txt');
const movedAsset = path.join(temp, 'held-fixture-asset.txt');
const originalFetch = global.fetch;
let externalFetches = 0;
global.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    externalFetches++;
    throw new Error('External network is forbidden in this isolated test');
  }
  return originalFetch(input, options);
};
Object.assign(process.env, {
  DATABASE_URL: 'file:' + source, NODE_ENV: 'test', HOST: '127.0.0.1',
  UPLOAD_DIR: uploads, DATABASE_BACKUP_DIR: backupRoot,
  DEPLOY_WRITE_GATE_FILE: path.join(temp, 'unused-write-gate'),
  ADMIN_USERNAME: 'scheduled_audit_fixture', ADMIN_PASSWORD: 'ScheduledFixture9!',
  ADMIN_TOKEN_SECRET: crypto.randomBytes(32).toString('hex'),
  ADMIN_IP_ALLOWLIST: '127.0.0.1', TRUST_PROXY: 'false',
  ALERT_WEBHOOK_URL: '', ALERT_EMAIL_TO: '', ALERT_COOLDOWN_MINUTES: '10',
  ALERT_DEDUPE_TYPES: 'audit_integrity_failed', AUDIT_VERIFY_INTERVAL_MS: '1000', API_RATE_LIMIT: '10000',
});
let api, db, server, origin, token;
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const call = async (route) => {
  const response = await fetch(origin + route, { headers: { Authorization: 'Bearer ' + token } });
  return { status: response.status, body: await response.json() };
};

before(async () => {
  fs.mkdirSync(uploads);
  fs.writeFileSync(asset, 'synthetic scheduled-backup asset');
  const migrations = path.join(apiRoot, 'prisma/migrations');
  const sql = fs.readdirSync(migrations).filter((name) => /^\d/.test(name)).sort()
    .map((name) => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  const migrated = spawnSync('sqlite3', [source], { input: sql, encoding: 'utf8' });
  assert.equal(migrated.status, 0, migrated.stderr);
  api = require('../server');
  db = api.database;
  await initializeAuditIntegrity(db);
  const { salt, hash: passwordHash } = api.hashPassword('ScheduledFixture9!');
  const user = await db.adminUser.create({ data: {
    username: 'scheduled_audit_fixture', role: 'super_admin', passwordSalt: salt, passwordHash,
  } });
  token = api.createAdminToken(user);
  await db.product.create({ data: {
    title: '虚构自动备份产品', slug: 'scheduled-api-fixture', type: 'fixture', categoryName: 'fixture',
    description: '隔离 API 集成夹具', imageUrl: '/uploads/private-fixture-asset.txt',
  } });
  await appendOperationLog(db, { action: 'FIXTURE', module: 'security', summary: '虚构审计记录' });
  server = api.app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await db?.$disconnect();
  global.fetch = originalFetch;
  fs.rmSync(temp, { recursive: true, force: true });
});

test('periodic server checks persist pass/failure/recovery, deduplicate fixed alerts and never repair audit history', async () => {
  const scheduler = api.createScheduledAudit();
  await scheduler.run();
  const latest = () => db.maintenanceRun.findFirst({ where: { task: 'scheduled-audit' }, orderBy: { id: 'desc' } });
  assert.equal((await latest()).status, 'success');
  assert.equal((await scheduler.run()).skipped, true);
  const logs = await db.operationLog.findMany(), entries = await db.auditLogEntry.findMany(), state = await db.auditIntegrityState.findUnique({ where: { id: 1 } });
  const [{ sql }] = await db.$queryRawUnsafe("SELECT sql FROM sqlite_master WHERE name='OperationLog_no_update'");
  await db.$executeRawUnsafe('DROP TRIGGER OperationLog_no_update');
  try {
    for (let n = 0; n < 2; n++) {
      await db.maintenanceRun.update({ where: { id: (await latest()).id }, data: { createdAt: new Date('2000-01-01') } });
      await assert.rejects(scheduler.run(), { code: 'AUDIT_INTEGRITY_FAILED' });
      assert.equal((await latest()).status, 'failed');
    }
    const check = await call('/api/admin/audit-integrity');
    assert.equal(check.status, 409);
    const alerts = await call('/api/admin/alerts?type=audit_integrity_failed');
    assert.equal(alerts.status, 200);
    assert.equal(alerts.body.data.length, 1);
    assert.equal(alerts.body.data[0].title, '周期审计完整性核验失败');
    assert.ok(!JSON.stringify(alerts.body).includes(temp));
    assert.deepEqual(await db.operationLog.findMany(), logs);
    assert.deepEqual(await db.auditLogEntry.findMany(), entries);
    assert.deepEqual(await db.auditIntegrityState.findUnique({ where: { id: 1 } }), state);
    assert.equal(await db.notificationDelivery.count(), 0);
  } finally { await db.$executeRawUnsafe(sql); }
  await db.maintenanceRun.update({ where: { id: (await latest()).id }, data: { createdAt: new Date('2000-01-01') } });
  await scheduler.run();
  assert.equal((await latest()).status, 'success');
  const check = await call('/api/admin/audit-integrity');
  assert.equal(check.status, 200);
  assert.equal(check.body.data.logCount, logs.length);
  assert.ok(check.body.data.snapshotAt);
  assert.equal(fs.readdirSync(backupRoot).some(n => n.startsWith('.audit-check-')), false);
  assert.equal(externalFetches, 0);
});

test('backup API keeps exact JSON number sizes beyond signed 32 bit', async () => {
  const record = await db.backupRecord.create({ data: {
    filename: 'synthetic-metadata-only-no-bundle.db', size: 4294967296,
    status: 'failed', message: 'Metadata boundary fixture, not a real recovery point',
  } });
  const listed = await call('/api/admin/backups');
  assert.equal(listed.status, 200);
  assert.equal(listed.body.data.find(row => row.id === record.id).size, 4294967296);
});
