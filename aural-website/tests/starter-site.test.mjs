import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import * as Vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import { pageHarness, compilePage, registerComponents, articleFixture } from './fixtures/starter-pages.mjs'
import { createApp, eventHandler, toWebHandler } from 'h3'
import * as mode from '../app/utils/siteMode.js'
import * as content from '../app/utils/starterContent.js'
import { fetchCompleteList } from '../app/utils/fetchCompleteList.js'
import { fetchSitemapCollection } from '../server/utils/fetchSitemapCollection.js'
import { installStarterBoundary } from '../server/utils/starterBoundary.js'
const website = fileURLToPath(new URL('../', import.meta.url))
const fixture = { id: 17, attributes: { status: 'published', title: '认识管乐', description: '## 从声音开始\n\n这是公开文章。<script>alert(1)</script>', category: '管乐入门', imageUrl: '/launch-assets/clarinet.svg' } }

async function renderPage(file, path, options = {}) {
  const h = pageHarness({ path, ...options })
  const app = Vue.createSSRApp(await compilePage(file, h))
  registerComponents(app)
  return { html: await renderToString(app), ...h }
}

test('site mode defaults to full and rejects misspellings or empty values', () => {
  assert.equal(mode.parseSiteMode(), 'full')
  assert.equal(mode.parseSiteMode('starter'), 'starter')
  for (const value of ['', 'STARTER', 'public', null, ' starter ']) assert.throws(() => mode.parseSiteMode(value), /SITE_MODE/)
})

test('real Nuxt configuration selects starter metadata and rejects invalid build modes', async t => {
  const keys = ['NODE_ENV', 'NUXT_PUBLIC_SITE_MODE', 'NUXT_PUBLIC_API_BASE', 'NUXT_PUBLIC_SITE_URL', 'JITI_FS_CACHE']
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  t.after(() => { for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value } })
  Object.assign(process.env, { NODE_ENV: 'production', NUXT_PUBLIC_API_BASE: 'https://api.fixture.invalid', NUXT_PUBLIC_SITE_URL: 'https://site.fixture.invalid', JITI_FS_CACHE: '0' })
  const { loadNuxtConfig } = await import('@nuxt/kit')
  const load = () => loadNuxtConfig({ cwd: website, dotenv: false, globalRc: false, rcFile: false })
  delete process.env.NUXT_PUBLIC_SITE_MODE
  assert.equal((await load()).runtimeConfig.public.siteMode, 'full')
  process.env.NUXT_PUBLIC_SITE_MODE = 'starter'
  const config = await load()
  assert.equal(config.runtimeConfig.public.siteMode, 'starter')
  assert.equal(config.app.head.meta.find(item => item.name === 'description').content, mode.STARTER_DESCRIPTION)
  process.env.NUXT_PUBLIC_SITE_MODE = 'typo'
  await assert.rejects(load, /SITE_MODE/)
})

test('request boundary runs before downstream static and page handlers with full-mode pass-through', async () => {
  for (const siteMode of ['starter', 'full']) {
    let downstream = 0
    const app = createApp()
    app.use(eventHandler(() => { downstream++; return 'downstream' }))
    installStarterBoundary(app, () => siteMode)
    const request = toWebHandler(app)
    for (const path of ['/products', '/support', '/artists', '/audio', '/info/brand-story', '/uploads/old.jpg', '/unknown.svg', '/news/17/extra', '/api/events', '/_nuxt/../support']) {
      const before = downstream
      const res = await request(new Request(`https://fixture.invalid${path}`))
      assert.equal(res.status, siteMode === 'starter' ? 404 : 200, path)
      assert.equal(downstream - before, siteMode === 'starter' ? 0 : 1, path)
      if (siteMode === 'starter') assert.doesNotMatch(await res.text(), /产品|预约|售后|艺术家/)
    }
    for (const path of ['/', '/news', '/news/17', '/robots.txt', '/sitemap.xml', '/launch-assets/clarinet.svg', '/launch-assets/music-studio.jpg', '/_nuxt/builds/latest.json', '/_nuxt/main.js']) {
      assert.equal((await request(new Request(`https://fixture.invalid${path}`))).status, 200, path)
    }
    assert.equal((await request(new Request('https://fixture.invalid/news', { method: 'POST' }))).status, siteMode === 'starter' ? 404 : 200)
  }
})

