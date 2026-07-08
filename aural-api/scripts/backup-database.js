#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { loadEnvFile } = require('./load-env')

const root = path.resolve(__dirname, '..')
loadEnvFile(path.join(root, '.env'))
const retentionDays = Number.parseInt(process.env.BACKUP_RETENTION_DAYS || '', 10) || 14
const backupRoot = path.resolve(process.env.DATABASE_BACKUP_DIR || path.join(root, 'backups'))

const fail = (message) => {
  console.error(`Database backup failed: ${message}`)
  process.exit(1)
}

const resolveDatabaseFile = () => {
  const databaseUrl = process.env.DATABASE_URL || ''
  if (!databaseUrl.startsWith('file:')) fail('only SQLite file: DATABASE_URL is supported by this backup script')
  const rawPath = databaseUrl.replace(/^file:/, '')
  if (path.isAbsolute(rawPath)) return rawPath
  const rootRelative = path.resolve(root, rawPath)
  if (fs.existsSync(rootRelative)) return rootRelative
  return path.resolve(root, 'prisma', rawPath)
}

const timestamp = () => {
  const date = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('') + '-' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('')
}

const pruneOldBackups = () => {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  for (const item of fs.readdirSync(backupRoot, { withFileTypes: true })) {
    if (!item.isFile() || !/^prod\.predeploy\..+\.db$/.test(item.name)) continue
    const filePath = path.join(backupRoot, item.name)
    const stat = fs.statSync(filePath)
    if (stat.mtimeMs < cutoff) fs.rmSync(filePath, { force: true })
  }
}

const source = resolveDatabaseFile()
if (!fs.existsSync(source)) fail(`database file does not exist: ${source}`)

const stat = fs.statSync(source)
if (!stat.isFile() || stat.size <= 0) fail(`database file is empty or invalid: ${source}`)

fs.mkdirSync(backupRoot, { recursive: true })
const destination = path.join(backupRoot, `prod.predeploy.${timestamp()}.db`)
fs.copyFileSync(source, destination)
const copied = fs.statSync(destination)
if (copied.size !== stat.size || copied.size <= 0) fail('backup size verification failed')

pruneOldBackups()

console.log('Database backup created.')
console.log(`source=${source}`)
console.log(`backup=${destination}`)
console.log(`size=${copied.size}`)
console.log(`retentionDays=${retentionDays}`)
