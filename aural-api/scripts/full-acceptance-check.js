#!/usr/bin/env node

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const { loadEnvFile } = require('./load-env')

loadEnvFile()

const apiRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(apiRoot, '..')
const normalizeBase = (value) => String(value || '').trim().replace(/\/$/, '')

const requiredBase = (label, ...values) => {
  const value = values.find((item) => normalizeBase(item))
  if (!value) {
    console.error(`${label} is required. Set it in .env or export it before running acceptance checks.`)
    process.exit(1)
  }
  return normalizeBase(value)
}

const siteUrl = requiredBase('SITE_URL, NUXT_PUBLIC_SITE_URL or PUBLIC_SITE_URL', process.env.SITE_URL, process.env.NUXT_PUBLIC_SITE_URL, process.env.PUBLIC_SITE_URL)
const adminUrl = requiredBase('ADMIN_URL or PUBLIC_ADMIN_URL', process.env.ADMIN_URL, process.env.PUBLIC_ADMIN_URL)
const apiBase = requiredBase('API_BASE, API_URL, API_PUBLIC_URL or NUXT_PUBLIC_API_BASE', process.env.API_BASE, process.env.API_URL, process.env.API_PUBLIC_URL, process.env.NUXT_PUBLIC_API_BASE)
const adminUsername = process.env.CHECK_ADMIN_USERNAME || process.env.ADMIN_USERNAME || ''
const adminPassword = process.env.CHECK_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || ''
const writeTestsEnabled = process.env.ACCEPTANCE_WRITE_TESTS === '1'
const timeoutMs = Number.parseInt(process.env.ACCEPTANCE_TIMEOUT_MS || '12000', 10)
const diskMaxUsedPercent = Number.parseFloat(process.env.ACCEPTANCE_DISK_MAX_USED_PERCENT || '85')
const diskMinFreeMb = Number.parseFloat(process.env.ACCEPTANCE_DISK_MIN_FREE_MB || '1024')
const backupMaxAgeHours = Number.parseFloat(process.env.ACCEPTANCE_BACKUP_MAX_AGE_HOURS || String(14 * 24))
const sensitiveConfirmation = process.env.SENSITIVE_CONFIRMATION_TEXT || '确认执行'
const apiPm2Name = process.env.API_PM2_NAME || 'shangkong-api'
const webPm2Name = process.env.WEB_PM2_NAME || 'shangkong-web'
const adminDistDir = path.resolve(process.env.ADMIN_DIST_DIR || path.join(workspaceRoot, 'aural-admin', 'dist'))

const results = []
let adminToken = ''
const cleanupTasks = []

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

const adminHeaders = (extra = {}) => ({
  ...extra,
  Authorization: `Bearer ${adminToken}`
})

const checkHtmlPage = async (label, pagePath) => {
  const url = `${siteUrl}${pagePath}`
  const { res, text } = await request(url)
  assert(res.ok, `${url} returned ${res.status}`)
  assert(/<!doctype html|<html/i.test(text), `${label} is not an HTML page`)
  assert(!/127\.0\.0\.1|localhost/i.test(text), `${label} contains local development URL`)
  return `${pagePath} status=${res.status}, bytes=${text.length}`
}

const checkSeoUtilityRoutes = async () => {
  const robots = await request(`${siteUrl}/robots.txt`)
  assert(robots.res.ok, `/robots.txt returned ${robots.res.status}`)
  assert(robots.text.includes(`Sitemap: ${siteUrl}/sitemap.xml`), 'robots.txt sitemap URL does not match SITE_URL')
  assert(!/127\.0\.0\.1|localhost/i.test(robots.text), 'robots.txt contains local development URL')

  const sitemap = await request(`${siteUrl}/sitemap.xml`)
  assert(sitemap.res.ok, `/sitemap.xml returned ${sitemap.res.status}`)
  assert(sitemap.text.includes(`<loc>${siteUrl}/`), 'sitemap.xml does not contain SITE_URL routes')
  assert(!/127\.0\.0\.1|localhost/i.test(sitemap.text), 'sitemap.xml contains local development URL')
  return `robots=${robots.text.length} bytes, sitemap=${sitemap.text.length} bytes`
}

