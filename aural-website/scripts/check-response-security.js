#!/usr/bin/env node

const normalizeBase = (value) => String(value || '').trim().replace(/\/$/, '')
const siteUrl = normalizeBase(process.env.SITE_URL || process.env.NUXT_PUBLIC_SITE_URL)
const forbiddenPatterns = [
  '127.0.0.1',
  'localhost'
]

const fail = (message) => {
  console.error(`Website response security check failed: ${message}`)
  process.exit(1)
}

if (!siteUrl || !/^https?:\/\//i.test(siteUrl)) {
  fail('set SITE_URL or NUXT_PUBLIC_SITE_URL to the official website domain')
}

const hasForbidden = (value) => forbiddenPatterns.some((pattern) => String(value || '').includes(pattern))

const main = async () => {
  const res = await fetch(siteUrl, { redirect: 'follow' })
  const html = await res.text()
  const csp = res.headers.get('content-security-policy') || ''

  if (!res.ok) fail(`${siteUrl} returned ${res.status}`)
  if (!csp) fail('missing Content-Security-Policy header')
  if (!/connect-src/i.test(csp)) fail('Content-Security-Policy missing connect-src')
  if (hasForbidden(csp)) fail('Content-Security-Policy contains local development address')
  if (hasForbidden(html)) fail('homepage HTML contains local development address')

  console.log('Website response security check passed.')
  console.log(`site=${siteUrl}`)
  console.log(`status=${res.status}`)
  console.log(`csp=${csp}`)
}

main().catch((error) => fail(error.message || String(error)))
