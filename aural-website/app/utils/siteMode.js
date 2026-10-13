export const STARTER_DESCRIPTION = '认识管乐的声音与结构，阅读入门、练习准备和日常照护知识。'
export function parseSiteMode(value) {
  if (value === undefined) return 'full'
  if (value !== 'full' && value !== 'starter') throw new Error('NUXT_PUBLIC_SITE_MODE must be full or starter')
  return value
}
export function starterPageAllowed(path) {
  return path === '/' || /^\/news\/?$/.test(path) || /^\/news\/[1-9]\d*\/?$/.test(path)
}
export function starterRequestAllowed(path, method = 'GET') {
  if (!['GET', 'HEAD'].includes(method)) return false
  if (starterPageAllowed(path) || ['/robots.txt', '/sitemap.xml', '/favicon.ico'].includes(path)) return true
  if (path === '/launch-assets/music-studio.jpg') return true
  if (/^\/launch-assets\/(wind-ensemble|trumpet|clarinet|saxophone)\.svg$/.test(path)) return true
  return /^\/_nuxt\/[A-Za-z0-9_./-]+\.(js|mjs|css|json|woff2?|png|webp|svg)$/.test(path) &&
    !path.split('/').some(part => part === '.' || part === '..')
}
