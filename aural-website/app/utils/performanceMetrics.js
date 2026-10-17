// Keep at most one latest sample per metric. Animation frames must never become
// one HTTP request each; unchanged measurements do not consume the budget.
export function createMetricReporter({ report, intervalMs = 15000, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const pending = new Map()
  const sent = new Map()
  const allowed = new Set(['LCP', 'FID', 'CLS', 'TTFB'])
  let timer = null
  let stopped = false
  let lastFlush = now()

  const arm = () => {
    if (stopped || timer !== null || !pending.size) return
    timer = setTimer(() => { timer = null; flush() }, Math.max(0, intervalMs - (now() - lastFlush)))
  }
  const flush = () => {
    if (stopped || !pending.size) return
    if (now() - lastFlush < intervalMs) { arm(); return }
    lastFlush = now()
    const batch = [...pending.values()]
    pending.clear()
    for (const metric of batch) {
      sent.set(metric.metric, metric.value)
      report(metric)
    }
  }
  return {
    update(metric) {
      if (stopped || !allowed.has(metric.metric) || !Number.isFinite(metric.value) || metric.value < 0) return
      if (sent.get(metric.metric) === metric.value) pending.delete(metric.metric)
      else pending.set(metric.metric, metric)
      arm()
    },
    flush,
    stop() {
      stopped = true
      if (timer !== null) clearTimer(timer)
      timer = null
      pending.clear()
    }
  }
}
