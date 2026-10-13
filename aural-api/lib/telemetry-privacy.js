const sensitiveKeys = new Set([
  'previewtoken', 'token', 'accesstoken', 'refreshtoken', 'idtoken',
  'authorization', 'apikey', 'password', 'secret',
]);
const hidden = '[redacted]';

function sensitiveKey(key) {
  let decoded = key;
  for (let depth = 0; depth < 4; depth++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch { break; }
  }
  return sensitiveKeys.has(decoded.replace(/[-_]/g, '').toLowerCase());
}

function sanitizeText(value, depth = 0) {
  if (depth >= 8) return hidden;
  // Credentials also occur in error strings and nested encoded source URLs.
  const clean = value.replace(/(&amp;|[?&#])([^?&#=\s"'<>]+)=([^&#\s"'<>]*)/gi,
    (_match, separator, key, entry) => `${separator}${key}=${sensitiveKey(key) ? hidden : sanitizeText(entry, depth + 1)}`);
  if (/%(?:25|3f|23|26|3d)/i.test(clean)) {
    try {
      const decoded = decodeURIComponent(clean);
      if (decoded !== clean) {
        const filtered = sanitizeText(decoded, depth + 1);
        if (filtered !== decoded) return encodeURIComponent(filtered);
      }
    } catch {}
  }
  return clean;
}

// The website's telemetryPrivacy.js uses the same contract. Cross-runtime tests
// prevent browser and API filtering from drifting apart.
function sanitizeTelemetry(value, depth = 0) {
  if (depth >= 32) return null;
  if (typeof value === 'string') return sanitizeText(value);
  if (Array.isArray(value)) return value.map(entry => sanitizeTelemetry(entry, depth + 1));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !sensitiveKey(key))
    .map(([key, entry]) => [key, sanitizeTelemetry(entry, depth + 1)]));
}

module.exports = { sanitizeTelemetry };
