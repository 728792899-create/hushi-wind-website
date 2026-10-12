const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

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
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => ({})) };
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
  for (const role of ['support', 'readonly']) {
    const { salt, hash } = api.hashPassword('PrivacySecure9!');
    const user = await db.adminUser.create({ data: { username: `privacy_${role}`, role, passwordSalt: salt, passwordHash: hash } });
    tokens[role] = api.createAdminToken(user);
  }
  inquiry = await db.inquiry.create({
    data: { customerName: '王先生', contactInfo: PHONE, message: '想预约试奏', internalNote: '周五回电' },
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
  const original = db.operationLog.create;
  db.operationLog.create = async () => {
    throw new Error('audit store unavailable');
  };
  try {
    const res = await call(`/api/inquiries/${inquiry.id}/contact`, 'support', 'POST');
    assert.equal(res.status, 500);
    assert.ok(!JSON.stringify(res.body).includes(PHONE));
  } finally {
    db.operationLog.create = original;
  }
});