const getFirstProduct = async () => {
  const { res, json } = await requestJson(`${apiBase}/api/products?pageSize=5`)
  assert(res.ok, `/api/products returned ${res.status}`)
  const first = Array.isArray(json?.data) ? json.data[0] : null
  assert(first, 'public products API returned an empty list')
  const attrs = first.attributes || first
  return { id: first.id, attrs, slug: attrs.slug || first.id }
}

const checkFrontendPages = async () => {
  await checkHtmlPage('homepage', '/')
  await checkHtmlPage('products', '/products')
  const product = await getFirstProduct()
  await checkHtmlPage('product detail', `/products/${product.slug}`)
  await checkHtmlPage('support', '/support')
  await checkHtmlPage('news', '/news')
  await checkHtmlPage('privacy policy', '/info/privacy')
  await checkHtmlPage('terms', '/info/terms')
  await checkHtmlPage('warranty', '/info/warranty')
  return 'homepage/products/detail/support/news/legal pages opened'
}

const checkAdminHomepage = async () => {
  const { res, text } = await request(adminUrl)
  assert(res.ok, `${adminUrl} 返回 ${res.status}`)
  ;['x-content-type-options', 'x-frame-options', 'referrer-policy'].forEach((header) => {
    assert(res.headers.get(header), `后台响应缺少安全头 ${header}`)
  })
  assert(/<div id="app">|<title>/i.test(text), '后台页面内容异常')
  assert(!/127\.0\.0\.1|localhost/i.test(text), '后台页面包含本地开发地址')
  return `${adminUrl} status=${res.status}, bytes=${text.length}`
}

const checkApiHealth = async () => {
  const { res, json } = await requestJson(`${apiBase}/health`)
  assert(res.ok, `/health returned ${res.status}`)
  assert(json?.status === 'ok', `health status is ${json?.status || 'missing'}`)
  assert(json?.database?.status === 'ok', `database status is ${json?.database?.status || 'missing'}`)
  const tables = json?.database?.coreTables || []
  const missing = ['Product', 'AdminUser', 'Article', 'SystemConfig']
    .filter((name) => !tables.some((item) => item.name === name && item.status === 'ok'))
  assert(missing.length === 0, `core table check failed: ${missing.join(', ')}`)
  assert(Number(json?.database?.file?.size || 0) > 0, 'database file size is empty')
  return `status=${json.status}, dbSize=${json.database.file.size}`
}

