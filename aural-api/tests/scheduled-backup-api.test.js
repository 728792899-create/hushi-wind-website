const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { initializeAuditIntegrity, appendOperationLog, verifyAuditIntegrity } = require('../lib/audit-integrity');
const { verifyBackupBundle } = require('../lib/database-backup');

const apiRoot = path.resolve(__dirname, '..');
const fixtureRoot = path.resolve(apiRoot, '../logs/step7-20261013/scheduler-api-fixtures');
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
  ADMIN_USERNAME: 'scheduled_backup_fixture', ADMIN_PASSWORD: 'ScheduledFixture9!',
  ADMIN_TOKEN_SECRET: crypto.randomBytes(32).toString('hex'),
  ADMIN_IP_ALLOWLIST: '127.0.0.1', TRUST_PROXY: 'false',
  ALERT_WEBHOOK_URL: '', ALERT_EMAIL_TO: '', ALERT_COOLDOWN_MINUTES: '10',
  ALERT_DEDUPE_TYPES: 'backup_failed', API_RATE_LIMIT: '10000',
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
    username: 'scheduled_backup_fixture', role: 'super_admin', passwordSalt: salt, passwordHash,
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

test('production scheduler persists automatic failures, exposes the latest result, deduplicates alerts and recovers without sending notifications', async () => {
  const scheduler = api.createScheduledBackups();
  const first = await scheduler.run();
  const firstRecord = await db.backupRecord.findFirst({ where: { filename: first.filename } });
  assert.equal(firstRecord.status, 'success');
  const oldBundle = path.join(backupRoot, first.filename);
  const oldEvidence = await verifyBackupBundle(oldBundle, { requireAssets: true });
  const originalHashes = [oldBundle, oldBundle + '.manifest.json', oldBundle + '.assets/private-fixture-asset.txt'].map(hash);
  await db.backupRecord.update({ where: { id: firstRecord.id }, data: { createdAt: new Date('2000-01-01T00:00:00Z') } });
  fs.renameSync(asset, movedAsset);

  for (let attempt = 1; attempt <= 2; attempt++) {
    await assert.rejects(scheduler.run(), /missing upload/);
    const failures = await db.backupRecord.findMany({ where: { operator: 'scheduled', status: 'failed' }, orderBy: { id: 'desc' } });
    assert.equal(failures.length, attempt);
    assert.equal(failures[0].size, 0);
    assert.notEqual(failures[0].filename, first.filename);
    const listed = await call('/api/admin/backups');
    assert.equal(listed.status, 200, JSON.stringify(listed.body));
    assert.equal(listed.body.data[0].id, failures[0].id);
    assert.equal(listed.body.data[0].status, 'failed');
    const alerts = await call('/api/admin/alerts?type=backup_failed');
    assert.equal(alerts.status, 200, JSON.stringify(alerts.body));
    assert.equal(alerts.body.data.length, 1, 'repeated attempts reuse the existing alert cooldown');
    const alert = alerts.body.data[0];
    assert.equal(alert.level, 'critical');
    assert.equal(alert.type, 'backup_failed');
    assert.deepEqual(JSON.parse(alert.metadata), { path: 'scheduled-backup:backup', phase: 'backup' });
    const serialized = JSON.stringify({ failures, alerts: alerts.body.data });
    assert.ok(!serialized.includes(temp), 'failure evidence omits internal filesystem paths');
    assert.doesNotMatch(serialized, /private-fixture-asset|missing upload|password|credential/i);
    assert.equal(await db.maintenanceRun.count({ where: { task: 'scheduled-backup', status: 'failed' } }), attempt);
    assert.deepEqual(await verifyBackupBundle(oldBundle, { requireAssets: true }), oldEvidence);
    assert.deepEqual([oldBundle, oldBundle + '.manifest.json', oldBundle + '.assets/private-fixture-asset.txt'].map(hash), originalHashes);
  }

  fs.renameSync(movedAsset, asset);
  const recovered = await scheduler.run();
  assert.ok(recovered.filename);
  assert.notEqual(recovered.filename, first.filename);
  assert.equal((await verifyBackupBundle(path.join(backupRoot, recovered.filename), { requireAssets: true })).audit.status, 'verified');
  const final = await call('/api/admin/backups');
  assert.equal(final.status, 200);
  assert.equal(final.body.data[0].filename, recovered.filename);
  assert.equal(final.body.data[0].status, 'success');
  assert.equal(await db.backupRecord.count({ where: { status: 'failed' } }), 2, 'recovery preserves failure history');
  assert.equal(await db.alertRecord.count({ where: { type: 'backup_failed' } }), 1);
  assert.equal(await db.notificationDelivery.count(), 0);
  assert.equal(externalFetches, 0);
  assert.equal((await verifyAuditIntegrity(db)).ok, true);
  assert.deepEqual(await verifyBackupBundle(oldBundle, { requireAssets: true }), oldEvidence);
});
