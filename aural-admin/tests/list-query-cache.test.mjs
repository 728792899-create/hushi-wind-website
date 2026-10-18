import test from 'node:test'
import assert from 'node:assert/strict'
import { createQueryCache } from '../src/lib/queryCache.js'

const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => {
  let resolve, reject
  const promise = new Promise((a, b) => { resolve = a; reject = b })
  return { promise, resolve, reject }
}
const cancelled = error => error.code === 'ERR_CANCELED'

test('same list queries share transport and fresh snapshots are isolated copies with a finite lifetime', async () => {
  let calls = 0, time = 100
  const cache = createQueryCache({ now: () => time, ttlMs: 15, getScope: () => 'owner', read: async () => ({ rows: [{ id: ++calls }] }) })
  const [a, b] = await Promise.all([cache.get('/list', { page: 1, size: 24 }), cache.get('/list', { size: 24, page: 1 })])
  assert.equal(calls, 1)
  a.rows[0].id = 900
  assert.equal(b.rows[0].id, 1)
  assert.equal((await cache.get('/list', { page: 1, size: 24 })).rows[0].id, 1)
  time = 115
  assert.equal((await cache.get('/list', { page: 1, size: 24 })).rows[0].id, 2)
  await cache.get('/list', { page: 1, size: 24 }, { force: true })
  assert.equal(calls, 3)
})

test('cancelling one subscriber preserves shared work, cancelling the last aborts transport', async () => {
  const requests = []
  const cache = createQueryCache({ getScope: () => 'owner', read: (_, __, signal) => {
    const request = { ...deferred(), signal }; requests.push(request); return request.promise
  } })
  const first = new AbortController(), second = new AbortController()
  const a = cache.get('/list', {}, { signal: first.signal }), b = cache.get('/list', {}, { signal: second.signal })
  const rejectedA = assert.rejects(a, cancelled)
  await tick(); first.abort(); await rejectedA
  assert.equal(requests.length, 1)
  assert.equal(requests[0].signal.aborted, false)
  requests[0].resolve({ value: 1 })
  assert.deepEqual(await b, { value: 1 })
  const last = new AbortController()
  const c = cache.get('/list', { page: 2 }, { signal: last.signal })
  const rejectedC = assert.rejects(c, cancelled)
  await tick(); last.abort(); await rejectedC
  assert.equal(requests[1].signal.aborted, true)
  requests[1].resolve({ value: 2 })
  await tick()
})

test('invalidation cancels waiters and late successful transport cannot repopulate the cache', async () => {
  const requests = []
  const cache = createQueryCache({ getScope: () => 'owner', read: () => {
    const request = deferred(); requests.push(request); return request.promise
  } })
  const first = cache.get('/list'), rejected = assert.rejects(first, cancelled)
  await tick(); cache.clear(); await rejected
  const second = cache.get('/list')
  await tick(); requests[0].resolve({ revision: 1 }); requests[1].resolve({ revision: 2 })
  assert.deepEqual(await second, { revision: 2 })
  assert.deepEqual(await cache.get('/list'), { revision: 2 })
  assert.equal(requests.length, 2)
})

test('owner or permission scope changes isolate both cached data and in-flight results', async () => {
  let owner = 'account-1:editor', calls = 0
  const slow = deferred()
  const cache = createQueryCache({ getScope: () => owner, read: async () => ++calls === 1 ? slow.promise : { owner } })
  const first = cache.get('/list'), rejected = assert.rejects(first, cancelled)
  await tick(); owner = 'account-1:readonly'
  const second = cache.get('/list'); await rejected
  slow.resolve({ owner: 'account-1:editor' })
  assert.deepEqual(await second, { owner: 'account-1:readonly' })
  owner = 'account-2:editor'
  assert.deepEqual(await cache.get('/list'), { owner })
  assert.equal(calls, 3)
})

test('a scope change before transport returns rejects private results even without a newer query', async () => {
  let owner = 'owner'
  const slow = deferred(), cache = createQueryCache({ getScope: () => owner, read: () => slow.promise })
  const pending = cache.get('/list'), rejected = assert.rejects(pending, cancelled)
  await tick(); owner = ''; slow.resolve({ private: true }); await rejected
})

test('failed reads are not cached, cache is bounded, and queries never share different filters', async () => {
  let calls = 0
  const cache = createQueryCache({ maxEntries: 2, getScope: () => 'owner', read: async (_, params) => {
    calls++; if (calls === 1) throw new Error('offline'); return params
  } })
  await assert.rejects(cache.get('/list', { page: 1 }), /offline/)
  assert.deepEqual(await cache.get('/list', { page: 1 }), { page: 1 })
  await cache.get('/list', { page: 2 }); await cache.get('/list', { page: 3 })
  await cache.get('/list', { page: 1 })
  assert.equal(calls, 5)
})

test('no authenticated scope never stores reusable data and pre-cancelled reads do not start', async () => {
  let calls = 0
  const cache = createQueryCache({ getScope: () => '', read: async () => ({ id: ++calls }) })
  await cache.get('/list'); await cache.get('/list')
  const abort = new AbortController(); abort.abort()
  await assert.rejects(cache.get('/list', {}, { signal: abort.signal }), cancelled)
  assert.equal(calls, 2)
})
