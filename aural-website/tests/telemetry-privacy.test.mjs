import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { sanitizeTelemetry } from '../app/utils/telemetryPrivacy.js'

const source = fs.readFileSync(new URL('../app/composables/useAuralTrack.js', import.meta.url), 'utf8')
  .replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')
const secret = 'synthetic-preview-ticket-credential'
const preview = `/products/1?utm_source=newsletter&previewToken=${secret}&source=campaign`

function harness({ path = preview, sourceQuery, referrer = '', siteMode = 'full' } = {}) {
  const sent = []
  const values = new Map()
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }
  const window = {
    document: { referrer }, location: { host: 'site.example.invalid' },
    innerWidth: 390, innerHeight: 844, localStorage: storage, sessionStorage: storage,
    matchMedia: () => ({ matches: false })
  }
  const useTrack = Function('computed', 'useRoute', 'useApiUrl', '$fetch', 'window', 'process', 'sanitizeTelemetry', 'useRuntimeConfig',
    source + '; return useAuralTrack')(
    fn => ({ get value() { return fn() } }),
    () => ({ fullPath: path, path: '/products/1', query: { source: sourceQuery } }),
    () => ({ value: '/api/events' }), async (url, options) => sent.push(options.body),
    window, { server: false }, sanitizeTelemetry, () => ({ public: { siteMode } })
  )
  return { ...useTrack(), sent, values }
}

test('page tracking and form context remove preview credentials but preserve campaign parameters', async () => {
  const h = harness()
  await h.track('page_view')
  for (const payload of [h.sent[0], h.guardPayload()]) {
    assert.equal(JSON.stringify(payload).includes(secret), false, 'preview credential must not leave the tracking boundary')
    assert.match(payload.pagePath, /utm_source=newsletter/)
    assert.match(payload.pagePath, /source=campaign/)
  }
})

test('payload overrides and nested error URLs cannot reintroduce credentials', async () => {
  const h = harness({ path: '/support?utm_source=normal' })
  await h.track('api_error', {
    pagePath: preview,
    source: `https://ref.example.invalid${preview}`,
    entityTitle: `GET https://api.example.invalid/api/products/1?previewToken=${secret} failed`,
    metadata: { source: preview, nested: [{ url: `https://api.example.invalid${preview}` }], previewToken: secret }
  })
  assert.equal(JSON.stringify(h.sent[0]).includes(secret), false, 'payload spread and nested metadata must be sanitized last')
  assert.equal(h.sent[0].metadata.device, 'mobile')
  assert.match(h.sent[0].pagePath, /utm_source=newsletter/)
})

test('source and external referrer URLs remove encoded credentials without losing ordinary attribution', async () => {
  const referrer = `https://ref.example.invalid/?next=${encodeURIComponent(`https://other.example.invalid/?previewToken=${secret}&utm_source=partner`)}&source=referral`
  for (const options of [{ sourceQuery: referrer }, { referrer }]) {
    const h = harness(options)
    await h.track('page_view')
    assert.equal(JSON.stringify(h.sent[0]).includes(secret), false)
    assert.match(decodeURIComponent(h.sent[0].source), /utm_source=partner/)
    assert.match(h.sent[0].source, /source=referral/)
  }
})


test('starter tracking neither sends events nor creates visitor/session storage', async () => {
  const h = harness({ siteMode: 'starter' })
  await h.track('page_view', { pagePath: preview })
  await h.track('frontend_error', { metadata: { previewToken: secret } })
  assert.deepEqual(h.sent, [])
  assert.equal(h.values.size, 0)
  assert.deepEqual(h.guardPayload(), {})
})
