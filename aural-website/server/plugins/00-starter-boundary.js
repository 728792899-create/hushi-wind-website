import { installStarterBoundary } from '../utils/starterBoundary.js'
export default defineNitroPlugin(nitro => {
  installStarterBoundary(nitro.h3App, event => useRuntimeConfig(event).public.siteMode)
})
