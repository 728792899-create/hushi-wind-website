import test, { before, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { createSSRApp, createRenderer, h, nextTick, ref, ssrContextKey } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createRouter, createMemoryHistory, matchedRouteKey } from 'vue-router'
import { ElPagination } from 'element-plus'

let server, auth, uploadRequest
const originalMouseEvent = globalThis.MouseEvent
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
  globalThis.MouseEvent ||= class MouseEvent { constructor(type) { this.type = type } }
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
after(async () => {
  await server?.close(); delete globalThis.window; delete globalThis.XMLHttpRequest
  if (originalMouseEvent) globalThis.MouseEvent = originalMouseEvent; else delete globalThis.MouseEvent
})
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

// Use the real pagination component and its rendered button handlers. A setup-
// only SSR test does not run its page-count watcher or v-model feedback loop.
async function mountListPagination(name = 'Resources') {
  const file = name === 'MediaPicker' ? '/src/components/MediaPicker.vue' : `/src/views/${name}View.vue`
  const { default: Component } = await server.ssrLoadModule(file)
  const renderer = createRenderer({
    createElement: type => ({ type, props: {}, children: [] }),
    createText: text => ({ type: 'text', text }), createComment: text => ({ type: 'comment', text }),
    insert(child, parent, anchor) {
      if (child.parent) child.parent.children = child.parent.children.filter(node => node !== child)
      child.parent = parent
      const index = anchor ? parent.children.indexOf(anchor) : -1
      if (index < 0) parent.children.push(child); else parent.children.splice(index, 0, child)
    },
    remove(child) { if (child.parent) child.parent.children = child.parent.children.filter(node => node !== child) },
    setText(node, text) { node.text = text }, setElementText(node, text) { node.text = text; node.children = [] },
    parentNode: node => node.parent, nextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1],
    patchProp(node, key, _old, value) { node.props[key] = value },
  })
  let vm
  const updates = [], root = { children: [] }
  const app = renderer.createApp({ setup() {
    vm = Component.setup({}, { expose() {}, emit() {} })
    return () => h(ElPagination, {
      currentPage: (name === 'Products' ? vm.productPage : vm.page).value,
      pageSize: name === 'Products' ? vm.productPageSize.value : name === 'MediaPicker' ? 12 : 24,
      total: (name === 'Products' ? vm.productTotal : vm.total).value,
      layout: 'prev, pager, next',
      'onUpdate:currentPage': value => { updates.push(value); (name === 'Products' ? vm.productPage : vm.page).value = value },
      ...(name === 'Products' ? { onCurrentChange: vm.handleProductPageChange }
        : name === 'MediaPicker' ? { onCurrentChange: vm.load } : {}),
    })
  } })
  const path = name === 'Resources' ? '/resources' : '/products'
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path, component: { render: () => null } }] })
  app.provide(ssrContextKey, {})
  app.provide(matchedRouteKey, ref({ leaveGuards: new Set(), updateGuards: new Set() }))
  app.use(router); await router.push(path); app.mount(root)
  if (name === 'MediaPicker') vm.openPicker()
  const find = (node, className) => node.type === 'button' && String(node.props.class).split(' ').includes(className)
    ? node : node.children?.map(child => find(child, className)).find(Boolean)
  return { vm, updates, unmount: () => app.unmount(), click(direction) {
    const button = find(root, `btn-${direction}`)
    assert.ok(button, `real pagination ${direction} button is rendered`)
    assert.notEqual(button.props.disabled, true)
    button.props.onClick(new MouseEvent('click'))
  } }
}

const resourcePage = (page, total = 81, category = 'all') => ({
  uploads: Array.from({ length: Math.min(24, Math.max(0, total - (page - 1) * 24)) }, (_, index) => ({
    url: `/uploads/${category}-${(page - 1) * 24 + index + 1}.jpg`, name: `${category}-${(page - 1) * 24 + index + 1}`,
  })), categories: [], meta: { pagination: { total, page, pageSize: 24 } },
})

