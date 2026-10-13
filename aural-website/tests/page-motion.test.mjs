import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createPageMotion } from '../app/utils/pageMotion.js'

// Exercise GSAP's actual media-query contexts with plain animation targets; no browser or timer sleeps.
let reduced = false, now = Date.now(), outside
const listeners = new Set(), originalNow = Date.now
Date.now = () => (now += 10)
globalThis.window = {
  document: { querySelectorAll: () => outside ? [outside] : [] },
  matchMedia: query => ({
    get matches() { return query.includes('no-preference') ? !reduced : query.includes('reduce') ? reduced : false },
    addListener: callback => listeners.add(callback), removeListener: callback => listeners.delete(callback)
  })
}
const { gsap: core } = await import('gsap/gsap-core')
core.ticker.sleep()
after(() => { core.globalTimeline.clear(); core.ticker.sleep(); delete globalThis.window; Date.now = originalNow })
const setReduced = value => { reduced = value; for (const callback of listeners) callback() }
const target = () => ({ opacity: 1, x: 0, y: 0, scale: 1, yPercent: 0, querySelector: () => null })
const coreOptions = ({ scrollTrigger, clearProps, ...vars }) => ({ ...vars, delay: 0, paused: true })
const gsap = {
  matchMedia: scope => core.matchMedia(scope), context: (...args) => core.context(...args),
  utils: core.utils, registerPlugin() {},
  from: (items, vars) => core.from(items, coreOptions(vars)),
  to: (items, vars) => core.to(items, coreOptions(vars))
}

async function pageFixture(file, delayed = false) {
  const source = await fs.readFile(new URL(`../app/pages/${file}`, import.meta.url), 'utf8')
  const start = source.indexOf('const initAnimations ='), end = source.indexOf('\n}', start) + 2
  assert.ok(start >= 0 && end > start, 'actual page animation initializer is required')
  const body = source.slice(start, end)
  const cleanupStart = source.indexOf('onBeforeUnmount(() => {')
  const cleanup = source.slice(cleanupStart, source.indexOf('\n})', cleanupStart) + 3)
  const inside = target(), foreign = target(), root = { querySelectorAll: () => [inside] }
  outside = foreign
  let release, dispose
  const gate = delayed ? new Promise(resolve => { release = resolve }) : Promise.resolve()
  const scope = {
    gsap, ScrollTrigger: { refresh() {}, getAll: () => [] }, scrollTriggerLib: null,
    loadGsap: async () => { await gate; return { gsap, ScrollTrigger: { refresh() {} } } },
    process: { server: false, client: false }, pageRoot: { value: root }, product: { value: {} },
    createPageMotion, useGsapCleanup: context => context?.revert(),
    applicationSession: { value: 0 }, inquirySession: { value: 0 },
    onBeforeUnmount: callback => { dispose = callback }
  }
  const run = Function(...Object.keys(scope), `let ctx; let animationGeneration = 0; let pageDisposed = false;\n${body}\n${cleanup}\nreturn initAnimations`)(...Object.values(scope))
  return { run, inside, foreign, release, dispose: () => dispose() }
}

for (const file of ['index.vue', 'artists.vue', 'news/index.vue', 'products/[id].vue', 'info/brand-story.vue']) {
  test(`${file}: actual initializer respects initial and changing motion preferences within its own root`, async () => {
    const page = await pageFixture(file)
    try {
      setReduced(true)
      await page.run()
      assert.equal(page.inside.opacity, 1)
      assert.equal(page.foreign.opacity, 1)
      setReduced(false)
      assert.equal(page.inside.opacity, 0, 'normal animation resumes when the preference permits it')
      assert.equal(page.foreign.opacity, 1, 'another page must not receive these selectors')
      setReduced(true)
      assert.equal(page.inside.opacity, 1, 'live preference changes revert opacity before stopping')
      assert.equal(core.getTweensOf(page.inside).length, 0)
      setReduced(false)
      assert.equal(page.inside.opacity, 0)
      page.dispose()
      assert.equal(page.inside.opacity, 1)
      assert.equal(core.getTweensOf(page.inside).length, 0)
      setReduced(true); setReduced(false)
      assert.equal(page.inside.opacity, 1, 'unmounted pages must not reactivate')
    } finally { page.dispose(); core.globalTimeline.clear(); core.ticker.sleep() }
  })
}

test('home: a late dynamic GSAP import cannot animate a page that has already unmounted', async () => {
  const page = await pageFixture('index.vue', true)
  try {
    setReduced(false)
    const pending = page.run()
    page.dispose(); page.release(); await pending
    assert.equal(page.inside.opacity, 1)
    assert.equal(page.foreign.opacity, 1)
    assert.equal(core.getTweensOf(page.inside).length, 0)
  } finally { page.dispose(); core.globalTimeline.clear(); core.ticker.sleep() }
})

test('page motion disposal leaves another scoped context running', () => {
  setReduced(false)
  const one = target(), two = target()
  const first = createPageMotion(gsap, { querySelectorAll: () => [one] }, () => gsap.from('.reveal', { opacity: 0 }))
  const second = createPageMotion(gsap, { querySelectorAll: () => [two] }, () => gsap.from('.reveal', { opacity: 0 }))
  try {
    first.revert()
    assert.equal(one.opacity, 1)
    assert.equal(two.opacity, 0)
    assert.ok(core.getTweensOf(two).length > 0)
  } finally { first.revert(); second.revert(); core.ticker.sleep() }
})
