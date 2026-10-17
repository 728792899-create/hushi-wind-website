const { ExpiringBuckets } = require('./security');

// Express mounts this middleware at /api; keep method/path matching aligned with
// its case-insensitive, optional-trailing-slash POST /events route.
const isTelemetryRequest = (req) =>
  req.method === 'POST' && /^\/events\/?$/i.test(req.path);

function createApiRateLimiter({ limit, windowMs, now = Date.now }) {
  const requests = new ExpiringBuckets();
  const telemetry = new ExpiringBuckets();
  const middleware = (req, res, next) => {
    const timestamp = now();
    const buckets = isTelemetryRequest(req) ? telemetry : requests;
    const key = req.ip || req.socket.remoteAddress || '';
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= timestamp) {
      bucket = { count: 0, resetAt: timestamp + windowMs };
    }
    try {
      bucket.count++;
      buckets.set(key, bucket);
      if (bucket.count > limit) {
        // One diagnostic per IP/window; rejected traffic must not create an
        // unbounded database logging queue after its HTTP quota is exhausted.
        req.rateLimitLogAllowed = !bucket.rejectionLogged;
        bucket.rejectionLogged = true;
        throw Object.assign(new Error('访问过于频繁，请稍后再试'), {
          status: 429, code: 'RATE_LIMITED',
        });
      }
      return next();
    } catch (error) {
      if (error.status === 429) {
        // Capacity protection can reject before a bucket is stored. Such
        // requests have no bounded per-window diagnostic slot.
        req.rateLimitLogAllowed = req.rateLimitLogAllowed === true;
        res.setHeader('Retry-After', String(Math.max(1,
          Math.ceil((bucket.resetAt - timestamp) / 1000))));
      }
      return next(error);
    }
  };
  middleware.sweep = () => {
    requests.sweep(now());
    telemetry.sweep(now());
  };
  return middleware;
}

module.exports = { createApiRateLimiter, isTelemetryRequest };
