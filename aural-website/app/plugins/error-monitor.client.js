export default defineNuxtPlugin((nuxtApp) => {
  const { track } = useAuralTrack()
  const apiBase = usePublicApiBase()
  const route = useRoute()
  const toast = useState('global-toast')
  const chunkReloadManualMessage = '\u9875\u9762\u8d44\u6e90\u5df2\u66f4\u65b0\uff0c\u8bf7\u624b\u52a8\u5237\u65b0\u540e\u7ee7\u7eed\u6d4f\u89c8\u3002'

  const isChunkLoadError = (error) => {
    const message = String(error?.message || error || '')
    return /Failed to fetch dynamically imported module|Importing a module script failed|Unable to preload CSS|vite:preloadError|Loading chunk \d+ failed|ChunkLoadError/i.test(message)
  }

  const reloadAfterChunkError = (error) => {
    const buildId = window.__NUXT__?.config?.app?.buildId || 'unknown-build'
    const key = `hushi-chunk-reload:${buildId}:${window.location.pathname}`
    const hasReloaded = window.sessionStorage.getItem(key) === '1'

    report('chunk-load', error, {
      pagePath: route.fullPath,
      buildId,
      autoReload: !hasReloaded
    })

    if (hasReloaded) {
      toast.value = {
        show: true,
        message: chunkReloadManualMessage,
        type: 'error'
      }
      window.setTimeout(() => { toast.value.show = false }, 4500)
      return
    }

    window.sessionStorage.setItem(key, '1')
    window.setTimeout(() => window.location.reload(), 120)
  }

  const report = (type, error, extra = {}) => {
    const message = error?.message || String(error || 'Unknown frontend error')
    track('frontend_error', {
      ctaName: type,
      metadata: {
        type,
        message: message.slice(0, 500),
        stack: String(error?.stack || '').slice(0, 1000),
        ...extra
      }
    })
  }

  const reportEvent = (eventType, payload = {}) => {
    track(eventType, payload)
  }

  nuxtApp.vueApp.config.errorHandler = (error, instance, info) => {
    report('vue', error, { info })
  }

  window.addEventListener('error', (event) => {
    const target = event.target
    if (target && target !== window && target.tagName) {
      const source = target.currentSrc || target.src || target.href || ''
      reportEvent('resource_error', {
        entityType: String(target.tagName || '').toLowerCase(),
        entityTitle: source,
        metadata: {
          tagName: target.tagName,
          source: source.slice(0, 500),
          pagePath: route.fullPath
        }
      })
      return
    }
    report('window-error', event.error || event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    if (isChunkLoadError(event.reason)) {
      event.preventDefault()
      reloadAfterChunkError(event.reason)
      return
    }
    report('unhandled-rejection', event.reason)
  })

  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
    reloadAfterChunkError(event.payload || 'vite:preloadError')
  })

  const originalFetch = window.fetch?.bind(window)
  if (originalFetch) {
    window.fetch = async (...args) => {
      const startedAt = performance.now()
      try {
        const response = await originalFetch(...args)
        const url = String(args[0]?.url || args[0] || '')
        const isApi = apiBase.value && url.startsWith(apiBase.value)
        const durationMs = Math.round(performance.now() - startedAt)
        const isEventEndpoint = url.includes('/api/events')
        if (isApi && !isEventEndpoint && (!response.ok || durationMs >= 2500)) {
          reportEvent('api_error', {
            entityTitle: url,
            metadata: {
              url: url.slice(0, 500),
              status: response.status,
              durationMs,
              reason: response.ok ? 'slow-api' : 'http-error'
            }
          })
        }
        return response
      } catch (error) {
        const url = String(args[0]?.url || args[0] || '')
        if (!url.includes('/api/events')) reportEvent('api_error', {
          entityTitle: url,
          metadata: {
            url: url.slice(0, 500),
            message: String(error?.message || error).slice(0, 500),
            reason: 'fetch-exception'
          }
        })
        throw error
      }
    }
  }

  const reportPageTiming = () => {
    const nav = performance.getEntriesByType?.('navigation')?.[0]
    if (!nav) return
    const durationMs = Math.round(nav.loadEventEnd || nav.domContentLoadedEventEnd || nav.duration || 0)
    if (durationMs < 1800) return
    reportEvent('performance_metric', {
      entityType: 'page',
      entityTitle: route.fullPath,
      metadata: {
        metric: 'page_load',
        durationMs,
        domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd || 0),
        transferSize: nav.transferSize || 0
      }
    })
  }

  window.setTimeout(reportPageTiming, 2500)
})
