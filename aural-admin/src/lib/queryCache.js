const copy = (value) => JSON.parse(JSON.stringify(value))
export const queryCancelled = () => Object.assign(new Error('查询已取消'), { code: 'ERR_CANCELED' })
export const isQueryCancelled = (error) => error?.code === 'ERR_CANCELED'

// Only JSON list responses belong here. Never persist private response bodies.
// Consumers share transport, but cancelling one consumer must not cancel another.
export function createQueryCache({ read, getScope, now = Date.now, ttlMs = 15000, maxEntries = 24 }) {
  const entries = new Map(), pending = new Map()
  let scope, epoch = 0
  const keyFor = (url, params = {}) => JSON.stringify([url, Object.keys(params).sort().map(key => [key, params[key]])])
  function clear({ exceptSignal, retry = false } = {}) {
    epoch++
    entries.clear()
    for (const [key, entry] of pending) {
      // The request reporting a real permission error must deliver that error,
      // rather than being converted into an intentionally silent cancellation.
      if (exceptSignal && entry.controller.signal === exceptSignal) { entry.epoch = epoch; continue }
      entry.controller.abort()
      const error = retry ? Object.assign(new Error('列表数据已更新'), { code: 'ERR_QUERY_INVALIDATED' }) : queryCancelled()
      for (const consumer of [...entry.consumers]) consumer.reject(error)
      pending.delete(key)
    }
  }
  function syncScope() {
    const current = getScope()
    if (current !== scope) { clear(); scope = current }
    return current
  }
  function get(url, params = {}, { signal, force = false } = {}) {
    const currentScope = syncScope(), key = keyFor(url, params)
    if (signal?.aborted) return Promise.reject(queryCancelled())
    const cached = entries.get(key)
    if (!force && currentScope && cached && now() - cached.at < ttlMs) {
      entries.delete(key); entries.set(key, cached)
      return Promise.resolve(copy(cached.data))
    }
    let entry = pending.get(key)
    if (!entry) {
      entry = { controller: new AbortController(), consumers: new Set(), epoch, scope: currentScope }
      pending.set(key, entry)
      const finish = (error, data) => {
        if (pending.get(key) === entry) pending.delete(key)
        const valid = entry.epoch === epoch && entry.scope === getScope() && !entry.controller.signal.aborted
        if (!error && valid) {
          try { data = copy(data) } catch { error = new Error('列表响应格式不正确') }
        }
        if (!error && valid && currentScope) {
          entries.delete(key)
          entries.set(key, { data, at: now() })
          while (entries.size > maxEntries) entries.delete(entries.keys().next().value)
        }
        for (const consumer of [...entry.consumers]) {
          if (!valid) consumer.reject(queryCancelled())
          else if (error) consumer.reject(error)
          else consumer.resolve(copy(data))
        }
      }
      Promise.resolve().then(() => {
        if (entry.controller.signal.aborted) throw queryCancelled()
        return read(url, params, entry.controller.signal)
      }).then(data => finish(null, data), error => finish(error))
    }
    return new Promise((resolve, reject) => {
      const cleanup = () => { signal?.removeEventListener('abort', cancel); entry.consumers.delete(consumer) }
      const consumer = {
        resolve: data => { cleanup(); resolve(data) },
        reject: error => { cleanup(); reject(error) },
      }
      const cancel = () => {
        consumer.reject(queryCancelled())
        if (!entry.consumers.size) {
          entry.controller.abort()
          if (pending.get(key) === entry) pending.delete(key)
        }
      }
      entry.consumers.add(consumer)
      signal?.addEventListener('abort', cancel, { once: true })
    })
  }
  return { get, clear, invalidate: () => clear({ retry: true }), refreshScope: syncScope }
}
