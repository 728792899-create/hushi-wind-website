const { isIP } = require('node:net');

// Parse before checking the host: WHATWG URL normalizes shortened, decimal and
// hexadecimal IPv4 addresses (for example 127.1 becomes 127.0.0.1).
function parseProductionUrl(value, { originOnly = false } = {}) {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f\\]/.test(value)) return null;
  const authority = /^https:\/\/([^/?#]+)(.*)$/i.exec(value);
  if (!authority || authority[1].includes('@')) return null;
  // Check the original suffix too: URL parsing would erase /./, /a/.., ? or #.
  if (originOnly && !['', '/'].includes(authority[2])) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || (isIP(host) === 4 && /^127\./.test(host)) ||
      host === '::1' || /^::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}$/.test(host)) return null;
  return url;
}

const isProductionUrl = (value) => parseProductionUrl(value) !== null;

module.exports = { parseProductionUrl, isProductionUrl };
