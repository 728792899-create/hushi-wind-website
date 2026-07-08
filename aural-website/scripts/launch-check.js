#!/usr/bin/env node

const DEFAULT_PAGES = ['/', '/products', '/support', '/artists', '/news', '/info/privacy', '/info/terms', '/info/warranty', '/info/brand-story']

const normalizeBase = (value) => String(value || '').trim().replace(/\/$/, '')
const siteUrl = normalizeBase(process.env.SITE_URL || process.env.NUXT_PUBLIC_SITE_URL)
const apiBase = normalizeBase(process.env.API_BASE || process.env.NUXT_PUBLIC_API_BASE)
const pages = String(process.env.LAUNCH_CHECK_PAGES || DEFAULT_PAGES.join(','))
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)
const maxHtmlMs = Number.parseInt(process.env.LAUNCH_CHECK_MAX_HTML_MS || '2500', 10)

const fail = (message) => {
  console.error(`Launch check failed: ${message}`)
  process.exit(1)
}

if (!siteUrl || !/^https?:\/\//i.test(siteUrl)) {
  fail('set SITE_URL or NUXT_PUBLIC_SITE_URL to the official website domain')
}

if (!apiBase || !/^https?:\/\//i.test(apiBase)) {
  fail('set API_BASE or NUXT_PUBLIC_API_BASE to the official API domain')
}

const getText = async (url) => {
  const startedAt = Date.now()
  const res = await fetch(url, { redirect: 'follow' })
  const text = await res.text()
  return { url, status: res.status, ok: res.ok, text, headers: res.headers, durationMs: Date.now() - startedAt }
}

const hasTag = (html, pattern) => pattern.test(html)

const checkStatic = async () => {
  const robots = await getText(`${siteUrl}/robots.txt`)
  if (!robots.ok) throw new Error(`robots.txt returned ${robots.status}`)
  if (!robots.text.includes(`${siteUrl}/sitemap.xml`)) throw new Error('robots.txt sitemap URL does not match SITE_URL')
  if (robots.text.includes('127.0.0.1') || robots.text.includes('localhost')) throw new Error('robots.txt contains local development URLs')

  const sitemap = await getText(`${siteUrl}/sitemap.xml`)
  if (!sitemap.ok) throw new Error(`sitemap.xml returned ${sitemap.status}`)
  if (!sitemap.text.includes(`<loc>${siteUrl}/`)) throw new Error('sitemap.xml does not contain official SITE_URL routes')
  if (sitemap.text.includes('127.0.0.1') || sitemap.text.includes('localhost')) throw new Error('sitemap.xml contains local development URLs')
  if (!/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/i.test(sitemap.text)) throw new Error('sitemap.xml missing lastmod entries')
}

const checkPage = async (path) => {
  const pagePath = path.startsWith('/') ? path : `/${path}`
  const result = await getText(`${siteUrl}${pagePath}`)
  if (!result.ok) throw new Error(`${pagePath} returned ${result.status}`)
  const html = result.text
  const missing = []
  const csp = result.headers.get('content-security-policy') || ''
  const requiredHeaders = [
    'x-content-type-options',
    'x-frame-options',
    'referrer-policy',
    'content-security-policy'
  ]
  requiredHeaders.forEach((header) => {
    if (!result.headers.get(header)) missing.push(`header:${header}`)
  })
  if (!hasTag(html, /<title>[^<]{4,}<\/title>/i)) missing.push('title')
  if (!hasTag(html, /<meta\s+name=["']description["'][^>]+content=["'][^"']{20,}["']/i)) missing.push('description')
  if (!hasTag(html, /<link\s+rel=["']canonical["'][^>]+href=["'][^"']+["']/i)) missing.push('canonical')
  if (!hasTag(html, /<meta\s+(property|name)=["']og:image["'][^>]+content=["'][^"']+["']/i)) missing.push('og:image')
  if (!hasTag(html, /<meta\s+(property|name)=["']og:title["'][^>]+content=["'][^"']+["']/i)) missing.push('og:title')
  if (html.includes('127.0.0.1') || html.includes('localhost')) missing.push('no-local-url')
  if (csp.includes('127.0.0.1') || csp.includes('localhost')) missing.push('csp:no-local-url')
  if (csp && !/connect-src/i.test(csp)) missing.push('csp:connect-src')
  if (result.durationMs > maxHtmlMs) missing.push(`slow-html:${result.durationMs}ms`)
  if (missing.length) throw new Error(`${pagePath} missing ${missing.join(', ')}`)
  return { path: pagePath, durationMs: result.durationMs }
}

const checkApi = async () => {
  const result = await getText(`${apiBase}/api/config`)
  if (!result.ok) throw new Error(`/api/config returned ${result.status}`)
  ;['x-content-type-options', 'x-frame-options', 'referrer-policy', 'content-security-policy'].forEach((header) => {
    if (!result.headers.get(header)) throw new Error(`/api/config missing security header ${header}`)
  })
  if (apiBase.startsWith('https://') && !result.headers.get('strict-transport-security')) {
    throw new Error('/api/config missing Strict-Transport-Security on HTTPS API')
  }

  const healthCandidates = ['/health', '/api/health']
  const healthResults = []
  for (const path of healthCandidates) {
    const health = await getText(`${apiBase}${path}`)
    healthResults.push(`${path}:${health.status}`)
    if (!health.ok) continue
    let data = null
    try { data = JSON.parse(health.text) } catch {}
    if (data?.status !== 'ok') throw new Error(`${path} returned unhealthy status`)
    if (data?.database?.status !== 'ok') throw new Error(`${path} database status is not ok`)
    return
  }
  throw new Error(`API health check failed (${healthResults.join(', ')})`)
}

const main = async () => {
  console.log(`Checking website: ${siteUrl}`)
  console.log(`Checking API: ${apiBase}`)
  await checkStatic()
  await checkApi()
  const results = []
  for (const path of pages) {
    results.push(await checkPage(path))
  }
  console.log('Launch check passed.')
  results.forEach((item) => console.log(`- ${item.path} ${item.durationMs}ms`))
}

main().catch((error) => fail(error.message || String(error)))
