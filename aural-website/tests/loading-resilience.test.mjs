import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as Vue from 'vue'
import { createError } from 'h3'
import { createMetricReporter } from '../app/utils/performanceMetrics.js'
import { createRequestRecovery, recoveryDelay, isRequestAbort } from '../app/utils/requestRecovery.js'
import { fetchCompleteList } from '../app/utils/fetchCompleteList.js'

const read = path => fs.readFileSync(new URL(`../app/${path}`, import.meta.url), 'utf8')
const source = path => read(path).replace(/^import .*\n/gm, '').replaceAll('export const ', 'const ')
function clock() {
  let time = 0, sequence = 0
  const tasks = new Map()
  return {
    now: () => time,
    setTimer(fn, delay) { const id = ++sequence; tasks.set(id, { fn, due: time + delay }); return id },
    clearTimer(id) { tasks.delete(id) },
    get size() { return tasks.size },
    async tick(ms) {
      const end = time + ms
      while (true) {
        const task = [...tasks].sort((a, b) => a[1].due - b[1].due)[0]
        if (!task || task[1].due > end) break
        time = task[1].due; tasks.delete(task[0]); await task[1].fn()
      }
      time = end
    }
  }
}

function performanceHarness() {
  const timer = clock(), reports = [], observers = new Map(), handlers = new Map()
  let unmount
  class Observer {
    constructor(callback) { this.callback = callback; this.disconnected = false }
    observe({ type }) { observers.set(type, this) }
    disconnect() { this.disconnected = true }
  }
  const window = { PerformanceObserver: Observer, location: { pathname: '/products' },
    addEventListener: (type, fn) => handlers.set(type, fn), removeEventListener: type => handlers.delete(type) }
  const plugin = read('plugins/performance-monitor.client.js').replace(/^import .*\n/gm, '')
    .replace('export default ', '').replaceAll('import.meta.server', 'false').replaceAll('import.meta.hot', 'false')
  Function('defineNuxtPlugin', 'useAuralTrack', 'createMetricReporter', 'window', 'PerformanceObserver', plugin)(
    fn => fn({ vueApp: { onUnmount: fn => { unmount = fn } } }),
    () => ({ track: (type, payload) => reports.push({ type, ...payload }) }),
    options => createMetricReporter({ ...options, ...timer }), window, Observer)
  return { timer, reports, observers, handlers, unmount: () => unmount(),
    emit(type, entries) { observers.get(type).callback({ getEntries: () => entries }) } }
}

test('actual performance plugin ignores recent-input CLS and bounds a layout storm to latest metrics', async () => {
  const h = performanceHarness()
  for (let i = 0; i < 181; i++) h.emit('layout-shift', [{ hadRecentInput: true, value: 0.1 }])
  await h.timer.tick(15000)
  assert.equal(h.reports.length, 0)
  for (let i = 0; i < 1000; i++) h.emit('layout-shift', [{ hadRecentInput: false, value: 0.001 }])
  h.emit('largest-contentful-paint', [{ renderTime: 1200 }])
  h.emit('largest-contentful-paint', [{ renderTime: 1400 }])
  h.emit('first-input', [{ processingStart: 150, startTime: 100 }])
  h.emit('navigation', [{ responseStart: 240, requestStart: 40 }])
  await h.timer.tick(0)
  assert.equal(h.reports.length, 4)
  assert.deepEqual(h.reports.map(x => x.metadata.metric).sort(), ['CLS', 'FID', 'LCP', 'TTFB'])
  assert.ok(Math.abs(h.reports.find(x => x.metadata.metric === 'CLS').metadata.value - 1) < 1e-10)
  assert.equal(h.reports.find(x => x.metadata.metric === 'LCP').metadata.value, 1400)
  h.emit('largest-contentful-paint', [{ renderTime: 1400 }])
  h.emit('navigation', [{ responseStart: 240, requestStart: 40 }])
  await h.timer.tick(15000)
  assert.equal(h.reports.length, 4, 'unchanged metrics do not send')
  for (let i = 0; i < 1000; i++) h.emit('layout-shift', [{ hadRecentInput: false, value: 0.001 }])
  await h.timer.tick(0)
  assert.equal(h.reports.length, 5)
  h.emit('layout-shift', [{ hadRecentInput: false, value: 0.02 }])
  await h.timer.tick(14999)
  assert.equal(h.reports.length, 5, 'new measurements cannot bypass the interval')
  const onPageHide = h.handlers.get('pagehide')
  onPageHide({ persisted: true })
  assert.equal(h.reports.length, 5, 'bfcache does not add summary events')
  onPageHide({ persisted: false }); onPageHide({ persisted: false })
  assert.equal(h.reports.filter(x => x.metadata.metric === 'summary').length, 1)
  assert.ok(h.reports.at(-1).metadata.cls > 2, 'terminal summary preserves latest unsent value')
  assert.ok([...h.observers.values()].every(x => x.disconnected))
  assert.equal(h.timer.size, 0)
  h.unmount()
})

