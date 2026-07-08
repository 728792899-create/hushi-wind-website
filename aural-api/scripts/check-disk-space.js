#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { PrismaClient } = require('@prisma/client')
const { loadEnvFile } = require('./load-env')

loadEnvFile()

const prisma = new PrismaClient()
const root = path.resolve(__dirname, '..')
const thresholdPercent = Number.parseFloat(process.env.DISK_ALERT_THRESHOLD_PERCENT || '85')
const minFreeMb = Number.parseFloat(process.env.DISK_ALERT_MIN_FREE_MB || '1024')
const alertWebhookUrl = process.env.ALERT_WEBHOOK_URL || ''
const mounts = String(process.env.DISK_CHECK_PATHS || [
  '/',
  root,
  path.join(root, 'uploads'),
  path.join(root, 'backups'),
  path.join(root, 'logs')
].join(','))
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)

const unique = (items) => [...new Set(items)]

const ensurePath = (target) => {
  if (fs.existsSync(target)) return target
  const parent = path.dirname(target)
  return fs.existsSync(parent) ? parent : root
}

const parseDfLine = (line) => {
  const parts = String(line || '').trim().split(/\s+/)
  if (parts.length < 6) return null
  const [filesystem, blocks, used, available, usePercent, ...mountParts] = parts
  return {
    filesystem,
    blocksKb: Number(blocks),
    usedKb: Number(used),
    availableKb: Number(available),
    usedPercent: Number(String(usePercent).replace('%', '')),
    mount: mountParts.join(' ')
  }
}

const checkUnixDisk = (target) => {
  const output = execFileSync('df', ['-Pk', target], { encoding: 'utf8' })
  const lines = output.trim().split(/\r?\n/)
  return parseDfLine(lines[1])
}

const checkWindowsDisk = (target) => {
  const resolved = path.resolve(target)
  const rootPath = path.parse(resolved).root.replace(/\\$/, '')
  const ps = [
    'Get-CimInstance Win32_LogicalDisk',
    `| Where-Object { $_.DeviceID -eq '${rootPath.replace(/'/g, "''")}' }`,
    '| Select-Object -First 1 DeviceID,Size,FreeSpace',
    '| ConvertTo-Json -Compress'
  ].join(' ')
  const output = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' })
  const data = JSON.parse(output || '{}')
  if (!data.DeviceID || !Number(data.Size)) throw new Error(`无法读取磁盘信息：${rootPath}`)
  const sizeKb = Math.round(Number(data.Size || 0) / 1024)
  const availableKb = Math.round(Number(data.FreeSpace || 0) / 1024)
  const usedKb = Math.max(0, sizeKb - availableKb)
  return {
    filesystem: data.DeviceID || rootPath,
    blocksKb: sizeKb,
    usedKb,
    availableKb,
    usedPercent: sizeKb ? Math.round((usedKb / sizeKb) * 100) : 0,
    mount: data.DeviceID || rootPath
  }
}

const diskInfo = (target) => {
  const existing = ensurePath(target)
  return process.platform === 'win32' ? checkWindowsDisk(existing) : checkUnixDisk(existing)
}

const safeJson = (value) => {
  try { return JSON.stringify(value ?? null).slice(0, 8000) } catch { return null }
}

const sendWebhook = async (payload) => {
  if (!alertWebhookUrl) return
  try {
    await fetch(alertWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
  } catch {}
}

const createAlert = async (summary, rows) => {
  const title = '服务器磁盘空间不足'
  const recent = await prisma.alertRecord.findFirst({
    where: {
      type: 'disk_space_low',
      title,
      createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }
    },
    orderBy: { createdAt: 'desc' }
  })
  if (recent) return null
  const record = await prisma.alertRecord.create({
    data: {
      level: 'critical',
      type: 'disk_space_low',
      title,
      message: summary,
      metadata: safeJson({ thresholdPercent, minFreeMb, rows })
    }
  })
  await sendWebhook({ level: 'critical', type: 'disk_space_low', title, message: summary, rows, alertId: record.id })
  return record
}

;(async () => {
  const rows = []
  const seenMounts = new Set()
  for (const target of mounts) {
    try {
      const info = diskInfo(target)
      if (!info || seenMounts.has(info.mount)) continue
      seenMounts.add(info.mount)
      const freeMb = Math.round(info.availableKb / 1024)
      const totalMb = Math.round(info.blocksKb / 1024)
      const danger = info.usedPercent >= thresholdPercent || freeMb <= minFreeMb
      rows.push({ target, mount: info.mount, filesystem: info.filesystem, usedPercent: info.usedPercent, freeMb, totalMb, danger })
    } catch (error) {
      rows.push({ target, mount: target, filesystem: '', usedPercent: 0, freeMb: 0, totalMb: 0, danger: true, error: error.message })
    }
  }

  const dangerous = rows.filter((row) => row.danger)
  rows.forEach((row) => {
    const status = row.danger ? 'WARN' : 'OK'
    const extra = row.error ? ` error=${row.error}` : ` used=${row.usedPercent}% free=${row.freeMb}MB total=${row.totalMb}MB`
    console.log(`${status} ${row.mount}${extra}`)
  })

  if (dangerous.length) {
    const summary = unique(dangerous.map((row) => `${row.mount} 已用 ${row.usedPercent}% / 剩余 ${row.freeMb}MB`)).join('；')
    await createAlert(summary, dangerous)
    await prisma.$disconnect()
    process.exit(1)
  }

  await prisma.$disconnect()
})().catch(async (error) => {
  console.error(`Disk check failed: ${error.message}`)
  await prisma.$disconnect()
  process.exit(1)
})
