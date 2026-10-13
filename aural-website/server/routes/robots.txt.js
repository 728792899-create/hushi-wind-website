import { parseSiteMode } from '../../app/utils/siteMode.js'
const normalizeBase = (value, fallback) => String(value || fallback).replace(/\/$/, '')

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const siteUrl = normalizeBase(config.public.siteUrl, '')

  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  if (parseSiteMode(config.public.siteMode) === 'starter') return [
    'User-agent: *', 'Disallow: /', 'Allow: /$', 'Allow: /news$', 'Allow: /news/',
    'Allow: /_nuxt/', 'Allow: /launch-assets/', 'Disallow: /*?*previewToken=', '',
    `Sitemap: ${siteUrl}/sitemap.xml`
  ].join('\n')
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api',
    '',
    `Sitemap: ${siteUrl}/sitemap.xml`
  ].join('\n')
})