test('client navigation applies the same page boundary without altering full routes', async () => {
  const source = (await fs.readFile(new URL('../app/middleware/00-starter.global.js', import.meta.url), 'utf8')).replace(/^import .*$/gm, '').replace('export default', 'return')
  for (const siteMode of ['starter', 'full']) {
    const guard = Function('parseSiteMode', 'starterPageAllowed', 'defineNuxtRouteMiddleware', 'useRuntimeConfig', 'createError', source)(mode.parseSiteMode, mode.starterPageAllowed, fn => fn, () => ({ public: { siteMode } }), value => Object.assign(Error(value.statusMessage), value))
    for (const path of ['/', '/news', '/news/17']) assert.doesNotThrow(() => guard({ path }))
    for (const path of ['/products', '/support', '/news/draft']) {
      if (siteMode === 'starter') assert.throws(() => guard({ path }), { statusCode: 404 })
      else assert.doesNotThrow(() => guard({ path }))
    }
  }
})

test('root always uses the original layout and NuxtPage lifecycle while starter suppresses business schema and preview UI', async () => {
  for (const siteMode of ['starter', 'full']) {
    const h = pageHarness({ siteMode, route: () => ({ path: '/', query: { previewToken: 'synthetic-ticket' } }) })
    const app = Vue.createSSRApp(await compilePage('app.vue', h))
    app.component('NuxtLayout', { setup: (_p, { slots }) => () => Vue.h('div', ['ORIGINAL LAYOUT', slots.default?.()]) })
    app.component('NuxtPage', { render: () => Vue.h('div', 'ORIGINAL PAGE LIFECYCLE') })
    const html = await renderToString(app)
    assert.match(html, /ORIGINAL LAYOUT/); assert.match(html, /ORIGINAL PAGE LIFECYCLE/)
    assert.equal(h.heads.some(head => head.businessSchema), siteMode === 'full')
    assert.equal(html.includes('内容预览'), siteMode === 'full')
  }
})

