#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const verifyScript = path.join(root, 'scripts', 'verify-dist-api.js')

const requiredEnv = (label, ...values) => {
  const value = values.find((item) => String(item || '').trim())
  if (!value) {
    console.error(`Admin production build failed: ${label} is required.`)
    process.exit(1)
  }
  return String(value).trim().replace(/\/$/, '')
}

const apiBase = requiredEnv('VITE_API_BASE or API_PUBLIC_URL', process.env.VITE_API_BASE, process.env.API_PUBLIC_URL)
const siteUrl = requiredEnv('VITE_SITE_URL or PUBLIC_SITE_URL', process.env.VITE_SITE_URL, process.env.PUBLIC_SITE_URL)

const env = {
  ...process.env,
  VITE_API_BASE: apiBase,
  VITE_SITE_URL: siteUrl,
  ADMIN_EXPECTED_API_BASE: process.env.ADMIN_EXPECTED_API_BASE || apiBase,
  ADMIN_EXPECTED_SITE_URL: process.env.ADMIN_EXPECTED_SITE_URL || siteUrl
}

const runNodeScript = (script, args = []) => {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    env,
    stdio: 'inherit'
  })
  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }
  if (result.status !== 0) process.exit(result.status || 1)
}

console.log(`Building admin for production with VITE_API_BASE=${env.VITE_API_BASE}`)
runNodeScript(viteCli, ['build'])
runNodeScript(verifyScript)
