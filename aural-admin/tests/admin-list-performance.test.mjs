import test, { before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { createSSRApp, ref } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createRouter, createMemoryHistory, matchedRouteKey } from 'vue-router'

let server, auth, uploadRequest
const storage = new Map(), listeners = new Map()
const token = (extra = {}) => Buffer.from(JSON.stringify({ uid: 7, tv: 1, auth: 1000, exp: Date.now() + 60000, ...extra })).toString('base64url') + '.fixture'
const user = (extra = {}) => ({ id: 7, role: 'editor', status: 'active', permissions: ['products:read', 'resources:read'], ...extra })
const tick = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => {
  let resolve, reject
  const promise = new Promise((a, b) => { resolve = a; reject = b })
  return { promise, resolve, reject }
}
const response = (config, data) => ({ data, status: 200, statusText: 'OK', headers: {}, config })
const resourceData = (id = 'one') => ({ uploads: [{ url: `/uploads/${id}.jpg`, name: id }], categories: [], meta: { pagination: { total: 1, page: 1, pageSize: 24 } } })
const productData = { data: [{ id: 7, attributes: { title: 'Fixture product' } }], meta: { pagination: { total: 1, page: 1, pageSize: 20 } } }
before(async () => {
  globalThis.window = {
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener() {}, dispatchEvent() {},
    setTimeout, clearTimeout,
  }
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
  auth = await server.ssrLoadModule('/src/lib/api.js')
  ;({ uploadRequest } = await server.ssrLoadModule('/src/lib/uploadRequest.js'))
})
beforeEach(() => {
  auth.clearToken(); storage.clear(); auth.setToken(token()); auth.setCurrentUser(user())
})
after(async () => { await server?.close(); delete globalThis.window; delete globalThis.XMLHttpRequest })
async function setup(name, path) {
  const file = name === 'MediaPicker' ? `/src/components/${name}.vue` : `/src/views/${name}View.vue`
  const { default: Component } = await server.ssrLoadModule(file)
  let vm
  const app = createSSRApp({ setup() { vm = Component.setup({}, { expose() {}, emit() {} }); return () => null } })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path, component: { render: () => null } }] })
  app.provide(matchedRouteKey, ref({ leaveGuards: new Set(), updateGuards: new Set() }))
  app.use(router); await router.push(path); await renderToString(app)
  return vm
}

test('only approved content lists cache; ordinary token renewal retains the same owner scope', async () => {
  let calls = 0
  auth.api.defaults.adapter = async config => response(config, { id: ++calls })
  await auth.readList('/api/products')
  auth.setToken(token({ iat: 2000 })); auth.setCurrentUser(user({ displayName: 'Updated display name' }))
  listeners.get('storage')({ key: auth.AUTH_KEY })
  listeners.get('storage')({ key: auth.USER_KEY })
  assert.equal((await auth.readList('/api/products')).data.id, 1)
  await assert.rejects(auth.readList('/api/inquiries'), /不支持列表缓存/)
  await assert.rejects(auth.readList('/api/auth/session'), /不支持列表缓存/)
  assert.equal(calls, 1)
})

test('permissions, token version, login owner and cross-tab changes invalidate snapshots', async () => {
  let calls = 0
  auth.api.defaults.adapter = async config => response(config, { id: ++calls })
  await auth.readList('/api/products')
  auth.setCurrentUser(user({ permissions: ['products:read'] })); await auth.readList('/api/products')
  auth.setToken(token({ tv: 2 })); await auth.readList('/api/products')
  auth.setToken(token({ auth: 2000 })); await auth.readList('/api/products')
  auth.setCurrentUser(user({ id: 8 })); await auth.readList('/api/products')
  listeners.get('storage')({ key: 'aural-admin-query-revision' }); await auth.readList('/api/products')
  assert.equal(calls, 6)
})

