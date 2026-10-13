const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAuditScheduler, auditVerifyInterval } = require('../lib/scheduled-audit');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const result = { ok: true, logCount: 1200, baselineCount: 100, entryCount: 1100 };
function fixture() {
  const rows = [], alerts = [];
  let time = 100000, paused = false, calls = 0;
  const db = { maintenanceRun: {
    findFirst: async () => rows.at(-1),
    create: async ({ data }) => { const row = { id: rows.length + 1, ...data }; rows.push(row); return row; },
    update: async ({ where, data }) => Object.assign(rows.find(r => r.id === where.id), data),
  } };
  const options = { intervalMs: 1000, now: () => time, isPaused: () => paused,
    verify: async () => { calls++; return result; }, onFailure: async p => { alerts.push(p); } };
  return { db, rows, alerts, options, advance: () => { time += 1000; }, pause: v => { paused = v; }, get calls() { return calls; } };
}

test('periodic verification validates configuration without silently changing the chosen cadence', () => {
  assert.equal(auditVerifyInterval(), 86400000);
  assert.equal(auditVerifyInterval('1000'), 1000);
  for (const value of ['', 0, 999, -1, 1.5, 'no', Infinity, 604800001])
    assert.throws(() => auditVerifyInterval(value), /AUDIT_VERIFY_INTERVAL_MS/);
});

test('completed attempts persist their cadence across restarts and interrupted attempts are not treated as passes', async () => {
  const f = fixture();
  const make = () => createAuditScheduler(f.db, f.options);
  assert.equal((await make().run()).logCount, 1200);
  assert.equal(f.rows[0].status, 'success');
  assert.match(f.rows[0].details, /1200/);
  assert.deepEqual(await make().run(), { skipped: true });
  f.advance(); await make().run();
  assert.equal(f.calls, 2);
  f.rows.push({ id: 3, task: 'scheduled-audit', status: 'running', createdAt: new Date(101000) });
  await make().run();
  assert.equal(f.rows[2].status, 'running');
  assert.equal(f.rows.at(-1).status, 'success');
});

test('overlap and deployment pause skip new roots, while accepted verification completes its result', async () => {
  const f = fixture(), entered = deferred(), release = deferred();
  f.options.verify = async () => { entered.resolve(); await release.promise; return result; };
  const scheduler = createAuditScheduler(f.db, f.options);
  f.pause(true); assert.deepEqual(await scheduler.run(), { skipped: true });
  assert.equal(f.rows.length, 0);
  f.pause(false); const first = scheduler.run(); await entered.promise;
  assert.equal(f.rows[0].status, 'running');
  assert.deepEqual(await scheduler.run(), { skipped: true });
  f.pause(true); release.resolve(); await first;
  assert.equal(f.rows[0].status, 'success');
});

test('a failed check removes success, persists only fixed diagnostics, alerts and releases the busy guard', async () => {
  const f = fixture(), error = Object.assign(new Error('/private/path customer secret'), { code: 'AUDIT_INTEGRITY_FAILED' });
  let failed = true;
  f.options.verify = async () => { if (failed) throw error; return result; };
  const scheduler = createAuditScheduler(f.db, f.options);
  await assert.rejects(scheduler.run(), e => e === error);
  assert.equal(f.rows[0].status, 'failed');
  assert.equal(f.alerts.length, 1);
  assert.ok(!JSON.stringify([f.rows, f.alerts]).includes('secret'));
  assert.deepEqual(await scheduler.run(), { skipped: true });
  f.advance(); failed = false; await scheduler.run();
  assert.equal(f.rows.at(-1).status, 'success');
});

test('result and alert persistence failures do not mask the original check error or leak an old pass', async () => {
  const f = fixture(), error = new Error('original');
  f.options.verify = async () => { throw error; };
  f.options.onFailure = async () => { throw new Error('alert unavailable'); };
  f.db.maintenanceRun.update = async () => { throw new Error('result unavailable'); };
  const scheduler = createAuditScheduler(f.db, f.options);
  await assert.rejects(scheduler.run(), e => e === error);
  assert.equal(f.rows.at(-1).status, 'running');
  await assert.rejects(scheduler.run(), e => e === error);
  assert.equal(f.rows.length, 2);
});

test('a verification pass whose persistence fails is reported as failure, never returned as success', async () => {
  const f = fixture(), error = new Error('write unavailable');
  const update = f.db.maintenanceRun.update;
  f.db.maintenanceRun.update = async (args) => { if (args.data.status === 'success') throw error; return update(args); };
  await assert.rejects(createAuditScheduler(f.db, f.options).run(), e => e === error);
  assert.equal(f.rows[0].status, 'failed');
  assert.equal(f.alerts.length, 1);
});