const loginAdmin = async () => {
  assert(adminUsername && adminPassword, 'set CHECK_ADMIN_USERNAME/CHECK_ADMIN_PASSWORD or ADMIN_USERNAME/ADMIN_PASSWORD')
  const { res, json } = await requestJson(`${apiBase}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: adminUsername, password: adminPassword })
  })
  assert(res.ok && json?.success === true && json?.token, `login failed: status=${res.status}, success=${json?.success}`)
  adminToken = json.token
  return `user=${json?.user?.username || adminUsername}`
}

const checkAdminReadApis = async () => {
  assert(adminToken, 'admin token unavailable')
  const checks = [
    ['/api/products?admin=1&status=all&pageSize=5', (json) => Array.isArray(json?.data), 'products'],
    ['/api/admin/resources', (json) => Array.isArray(json?.uploads) && json?.summary, 'resources'],
    ['/api/admin/ops-health', (json) => json?.data?.database?.status === 'ok', 'ops-health'],
    ['/api/admin/backups?pageSize=5', (json) => Array.isArray(json?.data), 'backups']
  ]
  for (const [endpoint, predicate, label] of checks) {
    const { res, json } = await requestJson(`${apiBase}${endpoint}`, { headers: adminHeaders() })
    assert(res.ok && predicate(json), `${label} returned status=${res.status}`)
  }
  return 'admin read APIs ok'
}

const createPngBlob = () => {
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
  return new Blob([Buffer.from(pngBase64, 'base64')], { type: 'image/png' })
}

const createMp4Blob = () => {
  const buffer = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from('ftypisom', 'ascii'),
    Buffer.from([0x00, 0x00, 0x02, 0x00]),
    Buffer.from('isomiso2avc1mp41', 'ascii')
  ])
  return new Blob([buffer], { type: 'video/mp4' })
}

const publicAssetUrl = (url) => /^https?:\/\//i.test(url) ? url : `${apiBase}${url}`

const checkUploadedAssetReachable = async (url, label) => {
  const assetUrl = publicAssetUrl(url)
  const { res, text } = await request(assetUrl)
  assert(res.ok, `${label} asset is not reachable: ${assetUrl} status=${res.status}`)
  assert(text.length > 0, `${label} asset response is empty: ${assetUrl}`)
  return `${label} reachable ${assetUrl}`
}

const checkResourceIndexed = async (url, expectedInUse = null) => {
  const { res, json } = await requestJson(`${apiBase}/api/admin/resources`, { headers: adminHeaders() })
  assert(res.ok && Array.isArray(json?.uploads), `resources API failed while checking ${url}`)
  const item = json.uploads.find((row) => row.url === url)
  assert(item, `uploaded resource not listed in resource library: ${url}`)
  if (expectedInUse !== null) {
    assert(Boolean(item.inUse) === expectedInUse, `resource inUse expected ${expectedInUse} but got ${item.inUse}: ${url}`)
  }
  return item
}

const uploadTestFile = async ({ label, blob, filename }) => {
  assert(adminToken, 'admin token unavailable')
  const form = new FormData()
  form.append('file', blob, filename)
  const { res, json } = await requestJson(`${apiBase}/api/upload`, {
    method: 'POST',
    headers: adminHeaders(),
    body: form
  })
  assert(res.ok && json?.url, `${label} upload failed: status=${res.status}`)
  await checkUploadedAssetReachable(json.url, label)
  await checkResourceIndexed(json.url, false)
  cleanupTasks.push(async () => {
    await requestJson(`${apiBase}/api/admin/resources`, {
      method: 'DELETE',
      headers: adminHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ url: json.url, confirmation: sensitiveConfirmation })
    })
  })
  return json.url
}

const uploadTestImage = async () => uploadTestFile({
  label: 'image',
  blob: createPngBlob(),
  filename: `acceptance-${Date.now()}.png`
})

const uploadTestVideo = async () => uploadTestFile({
  label: 'video',
  blob: createMp4Blob(),
  filename: `acceptance-${Date.now()}.mp4`
})

const productPayload = (stamp, imageUrl = '') => ({
  title: `[ACCEPTANCE] ${stamp}`,
  slug: `acceptance-${stamp}`,
  type: 'piano',
  categoryName: 'acceptance',
  description: 'Temporary acceptance test product. It should be removed automatically.',
  imageUrl,
  gallery: imageUrl ? JSON.stringify([imageUrl]) : JSON.stringify([]),
  specs: JSON.stringify([{ label: 'Check', value: 'Acceptance' }, { label: 'Status', value: 'Temporary' }]),
  features: JSON.stringify(['Acceptance feature']),
  scenes: JSON.stringify(['Acceptance scene']),
  warranty: 'Acceptance test warranty only.',
  series: 'ACCEPTANCE',
  quantity: 1,
  price: 1,
  isFeatured: false,
  status: 'hidden',
  sku: `ACC-${stamp}`,
  model: 'acceptance-test',
  color: 'test'
})

const checkProductWriteFlow = async (imageUrl) => {
  assert(adminToken, 'admin token unavailable')
  const stamp = Date.now().toString()
  const createPayload = productPayload(stamp, imageUrl)
  const createdRes = await requestJson(`${apiBase}/api/products`, {
    method: 'POST',
    headers: adminHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(createPayload)
  })
  assert(createdRes.res.ok && createdRes.json?.id, `create product failed: status=${createdRes.res.status}`)
  const productId = createdRes.json.id
  cleanupTasks.push(async () => {
    await requestJson(`${apiBase}/api/products/${productId}`, {
      method: 'DELETE',
      headers: adminHeaders()
    })
  })

  const updatePayload = { ...createPayload, title: `[ACCEPTANCE] ${stamp} edited`, quantity: 2, price: 2 }
  const updatedRes = await requestJson(`${apiBase}/api/products/${productId}`, {
    method: 'PUT',
    headers: adminHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(updatePayload)
  })
  assert(updatedRes.res.ok && updatedRes.json?.title?.includes('edited'), `edit product failed: status=${updatedRes.res.status}`)
  return `created/edited product id=${productId}`
}

const formPayload = (type, product = null) => ({
  customerName: 'Acceptance Test',
  contactInfo: '13800000000',
  inquiryType: type,
  productId: product?.id || undefined,
  productTitle: product?.attrs?.title || 'Acceptance product',
  city: 'Acceptance City',
  budget: 'Acceptance',
  preferredTime: 'Acceptance',
  message: `Acceptance ${type} form test. This record should be removed automatically when permissions allow.`,
  pagePath: type === 'repair' ? '/support' : `/products/${product?.slug || ''}`,
  source: 'acceptance-check',
  sessionId: `acceptance-${Date.now()}`,
  visitorId: 'acceptance-check',
  website: '',
  formStartedAt: Date.now() - 3000
})

const submitAndCleanupInquiry = async (type, product = null) => {
  const { res, json } = await requestJson(`${apiBase}/api/inquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formPayload(type, product))
  })
  assert(res.ok && json?.success === true && json?.data?.id, `${type} form failed: status=${res.status}`)
  const id = json.data.id
  if (adminToken) {
    cleanupTasks.push(async () => {
      await requestJson(`${apiBase}/api/inquiries/${id}`, {
        method: 'DELETE',
        headers: adminHeaders()
      })
    })
  }
  return id
}

