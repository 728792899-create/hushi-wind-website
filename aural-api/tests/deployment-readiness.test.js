const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const cp = require('node:child_process');
const api = path.resolve(__dirname, '..');
const scratch = path.resolve(api, '../logs/step14-20261013');
fs.mkdirSync(scratch, { recursive: true });

async function deploymentFixture(scenario, check) {
  const backupLib = require('../lib/database-backup');
  const envLib = require('../scripts/load-env');
  const previous = { spawn: cp.spawnSync, backup: backupLib.createDatabaseBackup,
    loadEnv: envLib.loadEnvFile, env: { ...process.env }, argv: [...process.argv] };
  const root = fs.mkdtempSync(path.join(scratch, 'deployment-'));
  const stage = path.join(root, 'stage'), releases = path.join(root, 'releases');
  const old = path.join(releases, 'previous'), current = path.join(root, 'current');
  const shared = path.join(root, 'shared'), database = path.join(shared, 'fixture.db');
  const uploads = path.join(shared, 'uploads'), gate = path.join(shared, 'gate');
  const calls = [], events = [];
  try {
    fs.mkdirSync(old, { recursive: true }); fs.mkdirSync(uploads, { recursive: true });
    fs.writeFileSync(database, 'before migration'); fs.writeFileSync(path.join(uploads, 'asset'), 'fixture asset');
    fs.symlinkSync(old, current);
    for (const name of ['aural-api', 'aural-admin', 'aural-website']) {
      fs.mkdirSync(path.join(stage, name), { recursive: true });
      fs.writeFileSync(path.join(stage, name, 'package-lock.json'), '{}');
    }
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, { NODE_ENV: 'test', TOKIO_WORKER_THREADS: '2', DEPLOY_RELEASES_DIR: releases,
      DEPLOY_CURRENT_LINK: current, DATABASE_URL: 'file:' + database, UPLOAD_DIR: uploads,
      DATABASE_BACKUP_DIR: path.join(shared, 'backups'), API_PM2_NAME: 'fixture-api', WEB_PM2_NAME: 'fixture-web',
      DEPLOY_WRITE_GATE_FILE: gate, SHUTDOWN_TIMEOUT_MS: '60000', ADMIN_DIST_DIR: path.join(root, 'unrelated-dist'),
      API_PUBLIC_URL: 'https://api.example.invalid', PUBLIC_SITE_URL: 'https://www.example.invalid', PUBLIC_ADMIN_URL: 'https://admin.example.invalid', ...scenario.env });
    process.argv[2] = stage; envLib.loadEnvFile = () => false;
    backupLib.createDatabaseBackup = async (source, target) => {
      events.push('backup'); assert.ok(fs.existsSync(gate));
      fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(source, target);
    };
    cp.spawnSync = (command, args, options = {}) => {
      calls.push({ command, args, ...options });
      if (command === 'pm2' && args[0] === 'jlist') return { status: 0, stdout: JSON.stringify(['fixture-api', 'fixture-web'].map(name => ({
        name, pm2_env: { kill_timeout: 65000, SHUTDOWN_TIMEOUT_MS: 60000,
          pm_exec_path: path.join(current, name, 'server.js'), pm_cwd: path.join(current, name) },
      }))) };
      if (command === 'npm') {
        const label = `${path.basename(options.cwd)}:${args.join(' ')}`; events.push(label);
        assert.equal(fs.existsSync(gate), false, `${label} must run before maintenance`);
        assert.equal(fs.readFileSync(database, 'utf8'), 'before migration');
        return { status: scenario.failGate === label ? 1 : 0 };
      }
      if (command === 'npx') {
        if (args.includes('migrate')) { assert.ok(fs.existsSync(gate)); events.push('migrate'); fs.writeFileSync(database, 'after migration'); }
        return { status: 0 };
      }
      if (command === 'pm2') {
        assert.ok(fs.existsSync(gate)); events.push(`pm2:${args[0]}`); return { status: 0 };
      }
      assert.equal(command, process.execPath, 'no actual child commands are allowed');
      if (path.basename(args[0]) === 'post-deploy-check.js') {
        assert.ok(fs.existsSync(gate));
        const rolledBack = fs.realpathSync(current) === fs.realpathSync(old);
        events.push(rolledBack ? 'rollback-check' : 'release-check');
        if (rolledBack) assert.equal(fs.readFileSync(database, 'utf8'), 'before migration');
        return { status: rolledBack ? (scenario.rollbackFails ? 1 : 0) : (scenario.releaseFails ? 1 : 0) };
      }
      assert.ok(['scripts/preflight.js', 'scripts/check-database.js'].includes(args[0]));
      return { status: 0 };
    };
    delete require.cache[require.resolve('../scripts/safe-deploy')];
    const { main } = require('../scripts/safe-deploy');
    const record = () => JSON.parse(fs.readFileSync(path.join(releases, fs.readdirSync(releases).find(name => name.endsWith('.json'))), 'utf8'));
    await check({ main, record, calls, events, releases, current, old, database, uploads, gate });
  } finally {
    cp.spawnSync = previous.spawn; backupLib.createDatabaseBackup = previous.backup; envLib.loadEnvFile = previous.loadEnv;
    process.argv.splice(0, process.argv.length, ...previous.argv);
    for (const key of Object.keys(process.env)) delete process.env[key]; Object.assign(process.env, previous.env);
    delete require.cache[require.resolve('../scripts/safe-deploy')]; fs.rmSync(root, { recursive: true, force: true });
  }
}

