#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.resolve(process.env.ADMIN_DIST_DIR || path.join(root, 'dist'))

const requiredEnv = (label, value) => {
  const normalized = String(value || '').trim().replace(/\/$/, '')
  if (!normalized) {
    console.error(`Admin UI regression check failed: ${label} is required.`)
    process.exit(1)
  }
  return normalized
}

const expectedApi = requiredEnv('ADMIN_EXPECTED_API_BASE or VITE_API_BASE', process.env.ADMIN_EXPECTED_API_BASE || process.env.VITE_API_BASE || process.env.API_PUBLIC_URL)
const expectedSite = requiredEnv('ADMIN_EXPECTED_SITE_URL or VITE_SITE_URL', process.env.ADMIN_EXPECTED_SITE_URL || process.env.VITE_SITE_URL || process.env.PUBLIC_SITE_URL)
const forbiddenApiPatterns = [
  process.env.ADMIN_FORBIDDEN_API_BASE || '127.0.0.1:1337',
  'localhost:1337',
  'http://127.0.0.1:1337',
  'http://localhost:1337'
].filter(Boolean)

if (!expectedApi.includes('shangkong.xyz')) {
  forbiddenApiPatterns.push('api.shangkong.xyz', 'https://api.shangkong.xyz')
}
if (!expectedSite.includes('shangkong.xyz')) {
  forbiddenApiPatterns.push('www.shangkong.xyz', 'https://www.shangkong.xyz')
}

const failures = []
const warnings = []

const rel = (filePath) => path.relative(root, filePath).replace(/\\/g, '/')
const full = (relativePath) => path.join(root, relativePath)

const readRequired = (relativePath) => {
  const filePath = full(relativePath)
  if (!fs.existsSync(filePath)) {
    failures.push(`Missing required file: ${relativePath}`)
    return ''
  }
  return fs.readFileSync(filePath, 'utf8')
}

const requireText = (relativePath, checks) => {
  const content = readRequired(relativePath)
  if (!content) return

  for (const check of checks) {
    if (!content.includes(check.text)) {
      failures.push(`${relativePath} is missing ${check.label || check.text}`)
    }
  }
}

const walkStaticFiles = (dir, files = []) => {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const itemPath = path.join(dir, item.name)
    if (item.isDirectory()) {
      walkStaticFiles(itemPath, files)
      continue
    }
    if (/\.(html|js|css|json)$/i.test(item.name)) files.push(itemPath)
  }
  return files
}

readRequired('src/views/HelpView.vue')

requireText('src/router.js', [
  { text: "path: '/help'", label: 'help route' },
  { text: 'HelpView.vue', label: 'HelpView lazy import' },
  { text: '后台帮助', label: 'help menu label' }
])

requireText('src/App.vue', [
  { text: '/help', label: 'top/help navigation link' },
  { text: '后台帮助', label: 'sidebar help entry' },
  { text: 'QuestionFilled', label: 'help icon import' }
])

requireText('src/style.css', [
  { text: '.form-section', label: 'editor form sections' },
  { text: '.cleanup-filter-summary', label: 'resource cleanup impact summary' },
  { text: '.danger-confirm-checkbox', label: 'resource cleanup second confirmation' },
  { text: '.mobile-list-actions', label: 'mobile list action layout' },
  { text: '.dark-drawer', label: 'mobile drawer layout guard' },
  { text: '.el-message-box', label: 'mobile message box width guard' },
  { text: '.help-page', label: 'help center page styles' }
])

if (fs.existsSync(distDir)) {
  const files = walkStaticFiles(distDir)
  if (!files.length) {
    failures.push(`dist exists but no static files were found: ${rel(distDir)}`)
  }

  let expectedHits = 0
  let expectedSiteHits = 0
  const forbiddenHits = []

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')
    if (content.includes(expectedApi)) expectedHits += 1
    if (content.includes(expectedSite)) expectedSiteHits += 1
    for (const pattern of forbiddenApiPatterns) {
      if (content.includes(pattern)) forbiddenHits.push(`${rel(file)} -> ${pattern}`)
    }
  }

  if (!expectedHits) failures.push(`dist does not contain expected API base: ${expectedApi}`)
  if (!expectedSiteHits) failures.push(`dist does not contain expected site URL: ${expectedSite}`)
  if (forbiddenHits.length) {
    failures.push(`dist contains forbidden API address:\n${forbiddenHits.slice(0, 20).map((item) => `  - ${item}`).join('\n')}`)
  }
} else {
  warnings.push(`dist not found, skipped built asset API check: ${rel(distDir)}`)
}

if (warnings.length) {
  console.warn('Admin UI regression check warnings:')
  warnings.forEach((item) => console.warn(`- ${item}`))
}

if (failures.length) {
  console.error('Admin UI regression check failed:')
  failures.forEach((item) => console.error(`- ${item}`))
  process.exit(1)
}

console.log('Admin UI regression check passed.')
console.log(`root=${root}`)
console.log(`expectedApi=${expectedApi}`)
console.log(`expectedSite=${expectedSite}`)
console.log(`distChecked=${fs.existsSync(distDir) ? 'yes' : 'no'}`)