test('real material pagination keeps page 2 while loading and caches each page independently', async () => {
  const requests = [], slow = deferred()
  auth.api.defaults.adapter = config => {
    requests.push(config)
    return config.params.page === 2 ? slow.promise : Promise.resolve(response(config, resourcePage(1)))
  }
  const mounted = await mountListPagination(), { vm } = mounted
  try {
    await tick(); await nextTick()
    assert.equal(vm.total.value, 81); assert.equal(vm.uploads.value[0].name, 'all-1')
    mounted.click('next'); await tick(); await nextTick()
    assert.equal(vm.page.value, 2, 'the pagination must not clamp the requested page back to 1')
    assert.equal(vm.total.value, 81, 'keep the last known total until the response supplies a new total')
    assert.equal(vm.loading.value, true); assert.equal(vm.uploads.value.length, 0)
    assert.deepEqual(requests.map(r => r.params.page), [1, 2])
    slow.resolve(response(requests[1], resourcePage(2))); await tick(); await nextTick()
    assert.equal(vm.page.value, 2); assert.equal(vm.uploads.value[0].name, 'all-25')
    mounted.click('prev'); await tick(); await nextTick()
    assert.equal(vm.page.value, 1); assert.equal(vm.uploads.value[0].name, 'all-1')
    mounted.click('next'); await tick(); await nextTick()
    assert.equal(vm.page.value, 2); assert.equal(vm.uploads.value[0].name, 'all-25')
    assert.deepEqual(requests.map(r => r.params.page), [1, 2], 'fresh cached pages do not re-fetch or share rows')
    assert.equal(vm.error.value, '')
  } finally { mounted.unmount() }
})

test('real material pagination resets a changed filter and ignores the cancelled page response', async () => {
  const requests = [], oldPage = deferred(), filtered = deferred()
  auth.api.defaults.adapter = config => {
    requests.push(config)
    if (config.params.category === 'product') return filtered.promise
    if (config.params.page === 2) return oldPage.promise
    return Promise.resolve(response(config, resourcePage(1)))
  }
  const mounted = await mountListPagination(), { vm } = mounted
  try {
    await tick(); await nextTick()
    mounted.click('next'); await tick(); await nextTick()
    assert.equal(vm.page.value, 2)
    vm.category.value = 'product'; await tick(); await nextTick()
    assert.equal(vm.page.value, 1)
    assert.equal(requests[1].signal.aborted, true)
    assert.deepEqual(requests.map(r => [r.params.page, r.params.category]), [[1, 'all'], [2, 'all'], [1, 'product']])
    filtered.resolve(response(requests[2], resourcePage(1, 3, 'product'))); await tick(); await nextTick()
    oldPage.resolve(response(requests[1], resourcePage(2))); await tick(); await nextTick()
    assert.equal(vm.page.value, 1); assert.equal(vm.total.value, 3)
    assert.deepEqual(vm.uploads.value.map(row => row.name), ['product-1', 'product-2', 'product-3'])
    assert.equal(vm.loading.value, false); assert.equal(vm.error.value, '')
  } finally { mounted.unmount() }
})

test('real material pagination still corrects the last page when a refreshed total shrinks', async () => {
  const requests = []; let total = 81
  auth.api.defaults.adapter = config => { requests.push(config); return Promise.resolve(response(config, resourcePage(config.params.page, total))) }
  const mounted = await mountListPagination(), { vm } = mounted
  try {
    await tick(); await nextTick()
    vm.page.value = 4; await tick(); await nextTick()
    assert.equal(vm.page.value, 4); assert.equal(vm.uploads.value[0].name, 'all-73')
    total = 25; await vm.load({ force: true }); await tick(); await nextTick()
    assert.equal(vm.page.value, 2); assert.equal(vm.total.value, 25)
    assert.deepEqual(vm.uploads.value.map(row => row.name), ['all-25'])
    assert.deepEqual(requests.map(r => r.params.page), [1, 4, 4, 2])
    assert.equal(vm.loading.value, false); assert.equal(vm.error.value, '')
  } finally { mounted.unmount() }
})

