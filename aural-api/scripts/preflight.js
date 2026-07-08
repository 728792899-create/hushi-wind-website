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

if (isProduction) {
  required.forEach((key) => {
    if (!process.env[key]) fail(`${key} is required in production`)
  })
  if (process.env.ADMIN_USERNAME === 'admin') fail('ADMIN_USERNAME must not be admin')
  if (process.env.ADMIN_PASSWORD === '123456' || !isStrongPassword(process.env.ADMIN_PASSWORD)) fail('ADMIN_PASSWORD must be 12-64 chars and include upper/lower case, number, and symbol')
  if ((process.env.ADMIN_TOKEN_SECRET || '').length < 32) fail('ADMIN_TOKEN_SECRET must be at least 32 characters')
  ;['PUBLIC_SITE_URL', 'PUBLIC_ADMIN_URL', 'API_PUBLIC_URL', 'UPLOAD_PUBLIC_BASE'].forEach((key) => {
    if (!isProductionUrl(process.env[key])) fail(`${key} must be an HTTPS production URL`)
  })
  splitEnvList(process.env.ALLOWED_ORIGINS).forEach((origin) => {
    if (!isProductionUrl(origin)) fail(`ALLOWED_ORIGINS contains a non-production origin: ${origin}`)
  })
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
