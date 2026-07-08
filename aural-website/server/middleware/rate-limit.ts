const requestCounts = new Map()

const WINDOW_MS = 60000
const MAX_REQUESTS = 100

const cleanupOldEntries = () => {
  const now = Date.now()
  for (const [key, data] of requestCounts.entries()) {
    if (now - data.windowStart > WINDOW_MS) {
      requestCounts.delete(key)
    }
  }
}

setInterval(cleanupOldEntries, 60000)

export default defineEventHandler((event) => {
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  const now = Date.now()

  const key = `${ip}`
  const record = requestCounts.get(key)

  if (!record || now - record.windowStart > WINDOW_MS) {
    requestCounts.set(key, {
      count: 1,
      windowStart: now
    })
    return
  }

  record.count++

  if (record.count > MAX_REQUESTS) {
    setResponseStatus(event, 429)
    setResponseHeader(event, 'Retry-After', '60')
    setResponseHeader(event, 'X-RateLimit-Limit', String(MAX_REQUESTS))
    setResponseHeader(event, 'X-RateLimit-Remaining', '0')
    setResponseHeader(event, 'X-RateLimit-Reset', String(Math.ceil((record.windowStart + WINDOW_MS) / 1000)))

    throw createError({
      statusCode: 429,
      statusMessage: 'Too Many Requests',
      message: '请求过于频繁，请稍后再试'
    })
  }

  setResponseHeader(event, 'X-RateLimit-Limit', String(MAX_REQUESTS))
  setResponseHeader(event, 'X-RateLimit-Remaining', String(MAX_REQUESTS - record.count))
  setResponseHeader(event, 'X-RateLimit-Reset', String(Math.ceil((record.windowStart + WINDOW_MS) / 1000)))
})
