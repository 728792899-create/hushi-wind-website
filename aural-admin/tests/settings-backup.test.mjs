import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { createSSRApp, ref } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createRouter, createMemoryHistory, matchedRouteKey } from 'vue-router'
import { ElMessage } from 'element-plus'

let server, auth
const notices = []
const originalSuccess = ElMessage.success
before(async () => {
  const values = new Map()
  globalThis.window = {
    localStorage: {
      getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key),
    },
    addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout,
  }
  server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' })
  auth = await server.ssrLoadModule('/src/lib/api.js')
  ElMessage.success = message => notices.push(message)
})
after(async () => {
  ElMessage.success = originalSuccess
  await server?.close()
  delete globalThis.window
})
async function setup(permissions = ['logs:read', 'backups:create']) {
  notices.length = 0
  auth.setCurrentUser({ id: 999, permissions })
  const { default: Component } = await server.ssrLoadModule('/src/views/SettingsView.vue')
  let vm
  const app = createSSRApp({ setup() { vm = Component.setup({}, { expose() {} }); return () => null } })
  app.provide(matchedRouteKey, ref({ leaveGuards: new Set(), updateGuards: new Set() }))
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => null } }] })
  app.use(router)
  await router.push('/')
  await renderToString(app, {})
  vm.tab.value = 'backups'
  return vm
}
const response = (config, data) => ({ data, status: 200, statusText: 'OK', headers: {}, config })
const deferred = () => {
  let resolve, reject
  const promise = new Promise((a, b) => { resolve = a; reject = b })
  return { promise, resolve, reject }
}
const tick = () => new Promise(resolve => setImmediate(resolve))
const report = {
  status: 'verified', snapshotAt: '2026-10-13T02:30:00.000Z', durationMs: 83,
  database: { tableCount: 37 }, assets: { count: 4 }, audit: { logCount: 23, appendVerified: true },
}
const goodRow = () => ({ id: 42, filename: 'database.fixture.db', status: 'success', verificationStatus: 'verified', verificationReport: structuredClone(report) })

test('backup UI keeps creation and latest drill evidence separate, including legacy message text', async () => {
  const vm = await setup()
  const row = goodRow()
  assert.equal(vm.backupVerificationLabel(row), '演练通过')
  const summary = vm.backupVerificationSummary(row)
  for (const expected of ['快照', '2026', '37 张表', '4 个素材', '23 条审计', '审计续写通过']) assert.ok(summary.includes(expected), summary)
  const legacy = { status: 'success', message: '手动备份；恢复演练通过 2026-10-12' }
  assert.equal(vm.backupVerificationLabel(legacy), '尚未演练')
  assert.match(vm.backupVerificationSummary(legacy), /不代表已经通过/)
  const failed = { ...row, verificationStatus: 'failed' }
  assert.equal(failed.status, 'success')
  assert.equal(vm.backupVerificationLabel(failed), '演练失败')
  assert.ok(!vm.backupVerificationSummary(failed).includes('审计续写通过'))
})

test('readonly accounts and unsuccessful backups cannot request a restore drill', async () => {
  const vm = await setup(['logs:read'])
  let calls = 0
  auth.api.defaults.adapter = () => { calls++; throw new Error('must not request a mutation') }
  await vm.verifyBackup(goodRow())
  auth.setCurrentUser({ id: 999, permissions: ['logs:read', 'backups:create'] })
  await vm.verifyBackup({ ...goodRow(), status: 'failed' })
  assert.equal(calls, 0)
  assert.equal(vm.saving.value, false)
})

