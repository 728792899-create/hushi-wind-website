const path = require('node:path');
const { sanitizeTelemetry } = require('./telemetry-privacy');

function validationError(message) {
  return Object.assign(new Error(message), {
    status: 400,
    code: 'VALIDATION_ERROR',
  });
}
function canonicalUploadUrl(value) {
  if (typeof value !== 'string') return '';
  let raw = value.trim();
  try {
    if (/^https?:\/\//i.test(raw)) raw = new URL(raw).pathname;
  } catch {
    return '';
  }
  raw = raw.split(/[?#]/)[0];
  try {
    raw = decodeURIComponent(raw);
  } catch {
    return '';
  }
  if (raw.includes('\\') || /[\x00-\x1f]/.test(raw)) return '';
  const normalized = path.posix.normalize(raw);
  return normalized.startsWith('/uploads/') && normalized !== '/uploads/'
    ? normalized
    : '';
}
function uploadFilePath(root, value) {
  const url = canonicalUploadUrl(value);
  if (!url) throw validationError('资源路径不合法');
  const resolved = path.resolve(root, url.slice('/uploads/'.length));
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw validationError('资源路径不合法');
  return resolved;
}
function hideContact(value) {
  return value ? '已隐藏' : '';
}
function redactPrivate(value) {
  if (Array.isArray(value)) return value.map(redactPrivate);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      /contact|email|phone|internalNote|password|secret|token|portfolioUrl|customerName|message|note/i.test(
        key,
      )
        ? hideContact(entry)
        : redactPrivate(entry),
    ]),
  );
}
function sanitizeMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const allowed = new Set([
    'city',
    'budget',
    'preferredTime',
    'durationMs',
    'status',
    'code',
    'type',
    'name',
    'value',
    'rating',
    'category',
    'metric',
    'width',
    'height',
    'size',
    'count',
    'source',
    'form',
    'pagePath',
  ]);
  const clean = Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key, v]) =>
          allowed.has(key) &&
          ['string', 'number', 'boolean'].includes(typeof v),
      )
      .map(([k, v]) => [k, typeof v === 'string' ? sanitizeTelemetry(v).slice(0, 200) : v]),
  );
  return JSON.stringify(clean);
}
class ExpiringBuckets extends Map {
  constructor(limit = 10000) {
    super();
    this.limit = limit;
  }
  sweep(now = Date.now()) {
    for (const [key, entry] of this)
      if (entry.resetAt <= now) super.delete(key);
  }
  set(key, value) {
    this.sweep();
    // A full store fails closed for new clients rather than evicting active limits.
    if (!this.has(key) && this.size >= this.limit)
      throw Object.assign(new Error('访问繁忙，请稍后重试'), {
        status: 429,
        code: 'RATE_LIMITED',
      });
    return super.set(key, value);
  }
}
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@\-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
module.exports = {
  canonicalUploadUrl,
  uploadFilePath,
  hideContact,
  redactPrivate,
  sanitizeMetadata,
  sanitizeTelemetry,
  ExpiringBuckets,
  csvCell,
  validationError,
};
