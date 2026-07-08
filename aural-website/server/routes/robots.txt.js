const normalizeBase = (value, fallback) => String(value || fallback).replace(/\/$/, '')

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const siteUrl = normalizeBase(config.public.siteUrl, '')

  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api',
    '',
    `Sitemap: ${siteUrl}/sitemap.xml`
  ].join('\n')
})
