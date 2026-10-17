export const isRequestAbort = (error) => error?.name === 'AbortError' || error?.cause?.name === 'AbortError'

function responseError(error) {
  // Nuxt wraps FetchError in an H3Error; response headers remain on cause.
  let current = error
  for (let depth = 0; current && depth < 4; depth++, current = current.cause) {
    if (current.response) return current
  }
  return error
}

export function recoveryDelay(error, attempt, now = Date.now()) {
  if (!error || isRequestAbort(error) || attempt >= 3) return null
  const original = responseError(error)
  const status = Number(error.statusCode || error.status || original.response?.status || 0)
  if (status && ![408, 425, 429, 500, 502, 503, 504].includes(status)) return null
  const retryAfter = original.response?.headers?.get?.('retry-after')
  if (retryAfter) {
    const seconds = Number(retryAfter)
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - now
    // Very long server backoffs need an explicit retry. Never overflow a
    // browser timer and accidentally turn a long backoff into a tight loop.
    if (Number.isFinite(delay) && delay >= 0) return delay <= 300000 ? Math.max(1000, delay + 250) : null
  }
  // SSR errors may not carry response headers. Let the original one-minute
  // server window expire instead of immediately repeating a rejected request.
  return status === 429 ? 61000 : [1500, 4000, 12000][attempt]
}

export function createRequestRecovery({ getError, isPending, refresh, enabled = () => true, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let timer = null
  let running = false
  let stopped = false
  let attempts = 0
  const cancel = () => {
    if (timer !== null) clearTimer(timer)
    timer = null
  }
  const sync = () => {
    if (stopped) return
    if (!getError()) { cancel(); attempts = 0; return }
    if (!enabled()) { cancel(); return }
    if (timer !== null || running || isPending()) return
    const delay = recoveryDelay(getError(), attempts, now())
    if (delay === null) return
    timer = setTimer(async () => {
      timer = null
      if (stopped || !enabled() || isPending() || !getError()) return
      attempts++
      running = true
      try { await refresh({ dedupe: 'defer' }) } catch { /* Error refs retain the failure for the UI. */ }
      finally { running = false; sync() }
    }, delay)
  }
  return {
    sync,
    async retry() {
      if (stopped || running || isPending()) return
      cancel()
      attempts = 0
      running = true
      try { await refresh({ dedupe: 'defer' }) } catch {}
      finally { running = false; sync() }
    },
    stop() { stopped = true; cancel() }
  }
}
