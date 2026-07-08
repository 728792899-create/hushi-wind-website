#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.resolve(process.env.ADMIN_DIST_DIR || path.join(root, 'dist'))

const requiredEnv = (label, value) => {
  const normalized = String(value || '').trim().replace(/\/$/, '')
  if (!normalized) {
    console.error(`Admin dist check failed: ${label} is required.`)
    process.exit(1)
  }
  return normalized
}

const expectedApi = requiredEnv('ADMIN_EXPECTED_API_BASE or VITE_API_BASE', process.env.ADMIN_EXPECTED_API_BASE || process.env.VITE_API_BASE || process.env.API_PUBLIC_URL)
const expectedSite = requiredEnv('ADMIN_EXPECTED_SITE_URL or VITE_SITE_URL', process.env.ADMIN_EXPECTED_SITE_URL || process.env.VITE_SITE_URL || process.env.PUBLIC_SITE_URL)
const forbiddenPatterns = [
  process.env.ADMIN_FORBIDDEN_API_BASE || '127.0.0.1:1337',
  'localhost:1337',
  'http://127.0.0.1:1337',
  'http://localhost:1337'
].filter(Boolean)

if (!expectedApi.includes('shangkong.xyz')) {
  forbiddenPatterns.push('api.shangkong.xyz', 'https://api.shangkong.xyz')
}
if (!expectedSite.includes('shangkong.xyz')) {
  forbiddenPatterns.push('www.shangkong.xyz', 'https://www.shangkong.xyz')
}

const fail = (message) => {
  console.error(`Admin dist check failed: ${message}`)
  process.exit(1)
}

const files = []
const walk = (dir) => {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name)
    if (item.isDirectory()) {
      walk(fullPath)
      continue
    }
    if (/\.(html|js|css|json)$/i.test(item.name)) files.push(fullPath)
  }
}

if (!fs.existsSync(distDir)) fail(`dist directory does not exist: ${distDir}`)
walk(distDir)
if (!files.length) fail(`no static files found in ${distDir}`)

let expectedHits = 0
let expectedSiteHits = 0
const forbiddenHits = []

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8')
  if (content.includes(expectedApi)) expectedHits += 1
  if (content.includes(expectedSite)) expectedSiteHits += 1
  for (const pattern of forbiddenPatterns) {
    if (content.includes(pattern)) {
      forbiddenHits.push(`${path.relative(distDir, file)} -> ${pattern}`)
    }
  }
}

if (!expectedHits) fail(`expected API base not found in dist: ${expectedApi}`)
if (!expectedSiteHits) fail(`expected site URL not found in dist: ${expectedSite}`)
if (forbiddenHits.length) {
  console.error('Forbidden API address found in admin dist:')
  forbiddenHits.slice(0, 20).forEach((item) => console.error(`- ${item}`))
  if (forbiddenHits.length > 20) console.error(`... and ${forbiddenHits.length - 20} more`)
  process.exit(1)
}

console.log('Admin dist API check passed.')
console.log(`dist=${distDir}`)
console.log(`expectedApi=${expectedApi}`)
console.log(`expectedSite=${expectedSite}`)
console.log(`checkedFiles=${files.length}`)
