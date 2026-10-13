const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createWorkTracker } = require('../lib/work-tracker');

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('begin registers immediately, release is idempotent and snapshots cannot mutate the tracker', async () => {
  const work = createWorkTracker();
  const first = work.begin('http'), second = work.begin('http'), file = work.begin('file');
  assert.deepEqual(work.snapshot(), { total: 3, byLabel: { http: 2, file: 1 } });
  const snapshot = work.snapshot();
  snapshot.byLabel.http = 100;
  first(); first(); file();
  assert.deepEqual(work.snapshot(), { total: 1, byLabel: { http: 1 } });
  let drained = false;
  const waiting = work.drain().then(() => { drained = true; });
  await settle();
  assert.equal(drained, false);
  second();
  await waiting;
  assert.deepEqual(work.snapshot(), { total: 0, byLabel: {} });
});

test('track registers before action and preserves synchronous and asynchronous results and errors without orphan rejections', async (t) => {
  const work = createWorkTracker(), unhandled = [];
  const observer = (error) => unhandled.push(error);
  process.on('unhandledRejection', observer);
  t.after(() => process.off('unhandledRejection', observer));
  const result = { fixture: true };
  assert.equal(await work.track('result', () => {
    assert.deepEqual(work.snapshot(), { total: 1, byLabel: { result: 1 } });
    return result;
  }), result);
  for (const asynchronous of [false, true]) {
    const original = new Error('fixture original error');
    const failed = work.track('failure', () => {
      if (asynchronous) return Promise.reject(original);
      throw original;
    });
    await assert.rejects(failed, (error) => error === original);
  }
  // Detached tracked work is observed even if the caller relies only on drain.
  work.track('detached-failure', () => Promise.reject(new Error('detached fixture')));
  await work.drain();
  await settle();
  assert.deepEqual(unhandled, []);
  assert.deepEqual(work.snapshot(), { total: 0, byLabel: {} });
});

test('drain includes child tasks registered while the original parent is completing', async () => {
  const work = createWorkTracker(), parentGate = deferred(), childGate = deferred(), childEntered = deferred();
  const parent = work.track('parent', async () => {
    await parentGate.promise;
    work.track('child', async () => { childEntered.resolve(); await childGate.promise; });
  });
  let drained = false;
  const waiting = work.drain().then(() => { drained = true; });
  parentGate.resolve();
  await parent;
  await childEntered.promise;
  await settle();
  assert.equal(drained, false);
  assert.deepEqual(work.snapshot(), { total: 1, byLabel: { child: 1 } });
  childGate.resolve();
  await waiting;
  assert.equal(work.snapshot().total, 0);
});

test('drain rechecks work registered before an idle notification is observed', async () => {
  const work = createWorkTracker();
  const first = work.begin('first');
  let drained = false;
  const waiting = work.drain().then(() => { drained = true; });
  first();
  const continuation = work.begin('continuation');
  await settle();
  assert.equal(drained, false);
  continuation();
  await waiting;
  assert.equal(drained, true);
});
