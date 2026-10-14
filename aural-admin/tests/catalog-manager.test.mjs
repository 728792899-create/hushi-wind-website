import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { createSSRApp, h, ref } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { matchedRouteKey } from 'vue-router'
import { ElMessage, ElMessageBox, ID_INJECTION_KEY } from 'element-plus'

let server, Component, api
const originalConfirm = ElMessageBox.confirm
const originalSuccess = ElMessage.success
before(async () => {
  globalThis.window = { localStorage: { getItem: () => null }, addEventListener() {}, removeEventListener() {} }
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true }, appType: 'custom' })
  ;({ default: Component } = await server.ssrLoadModule('/src/components/CatalogManager.vue'))
  ;({ api } = await server.ssrLoadModule('/src/lib/api.js'))
  ElMessage.success = () => {}
})
after(async () => {
  ElMessageBox.confirm = originalConfirm
  ElMessage.success = originalSuccess
  await server?.close()
  delete globalThis.window
})

async function setup({ render = false, kind = 'categories', saving = false } = {}) {
  let vm
  const warnings = []
  const component = { ...Component, setup(props, context) {
    vm = Component.setup(props, context)
    vm.open.value = true
    vm.kind.value = kind
    vm.saving.value = saving
    return vm
  } }
  const app = createSSRApp(render ? component : { setup() {
    vm = Component.setup({}, { expose() {}, emit() {} })
    vm.open.value = true
    return () => null
  } })
  app.provide(matchedRouteKey, ref({ leaveGuards: new Set(), updateGuards: new Set() }))
  app.provide(ID_INJECTION_KEY, { prefix: 41, current: 0 })
  // Render the actual CatalogManager template and actual Radio controls. Only
  // unrelated globally registered layout/table widgets are lightweight stubs.
  for (const name of ['ElButton', 'ElDialog', 'ElAlert', 'ElTable', 'ElTableColumn', 'ElDivider', 'ElForm', 'ElFormItem', 'ElInput', 'ElSelect', 'ElOption', 'ElInputNumber']) {
    app.component(name, { setup: (_, { slots }) => () => h('div', slots.default?.({ row: {} })) })
  }
  app.directive('loading', {})
  app.config.warnHandler = message => warnings.push(message)
  const html = await renderToString(app)
  return { vm, html, warnings }
}

test('catalog template resolves real radio inputs with the correct selected kind and disabled state', async () => {
  for (const kind of ['categories', 'series']) {
    const { html, warnings } = await setup({ render: true, kind })
    assert.equal(warnings.filter(message => /Failed to resolve component/.test(message)).length, 0, warnings.join('\n'))
    const inputs = html.match(/<input\b[^>]*>/g) || []
    assert.equal(inputs.filter(input => input.includes('type="radio"')).length, 2)
    assert(inputs.some(input => input.includes(`value="${kind}"`) && input.includes('checked')))
    assert.doesNotMatch(html, /<el-radio-(group|button)/)
  }
  const { html } = await setup({ render: true, saving: true })
  assert.equal((html.match(/<input\b[^>]*disabled[^>]*>/g) || []).length, 2)
})

test('catalog switching keeps unsaved fields on cancel and clears only after confirmation', async () => {
  const { vm } = await setup()
  vm.form.sortOrder = 7 // A change without a name must also be protected.
  ElMessageBox.confirm = () => Promise.reject('cancel')
  await vm.changeKind('series')
  assert.equal(vm.kind.value, 'categories')
  assert.equal(vm.form.sortOrder, 7)
  ElMessageBox.confirm = () => Promise.resolve('confirm')
  await vm.changeKind('series')
  assert.equal(vm.kind.value, 'series')
  assert.equal(vm.form.sortOrder, 0)
  assert.equal(vm.form.name, '')
})

test('an unchanged edited record switches without a discard prompt; duplicate confirmation stays locked', async () => {
  const { vm } = await setup()
  vm.edit({ id: 4, name: 'Existing', specTemplate: '[]' })
  ElMessageBox.confirm = () => { throw new Error('must not prompt for unchanged fields') }
  await vm.changeKind('series')
  vm.form.name = 'Unsaved'
  let resolve, calls = 0
  ElMessageBox.confirm = () => { calls++; return new Promise(done => { resolve = done }) }
  const pending = vm.changeKind('categories')
  await vm.changeKind('categories')
  assert.equal(calls, 1)
  assert.equal(vm.kind.value, 'series')
  resolve('confirm')
  await pending
  assert.equal(vm.kind.value, 'categories')
  assert.equal(vm.switching.value, false)
})

test('series save uses the series endpoint and prevents switching until the response completes', async () => {
  const { vm } = await setup()
  await vm.changeKind('series')
  Object.assign(vm.form, { name: 'Example series', categorySlug: 'woodwind', sortOrder: 3 })
  let resolve
  const calls = []
  api.defaults.adapter = config => {
    calls.push(config)
    if (config.method === 'post') return new Promise(done => { resolve = data => done({ data, status: 200, headers: {}, config }) })
    return Promise.resolve({ data: { categories: [], series: [{ id: 9, name: 'Example series', categorySlug: 'woodwind' }] }, status: 200, headers: {}, config })
  }
  const saving = vm.save()
  await new Promise(done => setImmediate(done))
  await vm.changeKind('categories')
  assert.equal(vm.kind.value, 'series')
  assert.equal(vm.form.name, 'Example series')
  assert.equal(calls[0].url, '/api/admin/catalog/series')
  assert.equal(JSON.parse(calls[0].data).categorySlug, 'woodwind')
  resolve({})
  await saving
  assert.equal(vm.catalog.series[0].id, 9)
  assert.equal(vm.form.name, '')
  assert.equal(vm.saving.value, false)
  await vm.changeKind('categories')
  assert.equal(vm.kind.value, 'categories')
})