test('original starter header/footer preserve their layout but expose only home and knowledge links without search or claims', async () => {
  for (const file of ['components/AppHeader.vue', 'components/AppFooter.vue']) {
    const { html } = await renderPage(file, '/')
    assert.match(html, /胡氏管乐/); assert.match(html, /管乐知识/)
    assert.doesNotMatch(html, /href="\/(products|audio|artists|support|info)|打开搜索|制造工艺|预约|保修|服务支持/)
    const full = await renderPage(file, '/', { siteMode: 'full' })
    assert.match(full.html, /href="\/products/)
  }
})

test('original home in starter mode keeps the photo hero and news layout while fetching only config and public articles', async () => {
  const hidden = { id: 19, attributes: { status: 'draft', title: 'HIDDEN DRAFT' } }
  const home = await renderPage('pages/index.vue', '/', { config: { aboutTitle: '可编辑的管乐标题', aboutText: '可编辑的介绍。', heroImageUrl: '/launch-assets/music-studio.jpg' }, rows: [articleFixture(17), hidden] })
  assert.match(home.html, /可编辑的管乐标题/); assert.match(home.html, /home-hero/); assert.match(home.html, /font-serif italic/)
  assert.match(home.html, /music-studio.jpg/); assert.match(home.html, /href="\/news\/17"/)
  assert.doesNotMatch(home.html, /HIDDEN DRAFT|Featured Series|Core Technology|Ecosystem|艺术家的共同选择|预约试奏|制造乐器|<form/)
  assert.deepEqual(home.calls.map(url => new URL(url).pathname).sort(), ['/api/articles', '/api/config'])
  const full = await renderPage('pages/index.vue', '/', { siteMode: 'full' })
  assert.match(full.html, /Featured Series/); assert.match(full.html, /Core Technology/); assert.match(full.html, /Ecosystem/)
  assert.ok(full.calls.some(url => url.includes('/products'))); assert.ok(full.calls.some(url => url.includes('/ecosystem-services')))
})

test('original news list in starter mode keeps cards, hides search and handles public, empty and failed data', async () => {
  const list = await renderPage('pages/news/index.vue', '/news', { rows: [articleFixture(17), { id: 19, attributes: { status: 'draft', title: 'HIDDEN DRAFT' } }] })
  assert.match(list.html, /Wind Notes/); assert.match(list.html, /news-featured-media/); assert.match(list.html, /管乐文章 17/)
  assert.doesNotMatch(list.html, /HIDDEN DRAFT|news-search-input|艺术家访谈|品牌动向/)
  assert.equal(list.calls.length, 1); assert.equal(new URL(list.calls[0]).pathname, '/api/articles')
  assert.match((await renderPage('pages/news/index.vue', '/news', { rows: [] })).html, /新的管乐知识正在整理中/)
  assert.match((await renderPage('pages/news/index.vue', '/news', { fail: 500 })).html, /重新加载/)
})

test('original starter article preserves rich prose and sharing without old schema, drafts or false missing status', async () => {
  const detail = await renderPage('pages/news/[id].vue', '/news/17')
  assert.match(detail.html, /正文 17/); assert.match(detail.html, /&lt;script&gt;/); assert.doesNotMatch(detail.html, /<script>alert/)
  assert.match(detail.html, /复制链接/); assert.ok(detail.calls.every(url => new URL(url).pathname.startsWith('/api/articles')))
  assert.equal(detail.heads.some(head => head.script?.length), false)
  const missing = await renderPage('pages/news/[id].vue', '/news/17', { rows: [], fail: 404 })
  assert.deepEqual(missing.statuses, [404]); assert.match(missing.html, /未找到这篇资讯/)
  const error = await renderPage('pages/news/[id].vue', '/news/17', { rows: [], fail: 500 })
  assert.deepEqual(error.statuses, [503]); assert.match(error.html, /重新加载/)
  const draft = await renderPage('pages/news/[id].vue', '/news/17', { rows: [], detail: { id: 17, attributes: { status: 'draft', title: 'HIDDEN DRAFT' } } })
  assert.deepEqual(draft.statuses, [404]); assert.doesNotMatch(draft.html, /HIDDEN DRAFT/)
})

test('starter sitemap requests only complete public article collections and has an isolated cache key', async () => {
  const source = (await fs.readFile(new URL('../server/routes/sitemap.xml.js', import.meta.url), 'utf8')).replace(/^import .*$/gm, '').replace('export default', 'return')
  const calls = []
  const config = { public: { siteMode: 'starter', siteUrl: 'https://site.fixture.invalid', apiBase: 'https://api.fixture.invalid' } }
  const route = Function('parseSiteMode', 'fetchSitemapCollection', '$fetch', 'defineCachedEventHandler', 'useRuntimeConfig', 'setHeader', source)(mode.parseSiteMode, fetchSitemapCollection, async (url, options) => {
    calls.push(url); assert.equal(options.query.pageSize, 100)
    return { data: [fixture, { id: 18, attributes: { status: 'draft' } }] }
  }, (handler, options) => ({ handler, options }), () => config, () => {})
  const xml = await route.handler({})
  assert.deepEqual(calls, ['https://api.fixture.invalid/api/articles'])
  assert.match(xml, /news\/17/); assert.doesNotMatch(xml, /news\/18|products|artists|support|info\//)
  const starterKey = route.options.getKey({}); config.public.siteMode = 'full'
  assert.notEqual(route.options.getKey({}), starterKey)
})

test('starter illustrations and machine-readable seeds stay local, original and free of embedded scripts', async () => {
  const seed = JSON.parse(await fs.readFile(new URL('../starter-content.json', import.meta.url), 'utf8'))
  assert.equal(seed.articles.length, 3)
  const hero = await fs.readFile(new URL(`../public/launch-assets/${seed.config.assetBasename}`, import.meta.url))
  assert.equal(hero.subarray(0, 2).toString('hex'), 'ffd8')
  for (const name of seed.articles.map(article => article.assetBasename)) {
    const svg = await fs.readFile(new URL(`../public/launch-assets/${name}`, import.meta.url), 'utf8')
    assert.match(svg, /<svg/); assert.doesNotMatch(svg, /<script|<image|foreignObject|href=|onload=/)
  }
  assert.equal(content.starterImage('/launch-assets/trumpet.svg', 'https://api.fixture.invalid'), '/launch-assets/trumpet.svg')
  for (const url of ['javascript:alert(1)', '//unapproved.invalid/image', 'data:image/svg+xml,x', 'https://name:secret@unapproved.invalid/img']) assert.equal(content.starterImage(url), content.STARTER_HERO)
})
