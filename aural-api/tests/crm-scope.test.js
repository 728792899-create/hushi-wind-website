const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hushi-crm-scope-'));
const apiRoot = path.resolve(__dirname, '..');
Object.assign(process.env, {
  DATABASE_URL: `file:${temp}/test.db`, HOST: '127.0.0.1', NODE_ENV: 'test',
  UPLOAD_DIR: `${temp}/uploads`, DATABASE_BACKUP_DIR: `${temp}/backups`,
  ADMIN_USERNAME: 'scope_admin', ADMIN_PASSWORD: 'ScopeSecure9!',
  ADMIN_TOKEN_SECRET: crypto.randomBytes(32).toString('hex'),
  ADMIN_IP_ALLOWLIST: '127.0.0.1', TRUST_PROXY: 'false', ALERT_WEBHOOK_URL: '',
  API_RATE_LIMIT: '10000', PUBLIC_FORM_RATE_LIMIT: '1000',
  CONTACT_VIEW_ALERT_THRESHOLD: '30', CONTACT_VIEW_WINDOW_MS: '600000',
});
let api, db, server, origin, own, other, unassigned, application;
const users = {}, tokens = {};
const call = async (url, role = 'support', method = 'GET', body, headers = {}) => {
  const res = await fetch(origin + url, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens[role]}`, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
async function addUser(key, role = 'support') {
  const { salt, hash } = api.hashPassword('ScopeSecure9!');
  users[key] = await db.adminUser.create({ data: { username: `scope_${key}`, role, passwordSalt: salt, passwordHash: hash } });
  tokens[key] = api.createAdminToken(users[key]);
  return users[key];
}
const inquiry = (name, assigneeId = null) => db.inquiry.create({ data: {
  customerName: name, contactInfo: '13800001234', message: `需求-${name}`, assigneeId,
} });
before(async () => {
  fs.closeSync(fs.openSync(`${temp}/test.db`, 'a'));
  const migrated = spawnSync(process.execPath, [path.join(apiRoot, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', path.join(apiRoot, 'prisma/schema.prisma')], { cwd: apiRoot, env: process.env, encoding: 'utf8' });
  assert.equal(migrated.status, 0, migrated.stderr + migrated.stdout);
  api = require('../server'); db = api.database;
  for (const [key, role] of [['admin', 'super_admin'], ['support', 'support'], ['other', 'support'], ['readonly', 'readonly'], ['operations', 'operations']]) await addUser(key, role);
  own = await inquiry('本人客户', users.support.id);
  other = await inquiry('其他客服客户', users.other.id);
  unassigned = await inquiry('尚未分配');
  application = await db.artistApplication.create({ data: { name: '共享艺术家申请', email: 'artist@example.invalid', phone: '13900005678', portfolioUrl: 'https://example.invalid' } });
  for (const row of [own, other, unassigned]) await db.inquiryFollowUp.create({ data: { inquiryId: row.id, note: `记录-${row.customerName}`, status: 'new', operator: 'fixture' } });
  server = api.app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await db?.$disconnect(); fs.rmSync(temp, { recursive: true, force: true });
});

test('support lists and counts only assigned inquiries regardless of client filters', async () => {
  const ownList = await call('/api/inquiries');
  assert.equal(ownList.status, 200);
  assert.deepEqual(ownList.body.data.map(row => row.id), [own.id]);
  assert.equal(ownList.body.meta.pagination.total, 1);
  for (const suffix of [`?assigneeId=${users.other.id}`, '?keyword=尚未分配', '?keyword=其他客服']) {
    const res = await call('/api/inquiries' + suffix);
    assert.equal(res.body.meta.pagination.total, 0);
    assert.deepEqual(res.body.data, []);
  }
  for (const role of ['admin', 'readonly']) assert.equal((await call('/api/inquiries', role)).body.meta.pagination.total, 3);
  assert.equal((await call('/api/inquiries', 'operations')).status, 403);
  assert.equal((await call('/api/dashboard/stats')).body.unreadInquiries, 1);
  assert.equal((await call('/api/dashboard/stats', 'admin')).body.unreadInquiries, 3);
  assert.deepEqual((await call('/api/admin/crm/assignees')).body.data.map(row => row.id), [users.support.id]);
});

test('all inquiry ID paths reject another owner or unassigned records without mutations or reveal logs', async () => {
  const auditCount = await db.operationLog.count();
  for (const row of [other, unassigned]) {
    const snapshot = await db.inquiry.findUnique({ where: { id: row.id } });
    const attempts = [
      [`/api/inquiries/${row.id}/follow-ups`, 'GET'],
      [`/api/inquiries/${row.id}/contact`, 'POST'],
      [`/api/inquiries/${row.id}/read`, 'PUT'],
      [`/api/inquiries/${row.id}`, 'PUT', { status: 'contacted', assigneeId: users.support.id }],
      [`/api/inquiries/${row.id}`, 'DELETE'],
    ];
    for (const [url, method, body] of attempts) {
      const res = await call(url, 'support', method, body, { 'If-Match': String(snapshot.revision) });
      assert.equal(res.status, 404, `${method} ${url}: ${JSON.stringify(res.body)}`);
      assert.ok(!JSON.stringify(res.body).includes(snapshot.contactInfo));
    }
    assert.deepEqual(await db.inquiry.findUnique({ where: { id: row.id } }), snapshot);
  }
  assert.equal(await db.operationLog.count(), auditCount);
  assert.equal((await call(`/api/inquiries/${own.id}/follow-ups`)).body.data[0].note, '记录-本人客户');
  assert.equal((await call(`/api/inquiries/${own.id}/read`, 'support', 'PUT')).status, 200);
});

test('support can follow up but only super admin may change or clear the assignee; old sessions lose access immediately', async () => {
  const row = await inquiry('转派验证', users.support.id);
  for (const assigneeId of [null, users.other.id, users.admin.id]) {
    const res = await call(`/api/inquiries/${row.id}`, 'support', 'PUT', { assigneeId }, { 'If-Match': String(row.revision) });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'ASSIGNMENT_FORBIDDEN');
  }
  const saved = await call(`/api/inquiries/${row.id}`, 'support', 'PUT', { assigneeId: users.support.id, status: 'contacted', followUpNote: '本人跟进' }, { 'If-Match': String(row.revision) });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const moved = await call(`/api/inquiries/${row.id}`, 'admin', 'PUT', { assigneeId: users.other.id }, { 'If-Match': String(saved.body.data.revision) });
  assert.equal(moved.status, 200);
  assert.equal((await call(`/api/inquiries/${row.id}/contact`, 'support', 'POST')).status, 404);
  assert.equal((await call(`/api/inquiries/${row.id}/follow-ups`)).status, 404);
  assert.equal((await call(`/api/inquiries/${row.id}`, 'support', 'PUT', { status: 'done' }, { 'If-Match': String(moved.body.data.revision) })).status, 404);
  assert.equal((await call(`/api/inquiries/${row.id}/contact`, 'other', 'POST')).status, 200);
  const claimed = await call(`/api/inquiries/${unassigned.id}`, 'admin', 'PUT', { assigneeId: users.support.id }, { 'If-Match': String(unassigned.revision) });
  assert.equal(claimed.status, 200);
});

test('recycle pagination and direct restoration enforce the original assigned owner', async () => {
  const rows = [await inquiry('本人回收', users.support.id), await inquiry('他人回收', users.other.id), await inquiry('未分配回收')];
  for (const row of rows) assert.equal((await call(`/api/inquiries/${row.id}`, 'admin', 'DELETE')).status, 200);
  const recycled = await Promise.all(rows.map(row => db.recycleEntry.findUnique({ where: { module_recordId: { module: 'inquiry', recordId: row.id } } })));
  const list = await call('/api/admin/recycle-bin');
  assert.equal(list.body.meta.pagination.total, 1);
  assert.deepEqual(list.body.data.map(row => row.id), [recycled[0].id]);
  assert.equal((await call('/api/admin/recycle-bin?page=2')).body.data.length, 0);
  const count = await db.operationLog.count();
  for (const row of recycled.slice(1)) assert.equal((await call(`/api/admin/recycle-bin/${row.id}/restore`, 'support', 'POST')).status, 404);
  assert.equal(await db.operationLog.count(), count);
  assert.equal((await call(`/api/admin/recycle-bin/${recycled[0].id}/restore`, 'support', 'POST')).status, 200);
  assert.equal((await db.inquiry.findUnique({ where: { id: rows[0].id } })).assigneeId, users.support.id);
  assert.equal((await call(`/api/admin/recycle-bin/${recycled[2].id}/restore`, 'admin', 'POST')).status, 200);
});

test('artist applications remain shared and contact access still requires crm:private', async () => {
  for (const role of ['support', 'other']) {
    assert.equal((await call('/api/artist-applications', role)).body.data[0].id, application.id);
    assert.equal((await call(`/api/artist-applications/${application.id}/contact`, role, 'POST')).status, 200);
  }
  assert.equal((await call(`/api/artist-applications/${application.id}/contact`, 'readonly', 'POST')).status, 403);
});

test('contact alerts combine record types per account, never block, dedupe and survive new sessions', async () => {
  process.env.CONTACT_VIEW_ALERT_THRESHOLD = '3';
  const first = await addUser('monitor_one'), second = await addUser('monitor_two');
  const contact = await inquiry('查看告警测试', first.id);
  const reveal = role => call(`/api/artist-applications/${application.id}/contact`, role, 'POST');
  const countAlerts = () => db.alertRecord.count({ where: { type: 'contact_view_frequency' } });
  const baseline = await countAlerts();
  assert.equal((await call(`/api/inquiries/${contact.id}/contact`, 'monitor_one', 'POST')).status, 200);
  assert.equal((await reveal('monitor_one')).status, 200);
  assert.equal(await countAlerts(), baseline);
  tokens.monitor_one = api.createAdminToken(first); // a new session cannot reset counting
  for (let n = 0; n < 3; n++) assert.equal((await reveal('monitor_one')).status, 200);
  assert.equal(await countAlerts(), baseline + 1);
  assert.equal((await reveal('monitor_two')).status, 200);
  assert.equal(await countAlerts(), baseline + 1);
  const alerts = await db.alertRecord.findMany({ where: { type: 'contact_view_frequency' } });
  const latest = alerts.at(-1);
  assert.equal(JSON.parse(latest.metadata).adminUserId, first.id);
  assert.equal(JSON.parse(latest.metadata).count, 3);
  assert.doesNotMatch(JSON.stringify(latest), /13800001234|13900005678|artist@example/);
  // The same account on a separate API process still consults these persisted logs.
  assert.equal(await db.operationLog.count({ where: { adminUserId: first.id, action: 'VIEW_CONTACT' } }), 5);
  assert.equal(await db.operationLog.count({ where: { adminUserId: second.id, action: 'VIEW_CONTACT' } }), 1);
  const { monitorContactAccess } = require('../lib/contact-monitor');
  let emitted = 0;
  await monitorContactAccess(db, first, async () => { emitted++; }, new Date(Date.now() + 600001));
  assert.equal(emitted, 0, 'events older than the rolling window do not count');
  process.env.CONTACT_VIEW_ALERT_THRESHOLD = '30';
});

async function withContactMonitorSettings(action) {
  const keys = ['CONTACT_VIEW_ALERT_THRESHOLD', 'CONTACT_VIEW_WINDOW_MS'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { CONTACT_VIEW_ALERT_THRESHOLD: '3', CONTACT_VIEW_WINDOW_MS: '600000' });
  try {
    await action();
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}
const contactAlertsFor = user => db.alertRecord.findMany({
  where: { type: 'contact_view_frequency', title: `联系方式查看频繁（账号 ${user.id}）` },
});

test('concurrent contact reveals crossing the threshold all succeed and create one account alert', async () => {
  await withContactMonitorSettings(async () => {
    const user = await addUser('monitor_concurrent');
    const contact = await inquiry('并发查看测试', user.id);
    const reveal = () => call(`/api/inquiries/${contact.id}/contact`, 'monitor_concurrent', 'POST');
    for (let n = 0; n < 2; n++) assert.equal((await reveal()).status, 200);
    assert.equal((await contactAlertsFor(user)).length, 0);
    const results = await Promise.all(Array.from({ length: 6 }, reveal));
    assert.deepEqual(results.map(result => result.status), Array(6).fill(200), JSON.stringify(results));
    for (const result of results) assert.deepEqual(result.body.data, { contactInfo: contact.contactInfo });
    const alerts = await contactAlertsFor(user);
    assert.equal(alerts.length, 1, 'parallel requests must not duplicate the same account alert');
    assert.equal(JSON.parse(alerts[0].metadata).count, 3);
    assert.equal(await db.operationLog.count({ where: { adminUserId: user.id, action: 'VIEW_CONTACT' } }), 8);
    const { verifyAuditIntegrity } = require('../lib/audit-integrity');
    assert.equal((await verifyAuditIntegrity(db)).ok, true);
  });
});

test('two API instances sharing SQLite preserve successful concurrent contact access and a single alert', async () => {
  await withContactMonitorSettings(async () => {
    const modulePath = require.resolve('../server');
    const cachedModule = require.cache[modulePath];
    let secondApi, secondServer;
    try {
      delete require.cache[modulePath];
      secondApi = require('../server');
      assert.notEqual(secondApi.app, api.app);
      assert.notEqual(secondApi.database, db, 'the second API must use an independent Prisma instance');
      secondServer = secondApi.app.listen(0, '127.0.0.1');
      await new Promise(resolve => secondServer.once('listening', resolve));
      const secondOrigin = `http://127.0.0.1:${secondServer.address().port}`;
      const user = await addUser('monitor_two_instances');
      const contact = await inquiry('双实例查看测试', user.id);
      const reveal = async base => {
        const result = await fetch(`${base}/api/inquiries/${contact.id}/contact`, {
          method: 'POST', headers: { Authorization: `Bearer ${tokens.monitor_two_instances}` },
        });
        return { status: result.status, body: await result.json() };
      };
      for (const base of [origin, secondOrigin]) assert.equal((await reveal(base)).status, 200);
      assert.equal((await contactAlertsFor(user)).length, 0);
      const results = await Promise.all([origin, secondOrigin, origin, secondOrigin, origin, secondOrigin].map(reveal));
      assert.deepEqual(results.map(result => result.status), Array(6).fill(200), JSON.stringify(results));
      for (const result of results) assert.deepEqual(result.body.data, { contactInfo: contact.contactInfo });
      const alerts = await contactAlertsFor(user);
      assert.equal(alerts.length, 1);
      assert.equal(JSON.parse(alerts[0].metadata).count, 3);
      assert.equal(await db.operationLog.count({ where: { adminUserId: user.id, action: 'VIEW_CONTACT' } }), 8);
      const { verifyAuditIntegrity } = require('../lib/audit-integrity');
      assert.equal((await verifyAuditIntegrity(db)).ok, true);
      assert.equal((await verifyAuditIntegrity(secondApi.database)).ok, true);
    } finally {
      if (secondServer) await new Promise(resolve => secondServer.close(resolve));
      await secondApi?.database.$disconnect();
      if (cachedModule) require.cache[modulePath] = cachedModule;
      else delete require.cache[modulePath];
    }
  });
});