test('failed repeat drill clears old success, prevents duplicates, refreshes state and preserves the error', async () => {
  const vm = await setup()
  const row = goodRow()
  vm.rows.value = [row]
  vm.page.value = 2
  const pending = deferred(), requests = []
  auth.api.defaults.adapter = config => {
    requests.push(config)
    if (config.method === 'post') return pending.promise
    return Promise.resolve(response(config, { data: [{ ...row, verificationStatus: 'failed', verificationReport: { status: 'failed' } }], meta: { pagination: { total: 25 } } }))
  }
  const action = vm.verifyBackup(row)
  assert.equal(row.verificationStatus, 'running')
  assert.equal(row.verificationReport, null)
  await tick()
  await vm.verifyBackup(row)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, '/api/admin/backups/42/verify-restore')
  assert.deepEqual(JSON.parse(requests[0].data), { confirmation: '确认执行' })
  pending.reject(Object.assign(new Error('request failed'), { response: { status: 500, data: { error: { code: 'RESTORE_VERIFY_FAILED', message: '恢复演练未通过，请检查备份' } } } }))
  await action
  assert.equal(requests.length, 2)
  assert.equal(requests[1].url, '/api/admin/backups')
  assert.equal(requests[1].params.page, 2)
  assert.equal(vm.rows.value[0].verificationStatus, 'failed')
  assert.match(vm.error.value, /恢复演练未通过/)
  assert.equal(vm.saving.value, false)
  assert.deepEqual(notices, [])
})

test('successful drill refreshes structured evidence before unlocking the action', async () => {
  const vm = await setup()
  const row = { ...goodRow(), verificationStatus: 'never', verificationReport: null }
  vm.rows.value = [row]
  const refresh = deferred(), requests = []
  auth.api.defaults.adapter = config => {
    requests.push(config)
    return config.method === 'post' ? Promise.resolve(response(config, { data: { report } })) : refresh.promise
  }
  const action = vm.verifyBackup(row)
  await tick()
  assert.equal(vm.saving.value, true)
  assert.equal(requests.length, 2)
  refresh.resolve(response(requests[1], { data: [goodRow()], meta: { pagination: { total: 1 } } }))
  await action
  assert.equal(vm.rows.value[0].verificationReport.assets.count, 4)
  assert.equal(vm.backupVerificationLabel(vm.rows.value[0]), '演练通过')
  assert.equal(vm.saving.value, false)
  assert.equal(notices.length, 1)
})

test('late drill success or failure cannot refresh or contaminate another settings tab', async () => {
  for (const outcome of ['success', 'failure']) {
    const vm = await setup()
    const row = goodRow(), pending = deferred(), requests = []
    auth.api.defaults.adapter = config => {
      requests.push(config)
      return config.method === 'post' ? pending.promise : Promise.resolve(response(config, { data: [{ id: 99, title: 'new alert' }], meta: { pagination: { total: 1 } } }))
    }
    const action = vm.verifyBackup(row)
    await tick()
    vm.tab.value = 'alerts'
    await vm.loadTab()
    vm.error.value = 'new tab message'
    if (outcome === 'success') pending.resolve(response(requests[0], { data: { report } }))
    else pending.reject(new Error('outdated backup failure'))
    await action
    assert.deepEqual(requests.map(config => config.url), ['/api/admin/backups/42/verify-restore', '/api/admin/alerts'])
    assert.equal(vm.rows.value[0].id, 99)
    assert.equal(vm.error.value, 'new tab message')
    assert.equal(vm.saving.value, false)
    assert.deepEqual(notices, [])
  }
})

test('switching tabs while the failure refresh is pending preserves the new tab state', async () => {
  const vm = await setup(), refresh = deferred(), requests = []
  auth.api.defaults.adapter = config => {
    requests.push(config)
    if (config.method === 'post') return Promise.reject(new Error('old drill failure'))
    if (config.url === '/api/admin/backups') return refresh.promise
    return Promise.resolve(response(config, { data: [{ id: 100, title: 'current alert' }], meta: { pagination: { total: 1 } } }))
  }
  const action = vm.verifyBackup(goodRow())
  await tick()
  assert.equal(requests[1].url, '/api/admin/backups')
  vm.tab.value = 'alerts'
  await vm.loadTab()
  vm.error.value = 'current tab error'
  refresh.resolve(response(requests[1], { data: [{ ...goodRow(), verificationStatus: 'failed' }] }))
  await action
  assert.equal(vm.rows.value[0].id, 100)
  assert.equal(vm.error.value, 'current tab error')
  assert.equal(vm.saving.value, false)
  assert.deepEqual(notices, [])
})
