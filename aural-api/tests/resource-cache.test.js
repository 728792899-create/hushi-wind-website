const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createResourceCache, createFileRecordCache, mapLimited } = require('../lib/resource-cache');

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));

test('inventory cache merges cold readers and expires without serving a stale generation', async () => {
  let now = 0, calls = 0;
  const gate = deferred();
  const cache = createResourceCache({ ttl: 30, now: () => now, load: async () => { calls++; await gate.promise; return calls; } });
  const readers = [cache.get(), cache.get(), cache.get()];
  await tick(); assert.equal(calls, 1); gate.resolve();
  assert.deepEqual((await Promise.all(readers)).map(r => r.value), [1, 1, 1]);
  assert.equal((await cache.get()).status, 'hit');
  now = 31; assert.equal((await cache.get()).value, 2);
  cache.invalidate(); assert.equal((await cache.get()).value, 3);
});

test('a write during rebuild never publishes the old snapshot as current', async () => {
  const gates = [deferred(), deferred()]; let calls = 0;
  const cache = createResourceCache({ ttl: 30, load: async () => { const n = calls++; await gates[n].promise; return n; } });
  const first = cache.get(); await tick(); cache.invalidate(); const afterWrite = cache.get();
  gates[0].resolve(); await tick(); assert.equal(calls, 2); gates[1].resolve();
  assert.equal((await first).value, 1); assert.equal((await afterWrite).value, 1);
  assert.equal((await cache.get()).value, 1);
});

test('continuous writes stop at two attempts and later reads can recover', async () => {
  let calls = 0, racing = true;
  const cache = createResourceCache({ ttl: 30, load: async () => { calls++; if (racing) cache.invalidate(); return calls; } });
  await assert.rejects(cache.get(), { code: 'RESOURCE_INVENTORY_CHANGED', status: 503 });
  assert.equal(calls, 2); racing = false;
  assert.equal((await cache.get()).value, 3);
});

test('failed rebuilds release single flight and retry a changed history only within the bound', async () => {
  let calls = 0;
  const cache = createResourceCache({ ttl: 30, load: async () => {
    if (++calls === 1) throw Object.assign(new Error('disk failed'), { code: 'EIO' });
    if (calls === 2) throw Object.assign(new Error('history moved'), { code: 'RESOURCE_INVENTORY_CHANGED' });
    return calls;
  } });
  await assert.rejects(cache.get(), { code: 'EIO' });
  assert.equal((await cache.get()).value, 3);
});

test('file metadata reuse requires unchanged identity, size and timestamps', async () => {
  let reads = 0, info = { dev: 1, ino: 2, size: 10, mtimeMs: 1, ctimeMs: 1 };
  const cache = createFileRecordCache({ stat: async () => ({ ...info }), read: async (_file, stat) => ({ read: ++reads, size: stat.size }) });
  assert.equal((await cache.get('/fixture')).read, 1);
  assert.equal((await cache.get('/fixture')).read, 1);
  info.size++; assert.equal((await cache.get('/fixture')).read, 2);
  info.ino++; assert.equal((await cache.get('/fixture')).read, 3);
  info.ctimeMs++; assert.equal((await cache.get('/fixture')).read, 4);
  cache.retain([]); assert.equal((await cache.get('/fixture')).read, 5);
});

test('limited file work preserves order, caps concurrency and drains peers before rejection', async () => {
  let active = 0, peak = 0, ended = 0;
  const results = await mapLimited([1, 2, 3, 4, 5], 2, async n => { active++; peak = Math.max(peak, active); await tick(); active--; return n * 2; });
  assert.deepEqual(results, [2, 4, 6, 8, 10]); assert.equal(peak, 2);
  await assert.rejects(mapLimited([1, 2], 2, async n => { if (n === 1) throw new Error('failed'); await tick(); ended++; }), /failed/);
  assert.equal(ended, 1);
});
