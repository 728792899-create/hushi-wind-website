#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const clientDir = path.join(root, '.output', 'public', '_nuxt')
const maxJsKb = Number.parseInt(process.env.MAX_JS_KB || '', 10) || 260
const maxGzipKb = Number.parseInt(process.env.MAX_GZIP_KB || '', 10) || 95

const fail = (message) => {
  console.error(`Bundle check failed: ${message}`)
  process.exit(1)
}

if (!fs.existsSync(clientDir)) fail(`client assets not found: ${clientDir}. Run npm run build first.`)

const jsFiles = fs.readdirSync(clientDir)
  .filter((file) => file.endsWith('.js'))
  .map((file) => {
    const fullPath = path.join(clientDir, file)
    const content = fs.readFileSync(fullPath)
    return {
      file,
      kb: content.length / 1024,
      gzipKb: zlib.gzipSync(content).length / 1024
    }
  })
  .sort((a, b) => b.kb - a.kb)

const tooLarge = jsFiles.filter((item) => item.kb > maxJsKb || item.gzipKb > maxGzipKb)

console.log('Largest JS bundles:')
jsFiles.slice(0, 10).forEach((item) => {
  console.log(`${item.file} ${item.kb.toFixed(1)}KB gzip=${item.gzipKb.toFixed(1)}KB`)
})

if (tooLarge.length) {
  console.error(`Found ${tooLarge.length} bundle(s) above limit: raw>${maxJsKb}KB or gzip>${maxGzipKb}KB`)
  tooLarge.forEach((item) => console.error(`- ${item.file} ${item.kb.toFixed(1)}KB gzip=${item.gzipKb.toFixed(1)}KB`))
  process.exit(1)
}

console.log(`Bundle check passed. limits: raw<=${maxJsKb}KB, gzip<=${maxGzipKb}KB`)
