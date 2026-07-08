#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const configPath = process.env.NGINX_CONFIG || '/etc/nginx/conf.d/shangkong.conf'
const expectedAdminRoot = process.env.EXPECTED_ADMIN_ROOT || '/var/www/shangkong/aural-admin/dist'
const expectedApiProxy = process.env.EXPECTED_API_PROXY || 'http://127.0.0.1:1337'
const expectedWebProxy = process.env.EXPECTED_WEB_PROXY || 'http://127.0.0.1:3000'

const fail = (message) => {
  console.error(`Nginx target check failed: ${message}`)
  process.exit(1)
}

if (!fs.existsSync(configPath)) fail(`config not found: ${configPath}`)
const content = fs.readFileSync(configPath, 'utf8')
const compact = content.replace(/\s+/g, ' ')

if (!compact.includes(expectedAdminRoot)) fail(`admin root is not found: ${expectedAdminRoot}`)
if (!compact.includes(expectedApiProxy)) fail(`API proxy target is not found: ${expectedApiProxy}`)
if (!compact.includes(expectedWebProxy)) fail(`web proxy target is not found: ${expectedWebProxy}`)

console.log('Nginx target check passed.')
console.log(`config=${configPath}`)
console.log(`adminRoot=${expectedAdminRoot}`)
console.log(`apiProxy=${expectedApiProxy}`)
console.log(`webProxy=${expectedWebProxy}`)
