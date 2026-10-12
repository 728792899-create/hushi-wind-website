import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'

test('real Axios interceptor preserves user/token after 403 and clears both after 401', async () => {
  const items = new Map(), events = []
  globalThis.window = {localStorage:{getItem:k=>items.get(k),setItem:(k,v)=>items.set(k,v),removeItem:k=>items.delete(k)}, dispatchEvent:e=>events.push(e)}
  const server = await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true},appType:'custom'})
  try {
    const auth = await server.ssrLoadModule('/src/lib/api.js')
    auth.setToken('local-test-token');auth.setCurrentUser({id:1,permissions:['products:read']})
    auth.api.defaults.adapter = async config => {throw {config,response:{status:403,data:{error:{code:'FORBIDDEN'}}}}}
    await assert.rejects(auth.api.get('/api/config'))
    assert.equal(auth.getToken(),'local-test-token');assert.equal(auth.getCurrentUser().id,1);assert.equal(events.length,0)
    auth.api.defaults.adapter = async config => {throw {config,response:{status:401,data:{error:{code:'TOKEN_EXPIRED'}}}}}
    await assert.rejects(auth.api.get('/api/config'))
    assert.equal(auth.getToken(),'');assert.equal(auth.getCurrentUser(),null);assert.equal(events[0].type,'admin-auth-expired')
  } finally {await server.close();delete globalThis.window}
})