for (const name of ['Products', 'MediaPicker']) {
  const perPage = name === 'Products' ? 20 : 12
  const pageData = (page, total = 81, label = 'all') => {
    const rows = Array.from({ length: Math.min(perPage, Math.max(0, total - (page - 1) * perPage)) }, (_, index) => {
      const id = (page - 1) * perPage + index + 1
      return name === 'Products' ? { id, attributes: { title: `${label}-${id}` } }
        : { url: `/uploads/${label}-${id}.jpg`, name: `${label}-${id}` }
    })
    return { ...(name === 'Products' ? { data: rows } : { uploads: rows, categories: [] }),
      meta: { pagination: { total, page, pageSize: perPage } } }
  }
  const state = vm => name === 'Products'
    ? { page: vm.productPage, total: vm.productTotal, rows: vm.products, loading: vm.productsLoading, error: vm.productError }
    : { page: vm.page, total: vm.total, rows: vm.rows, loading: vm.loading, error: vm.error }
  const title = row => name === 'Products' ? row.attributes.title : row.name
  test(`${name}: real pagination keeps page 2 and each cached page has its own rows`, async () => {
    const requests = [], slow = deferred()
    auth.api.defaults.adapter = config => {
      if (config.url === '/api/catalog') return Promise.resolve(response(config, { categories: [], series: [] }))
      requests.push(config)
      return config.params.page === 2 ? slow.promise : Promise.resolve(response(config, pageData(1)))
    }
    const mounted = await mountListPagination(name), list = state(mounted.vm)
    try {
      await tick(); await nextTick()
      mounted.click('next'); await tick(); await nextTick()
      assert.equal(list.page.value, 2, 'the real pagination must not clamp a pending page to 1')
      assert.equal(list.total.value, 81); assert.equal(list.loading.value, true)
      assert.deepEqual(requests.map(r => r.params.page), [1, 2])
      slow.resolve(response(requests[1], pageData(2))); await tick(); await nextTick()
      assert.equal(title(list.rows.value[0]), `all-${perPage + 1}`)
      mounted.click('prev'); await tick(); await nextTick()
      assert.equal(list.page.value, 1); assert.equal(title(list.rows.value[0]), 'all-1')
      mounted.click('next'); await tick(); await nextTick()
      assert.equal(list.page.value, 2); assert.equal(title(list.rows.value[0]), `all-${perPage + 1}`)
      assert.deepEqual(requests.map(r => r.params.page), [1, 2])
      assert.equal(list.error.value, '')
    } finally { mounted.unmount() }
  })
  test(`${name}: real pagination resets filters and cannot apply a late cancelled page`, async () => {
    const requests = [], old = deferred(), filtered = deferred()
    auth.api.defaults.adapter = config => {
      if (config.url === '/api/catalog') return Promise.resolve(response(config, { categories: [], series: [] }))
      requests.push(config)
      if (config.params.status === 'draft' || config.params.search === 'filtered') return filtered.promise
      return config.params.page === 2 ? old.promise : Promise.resolve(response(config, pageData(1)))
    }
    const mounted = await mountListPagination(name), { vm } = mounted, list = state(vm)
    try {
      await tick(); await nextTick()
      mounted.click('next'); await tick(); await nextTick()
      assert.equal(list.page.value, 2)
      if (name === 'Products') { vm.productStatusFilter.value = 'draft'; vm.handleProductFilterChange() }
      else { vm.keyword.value = 'filtered'; vm.search() }
      await tick(); await nextTick()
      assert.equal(list.page.value, 1); assert.equal(requests[1].signal.aborted, true)
      assert.equal(requests.length, 3); assert.equal(requests[2].params.page, 1)
      filtered.resolve(response(requests[2], pageData(1, 3, 'filtered'))); await tick(); await nextTick()
      old.resolve(response(requests[1], pageData(2))); await tick(); await nextTick()
      assert.equal(list.page.value, 1); assert.equal(list.total.value, 3)
      assert.deepEqual(list.rows.value.map(title), ['filtered-1', 'filtered-2', 'filtered-3'])
      assert.equal(list.loading.value, false); assert.equal(list.error.value, '')
    } finally { mounted.unmount() }
  })
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
