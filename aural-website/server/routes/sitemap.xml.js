const escapeXml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

const normalizeBase = (value, fallback) => String(value || fallback).replace(/\/$/, '')

const formatDate = (value) => {
  if (!value) return new Date().toISOString().split('T')[0]
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date().toISOString().split('T')[0] : date.toISOString().split('T')[0]
}

const getAttrs = (item = {}) => item.attributes || item

const isPublicItem = (item = {}) => {
  const status = getAttrs(item).status
  return !status || ['active', 'published'].includes(status)
}

const itemDate = (item = {}) => {
  const attrs = getAttrs(item)
  return attrs.updatedAt || item.updatedAt || attrs.createdAt || item.createdAt || attrs.date || item.date || ''
}

const latestDate = (items = [], fallback = '') => {
  const latest = items
    .map(itemDate)
    .map((value) => new Date(value))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0]
  return formatDate(latest || fallback)
}

const fetchCollection = async (url) => {
  try {
    const result = await $fetch(url)
    return Array.isArray(result?.data) ? result.data : []
  } catch {
    return []
  }
}

const fetchSingle = async (url) => {
  try {
    return await $fetch(url)
  } catch {
    return null
  }
}

export default defineCachedEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const siteUrl = normalizeBase(config.public.siteUrl, '')
  const apiBase = normalizeBase(config.apiInternalBase || config.public.apiBase, '')
  const today = new Date().toISOString().split('T')[0]

  const [
    siteConfig,
    productsRaw,
    articlesRaw,
    pagesRaw,
    faqsRaw,
    downloadsRaw,
    guidesRaw,
    audioSolutionsRaw,
    artistsRaw,
    timelinesRaw
  ] = await Promise.all([
    fetchSingle(`${apiBase}/api/config`),
    fetchCollection(`${apiBase}/api/products`),
    fetchCollection(`${apiBase}/api/articles`),
    fetchCollection(`${apiBase}/api/page-contents`),
    fetchCollection(`${apiBase}/api/support-faqs`),
    fetchCollection(`${apiBase}/api/support-downloads`),
    fetchCollection(`${apiBase}/api/quick-guides`),
    fetchCollection(`${apiBase}/api/audio-solutions`),
    fetchCollection(`${apiBase}/api/artists`),
    fetchCollection(`${apiBase}/api/brand-timelines`)
  ])

  const products = productsRaw.filter(isPublicItem)
  const articles = articlesRaw.filter(isPublicItem)
  const pages = pagesRaw.filter(isPublicItem)
  const faqs = faqsRaw.filter(isPublicItem)
  const downloads = downloadsRaw.filter(isPublicItem)
  const guides = guidesRaw.filter(isPublicItem)
  const audioSolutions = audioSolutionsRaw.filter(isPublicItem)
  const artists = artistsRaw.filter(isPublicItem)
  const timelines = timelinesRaw.filter(isPublicItem)
  const configDate = formatDate(siteConfig?.updatedAt || siteConfig?.createdAt || today)
  const pageDateBySlug = (slug, fallback = today) => latestDate(pages.filter((item) => getAttrs(item).slug === slug), fallback)

  const routes = [
    { loc: '/', priority: '1.0', changefreq: 'weekly', lastmod: latestDate([siteConfig, ...products, ...articles], configDate) },
    { loc: '/products', priority: '0.9', changefreq: 'daily', lastmod: latestDate(products, configDate) },
    { loc: '/support', priority: '0.8', changefreq: 'weekly', lastmod: latestDate([...faqs, ...downloads, ...guides], configDate) },
    { loc: '/audio', priority: '0.8', changefreq: 'weekly', lastmod: latestDate(audioSolutions, configDate) },
    { loc: '/artists', priority: '0.7', changefreq: 'weekly', lastmod: latestDate(artists, configDate) },
    { loc: '/news', priority: '0.7', changefreq: 'daily', lastmod: latestDate(articles, configDate) },
    { loc: '/info/brand-story', priority: '0.7', changefreq: 'monthly', lastmod: latestDate(timelines, pageDateBySlug('brand-story', configDate)) },
    { loc: '/info/privacy', priority: '0.4', changefreq: 'yearly', lastmod: pageDateBySlug('privacy', configDate) },
    { loc: '/info/terms', priority: '0.4', changefreq: 'yearly', lastmod: pageDateBySlug('terms', configDate) },
    { loc: '/info/warranty', priority: '0.5', changefreq: 'monthly', lastmod: pageDateBySlug('warranty', configDate) },
    ...products.map((item) => {
      const attrs = getAttrs(item)
      return {
      loc: `/products/${attrs.slug || item.id}`,
      priority: '0.8',
      changefreq: 'weekly',
      lastmod: formatDate(itemDate(item))
      }
    }),
    ...articles.map((item) => {
      return {
      loc: `/news/${item.id}`,
      priority: '0.6',
      changefreq: 'monthly',
      lastmod: formatDate(itemDate(item))
      }
    }),
    ...pages.filter((item) => getAttrs(item).slug).map((item) => {
      const attrs = getAttrs(item)
      return {
      loc: `/info/${attrs.slug}`,
      priority: '0.6',
      changefreq: 'monthly',
      lastmod: formatDate(itemDate(item))
      }
    })
  ]

  const uniqueRoutes = [...new Map(routes.map((route) => [route.loc, route])).values()]
  const body = uniqueRoutes.map((route) => [
    '  <url>',
    `    <loc>${escapeXml(`${siteUrl}${route.loc}`)}</loc>`,
    `    <lastmod>${escapeXml(route.lastmod)}</lastmod>`,
    `    <changefreq>${escapeXml(route.changefreq)}</changefreq>`,
    `    <priority>${escapeXml(route.priority)}</priority>`,
    '  </url>'
  ].join('\n')).join('\n')

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`
}, {
  maxAge: 60 * 60,
  swr: true,
  getKey: () => 'sitemap'
})
