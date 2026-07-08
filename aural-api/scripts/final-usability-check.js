#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { loadEnvFile } = require('./load-env')

loadEnvFile()

const workspaceRoot = path.resolve(__dirname, '..', '..')
const normalizeBase = (value) => String(value || '').trim().replace(/\/$/, '')
const siteUrl = normalizeBase(process.env.SITE_URL || process.env.NUXT_PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || 'https://www.shangkong.xyz')
const adminUrl = normalizeBase(process.env.ADMIN_URL || process.env.PUBLIC_ADMIN_URL || 'https://admin.shangkong.xyz')
const apiBase = normalizeBase(process.env.API_BASE || process.env.API_PUBLIC_URL || process.env.NUXT_PUBLIC_API_BASE || 'https://api.shangkong.xyz')
const adminUsername = process.env.CHECK_ADMIN_USERNAME || process.env.ADMIN_USERNAME || ''
const adminPassword = process.env.CHECK_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || ''
const websiteOutputDir = path.resolve(process.env.WEBSITE_OUTPUT_DIR || path.join(workspaceRoot, 'aural-website', '.output'))
const adminDistDir = path.resolve(process.env.ADMIN_DIST_DIR || path.join(workspaceRoot, 'aural-admin', 'dist'))
const apiPm2Name = process.env.API_PM2_NAME || 'shangkong-api'
const webPm2Name = process.env.WEB_PM2_NAME || 'shangkong-web'
const timeoutMs = Number.parseInt(process.env.FINAL_CHECK_TIMEOUT_MS || '12000', 10)

const results = []
let adminToken = ''

const addResult = (name, ok, detail = '', level = 'required') => {
  results.push({ name, ok, detail, level })
  const prefix = ok ? 'OK' : level === 'optional' ? 'WARN' : 'FAIL'
  console.log(`${prefix} ${name}${detail ? ` - ${detail}` : ''}`)
}

const runCheck = async (name, fn, options = {}) => {
  const level = options.optional ? 'optional' : 'required'
  const startedAt = Date.now()
  try {
    const detail = await fn()
    addResult(name, true, detail ? `${detail} (${Date.now() - startedAt}ms)` : `${Date.now() - startedAt}ms`, level)
  } catch (error) {
    addResult(name, false, error.message || String(error), level)
  }
}

const request = async (url, options = {}) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    const text = await res.text()
    return { res, text }
  } finally {
    clearTimeout(timer)
  }
}

const requestJson = async (url, options = {}) => {
  const { res, text } = await request(url, options)
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    throw new Error(`${url} returned non-JSON response: ${text.slice(0, 120)}`)
  }
  return { res, json, text }
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const walkFiles = (dir, files = []) => {
  if (!fs.existsSync(dir)) return files
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name)
    if (item.isDirectory()) walkFiles(fullPath, files)
    else files.push(fullPath)
  }
  return files
}

const checkHtmlPage = async (label, url) => {
  const { res, text } = await request(url)
  assert(res.ok, `${url} returned ${res.status}`)
  assert(/<!doctype html|<html/i.test(text), `${label} is not html`)
  assert(!/127\.0\.0\.1|localhost/i.test(text), `${label} contains local URL`)
  return `${res.status}, bytes=${text.length}`
}

const checkFrontendPages = async () => {
  const productRes = await requestJson(`${apiBase}/api/products?pageSize=1`)
  const product = productRes.json?.data?.[0]
  const attrs = product?.attributes || product || {}
  const productPath = product ? `/products/${attrs.slug || product.id}` : '/products'

  const articleRes = await requestJson(`${apiBase}/api/articles?pageSize=1`)
  const article = articleRes.json?.data?.[0]
  const articleAttrs = article?.attributes || article || {}
  const articlePath = article ? `/news/${articleAttrs.slug || article.id}` : '/news'

  const pages = [
    ['home', `${siteUrl}/`],
    ['products', `${siteUrl}/products`],
    ['product detail', `${siteUrl}${productPath}`],
    ['support', `${siteUrl}/support`],
    ['news', `${siteUrl}/news`],
    ['news detail', `${siteUrl}${articlePath}`],
    ['artists', `${siteUrl}/artists`],
    ['privacy', `${siteUrl}/info/privacy`],
    ['terms', `${siteUrl}/info/terms`],
    ['warranty', `${siteUrl}/info/warranty`]
  ]

  for (const [label, url] of pages) await checkHtmlPage(label, url)
  return `${pages.length} page(s) opened`
}

const checkApiHealth = async () => {
  const { res, json } = await requestJson(`${apiBase}/health`)
  assert(res.ok, `/health returned ${res.status}`)
  assert(json?.status === 'ok', `health status=${json?.status || 'missing'}`)
  assert(json?.database?.status === 'ok', `database status=${json?.database?.status || 'missing'}`)
  const tables = json?.database?.coreTables || []
  const missing = ['Product', 'AdminUser', 'Article', 'SystemConfig'].filter((name) => !tables.some((item) => item.name === name && item.status === 'ok'))
  assert(!missing.length, `core tables missing: ${missing.join(', ')}`)
  assert(Number(json?.database?.file?.size || 0) > 0, 'database file is empty')
  return `dbSize=${json.database.file.size}`
}

