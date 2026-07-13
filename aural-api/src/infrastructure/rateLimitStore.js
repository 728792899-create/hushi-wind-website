const { createClient } = require('redis')

const createMemoryStore = () => {
  const buckets = new Map()
  return {
    mode: 'memory',
    async increment(key, windowMs) {
      const now = Date.now()
      const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs }
      if (bucket.resetAt <= now) {
        bucket.count = 0
        bucket.resetAt = now + windowMs
      }
      bucket.count += 1
      buckets.set(key, bucket)
      return bucket
    },
    async close() {}
  }
}

const createRedisStore = (url) => {
  if (!url) throw new Error('RATE_LIMIT_STORE=redis requires REDIS_URL')
  const client = createClient({ url })
  client.on('error', (error) => console.error('Redis rate-limit error:', error.message))
  let connection
  const connect = async () => {
    if (client.isReady) return
    connection ||= client.connect().finally(() => { connection = null })
    await connection
  }
  return {
    mode: 'redis',
    async increment(key, windowMs) {
      await connect()
      const redisKey = `hushi:rate:${key}`
      const count = await client.incr(redisKey)
      if (count === 1) await client.pExpire(redisKey, windowMs)
      const ttl = await client.pTTL(redisKey)
      return { count, resetAt: Date.now() + Math.max(0, ttl) }
    },
    async close() {
      if (client.isOpen) await client.quit()
    }
  }
}

const createRateLimitStore = ({ mode = 'memory', redisUrl = '' } = {}) => mode === 'redis'
  ? createRedisStore(redisUrl)
  : createMemoryStore()

module.exports = { createRateLimitStore }
