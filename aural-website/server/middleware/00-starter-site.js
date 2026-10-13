import { enforceStarterBoundary } from '../utils/starterBoundary.js'
export default defineEventHandler(event => enforceStarterBoundary(event, useRuntimeConfig(event).public.siteMode))