const checkPublicForms = async () => {
  const product = await getFirstProduct()
  const quoteId = await submitAndCleanupInquiry('quote', product)
  const appointmentId = await submitAndCleanupInquiry('appointment', product)
  const repairId = await submitAndCleanupInquiry('repair', product)
  return `quote=${quoteId}, appointment=${appointmentId}, repair=${repairId}`
}

const checkQuickGuideVideoFlow = async (videoUrl, coverUrl) => {
  assert(adminToken, 'admin token unavailable')
  const stamp = Date.now().toString()
  const payload = {
    title: `[ACCEPTANCE] Video ${stamp}`,
    duration: '00:01',
    category: 'acceptance',
    coverUrl,
    videoUrl,
    sortOrder: 9999,
    status: 'hidden'
  }
  const createdRes = await requestJson(`${apiBase}/api/quick-guides`, {
    method: 'POST',
    headers: adminHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  })
  assert(createdRes.res.ok && createdRes.json?.id, `create quick guide failed: status=${createdRes.res.status}`)
  const guideId = createdRes.json.id
  cleanupTasks.push(async () => {
    await requestJson(`${apiBase}/api/quick-guides/${guideId}`, {
      method: 'DELETE',
      headers: adminHeaders()
    })
  })
  await checkResourceIndexed(videoUrl, true)
  await checkResourceIndexed(coverUrl, true)
  return `quickGuide=${guideId}`
}

const checkWriteFlows = async () => {
  if (!writeTestsEnabled) {
    throw new Error('skipped; set ACCEPTANCE_WRITE_TESTS=1 to test product create/edit, image/video upload and public forms')
  }
  const imageUrl = await uploadTestImage()
  const videoUrl = await uploadTestVideo()
  const videoDetail = await checkQuickGuideVideoFlow(videoUrl, imageUrl)
  const productDetail = await checkProductWriteFlow(imageUrl)
  const formsDetail = await checkPublicForms()
  return `${productDetail}; ${videoDetail}; image=${imageUrl}; video=${videoUrl}; forms ${formsDetail}`
}

const walkFiles = (dir, visitor, depth = 0, maxDepth = 5) => {
  if (!fs.existsSync(dir) || depth > maxDepth) return
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name)
    if (item.isDirectory()) walkFiles(fullPath, visitor, depth + 1, maxDepth)
    else visitor(fullPath)
  }
}

