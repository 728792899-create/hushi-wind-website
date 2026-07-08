#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(root, 'uploads'))
const warningBytes = Number.parseInt(process.env.IMAGE_AUDIT_WARNING_BYTES || '', 10) || 1024 * 1024
const dangerBytes = Number.parseInt(process.env.IMAGE_AUDIT_DANGER_BYTES || '', 10) || 3 * 1024 * 1024

const imageExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'])

const formatSize = (bytes) => {
  if (!Number.isFinite(bytes)) return '-'
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)}MB`
  return `${Math.max(1, Math.round(bytes / 1024))}KB`
}

const readDimensions = (filePath, ext) => {
  try {
    const buffer = fs.readFileSync(filePath)
    if (['.jpg', '.jpeg'].includes(ext)) {
      let offset = 2
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xff) break
        const marker = buffer[offset + 1]
        const length = buffer.readUInt16BE(offset + 2)
        if ([0xc0, 0xc1, 0xc2, 0xc3].includes(marker)) {
          return { width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) }
        }
        offset += 2 + length
      }
    }
    if (ext === '.png' && buffer.toString('ascii', 1, 4) === 'PNG') {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
    }
    if (ext === '.webp' && buffer.toString('ascii', 0, 4) === 'RIFF') {
      const chunk = buffer.toString('ascii', 12, 16)
      if (chunk === 'VP8X') return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) }
    }
  } catch {}
  return { width: null, height: null }
}

const scan = (dir, result = []) => {
  if (!fs.existsSync(dir)) return result
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name)
    if (item.isDirectory()) {
      scan(fullPath, result)
      continue
    }
    const ext = path.extname(item.name).toLowerCase()
    if (!imageExts.has(ext)) continue
    const stat = fs.statSync(fullPath)
    const dimensions = readDimensions(fullPath, ext)
    const pixels = dimensions.width && dimensions.height ? dimensions.width * dimensions.height : 0
    const messages = []
    if (stat.size > dangerBytes) messages.push('体积超过 3MB')
    else if (stat.size > warningBytes) messages.push('体积超过 1MB')
    if (dimensions.width > 3200 || dimensions.height > 2200 || pixels > 7_000_000) messages.push('尺寸明显偏大')
    else if (dimensions.width > 2400 || dimensions.height > 1600 || pixels > 4_000_000) messages.push('尺寸偏高')
    if (['.jpg', '.jpeg', '.png'].includes(ext) && stat.size > 600 * 1024) messages.push('建议转换 WebP')
    result.push({
      file: path.relative(uploadDir, fullPath).replace(/\\/g, '/'),
      size: stat.size,
      sizeLabel: formatSize(stat.size),
      dimensions,
      risk: messages.length ? messages.join('；') : 'OK'
    })
  }
  return result
}

if (!fs.existsSync(uploadDir)) {
  console.log(`Image audit skipped: uploads directory not found: ${uploadDir}`)
  process.exit(0)
}

const rows = scan(uploadDir).sort((a, b) => b.size - a.size)
const risky = rows.filter((item) => item.risk !== 'OK')

console.log(`Image audit: uploads=${uploadDir}`)
console.log(`images=${rows.length}, needOptimization=${risky.length}`)
if (!risky.length) process.exit(0)

console.table(risky.slice(0, 50).map((item) => ({
  file: item.file,
  size: item.sizeLabel,
  dimensions: item.dimensions.width ? `${item.dimensions.width}x${item.dimensions.height}` : '-',
  risk: item.risk
})))

if (risky.length > 50) console.log(`Only first 50 risky images shown. Remaining: ${risky.length - 50}`)
