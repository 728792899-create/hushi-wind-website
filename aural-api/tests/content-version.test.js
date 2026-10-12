const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { updateWithVersion } = require('../lib/record-version');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hushi-content-version-'));
const apiRoot = path.resolve(__dirname, '..');
Object.assign(process.env, {
  DATABASE_URL: `file:${temp}/test.db`,
  HOST: '127.0.0.1',
  NODE_ENV: 'test',
  UPLOAD_DIR: `${temp}/uploads`,
  DATABASE_BACKUP_DIR: `${temp}/backups`,
  ADMIN_USERNAME: 'version_admin',
  ADMIN_PASSWORD: 'VersionSecure9!',
  ADMIN_TOKEN_SECRET: crypto.randomBytes(32).toString('hex'),
  ADMIN_IP_ALLOWLIST: '127.0.0.1',
  TRUST_PROXY: 'false',
  ALERT_WEBHOOK_URL: '',
  API_RATE_LIMIT: '10000',
  PUBLIC_FORM_RATE_LIMIT: '1000',
});

let api, db, server, origin, token;
const call = async (url, method = 'GET', body, headers = {}) => {
  const res = await fetch(origin + url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

// [route, prisma model, create body, field edited by both editors]
const resources = [
  ['articles', 'article', { title: '新闻', category: '品牌', date: '2026-10-12', status: 'draft' }, 'title'],
  ['artists', 'artist', { name: '演奏家', role: '小号', status: 'draft' }, 'name'],
  ['support-faqs', 'supportFaq', { question: '问题', category: 'test', answer: '解答', status: 'draft' }, 'question'],
  ['support-downloads', 'supportDownload', { name: '资料', type: 'PDF', size: '1 KB', fileUrl: '/uploads/inuse.pdf', status: 'draft' }, 'name'],
  ['audio-solutions', 'audioSolution', { title: '方案', en: 'Plan', desc: '说明', status: 'draft' }, 'title'],
  ['audio-stats', 'audioStat', { label: '指标', value: '1', desc: '说明', status: 'draft' }, 'label'],
  ['brand-timelines', 'brandTimeline', { year: '2026', title: '历史', desc: '介绍', status: 'draft' }, 'title'],
  ['ecosystem-services', 'ecosystemService', { icon: 'A', title: '入口', desc: '介绍', link: '/products', status: 'draft' }, 'title'],
  ['quick-guides', 'quickGuide', { title: '指南', duration: '3:00', category: 'piano', status: 'draft' }, 'title'],
  ['page-contents', 'pageContent', { slug: 'version-page', title: '页面', content: '正文', status: 'draft' }, 'title'],
];

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
  const { salt, hash } = api.hashPassword('VersionSecure9!');
  const admin = await db.adminUser.create({ data: { username: 'version_super', role: 'super_admin', passwordSalt: salt, passwordHash: hash } });
  token = api.createAdminToken(admin);
  await db.systemConfig.create({ data: { id: 1 } });
  server = api.app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await db?.$disconnect();
  fs.rmSync(temp, { recursive: true, force: true });
});

test('articles, artists and all CMS models reject stale or unversioned saves and keep the first edit', async () => {
  for (const [route, model, body, field] of resources) {
    const created = await call(`/api/${route}`, 'POST', body);
    assert.equal(created.status, 201, route + JSON.stringify(created.body));
    const id = created.body.id;
    const opened = await db[model].findUnique({ where: { id } });
    const url = `/api/${route}/${id}`;

    const first = await call(url, 'PUT', { ...body, [field]: '第一位编辑' }, { 'If-Match': String(opened.revision) });
    assert.equal(first.status, 200, route + JSON.stringify(first.body));
    assert.equal(first.body.revision, opened.revision + 1, `${route} response carries the new revision`);

    const stale = await call(url, 'PUT', { ...body, [field]: '过期表单' }, { 'If-Match': String(opened.revision) });
    assert.equal(stale.status, 409, route);
    assert.equal(stale.body.error.code, 'RECORD_CHANGED');
    const missing = await call(url, 'PUT', { ...body, [field]: '过期表单' });
    assert.equal(missing.status, 428, route);
    assert.equal((await db[model].findUnique({ where: { id } }))[field], '第一位编辑', `${route} keeps the first edit`);
  }
});

