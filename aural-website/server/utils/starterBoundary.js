import { eventHandler, getRequestURL, send, setHeader, setResponseStatus } from 'h3'
import { parseSiteMode, starterRequestAllowed } from '../../app/utils/siteMode.js'
export function enforceStarterBoundary(event, mode) {
  if (parseSiteMode(mode) !== 'starter' || starterRequestAllowed(getRequestURL(event).pathname, event.method)) return
  setResponseStatus(event, 404)
  setHeader(event, 'content-type', 'text/html; charset=utf-8')
  setHeader(event, 'cache-control', 'no-store')
  setHeader(event, 'x-robots-tag', 'noindex, nofollow')
  setHeader(event, 'x-content-type-options', 'nosniff')
  setHeader(event, 'referrer-policy', 'no-referrer')
  setHeader(event, 'content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
  return send(event, '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>页面未找到 | 胡氏管乐</title></head><body style="margin:0;background:#f5f4f0;color:#171717;font:16px/1.8 system-ui"><main style="max-width:640px;margin:15vh auto;padding:32px"><p>HUSHI WIND · 胡氏管乐</p><h1>页面暂时没有找到</h1><p>请返回首页，或继续阅读管乐知识。</p><a style="display:inline-block;padding:12px 0;color:inherit" href="/">返回首页</a>　<a style="display:inline-block;padding:12px 0;color:inherit" href="/news">管乐知识</a></main></body></html>')
}

export function installStarterBoundary(app, getMode) {
  // Nitro registers public-file middleware before scanned server middleware.
  // H3 exposes its normalized stack; put this handler before every static/router
  // layer. A request hook alone would still run the first downstream handler.
  if (!Array.isArray(app?.stack) || typeof app?.use !== 'function') throw new Error('Starter route boundary requires the H3 application stack')
  app.use(eventHandler(event => enforceStarterBoundary(event, getMode(event))))
  app.stack.unshift(app.stack.pop())
}
