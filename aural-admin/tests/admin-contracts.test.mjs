import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { navigationFor, visibleContentPages, canAccess, sessionExpired } from '../src/lib/navigation.js'

// Use the server role definitions as the contract rather than copying the admin's expectations.
const server = fs.readFileSync(new URL('../../aural-api/server.js', import.meta.url), 'utf8')
const roleText = server.match(/const roleDefinitions = (\{[\s\S]*?\n\});/)[1]
const roles = Function('return (' + roleText + ')')()

test('super admin has exactly six core navigation groups', () => {
  assert.deepEqual(navigationFor({permissions:['*']}).map(item=>item.label), ['工作台','产品','官网内容','客户咨询','素材','设置'])
})
for (const [role, definition] of Object.entries(roles)) {
  test(`${role}: every displayed route is allowed by the API permissions`, () => {
    const user = {permissions:definition.permissions}
    const nav = navigationFor(user)
    assert(nav.some(item=>item.path==='/settings'), 'Every signed-in user needs own account settings')
    for (const item of nav) assert(canAccess(user,item.permission), item.path)
    for (const item of visibleContentPages(user)) assert(canAccess(user,item.permission), item.path)
    assert.equal(nav.some(item=>item.path==='/crm'), canAccess(user,'crm:read'))
    assert.equal(nav.some(item=>item.label==='官网内容'), visibleContentPages(user).length>0)
  })
}
test('support has no content or media entry, editor cannot enter customer data', () => {
  assert.deepEqual(navigationFor({permissions:roles.support.permissions}).map(item=>item.path), ['/dashboard','/crm','/settings'])
  assert(!navigationFor({permissions:roles.editor.permissions}).some(item=>item.path==='/crm'))
})
test('401 expires session; denied permission, network and service errors preserve login', () => {
  assert(sessionExpired(401,'/api/products'))
  for(const status of [403,404,422,429,500,undefined]) assert(!sessionExpired(status,'/api/products'))
  assert(!sessionExpired(401,'/api/auth/login'))
})