test('recovery delays honor Retry-After, avoid normal cancellation and cap automatic attempts', () => {
  assert.equal(recoveryDelay({ statusCode: 429 }, 0), 61000)
  assert.equal(recoveryDelay({ response: { status: 429, headers: new Headers({ 'Retry-After': '40' }) } }, 0), 40250)
  const wrapped = createError(Object.assign(new Error('rate limited'), { statusCode: 429, response: { status: 429, headers: new Headers({ 'Retry-After': '2' }) } }))
  assert.equal(recoveryDelay(wrapped, 0), 2250, 'Nuxt H3 wrapper retains Retry-After through cause')
  assert.equal(recoveryDelay({ response: { status: 503, headers: new Headers({ 'Retry-After': new Date(20000).toUTCString() }) } }, 0, 5000), 15250)
  assert.equal(recoveryDelay({ response: { status: 429, headers: new Headers({ 'Retry-After': '99999999999' }) } }, 0), null)
  assert.deepEqual([0, 1, 2, 3].map(i => recoveryDelay(new Error('network'), i)), [1500, 4000, 12000, null])
  for (const error of [{ statusCode: 403 }, { statusCode: 404 }, { name: 'AbortError' }, { cause: { name: 'AbortError' } }]) {
    assert.equal(recoveryDelay(error, 0), null)
  }
})

test('actual recovery controller stops after three failures, dedupes and permits manual recovery', async () => {
  const timer = clock()
  let error = new Error('network'), calls = 0, pending = false, enabled = true, succeed = false
  const recovery = createRequestRecovery({ ...timer, getError: () => error, isPending: () => pending, enabled: () => enabled,
    refresh: async options => { assert.equal(options.dedupe, 'defer'); calls++; if (succeed) error = null } })
  recovery.sync(); recovery.sync()
  assert.equal(timer.size, 1)
  await timer.tick(100000)
  assert.equal(calls, 3); assert.equal(timer.size, 0)
  pending = true; await recovery.retry(); assert.equal(calls, 3)
  pending = false; succeed = true; await recovery.retry()
  assert.equal(calls, 4); assert.equal(error, null); assert.equal(timer.size, 0)
  error = new Error('network'); succeed = false; recovery.sync()
  enabled = false; recovery.sync(); assert.equal(timer.size, 0)
  await timer.tick(100000); assert.equal(calls, 4)
  enabled = true; recovery.sync(); assert.equal(timer.size, 1)
  recovery.stop(); await timer.tick(100000); assert.equal(calls, 4)
})

test('actual page connection ownership rejects stale outgoing-page updates and clears on exit', async () => {
  const states = new Map()
  const useState = (key, init) => { if (!states.has(key)) states.set(key, Vue.ref(init())); return states.get(key) }
  const usePageConnection = Function('computed', 'watch', 'onScopeDispose', 'useState', `${source('composables/usePageConnection.js')}; return usePageConnection`)(Vue.computed, Vue.watch, Vue.onScopeDispose, useState)
  const home = Vue.effectScope(), products = Vue.effectScope(), homeError = Vue.ref(new Error('home')), productError = Vue.ref(null)
  home.run(() => usePageConnection([homeError])); assert.equal(states.get('global-offline').value, true)
  products.run(() => usePageConnection([productError])); assert.equal(states.get('global-offline').value, false)
  homeError.value = new Error('late home'); await Vue.nextTick(); assert.equal(states.get('global-offline').value, false)
  productError.value = new Error('product'); await Vue.nextTick(); assert.equal(states.get('global-offline').value, true)
  home.stop(); assert.equal(states.get('global-offline').value, true)
  productError.value = null; await Vue.nextTick(); assert.equal(states.get('global-offline').value, false)
  productError.value = new Error('product'); await Vue.nextTick(); products.stop()
  assert.equal(states.get('global-offline').value, false)
})