const checkLatestBackup = async () => {
  const dirs = String(process.env.ACCEPTANCE_BACKUP_DIRS || [
    path.join(apiRoot, 'backups'),
    path.join(workspaceRoot, 'backups')
  ].join(','))
    .split(',')
    .map((item) => path.resolve(item.trim()))
    .filter(Boolean)
  let latest = null
  for (const dir of dirs) {
    walkFiles(dir, (file) => {
      if (!/\.db$/i.test(file)) return
      const stat = fs.statSync(file)
      if (!stat.isFile() || stat.size <= 0) return
      if (!latest || stat.mtimeMs > latest.mtimeMs) latest = { file, size: stat.size, mtimeMs: stat.mtimeMs }
    })
  }
  assert(latest, `no database backup file found in ${dirs.join(', ')}`)
  const ageHours = (Date.now() - latest.mtimeMs) / 3600000
  assert(ageHours <= backupMaxAgeHours, `latest backup is too old: ${ageHours.toFixed(1)}h > ${backupMaxAgeHours}h`)
  return `${path.relative(workspaceRoot, latest.file)} size=${latest.size}, age=${ageHours.toFixed(1)}h`
}

const parseDfLine = (line) => {
  const parts = String(line || '').trim().split(/\s+/)
  if (parts.length < 6) return null
  const [filesystem, blocks, used, available, usePercent, ...mountParts] = parts
  return {
    filesystem,
    blocksKb: Number(blocks),
    usedKb: Number(used),
    availableKb: Number(available),
    usedPercent: Number(String(usePercent).replace('%', '')),
    mount: mountParts.join(' ')
  }
}

const existingPath = (target) => {
  let current = path.resolve(target)
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current)
    if (parent === current) return apiRoot
    current = parent
  }
  return current
}

const diskInfo = (target) => {
  const resolved = existingPath(target)
  if (process.platform === 'win32') {
    const drive = path.parse(resolved).root.replace(/\\$/, '')
    const script = [
      'Get-CimInstance Win32_LogicalDisk',
      `| Where-Object { $_.DeviceID -eq '${drive.replace(/'/g, "''")}' }`,
      '| Select-Object -First 1 DeviceID,Size,FreeSpace',
      '| ConvertTo-Json -Compress'
    ].join(' ')
    const ps = spawnSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' })
    if (ps.status !== 0) throw new Error(ps.stderr || `unable to read disk ${drive}`)
    const data = JSON.parse(ps.stdout || '{}')
    const sizeKb = Math.round(Number(data.Size || 0) / 1024)
    const availableKb = Math.round(Number(data.FreeSpace || 0) / 1024)
    const usedKb = Math.max(0, sizeKb - availableKb)
    return {
      mount: data.DeviceID || drive,
      filesystem: data.DeviceID || drive,
      blocksKb: sizeKb,
      usedKb,
      availableKb,
      usedPercent: sizeKb ? Math.round((usedKb / sizeKb) * 100) : 0
    }
  }
  const df = spawnSync('df', ['-Pk', resolved], { encoding: 'utf8' })
  if (df.status !== 0) throw new Error(df.stderr || `df failed for ${resolved}`)
  const lines = df.stdout.trim().split(/\r?\n/)
  return parseDfLine(lines[1])
}

const checkDiskSpace = async () => {
  const paths = String(process.env.ACCEPTANCE_DISK_PATHS || [
    '/',
    workspaceRoot,
    apiRoot,
    path.join(apiRoot, 'uploads'),
    path.join(workspaceRoot, 'backups')
  ].join(','))
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const seen = new Set()
  const rows = []
  for (const target of paths) {
    const info = diskInfo(target)
    if (!info || seen.has(info.mount)) continue
    seen.add(info.mount)
    const freeMb = Math.round(info.availableKb / 1024)
    const danger = info.usedPercent >= diskMaxUsedPercent || freeMb <= diskMinFreeMb
    rows.push({ ...info, freeMb, danger })
  }
  const dangerous = rows.filter((item) => item.danger)
  assert(!dangerous.length, dangerous.map((item) => `${item.mount} used=${item.usedPercent}% free=${item.freeMb}MB`).join('; '))
  return rows.map((item) => `${item.mount} used=${item.usedPercent}% free=${item.freeMb}MB`).join('; ')
}

