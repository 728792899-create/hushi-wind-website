#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = path.resolve(process.env.WEBSITE_OUTPUT_DIR || path.join(root, '.output'))
const requiredEnv = (label, value) => {
  const normalized = String(value || '').trim().replace(/\/$/, '')
  if (!normalized) {
    console.error(`Website public build check failed: ${label} is required.`)
    process.exit(1)
  }
  return normalized
}

const expectedSite = requiredEnv('EXPECTED_SITE_URL or NUXT_PUBLIC_SITE_URL', process.env.EXPECTED_SITE_URL || process.env.NUXT_PUBLIC_SITE_URL)
const expectedApi = requiredEnv('EXPECTED_API_BASE or NUXT_PUBLIC_API_BASE', process.env.EXPECTED_API_BASE || process.env.NUXT_PUBLIC_API_BASE)
const forbiddenPatterns = [
  '127.0.0.1:1337',
  'localhost:1337',
  'http://127.0.0.1:1337',
  'http://localhost:1337',
  '127.0.0.1:3000',
  'localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3000'
]

if (!expectedSite.includes('shangkong.xyz')) {
  forbiddenPatterns.push('www.shangkong.xyz', 'https://www.shangkong.xyz')
}
if (!expectedApi.includes('shangkong.xyz')) {
  forbiddenPatterns.push('api.shangkong.xyz', 'https://api.shangkong.xyz')
}

const fail = (message) => {
  console.error(`Website public build check failed: ${message}`)
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
    if (/\.(html|mjs|js|css|json|xml|txt)$/i.test(item.name)) files.push(fullPath)
  }
}

if (!fs.existsSync(outputDir)) fail(`output directory does not exist: ${outputDir}`)
walk(outputDir)
if (!files.length) fail(`no built files found in ${outputDir}`)

let expectedSiteHits = 0
let expectedApiHits = 0
const forbiddenHits = []

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8')
  if (content.includes(expectedSite)) expectedSiteHits += 1
  if (content.includes(expectedApi)) expectedApiHits += 1
  for (const pattern of forbiddenPatterns) {
    if (content.includes(pattern)) {
      forbiddenHits.push(`${path.relative(outputDir, file)} -> ${pattern}`)
    }
  }
}

if (!expectedSiteHits) fail(`expected site URL not found in build: ${expectedSite}`)
if (!expectedApiHits) fail(`expected API base not found in build: ${expectedApi}`)
if (forbiddenHits.length) {
  console.error('Forbidden local address found in website build:')
  forbiddenHits.slice(0, 30).forEach((item) => console.error(`- ${item}`))
  if (forbiddenHits.length > 30) console.error(`... and ${forbiddenHits.length - 30} more`)
  process.exit(1)
}

console.log('Website public build check passed.')
console.log(`output=${outputDir}`)
console.log(`expectedSite=${expectedSite}`)
console.log(`expectedApi=${expectedApi}`)
console.log(`checkedFiles=${files.length}`)
