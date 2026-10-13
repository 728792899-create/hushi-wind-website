import { parseSiteMode, starterPageAllowed } from '../utils/siteMode.js'
export default defineNuxtRouteMiddleware(to => {
  if (parseSiteMode(useRuntimeConfig().public.siteMode) === 'starter' && !starterPageAllowed(to.path))
    throw createError({ statusCode: 404, statusMessage: 'Page not found', fatal: true })
})
