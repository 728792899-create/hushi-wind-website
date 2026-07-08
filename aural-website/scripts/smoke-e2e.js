#!/usr/bin/env node

const normalizeBase = (value) => String(value || '').trim().replace(/\/$/, '')
const siteUrl = normalizeBase(process.env.SITE_URL || process.env.NUXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000')
const apiBase = normalizeBase(process.env.API_BASE || process.env.NUXT_PUBLIC_API_BASE || 'http://127.0.0.1:1337')
const adminUser = process.env.ADMIN_USERNAME || ''
const adminPassword = process.env.ADMIN_PASSWORD || ''
const allowWrite = process.env.SMOKE_WRITE === '1'

const fail = (message) => {
  console.error(`Smoke E2E failed: ${message}`)
  process.exit(1)
}

const requestJson = async (url, options = {}) => {
  const res = await fetch(url, options)
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch {}
  if (!res.ok) throw new Error(`${url} returned ${res.status}: ${text.slice(0, 180)}`)
  return data
}

const requestText = async (url) => {
  const res = await fetch(url)
  const text = await res.text()
  if (!res.ok) throw new Error(`${url} returned ${res.status}`)
  return text
}

const assertPage = async (path, label) => {
  const html = await requestText(`${siteUrl}${path}`)
  if (!/<title>[^<]+<\/title>/i.test(html)) throw new Error(`${label} missing title`)
  if (!/<link\s+rel=["']canonical["']/i.test(html)) throw new Error(`${label} missing canonical`)
  return html
}

const assertApiList = async (path, label) => {
  const data = await requestJson(`${apiBase}${path}`)
  if (!Array.isArray(data?.data)) throw new Error(`${label} response missing data array`)
  return data
}

const postEvent = async (eventType, payload = {}) => {
  await requestJson(`${apiBase}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventType,
      pagePath: '/smoke-e2e',
      visitorId: 'smoke',
      sessionId: 'smoke',
      ...payload
    })
  })
}

const main = async () => {
  await assertPage('/', 'home')
  const productsHtml = await assertPage('/products', 'products')
  if (!productsHtml.includes('加入对比') && !productsHtml.includes('对比')) throw new Error('products page missing compare UI')
  await assertPage('/support', 'support')
  await assertPage('/artists', 'artists')
  await assertPage('/news', 'news')

  const products = await assertApiList('/api/products', 'products API')
  const product = products?.data?.[0]
  if (!product) throw new Error('products API returned no products')
  const productAttrs = product.attributes || product
  const detailHtml = await assertPage(`/products/${productAttrs.slug || product.id}`, 'product detail')
  if (!detailHtml.includes('预约试奏') || !detailHtml.includes('咨询报价')) throw new Error('product detail missing conversion CTA')

  const articles = await assertApiList('/api/articles', 'articles API')
  const article = articles?.data?.[0]
  if (article) {
    const articleAttrs = article.attributes || article
    await assertPage(`/news/${articleAttrs.slug || article.id}`, 'news detail')
  }

  await assertApiList('/api/support-faqs', 'FAQ API')
  await assertApiList('/api/support-downloads', 'downloads API')
  await assertApiList('/api/quick-guides', 'guides API')
  await assertApiList('/api/page-contents', 'page contents API')
  await postEvent('search', { searchTerm: 'smoke' })
  await postEvent('faq_feedback', { pagePath: '/support', entityType: 'faq', entityId: 'smoke', entityTitle: 'Smoke FAQ', metadata: { helpful: false } })
  await postEvent('performance_metric', { metadata: { metric: 'smoke_page_load', durationMs: 1234 } })

  if (allowWrite) {
    await postEvent('resource_error', { entityType: 'img', entityTitle: 'smoke-resource', metadata: { source: 'smoke' } })
    await postEvent('api_error', { entityTitle: 'smoke-api', metadata: { status: 599, reason: 'smoke' } })
    await postEvent('form_submit_failed', { entityType: 'smoke', ctaName: 'smoke-form', metadata: { message: 'smoke' } })
  }

  if (adminUser && adminPassword) {
    const login = await requestJson(`${apiBase}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: adminUser, password: adminPassword })
    })
    if (!login?.token) throw new Error('admin login returned no token')
    await requestJson(`${apiBase}/api/auth/session`, { headers: { Authorization: `Bearer ${login.token}` } })
    await requestJson(`${apiBase}/api/admin/analytics`, { headers: { Authorization: `Bearer ${login.token}` } })
    if (allowWrite) {
      await requestJson(`${apiBase}/api/dashboard/stats`, { headers: { Authorization: `Bearer ${login.token}` } })
    }
  } else {
    console.log('Skipping admin login smoke: ADMIN_USERNAME / ADMIN_PASSWORD not provided.')
  }

  console.log('Smoke E2E passed.')
}

main().catch((error) => fail(error.message || String(error)))
