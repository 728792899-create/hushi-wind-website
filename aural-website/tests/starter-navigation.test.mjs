import test from 'node:test'
import assert from 'node:assert/strict'
import * as Vue from 'vue'
import * as Router from 'vue-router'
import { pageHarness, compilePage, registerComponents } from './fixtures/starter-pages.mjs'

function renderHost() {
  const detach = node => { const list = node.parent?.children; if (list) { const i = list.indexOf(node); if (i >= 0) list.splice(i, 1) } }
  return Vue.createRenderer({
    createElement: tag => ({ tag, children: [], props: {}, getRootNode() { let node = this; while (node.parent) node = node.parent; return node } }), createText: text => ({ text }), createComment: text => ({ comment: text }),
    setText: (node, text) => { node.text = text }, setElementText: (node, text) => { node.children = [{ text, parent: node }] },
    insert(node, parent, anchor = null) { detach(node); const index = anchor ? parent.children.indexOf(anchor) : -1; parent.children.splice(index < 0 ? parent.children.length : index, 0, node); node.parent = parent },
    remove: detach, parentNode: node => node.parent, nextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1] || null,
    patchProp: (node, name, _old, value) => { node.props[name] = value },
    insertStaticContent(html, parent, anchor) { const node = { text: html, parent }; const index = anchor ? parent.children.indexOf(anchor) : -1; parent.children.splice(index < 0 ? parent.children.length : index, 0, node); return [node, node] },
  })
}
const textOf = node => [node.text || '', ...(node.children || []).map(textOf)].join(' ')
const settle = async () => { for (let i = 0; i < 8; i++) { await new Promise(resolve => setImmediate(resolve)); await Vue.nextTick() } }

test('actual original app and pages follow Vue Router across home, list and detail in starter mode', async () => {
  let router
  const h = pageHarness({ client: true, route: () => router.currentRoute.value, config: { aboutTitle: '让呼吸，成为音乐。', aboutText: '认识管乐的声音。', heroImageUrl: '/launch-assets/music-studio.jpg' } })
  const home = await compilePage('pages/index.vue', h, Router)
  const list = await compilePage('pages/news/index.vue', h, Router)
  const detail = await compilePage('pages/news/[id].vue', h, Router)
  router = Router.createRouter({ history: Router.createMemoryHistory(), routes: [{ path: '/', component: home }, { path: '/news', component: list }, { path: '/news/:id', component: detail }] })
  await router.push('/'); await router.isReady()
  const app = renderHost().createApp(await compilePage('app.vue', h, Router))
  app.use(router); registerComponents(app, Router.RouterLink)
  app.component('NuxtLayout', { setup: (_p, { slots }) => () => Vue.h('div', slots.default?.()) })
  // NuxtPage drives this same RouterView/Suspense contract; browser acceptance
  // additionally checks Nuxt's real page-finish/scroll implementation.
  app.component('NuxtPage', { render: () => Vue.h(Router.RouterView, {}, { default: ({ Component, route }) => Component ? Vue.h(Vue.Suspense, {}, { default: () => Vue.cloneVNode(Component, { key: route.path }) }) : null }) })
  const host = { children: [], getRootNode() { return this } }; app.mount(host)
  try {
    await settle(); assert.match(textOf(host), /让呼吸，成为音乐/)
    for (const [path, expected] of [['/news', /Wind Notes/], ['/news/17', /正文 17/], ['/news/18', /正文 18/], ['/', /让呼吸，成为音乐/]]) {
      const before = h.calls.length
      await router.push(path); await settle()
      assert.match(textOf(host), expected, `visible content must follow ${path}`)
      assert.equal(router.currentRoute.value.path, path)
      if (path.startsWith('/news/')) assert.ok(h.calls.slice(before).some(url => new URL(url).pathname === `/api/articles/${path.split('/').at(-1)}`))
    }
    assert.ok(h.calls.every(url => ['/api/config', '/api/articles'].includes(new URL(url).pathname) || /^\/api\/articles\/\d+$/.test(new URL(url).pathname)))
    assert.doesNotMatch(textOf(host), /Featured Series|Core Technology|Ecosystem|全球顶级艺术家/)
  } finally { app.unmount() }
})
