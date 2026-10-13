const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createUnitOfWork } = require('../lib/unit-of-work');
const { createWorkTracker } = require('../lib/work-tracker');
const { whenSqliteIdle } = require('../lib/sqlite-transaction');

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('tracked handlers keep committed tasks alive even when the response throws after client disconnect', async () => {
  const work = createWorkTracker(), callbackGate = deferred(), callbackEntered = deferred(), events = [];
  const db = { async $transaction(action) { const result = await action({}); events.push('commit'); return result; } };
  const unit = createUnitOfWork(db, { work });
  const disconnected = new Error('fixture client disconnected');
  const response = {
    status() { return this; },
    json() {
      assert.equal(work.snapshot().byLabel.afterCommit, 1, 'child registered before response transmission');
      throw disconnected;
    },
  };
  await unit.handler(async (_req, res) => {
    unit.afterCommit(async () => {
      assert.deepEqual(events, ['commit']);
      callbackEntered.resolve();
      await callbackGate.promise;
      events.push('afterCommit');
    });
    res.json({ ok: true });
  })({}, response, (error) => { assert.equal(error, disconnected); });
  await callbackEntered.promise;
  let drained = false;
  const waiting = work.drain().then(() => { drained = true; });
  await settle();
  assert.equal(drained, false);
  callbackGate.resolve();
  await waiting;
  assert.deepEqual(events, ['commit', 'afterCommit']);
  assert.equal(work.snapshot().total, 0);
});

test('tracked transactions drain nested afterCommit chains and never execute rolled-back tasks', async (t) => {
  const work = createWorkTracker(), entered = deferred(), gate = deferred(), events = [];
  const warnings = [];
  t.mock.method(console, 'warn', (...args) => warnings.push(args));
  const db = { async $transaction(action) {
    try { const value = await action({}); events.push('commit'); return value; }
    catch (error) { events.push('rollback'); throw error; }
  } };
  const unit = createUnitOfWork(db, { work });
  await unit.transaction(async () => {
    await unit.transaction(async () => unit.afterCommit(() => {
      unit.afterCommit(async () => { entered.resolve(); await gate.promise; events.push('child'); });
      throw new Error('expected afterCommit failure');
    }));
  });
  await entered.promise;
  let drained = false;
  const waiting = work.drain().then(() => { drained = true; });
  await settle();
  assert.equal(drained, false);
  gate.resolve();
  await waiting;
  assert.deepEqual(events, ['commit', 'child']);
  assert.equal(warnings.length, 1);
  const original = new Error('fixture rollback');
  await assert.rejects(unit.transaction(async () => {
    unit.afterCommit(() => assert.fail('rolled-back work must never start'));
    throw original;
  }), (error) => error === original);
  await work.drain();
  assert.deepEqual(events, ['commit', 'child', 'rollback']);
});

test('standalone model and raw writes are tracked while waiting behind an accepted transaction', async () => {
  const work = createWorkTracker(), entered = deferred(), gate = deferred();
  const completed = [];
  const tx = {
    fixture: { findMany: async () => [], create: async (value) => { completed.push('model'); return value; } },
    $executeRaw: async () => { completed.push('raw'); return 1; },
  };
  const db = { ...tx, $transaction: (action) => action(tx) };
  const unit = createUnitOfWork(db, { work });
  const outer = unit.transaction(async () => { entered.resolve(); await gate.promise; });
  await entered.promise;
  const savedCreate = unit.prisma.fixture.create;
  const model = savedCreate({ fixture: true });
  const raw = unit.prisma.$executeRaw`fixture`;
  assert.deepEqual(work.snapshot(), { total: 3, byLabel: { transaction: 1, 'sqlite-write': 2 } });
  let drained = false;
  const waiting = work.drain().then(() => { drained = true; });
  await settle();
  assert.equal(drained, false);
  assert.deepEqual(completed, []);
  gate.resolve();
  await Promise.all([outer, model, raw, waiting]);
  await whenSqliteIdle();
  assert.deepEqual(completed, ['model', 'raw']);
  assert.equal(work.snapshot().total, 0);
});

test('error forwarding is inside tracked handler work and may register cleanup after rollback', async () => {
  const work = createWorkTracker(), gate = deferred();
  const unit = createUnitOfWork({ $transaction: (action) => action({}) }, { work });
  const original = new Error('failed handler');
  await unit.handler(async () => { throw original; })({}, {}, (error) => {
    assert.equal(error, original);
    assert.equal(work.snapshot().byLabel['http-handler'], 1);
    work.track('error-log', () => gate.promise);
  });
  assert.deepEqual(work.snapshot(), { total: 1, byLabel: { 'error-log': 1 } });
  gate.resolve();
  await work.drain();
});
