const path = require('node:path');

// Scan persisted content, including JSON fields, Markdown media, HTML and SEO images.
// A textual mention conservatively counts as a reference: deleting a used file is worse
// than retaining an unused file. Upload filenames are restricted by the upload handler.
function extractUploadUrls(value) {
  const urls = new Set();
  const visit = (entry) => {
    if (typeof entry === 'string') {
      try {
        const parsed = JSON.parse(entry);
        if (parsed !== entry) {
          visit(parsed);
          return;
        }
      } catch {}
      for (const match of entry.matchAll(/\/uploads\/[^\s<>"'`\\)\]}?#]+/g)) {
        let pathname = match[0];
        try {
          pathname = decodeURIComponent(pathname);
        } catch {}
        pathname = path.posix.normalize(pathname);
        if (pathname.startsWith('/uploads/')) urls.add(pathname);
      }
    } else if (Array.isArray(entry)) entry.forEach(visit);
    else if (entry && typeof entry === 'object')
      Object.values(entry).forEach(visit);
  };
  visit(value);
  return [...urls];
}

function collectContentReferences(items, groups) {
  for (const [section, records] of groups) {
    for (const record of records.filter(Boolean)) {
      const title =
        record.title ||
        record.name ||
        record.question ||
        record.pageKey ||
        '全局配置';
      for (const url of extractUploadUrls(record)) {
        if (
          items.some(
            (item) =>
              item.url === url &&
              item.section === section &&
              item.title.startsWith(title),
          )
        )
          continue;
        items.push({
          section,
          title: `${title} 内容引用`,
          url,
          originalUrl: url,
          kind: /\.(jpe?g|png|webp|gif)$/i.test(url) ? 'image' : 'file',
        });
      }
    }
  }
  return items;
}
// Backup validation is stricter than deletion protection: prose and other origins
// do not assert that a file is present in this installation.
function localAssetOrigins(env = process.env) {
  return [...new Set([env.UPLOAD_PUBLIC_BASE, env.API_PUBLIC_URL, env.PUBLIC_SITE_URL]
    .filter(Boolean).map(value => { try { return new URL(value).origin; } catch { return ''; } }).filter(Boolean))];
}
function extractLocalUploadUrls(value, origins = localAssetOrigins()) {
  const allowed = new Set(origins);
  const found = new Set();
  const add = raw => {
    if (/^(?:https?:)?\/\//i.test(raw)) {
      try {
        const parsed = new URL(raw, 'https://relative.invalid');
        if (!allowed.has(parsed.origin)) return;
        raw = parsed.pathname;
      } catch { return; }
    }
    if (!raw.startsWith('/uploads/')) return;
    // Reuse decoding and traversal normalization, preserving a whole URL with spaces.
    let decoded = raw.split(/[?#]/)[0];
    try { decoded = decodeURIComponent(decoded); } catch {}
    decoded = path.posix.normalize(decoded);
    if (decoded.startsWith('/uploads/') && !/[\x00-\x1f\\]/.test(decoded)) found.add(decoded);
  };
  const visit = (item, key = '') => {
    if (typeof item === 'string') {
      try { const parsed = JSON.parse(item); if (parsed !== item) { visit(parsed, key); return; } } catch {}
      const raw = item.trim();
      const urlField = /url$|^(?:gallery|src|href|poster|image|cover)$/i.test(key);
      if (/^(?:https?:\/\/|\/\/|\/uploads\/)/i.test(raw) && !/[<>"'`\n\[\]()]/.test(raw) &&
          (urlField || !/\s/.test(raw))) add(raw);
      // Match the news renderer's plain image/video lines, including trailing captions.
      for (const line of raw.split(/\r?\n/)) {
        const match = line.trim().match(/^((?:https?:\/\/|\/uploads\/)[^\s]+\.(?:jpe?g|png|webp|gif|mp4|mov|webm|ogg|m4v)(?:[?#][^\s]*)?)(?:\s+.*)?$/i);
        if (match) add(match[1]);
      }
      for (const match of raw.matchAll(/(?:src|href|poster)\s*=\s*["']([^"']+)["']|!?\[[^\]]*\]\(<?([^\s)>]+)>?(?:\s+["'][^"']*["'])?\)/gi)) add(match[1] || match[2]);
    } else if (Array.isArray(item)) item.forEach(entry => visit(entry, key));
    else if (item && typeof item === 'object') Object.entries(item).forEach(([name, entry]) => visit(entry, name));
  };
  visit(value);
  return [...found];
}
module.exports = { extractUploadUrls, collectContentReferences, extractLocalUploadUrls, localAssetOrigins };
