const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hushi-session-'));
const apiRoot = path.resolve(__dirname, '..');
const IDLE_MS = 1500;
const MAX_MS = 4000;
Object.assign(process.env, {
  DATABASE_URL: `file:${temp}/test.db`,
  HOST: '127.0.0.1',
  NODE_ENV: 'test',
  UPLOAD_DIR: `${temp}/uploads`,
  DATABASE_BACKUP_DIR: `${temp}/backups`,
  ADMIN_USERNAME: 'session_admin',
  ADMIN_PASSWORD: 'SessionSecure9!',
  ADMIN_TOKEN_SECRET: crypto.randomBytes(32).toString('hex'),
  ADMIN_TOKEN_TTL_MS: String(MAX_MS),
  ADMIN_IDLE_TIMEOUT_MS: String(IDLE_MS),
  ADMIN_IP_ALLOWLIST: '127.0.0.1',
  TRUST_PROXY: 'false',
  ALERT_WEBHOOK_URL: '',
  API_RATE_LIMIT: '10000',
  PUBLIC_FORM_RATE_LIMIT: '1000',
});

let api, db, server, origin, admin;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const claims = (token) =>
  JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
const call = async (url, token, method = 'GET', body) => {
  const res = await fetch(origin + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

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
  const { salt, hash } = api.hashPassword('SessionSecure9!');
  admin = await db.adminUser.create({
    data: { username: 'session_super', role: 'super_admin', passwordSalt: salt, passwordHash: hash },
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

test('login issues an idle-length token and reports the absolute session end', async () => {
  const startedAt = Date.now();
  const res = await call('/api/auth/login', '', 'POST', { username: 'session_super', password: 'SessionSecure9!' });
  assert.equal(res.status, 200);
  assert.equal(res.body.idleTimeout, IDLE_MS / 1000);
  assert.ok(res.body.expiresIn <= IDLE_MS / 1000);
  const ends = Date.parse(res.body.sessionExpiresAt);
  assert.ok(ends >= startedAt + MAX_MS && ends <= Date.now() + MAX_MS);
  const { auth, iat, exp } = claims(res.body.token);
  assert.ok(auth <= iat && exp - iat <= IDLE_MS);
});

test('a token that is not refreshed expires after the idle timeout', async () => {
  const token = api.createAdminToken(admin);
  assert.equal((await call('/api/auth/session', token)).status, 200);
  await sleep(IDLE_MS + 200);
  const res = await call('/api/auth/session', token);
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'TOKEN_EXPIRED');
});

test('refresh extends idle expiry, keeps the login time, and never passes the absolute limit', async () => {
  let token = api.createAdminToken(admin);
  const loginAuth = claims(token).auth;
  let refreshed = 0;
  let rejected = null;
  while (Date.now() - loginAuth < MAX_MS + IDLE_MS) {
    await sleep(700);
    const res = await call('/api/auth/refresh', token, 'POST');
    if (res.status !== 200) {
      rejected = res;
      break;
    }
    refreshed += 1;
    token = res.body.token;
    const next = claims(token);
    assert.equal(next.auth, loginAuth);
    assert.ok(next.exp <= loginAuth + MAX_MS);
    assert.ok(res.body.expiresIn <= IDLE_MS / 1000);
  }
  assert.ok(refreshed >= 3, `expected several refreshes, got ${refreshed}`);
  assert.ok(rejected, 'refresh must stop working after the absolute session limit');
  assert.equal(rejected.status, 401);
  assert.ok(Date.now() - loginAuth >= MAX_MS);
});

test('a token whose login time is older than the absolute limit is rejected', async () => {
  const stale = api.createAdminToken(admin, Date.now() - MAX_MS - 1);
  const res = await call('/api/auth/session', stale);
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'TOKEN_EXPIRED');
});
