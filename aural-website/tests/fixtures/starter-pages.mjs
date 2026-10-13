import fs from 'node:fs/promises'
import * as Vue from 'vue'
import { parse, compileScript } from '@vue/compiler-sfc'
import * as content from '../../app/utils/starterContent.js'
import * as mode from '../../app/utils/siteMode.js'
import { articlePreviewText } from '../../app/utils/articlePreviewText.js'
import { createPageMotion } from '../../app/utils/pageMotion.js'
export { Vue }
export const articleFixture = id => ({ id, attributes: { status: 'published', title: `管乐文章 ${id}`, description: `## 从声音开始\n\n正文 ${id}。<script>alert(1)</script>`, category: '管乐入门', date: '2026-10-13', image: { data: { attributes: { url: '/launch-assets/clarinet.svg' } } } } })
export function pageHarness({ path = '/', route, siteMode = 'starter', rows = [articleFixture(17), articleFixture(18)], detail, fail, config = {}, client = false } = {}) {
  const calls = [], heads = [], statuses = [], state = new Map()
  const currentRoute = route || (() => ({ path, fullPath: path, params: { id: path.split('/').at(-1) }, query: {} }))
  const runtime = { apiInternalBase: 'http://fixture.invalid', public: { siteMode, apiBase: 'https://api.fixture.invalid', siteUrl: 'https://site.fixture.invalid' } }
  const fetcher = async url => {
    calls.push(url)
    const pathname = new URL(url).pathname
    if (fail && pathname.includes('articles')) throw Object.assign(Error('unavailable'), { statusCode: fail })
    if (pathname === '/api/config') return config
    if (pathname === '/api/articles') return { data: rows }
    if (/\/api\/articles\/\d+$/.test(pathname)) return { data: detail === undefined ? articleFixture(Number(pathname.split('/').at(-1))) : detail }
    if (siteMode === 'starter') throw Error(`Starter requested a hidden API: ${pathname}`)
    return { data: [] }
  }
  const load = async (run, options = {}) => {
    try { const payload = await run(); return { data: Vue.ref(options.transform ? options.transform(payload) : payload), pending: Vue.ref(false), error: Vue.ref(null), refresh() {} } }
    catch (error) { return { data: Vue.ref(options.default?.() || null), pending: Vue.ref(false), error: Vue.ref(error), refresh() {} } }
  }
  const globals = {
    process: { server: !client, client: false },
    useRuntimeConfig: () => runtime, useRoute: currentRoute,
    useState: (key, init) => { if (!state.has(key)) state.set(key, Vue.ref(init ? init() : undefined)); return state.get(key) },
    useApiBase: () => Vue.computed(() => client ? runtime.public.apiBase : runtime.apiInternalBase),
    useApiUrl: value => Vue.computed(() => `${client ? runtime.public.apiBase : runtime.apiInternalBase}${typeof value === 'function' ? value() : Vue.unref(value)}`),
    useSiteUrl: () => Vue.ref(runtime.public.siteUrl),
    useMediaUrl: () => value => typeof value === 'string' && value.startsWith('/launch-assets/') ? value : value || '',
    useBrandAssets: () => ({ heroPiano: content.STARTER_HERO, productPiano: content.STARTER_ARTICLE_IMAGE, supportHero: content.STARTER_ARTICLE_IMAGE, brandCraft: content.STARTER_ARTICLE_IMAGE }),
    useImageFallback: () => () => {}, useAuralTrack: () => ({ track() {} }), useSmartBack: () => () => {},
    useDialogFocus() {}, useOverlayLock() {}, useOverlayHistory: () => ({ closeDirect() {}, closeViaHistory() {} }),
    $fetch: fetcher,
    useFetch: (url, options) => load(() => fetcher(Vue.unref(url)), options),
    useCompleteApiList: (url, options) => load(() => fetcher(Vue.unref(url)), options),
    useAsyncData: (_key, run, options) => load(run, options),
    useRequestEvent: () => ({}), setResponseStatus: (_event, status) => statuses.push(status),
    useSeoMeta: head => heads.push(head), useSiteSeo: head => heads.push(head), useBreadcrumbSchema: head => heads.push(head),
    useHead: head => heads.push(typeof head === 'function' ? head() : head), useGlobalBusinessSchema: () => heads.push({ businessSchema: true }),
  }
  return { globals, calls, heads, statuses, currentRoute }
}
export async function compilePage(file, harness, routerModule) {
  const source = await fs.readFile(new URL(`../../app/${file}`, import.meta.url), 'utf8')
  let code = compileScript(parse(source).descriptor, { id: `starter-${file}`, inlineTemplate: true }).content
  const vue = harness.globals.process.server ? Vue : { ...Vue, onMounted() {}, onActivated() {} }
  const modules = { vue, 'vue-router': routerModule || { useRoute: harness.currentRoute, useRouter: () => ({ replace() {}, push() {}, afterEach() {} }), onBeforeRouteLeave() {} }, gsap: { gsap: {} }, 'gsap/ScrollTrigger': { ScrollTrigger: {} } }
  for (const prefix of ['../utils/', '../../utils/']) {
    for (const suffix of ['', '.js']) {
      modules[`${prefix}starterContent${suffix}`] = content; modules[`${prefix}siteMode${suffix}`] = mode
      modules[`${prefix}articlePreviewText${suffix}`] = { articlePreviewText }; modules[`${prefix}pageMotion${suffix}`] = { createPageMotion }
    }
  }
  code = code.replace(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g, (_, names, from) => `const {${names.replace(/\s+as\s+/g, ':')}} = modules[${JSON.stringify(from)}]`).replace('export default', 'return')
  return Function('modules', ...Object.keys(harness.globals), `return (() => {${code}})()`)(modules, ...Object.values(harness.globals))
}
export function registerComponents(app, linkComponent) {
  app.component('NuxtLink', linkComponent || { props: ['to'], setup: (props, { slots }) => () => Vue.h('a', { href: props.to }, slots.default?.()) })
  app.component('FrontState', { props: ['title', 'description', 'showRetry'], setup: props => () => Vue.h('section', [Vue.h('h2', props.title), Vue.h('p', props.description), props.showRetry ? Vue.h('button', '重新加载') : null]) })
}
