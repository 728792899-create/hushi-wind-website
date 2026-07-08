#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const target = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd()
const blockedNames = new Set(['.env', '.env.local', '.env.production'])
const blockedDirs = new Set(['uploads', 'backups', 'logs', 'node_modules', 'dist', '.output', '.nuxt'])
const blockedPathPatterns = [
  /(^|\/)prisma\/.*\.db$/i,
  /(^|\/).*\.db$/i,
  /(^|\/)uploads(\/|$)/i,
  /(^|\/)backups(\/|$)/i,
  /(^|\/)logs(\/|$)/i
]
const findings = []

const isBlockedPath = (rel) => blockedPathPatterns.some((pattern) => pattern.test(rel))

const walk = (dir) => {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name)
    const rel = path.relative(target, fullPath).replace(/\\/g, '/')
    if (isBlockedPath(rel)) {
      findings.push(item.isDirectory() ? `${rel}/` : rel)
      continue
    }
    if (item.isDirectory()) {
      if (blockedDirs.has(item.name)) {
        findings.push(`${rel}/`)
        continue
      }
      walk(fullPath)
      continue
    }
    if (blockedNames.has(item.name) || /\.db(-journal|-wal|-shm)?$/i.test(item.name)) findings.push(rel)
  }
}

if (!fs.existsSync(target)) {
  console.error(`Deploy guard failed: target does not exist: ${target}`)
  process.exit(1)
}

walk(target)

if (findings.length) {
  console.error('Deploy guard failed: package/stage contains protected production files:')
  findings.forEach((item) => console.error(`- ${item}`))
  console.error('Remove these files before rsync. Production .env, SQLite database files, uploads, backups, logs and generated build/runtime folders must never be overwritten by update packages.')
  process.exit(1)
}

console.log(`Deploy guard passed: ${target}`)
