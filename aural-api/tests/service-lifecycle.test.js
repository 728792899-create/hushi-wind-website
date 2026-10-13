const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createWorkTracker } = require('../lib/work-tracker');
const { createServiceLifecycle, shutdownTimeout } = require('../lib/service-lifecycle');

const gate = () => { let release; const promise = new Promise(r => { release = r; }); return { promise, release }; };
const request = (server) => new Promise((resolve, reject) => {
  http.get(`http://127.0.0.1:${server.address().port}`, res => {
    let body = ''; res.on('data', chunk => { body += chunk; });
    res.on('end', () => resolve({ status: res.statusCode, body }));
  }).on('error', reject);
});
function fixture(options = {}) {
  const events = [], work = createWorkTracker();
  const service = createServiceLifecycle({ app: (_req, res) => res.end('ok'), work,
    initialize: async () => { events.push('initialize'); },
    startBackground: () => { events.push('background'); return () => events.push('stop-background'); },
    disconnect: async () => { events.push('disconnect'); },
    port: 0, host: '127.0.0.1', report: e => events.push(e), ...options });
  return { service, events, work };
}

test('listener conflict never initializes or starts background work and disconnects', async () => {
  const occupied = http.createServer();
  await new Promise(resolve => occupied.listen(0, '127.0.0.1', resolve));
  try {
    const { service, events } = fixture({ port: occupied.address().port });
    await assert.rejects(service.start(), { code: 'EADDRINUSE' });
    assert.deepEqual(events, ['draining', 'disconnect', 'stopped']);
  } finally { await new Promise(resolve => occupied.close(resolve)); }
});

test('initialization blocks admission and a stop during initialization never starts producers', async () => {
  const entered = gate(), held = gate();
  const { service, events } = fixture({ initialize: async () => { entered.release(); await held.promise; } });
  const ready = service.start();
  await entered.promise;
  assert.equal((await request(service.server)).status, 503);
  const stopped = service.stop();
  assert.equal(service.stop(), stopped);
  assert.ok(!events.includes('disconnect'));
  held.release(); await ready; await stopped;
  assert.ok(!events.includes('background'));
  assert.equal(events.at(-1), 'stopped');
});

test('disconnected HTTP handler and its response-following task drain before disconnect', async () => {
  const entered = gate(), held = gate(), child = gate();
  const { service, work, events } = fixture({ app: (_req, res) => {
    work.track('handler', async () => {
      entered.release(); await held.promise;
      work.track('after-commit', () => child.promise);
      res.end('done');
    });
  } });
  await service.start();
  const req = http.get(`http://127.0.0.1:${service.server.address().port}`);
  req.on('error', () => {});
  await entered.promise;
  req.destroy();
  const stopped = service.stop();
  held.release();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(!events.includes('disconnect'));
  child.release(); await stopped;
  assert.deepEqual(events.slice(-3), ['stop-background', 'disconnect', 'stopped']);
});

test('deadline is a failed drain, not a disconnect while work is still active', async () => {
  const held = gate();
  const { service, work, events } = fixture({ timeoutMs: 15 });
  await service.start();
  work.track('held', () => held.promise);
  await assert.rejects(service.stop(), { code: 'SHUTDOWN_TIMEOUT' });
  assert.equal(service.state, 'failed');
  assert.ok(!events.includes('disconnect'));
  held.release(); await work.drain();
});

test('cleanup failure still attempts drain and database disconnect', async () => {
  const { service, events } = fixture({ startBackground: () => () => { throw new Error('stop failed'); } });
  await service.start();
  await assert.rejects(service.stop(), /stop failed/);
  assert.ok(events.includes('disconnect'));
  assert.equal(service.state, 'failed');
  assert.throws(() => shutdownTimeout('NaN'));
  assert.throws(() => shutdownTimeout(0));
});

test('safe deployment rejects PM2 budgets shorter than both old and new API drain windows', () => {
  const cp = require('node:child_process'), before = cp.spawnSync;
  let killTimeout = 1500, runningBudget = 60000;
  const env = { API_PM2_NAME: 'api', WEB_PM2_NAME: 'web' };
  try {
    cp.spawnSync = () => ({ status: 0, stdout: JSON.stringify(['api', 'web'].map(name => ({ name,
      pm2_env: { pm_exec_path: '/fixture/current/server.js', pm_cwd: '/fixture/current',
        kill_timeout: killTimeout, SHUTDOWN_TIMEOUT_MS: runningBudget } }))) });
    delete require.cache[require.resolve('../scripts/safe-deploy')];
    const { validateProcessLinks } = require('../scripts/safe-deploy');
    assert.throws(() => validateProcessLinks('/fixture/current', env), /kill_timeout/);
    killTimeout = 65000;
    runningBudget = undefined;
    assert.throws(() => validateProcessLinks('/fixture/current', env), /explicitly record SHUTDOWN_TIMEOUT_MS/);
    runningBudget = 60000;
    validateProcessLinks('/fixture/current', env);
    runningBudget = 120000;
    assert.throws(() => validateProcessLinks('/fixture/current', env), /125000/);
    killTimeout = 125000;
    validateProcessLinks('/fixture/current', env);
  } finally { cp.spawnSync = before; delete require.cache[require.resolve('../scripts/safe-deploy')]; }
});
