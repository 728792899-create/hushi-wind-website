import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { createSSRApp, provide, ref, watchEffect, nextTick } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createRouter, createMemoryHistory, matchedRouteKey } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

let server, api, lifecycle
const notices = []
const original = {
  confirm: ElMessageBox.confirm,
  error: ElMessage.error,
  success: ElMessage.success,
  info: ElMessage.info,
  warning: ElMessage.warning,
}
before(async () => {
  const values = new Map([['aural-admin-user', JSON.stringify({ id: 999, permissions: ['*'] })]])
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key),
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
    addEventListener() {},
    removeEventListener() {},
    setTimeout,
    clearTimeout,
  }
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true },
    appType: 'custom',
  })
  ;({ api } = await server.ssrLoadModule('/src/lib/api.js'))
  lifecycle = await server.ssrLoadModule('/src/lib/editorLifecycle.js')
  for (const kind of ['error', 'success', 'info', 'warning'])
    ElMessage[kind] = (message) => notices.push({ kind, message })
})
after(async () => {
  ElMessageBox.confirm = original.confirm
  for (const kind of ['error', 'success', 'info', 'warning']) ElMessage[kind] = original[kind]
  await server?.close()
  delete globalThis.window
})
async function setup(name, query = {}) {
  const { default: Component } = await server.ssrLoadModule(name === 'App' ? '/src/App.vue' : `/src/views/${name}View.vue`)
  let vm
  const record = { leaveGuards: new Set(), updateGuards: new Set() }
  const app = createSSRApp({
    setup() {
      vm = Component.setup({}, { expose() {} })
      return () => null
    },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => null } }],
  })
  app.provide(matchedRouteKey, ref(record))
  app.use(router)
  await router.push({ path: '/', query })
  await renderToString(app, {})
  vm.__routeRecord = record
  return vm
}
const deferred = () => {
  let resolve, reject
  const promise = new Promise((a, b) => {
    resolve = a
    reject = b
  })
  return { promise, resolve, reject }
}
const response = (config, data) => ({ data, status: 200, statusText: 'OK', headers: {}, config })
const list = (id) => ({
  data: [{ id, attributes: { title: `record-${id}` } }],
  meta: { pagination: { total: 1, page: 1 } },
})

for (const [name, query, fetch, data, error] of [
  ['Products', 'searchQuery', 'fetchProducts', 'products', 'productError'],
  ['Articles', 'articleSearch', 'fetchArticles', 'articles', 'articleError'],
  ['Cms', 'contentKeyword', 'fetchContent', 'contentData', 'contentError'],
]) {
  test(`${name}: a slow old search cannot replace newer results or errors`, async () => {
    const vm = await setup(name)
    const requests = []
    api.defaults.adapter = (config) => {
      const d = deferred()
      requests.push({ config, ...d })
      return d.promise
    }
    vm[query].value = 'first'
    const first = name === 'Cms' ? vm[fetch]('faq') : vm[fetch]()
    vm[query].value = 'second'
    const second = name === 'Cms' ? vm[fetch]('faq') : vm[fetch]()
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(requests.length, 2)
    requests[1].resolve(response(requests[1].config, list(2)))
    await second
    requests[0].reject(new Error('outdated failed request'))
    await first
    const rows = name === 'Cms' ? vm[data].faq : vm[data].value
    assert.equal(rows[0].id, 2)
    assert.equal(vm[error].value, '')
  })
  test(`${name}: cancelling delete sends no request, API failure is visible`, async () => {
    const vm = await setup(name)
    let calls = 0
    api.defaults.adapter = () => {
      calls++
      return Promise.reject(new Error('simulated offline'))
    }
    ElMessageBox.confirm = () => Promise.reject('cancel')
    await vm.handleDelete(123, 'faqs')
    assert.equal(calls, 0)
    assert.equal(vm.saving.value, false)
    ElMessageBox.confirm = () => Promise.resolve('confirm')
    notices.length = 0
    await vm.handleDelete(123, 'faqs')
    assert.equal(calls, 1)
    assert(notices.some((item) => item.kind === 'error' && item.message.includes('simulated offline')))
    assert.equal(vm.saving.value, false)
  })
}