const checkPm2 = async () => {
  if (process.env.ACCEPTANCE_SKIP_PM2 === '1') return 'skipped by ACCEPTANCE_SKIP_PM2=1'
  const pm2 = spawnSync('pm2', ['jlist'], { encoding: 'utf8', timeout: 5000 })
  assert(!pm2.error, `pm2 unavailable: ${pm2.error?.message || 'unknown error'}`)
  assert(pm2.status === 0, pm2.stderr || 'pm2 jlist failed')
  const list = JSON.parse(pm2.stdout || '[]')
  const names = [webPm2Name, apiPm2Name]
  const missing = []
  const offline = []
  for (const name of names) {
    const processInfo = list.find((item) => item.name === name)
    if (!processInfo) missing.push(name)
    else if (processInfo.pm2_env?.status !== 'online') offline.push(`${name}:${processInfo.pm2_env?.status || 'unknown'}`)
  }
  assert(missing.length === 0, `missing PM2 process: ${missing.join(', ')}`)
  assert(offline.length === 0, `PM2 process not online: ${offline.join(', ')}`)
  return names.join(', ')
}

const checkAdminDist = async () => {
  if (!fs.existsSync(adminDistDir)) return 'admin dist not found locally, skipped'
  const files = []
  walkFiles(adminDistDir, (file) => {
    if (/\.(html|js|css|json)$/i.test(file)) files.push(file)
  }, 0, 8)
  let expectedHits = 0
  const forbiddenHits = []
  const legacyDomainPattern = !apiBase.includes('shangkong.xyz') || !siteUrl.includes('shangkong.xyz')
    ? /api\.shangkong\.xyz|www\.shangkong\.xyz|127\.0\.0\.1:1337|localhost:1337/
    : /127\.0\.0\.1:1337|localhost:1337/
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')
    if (content.includes(apiBase)) expectedHits += 1
    if (legacyDomainPattern.test(content)) forbiddenHits.push(path.relative(adminDistDir, file))
  }
  assert(expectedHits > 0, `expected API base not found in admin dist: ${apiBase}`)
  assert(forbiddenHits.length === 0, `local API address found in ${forbiddenHits.slice(0, 5).join(', ')}`)
  return `files=${files.length}, apiHits=${expectedHits}`
}

const runCleanup = async () => {
  const errors = []
  for (const task of cleanupTasks.reverse()) {
    try {
      await task()
    } catch (error) {
      errors.push(error.message || String(error))
    }
  }
  if (errors.length) {
    addResult('Write-test cleanup', false, errors.slice(0, 3).join('; '), 'optional')
  } else if (cleanupTasks.length) {
    addResult('Write-test cleanup', true, `${cleanupTasks.length} item(s) cleaned`)
  }
}

const main = async () => {
  console.log('Full acceptance check')
  console.log(`SITE_URL=${siteUrl}`)
  console.log(`ADMIN_URL=${adminUrl}`)
  console.log(`API_BASE=${apiBase}`)
  console.log(`ACCEPTANCE_WRITE_TESTS=${writeTestsEnabled ? '1' : '0'}`)

  await runCheck('Frontend pages', checkFrontendPages)
  await runCheck('SEO utility routes', checkSeoUtilityRoutes)
  await runCheck('后台管理端可访问', checkAdminHomepage)
  await runCheck('API health', checkApiHealth)
  await runCheck('Admin login', loginAdmin)
  await runCheck('Admin core APIs', checkAdminReadApis)
  await runCheck('Admin dist API address', checkAdminDist)
  await runCheck('PM2 processes online', checkPm2)
  await runCheck('Server disk space', checkDiskSpace)
  await runCheck('Recent database backup', checkLatestBackup)
  await runCheck('Product create/edit, image/video upload, public forms', checkWriteFlows, { optional: !writeTestsEnabled })

  await runCleanup()

  const requiredFailures = results.filter((item) => !item.ok && item.level !== 'optional')
  const warnings = results.filter((item) => !item.ok && item.level === 'optional')
  console.log(`\nChecked ${results.length} item(s), failures=${requiredFailures.length}, warnings=${warnings.length}`)
  if (requiredFailures.length) process.exit(1)
}

main().catch(async (error) => {
  addResult('Acceptance check runtime', false, error.message || String(error))
  await runCleanup()
  process.exit(1)
})
