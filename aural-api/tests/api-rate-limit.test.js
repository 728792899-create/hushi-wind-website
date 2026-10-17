const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { createApiRateLimiter } = require('../lib/api-rate-limit');

test('telemetry storm cannot spend content allowance; both buckets remain bounded', () => {
  let now = Date.now();
  const limiter = createApiRateLimiter({ limit: 180, windowMs: 60000, now: () => now });
  const request = (url, method = 'GET', ip = '192.0.2.1') => {
    const headers = {};
    let error;
    limiter({ path: url, method, ip }, { setHeader: (key, value) => { headers[key] = value; } }, e => { error = e; });
    return { status: error?.status || 200, code: error?.code, headers };
  };
  for (let i = 0; i < 180; i++) assert.equal(request(i % 2 ? '/EVENTS/' : '/events', 'POST').status, 200);
  assert.equal(request('/events', 'POST').status, 429);
  for (const url of ['/config', '/products', '/articles', '/ecosystem-services']) assert.equal(request(url).status, 200);
  for (let i = 4; i < 180; i++) assert.equal(request('/products').status, 200);
  assert.deepEqual(request('/products'), { status: 429, code: 'RATE_LIMITED', headers: { 'Retry-After': '60' } });
  assert.equal(request('/events', 'GET').status, 429, 'non-telemetry methods cannot bypass the content limit');
  assert.equal(request('/events/not-real', 'POST').status, 429, 'similar paths are not exempt');
  assert.equal(request('/products', 'GET', '192.0.2.2').status, 200);
  now += 59001;
  assert.equal(request('/products').headers['Retry-After'], '1');
  now += 999;
  assert.equal(request('/products').status, 200, 'exact reset boundary starts a new window');
  assert.equal(request('/events', 'POST').status, 200);
  limiter.sweep();
});

test('full IP bucket store cannot bypass bounded rejection logging', () => {
  const limiter = createApiRateLimiter({ limit: 1, windowMs: 60000 });
  const request = ip => {
    const req = { path: '/products', method: 'GET', ip };
    let error;
    limiter(req, { setHeader() {} }, value => { error = value; });
    return { status: error?.status || 200, logAllowed: req.rateLimitLogAllowed };
  };
  for (let i = 0; i < 10000; i++) assert.equal(request(`fixture-${i}`).status, 200);
  for (let i = 0; i < 20; i++) assert.deepEqual(request('overflow'), { status: 429, logAllowed: false });
  assert.deepEqual(request('fixture-1'), { status: 429, logAllowed: true });
  assert.deepEqual(request('fixture-1'), { status: 429, logAllowed: false });
});

test('real API isolates event quota and records content 429 with finite duration', async () => {
  const apiRoot = path.resolve(__dirname, '..');
  const root = path.resolve(apiRoot, '../logs/loading-fix-20261017');
  fs.mkdirSync(root, { recursive: true });
  const temp = fs.mkdtempSync(path.join(root, 'rate-limit-test-'));
  Object.assign(process.env, {
    DATABASE_URL: `file:${temp}/test.db`, NODE_ENV: 'test', HOST: '127.0.0.1',
    UPLOAD_DIR: `${temp}/uploads`, DATABASE_BACKUP_DIR: `${temp}/backups`,
    ADMIN_USERNAME: 'rate_test_owner', ADMIN_PASSWORD: 'RateFixture9!',
    ADMIN_TOKEN_SECRET: crypto.randomBytes(32).toString('hex'),
    TRUST_PROXY: 'false', ALERT_WEBHOOK_URL: '', ALERT_EMAIL_TO: '',
    API_RATE_LIMIT: '3', API_RATE_WINDOW_MS: '60000', PUBLIC_SITE_MODE: 'full',
  });
  const migrated = spawnSync(process.execPath, [path.join(apiRoot, 'node_modules/prisma/build/index.js'),
    'migrate', 'deploy', '--schema', path.join(apiRoot, 'prisma/schema.prisma')],
  { cwd: apiRoot, env: process.env, encoding: 'utf8' });
  assert.equal(migrated.status, 0, migrated.stdout + migrated.stderr);
  require('../scripts/load-env').loadEnvFile = () => {};
  const api = require('../server');
  const db = api.database;
  let server;
  try {
    await db.systemConfig.create({ data: { id: 1, aboutTitle: '隔离测试' } });
    server = api.app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const event = () => fetch(origin + '/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType: 'performance_metric', pagePath: '/', metadata: { metric: 'CLS', value: 1 } }) });
    for (let i = 0; i < 3; i++) assert.equal((await event()).status, 201);
    assert.equal((await event()).status, 429);
    for (const url of ['/api/config', '/api/products', '/api/articles']) assert.equal((await fetch(origin + url)).status, 200);
    const rejected = await fetch(origin + '/api/products', { headers: { Origin: 'http://localhost:3000' } });
    assert.equal(rejected.status, 429);
    assert.equal((await rejected.json()).error.code, 'RATE_LIMITED');
    assert.ok(Number(rejected.headers.get('Retry-After')) > 0);
    assert.match(rejected.headers.get('Access-Control-Expose-Headers'), /Retry-After/);
    for (let i = 0; i < 40; i++) assert.equal((await fetch(origin + '/api/products')).status, 429);
    let log;
    for (let i = 0; i < 100 && !log; i++) {
      log = await db.apiRequestLog.findFirst({ where: { path: '/api/products', status: 429 } });
      if (!log) await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.ok(log, '429 must be observable even though routing never ran');
    assert.equal(log.errorCode, 'RATE_LIMITED');
    assert.ok(Number.isFinite(log.durationMs) && log.durationMs >= 0);
    assert.equal(await db.apiRequestLog.count({ where: { status: 429 } }), 1, 'only first rejection in this IP/window writes a log');
    assert.equal(await db.analyticsEvent.count(), 3, 'rate-limited telemetry is not persisted');
    assert.equal(await db.apiRequestLog.count({ where: { path: '/api/events' } }), 0, 'telemetry rejection cannot create a logging storm');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await db.$disconnect();
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