test('product editor refuses close and save while media upload is pending', async () => {
  const vm = await setup('Products')
  vm.openAddProduct()
  let calls = 0,
    closed = false
  api.defaults.adapter = () => {
    calls++
    throw new Error('must not submit')
  }
  vm.uploads.begin({ uid: 10 })
  await vm.requestCloseProductDialog(() => {
    closed = true
  })
  await vm.submitProduct()
  assert.equal(closed, false)
  assert.equal(calls, 0)
  vm.uploads.complete({ uid: 10 })
  await vm.requestCloseProductDialog(() => {
    closed = true
  })
  assert.equal(closed, true)
})

test('upload tracker rejects a late or duplicate callback after disposal', () => {
  const tracker = lifecycle.createUploadTracker()
  tracker.begin({ uid: 1 })
  tracker.begin({ uid: 2 })
  assert.equal(tracker.size, 2)
  assert.equal(tracker.finish({ uid: 1 }), true)
  assert.equal(tracker.finish({ uid: 1 }), false)
  tracker.dispose()
  assert.equal(tracker.finish({ uid: 2 }), false)
  assert.equal(tracker.begin({ uid: 3 }), false)
  assert.equal(tracker.size, 0)
})

test('config remains dirty if edited again after the saved snapshot was sent', async () => {
  const vm = await setup('Config')
  api.defaults.adapter = (config) =>
    Promise.resolve(response(config, { contactEmail: '', contactPhone: '', aboutTitle: 'old' }))
  await vm.fetchConfig()
  vm.sysConfig.value.aboutTitle = 'changed'
  const request = deferred()
  api.defaults.adapter = () => request.promise
  const save = vm.saveConfig()
  await new Promise((resolve) => setImmediate(resolve))
  vm.sysConfig.value.aboutTitle = 'newer'
  request.resolve(response({}, {}))
  await save
  assert.equal(JSON.parse(vm.originalConfig.value).aboutTitle, 'changed')
  assert.equal(vm.sysConfig.value.aboutTitle, 'newer')
})

test('dashboard edit query opens the intended product rather than the first search match', async () => {
  const vm = await setup('Products', { edit: '42', search: 'piano' })
  vm.products.value = [
    { id: 1, attributes: { title: 'other' } },
    { id: 42, attributes: { title: 'selected', gallery: '[]', specs: '{}' } },
  ]
  vm.handleRouteAction()
  assert.equal(vm.curId.value, 42)
  assert.equal(vm.pDiag.value, true)
  assert.equal(vm.pForm.title, 'selected')
})


test('browser back/forward route updates preserve a dirty product when cancelled', async () => {
  const vm = await setup('Products')
  vm.openAddProduct()
  vm.pForm.title = 'unsaved'
  ElMessageBox.confirm = () => Promise.reject('cancel')
  assert.equal(vm.__routeRecord.updateGuards.size, 1)
  const guard = [...vm.__routeRecord.updateGuards][0]
  assert.equal(await guard(), false)
  assert.equal(vm.pForm.title, 'unsaved')
  ElMessageBox.confirm = () => Promise.resolve('confirm')
  assert.equal(await guard(), true)
})

test('pending member save cannot be closed or replaced by another member', async () => {
  const vm = await setup('Settings')
  vm.editUser({id:42,username:'sample',displayName:'Original',role:'readonly',status:'active'})
  vm.member.displayName = 'Changed'
  const request = deferred()
  api.defaults.adapter = config => config.method === 'put' ? request.promise : Promise.resolve(response(config,{data:[],roles:{}}))
  const saving = vm.saveMember()
  await new Promise(resolve=>setImmediate(resolve))
  let closed = false
  await vm.closeMember(()=>{closed=true})
  vm.editUser({id:100,username:'different'})
  assert.equal(closed,false)
  assert.equal(vm.member.id,42)
  request.resolve(response({},{}))
  await saving
  assert.equal(vm.memberOpen.value,false)
})