const checkPublicApis = async () => {
  const endpoints = [
    '/api/config',
    '/api/products?pageSize=3',
    '/api/articles?pageSize=3',
    '/api/support-faqs?pageSize=3',
    '/api/support-downloads?pageSize=3'
  ]
  for (const endpoint of endpoints) {
    const { res, json } = await requestJson(`${apiBase}${endpoint}`)
    assert(res.ok, `${endpoint} returned ${res.status}`)
    assert(json !== null, `${endpoint} returned empty JSON`)
  }
  return `${endpoints.length} public API(s) ok`
}

const checkAdmin = async () => {
  await checkHtmlPage('admin', adminUrl)
  if (!adminUsername || !adminPassword) return 'admin homepage ok; login skipped because credentials were not provided'
  const { res, json } = await requestJson(`${apiBase}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: adminUsername, password: adminPassword })
  })
  assert(res.ok && json?.success === true && json?.token, `login failed: status=${res.status}, success=${json?.success}`)
  adminToken = json.token
  return `login user=${json?.user?.username || adminUsername}`
}

const checkAdminCoreApis = async () => {
  if (!adminToken) return 'skipped because admin login was not provided'
  const headers = { Authorization: `Bearer ${adminToken}` }
  const endpoints = [
    '/api/products?admin=1&status=all&pageSize=5',
    '/api/articles?admin=1&status=all&pageSize=5',
    '/api/admin/resources',
    '/api/admin/ops-health',
    '/api/admin/backups?pageSize=5'
  ]
  for (const endpoint of endpoints) {
    const { res, json } = await requestJson(`${apiBase}${endpoint}`, { headers })
    assert(res.ok, `${endpoint} returned ${res.status}`)
    assert(json !== null, `${endpoint} returned empty JSON`)
  }
  return `${endpoints.length} admin API(s) ok`
}

const checkBuildOutputs = async () => {
  const checks = [
    { label: 'website output', dir: websiteOutputDir, expected: apiBase, required: false },
    { label: 'admin dist', dir: adminDistDir, expected: apiBase, required: true }
  ]
  const summaries = []
  for (const check of checks) {
    if (!fs.existsSync(check.dir)) {
      if (check.required) throw new Error(`${check.label} not found: ${check.dir}`)
      summaries.push(`${check.label}=missing skipped`)
      continue
    }
    const files = walkFiles(check.dir).filter((file) => /\.(html|js|mjs|css|json)$/i.test(file))
    let expectedHits = 0
    const localHits = []
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8')
      if (content.includes(check.expected)) expectedHits += 1
      if (/127\.0\.0\.1:1337|localhost:1337|127\.0\.0\.1:3000|localhost:3000/i.test(content)) localHits.push(path.relative(check.dir, file))
    }
    assert(!localHits.length, `${check.label} contains local address: ${localHits.slice(0, 5).join(', ')}`)
    if (check.required) assert(expectedHits > 0, `${check.label} does not contain API base: ${check.expected}`)
    summaries.push(`${check.label}: files=${files.length}, apiHits=${expectedHits}`)
  }
  return summaries.join('; ')
}

const checkPm2 = async () => {
  if (process.env.FINAL_CHECK_SKIP_PM2 === '1') return 'skipped by FINAL_CHECK_SKIP_PM2=1'
  const pm2 = spawnSync('pm2', ['jlist'], { encoding: 'utf8', timeout: 5000 })
  assert(!pm2.error, `pm2 unavailable: ${pm2.error?.message || 'unknown error'}`)
  assert(pm2.status === 0, pm2.stderr || 'pm2 jlist failed')
  const list = JSON.parse(pm2.stdout || '[]')
  const missing = []
  const offline = []
  for (const name of [webPm2Name, apiPm2Name]) {
    const item = list.find((row) => row.name === name)
    if (!item) missing.push(name)
    else if (item.pm2_env?.status !== 'online') offline.push(`${name}:${item.pm2_env?.status || 'unknown'}`)
  }
  assert(!missing.length, `missing PM2 process: ${missing.join(', ')}`)
  assert(!offline.length, `PM2 process not online: ${offline.join(', ')}`)
  return `${webPm2Name}, ${apiPm2Name} online`
}

const main = async () => {
  console.log('Final usability check')
  console.log(`SITE_URL=${siteUrl}`)
  console.log(`ADMIN_URL=${adminUrl}`)
  console.log(`API_BASE=${apiBase}`)

  await runCheck('API health and core tables', checkApiHealth)
  await runCheck('Frontend core pages', checkFrontendPages)
  await runCheck('Public APIs', checkPublicApis)
  await runCheck('Admin login and homepage', checkAdmin)
  await runCheck('Admin core APIs', checkAdminCoreApis, { optional: !adminToken })
  await runCheck('Build output API addresses', checkBuildOutputs)
  await runCheck('PM2 processes online', checkPm2, { optional: process.platform === 'win32' })

  const failures = results.filter((item) => !item.ok && item.level !== 'optional')
  const warnings = results.filter((item) => !item.ok && item.level === 'optional')
  console.log(`\nChecked ${results.length} item(s), failures=${failures.length}, warnings=${warnings.length}`)
  if (failures.length) process.exit(1)
}

main().catch((error) => {
  addResult('Final usability check runtime', false, error.message || String(error))
  process.exit(1)
})