test('successful edits and conflicts invalidate lists; a rejected validation does not erase a useful snapshot', async () => {
  let calls = 0, failure
  auth.api.defaults.adapter = async config => {
    if (config.method === 'get') return response(config, { id: ++calls })
    if (failure) throw { config, response: { status: failure, data: { error: { code: failure === 409 ? 'RECORD_CHANGED' : 'INVALID_INPUT' } } } }
    return response(config, { saved: true })
  }
  await auth.readList('/api/products')
  failure = 422; await assert.rejects(auth.api.put('/api/products/7', {})); await auth.readList('/api/products')
  assert.equal(calls, 1)
  failure = undefined; await auth.api.put('/api/products/7', {}); await auth.readList('/api/products')
  assert.equal(calls, 2)
  failure = 409; await assert.rejects(auth.api.put('/api/products/7', {})); await auth.readList('/api/products')
  assert.equal(calls, 3)
})

test('a list permission denial stays visible instead of being mistaken for a cancelled query', async () => {
  const vm = await setup('Resources', '/resources')
  let gets = 0
  auth.api.defaults.adapter = async config => {
    gets++
    if (config.url === '/api/admin/resources') throw { config, response: { status: 403, data: { error: { code: 'FORBIDDEN', message: '没有素材读取权限' } } } }
    return response(config, { value: gets })
  }
  await auth.readList('/api/products')
  await vm.load()
  assert.equal(vm.error.value, '没有素材读取权限')
  assert.equal(vm.loading.value, false)
  assert.equal(auth.getCurrentUser().id, 7, '403 must not sign out the user')
  await auth.readList('/api/products')
  assert.equal(gets, 3, 'the denied request still invalidates older snapshots')
})

test('a successful edit restarts an active list query and its late old response cannot refill cache', async () => {
  const slow = deferred(); let gets = 0
  auth.api.defaults.adapter = config => config.method === 'get' && ++gets === 1 ? slow.promise : Promise.resolve(response(config, { revision: 2 }))
  const old = auth.readList('/api/products')
  await tick(); await auth.api.put('/api/products/7', {})
  assert.equal((await old).data.revision, 2)
  slow.resolve(response({}, { revision: 1 }))
  assert.equal((await auth.readList('/api/products')).data.revision, 2)
  await tick(); assert.equal((await auth.readList('/api/products')).data.revision, 2)
})

test('another tab editing during the first material load transparently reloads active consumers', async () => {
  const vm = await setup('Resources', '/resources'), requests = []
  auth.api.defaults.adapter = config => { const d = deferred(); requests.push({ ...d, config }); return d.promise }
  const pending = vm.load(); await tick()
  listeners.get('storage')({ key: 'aural-admin-query-revision' }); await tick()
  assert.equal(requests.length, 2)
  assert.equal(requests[0].config.signal.aborted, true)
  requests[1].resolve(response(requests[1].config, resourceData('new'))); await pending
  requests[0].resolve(response(requests[0].config, resourceData('stale'))); await tick()
  assert.equal(vm.uploads.value[0].name, 'new'); assert.equal(vm.error.value, '')
  assert.equal(vm.loading.value, false)
  assert.equal((await auth.readList('/api/admin/resources', { params: requests[1].config.params })).data.uploads[0].name, 'new')
})

test('closing a consumer or changing the login during invalidation never restarts its old query', async () => {
  const picker = await setup('MediaPicker', '/products'), requests = []
  auth.api.defaults.adapter = config => { const d = deferred(); requests.push({ ...d, config }); return d.promise }
  const pending = picker.load(); await tick()
  listeners.get('storage')({ key: 'aural-admin-query-revision' }); picker.invalidate()
  await pending; await tick()
  assert.equal(requests.length, 1)
  const ownerQuery = auth.readList('/api/products'), rejected = assert.rejects(ownerQuery, error => error.code === 'ERR_CANCELED')
  await tick(); auth.invalidateListQueries(); auth.clearToken(); await rejected; await tick()
  assert.equal(requests.length, 2)
  for (const request of requests) request.resolve(response(request.config, resourceData('stale')))
})