test('resource pagination consumes server totals without reporting a successful load as failure', async () => {
  const vm=await setup('Resources')
  api.defaults.adapter=config=>Promise.resolve(response(config,{uploads:[{url:'/uploads/fixture.jpg',name:'fixture'}],used:[],meta:{pagination:{total:49,page:1,pageSize:24}}}))
  await vm.load();assert.equal(vm.error.value,'');assert.equal(vm.total.value,49);assert.equal(vm.uploads.value.length,1)
})
for(const [name,field,loader] of [['Articles','articleVersionDrawerOpen','openVersionDrawer'],['Cms','contentVersionDrawerOpen','openContentVersions']]) {
 test(`${name}: page setup retains history and watcher bindings`,async()=>{const vm=await setup(name);assert.ok(vm[field]);})
}

test('content workflow locks edits until initial server draft lookup finishes',async()=>{
 const pending=deferred();let writes=0;api.defaults.adapter=config=>config.method==='get'?pending.promise:(writes++,Promise.resolve(response(config,{data:{payload:{title:'new'}}})))
 const {default:Component}=await server.ssrLoadModule('/src/components/ContentWorkflow.vue');let vm
 await renderToString(createSSRApp({setup(){vm=Component.setup({module:'product',recordId:12,payload:{title:'new'},busy:false,canWrite:true},{expose(){},emit(){}});return ()=>null}}))
 assert.equal(vm.locked.value,true);await vm.saveDraft();assert.equal(writes,0)
 pending.resolve(response({},{data:null}));await new Promise(resolve=>setImmediate(resolve));assert.equal(vm.locked.value,false)
 await vm.saveDraft();assert.equal(writes,1);assert.equal(vm.draft.value.payload.title,'new')
})


test('expired login retains the editor owner in memory and resumes the same account', async () => {
  const vm = await setup('App')
  vm.currentUser.value = {id:77, username:'fixture', permissions:['*']}
  vm.isLoggedIn.value = true
  vm.handleAuthExpired({detail:{code:'TOKEN_EXPIRED'}})
  assert.equal(vm.isLoggedIn.value, false)
  assert.equal(vm.resumeEditor.value, true)
  assert.equal(vm.currentUser.value.id, 77)
  api.defaults.adapter = config => Promise.resolve(response(config, {token:'fixture-new-token',user:{id:77,username:'fixture',permissions:['*']},expiresIn:3600}))
  vm.loginForm.username = 'fixture'
  vm.loginForm.password = 'FixtureLogin123!'
  await vm.handleLogin()
  assert.equal(vm.isLoggedIn.value, true)
  assert.equal(vm.resumeEditor.value, false)
  assert.equal(vm.currentUser.value.id, 77)
  vm.handleAuthExpired()
})


test('permission controls react when the same account signs back in after expiry', async () => {
  const auth = await server.ssrLoadModule('/src/lib/api.js')
  let visible
  const stop = watchEffect(() => { visible = auth.hasPermission('products:write') })
  auth.setCurrentUser({id:77,permissions:['products:write']}); await nextTick(); assert.equal(visible,true)
  auth.clearToken(); await nextTick(); assert.equal(visible,false)
  auth.setCurrentUser({id:77,permissions:['products:write']}); await nextTick(); assert.equal(visible,true)
  stop()
})