for (const failGate of ['aural-api:run audit:prod', 'aural-admin:run audit:prod', 'aural-website:test']) {
  test(`${failGate} failure leaves running deployment and shared data untouched`, async () => {
    await deploymentFixture({ failGate }, async ({ main, record, events, current, old, database, uploads, gate, releases }) => {
      await assert.rejects(main, /npm .* failed/);
      assert.ok(events.includes(failGate));
      assert.ok(!events.some(value => value.startsWith('pm2:') || ['backup', 'migrate'].includes(value)));
      assert.equal(fs.realpathSync(current), fs.realpathSync(old));
      assert.equal(fs.readFileSync(database, 'utf8'), 'before migration');
      assert.equal(fs.readFileSync(path.join(uploads, 'asset'), 'utf8'), 'fixture asset');
      assert.equal(fs.existsSync(gate), false); assert.equal(fs.existsSync(path.join(releases, '.deploy-lock')), false);
      assert.equal(record().status, 'failed'); assert.equal(record().rollback, undefined);
    });
  });
}

test('all release quality gates precede maintenance and readiness checks use the new admin build', async () => {
  await deploymentFixture({}, async ({ main, record, events, calls, gate }) => {
    await main();
    for (const label of ['aural-api:test', 'aural-api:run audit:prod', 'aural-admin:test', 'aural-admin:run audit:prod', 'aural-website:test', 'aural-website:run audit:prod'])
      assert.ok(events.indexOf(label) >= 0 && events.indexOf(label) < events.indexOf('pm2:stop'), label);
    const check = calls.find(call => path.basename(call.args[0]) === 'post-deploy-check.js');
    assert.equal(check.env.ADMIN_DIST_DIR, path.join(record().release, 'aural-admin/dist'));
    assert.equal(record().status, 'success'); assert.equal(fs.existsSync(gate), false);
  });
});

for (const rollbackFails of [false, true]) {
  test(`rollback readiness ${rollbackFails ? 'failure retains maintenance' : 'success precedes restored and maintenance release'}`, async () => {
    await deploymentFixture({ releaseFails: true, rollbackFails }, async ({ main, record, calls, events, current, old, gate, releases }) => {
      await assert.rejects(main, /post-deploy-check/);
      assert.deepEqual(events.filter(item => item.endsWith('-check')), ['release-check', 'rollback-check']);
      const checks = calls.filter(call => path.basename(call.args[0]) === 'post-deploy-check.js');
      assert.equal(path.resolve(checks[1].cwd, checks[1].args[0]), path.join(record().release, 'aural-api/scripts/post-deploy-check.js'), 'use the prepared verifier even if the old release predates retries');
      assert.equal(checks[1].env.ADMIN_DIST_DIR, path.join(old, 'aural-admin/dist'));
      assert.equal(fs.realpathSync(current), fs.realpathSync(old)); assert.equal(record().status, 'failed');
      assert.equal(record().rollback, rollbackFails ? 'failed' : 'restored');
      if (rollbackFails) assert.match(record().rollbackError, /post-deploy-check/);
      assert.equal(fs.existsSync(gate), rollbackFails); assert.equal(fs.existsSync(path.join(releases, '.deploy-lock')), false);
    });
  });
}

