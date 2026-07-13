#!/usr/bin/env node

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const isProduction = process.env.NODE_ENV === 'production'
const required = [
  'DATABASE_URL',
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD',
  'ADMIN_TOKEN_SECRET',
  'PUBLIC_SITE_URL',
  'PUBLIC_ADMIN_URL',
  'ALLOWED_ORIGINS'
]

const fail = (message) => {
  console.error(`Preflight failed: ${message}`)
  process.exit(1)
}

const normalizeBase = (value) => String(value || '').trim().replace(/\/$/, '')
const splitEnvList = (value) => String(value || '').split(',').map((item) => normalizeBase(item)).filter(Boolean)
const isProductionUrl = (value) => /^https:\/\//i.test(String(value || '')) && !/localhost|127\.0\.0\.1/i.test(String(value || ''))
const isStrongPassword = (value) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,64}$/.test(String(value || ''))
const isPlaceholder = (value) => /replace|change[-_ ]?me|your-company|example\.(com|org|net)|placeholder/i.test(String(value || ''))

if (isProduction) {
  required.forEach((key) => {
    if (!process.env[key]) fail(`${key} is required in production`)
  })
  if (['admin', 'demo_admin'].includes(process.env.ADMIN_USERNAME)) fail('ADMIN_USERNAME must not use a built-in demo account')
  if (isPlaceholder(process.env.ADMIN_USERNAME)) fail('ADMIN_USERNAME must not contain an example placeholder')
  if (['123456', 'DemoPass_2026!'].includes(process.env.ADMIN_PASSWORD) || isPlaceholder(process.env.ADMIN_PASSWORD) || !isStrongPassword(process.env.ADMIN_PASSWORD)) fail('ADMIN_PASSWORD must not use a demo/placeholder value and must include upper/lower case, number, and symbol')
  if ((process.env.ADMIN_TOKEN_SECRET || '').length < 32 || isPlaceholder(process.env.ADMIN_TOKEN_SECRET)) fail('ADMIN_TOKEN_SECRET must be at least 32 characters and must not be a placeholder')
  ;['PUBLIC_SITE_URL', 'PUBLIC_ADMIN_URL', 'API_PUBLIC_URL', 'UPLOAD_PUBLIC_BASE'].forEach((key) => {
    if (!isProductionUrl(process.env[key]) || isPlaceholder(process.env[key])) fail(`${key} must be a non-placeholder HTTPS production URL`)
  })
  splitEnvList(process.env.ALLOWED_ORIGINS).forEach((origin) => {
    if (!isProductionUrl(origin) || isPlaceholder(origin)) fail(`ALLOWED_ORIGINS contains a non-production or placeholder origin: ${origin}`)
  })
  if (process.env.DEPLOYMENT_MODE === 'multi-instance' && process.env.RATE_LIMIT_STORE !== 'redis') fail('multi-instance production requires RATE_LIMIT_STORE=redis')
  if (process.env.RATE_LIMIT_STORE === 'redis' && !process.env.REDIS_URL) fail('RATE_LIMIT_STORE=redis requires REDIS_URL')
  if (process.env.UPLOAD_STORAGE === 's3') {
    ;['S3_BUCKET', 'S3_REGION', 'S3_PUBLIC_BASE'].forEach((key) => {
      if (!process.env[key]) fail(`UPLOAD_STORAGE=s3 requires ${key}`)
    })
  }
  if (process.env.OBSERVABILITY_REQUIRED === 'true' && !process.env.SENTRY_DSN) fail('OBSERVABILITY_REQUIRED=true requires SENTRY_DSN')
}

if (process.env.DATABASE_URL?.startsWith('file:')) {
  const rawDbPath = process.env.DATABASE_URL.replace(/^file:/, '')
  const dbPath = path.isAbsolute(rawDbPath) ? rawDbPath : path.resolve(__dirname, '..', rawDbPath)
  const dbDir = path.dirname(dbPath)
  if (!fs.existsSync(dbDir)) fail(`database directory does not exist: ${dbDir}`)
}

console.log('Preflight passed.')
console.log(`NODE_ENV=${process.env.NODE_ENV || 'development'}`)
console.log(`DEPLOY_ID=${process.env.DEPLOY_ID || crypto.randomBytes(4).toString('hex')}`)