test('workflow keeps the last reviewed version on conflict and reload does not replace unsaved form',async()=>{
  const seen=[],emitted=[];let latest='v1';
  api.defaults.adapter=async config=>{
    seen.push(config);
    if(config.method==='get')return response(config,{data:{version:latest,payload:{title:'server '+latest}}});
    if(config.headers.get('If-Match')!==latest)throw new Error('修改草稿已变化');
    latest='v3';return response(config,{data:{version:latest,payload:JSON.parse(config.data)}});
  };
  const {default:Component}=await server.ssrLoadModule('/src/components/ContentWorkflow.vue');let vm;
  const props={module:'product',recordId:51,payload:{title:'unsaved local'},busy:false,canWrite:true};
  await renderToString(createSSRApp({setup(){vm=Component.setup(props,{expose(){},emit:(...args)=>emitted.push(args)});return ()=>null}}));
  await new Promise(resolve=>setImmediate(resolve));
  latest='v2';await vm.saveDraft();assert.match(vm.error.value,/已变化/);assert.equal(vm.draft.value.version,'v1');
  assert.equal(seen.at(-1).headers.get('If-Match'),'v1');
  await vm.load();assert.equal(vm.draft.value.version,'v2');assert.equal(props.payload.title,'unsaved local');assert.ok(!emitted.some(([type])=>type==='loaded'));
  await vm.saveDraft();assert.equal(seen.at(-1).headers.get('If-Match'),'v2');assert.equal(vm.draft.value.version,'v3');
});

test('security alerts follow existing log access and readonly accounts cannot resolve through the action', async () => {
  const auth = await server.ssrLoadModule('/src/lib/api.js')
  const originalUser = auth.getCurrentUser()
  try {
    auth.setCurrentUser({ id: 81, permissions: ['crm:read', 'crm:write'] })
    const support = await setup('Settings')
    assert.equal(support.tabs.value.some(item => item.id === 'alerts'), false)
    auth.setCurrentUser({ id: 82, permissions: ['logs:read'] })
    const readonly = await setup('Settings')
    assert.equal(readonly.tabs.value.some(item => item.id === 'alerts'), true)
    let writes = 0
    api.defaults.adapter = config => { writes++; return Promise.resolve(response(config, {})) }
    await readonly.resolveAlert({ id: 5, status: 'new' })
    assert.equal(writes, 0)
  } finally {
    auth.setCurrentUser(originalUser)
  }
})

test('security alert pagination loads totals and resolving sends one write then refreshes the active page', async () => {
  const auth = await server.ssrLoadModule('/src/lib/api.js')
  const originalUser = auth.getCurrentUser()
  try {
    auth.setCurrentUser({ id: 83, permissions: ['logs:read', 'alerts:write'] })
    const vm = await setup('Settings')
    vm.tab.value = 'alerts'
    vm.page.value = 2
    const requests = []
    const pending = deferred()
    let status = 'new'
    api.defaults.adapter = config => {
      requests.push(config)
      if (config.method === 'put') return pending.promise
      return Promise.resolve(response(config, { data: [{ id: 42, title: '异常查看告警', status }], meta: { pagination: { total: 21, page: 2 } } }))
    }
    await vm.loadTab()
    assert.equal(requests[0].url, '/api/admin/alerts')
    assert.equal(requests[0].params.page, 2)
    assert.equal(requests[0].params.pageSize, 20)
    assert.equal(vm.total.value, 21)
    const row = vm.rows.value[0]
    const resolving = vm.resolveAlert(row)
    await new Promise(resolve => setImmediate(resolve))
    await vm.resolveAlert(row)
    assert.equal(requests.filter(config => config.method === 'put').length, 1)
    assert.equal(requests[1].url, '/api/admin/alerts/42/resolve')
    status = 'resolved'
    pending.resolve(response(requests[1], { success: true }))
    await resolving
    assert.equal(requests[2].url, '/api/admin/alerts')
    assert.equal(requests[2].params.page, 2)
    assert.equal(vm.rows.value[0].status, 'resolved')
    assert.equal(vm.saving.value, false)
    await vm.resolveAlert(vm.rows.value[0])
    assert.equal(requests.length, 3, 'resolved records do not send another write')
  } finally {
    auth.setCurrentUser(originalUser)
  }
})