const goodHealth = { status: 'ok', database: { file: { size: 1 }, coreTables: ['Product', 'AdminUser', 'Article', 'SystemConfig'].map(name => ({ name, status: 'ok' })) } };
async function postCheckFixture({ health, page, session, env = {}, fetchImpl, clock = performance, timers }, check) {
  const root = fs.mkdtempSync(path.join(scratch, 'readiness-'));
  const counts = new Map(), output = [];
  const server = http.createServer((req, res) => {
    const count = (counts.get(req.url) || 0) + 1; counts.set(req.url, count);
    if (req.url === '/health') return health(req, res, count);
    if (req.url === '/api/auth/session') { if (session) return session(req, res); res.writeHead(401, { 'Content-Type': 'application/json' }); return res.end('{"success":false}'); }
    if (page) return page(req, res, count);
    res.end('<!DOCTYPE html><html>Local synthetic readiness page</html>');
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    fs.writeFileSync(path.join(root, 'app.js'), JSON.stringify(origin));
    const context = { require: name => name === 'node:perf_hooks' ? { performance: clock } : name === './load-env' ? { loadEnvFile: () => false } : name.startsWith('../') ? require(path.resolve(api, 'scripts', name)) : require(name),
      __dirname: path.join(api, 'scripts'), console: { log: (...args) => output.push(args.join(' ')), error: (...args) => output.push(args.join(' ')) },
      process: { env: { SITE_URL: origin + '/site', ADMIN_URL: origin + '/admin', API_BASE: origin, ADMIN_DIST_DIR: root,
        POST_DEPLOY_TIMEOUT_MS: '1000', POST_DEPLOY_READY_TIMEOUT_MS: '5000', POST_DEPLOY_READY_INTERVAL_MS: '5', ...env },
      exit: code => { const error = new Error(`exit ${code}`); error.exitCode = code; throw error; } },
      fetch: fetchImpl || fetch, AbortController, setTimeout: timers?.setTimeout || setTimeout, clearTimeout, performance: clock };
    const started = performance.now(); let error;
    try { await vm.runInNewContext(fs.readFileSync(path.join(api, 'scripts/post-deploy-check.js'), 'utf8'), context); }
    catch (caught) { error = caught; }
    await check({ counts, output: output.join('\n'), error, elapsed: performance.now() - started });
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
}
const respondJson = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };

test('post-deploy check waits through startup 503 and transient frontend 503 before reporting success', async () => {
  await postCheckFixture({
    health: (req, res, count) => respondJson(res, count <= 2 ? 503 : 200, count <= 2 ? { error: { code: 'SERVICE_STARTING' } } : goodHealth),
    page: (req, res, count) => { res.statusCode = count === 1 ? 503 : 200; res.end(count === 1 ? 'starting' : '<!DOCTYPE html>fixture'); },
  }, ({ counts, error, output }) => {
    assert.equal(error, undefined, output); assert.equal(counts.get('/health'), 3);
    assert.equal(counts.get('/site'), 2); assert.equal(counts.get('/admin'), 2); assert.match(output, /failures=0/);
  });
});

test('connection refusal during API startup can recover within the readiness budget', async () => {
  let attempts = 0;
  await postCheckFixture({ health: (req, res) => respondJson(res, 200, goodHealth), fetchImpl: (url, options) => {
    if (url.endsWith('/health') && ++attempts <= 2) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    return fetch(url, options);
  } }, ({ error, output }) => { assert.equal(error, undefined, output); assert.equal(attempts, 3); });
});

test('startup that never becomes ready fails within a bounded deadline', async () => {
  let now = 0, attempts = 0;
  await postCheckFixture({ env: { POST_DEPLOY_READY_TIMEOUT_MS: '80' }, clock: { now: () => now },
    fetchImpl: async () => {
      attempts++; now += 40;
      return { status: 503, ok: false, text: async () => JSON.stringify({ error: { code: 'SERVICE_STARTING' } }) };
    },
  }, ({ error, output }) => {
    assert.equal(error?.exitCode, 1, output); assert.equal(attempts, 2);
    assert.equal(now, 80); assert.match(output, /readiness.*deadline/i);
  });
});

test('explicit database health failure is terminal instead of being mistaken for slow initialization', async () => {
  await postCheckFixture({ health: (req, res) => respondJson(res, 503, { status: 'error', database: { status: 'error' } }) }, ({ error, counts, output }) => {
    assert.equal(error?.exitCode, 1, output); assert.equal(counts.get('/health'), 1);
    assert.equal(counts.get('/api/auth/session'), undefined, 'do not continue acceptance after terminal health failure');
  });
});

test('readiness timeout covers an HTTP body that stalls after successful headers', { timeout: 5000 }, async () => {
  let now = 0, bodyReads = 0, watchdogFired = false;
  await postCheckFixture({ env: { POST_DEPLOY_READY_TIMEOUT_MS: '80', POST_DEPLOY_TIMEOUT_MS: '20' }, clock: { now: () => now },
    fetchImpl: async (url, { signal }) => ({ status: 200, ok: true, text: () => new Promise((resolve, reject) => {
      bodyReads++;
      const watchdog = setTimeout(() => { watchdogFired = true; reject(new Error('body fixture watchdog')); }, 2000);
      signal.addEventListener('abort', () => {
        clearTimeout(watchdog); now += 20;
        reject(Object.assign(new Error('body aborted'), { name: 'AbortError' }));
      }, { once: true });
    }) }),
  }, ({ error, output }) => {
    assert.equal(error?.exitCode, 1, output); assert.equal(watchdogFired, false);
    assert.equal(bodyReads, 4); assert.equal(now, 80);
  });
});

test('invalid readiness budgets fail before making a network request', async () => {
  for (const value of ['0', 'NaN', '300001']) await postCheckFixture({ env: { POST_DEPLOY_READY_TIMEOUT_MS: value }, health: (req, res) => respondJson(res, 200, goodHealth) }, ({ error, counts }) => {
    assert.ok(error); assert.equal(counts.size, 0);
  });
});


test('authentication acceptance shares the remaining readiness deadline', { timeout: 5000 }, async () => {
  let now = 0, authenticationAttempts = 0, watchdogFired = false;
  const timeouts = [];
  await postCheckFixture({
    env: { POST_DEPLOY_READY_TIMEOUT_MS: '300', POST_DEPLOY_TIMEOUT_MS: '1500' }, clock: { now: () => now },
    timers: { setTimeout: (callback, delay) => { timeouts.push(delay); return setTimeout(callback, delay); } },
    fetchImpl: async (url, { signal }) => {
      if (url.endsWith('/health')) { now = 290; return { status: 200, ok: true, text: async () => JSON.stringify(goodHealth) }; }
      assert.ok(url.endsWith('/api/auth/session')); authenticationAttempts++;
      return { status: 401, ok: false, text: () => new Promise((resolve, reject) => {
        const watchdog = setTimeout(() => { watchdogFired = true; reject(new Error('authentication fixture watchdog')); }, 1000);
        signal.addEventListener('abort', () => {
          clearTimeout(watchdog); now = 300;
          reject(Object.assign(new Error('authentication aborted'), { name: 'AbortError' }));
        }, { once: true });
      }) };
    },
  }, ({ error, output }) => {
    assert.equal(error?.exitCode, 1, output); assert.equal(authenticationAttempts, 1);
    assert.equal(watchdogFired, false); assert.deepEqual(timeouts, [300, 10]);
  });
});

for (const key of ['POST_DEPLOY_TIMEOUT_MS', 'POST_DEPLOY_READY_TIMEOUT_MS', 'POST_DEPLOY_READY_INTERVAL_MS']) {
  test(`invalid ${key} stops safe deployment before any child command or shared-data change`, async () => {
    await deploymentFixture({ env: { [key]: '0' } }, async ({ main, calls, events, current, old, database, uploads, gate, releases }) => {
      await assert.rejects(main, new RegExp(key));
      assert.deepEqual(calls, []); assert.deepEqual(events, []);
      assert.equal(fs.realpathSync(current), fs.realpathSync(old));
      assert.equal(fs.readFileSync(database, 'utf8'), 'before migration');
      assert.equal(fs.readFileSync(path.join(uploads, 'asset'), 'utf8'), 'fixture asset');
      assert.equal(fs.existsSync(gate), false); assert.deepEqual(fs.readdirSync(releases), ['previous']);
    });
  });
  test(`preflight real entry rejects invalid ${key} without touching a database`, () => {
    const root = fs.mkdtempSync(path.join(scratch, 'budget-preflight-'));
    const database = path.join(root, 'unopened.db');
    try {
      const result = cp.spawnSync(process.execPath, ['-e', "require('./scripts/load-env').loadEnvFile = () => false; require('./scripts/preflight');"], {
        cwd: api, encoding: 'utf8', timeout: 15000,
        env: { PATH: process.env.PATH, NODE_ENV: 'test', TOKIO_WORKER_THREADS: '2', DATABASE_URL: 'file:' + database, [key]: '0' },
      });
      assert.equal(result.error, undefined); assert.equal(result.signal, null);
      assert.equal(result.status, 1, result.stdout); assert.match(result.stderr, new RegExp(key));
      assert.equal(fs.existsSync(database), false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
}
