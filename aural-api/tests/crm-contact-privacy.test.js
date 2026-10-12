const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { appendOperationLog } = require('../lib/audit-integrity');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hushi-crm-privacy-'));
const apiRoot = path.resolve(__dirname, '..');
Object.assign(process.env, {
  DATABASE_URL: `file:${temp}/test.db`,
  HOST: '127.0.0.1',
  NODE_ENV: 'test',
  UPLOAD_DIR: `${temp}/uploads`,
  DATABASE_BACKUP_DIR: `${temp}/backups`,
  ADMIN_USERNAME: 'privacy_admin',
  ADMIN_PASSWORD: 'PrivacySecure9!',
  ADMIN_TOKEN_SECRET: crypto.randomBytes(32).toString('hex'),
  ADMIN_IP_ALLOWLIST: '127.0.0.1',
  TRUST_PROXY: 'false',
  ALERT_WEBHOOK_URL: '',
  API_RATE_LIMIT: '10000',
  PUBLIC_FORM_RATE_LIMIT: '1000',
});

const PHONE = '13800001234';
let api, db, server, origin, inquiry, application;
const tokens = {};
const users = {};
const call = async (url, role, method = 'GET', { body, headers = {} } = {}) => {
  const res = await fetch(origin + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tokens[role]}`,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let responseBody;
  try { responseBody = JSON.parse(text); } catch { responseBody = text; }
  return { status: res.status, headers: res.headers, body: responseBody };
};
const viewLogs = () => db.operationLog.findMany({ where: { action: 'VIEW_CONTACT' }, orderBy: { id: 'asc' } });

before(async () => {
  fs.closeSync(fs.openSync(`${temp}/test.db`, 'a'));
  const result = spawnSync(
    process.execPath,
    [path.join(apiRoot, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', path.join(apiRoot, 'prisma/schema.prisma')],
    { cwd: apiRoot, env: process.env, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr + result.stdout);
  api = require('../server');
  db = api.database;
  for (const role of ['support', 'readonly', 'operations', 'super_admin']) {
    const { salt, hash } = api.hashPassword('PrivacySecure9!');
    const user = await db.adminUser.create({ data: { username: `privacy_${role}`, role, passwordSalt: salt, passwordHash: hash } });
    users[role] = user;
    tokens[role] = api.createAdminToken(user);
  }
  inquiry = await db.inquiry.create({
    data: { customerName: '王先生', contactInfo: PHONE, message: '想预约试奏', internalNote: '周五回电', assigneeId: users.support.id },
  });
  application = await db.artistApplication.create({
    data: { name: '李老师', email: 'artist@example.com', phone: '13900005678', portfolioUrl: 'https://example.com/works' },
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

test('inquiry and application lists hide contact details even for crm:private accounts', async () => {
  const inquiries = await call('/api/inquiries', 'support');
  assert.equal(inquiries.status, 200);
  const row = inquiries.body.data.find((item) => item.id === inquiry.id);
  assert.equal(row.contactInfo, '已隐藏');
  assert.equal(row.internalNote, '周五回电', 'private staff still see working notes');
  assert.ok(!JSON.stringify(inquiries.body).includes(PHONE));

  const readonly = await call('/api/inquiries', 'readonly');
  const hidden = readonly.body.data.find((item) => item.id === inquiry.id);
  assert.equal(hidden.contactInfo, '已隐藏');
  assert.equal(hidden.internalNote, '已隐藏');

  const apps = await call('/api/artist-applications', 'support');
  const app = apps.body.data.find((item) => item.id === application.id);
  assert.equal(app.email, '已隐藏');
  assert.equal(app.phone, '已隐藏');
  assert.equal(app.portfolioUrl, 'https://example.com/works');
});

test('updating an inquiry does not echo the contact back', async () => {
  const current = await db.inquiry.findUnique({ where: { id: inquiry.id } });
  const res = await call(`/api/inquiries/${inquiry.id}`, 'support', 'PUT', {
    body: { status: 'contacted' },
    headers: { 'If-Match': String(current.revision) },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.contactInfo, '已隐藏');
  assert.equal((await db.inquiry.findUnique({ where: { id: inquiry.id } })).contactInfo, PHONE, 'stored value is untouched');
});

test('crm:private accounts reveal one record at a time and every reveal is audited', async () => {
  const before = (await viewLogs()).length;
  const res = await call(`/api/inquiries/${inquiry.id}/contact`, 'support', 'POST');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data, { contactInfo: PHONE });
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const appRes = await call(`/api/artist-applications/${application.id}/contact`, 'support', 'POST');
  assert.deepEqual(appRes.body.data, { email: 'artist@example.com', phone: '13900005678' });

  const logs = await viewLogs();
  assert.equal(logs.length, before + 2);
  const [inquiryLog, appLog] = logs.slice(-2);
  assert.equal(inquiryLog.operator, 'privacy_support');
  assert.equal(inquiryLog.module, 'crm');
  assert.equal(inquiryLog.targetId, String(inquiry.id));
  assert.equal(inquiryLog.summary, '查看咨询联系方式');
  assert.equal(appLog.targetId, String(application.id));
  assert.ok(!JSON.stringify(logs).includes(PHONE), 'the audit record itself does not store the contact');
});

test('accounts without crm:private cannot reveal and leave no view record', async () => {
  const before = (await viewLogs()).length;
  const res = await call(`/api/inquiries/${inquiry.id}/contact`, 'readonly', 'POST');
  assert.equal(res.status, 403);
  assert.ok(!JSON.stringify(res.body).includes(PHONE));
  assert.equal((await viewLogs()).length, before);
  assert.equal((await call('/api/inquiries/999999/contact', 'support', 'POST')).status, 404);
});

test('if the audit record cannot be written the contact is not returned', async () => {
  await db.$executeRawUnsafe("CREATE TRIGGER fixture_privacy_audit_failure BEFORE INSERT ON OperationLog BEGIN SELECT RAISE(ABORT, 'audit store unavailable'); END");
  try {
    const res = await call(`/api/inquiries/${inquiry.id}/contact`, 'support', 'POST');
    assert.equal(res.status, 500);
    assert.ok(!JSON.stringify(res.body).includes(PHONE));
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER fixture_privacy_audit_failure');
  }
});

test('audit CSV applies the same CRM privacy boundary as the log list without changing role access', async () => {
  const action = 'PRIVACY_EXPORT_FIXTURE';
  const target = '审计隐私测试客户';
  for (const data of [
    { action, module: 'crm', target, summary: '客户跟进记录', beforeData: '{"private":"before"}', afterData: '{"private":"after"}' },
    { action, module: 'articles', target: '非客户内容名称', summary: '内容修改记录' },
  ]) await appendOperationLog(db, data);
  const query = `?action=${action}`;
  const headers = { 'x-sensitive-confirmation': encodeURIComponent('确认执行') };
  for (const role of ['readonly', 'operations', 'super_admin']) {
    const list = await call(`/api/admin/operation-logs${query}`, role);
    const exported = await call(`/api/admin/operation-logs/export${query}`, role, 'GET', { headers });
    assert.equal(list.status, 200);
    assert.equal(exported.status, 200);
    assert.match(exported.headers.get('content-type'), /text\/csv/);
    const crm = list.body.data.find((row) => row.module === 'crm');
    if (role === 'super_admin') {
      assert.equal(crm.target, target);
      assert.ok(exported.body.includes(target), 'private access retains the CRM target');
    } else {
      assert.equal(crm.target, '客户记录');
      assert.equal(crm.beforeData, null);
      assert.equal(crm.afterData, null);
      assert.ok(!exported.body.includes(target), `${role} CSV must hide the same CRM name as the list`);
      assert.ok(exported.body.includes('客户记录'));
    }
    assert.ok(exported.body.includes('非客户内容名称'), 'non-CRM targets remain unchanged');
  }
  assert.equal((await call(`/api/admin/operation-logs/export${query}`, 'support', 'GET', { headers })).status, 403);
  assert.equal((await call(`/api/admin/operation-logs/export${query}`, 'readonly')).status, 400, 'sensitive confirmation remains required');
});

test('restoring CRM records hides contact responses and preserves stored contacts for audited reveal', async () => {
  for (const role of ['support', 'super_admin']) {
    const records = [
      { model: 'inquiry', module: 'inquiry', route: 'inquiries', data: { customerName: `恢复客户-${role}`, contactInfo: '13800006789', message: '恢复测试', internalNote: '回访备注', assigneeId: users.support.id }, contacts: ['contactInfo'] },
      { model: 'artistApplication', module: 'artistApplication', route: 'artist-applications', data: { name: `恢复申请-${role}`, email: 'restore@example.invalid', phone: '13900006789', portfolioUrl: 'https://example.invalid/works' }, contacts: ['email', 'phone'] },
    ];
    for (const fixture of records) {
      const original = await db[fixture.model].create({ data: fixture.data });
      assert.equal((await call(`/api/${fixture.route}/${original.id}`, role, 'DELETE')).status, 200);
      const archived = await db.recycleEntry.findUnique({ where: { module_recordId: { module: fixture.module, recordId: original.id } } });
      const endpoint = `/api/admin/recycle-bin/${archived.id}/restore`;
      assert.equal((await call(endpoint, 'readonly', 'POST')).status, 403);
      const beforeViews = (await viewLogs()).length;
      const restored = await call(endpoint, role, 'POST');
      assert.equal(restored.status, 200, JSON.stringify(restored.body));
      assert.equal((await viewLogs()).length, beforeViews, 'restore does not reveal contact or record a contact view');
      const stored = await db[fixture.model].findUnique({ where: { id: original.id } });
      for (const field of Object.keys(fixture.data))
        assert.deepEqual(stored[field], original[field], `stored ${field} is unchanged`);
      for (const field of fixture.contacts) {
        assert.equal(restored.body.data[field], '已隐藏');
        assert.ok(!JSON.stringify(restored.body).includes(original[field]), `${field} must not bypass audited reveal`);
      }
      const revealed = await call(`/api/${fixture.route}/${original.id}/contact`, role, 'POST');
      assert.equal(revealed.status, 200);
      assert.deepEqual(revealed.body.data, Object.fromEntries(fixture.contacts.map((field) => [field, original[field]])));
      assert.equal((await viewLogs()).length, beforeViews + 1, 'explicit contact reveal remains audited');
    }
  }
});

test('restoring non-CRM content keeps the existing complete response', async () => {
  const article = await db.article.create({ data: { title: '普通内容恢复', category: '测试', date: '2026-10-12', status: 'draft' } });
  assert.equal((await call(`/api/articles/${article.id}`, 'super_admin', 'DELETE')).status, 200);
  const archived = await db.recycleEntry.findUnique({ where: { module_recordId: { module: 'article', recordId: article.id } } });
  const restored = await call(`/api/admin/recycle-bin/${archived.id}/restore`, 'super_admin', 'POST');
  assert.equal(restored.status, 200, JSON.stringify(restored.body));
  const stored = await db.article.findUnique({ where: { id: article.id } });
  assert.deepEqual(restored.body.data, JSON.parse(JSON.stringify(stored)));
  assert.equal(stored.title, article.title);
});
