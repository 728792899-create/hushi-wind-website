#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { loadEnvFile } = require('./load-env')

loadEnvFile()

const root = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(root, '..')

const requiredBase = (label, ...values) => {
  const value = values.find((item) => String(item || '').trim())
  if (!value) {
    console.error(`${label} is required. Set it in .env or export it before running post deploy checks.`)
    process.exit(1)
  }
  return String(value).trim().replace(/\/$/, '')
}

const siteUrl = requiredBase('SITE_URL or PUBLIC_SITE_URL', process.env.SITE_URL, process.env.PUBLIC_SITE_URL)
const adminUrl = requiredBase('ADMIN_URL or PUBLIC_ADMIN_URL', process.env.ADMIN_URL, process.env.PUBLIC_ADMIN_URL)
const apiUrl = requiredBase('API_BASE, API_URL or API_PUBLIC_URL', process.env.API_BASE, process.env.API_URL, process.env.API_PUBLIC_URL)
const adminDistDir = path.resolve(process.env.ADMIN_DIST_DIR || path.join(workspaceRoot, 'aural-admin', 'dist'))
const adminUsername = process.env.ADMIN_USERNAME || ''
const adminPassword = process.env.ADMIN_PASSWORD || ''

const checks = []
const failures = []

const pushResult = (name, ok, detail = '') => {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'OK' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`)
  if (!ok) failures.push({ name, detail })
}

const request = async (url, options = {}) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Number(process.env.POST_DEPLOY_TIMEOUT_MS || 10000))
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

const checkHealth = async () => {
  const res = await request(`${apiUrl}/health`)
  const json = await res.json().catch(() => null)
  const tables = json?.database?.coreTables || []
  const required = new Set(['Product', 'AdminUser', 'Article', 'SystemConfig'])
  const missing = [...required].filter((name) => !tables.some((item) => item.name === name && item.status === 'ok'))
  const fileSize = json?.database?.file?.size || 0
  pushResult('API health', res.ok && json?.status === 'ok' && fileSize > 0 && missing.length === 0, `status=${json?.status || res.status}, dbSize=${fileSize}, missing=${missing.join(',') || '-'}`)
}

const checkLogin = async () => {
  if (!adminUsername || !adminPassword) {
    pushResult('Admin login API', false, 'ADMIN_USERNAME and ADMIN_PASSWORD are required for login check')
    return
  }
  const res = await request(`${apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: adminUsername, password: adminPassword })
  })
  const json = await res.json().catch(() => null)
  pushResult('Admin login API', res.ok && json?.success === true && Boolean(json?.token), `status=${res.status}, success=${json?.success}`)
}

const checkPage = async (label, url, expected) => {
  const res = await request(url)
  const text = await res.text().catch(() => '')
  pushResult(label, res.ok && text.includes(expected), `status=${res.status}`)
}

const checkAdminDist = () => {
  if (!fs.existsSync(adminDistDir)) {
    pushResult('Admin dist API address', false, `dist not found: ${adminDistDir}`)
    return
  }
  const files = []
  const walk = (dir) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, item.name)
      if (item.isDirectory()) walk(fullPath)
      else if (/\.(html|js|css|json)$/i.test(item.name)) files.push(fullPath)
    }
  }
  walk(adminDistDir)
  const expected = apiUrl
  const forbidden = ['127.0.0.1:1337', 'localhost:1337']
  if (!apiUrl.includes('shangkong.xyz')) forbidden.push('api.shangkong.xyz', 'https://api.shangkong.xyz')
  if (!siteUrl.includes('shangkong.xyz')) forbidden.push('www.shangkong.xyz', 'https://www.shangkong.xyz')
  let expectedHits = 0
  const forbiddenHits = []
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')
    if (content.includes(expected)) expectedHits += 1
    forbidden.forEach((item) => {
      if (content.includes(item)) forbiddenHits.push(path.relative(adminDistDir, file))
    })
  }
  pushResult('Admin dist API address', expectedHits > 0 && forbiddenHits.length === 0, `expectedHits=${expectedHits}, forbiddenHits=${forbiddenHits.length}`)
}

;(async () => {
  try {
    await checkHealth()
    await checkLogin()
    await checkPage('Frontend homepage', siteUrl, '<!DOCTYPE html')
    await checkPage('Admin homepage', adminUrl, '<!DOCTYPE html')
    checkAdminDist()
  } catch (error) {
    pushResult('Post deploy check runtime', false, error.message)
  }

  console.log(`Checked ${checks.length} items, failures=${failures.length}`)
  if (failures.length) process.exit(1)
})()
