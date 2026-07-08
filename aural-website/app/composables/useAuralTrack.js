import { computed } from 'vue'

const VISITOR_KEY = 'hushi:visitor-id'
const SESSION_KEY = 'hushi:session-id'

const createId = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`

const safeReferrer = () => {
  if (process.server) return ''
  try {
    const referrer = window.document.referrer || ''
    return referrer && !referrer.includes(window.location.host) ? referrer : ''
  } catch {
    return ''
  }
}

const storageValue = (key, prefix) => {
  if (process.server) return ''
  try {
    const existing = window.localStorage.getItem(key) || window.sessionStorage.getItem(key)
    if (existing) return existing
    const next = createId(prefix)
    const storage = key === VISITOR_KEY ? window.localStorage : window.sessionStorage
    storage.setItem(key, next)
    return next
  } catch {
    return createId(prefix)
  }
}

const deviceCategory = () => {
  if (process.server) return 'server'
  const width = window.innerWidth || 0
  if (width < 768) return 'mobile'
  if (width < 1024) return 'tablet'
  return 'desktop'
}

export const useAuralTrack = () => {
  const route = useRoute()
  const eventUrl = useApiUrl('/api/events')

  const context = computed(() => ({
    pagePath: route.fullPath || route.path,
    source: typeof route.query.source === 'string' ? route.query.source : safeReferrer(),
    visitorId: storageValue(VISITOR_KEY, 'visitor'),
    sessionId: storageValue(SESSION_KEY, 'session')
  }))

  const track = async (eventType, payload = {}) => {
    if (process.server) return
    try {
      await $fetch(eventUrl.value, {
        method: 'POST',
        body: {
          eventType,
          ...context.value,
          ...payload,
          metadata: {
            ...(payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {}),
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            device: deviceCategory(),
            reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false
          }
        }
      })
    } catch {}
  }

  const guardPayload = () => context.value

  return { track, guardPayload }
}
