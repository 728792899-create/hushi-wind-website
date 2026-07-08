#!/usr/bin/env node

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const { loadEnvFile } = require('./load-env')

loadEnvFile()

const workspaceRoot = path.resolve(__dirname, '..', '..')

const requiredBase = (label, ...values) => {
  const value = values.find((item) => String(item || '').trim())
  if (!value) {
    console.error(`${label} is required. Set it in .env or export it before running stability checks.`)
    process.exit(1)
  }
  return String(value).trim().replace(/\/$/, '')
}

const siteUrl = requiredBase('SITE_URL or PUBLIC_SITE_URL', process.env.SITE_URL, process.env.PUBLIC_SITE_URL)
const adminUrl = requiredBase('ADMIN_URL or PUBLIC_ADMIN_URL', process.env.ADMIN_URL, process.env.PUBLIC_ADMIN_URL)
const apiUrl = requiredBase('API_BASE or API_PUBLIC_URL', process.env.API_BASE, process.env.API_PUBLIC_URL)
const adminDistDir = path.resolve(process.env.ADMIN_DIST_DIR || path.join(workspaceRoot, 'aural-admin', 'dist'))
const packagePath = process.env.UPDATE_PACKAGE || process.argv.find((arg) => arg.endsWith('.zip')) || ''
const adminUsername = process.env.CHECK_ADMIN_USERNAME || process.env.ADMIN_USERNAME || ''
const adminPassword = process.env.CHECK_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || ''
const timeoutMs = Number(process.env.P1_CHECK_TIMEOUT_MS || 12000)

const results = []
let adminToken = ''

const addResult = (name, ok, detail = '', level = 'required') => {
  results.push({ name, ok, detail, level })
  const prefix = ok ? 'OK' : level === 'optional' ? 'WARN' : 'FAIL'
  console.log(`${prefix} ${name}${detail ? ` - ${detail}` : ''}`)
}

const request = async (url, options = {}) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

const asJson = async (res) => res.json().catch(() => null)

const checkHtmlPage = async (label, url) => {
  const res = await request(url)
  const text = await res.text().catch(() => '')
  addResult(label, res.ok && /<!doctype html/i.test(text), `status=${res.status}, bytes=${text.length}`)
}

const checkApiHealth = async () => {
  const res = await request(`${apiUrl}/health`)
  const json = await asJson(res)
  const tables = json?.database?.coreTables || []
  const requiredTables = ['Product', 'AdminUser', 'Article', 'SystemConfig']
  const missing = requiredTables.filter((name) => !tables.some((item) => item.name === name && item.status === 'ok'))
  const ok = res.ok && json?.status === 'ok' && json?.database?.status === 'ok' && missing.length === 0 && Number(json?.database?.file?.size || 0) > 0
  addResult('API health and core tables', ok, `status=${json?.status || res.status}, dbSize=${json?.database?.file?.size || 0}, missing=${missing.join(',') || '-'}`)
}

