const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { initializeAuditIntegrity } = require('../lib/audit-integrity');
const { runSqliteTransaction } = require('../lib/sqlite-transaction');
const { sanitizeTelemetry, sanitizeMetadata } = require('../lib/security');

const apiRoot = path.resolve(__dirname, '..');
const logRoot = path.resolve(apiRoot, '../logs/step7-20261013');
fs.mkdirSync(logRoot, { recursive: true });
const temp = fs.mkdtempSync(path.join(logRoot, 'telemetry-fixture-'));
Object.assign(process.env, {
  DATABASE_URL: `file:${path.join(temp, 'test.db')}`, NODE_ENV: 'test', HOST: '127.0.0.1',
  UPLOAD_DIR: path.join(temp, 'uploads'), DATABASE_BACKUP_DIR: path.join(temp, 'backups'),
  ADMIN_USERNAME: 'telemetry_fixture', ADMIN_PASSWORD: 'TelemetryFixture9!',
  ADMIN_TOKEN_SECRET: crypto.randomBytes(32).toString('hex'), ADMIN_IP_ALLOWLIST: '127.0.0.1',
  TRUST_PROXY: 'false', ALERT_WEBHOOK_URL: '', ALERT_EMAIL_TO: '',
  API_RATE_LIMIT: '10000', PUBLIC_FORM_RATE_LIMIT: '1000',
});
let api, db, server, origin, adminToken, product, previewToken;
async function call(route, { method = 'GET', body, auth = false } = {}) {
  const response = await fetch(origin + route, {
    method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${adminToken}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  const migrated = spawnSync(process.execPath, [
    path.join(apiRoot, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy',
    '--schema', path.join(apiRoot, 'prisma/schema.prisma'),
  ], { cwd: apiRoot, env: process.env, encoding: 'utf8' });
  assert.equal(migrated.status, 0, migrated.stdout + migrated.stderr);
  api = require('../server');
  db = api.database;
  await initializeAuditIntegrity(db);
  const { salt, hash } = api.hashPassword('TelemetryFixture9!');
  const user = await db.adminUser.create({ data: {
    username: 'telemetry_fixture', role: 'super_admin', passwordSalt: salt, passwordHash: hash,
  } });
  adminToken = api.createAdminToken(user);
  product = await db.product.create({ data: {
    title: '仅合成预览产品', slug: 'telemetry-preview-fixture', type: 'piano',
    categoryName: '钢琴', description: '未公开的合成预览正文', status: 'draft',
  } });
  server = api.app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const ticket = await call(`/api/admin/preview-ticket/product/${product.id}`, { method: 'POST', auth: true, body: {} });
  assert.equal(ticket.status, 200);
  previewToken = ticket.body.token;
  assert.ok(previewToken);
  assert.equal((await call(`/api/products/${product.id}?previewToken=${previewToken}`)).status, 200, 'fixture must use a valid bearer preview ticket');
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (db) await runSqliteTransaction(db, tx => tx.apiRequestLog.count());
  await db?.$disconnect();
  fs.rmSync(temp, { recursive: true, force: true });
});

test('real preview tickets never persist in analytics, monitoring alerts or API logs', async () => {
  const pagePath = `/products/${product.id}?previewToken=${previewToken}&utm_source=newsletter&source=campaign`;
  const source = `https://ref.example.invalid/?previewToken=${previewToken}&utm_source=partner`;
  for (const eventType of ['page_view', 'api_error', 'resource_error']) {
    const response = await call('/api/events', { method: 'POST', body: {
      eventType, pagePath, source, entityTitle: `GET https://api.example.invalid${pagePath} failed`,
      metadata: { pagePath, source, name: 'preview-network', count: 1 },
    } });
    assert.equal(response.status, 201);
  }
  const events = await db.analyticsEvent.findMany();
  const alerts = await db.alertRecord.findMany();
  await call(`/api/catalog?previewToken=${previewToken}`);
  // Logging uses the same write queue; drain it before inspecting persisted rows.
  await runSqliteTransaction(db, tx => tx.apiRequestLog.count());
  const logs = await db.apiRequestLog.findMany();
  assert.equal(events.length, 3);
  assert.equal(alerts.length, 2);
  assert.ok(logs.some(row => row.path === '/api/catalog'));
  const privacy = {};
  for (const [name, rows] of [['AnalyticsEvent', events], ['AlertRecord', alerts], ['ApiRequestLog', logs]]) {
    const serialized = JSON.stringify(rows);
    privacy[name] = !serialized.includes(previewToken.slice(0, 48)) && !serialized.includes(previewToken.split('.')[1]);
  }
  assert.deepEqual(privacy, { AnalyticsEvent: true, AlertRecord: true, ApiRequestLog: true }, 'neither full nor truncated preview credentials may persist');
  for (const event of events) {
    assert.match(event.pagePath, /utm_source=newsletter/);
    assert.match(event.pagePath, /source=campaign/);
    assert.match(event.source, /utm_source=partner/);
    assert.equal(JSON.parse(event.metadata).count, 1);
  }
});

test('browser and API sanitizers agree on encoded, embedded and repeated credentials while preserving attribution', async () => {
  const browser = await import('../../aural-website/app/utils/telemetryPrivacy.js');
  const credential = 'synthetic-credential-for-contract';
  const privateUrl = `https://example.invalid/products/1?previewToken=${credential}&utm_source=partner`;
  const cases = [
    privateUrl,
    `/products/1?utm_source=mail&previewToken=${credential}&source=campaign&previewToken=${credential}`,
    `/products/1?pre%76iewToken=${credential}&utm_campaign=launch`,
    `/products/1?PREVIEW_TOKEN=${credential}#access_token=${credential}`,
    `GET ${privateUrl} failed with status 503`,
    `/redirect?source=${encodeURIComponent(privateUrl)}&utm_medium=qr`,
    encodeURIComponent(encodeURIComponent(privateUrl)),
    `/products/1?utm_source=mail&amp;previewToken=${credential}&amp;source=campaign`,
    ...['token', 'access_token', 'refresh_token', 'id_token', 'authorization', 'api_key', 'password', 'secret']
      .map(key => `/support?${key}=${credential}&utm_source=mail`),
  ];
  for (const value of cases) {
    const apiValue = sanitizeTelemetry(value);
    assert.equal(browser.sanitizeTelemetry(value), apiValue);
    assert.equal(apiValue.includes(credential), false, 'credential must be removed in every URL representation');
  }
  const ordinary = {
    pagePath: '/products/1?utm_source=mail&utm_medium=qr&utm_campaign=%E6%96%B0%E5%93%81&source=campaign&search=piano',
    source: 'offline-exhibition', searchTerm: 'C major',
    metadata: { count: 2, durationMs: 15, nested: [{ source: 'partner', result: false }] },
  };
  assert.deepEqual(sanitizeTelemetry(ordinary), ordinary);
  assert.deepEqual(browser.sanitizeTelemetry(ordinary), ordinary);
  const input = { pagePath: privateUrl, metadata: { nested: [{ source: privateUrl }], previewToken: credential } };
  const before = structuredClone(input);
  const filtered = sanitizeTelemetry(input);
  assert.deepEqual(input, before, 'sanitizing telemetry must not mutate a live preview URL or caller object');
  assert.equal(JSON.stringify(filtered).includes(credential), false);
  assert.deepEqual(filtered, browser.sanitizeTelemetry(input));
});

test('metadata filtering redacts before truncation and keeps its existing allowed fields and scalar types', () => {
  const credential = 'synthetic-credential-'.repeat(20);
  const filtered = JSON.parse(sanitizeMetadata({
    pagePath: `/products/1?previewToken=${credential}&utm_source=mail`,
    source: `https://example.invalid/?access_token=${credential}&source=partner`,
    count: 3, rating: true, name: 'test', password: credential,
    unsupported: 'ignored', nested: { source: 'ignored' },
  }));
  assert.equal(JSON.stringify(filtered).includes('synthetic-credential'), false);
  assert.match(filtered.pagePath, /utm_source=mail/);
  assert.match(filtered.source, /source=partner/);
  assert.deepEqual(Object.keys(filtered).sort(), ['count', 'name', 'pagePath', 'rating', 'source']);
  assert.equal(filtered.count, 3);
  assert.equal(filtered.rating, true);
  assert.equal(sanitizeMetadata([]), null);
});

test('direct event callers cannot persist preview tickets through encoded source URLs or monitoring metadata', async () => {
  const privateUrl = `https://example.invalid/products/${product.id}?pre%76iewToken=${previewToken}&utm_source=partner`;
  const response = await call('/api/events', { method: 'POST', body: {
    eventType: 'frontend_error', pagePath: '/support?utm_campaign=launch',
    source: encodeURIComponent(privateUrl),
    entityTitle: `GET ${privateUrl} failed`,
    metadata: { value: privateUrl, source: `/redirect?next=${encodeURIComponent(privateUrl)}&source=campaign`, count: 7 },
  } });
  assert.equal(response.status, 201);
  const event = await db.analyticsEvent.findFirst({ where: { eventType: 'frontend_error' } });
  const alert = await db.alertRecord.findFirst({ where: { type: 'frontend_error' } });
  for (const row of [event, alert]) {
    assert.ok(row);
    assert.equal(JSON.stringify(row).includes(previewToken.slice(0, 48)), false);
  }
  assert.match(decodeURIComponent(event.source), /utm_source=partner/);
  assert.match(decodeURIComponent(JSON.parse(event.metadata).source), /utm_source=partner/);
  assert.equal(JSON.parse(event.metadata).count, 7);
});
