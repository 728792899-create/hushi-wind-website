const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { initializeAuditIntegrity } = require('../lib/audit-integrity');
const { runSqliteTransaction } = require('../lib/sqlite-transaction');

const apiRoot = path.resolve(__dirname, '..');
const scratch = path.resolve(apiRoot, '../logs/test-auth-races');
fs.mkdirSync(scratch, { recursive: true });
const temp = fs.mkdtempSync(path.join(scratch, 'fixture-'));
Object.assign(process.env, {
  DATABASE_URL: `file:${temp}/test.db`, NODE_ENV: 'test', HOST: '127.0.0.1',
  UPLOAD_DIR: `${temp}/uploads`, DATABASE_BACKUP_DIR: `${temp}/backups`,
  ADMIN_USERNAME: 'race_seed', ADMIN_PASSWORD: 'RaceFixture9!',
  ADMIN_TOKEN_SECRET: crypto.randomBytes(32).toString('hex'),
  ADMIN_IP_ALLOWLIST: '127.0.0.1', TRUST_PROXY: 'false',
  ALERT_WEBHOOK_URL: '', ALERT_EMAIL_TO: '', API_RATE_LIMIT: '10000',
});
let api, db, server, origin;
const password = 'RaceFixture9!';
const secret = 'JBSWY3DPEHPK3PXP';
const call = async (url, { token, body, method = 'POST' } = {}) => {
  const response = await fetch(origin + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};
const user = async (data = {}) => {
  const { salt, hash } = api.hashPassword(password);
  return db.adminUser.create({ data: {
    username: `race_${crypto.randomBytes(6).toString('hex')}`, role: 'super_admin',
    passwordSalt: salt, passwordHash: hash, ...data,
  } });
};

// Deterministically commit a concurrent security change after a captured read,
// before its caller resumes. This exercises the real HTTP route and database,
// without timing sleeps or production-only test hooks.
async function betweenReads(matches, mutate, action) {
  const original = db.adminUser.findUnique;
  let injected = false;
  db.adminUser.findUnique = async function (args) {
    const row = await original.call(this, args);
    if (!injected && matches(args)) {
      injected = true;
      await mutate(row);
    }
    return row;
  };
  try {
    const result = await action();
    assert.ok(injected, 'concurrent mutation must run at the captured read');
    return result;
  } finally { db.adminUser.findUnique = original; }
}
const revoke = (id) => {
  const { salt, hash } = api.hashPassword('ReplacedFixture9!');
  return db.adminUser.update({ where: { id }, data: {
    passwordSalt: salt, passwordHash: hash, tokenVersion: { increment: 1 },
  } });
};
function afterRequestAuth(id) {
  let reads = 0;
  // Optional API auth and requireAdmin each load the account before the route.
  return (args) => args.where.id === id && ++reads === 2;
}
before(async () => {
  fs.closeSync(fs.openSync(`${temp}/test.db`, 'a'));
  const migrated = spawnSync(process.execPath, [path.join(apiRoot, 'node_modules/prisma/build/index.js'),
    'migrate', 'deploy', '--schema', path.join(apiRoot, 'prisma/schema.prisma')],
  { cwd: apiRoot, env: process.env, encoding: 'utf8' });
  assert.equal(migrated.status, 0, migrated.stderr + migrated.stdout);
  api = require('../server'); db = api.database;
  await initializeAuditIntegrity(db);
  await user({ username: 'race_seed' });
  server = api.app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  // Drain the request-finish log writes before disconnecting the fixture.
  if (db) await runSqliteTransaction(db, async () => {});
  await db?.$disconnect();
  fs.rmSync(temp, { recursive: true, force: true });
});

for (const change of ['password', '2fa', 'disabled', 'locked']) {
  test(`login cannot promote credentials captured before concurrent ${change}`, async () => {
    const admin = await user();
    const response = await betweenReads(
      (args) => args.where.username === admin.username,
      () => change === 'password' ? revoke(admin.id) : db.adminUser.update({
        where: { id: admin.id }, data: change === '2fa'
          ? { totpEnabled: true, totpSecret: secret, tokenVersion: { increment: 1 } }
          : change === 'disabled' ? { status: 'disabled' }
            : { lockedUntil: new Date(Date.now() + 60000), failedLoginCount: 5 },
      }),
      () => call('/api/auth/login', { body: { username: admin.username, password } }),
    );
    assert.equal(response.status, 401);
    assert.equal(response.body.token, undefined);
    assert.equal(await db.loginRecord.count({ where: { adminUserId: admin.id, success: true } }), 0);
    if (change === 'locked') assert.ok((await db.adminUser.findUnique({ where: { id: admin.id } })).lockedUntil);
  });
}
for (const endpoint of ['refresh', '2fa/setup', '2fa/enable', '2fa/disable', 'change-password']) {
  test(`${endpoint} rejects a session revoked after middleware authentication`, async () => {
    const admin = await user({ totpSecret: secret });
    const token = api.createAdminToken(admin);
    const response = await betweenReads(afterRequestAuth(admin.id), () => revoke(admin.id),
      () => call(`/api/auth/${endpoint}`, { token, body: {
        code: api.totpCode(secret, Math.floor(Date.now() / 30000)),
        oldPassword: 'ReplacedFixture9!', newPassword: 'AnotherFixture9!',
      } }));
    assert.equal(response.status, 401);
    assert.equal(response.body.error.code, 'TOKEN_REVOKED');
    assert.equal(response.body.token, undefined);
    assert.equal((await db.adminUser.findUnique({ where: { id: admin.id } })).tokenVersion, admin.tokenVersion + 1);
    assert.equal(await db.operationLog.count({ where: { operator: admin.username } }), 0);
  });
}
test('normal login, refresh and TOTP rotation remain usable and keep absolute auth time', async () => {
  const admin = await user({ totpSecret: secret });
  const login = await call('/api/auth/login', { body: { username: admin.username, password } });
  assert.equal(login.status, 200);
  const refresh = await call('/api/auth/refresh', { token: login.body.token });
  assert.equal(refresh.status, 200);
  const enabled = await call('/api/auth/2fa/enable', { token: refresh.body.token,
    body: { code: api.totpCode(secret, Math.floor(Date.now() / 30000)) } });
  assert.equal(enabled.status, 200);
  assert.equal(enabled.body.sessionExpiresAt, login.body.sessionExpiresAt);
  assert.equal((await call('/api/auth/session', { token: refresh.body.token, method: 'GET' })).status, 401);
  assert.equal((await call('/api/auth/session', { token: enabled.body.token, method: 'GET' })).status, 200);
});
for (const [change, code] of [['disabled', 'ACCOUNT_INACTIVE'], ['locked', 'ACCOUNT_LOCKED'], ['expired', 'TOKEN_EXPIRED']]) {
  test(`refresh rechecks ${change} state after middleware authentication`, async (t) => {
    const admin = await user();
    const token = api.createAdminToken(admin);
    const expiresAt = JSON.parse(Buffer.from(token.split('.')[0], 'base64url')).exp;
    try {
      const response = await betweenReads(afterRequestAuth(admin.id), async () => {
        if (change === 'expired') t.mock.method(Date, 'now', () => expiresAt + 1);
        else await db.adminUser.update({ where: { id: admin.id }, data:
          change === 'disabled' ? { status: 'disabled' } : { lockedUntil: new Date(Date.now() + 60000) } });
      }, () => call('/api/auth/refresh', { token }));
      assert.equal(response.status, 401);
      assert.equal(response.body.error.code, code);
      assert.equal(response.body.token, undefined);
    } finally { t.mock.restoreAll(); }
  });
}
test('artist draft preview enforces artists:read for both admin and preview parameters', async () => {
  const support = await user({ role: 'support' });
  const editor = await user({ role: 'editor' });
  const draft = await db.artist.create({ data: { name: 'Private fixture', role: 'fixture', status: 'draft' } });
  for (const flag of ['admin', 'preview']) {
    const denied = await call(`/api/artists?${flag}=1&status=draft`, { token: api.createAdminToken(support), method: 'GET' });
    assert.equal(denied.status, 403);
    assert.equal((await call(`/api/artists?${flag}=1`, { method: 'GET' })).status, 401);
    const allowed = await call(`/api/artists?${flag}=1&status=draft`, { token: api.createAdminToken(editor), method: 'GET' });
    assert.equal(allowed.status, 200);
    assert.ok(allowed.body.data.some((row) => row.id === draft.id));
  }
  const publicList = await call('/api/artists', { method: 'GET' });
  assert.equal(publicList.status, 200);
  assert.ok(!publicList.body.data.some((row) => row.id === draft.id));
});