test('an alert insert failure does not roll back the contact audit chain or block the contact response', async () => {
  await withContactMonitorSettings(async () => {
    const user = await addUser('monitor_alert_failure');
    const contact = await inquiry('告警故障测试', user.id);
    const reveal = () => call(`/api/inquiries/${contact.id}/contact`, 'monitor_alert_failure', 'POST');
    for (let n = 0; n < 2; n++) assert.equal((await reveal()).status, 200);
    const { verifyAuditIntegrity } = require('../lib/audit-integrity');
    const before = await verifyAuditIntegrity(db);
    await db.$executeRawUnsafe("CREATE TRIGGER fixture_contact_alert_failure BEFORE INSERT ON AlertRecord WHEN NEW.type = 'contact_view_frequency' BEGIN SELECT RAISE(ABORT, 'fixture alert store unavailable'); END");
    try {
      const result = await reveal();
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.deepEqual(result.body.data, { contactInfo: contact.contactInfo });
      assert.equal((await contactAlertsFor(user)).length, 0);
      const views = await db.operationLog.findMany({ where: { adminUserId: user.id, action: 'VIEW_CONTACT' }, orderBy: { id: 'asc' } });
      assert.equal(views.length, 3);
      assert.ok(await db.auditLogEntry.findUnique({ where: { operationLogId: views.at(-1).id } }), 'the successful view has an integrity entry');
      const after = await verifyAuditIntegrity(db);
      assert.equal(after.ok, true);
      assert.equal(after.logCount, before.logCount + 1);
      assert.equal(after.entryCount, before.entryCount + 1);
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER fixture_contact_alert_failure');
    }
  });
});

test('super admins reaching the contact threshold are alerted without blocking their access', async () => {
  await withContactMonitorSettings(async () => {
    const user = await addUser('monitor_super', 'super_admin');
    const reveal = () => call(`/api/inquiries/${other.id}/contact`, 'monitor_super', 'POST');
    for (let n = 0; n < 2; n++) assert.equal((await reveal()).status, 200);
    assert.equal((await contactAlertsFor(user)).length, 0);
    for (let n = 0; n < 2; n++) {
      const result = await reveal();
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.deepEqual(result.body.data, { contactInfo: other.contactInfo });
    }
    const alerts = await contactAlertsFor(user);
    assert.equal(alerts.length, 1);
    assert.equal(JSON.parse(alerts[0].metadata).adminUserId, user.id);
    assert.equal(JSON.parse(alerts[0].metadata).count, 3);
    assert.equal(await db.operationLog.count({ where: { adminUserId: user.id, action: 'VIEW_CONTACT' } }), 4);
    const { verifyAuditIntegrity } = require('../lib/audit-integrity');
    assert.equal((await verifyAuditIntegrity(db)).ok, true);
  });
});