test('global config save is versioned too', async () => {
  const opened = await db.systemConfig.findUnique({ where: { id: 1 } });
  const first = await call('/api/config', 'PUT', { siteName: '胡氏管乐' }, { 'If-Match': String(opened.revision) });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const stale = await call('/api/config', 'PUT', { siteName: '旧表单' }, { 'If-Match': String(opened.revision) });
  assert.equal(stale.status, 409);
  assert.equal((await call('/api/config', 'PUT', { siteName: '旧表单' })).status, 428);
});

test('publishing a draft or restoring history invalidates forms opened before it', async () => {
  const created = await call('/api/articles', 'POST', { title: '原标题', category: '品牌', date: '2026-10-12', status: 'published' });
  const id = created.body.id;
  const opened = await db.article.findUnique({ where: { id } });

  const draftUrl = `/api/admin/content-drafts/article/${id}`;
  const draft = await call(draftUrl, 'PUT', { ...opened, title: '草稿标题' }, { 'If-Match': 'none' });
  assert.equal(draft.status, 200, JSON.stringify(draft.body));
  const published = await call(`${draftUrl}/publish`, 'POST', undefined, { 'If-Match': draft.body.data.version });
  assert.equal(published.status, 200, JSON.stringify(published.body));

  const staleAfterPublish = await call(`/api/articles/${id}`, 'PUT', { title: '发布前打开的表单' }, { 'If-Match': String(opened.revision) });
  assert.equal(staleAfterPublish.status, 409);
  assert.equal((await db.article.findUnique({ where: { id } })).title, '草稿标题');

  const reopened = await db.article.findUnique({ where: { id } });
  const version = await db.contentVersion.findFirst({ where: { module: 'article', recordId: id }, orderBy: { id: 'asc' } });
  assert.ok(version, 'publishing kept a history snapshot');
  const restored = await call(`/api/admin/content-history/article/${id}/${version.id}/restore`, 'POST');
  assert.equal(restored.status, 200, JSON.stringify(restored.body));
  const afterRestore = await db.article.findUnique({ where: { id } });
  assert.ok(afterRestore.revision > reopened.revision, 'restore bumps the revision even when the snapshot carries an older one');
  assert.equal((await call(`/api/articles/${id}`, 'PUT', { title: '恢复前打开的表单' }, { 'If-Match': String(reopened.revision) })).status, 409);
});

test('two simultaneous saves of the same version: exactly one wins, the other gets 409', async () => {
  const created = await call('/api/artists', 'POST', { name: '并发', role: '长笛', status: 'draft' });
  const { id } = created.body;
  const { revision } = await db.artist.findUnique({ where: { id } });
  const results = await Promise.all(
    ['甲', '乙'].map((name) => call(`/api/artists/${id}`, 'PUT', { name, role: '长笛' }, { 'If-Match': String(revision) })),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal((await db.artist.findUnique({ where: { id } })).revision, revision + 1);
});

test('a conditional update that matches nothing becomes a 409, other errors pass through', async () => {
  const missing = Object.assign(new Error('not found'), { code: 'P2025' });
  await assert.rejects(updateWithVersion({ update: async () => { throw missing; } }, { id: 1, revision: 0 }, {}), (error) => error.status === 409 && error.code === 'RECORD_CHANGED');
  const other = Object.assign(new Error('unique'), { code: 'P2002' });
  await assert.rejects(updateWithVersion({ update: async () => { throw other; } }, { id: 1 }, {}), (error) => error === other);
});