test('failed security alert resolution keeps the record pending and displays the server error', async () => {
  const auth = await server.ssrLoadModule('/src/lib/api.js')
  const originalUser = auth.getCurrentUser()
  try {
    auth.setCurrentUser({ id: 84, permissions: ['logs:read', 'alerts:write'] })
    const vm = await setup('Settings')
    vm.tab.value = 'alerts'
    const row = { id: 43, status: 'new' }
    vm.rows.value = [row]
    notices.length = 0
    let calls = 0
    api.defaults.adapter = () => { calls++; return Promise.reject(new Error('告警暂时无法更新')) }
    await vm.resolveAlert(row)
    assert.equal(calls, 1, 'failure must not reload or imply success')
    assert.equal(vm.rows.value[0].status, 'new')
    assert.match(vm.error.value, /告警暂时无法更新/)
    assert.equal(vm.saving.value, false)
    assert.equal(notices.some(notice => notice.kind === 'success'), false)
  } finally {
    auth.setCurrentUser(originalUser)
  }
})

test('audit integrity recheck clears old success before showing a server verification failure', async () => {
  const auth = await server.ssrLoadModule('/src/lib/api.js')
  const originalUser = auth.getCurrentUser()
  try {
    auth.setCurrentUser({ id: 85, permissions: ['logs:read'] })
    const vm = await setup('Settings')
    vm.tab.value = 'activity'
    const valid = { ok: true, logCount: 25, baselineCount: 20, entryCount: 5, sealedAt: '2026-10-12T08:00:00.000Z', headHash: 'internal-digest' }
    api.defaults.adapter = config => {
      assert.equal(config.url, '/api/admin/audit-integrity')
      return Promise.resolve(response(config, { data: valid }))
    }
    await vm.verifyIntegrity()
    assert.equal(vm.integrityResult.value.logCount, 25)
    assert.ok(Number.isFinite(Date.parse(vm.integrityCheckedAt.value)))
    const pending = deferred()
    api.defaults.adapter = () => pending.promise
    const checking = vm.verifyIntegrity()
    assert.equal(vm.integrityResult.value, null)
    assert.equal(vm.integrityCheckedAt.value, '')
    assert.equal(vm.integrityLoading.value, true)
    pending.reject(Object.assign(new Error('Request failed'), { response: { status: 409, data: { error: { message: '操作记录完整性校验未通过' } } } }))
    await checking
    assert.equal(vm.integrityResult.value, null)
    assert.match(vm.integrityError.value, /完整性校验未通过/)
    assert.equal(vm.integrityLoading.value, false)
  } finally {
    auth.setCurrentUser(originalUser)
  }
})

test('audit verification refuses duplicate requests and ignores a previous tab visit response', async () => {
  const auth = await server.ssrLoadModule('/src/lib/api.js')
  const originalUser = auth.getCurrentUser()
  try {
    auth.setCurrentUser({ id: 86, permissions: ['logs:read'] })
    const vm = await setup('Settings')
    vm.tab.value = 'activity'
    const requests = []
    api.defaults.adapter = config => {
      const request = { config, ...deferred() }
      requests.push(request)
      return request.promise
    }
    const old = vm.verifyIntegrity()
    await new Promise(resolve => setImmediate(resolve))
    await vm.verifyIntegrity()
    assert.equal(requests.length, 1)
    await vm.changeTab('alerts')
    assert.equal(vm.integrityLoading.value, false)
    await vm.changeTab('activity')
    const current = vm.verifyIntegrity()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(requests.length, 2)
    requests[0].reject(new Error('旧页面的迟到失败'))
    await old
    assert.equal(vm.integrityLoading.value, true)
    assert.equal(vm.integrityError.value, '')
    assert.equal(vm.integrityResult.value, null)
    requests[1].resolve(response(requests[1].config, { data: { ok: true, logCount: 31, baselineCount: 20, entryCount: 11 } }))
    await current
    assert.equal(vm.integrityResult.value.logCount, 31)
    assert.equal(vm.integrityLoading.value, false)
    auth.setCurrentUser({ id: 86, permissions: ['crm:read'] })
    await vm.verifyIntegrity()
    assert.equal(requests.length, 2, 'accounts without log access do not issue a verification request')
  } finally {
    auth.setCurrentUser(originalUser)
  }
})