test('continuous invalidations are bounded and surface a retryable message instead of an empty list', async () => {
  const vm = await setup('Resources', '/resources'), requests = []
  auth.api.defaults.adapter = config => { const d = deferred(); requests.push({ ...d, config }); return d.promise }
  const pending = vm.load(); await tick()
  for (let i = 0; i < 3; i++) { auth.invalidateListQueries(); await tick() }
  await pending
  assert.equal(requests.length, 3)
  assert.equal(vm.error.value, '列表正在频繁更新，请稍后重新加载')
  assert.equal(vm.loading.value, false)
  for (const request of requests) request.resolve(response(request.config, resourceData('stale')))
})

test('XHR upload success invalidates material lists before notifying its component', async () => {
  let gets = 0, finished = false
  auth.api.defaults.adapter = async config => response(config, { id: ++gets })
  await auth.readList('/api/admin/resources')
  globalThis.XMLHttpRequest = class {
    upload = {}; status = 200; responseText = JSON.stringify({ url: '/uploads/new.jpg' })
    open() {}; setRequestHeader() {}; send() { this.onload() }
  }
  uploadRequest({ action: '/api/upload', file: new Blob(['fixture']), filename: 'file', onSuccess: () => { finished = true }, onError: error => { throw error } })
  assert.equal(finished, true)
  assert.equal((await auth.readList('/api/admin/resources')).data.id, 2)
})

test('real page setup reuses three list transports across repeated product/material navigation', async () => {
  const requests = []
  auth.api.defaults.adapter = async config => {
    requests.push(config)
    return response(config, config.url === '/api/products' ? productData : config.url === '/api/catalog' ? { categories: [], series: [] } : resourceData())
  }
  for (let i = 0; i < 4; i++) {
    const resources = await setup('Resources', '/resources'); await resources.load()
    assert.equal(resources.uploads.value[0].name, 'one')
    const products = await setup('Products', '/products'); await Promise.all([products.fetchProducts(), products.loadCatalog()])
    assert.equal(products.products.value[0].id, 7)
  }
  assert.equal(requests.length, 3, '4 visits to each page reuse fresh snapshots without re-fetching all lists')
  assert.equal(requests.find(r => r.url === '/api/admin/resources').params.compact, 1)
})

test('material search cancels the old transport, ignores its late failure, and closes picker requests', async () => {
  const vm = await setup('Resources', '/resources'), requests = []
  auth.api.defaults.adapter = config => { const d = deferred(); requests.push({ ...d, config }); return d.promise }
  const first = vm.load(); await tick()
  vm.keyword.value = 'new'; const second = vm.load(); await tick()
  assert.equal(requests[0].config.signal.aborted, true)
  requests[1].resolve(response(requests[1].config, resourceData('new'))); await second
  requests[0].reject(new Error('late old failure')); await first
  assert.equal(vm.uploads.value[0].name, 'new'); assert.equal(vm.error.value, '')
  const picker = await setup('MediaPicker', '/products'), pending = picker.load(); await tick()
  picker.invalidate(); await pending
  assert.equal(requests[2].config.signal.aborted, true)
  assert.equal(picker.loading.value, false); assert.equal(picker.error.value, '')
  requests[2].reject(new Error('closed picker')); await tick()
})

test('refresh keeps current material rows visible and preserves them when refresh fails', async () => {
  const vm = await setup('Resources', '/resources')
  auth.api.defaults.adapter = async config => response(config, resourceData())
  await vm.load()
  const slow = deferred(); auth.api.defaults.adapter = () => slow.promise
  const refresh = vm.load({ force: true }); await tick()
  assert.equal(vm.loading.value, true); assert.equal(vm.uploads.value[0].name, 'one')
  slow.reject(new Error('fixture offline')); await refresh
  assert.equal(vm.loading.value, false); assert.equal(vm.uploads.value[0].name, 'one')
  assert.equal(vm.error.value, 'fixture offline')
})
