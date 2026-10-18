const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { initializeAuditIntegrity } = require('../lib/audit-integrity');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hushi-integration-'));
const apiRoot = path.resolve(__dirname, '..');
Object.assign(process.env, {
  DATABASE_URL: `file:${temp}/test.db`,
  HOST: '127.0.0.1',
  NODE_ENV: 'test',
  UPLOAD_DIR: `${temp}/uploads`,
  DATABASE_BACKUP_DIR: `${temp}/backups`,
  ADMIN_USERNAME: 'fixture_super',
  ADMIN_PASSWORD: 'FixtureSecure9!',
  ADMIN_TOKEN_SECRET: crypto.randomBytes(32).toString('hex'),
  ADMIN_IP_ALLOWLIST: '127.0.0.1',
  TRUST_PROXY: 'false',
  ALERT_WEBHOOK_URL: '',
  API_RATE_LIMIT: '10000',
  PUBLIC_FORM_RATE_LIMIT: '1000',
});
let db,
  server,
  origin,
  api,
  users = {},
  tokens = {};
const draftVersions = new Map();
const request = async (
  url,
  { role = 'super_admin', method = 'GET', body, headers = {} } = {},
) => {
  const h = { ...headers };
  // Plain PUTs in older tests read the current version first, as the admin forms do.
  const versionedTables = { products: 'product', inquiries: 'inquiry', articles: 'article', artists: 'artist', 'support-faqs': 'supportFaq', 'support-downloads': 'supportDownload', 'audio-solutions': 'audioSolution', 'audio-stats': 'audioStat', 'brand-timelines': 'brandTimeline', 'ecosystem-services': 'ecosystemService', 'quick-guides': 'quickGuide', 'page-contents': 'pageContent' };
  const record = url === '/api/config' ? ['', 'config', '1'] : url.match(/^\/api\/([a-z-]+)\/(\d+)$/);
  const table = record && (record[1] === 'config' ? 'systemConfig' : versionedTables[record[1]]);
  if (method === 'PUT' && table && h['If-Match'] === undefined && body?.updatedAt === undefined && body?.revision === undefined) {
    const row = await db[table].findUnique({ where: { id: Number(record[2]) } });
    if (row) h['If-Match'] = row.revision !== undefined ? String(row.revision) : row.updatedAt.toISOString();
  }
  const match = url.match(/^\/api\/admin\/(?:content-drafts|preview-ticket)\/([^/]+)\/(\d+)(?:\/publish)?$/);
  const draftKey = match && `${role}:${match[1]}:${match[2]}`;
  if (draftKey && method !== 'GET' && h['If-Match'] === undefined)
    h['If-Match'] = draftVersions.get(draftKey) || 'none';
  if (role) h.Authorization = `Bearer ${tokens[role]}`;
  if (body && !(body instanceof FormData))
    h['Content-Type'] = 'application/json';
  const response = await fetch(origin + url, {
    method,
    headers: h,
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (draftKey && response.ok) {
    if (data?.data?.version) draftVersions.set(draftKey, data.data.version);
    else if (method === 'DELETE' || url.endsWith('/publish') || (method === 'GET' && !data.data)) draftVersions.delete(draftKey);
  }
  return { status: response.status, data, headers: Object.fromEntries(response.headers) };
};
const product = (slug, extra = {}) => ({
  title: slug,
  slug,
  type: 'piano',
  categoryName: '钢琴',
  description: '产品资料',
  status: 'draft',
  ...extra,
});
before(async () => {
  fs.closeSync(fs.openSync(`${temp}/test.db`, 'a'));
  const result = spawnSync(
    process.execPath,
    [
      path.join(apiRoot, 'node_modules/prisma/build/index.js'),
      'migrate',
      'deploy',
      '--schema',
      path.join(apiRoot, 'prisma/schema.prisma'),
    ],
    { cwd: apiRoot, env: process.env, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr + result.stdout);
  api = require('../server');
  db = api.database;
  await db.$queryRawUnsafe('PRAGMA journal_mode=WAL');
  await db.$queryRawUnsafe('PRAGMA wal_autocheckpoint=0');
  await initializeAuditIntegrity(db);
  for (const role of [
    'super_admin',
    'operations',
    'support',
    'editor',
    'readonly',
  ]) {
    const { salt, hash } = api.hashPassword('FixtureSecure9!');
    users[role] = await db.adminUser.create({
      data: {
        username: role === 'super_admin' ? 'fixture_super' : `fixture_${role}`,
        role,
        passwordSalt: salt,
        passwordHash: hash,
      },
    });
    tokens[role] = api.createAdminToken(users[role]);
  }
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

test('role permissions cover direct upload, alerts, preview and private CRM/log exports', async () => {
  const article = await db.article.create({
    data: {
      title: 'private draft',
      category: '测试',
      date: '2026-09-13',
      status: 'draft',
    },
  });
  assert.equal(
    (await request(`/api/articles/${article.id}`, { role: 'support' })).status,
    403,
  );
  const page = await db.pageContent.create({
    data: {
      slug: 'private-policy',
      title: 'private',
      content: 'private body',
      status: 'draft',
    },
  });
  assert.equal(
    (
      await request(`/api/page-contents/${page.slug}?preview=1`, {
        role: 'support',
      })
    ).status,
    403,
  );
  for (const role of ['readonly', 'support']) {
    const form = new FormData();
    form.append(
      'file',
      new Blob(['%PDF-1.4\nfixture'], { type: 'application/pdf' }),
      'fixture.pdf',
    );
    assert.equal(
      (await request('/api/upload', { role, method: 'POST', body: form }))
        .status,
      403,
    );
  }
  const alert = await db.alertRecord.create({
    data: { type: 'fixture', title: 'alert' },
  });
  assert.equal(
    (
      await request(`/api/admin/alerts/${alert.id}/resolve`, {
        role: 'readonly',
        method: 'PUT',
        body: {},
      })
    ).status,
    403,
  );
  const row = await db.inquiry.create({
    data: {
      customerName: '客户测试',
      assigneeId: users.support.id,
      contactInfo: '010-12345678',
      message: 'test',
      internalNote: 'private-note',
    },
  });
  await request(`/api/inquiries/${row.id}`, {
    role: 'support',
    method: 'PUT',
    body: { internalNote: 'private-note-updated', status: 'contacted' },
  });
  await db.artistApplication.create({
    data: {
      name: '申请人',
      email: 'private@example.invalid',
      phone: '+86 138-1234-5678',
      portfolioUrl: 'https://example.invalid',
    },
  });
  for (const url of [
    '/api/inquiries',
    '/api/artist-applications',
    '/api/admin/operation-logs',
  ]) {
    const r = await request(url, { role: 'readonly' });
    assert.equal(r.status, 200);
    assert.doesNotMatch(
      JSON.stringify(r.data),
      /010-12345678|private-note|private@example.invalid|138-1234-5678/,
    );
  }
});
test('invalid status, IDs, types and private metadata fail closed', async () => {
  assert.equal(
    (
      await request('/api/products', {
        method: 'POST',
        body: product('invalid-status', { status: 'drafft' }),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/api/products', {
        method: 'POST',
        body: product('invalid-price', { price: '12oops' }),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/api/inquiries', {
        role: null,
        method: 'POST',
        body: {
          customerName: ['a', 'b'],
          contactInfo: '13812345678',
          message: 'test',
          formStartedAt: Date.now() - 5000,
        },
      })
    ).status,
    400,
  );
  const count = await db.alertRecord.count({ where: { status: 'new' } });
  assert.equal(
    (
      await request('/api/admin/alerts/resolve-batch', {
        method: 'PUT',
        body: { ids: ['invalid'] },
      })
    ).status,
    400,
  );
  assert.equal(await db.alertRecord.count({ where: { status: 'new' } }), count);
  assert.equal(
    (
      await request('/api/events', {
        role: null,
        method: 'POST',
        body: {
          eventType: 'page_view',
          metadata: {
            password: 'private-password',
            phone: '13812345678',
            durationMs: 40,
          },
        },
      })
    ).status,
    201,
  );
  const e = await db.analyticsEvent.findFirst({
    where: { eventType: 'page_view' },
    orderBy: { id: 'desc' },
  });
  assert.doesNotMatch(e.metadata, /password|phone/);
  assert.match(e.metadata, /durationMs/);
});
test('long snapshots restore and failed audit rolls business creation back', async () => {
  let r = await request('/api/products', {
    method: 'POST',
    body: product('long-version', { description: '长正文'.repeat(9000) }),
  });
  assert.equal(r.status, 201);
  const id = r.data.id,
    v = await db.contentVersion.findFirst({
      where: { module: 'product', recordId: id },
    });
  assert.ok(v.snapshot.length > 8000);
  r = await request(`/api/products/${id}/restore/${v.id}`, {
    method: 'POST',
    body: {},
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.description, '长正文'.repeat(9000));
  await db.$executeRawUnsafe(
    "CREATE TRIGGER fixture_fail_audit BEFORE INSERT ON OperationLog BEGIN SELECT RAISE(ABORT, 'fixture audit unavailable'); END",
  );
  try {
    r = await request('/api/products', {
      method: 'POST',
      body: product('audit-rollback'),
    });
    assert.ok(r.status >= 400);
    assert.equal(
      await db.product.count({ where: { slug: 'audit-rollback' } }),
      0,
    );
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER fixture_fail_audit');
  }
});
test('public retry is idempotent even when analytics fails', async () => {
  await db.$executeRawUnsafe(
    "CREATE TRIGGER fixture_fail_analytics BEFORE INSERT ON AnalyticsEvent BEGIN SELECT RAISE(ABORT, 'fixture analytics unavailable'); END",
  );
  try {
    const body = {
      customerName: '重试测试',
      contactInfo: '13812345678',
      message: '预约测试',
      formStartedAt: Date.now() - 5000,
      submissionId: crypto.randomUUID(),
    };
    const a = await request('/api/inquiries', {
        role: null,
        method: 'POST',
        body,
      }),
      b = await request('/api/inquiries', { role: null, method: 'POST', body });
    assert.equal(a.status, 201);
    assert.equal(b.status, 200);
    assert.equal(a.data.data.id, b.data.data.id);
    assert.equal(
      await db.inquiry.count({ where: { customerName: '重试测试' } }),
      1,
    );
    assert.equal(
      (
        await request('/api/inquiries', {
          role: null,
          method: 'POST',
          body: { ...body, message: 'different' },
        })
      ).status,
      409,
    );
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER fixture_fail_analytics');
  }
});
test('enabled TOTP is not exported and incorrect codes lock the account', async () => {
  const r = await request('/api/auth/2fa/setup', { method: 'POST', body: {} });
  assert.equal(r.status, 200);
  const code = api.totpCode(r.data.secret, Math.floor(Date.now() / 30000));
  const enabled = await request('/api/auth/2fa/enable', {
    method: 'POST',
    body: { code },
  });
  assert.equal(enabled.status, 200);
  tokens.super_admin = enabled.data.token;
  const setup = await request('/api/auth/2fa/setup', {
    method: 'POST',
    body: {},
  });
  assert.equal(setup.status, 409);
  assert.equal(setup.data.secret, undefined);
  for (let i = 0; i < 5; i++)
    await request('/api/auth/login', {
      role: null,
      method: 'POST',
      body: {
        username: 'fixture_super',
        password: 'FixtureSecure9!',
        totpCode: 'wrong',
      },
    });
  const u = await db.adminUser.findUnique({
    where: { id: users.super_admin.id },
  });
  assert.ok(u.failedLoginCount >= 5);
  assert.ok(u.lockedUntil);
  await db.adminUser.update({
    where: { id: u.id },
    data: { lockedUntil: null, failedLoginCount: 0 },
  });
});
test('resource aliases cannot remove a file referenced by OG content', async () => {
  fs.writeFileSync(`${temp}/uploads/inuse.pdf`, '%PDF-1.4\nfixture');
  await db.product.create({
    data: product('og-protection', { ogImageUrl: '/uploads/inuse.pdf' }),
  });
  for (const url of [
    '/uploads/inuse.pdf',
    '/uploads/./inuse.pdf',
    '/uploads/%69nuse.pdf',
  ]) {
    const r = await request('/api/admin/resources', {
      method: 'DELETE',
      body: { url, confirmation: '确认执行' },
    });
    assert.equal(r.status, 409, JSON.stringify(r));
  }
  assert.ok(fs.existsSync(`${temp}/uploads/inuse.pdf`));
});
test('concurrent demotions retain an active super administrator', async () => {
  const a = users.super_admin,
    { salt, hash } = api.hashPassword('FixtureSecure9!');
  const b = await db.adminUser.create({
    data: {
      username: 'fixture_second_super',
      role: 'super_admin',
      passwordSalt: salt,
      passwordHash: hash,
    },
  });
  tokens.second = api.createAdminToken(b);
  const results = await Promise.all([
    request(`/api/admin/users/${b.id}`, {
      method: 'PUT',
      body: { role: 'readonly' },
    }),
    request(`/api/admin/users/${a.id}`, {
      role: 'second',
      method: 'PUT',
      body: { role: 'readonly' },
    }),
  ]);
  assert.ok(results.some((r) => r.status !== 200));
  assert.ok(
    (await db.adminUser.count({
      where: { role: 'super_admin', status: 'active' },
    })) >= 1,
  );
  await db.adminUser.update({
    where: { id: a.id },
    data: { role: 'super_admin' },
  });
});
test('content drafts, preview, publish conflict and recycle preserve the published record', async () => {
  const created = await request('/api/products', {
    method: 'POST',
    body: product('workflow', { status: 'published' }),
  });
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal(
    (
      await request(`/api/admin/content-drafts/product/${id}`, {
        method: 'PUT',
        body: { title: '修改草稿' },
      })
    ).status,
    200,
  );
  assert.equal(
    (await db.product.findUnique({ where: { id } })).title,
    'workflow',
  );
  const ticket = await request(`/api/admin/preview-ticket/product/${id}`, {
    method: 'POST',
    body: {},
  });
  const preview = await request(
    `/api/products/by-key/workflow?previewToken=${ticket.data.token}`,
    { role: null },
  );
  assert.equal(preview.data.data.attributes.title, '修改草稿');
  assert.equal(
    (
      await request(`/api/admin/content-drafts/product/${id}/publish`, {
        method: 'POST',
        body: {},
      })
    ).status,
    200,
  );
  assert.equal(
    (await db.product.findUnique({ where: { id } })).title,
    '修改草稿',
  );
  await request(`/api/admin/content-drafts/product/${id}`, {
    method: 'PUT',
    body: { title: '冲突草稿' },
  });
  await db.product.update({ where: { id }, data: { title: '其他人更新' } });
  assert.equal(
    (
      await request(`/api/admin/content-drafts/product/${id}/publish`, {
        method: 'POST',
        body: {},
      })
    ).status,
    409,
  );
  assert.equal(
    (await request(`/api/products/${id}`, { method: 'DELETE' })).status,
    200,
  );
  const row = await db.recycleEntry.findUnique({
    where: { module_recordId: { module: 'product', recordId: id } },
  });
  assert.ok(row);
  assert.equal(
    (
      await request(`/api/admin/recycle-bin/${row.id}/restore`, {
        method: 'POST',
        body: {},
      })
    ).status,
    200,
  );
  assert.equal(
    (await db.product.findUnique({ where: { id } })).title,
    '其他人更新',
  );
});
test('all eight CMS models support validated CRUD, versions and recycle', async () => {
  const fixtures = [
    [
      'support-faqs',
      { question: '测试问题', category: 'test', answer: '解答' },
    ],
    [
      'support-downloads',
      {
        name: '资料',
        type: 'PDF',
        size: '1 KB',
        fileUrl: '/uploads/inuse.pdf',
      },
    ],
    ['audio-solutions', { title: '方案', en: 'SOLUTION', desc: '介绍' }],
    ['audio-stats', { label: '指标', value: '10', desc: '说明' }],
    ['brand-timelines', { year: '2026', title: '历史', desc: '介绍' }],
    [
      'ecosystem-services',
      { icon: 'A', title: '入口', desc: '介绍', link: '/products' },
    ],
    ['quick-guides', { title: '指南', duration: '3:00', category: 'piano' }],
    ['page-contents', { slug: 'fixture-page', title: '页面', content: '正文' }],
  ];
  for (const [route, body] of fixtures) {
    const created = await request(`/api/${route}`, {
      method: 'POST',
      body: { ...body, status: 'draft' },
    });
    assert.equal(created.status, 201, route + JSON.stringify(created));
    const id = created.data.id;
    assert.equal(
      (
        await request(`/api/${route}/${id}`, {
          method: 'PUT',
          body: { ...body, status: 'published' },
        })
      ).status,
      200,
      route,
    );
    const versions = await request(`/api/${route}/${id}/versions`);
    assert.ok(versions.data.data.length);
    assert.equal(
      (
        await request(
          `/api/${route}/${id}/restore/${versions.data.data[0].id}`,
          { method: 'POST', body: {} },
        )
      ).status,
      200,
      route,
    );
    assert.equal(
      (await request(`/api/${route}/${id}`, { method: 'DELETE' })).status,
      200,
      route,
    );
  }
});
test('consistent WAL backup validates every current model and rejects missing business tables', async () => {
  const {
    createDatabaseBackup,
    verifyDatabase,
  } = require('../lib/database-backup');
  const [journalMode] = await db.$queryRawUnsafe('PRAGMA journal_mode');
  assert.equal(journalMode.journal_mode, 'wal');
  await db.inquiry.create({
    data: {
      customerName: 'WAL客户',
      contactInfo: '13812345678',
      message: '刚提交',
    },
  });
  const destination = `${temp}/wal-backup.db`;
  const result = await createDatabaseBackup(`${temp}/test.db`, destination);
  assert.ok(result.tables.length >= 32);
  const { PrismaClient } = require('@prisma/client');
  const copy = new PrismaClient({ datasourceUrl: `file:${destination}` });
  try {
    assert.equal(
      await copy.inquiry.count({ where: { customerName: 'WAL客户' } }),
      1,
    );
    await copy.$executeRawUnsafe('DROP TABLE Inquiry');
  } finally {
    await copy.$disconnect();
  }
  await assert.rejects(verifyDatabase(destination), /Missing table: Inquiry/);
});

test('preview tickets are purpose-separated and private CRM is never previewable', async () => {
  const p = await db.product.create({ data: product('preview-boundary') });
  const r = await request(`/api/admin/preview-ticket/product/${p.id}`, {
    method: 'POST',
  });
  assert.equal(r.status, 200);
  tokens.preview = r.data.token;
  assert.equal(
    (await request('/api/auth/session', { role: 'preview' })).status,
    401,
  );
  assert.equal(
    (
      await request('/api/products', {
        role: 'preview',
        method: 'POST',
        body: product('must-not-write'),
      })
    ).status,
    401,
  );
  const c = await db.inquiry.create({
    data: {
      customerName: '隐私边界',
      contactInfo: 'private-contact',
      message: 'fixture',
      internalNote: 'private-note',
    },
  });
  for (const module of ['inquiry', 'artistApplication']) {
    assert.equal(
      (
        await request(`/api/admin/preview-ticket/${module}/${c.id}`, {
          role: 'readonly',
          method: 'POST',
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await request(`/api/admin/content-drafts/${module}/${c.id}`, {
          role: 'readonly',
        })
      ).status,
      404,
    );
  }
});
test('draft-only resources are protected and discarded conflicts can be restarted', async () => {
  fs.writeFileSync(`${temp}/uploads/draft-only.pdf`, '%PDF-1.4 fixture');
  const p = await db.product.create({ data: product('draft-only') });
  assert.equal(
    (
      await request(`/api/admin/content-drafts/product/${p.id}`, {
        method: 'PUT',
        body: { ogImageUrl: '/uploads/draft-only.pdf' },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request('/api/admin/resources', {
        method: 'DELETE',
        body: { url: '/uploads/draft-only.pdf', confirmation: '确认执行' },
      })
    ).status,
    409,
  );
  await db.product.update({
    where: { id: p.id },
    data: { title: 'external edit' },
  });
  assert.equal(
    (
      await request(`/api/admin/content-drafts/product/${p.id}/publish`, {
        method: 'POST',
      })
    ).status,
    409,
  );
  await request(`/api/admin/content-drafts/product/${p.id}`, {
    method: 'DELETE',
  });
  await request(`/api/admin/content-drafts/product/${p.id}`, {
    method: 'PUT',
    body: { title: 'reviewed latest' },
  });
  assert.equal(
    (
      await request(`/api/admin/content-drafts/product/${p.id}/publish`, {
        method: 'POST',
      })
    ).status,
    200,
  );
});
test('CRM follow-ups, assignees and artist conversion survive recycling', async () => {
  const p = await db.inquiry.create({
    data: {
      customerName: '跟进',
      contactInfo: '13812345678',
      message: 'fixture',
      isRead: true,
    },
  });
  const updated = await request(`/api/inquiries/${p.id}`, {
    method: 'PUT',
    body: {
      assigneeId: users.support.id,
      nextFollowUpAt: new Date(Date.now() - 60000).toISOString(),
      serialNumber: 'HW-TEST-001',
      status: 'contacted',
      followUpNote: '已安排试奏',
    },
  });
  assert.equal(updated.status, 200, JSON.stringify(updated));
  const timeline = await request(`/api/inquiries/${p.id}/follow-ups`, {
    role: 'support',
  });
  assert.equal(timeline.data.data[0].note, '已安排试奏');
  const due = await request('/api/inquiries?due=1');
  assert.ok(due.data.data.some((row) => row.id === p.id));
  const a = await db.artistApplication.create({
    data: {
      name: '合作申请',
      email: 'test@example.invalid',
      portfolioUrl: 'https://example.invalid',
      status: 'approved',
    },
  });
  const artist = await request(
    `/api/artist-applications/${a.id}/create-artist`,
    { method: 'POST' },
  );
  assert.equal(artist.status, 201);
  await request(`/api/artist-applications/${a.id}`, { method: 'DELETE' });
  const deleted = await db.recycleEntry.findUnique({
    where: { module_recordId: { module: 'artistApplication', recordId: a.id } },
  });
  assert.equal(
    (
      await request(`/api/admin/recycle-bin/${deleted.id}/restore`, {
        method: 'POST',
      })
    ).status,
    200,
  );
  assert.equal(
    (await db.artistApplication.findUnique({ where: { id: a.id } })).artistId,
    artist.data.data.id,
  );
  assert.equal(
    (
      await request(`/api/artist-applications/${a.id}/create-artist`, {
        method: 'POST',
      })
    ).data.data.id,
    artist.data.data.id,
  );
});
test('security changes roll back if audit cannot commit', async () => {
  const original = await db.adminUser.findUnique({
    where: { id: users.editor.id },
  });
  await db.$executeRawUnsafe(
    "CREATE TRIGGER fixture_security_audit BEFORE INSERT ON OperationLog BEGIN SELECT RAISE(ABORT,'unavailable'); END",
  );
  try {
    assert.ok(
      (
        await request('/api/auth/change-password', {
          role: 'editor',
          method: 'POST',
          body: {
            oldPassword: 'FixtureSecure9!',
            newPassword: 'ChangedFixture8!',
          },
        })
      ).status >= 400,
    );
  } finally {
    await db.$executeRawUnsafe('DROP TRIGGER fixture_security_audit');
  }
  const current = await db.adminUser.findUnique({ where: { id: original.id } });
  assert.equal(current.passwordHash, original.passwordHash);
  assert.equal(current.tokenVersion, original.tokenVersion);
});
test('catalog taxonomy edits and product support matching use complete identities', async () => {
  const edit = await request('/api/admin/catalog/categories', {
    method: 'POST',
    body: {
      editDefault: true,
      slug: 'piano',
      name: '键盘乐器',
      specTemplate: '["键数"]',
    },
  });
  assert.equal(edit.status, 200, JSON.stringify(edit));
  const series = await request('/api/admin/catalog/series', {
    method: 'POST',
    body: { name: 'Fixture Series', categorySlug: 'piano' },
  });
  assert.equal(series.status, 200);
  const p = await db.product.create({
    data: product('associated-product', {
      status: 'published',
      series: 'Fixture Series',
    }),
  });
  const row = await request('/api/support-downloads', {
    method: 'POST',
    body: {
      name: '专属说明书',
      size: '1 KB',
      type: 'Manual',
      fileUrl: '/uploads/inuse.pdf',
      status: 'published',
      productIds: JSON.stringify([p.id]),
      version: '1.0',
      language: 'zh-CN',
    },
  });
  assert.equal(row.status, 201, JSON.stringify(row));
  assert.ok(
    (
      await request(`/api/support-downloads?productId=${p.id}`, { role: null })
    ).data.data.some((x) => x.id === row.data.id),
  );
  assert.ok(
    !(
      await request(`/api/support-downloads?productId=${p.id + 10000}`, {
        role: null,
      })
    ).data.data.some((x) => x.id === row.data.id),
  );
  assert.equal(
    (await request(`/api/products/by-key/${p.slug}`, { role: null })).data.data
      .id,
    p.id,
  );
});
test('backup publication collision preserves one valid snapshot and negative retention is rejected', async () => {
  const {
    createDatabaseBackup,
    verifyDatabase,
    pruneBackups,
  } = require('../lib/database-backup');
  const destination = `${temp}/backups/collision.db`;
  const results = await Promise.allSettled([
    createDatabaseBackup(`${temp}/test.db`, destination),
    createDatabaseBackup(`${temp}/test.db`, destination),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  await verifyDatabase(destination);
  await assert.rejects(() => pruneBackups(`${temp}/backups`, -1));
  assert.ok(fs.existsSync(destination));
});
test('media metadata, server pagination and alternative text persist', async () => {
  const r = await request('/api/admin/resources/metadata', {
    method: 'PUT',
    body: {
      url: '/uploads/inuse.pdf',
      name: '乐器说明书',
      altText: '产品说明资料',
    },
  });
  assert.equal(r.status, 200, JSON.stringify(r));
  const list = await request(
    '/api/admin/resources?page=1&pageSize=1&search=' +
      encodeURIComponent('乐器说明书'),
  );
  assert.equal(list.status, 200);
  assert.equal(list.data.uploads.length, 1);
  assert.equal(list.data.uploads[0].altText, '产品说明资料');
});

test('resource replacement handles CDN, Markdown and OG references and preserves prior versions', async () => {
  const oldUrl='https://cdn.example.invalid/old.jpg', newUrl='https://cdn.example.invalid/new.jpg';
  const created=await request('/api/products',{method:'POST',body:product('cdn-replace',{imageUrl:oldUrl,ogImageUrl:oldUrl,description:`![乐器](${oldUrl})`})});
  assert.equal(created.status,201,JSON.stringify(created));
  const id=created.data.id;
  const changed=await request('/api/admin/resources/replace',{method:'POST',body:{oldUrl,newUrl,confirmation:'确认执行'}});
  assert.equal(changed.status,200,JSON.stringify(changed));
  const current=await db.product.findUnique({where:{id}});
  assert.equal(current.imageUrl,newUrl);assert.equal(current.ogImageUrl,newUrl);assert.equal(current.description,`![乐器](${newUrl})`);
  const versions=await db.contentVersion.findMany({where:{module:'product',recordId:id}});
  assert.ok(versions.some(v=>JSON.parse(v.snapshot).imageUrl===oldUrl));
});
test('failed resource audit restores the file and metadata, successful retry removes both',async()=>{
  const url='/uploads/delete-rollback.pdf',file=path.join(temp,'uploads/delete-rollback.pdf');
  fs.writeFileSync(file,'fixture file');
  const metadata=await request('/api/admin/resources/metadata',{method:'PUT',body:{url,name:'rollback test'}});assert.equal(metadata.status,200);
  await db.$executeRawUnsafe("CREATE TRIGGER fixture_file_audit BEFORE INSERT ON OperationLog BEGIN SELECT RAISE(ABORT,'fixture audit unavailable'); END");
  try {const failure=await request('/api/admin/resources',{method:'DELETE',body:{url,confirmation:'确认执行'}});assert.ok(failure.status>=400);assert.equal(fs.readFileSync(file,'utf8'),'fixture file');assert.ok(await db.mediaAsset.findUnique({where:{url}}));}
  finally {await db.$executeRawUnsafe('DROP TRIGGER fixture_file_audit');}
  const success=await request('/api/admin/resources',{method:'DELETE',body:{url,confirmation:'确认执行'}});assert.equal(success.status,200,JSON.stringify(success));assert.equal(fs.existsSync(file),false);assert.equal(await db.mediaAsset.findUnique({where:{url}}),null);
});

test('a cold inventory read during failed delete cannot retain the quarantined file state', async () => {
  const url = '/uploads/delete-cache-rollback.pdf', file = path.join(temp, 'uploads/delete-cache-rollback.pdf');
  fs.writeFileSync(file, '%PDF-1.4\nrollback cache fixture');
  assert.equal((await request('/api/admin/resources/metadata', { method: 'PUT', body: { url, name: 'rollback cache fixture' } })).status, 200);
  const query = '/api/admin/resources?compact=1&search=' + encodeURIComponent(url);
  assert.ok((await request(query)).data.uploads.some((asset) => asset.url === url));
  await db.$executeRawUnsafe("CREATE TRIGGER fixture_cache_audit BEFORE INSERT ON OperationLog BEGIN SELECT RAISE(ABORT,'fixture audit unavailable'); END");
  let markRollback, releaseRollback;
  const rollbackReached = new Promise((resolve) => { markRollback = resolve; });
  const rollbackGate = new Promise((resolve) => { releaseRollback = resolve; });
  const originalRename = fs.promises.rename;
  fs.promises.rename = async (from, to) => {
    if (String(from).includes(`${path.sep}.deleted${path.sep}`) && to === file) {
      markRollback();
      await rollbackGate;
    }
    return originalRename(from, to);
  };
  let deletion, timeout;
  try {
    deletion = request('/api/admin/resources', { method: 'DELETE', body: { url, confirmation: '确认执行' } });
    await Promise.race([rollbackReached, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('rollback gate was not reached')), 5000); })]);
    clearTimeout(timeout);
    const duringRollback = await request(query);
    assert.equal(duringRollback.status, 200);
    assert.equal(duringRollback.data.uploads.some((asset) => asset.url === url), false);
    releaseRollback();
    assert.ok((await deletion).status >= 400);
    const restored = await request(query);
    assert.equal(restored.status, 200);
    assert.ok(restored.data.uploads.some((asset) => asset.url === url));
    assert.match(restored.headers['server-timing'], /inventory_cache;desc="miss"/);
  } finally {
    clearTimeout(timeout);
    releaseRollback();
    if (deletion) await deletion;
    fs.promises.rename = originalRename;
    await db.$executeRawUnsafe('DROP TRIGGER fixture_cache_audit');
  }
});

test('retention removes expired logs and sent notifications, preserves business and pending work', async()=>{
  const old=new Date(Date.now()-400*86400000),recent=new Date();
  const expired=await db.loginRecord.create({data:{username:'retention-old',success:true,createdAt:old}});
  const fresh=await db.loginRecord.create({data:{username:'retention-recent',success:true,createdAt:recent}});
  const sent=await db.notificationDelivery.create({data:{type:'retention',payload:'{}',status:'sent',createdAt:old}});
  const pending=await db.notificationDelivery.create({data:{type:'retention',payload:'{}',status:'pending',createdAt:old}});
  const business=[await db.product.count(),await db.inquiry.count(),await db.contentVersion.count()];
  const root=path.join(temp,'retention-backups');fs.mkdirSync(root);
  const oldBackup=path.join(root,'database.manual.expired.db'),newBackup=path.join(root,'database.manual.recent.db');
  fs.writeFileSync(oldBackup,'fixture');fs.utimesSync(oldBackup,old,old);fs.writeFileSync(newBackup,'fixture');
  const {runMaintenance}=require('../lib/maintenance');await runMaintenance(db,root);
  assert.equal(await db.loginRecord.findUnique({where:{id:expired.id}}),null);assert.ok(await db.loginRecord.findUnique({where:{id:fresh.id}}));
  assert.equal(await db.notificationDelivery.findUnique({where:{id:sent.id}}),null);assert.ok(await db.notificationDelivery.findUnique({where:{id:pending.id}}));
  assert.deepEqual([await db.product.count(),await db.inquiry.count(),await db.contentVersion.count()],business);
  assert.equal(fs.existsSync(oldBackup),true);assert.equal(fs.existsSync(newBackup),true);
  assert.deepEqual(await runMaintenance(db,root),{skipped:true});
});

test('media naming follows content changes, manual overrides and automatic reset without changing URLs',async()=>{
 const form=new FormData();form.append('file',new Blob(['%PDF-1.4\nmedia fixture'],{type:'application/pdf'}),'media-naming.pdf');
 const upload=await request('/api/upload',{method:'POST',body:form});assert.equal(upload.status,200,JSON.stringify(upload));const url=upload.data.url;
 const created=await request('/api/products',{method:'POST',body:product('media-naming',{title:'命名测试钢琴',imageUrl:url})});assert.equal(created.status,201,JSON.stringify(created));const id=created.data.id;
 const getAsset=async()=>{const result=await request('/api/admin/resources?page=1&pageSize=100&search='+encodeURIComponent(url));assert.equal(result.status,200);return result.data.uploads.find(r=>r.url===url)};
 let asset=await getAsset();assert.equal(asset.name,'命名测试钢琴 · 产品主图');assert.equal(asset.category,'product');assert.equal(asset.referenceCount,1);
 assert.equal((await request('/api/admin/resources/metadata',{method:'PUT',body:{url,nameMode:'manual',name:'精选钢琴主图',category:'brand',altText:'测试说明'}})).status,200);
 assert.equal((await request(`/api/products/${id}`,{method:'PUT',body:{title:'更名后的钢琴'}})).status,200);
 asset=await getAsset();assert.equal(asset.name,'精选钢琴主图');assert.equal(asset.autoName,'更名后的钢琴 · 产品主图');assert.equal(asset.category,'brand');assert.equal(asset.altText,'测试说明');
 assert.equal((await request('/api/admin/resources/metadata',{method:'PUT',body:{url,nameMode:'auto',category:'auto'}})).status,200);
 asset=await getAsset();assert.equal(asset.name,'更名后的钢琴 · 产品主图');assert.equal(asset.category,'product');assert.equal(asset.url,url);assert.equal(asset.altText,'测试说明');
 const search=await request('/api/admin/resources?page=1&category=product&search='+encodeURIComponent('更名后的钢琴'));assert.ok(search.data.uploads.some(a=>a.url===url));
});
test('bulk categories validate all files, preserve metadata and require write permission',async()=>{
 const url='/uploads/inuse.pdf';const prior=await db.mediaAsset.findUnique({where:{url}});
 assert.equal((await request('/api/admin/resources/categories',{role:'readonly',method:'PUT',body:{urls:[url],category:'support'}})).status,403);
 assert.equal((await request('/api/admin/resources/categories',{method:'PUT',body:{urls:[url,'/uploads/nonexistent.pdf'],category:'support'}})).status,404);
 assert.deepEqual(await db.mediaAsset.findUnique({where:{url}}),prior);
 assert.equal((await request('/api/admin/resources/categories',{method:'PUT',body:{urls:[url,url],category:'support'}})).status,400);
 assert.equal((await request('/api/admin/resources/categories',{method:'PUT',body:{urls:[url],category:'unknown'}})).status,400);
 assert.equal((await request('/api/admin/resources/categories',{method:'PUT',body:{urls:[url],category:'support'}})).status,200);
 const updated=await db.mediaAsset.findUnique({where:{url}});assert.equal(updated.name,prior.name);assert.equal(updated.altText,prior.altText);assert.equal(JSON.parse(updated.metadata).category,'support');
 const result=await request('/api/admin/resources?page=1&category=support&kind=document');assert.ok(result.data.uploads.some(a=>a.url===url));assert.ok(result.data.categories.find(c=>c.value==='support').count>=1);
});
test('upload category is persisted and invalid category leaves no file or metadata',async()=>{
 const beforeFiles=fs.readdirSync(`${temp}/uploads`).sort(),beforeRows=await db.mediaAsset.count();
 const form=new FormData();form.append('category','missing');form.append('file',new Blob(['%PDF-1.4\nfixture'],{type:'application/pdf'}),'invalid-category.pdf');
 assert.equal((await request('/api/upload',{method:'POST',body:form})).status,400);assert.deepEqual(fs.readdirSync(`${temp}/uploads`).sort(),beforeFiles);assert.equal(await db.mediaAsset.count(),beforeRows);
 const valid=new FormData();valid.append('category','support');valid.append('file',new Blob(['%PDF-1.4\nfixture'],{type:'application/pdf'}),'support-manual.pdf');
 const uploaded=await request('/api/upload',{method:'POST',body:valid});assert.equal(uploaded.status,200);
 const result=await request('/api/admin/resources?page=1&category=support&search=support-manual');const asset=result.data.uploads.find(a=>a.url===uploaded.data.url);assert.equal(asset.name,'support-manual.pdf');assert.equal(asset.category,'support');assert.equal(asset.nameMode,'auto');
});

test('compact inventory preserves page data and authorization without duplicating the full reference inventory', async () => {
  const full = await request('/api/admin/resources?page=1&pageSize=1');
  const compact = await request('/api/admin/resources?page=1&pageSize=1&compact=1');
  assert.equal(full.status, 200); assert.equal(compact.status, 200);
  assert.ok(Array.isArray(full.data.used)); assert.ok(full.data.summary);
  assert.equal('used' in compact.data, false); assert.equal('summary' in compact.data, false);
  for (const key of ['uploads', 'categories', 'meta']) assert.deepEqual(compact.data[key], full.data[key]);
  assert.match(compact.headers['server-timing'], /inventory;dur=\d/);
  assert.match(compact.headers['server-timing'], /inventory_cache;desc="hit"/);
  assert.equal((await request('/api/admin/resources?compact=1', { role: null })).status, 401);
  assert.equal((await request('/api/admin/resources?compact=1', { role: 'support' })).status, 403);
});

test('failed resource changes preserve the inventory cache while committed changes refresh it', async () => {
  const form = new FormData(); form.append('file', new Blob(['%PDF-1.4\ninventory cache fixture'], { type: 'application/pdf' }), 'cache-fixture.pdf');
  const uploaded = await request('/api/upload', { method: 'POST', body: form });
  assert.equal(uploaded.status, 200); const url = uploaded.data.url;
  const endpoint = '/api/admin/resources?page=1&compact=1&search=' + encodeURIComponent(url);
  const first = await request(endpoint); assert.equal(first.status, 200);
  assert.match(first.headers['server-timing'], /inventory_cache;desc="miss"/);
  assert.equal((await request('/api/admin/resources/metadata', { method: 'PUT', body: { url, category: 'invalid' } })).status, 400);
  const afterFailure = await request(endpoint); assert.match(afterFailure.headers['server-timing'], /inventory_cache;desc="hit"/);
  assert.equal((await request('/api/admin/resources/metadata', { method: 'PUT', body: { url, nameMode: 'manual', name: '提交后立即可见', category: 'support' } })).status, 200);
  const afterCommit = await request(endpoint); assert.equal(afterCommit.data.uploads[0].name, '提交后立即可见');
  assert.equal(afterCommit.data.uploads[0].category, 'support');
  assert.match(afterCommit.headers['server-timing'], /inventory_cache;desc="miss"/);
});


test('shared draft CAS rejects stale saves, preview, publish and discard without changing the winner', async () => {
  const p = await db.product.create({data:product('cas-fixture',{status:'published'})});
  const endpoint = `/api/admin/content-drafts/product/${p.id}`;
  const first = await request(endpoint,{method:'PUT',body:{title:'first'}});
  assert.equal(first.status,200);
  const firstVersion = first.data.data.version;
  const ticket = await request(`/api/admin/preview-ticket/product/${p.id}`,{method:'POST'});
  assert.equal(ticket.status,200);
  await request(endpoint,{role:'operations'});
  const second = await request(endpoint,{role:'operations',method:'PUT',body:{title:'second'}});
  assert.equal(second.status,200);
  assert.notEqual(second.data.data.version,firstVersion);
  for (const [url,method,body] of [[endpoint,'PUT',{title:'stale'}],[endpoint,'DELETE'],[endpoint+'/publish','POST'],[`/api/admin/preview-ticket/product/${p.id}`,'POST']]) {
    const stale = await request(url,{method,body,headers:{'If-Match':firstVersion}});
    assert.equal(stale.status,409,`${method} ${url}`);
  }
  assert.equal((await request(endpoint,{method:'PUT',headers:{'If-Match':'none'},body:{title:'unaware'}})).status,409);
  const oldPreview=await request(`/api/products/by-key/cas-fixture?previewToken=${ticket.data.token}`,{role:null});
  assert.equal(oldPreview.status,403);
  assert.equal((await db.product.findUnique({where:{id:p.id}})).title,'cas-fixture');
  assert.equal(JSON.parse((await db.contentDraft.findUnique({where:{module_recordId:{module:'product',recordId:p.id}}})).payload).title,'second');
  assert.equal((await request(endpoint+'/publish',{role:'operations',method:'POST'})).status,200);
});

test('appointment with optional details creates an appointment CRM record and is idempotent',async()=>{
  const body={customerName:'预约回归测试',contactInfo:'13812345678',inquiryType:'appointment',productTitle:'Fixture C3',city:'测试城市',preferredTime:'工作日下午',message:'服务类型：试奏与门店咨询\n补充需求：未补充',formStartedAt:Date.now()-5000,submissionId:crypto.randomUUID()};
  const result=await request('/api/inquiries',{role:null,method:'POST',body});assert.equal(result.status,201);
  const repeat=await request('/api/inquiries',{role:null,method:'POST',body});assert.ok([200,201].includes(repeat.status));
  const rows=await db.inquiry.findMany({where:{customerName:body.customerName}});assert.equal(rows.length,1);assert.equal(rows[0].inquiryType,'appointment');assert.equal(rows[0].city,'测试城市');assert.doesNotMatch(rows[0].message,/故障/);
});

test('ordinary product and inquiry saves reject stale forms and preserve the first editor changes', async () => {
  const p = await db.product.create({ data: product('revision-guard') });
  const q = await db.inquiry.create({ data: { customerName: '隔离测试', contactInfo: '13800138000', message: '测试咨询' } });
  for (const [table, endpoint, original, firstPatch, stalePatch, field] of [
    ['product', 'products', p, { title: '新名称' }, { title: p.title, price: 99 }, 'title'],
    ['inquiry', 'inquiries', q, { status: 'done', internalNote: '已解决' }, { status: 'new', internalNote: '', followUpNote: '迟来的回访' }, 'status'],
  ]) {
    const url = `/api/${endpoint}/${original.id}`, revision = original.revision !== undefined ? String(original.revision) : original.updatedAt.toISOString();
    const first = await request(url, { method: 'PUT', body: firstPatch, headers: { 'If-Match': revision } });
    assert.equal(first.status, 200, JSON.stringify(first.data));
    const stale = await request(url, { method: 'PUT', body: stalePatch, headers: { 'If-Match': revision } });
    assert.equal(stale.status, 409);
    const missing = await request(url, { method: 'PUT', body: stalePatch, headers: { 'If-Match': '' } });
    assert.equal(missing.status, 428);
    const saved = await db[table].findUnique({ where: { id: original.id } });
    assert.equal(saved[field], firstPatch[field]);
    if (table === 'inquiry') {
      assert.equal(saved.internalNote, '已解决');
      assert.equal(await db.inquiryFollowUp.count({ where: { inquiryId: original.id, note: '迟来的回访' } }), 0);
    }
    const next = await request(url, { method: 'PUT', body: firstPatch, headers: { 'If-Match': saved.revision !== undefined ? String(saved.revision) : saved.updatedAt.toISOString() } });
    assert.equal(next.status, 200);
  }
});

test('renaming a series then restoring both legacy and shared product history keeps associated downloads', async () => {
  const category = await db.productCategory.upsert({ where: { slug: 'piano' }, create: { slug: 'piano', name: '钢琴' }, update: {} });
  const series = await db.productSeries.create({ data: { name: '历史系列原名', categorySlug: category.slug } });
  const p = await db.product.create({ data: product('series-restore-round2', { series: series.name, status: 'published' }) });
  const download = await db.supportDownload.create({ data: { name: '系列资料', size: '1 KB', type: 'PDF', fileUrl: '/docs.pdf', series: series.name, status: 'published' } });
  const version = await db.contentVersion.create({ data: { module: 'product', recordId: p.id, snapshot: JSON.stringify(p), operator: 'fixture' } });
  const renamed = await request('/api/admin/catalog/series', { method: 'POST', body: { id: series.id, name: '历史系列新名', categorySlug: category.slug } });
  assert.equal(renamed.status, 200, JSON.stringify(renamed.data));
  for (const url of [`/api/products/${p.id}/restore/${version.id}`, `/api/admin/content-history/product/${p.id}/${version.id}/restore`]) {
    const restored = await request(url, { method: 'POST' });
    assert.equal(restored.status, 200, JSON.stringify(restored.data));
    assert.equal((await db.product.findUnique({ where: { id: p.id } })).series, '历史系列新名');
    const related = await request('/api/support-downloads?productId=' + p.id + '&series=' + encodeURIComponent('历史系列新名'), { role: null });
    assert.ok(related.data.data.some(item => item.id === download.id));
  }
});

test('history endpoints paginate old versions without losing equal-timestamp records', async () => {
  const p = await db.product.create({ data: product('history-paging-round2') });
  await db.contentVersion.createMany({ data: Array.from({ length: 35 }, (_, i) => ({ module: 'product', recordId: p.id, snapshot: JSON.stringify({ ...p, title: `Version ${i}` }), operator: 'fixture', createdAt: new Date('2026-01-01') })) });
  for (const base of [`/api/products/${p.id}/versions`, `/api/admin/content-history/product/${p.id}`]) {
    const first = await request(base), second = await request(base + '?page=2');
    assert.equal(first.data.data.length, 30); assert.equal(second.data.data.length, 5);
    assert.equal(first.data.meta.pagination.total, 35);
    assert.equal(new Set([...first.data.data, ...second.data.data].map(row => row.id)).size, 35);
    const search = await request(base + '?search=' + encodeURIComponent('Version 34'));
    assert.equal(search.data.data.length, 1);
  }
});

test('overlapping ordinary product writes accept one revision and reject its competitor', async () => {
  const p = await db.product.create({ data: product('parallel-revision-round2') });
  const responses = await Promise.all(['编辑甲', '编辑乙'].map(title => request(`/api/products/${p.id}`, {
    method: 'PUT', body: { title }, headers: { 'If-Match': p.updatedAt.toISOString() },
  })));
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409], JSON.stringify(responses));
  const winner = responses.find(r => r.status === 200).data;
  assert.equal((await db.product.findUnique({ where: { id: p.id } })).title, winner.title);
});
