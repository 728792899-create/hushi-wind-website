#!/usr/bin/env node

const normalizeBase = (value) => String(value || '').trim().replace(/\/$/, '')
const siteUrl = normalizeBase(process.env.SITE_URL || process.env.NUXT_PUBLIC_SITE_URL || 'http://127.0.0.1:3000')
const apiBase = normalizeBase(process.env.API_BASE || process.env.NUXT_PUBLIC_API_BASE || 'http://127.0.0.1:1337')
const maxHtmlMs = Number.parseInt(process.env.DESKTOP_CHECK_MAX_HTML_MS || '3000', 10)

const requiredStaticPages = [
  { path: '/', label: '首页', mustContain: ['胡氏管乐'] },
  { path: '/products', label: '产品目录', mustContain: ['产品目录', '对比'] },
  { path: '/support', label: '服务支持', mustContain: ['Support', 'FAQ'] },
  { path: '/artists', label: '艺术家', mustContain: ['Master'] },
  { path: '/news', label: '新闻列表', mustContain: ['News'] },
  { path: '/info/brand-story', label: '品牌故事', mustContain: ['品牌', 'HUSHI'] }
]

const fail = (message) => {
  console.error(`Desktop check failed: ${message}`)
  process.exit(1)
}

const getText = async (url, options = {}) => {
  const startedAt = Date.now()
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'HushiDesktopCheck/1.0 (desktop validation)',
      ...options.headers
    },
    ...options
  })
  const text = await res.text()
  return { url, status: res.status, ok: res.ok, text, headers: res.headers, durationMs: Date.now() - startedAt }
}

const getJson = async (url) => {
  const result = await getText(url)
  if (!result.ok) throw new Error(`${url} returned ${result.status}`)
  try {
    return JSON.parse(result.text)
  } catch {
    throw new Error(`${url} did not return valid JSON`)
  }
}

const assertSeo = (html, label) => {
  const missing = []
  if (!/<title>[^<]{4,}<\/title>/i.test(html)) missing.push('title')
  if (!/<meta\s+name=["']description["'][^>]+content=["'][^"']{20,}["']/i.test(html)) missing.push('description')
  if (!/<link\s+rel=["']canonical["'][^>]+href=["'][^"']+["']/i.test(html)) missing.push('canonical')
  if (!/<meta\s+(property|name)=["']og:title["'][^>]+content=["'][^"']+["']/i.test(html)) missing.push('og:title')
  if (!/<meta\s+(property|name)=["']og:image["'][^>]+content=["'][^"']+["']/i.test(html)) missing.push('og:image')
  if (html.includes('127.0.0.1') || html.includes('localhost')) missing.push('local-url')
  if (missing.length) throw new Error(`${label} missing ${missing.join(', ')}`)
}

const assertPage = async ({ path, label, mustContain = [] }) => {
  const result = await getText(`${siteUrl}${path}`)
  if (!result.ok) throw new Error(`${label} ${path} returned ${result.status}`)
  if (result.durationMs > maxHtmlMs) throw new Error(`${label} ${path} is slow: ${result.durationMs}ms`)
  assertSeo(result.text, label)
  const missingText = mustContain.filter((text) => !result.text.includes(text))
  if (missingText.length) throw new Error(`${label} missing content: ${missingText.join(', ')}`)
  return { path, label, durationMs: result.durationMs }
}

const firstPublishedItem = (rows) => {
  const list = Array.isArray(rows?.data) ? rows.data : []
  return list.find((item) => {
    const attrs = item.attributes || item
    return !attrs.status || ['published', 'active'].includes(attrs.status)
  }) || list[0]
}

const main = async () => {
  if (!/^https?:\/\//i.test(siteUrl)) fail('set SITE_URL or NUXT_PUBLIC_SITE_URL')
  if (!/^https?:\/\//i.test(apiBase)) fail('set API_BASE or NUXT_PUBLIC_API_BASE')

  console.log(`Desktop checking website: ${siteUrl}`)
  console.log(`Desktop checking API: ${apiBase}`)

  const results = []
  for (const page of requiredStaticPages) {
    results.push(await assertPage(page))
  }

  const products = await getJson(`${apiBase}/api/products`)
  const product = firstPublishedItem(products)
  if (!product) throw new Error('products API returned no usable product')
  const productAttrs = product.attributes || product
  results.push(await assertPage({
    path: `/products/${productAttrs.slug || product.id}`,
    label: '产品详情',
    mustContain: ['预约试奏', '咨询报价']
  }))

  const articles = await getJson(`${apiBase}/api/articles`)
  const article = firstPublishedItem(articles)
  if (article) {
    const articleAttrs = article.attributes || article
    results.push(await assertPage({
      path: `/news/${articleAttrs.slug || article.id}`,
      label: '新闻详情',
      mustContain: ['返回资讯中心']
    }))
  } else {
    console.log('Skipping news detail: no article returned by API.')
  }

  console.log('Desktop check passed.')
  results.forEach((item) => console.log(`- ${item.label} ${item.path} ${item.durationMs}ms`))
}

main().catch((error) => fail(error.message || String(error)))
