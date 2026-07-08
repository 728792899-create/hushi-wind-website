#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const appDir = path.join(root, 'app')
const outputDir = path.join(root, '.output', 'public')
const maxMissingSizes = Number.parseInt(process.env.MAX_IMG_MISSING_SIZES || '', 10) || 0
const maxMissingLoading = Number.parseInt(process.env.MAX_IMG_MISSING_LOADING || '', 10) || 0
const maxJsKb = Number.parseInt(process.env.MAX_JS_KB || '', 10) || 320
const maxGzipKb = Number.parseInt(process.env.MAX_GZIP_KB || '', 10) || 115

const walk = (dir, files = []) => {
  if (!fs.existsSync(dir)) return files
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name)
    if (item.isDirectory()) walk(fullPath, files)
    else files.push(fullPath)
  }
  return files
}

const lineNumberAt = (content, index) => content.slice(0, index).split(/\r?\n/).length

const scanImages = () => {
  const vueFiles = walk(appDir).filter((file) => file.endsWith('.vue'))
  const findings = []
  for (const file of vueFiles) {
    const content = fs.readFileSync(file, 'utf8')
    const matches = content.matchAll(/<img\b[\s\S]*?(?:\/>|>)/g)
    for (const match of matches) {
      const tag = match[0]
      const rel = path.relative(root, file).replace(/\\/g, '/')
      const line = lineNumberAt(content, match.index)
      if (!/\bloading=/.test(tag)) findings.push({ type: 'missing-loading', rel, line })
      if (!/\bdecoding=/.test(tag)) findings.push({ type: 'missing-decoding', rel, line })
      if (!/\bsizes=/.test(tag) && !/\bwidth=/.test(tag)) findings.push({ type: 'missing-sizes', rel, line })
      if (/\bloading=["']eager["']/.test(tag) && !/\bfetchpriority=["']high["']/.test(tag)) findings.push({ type: 'eager-without-high-priority', rel, line })
    }
  }
  return findings
}

const checkBundles = () => {
  const nuxtDir = path.join(outputDir, '_nuxt')
  if (!fs.existsSync(nuxtDir)) {
    return { skipped: true, reason: `build output not found: ${nuxtDir}` }
  }
  const jsFiles = fs.readdirSync(nuxtDir)
    .filter((file) => file.endsWith('.js'))
    .map((file) => {
      const fullPath = path.join(nuxtDir, file)
      const content = fs.readFileSync(fullPath)
      return {
        file,
        kb: content.length / 1024,
        gzipKb: zlib.gzipSync(content).length / 1024
      }
    })
    .sort((a, b) => b.kb - a.kb)
  return {
    skipped: false,
    files: jsFiles.slice(0, 10),
    tooLarge: jsFiles.filter((item) => item.kb > maxJsKb || item.gzipKb > maxGzipKb)
  }
}

const imageFindings = scanImages()
const missingSizes = imageFindings.filter((item) => item.type === 'missing-sizes')
const missingLoading = imageFindings.filter((item) => item.type === 'missing-loading')
const missingDecoding = imageFindings.filter((item) => item.type === 'missing-decoding')
const eagerWithoutPriority = imageFindings.filter((item) => item.type === 'eager-without-high-priority')

console.log(`Image performance scan:`)
console.log(`missing loading=${missingLoading.length}, decoding=${missingDecoding.length}, sizes/width=${missingSizes.length}, eager without high priority=${eagerWithoutPriority.length}`)
imageFindings.slice(0, 30).forEach((item) => {
  console.log(`- ${item.type} ${item.rel}:${item.line}`)
})

const bundle = checkBundles()
if (bundle.skipped) {
  console.log(`Bundle scan skipped: ${bundle.reason}`)
} else {
  console.log('\nLargest JS bundles:')
  bundle.files.forEach((item) => console.log(`${item.file} ${item.kb.toFixed(1)}KB gzip=${item.gzipKb.toFixed(1)}KB`))
}

const failures = []
if (missingSizes.length > maxMissingSizes) failures.push(`missing sizes/width ${missingSizes.length} > ${maxMissingSizes}`)
if (missingLoading.length > maxMissingLoading) failures.push(`missing loading ${missingLoading.length} > ${maxMissingLoading}`)
if (missingDecoding.length > 0) failures.push(`missing decoding ${missingDecoding.length}`)
if (eagerWithoutPriority.length > 0) failures.push(`eager images without fetchpriority=high ${eagerWithoutPriority.length}`)
if (!bundle.skipped && bundle.tooLarge.length) failures.push(`large JS bundles ${bundle.tooLarge.length} above raw>${maxJsKb}KB or gzip>${maxGzipKb}KB`)

if (failures.length) {
  console.error(`\nPerformance check failed: ${failures.join('; ')}`)
  process.exit(1)
}

console.log('\nPerformance check passed.')