test('actual API keys share SSR/client payload identity while preserving query, detail and preview isolation', async () => {
  const config = { apiInternalBase: 'http://127.0.0.1:1337', public: { apiBase: 'https://preview.example/api-proxy' } }
  const captured = [], payload = new Map()
  let requests = 0
  const fetcher = async () => { requests++; return { data: [{ id: 1 }], meta: { pagination: { pageCount: 1 } } } }
  const h = Function('fetchCompleteList', 'computed', 'unref', 'useRuntimeConfig', 'useFetch', 'useAsyncData', '$fetch', `${source('composables/useAuralApi.js')};return {useApiRequestKey,useAuralFetch,useCompleteApiList}`)(
    fetchCompleteList, Vue.computed, Vue.unref, () => config, (url, options) => { captured.push(options); return options },
    async (key, fn) => { const id = Vue.unref(key); if (!payload.has(id)) payload.set(id, await fn()); return payload.get(id) }, fetcher)
  const internal = path => `${config.apiInternalBase}${path}`, publicUrl = path => `${config.public.apiBase}${path}`
  assert.equal(h.useApiRequestKey(internal('/api/products?series=1')).value, h.useApiRequestKey(publicUrl('/api/products?series=1')).value)
  await h.useCompleteApiList(Vue.ref(internal('/api/products')), { key: 'products' })
  await h.useCompleteApiList(Vue.ref(publicUrl('/api/products')), { key: 'products' })
  assert.equal(requests, 1, 'hydration consumes the SSR payload without another GET')
  const identities = ['/api/products', '/api/products?series=1', '/api/products?series=2', '/api/products?previewToken=one', '/api/products?previewToken=two', '/api/products/by-key/one', '/api/products/by-key/two'].map(path => h.useApiRequestKey(publicUrl(path)).value)
  assert.equal(new Set(identities).size, identities.length)
  assert.match(h.useApiRequestKey('https://unrelated.example/api/products').value, /unrelated\.example/)
  h.useAuralFetch(Vue.ref(internal('/api/config')), { key: 'config' })
  h.useAuralFetch(Vue.ref(publicUrl('/api/config')), { key: 'config' })
  assert.equal(captured[0].key.value, captured[1].key.value)
  assert.equal(captured[0].retry, 0); assert.equal(captured[0].timeout, 15000)
})

test('actual detail URL guard disables requests while Nuxt route params leave the page', () => {
  const page = read('pages/products/[id].vue'), route = Vue.reactive({ params: { id: 'grand piano' } })
  const snippet = page.slice(page.indexOf('const requestedProductKey ='), page.indexOf('\nconst { retry: retryProduct'))
  let captured
  const execute = snippet.replace(/^const \{data: contactConfig\}.*$/m, '').replace('await useAuralFetch', 'useAuralFetch')
  Function('computed', 'route', 'useApiUrl', 'useAuralFetch', `${execute};return detailUrl`)(Vue.computed, route, fn => Vue.computed(() => `http://fixture${fn()}`), (url, options) => { captured = { url, options }; return {} })
  assert.equal(captured.options.enabled.value, true)
  assert.match(captured.url.value, /grand%20piano/)
  route.params.id = undefined
  assert.equal(captured.options.enabled.value, false)
  assert.doesNotMatch(captured.url.value, /undefined/)
  route.params.id = 'next'
  assert.equal(captured.options.enabled.value, true)
  assert.match(captured.url.value, /\/next$/)
})

test('actual error monitor captures failed assets but does not report normal fetch cancellation', async () => {
  const events = [], listeners = new Map(), rejected = Object.assign(new Error('cancel'), { name: 'AbortError' })
  const window = { addEventListener: (name, fn, capture) => listeners.set(name, { fn, capture }), setTimeout: () => 1,
    fetch: async () => { throw rejected } }
  const plugin = read('plugins/error-monitor.client.js').replace(/^import .*\n/gm, '').replace('export default ', '')
  Function('defineNuxtPlugin', 'useAuralTrack', 'usePublicApiBase', 'useRoute', 'useState', 'window', 'performance', 'isRequestAbort', plugin)(
    fn => fn({ vueApp: { config: {} } }), () => ({ track: (...args) => events.push(args) }), () => Vue.ref('http://fixture'), () => ({ fullPath: '/' }), () => Vue.ref({}), window, { now: () => 0 }, isRequestAbort)
  await assert.rejects(window.fetch('http://fixture/api/products'), { name: 'AbortError' })
  listeners.get('unhandledrejection').fn({ reason: rejected })
  assert.equal(events.length, 0)
  assert.equal(listeners.get('error').capture, true)
  listeners.get('error').fn({ target: { tagName: 'IMG', currentSrc: 'http://fixture/uploads/failed.jpg' } })
  assert.equal(events[0][0], 'resource_error')
  assert.equal(events[0][1].entityType, 'img')
})
