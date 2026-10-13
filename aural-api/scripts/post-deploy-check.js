#!/usr/bin/env node

const {checkAuthBoundary}=require('../lib/deployment-auth-check')
const fs = require('fs')
const path = require('path')
const { performance } = require('node:perf_hooks')
const { loadEnvFile } = require('./load-env')
const { deploymentReadinessConfig } = require('../lib/deployment-readiness-config')

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

const { requestTimeout, readyTimeout, readyInterval } = deploymentReadinessConfig(process.env)

const checks = []
const failures = []

const pushResult = (name, ok, detail = '') => {
  checks.push({ name, ok, detail })
  console.log(`${ok ? 'OK' : 'FAIL'} ${name}${detail ? ` - ${detail}` : ''}`)
  if (!ok) failures.push({ name, detail })
}

const request = async (url, options = {}, timeoutMs = requestTimeout) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    // Keep the timeout active until the body finishes, not merely until headers arrive.
    const body = await res.text()
    return { ok: res.ok, status: res.status, text: async () => body, json: async () => JSON.parse(body) }
  } finally {
    clearTimeout(timeout)
  }
}

const transientRequestError = (error) => error.name === 'AbortError' || error.name === 'TimeoutError' ||
  ['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET'].includes(error.cause?.code || error.code)

const waitForReady = async (probe, deadline) => {
  let result = { ok: false, detail: 'no ready response' }
  while (performance.now() < deadline) {
    try { result = await probe(Math.max(1, Math.min(requestTimeout, Math.ceil(deadline - performance.now())))) }
    catch (error) { result = { ok: false, retry: transientRequestError(error), detail: error.message } }
    if (performance.now() >= deadline) break
    if (result.ok || !result.retry) return result
    const remaining = deadline - performance.now()
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, Math.min(readyInterval, remaining)))
  }
  return { ok: false, detail: `readiness deadline exceeded (${readyTimeout}ms); ${result.detail}` }
}

const checkHealth = async (deadline) => {
  const result = await waitForReady(async timeoutMs => {
    const res = await request(`${apiUrl}/health`, {}, timeoutMs)
    const json = await res.json().catch(() => null)
    const tables = Array.isArray(json?.database?.coreTables) ? json.database.coreTables : []
    const required = new Set(['Product', 'AdminUser', 'Article', 'SystemConfig'])
    const missing = [...required].filter((name) => !tables.some((item) => item.name === name && item.status === 'ok'))
    const fileSize = json?.database?.file?.size || 0
    const ok = res.ok && json?.status === 'ok' && fileSize > 0 && missing.length === 0
    // A ready process reporting database errors is a terminal failure, not slow startup.
    const retry = [502, 504].includes(res.status) || (res.status === 503 && (!json || json?.error?.code === 'SERVICE_STARTING'))
    return { ok, retry, detail: `status=${json?.status || res.status}, dbSize=${fileSize}, missing=${missing.join(',') || '-'}` }
  }, deadline)
  pushResult('API health', result.ok, result.detail)
  return result.ok
}

const checkLogin = async (deadline) => {
  const readyRequest = (url, options) => {
    const remaining = deadline - performance.now()
    if (remaining <= 0) throw new Error(`readiness deadline exceeded (${readyTimeout}ms)`)
    return request(url, options, Math.min(requestTimeout, Math.ceil(remaining)))
  }
  const boundary=await checkAuthBoundary(readyRequest,apiUrl)
  pushResult('Admin authentication boundary',boundary.ok,boundary.detail)
  if(process.env.POST_DEPLOY_CHECK_LOGIN !== '1') {
    console.log('INFO Human login/MFA acceptance is separate; unattended checks do not log in as an administrator.')
    return
  }
  if (!adminUsername || !adminPassword) {
    pushResult('Admin login API', false, 'ADMIN_USERNAME and ADMIN_PASSWORD are required for login check')
    return
  }
  const res = await readyRequest(`${apiUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: adminUsername, password: adminPassword, totpCode: process.env.POST_DEPLOY_TOTP_CODE })
  })
  const json = await res.json().catch(() => null)
  pushResult('Admin login API', res.ok && json?.success === true && Boolean(json?.token), `status=${res.status}, success=${json?.success}`)
}

const checkPage = async (label, url, expected, deadline) => {
  const result = await waitForReady(async timeoutMs => {
    const res = await request(url, {}, timeoutMs)
    const text = await res.text()
    return { ok: res.ok && text.includes(expected), retry: [502, 503, 504].includes(res.status), detail: `status=${res.status}` }
  }, deadline)
  pushResult(label, result.ok, result.detail)
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
    const deadline = performance.now() + readyTimeout
    if (await checkHealth(deadline)) {
      await checkLogin(deadline)
      await checkPage('Frontend homepage', siteUrl, '<!DOCTYPE html', deadline)
      await checkPage('Admin homepage', adminUrl, '<!DOCTYPE html', deadline)
      checkAdminDist()
    }
  } catch (error) {
    pushResult('Post deploy check runtime', false, error.message)
  }

  console.log(`Checked ${checks.length} items, failures=${failures.length}`)
  if (failures.length) process.exit(1)
})()