const loginAdmin = async () => {
  if (!adminUsername || !adminPassword) {
    addResult('Admin login API', false, 'CHECK_ADMIN_USERNAME/CHECK_ADMIN_PASSWORD or ADMIN_USERNAME/ADMIN_PASSWORD not configured')
    return
  }
  const res = await request(`${apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: adminUsername, password: adminPassword })
  })
  const json = await asJson(res)
  adminToken = json?.token || ''
  addResult('Admin login API', res.ok && json?.success === true && Boolean(adminToken), `status=${res.status}, user=${json?.user?.username || '-'}`)
}

const adminHeaders = () => adminToken ? { Authorization: `Bearer ${adminToken}` } : {}

const checkAdminJson = async (label, endpoint, predicate, detailFn = () => '') => {
  if (!adminToken) {
    addResult(label, false, 'admin token unavailable')
    return null
  }
  const res = await request(`${apiUrl}${endpoint}`, { headers: adminHeaders() })
  const json = await asJson(res)
  const ok = res.ok && predicate(json)
  addResult(label, ok, `status=${res.status}${detailFn(json) ? `, ${detailFn(json)}` : ''}`)
  return json
}

const checkPublicJson = async (label, endpoint, predicate, detailFn = () => '') => {
  const res = await request(`${apiUrl}${endpoint}`)
  const json = await asJson(res)
  const ok = res.ok && predicate(json)
  addResult(label, ok, `status=${res.status}${detailFn(json) ? `, ${detailFn(json)}` : ''}`)
  return json
}

const countData = (json) => Array.isArray(json?.data) ? json.data.length : 0

const walkFiles = (dir, files = []) => {
  if (!fs.existsSync(dir)) return files
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name)
    if (item.isDirectory()) walkFiles(fullPath, files)
    else files.push(fullPath)
  }
  return files
}

const checkAdminDist = async () => {
  if (!fs.existsSync(adminDistDir)) {
    addResult('Admin dist API address', false, `dist not found: ${adminDistDir}`)
    return
  }
  const files = walkFiles(adminDistDir).filter((file) => /\.(html|js|css|json)$/i.test(file))
  let apiHits = 0
  let opsHealthHits = 0
  const forbiddenHits = []
  const legacyDomainPattern = !apiUrl.includes('shangkong.xyz') || !siteUrl.includes('shangkong.xyz')
    ? /api\.shangkong\.xyz|www\.shangkong\.xyz|127\.0\.0\.1:1337|localhost:1337/
    : /127\.0\.0\.1:1337|localhost:1337/
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')
    if (content.includes(apiUrl)) apiHits += 1
    if (content.includes('ops-health')) opsHealthHits += 1
    if (legacyDomainPattern.test(content)) forbiddenHits.push(path.relative(adminDistDir, file))
  }
  addResult('Admin dist API address', apiHits > 0 && forbiddenHits.length === 0, `apiHits=${apiHits}, forbiddenHits=${forbiddenHits.length}`)
  addResult('Dashboard ops-health chunk', opsHealthHits > 0, `opsHealthHits=${opsHealthHits}`)
}

const checkPackageSafety = () => {
  if (!packagePath) {
    addResult('Update package protected files', true, 'UPDATE_PACKAGE not provided, skipped', 'optional')
    return
  }
  const resolved = path.resolve(packagePath)
  if (!fs.existsSync(resolved)) {
    addResult('Update package protected files', false, `package not found: ${resolved}`)
    return
  }
  const forbiddenNames = [/\.env$/i, /\.db(-journal|-wal|-shm)?$/i]
  const forbiddenPaths = [
    /(^|[\\/])node_modules([\\/]|$)/i,
    /(^|[\\/])uploads([\\/]|$)/i,
    /(^|[\\/])backups([\\/]|$)/i,
    /(^|[\\/])logs([\\/]|$)/i,
    /(^|[\\/])dist([\\/]|$)/i,
    /(^|[\\/])\.output([\\/]|$)/i,
    /(^|[\\/])\.nuxt([\\/]|$)/i
  ]
  const entries = listZipEntries(resolved)
  if (!entries) {
    addResult('Update package protected files', false, 'unable to list zip content; install unzip/tar or check package manually')
    return
  }
  const bad = entries
    .filter((name) => forbiddenNames.some((pattern) => pattern.test(path.basename(name))) || forbiddenPaths.some((pattern) => pattern.test(name)))
  addResult('Update package protected files', bad.length === 0, `package=${path.basename(resolved)}, blocked=${bad.length}${bad.length ? `, first=${bad[0]}` : ''}`)
}

const listZipEntries = (zipPath) => {
  const unzip = spawnSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' })
  if (unzip.status === 0 && unzip.stdout.trim()) {
    return unzip.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  }

  const tar = spawnSync('tar', ['-tf', zipPath], { encoding: 'utf8' })
  if (tar.status === 0 && tar.stdout.trim()) {
    return tar.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  }

  if (process.platform !== 'win32') return null

  const tmpDir = path.join(os.tmpdir(), `hushi-p1-package-check-${Date.now()}-${process.pid}`)
  try {
    fs.mkdirSync(tmpDir, { recursive: true })
    const ps = spawnSync('powershell', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `Expand-Archive -LiteralPath ${JSON.stringify(zipPath)} -DestinationPath ${JSON.stringify(tmpDir)} -Force`
    ], { encoding: 'utf8' })
    if (ps.status !== 0) return null
    return walkFiles(tmpDir).map((file) => path.relative(tmpDir, file).replace(/\\/g, '/'))
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  }
}

const printManualChecklist = () => {
  console.log('\nManual checklist:')
  console.log('1. 登录后台，打开“运营概览”，确认“上线健康与异常中心”卡片显示正常。')
  console.log('2. 打开资源库，确认素材总数、已引用/未使用筛选、图片预览正常。')
  console.log('3. 打开产品管理，编辑一个现有产品但不要保存，确认表单、详情图、预览入口正常。')
  console.log('4. 打开 CMS/新闻，预览草稿/发布/隐藏状态展示，不需要写入线上数据。')
  console.log('5. 浏览前台首页、产品详情、支持页、新闻页，确认无明显布局遮挡和控制台红色错误。')
}

;(async () => {
  try {
    await checkHtmlPage('Frontend homepage', siteUrl)
    await checkHtmlPage('Admin homepage', adminUrl)
    await checkHtmlPage('Products page', `${siteUrl}/products`)
    await checkHtmlPage('Support page', `${siteUrl}/support`)
    await checkHtmlPage('News page', `${siteUrl}/news`)
    await checkHtmlPage('Artists page', `${siteUrl}/artists`)
    await checkApiHealth()
    await checkPublicJson('Public products API', '/api/products?pageSize=3', (json) => countData(json) > 0, (json) => `count=${countData(json)}`)
    await checkPublicJson('Public articles API', '/api/articles?pageSize=3', (json) => countData(json) > 0, (json) => `count=${countData(json)}`)
    await checkPublicJson('Public FAQ API', '/api/support-faqs?pageSize=3', (json) => countData(json) > 0, (json) => `count=${countData(json)}`)
    await loginAdmin()
    await checkAdminJson('Dashboard stats API', '/api/dashboard/stats', (json) => Number(json?.products || 0) >= 0 && Boolean(json?.analytics), (json) => `products=${json?.products}, articles=${json?.articles}`)
    await checkAdminJson('Ops health API', '/api/admin/ops-health', (json) => json?.data?.database?.status === 'ok' && json?.data?.backup, (json) => `db=${json?.data?.database?.status}, api500=${json?.data?.api?.errorCount}, backup=${json?.data?.backup?.status || '-'}`)
    await checkAdminJson('Resources API', '/api/admin/resources', (json) => Array.isArray(json?.uploads) && json?.summary, (json) => `uploads=${json?.summary?.uploadCount}, unused=${json?.summary?.unusedCount}, heavy=${json?.summary?.heavyImageCount}`)
    await checkAdminJson('Products admin API', '/api/products?admin=1&status=all&pageSize=5', (json) => Array.isArray(json?.data), (json) => `count=${countData(json)}`)
    await checkAdminJson('Operation logs API', '/api/admin/operation-logs?pageSize=5', (json) => Array.isArray(json?.data), (json) => `count=${countData(json)}`)
    await checkAdminJson('Backups API', '/api/admin/backups?pageSize=5', (json) => Array.isArray(json?.data), (json) => `count=${countData(json)}`)
    await checkAdminDist()
    checkPackageSafety()
  } catch (error) {
    addResult('P1 stability check runtime', false, error.message)
  }

  const requiredFailures = results.filter((item) => !item.ok && item.level !== 'optional')
  const optionalWarnings = results.filter((item) => !item.ok && item.level === 'optional')
  console.log(`\nChecked ${results.length} items, failures=${requiredFailures.length}, warnings=${optionalWarnings.length}`)
  printManualChecklist()
  if (requiredFailures.length) process.exit(1)
})()
