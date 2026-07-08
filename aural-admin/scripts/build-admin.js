#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const viteCli = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')
const verifyScript = path.join(root, 'scripts', 'verify-dist-api.js')
const allowLocalBuild = process.env.ALLOW_LOCAL_ADMIN_BUILD === '1'

const normalize = (value) => String(value || '').trim().replace(/\/$/, '')
const apiBase = normalize(process.env.VITE_API_BASE || process.env.API_PUBLIC_URL)
const siteUrl = normalize(process.env.VITE_SITE_URL || process.env.PUBLIC_SITE_URL)
const localPattern = /(^|\/\/)(127\.0\.0\.1|localhost)(:|\/|$)/i

const fail = (message) => {
  console.error(`Admin build guard failed: ${message}`)
  console.error('Production build command:')
  console.error('  VITE_API_BASE=https://api.shangkong.xyz VITE_SITE_URL=https://www.shangkong.xyz npm run build')
  console.error('Recommended command:')
  console.error('  VITE_API_BASE=https://api.shangkong.xyz VITE_SITE_URL=https://www.shangkong.xyz npm run build:prod')
  process.exit(1)
}

if ((!apiBase || !siteUrl) && !allowLocalBuild) {
  fail('VITE_API_BASE and VITE_SITE_URL are required. This prevents building admin assets with empty or local API addresses.')
}

const env = {
  ...process.env,
  VITE_API_BASE: apiBase || 'http://127.0.0.1:1337',
  VITE_SITE_URL: siteUrl || 'http://127.0.0.1:3000',
  ADMIN_EXPECTED_API_BASE: process.env.ADMIN_EXPECTED_API_BASE || apiBase,
  ADMIN_EXPECTED_SITE_URL: process.env.ADMIN_EXPECTED_SITE_URL || siteUrl
}

if (!allowLocalBuild && (localPattern.test(env.VITE_API_BASE) || localPattern.test(env.VITE_SITE_URL))) {
  fail('local API or site URL detected. Set the official production domains before building.')
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

console.log(`Building admin with VITE_API_BASE=${env.VITE_API_BASE}`)
runNodeScript(viteCli, ['build'])

if (allowLocalBuild && (!apiBase || localPattern.test(env.VITE_API_BASE))) {
  console.warn('Local admin build created with ALLOW_LOCAL_ADMIN_BUILD=1. Do not deploy this dist to production.')
} else {
  runNodeScript(verifyScript)
}
