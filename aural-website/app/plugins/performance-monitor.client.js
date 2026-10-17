import { createMetricReporter } from '../utils/performanceMetrics.js'

export default defineNuxtPlugin((nuxtApp) => {
  if (import.meta.server) return
  const { track } = useAuralTrack()
  const observers = []
  let lcp = 0, fid = 0, cls = 0, ttfb = 0
  let summarySent = false
  const reporter = createMetricReporter({
    report: (payload) => track('performance_metric', { pagePath: payload.url, metadata: payload })
  })
  const reportMetric = (name, value, rating) => reporter.update({
    metric: name, value, rating, url: window.location.pathname
  })
  const observe = (type, callback) => {
    if (!('PerformanceObserver' in window)) return
    try {
      const observer = new PerformanceObserver(callback)
      observer.observe({ type, buffered: true })
      observers.push(observer)
    } catch { /* An unsupported metric must not disable the other observers. */ }
  }
  observe('largest-contentful-paint', (list) => {
    const entry = list.getEntries().at(-1)
    if (!entry) return
    lcp = entry.renderTime || entry.loadTime
    reportMetric('LCP', lcp, lcp < 2500 ? 'good' : lcp < 4000 ? 'needs-improvement' : 'poor')
  })
  observe('first-input', (list) => {
    const entry = list.getEntries()[0]
    if (!entry) return
    fid = entry.processingStart - entry.startTime
    reportMetric('FID', fid, fid < 100 ? 'good' : fid < 300 ? 'needs-improvement' : 'poor')
  })
  observe('layout-shift', (list) => {
    const delta = list.getEntries().reduce((sum, entry) =>
      sum + (!entry.hadRecentInput && Number.isFinite(entry.value) && entry.value > 0 ? entry.value : 0), 0)
    if (!delta) return
    cls += delta
    reportMetric('CLS', cls, cls < 0.1 ? 'good' : cls < 0.25 ? 'needs-improvement' : 'poor')
  })
  observe('navigation', (list) => {
    const entry = list.getEntries().at(-1)
    if (!entry) return
    ttfb = entry.responseStart - entry.requestStart
    reportMetric('TTFB', ttfb, ttfb < 800 ? 'good' : ttfb < 1800 ? 'needs-improvement' : 'poor')
  })

  const cleanup = () => {
    reporter.stop()
    observers.forEach(observer => observer.disconnect())
    window.removeEventListener('pagehide', onPageHide)
  }
  const onPageHide = (event) => {
    // A single terminal snapshot preserves the last values without allowing
    // repeated visibility changes to bypass the regular reporting interval.
    if (!event.persisted && !summarySent && (lcp || fid || cls || ttfb)) {
      summarySent = true
      track('performance_metric', { metadata: { metric: 'summary', lcp, fid, cls, ttfb, url: window.location.pathname } })
    }
    if (!event.persisted) cleanup()
  }
  window.addEventListener('pagehide', onPageHide)
  nuxtApp.vueApp.onUnmount(cleanup)
  if (import.meta.hot) import.meta.hot.dispose(cleanup)
})
