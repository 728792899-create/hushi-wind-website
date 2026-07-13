export default defineNuxtPlugin(() => {
  if (import.meta.server) return

  const { track } = useAuralTrack()

  let lcp = 0
  let fid = 0
  let cls = 0
  let ttfb = 0

  const reportMetric = (metric) => {
    const payload = {
      metric: metric.name,
      value: metric.value,
      rating: metric.rating,
      url: window.location.pathname
    }

    track('performance_metric', { metadata: payload })
  }

  if ('PerformanceObserver' in window) {
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const lastEntry = entries[entries.length - 1]
        lcp = lastEntry.renderTime || lastEntry.loadTime
        reportMetric({
          name: 'LCP',
          value: lcp,
          rating: lcp < 2500 ? 'good' : lcp < 4000 ? 'needs-improvement' : 'poor'
        })
      })
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true })

      const fidObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        entries.forEach((entry) => {
          fid = entry.processingStart - entry.startTime
          reportMetric({
            name: 'FID',
            value: fid,
            rating: fid < 100 ? 'good' : fid < 300 ? 'needs-improvement' : 'poor'
          })
        })
      })
      fidObserver.observe({ type: 'first-input', buffered: true })

      const clsObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        entries.forEach((entry) => {
          if (!entry.hadRecentInput) {
            cls += entry.value
          }
        })
        reportMetric({
          name: 'CLS',
          value: cls,
          rating: cls < 0.1 ? 'good' : cls < 0.25 ? 'needs-improvement' : 'poor'
        })
      })
      clsObserver.observe({ type: 'layout-shift', buffered: true })

      const navigationObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        entries.forEach((entry) => {
          ttfb = entry.responseStart - entry.requestStart
          reportMetric({
            name: 'TTFB',
            value: ttfb,
            rating: ttfb < 800 ? 'good' : ttfb < 1800 ? 'needs-improvement' : 'poor'
          })
        })
      })
      navigationObserver.observe({ type: 'navigation', buffered: true })
    } catch (error) {
      console.error('Performance monitoring error:', error)
    }
  }

  window.addEventListener('beforeunload', () => {
    if (lcp || fid || cls || ttfb) {
      track('performance_metric', {
        metadata: { metric: 'navigation_summary', lcp, fid, cls, ttfb, url: window.location.pathname }
      })
    }
  })
})
