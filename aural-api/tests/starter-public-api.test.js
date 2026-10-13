const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { publicSiteMode, starterPublicRequestAllowed } = require('../lib/public-site-mode');
const { initializeAuditIntegrity } = require('../lib/audit-integrity');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hushi-starter-'));
const apiRoot = path.resolve(__dirname, '..');
Object.assign(process.env, {
  DATABASE_URL: `file:${temp}/test.db`, HOST: '127.0.0.1', NODE_ENV: 'test',
  PUBLIC_SITE_MODE: 'starter', UPLOAD_DIR: `${temp}/uploads`,
  DATABASE_BACKUP_DIR: `${temp}/backups`, ADMIN_USERNAME: 'starter_admin',
  ADMIN_PASSWORD: 'StarterFixture9!', ADMIN_TOKEN_SECRET: crypto.randomBytes(32).toString('hex'),
  TRUST_PROXY: 'false', ADMIN_IP_ALLOWLIST: '127.0.0.1', ALERT_WEBHOOK_URL: '', API_RATE_LIMIT: '10000',
});
let api, db, server, lifecycle, origin, tokens = {}, article;
async function request(url, { role, method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(origin + url, {
    method, headers: { 'Content-Type': 'application/json', ...(role ? { Authorization: `Bearer ${tokens[role]}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}
before(async () => {
  const migration = spawnSync(process.execPath, [path.join(apiRoot, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', path.join(apiRoot, 'prisma/schema.prisma')], { cwd: apiRoot, env: process.env, encoding: 'utf8' });
  assert.equal(migration.status, 0, migration.stderr + migration.stdout);
  require('../scripts/load-env').loadEnvFile = () => {};
  api = require('../server'); db = api.database;
  await initializeAuditIntegrity(db);
  for (const role of ['super_admin', 'support']) {
    const { salt, hash } = api.hashPassword('StarterFixture9!');
    const user = await db.adminUser.create({ data: { username: `starter_${role}`, role, passwordSalt: salt, passwordHash: hash } });
    tokens[role] = api.createAdminToken(user);
  }
  await db.systemConfig.create({ data: { id: 1, aboutTitle: '管乐知识', aboutText: '通用介绍', heroImageUrl: '/uploads/original.svg', contactPhone: '13800001234', quoteAuthor: 'UNAPPROVED_AUTHOR' } });
  await db.product.create({ data: { title: 'UNAPPROVED_PRODUCT', slug: 'unapproved', type: 'piano', categoryName: '演示', description: '演示资料', status: 'published' } });
  await db.artist.create({ data: { name: 'UNAPPROVED_ARTIST', role: '演示人物', status: 'published' } });
  article = await db.article.create({ data: { title: '公开知识', description: '原创介绍', category: '管乐知识', date: '2026-10-13', status: 'published' } });
  await db.article.create({ data: { title: 'UNPUBLISHED_ARTICLE', category: '管乐知识', date: '2026-10-13', status: 'draft' } });
  const started = api.startServer({ port: 0, host: '127.0.0.1' });
  lifecycle = started.lifecycle;
  await started.ready;
  server = lifecycle.server;
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (lifecycle) await lifecycle.stop('test_complete');
  else await db?.$disconnect();
  fs.rmSync(temp, { recursive: true, force: true });
});
test('starter exposes only approved configuration fields and published articles', async () => {
  const config = await request('/api/config');
  assert.equal(config.status, 200);
  assert.deepEqual(Object.keys(config.body).sort(), ['aboutText', 'aboutTitle', 'heroImageUrl']);
  const list = await request('/api/articles');
  assert.equal(list.status, 200); assert.equal(list.body.data.length, 1);
  assert.equal((await request(`/api/articles/${article.id}`)).status, 200);
  for (const url of ['/api/articles?admin=1', '/api/articles?preview=1']) assert.equal((await request(url)).status, 401);
  assert.equal((await request('/api/articles/2')).status, 404);
});
test('published hidden sections and forged admin/preview hints stay inaccessible', async () => {
  for (const url of ['/api/products', '/api/products/unapproved', '/api/artists', '/api/catalog', '/api/brand-timelines', '/api/support-downloads', '/api/page-contents', '/api/audio-solutions', '/api/admin/resources', `/api/articles/${article.id}/versions`]) {
    for (const suffix of ['', '?admin=1', '?preview=1&previewToken=fake']) {
      const result = await request(url + suffix);
      assert.equal(result.status, 404, url + suffix);
      assert.doesNotMatch(JSON.stringify(result.body), /UNAPPROVED/);
      const invalid = await request(url + suffix, { headers: { Authorization: 'Bearer fake' } });
      assert.equal(invalid.status, 401, url + suffix);
      assert.doesNotMatch(JSON.stringify(invalid.body), /UNAPPROVED/);
    }
  }
});
test('starter refuses public submissions without creating business or analytics rows', async () => {
  const counts = async () => Promise.all([db.inquiry.count(), db.artistApplication.count(), db.analyticsEvent.count(), db.notificationDelivery.count()]);
  const before = await counts();
  for (const url of ['/api/inquiries', '/api/artist-applications', '/api/events']) {
    assert.equal((await request(url, { method: 'POST', body: { customerName: 'test', contactInfo: '13800001234', name: 'test', email: 'test@example.invalid', eventType: 'page_view' } })).status, 404);
  }
  assert.deepEqual(await counts(), before);
});
test('starter retains authentication boundary and real admin RBAC for editing', async () => {
  const session = await request('/api/auth/session');
  assert.equal(session.status, 401); assert.equal(session.body.success, false);
  assert.equal((await request('/api/auth/refresh', { method: 'POST', body: {} })).status, 401);
  const login = await request('/api/auth/login', { method: 'POST', body: { username: 'starter_admin', password: 'StarterFixture9!' } });
  assert.equal(login.status, 200);
  const adminConfig = await request('/api/config', { role: 'super_admin' });
  assert.equal(adminConfig.body.contactPhone, '13800001234');
  assert.equal((await request('/api/config', { role: 'support', method: 'PUT', body: { aboutTitle: 'denied' }, headers: { 'If-Match': String(adminConfig.body.revision) } })).status, 403);
  assert.equal((await request('/api/config', { role: 'super_admin', method: 'PUT', body: { aboutTitle: '后台已替换' }, headers: { 'If-Match': String(adminConfig.body.revision) } })).status, 200);
  assert.equal((await request('/api/config')).body.aboutTitle, '后台已替换');
  assert.equal((await request('/api/products?admin=1', { role: 'super_admin' })).status, 200);
});
test('starter preserves revoked session errors so the admin can clear its login', async () => {
  const login = await request('/api/auth/login', { method: 'POST', body: { username: 'starter_admin', password: 'StarterFixture9!' } });
  assert.equal(login.status, 200);
  const headers = { Authorization: `Bearer ${login.body.token}` };
  assert.equal((await request('/api/admin/resources', { headers })).status, 200);
  await db.adminUser.update({ where: { username: 'starter_admin' }, data: { tokenVersion: { increment: 1 } } });
  for (const options of [
    { url: '/api/admin/resources' },
    { url: '/api/products?admin=1' },
    { url: '/api/config', method: 'PUT', body: { aboutTitle: 'must not save' } },
    { url: '/api/auth/session' },
  ]) {
    const result = await request(options.url, { ...options, headers });
    assert.equal(result.status, 401, options.url);
    assert.equal(result.body.error.code, 'TOKEN_REVOKED');
  }
  assert.equal((await request('/api/config')).body.aboutTitle, '后台已替换');
});
test('mode parsing fails closed and anonymous route allowance is method-specific', () => {
  assert.equal(publicSiteMode(undefined), 'full');
  assert.equal(publicSiteMode('starter'), 'starter');
  for (const value of ['', 'Starter', 'preview', 'false']) assert.throws(() => publicSiteMode(value));
  for (const route of ['/articles/1/versions', '/auth/change-password', '/auth/2fa/setup', '/articles/%31', '/products']) assert.equal(starterPublicRequestAllowed('GET', route), false);
  assert.equal(starterPublicRequestAllowed('PUT', '/config'), false);
  assert.equal(starterPublicRequestAllowed('POST', '/articles'), false);
});
