#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { loadEnvFile } = require('./load-env')

const root = path.resolve(__dirname, '..')
loadEnvFile(path.join(root, '.env'))
const databaseUrl = process.env.DATABASE_URL || ''
const retentionDays = Number.parseInt(process.env.BACKUP_RETENTION_DAYS || '', 10) || 14
const backupRoot = path.resolve(process.env.DATABASE_BACKUP_DIR || path.join(root, 'backups'))

const fail = (message) => {
  console.error(`Database backup failed: ${message}`)
  process.exit(1)
}

const resolveDatabaseFile = () => {
  const rawPath = databaseUrl.replace(/^file:/, '')
  if (path.isAbsolute(rawPath)) return rawPath
  const rootRelative = path.resolve(root, rawPath)
  if (fs.existsSync(rootRelative)) return rootRelative
  return path.resolve(root, 'prisma', rawPath)
}

const timestamp = () => {
  const date = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

const pruneOldBackups = () => {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  for (const item of fs.readdirSync(backupRoot, { withFileTypes: true })) {
    if (!item.isFile() || !/^prod\.predeploy\..+\.(db|dump)$/.test(item.name)) continue
    const filePath = path.join(backupRoot, item.name)
    if (fs.statSync(filePath).mtimeMs < cutoff) fs.rmSync(filePath, { force: true })
  }
}

fs.mkdirSync(backupRoot, { recursive: true })
let source = 'PostgreSQL'
let destination
if (databaseUrl.startsWith('file:')) {
  source = resolveDatabaseFile()
  if (!fs.existsSync(source)) fail(`database file does not exist: ${source}`)
  const stat = fs.statSync(source)
  if (!stat.isFile() || stat.size <= 0) fail(`database file is empty or invalid: ${source}`)
  destination = path.join(backupRoot, `prod.predeploy.${timestamp()}.db`)
  const result = spawnSync('sqlite3', [source, `.backup '${destination.replace(/'/g, "''")}'`], { encoding: 'utf8' })
  if (result.error || result.status !== 0) fail(result.error?.message || result.stderr || 'sqlite3 backup failed')
  const integrity = spawnSync('sqlite3', [destination, 'PRAGMA integrity_check;'], { encoding: 'utf8' })
  if (integrity.status !== 0 || integrity.stdout.trim() !== 'ok') fail(`SQLite integrity check failed: ${integrity.stderr || integrity.stdout}`)
} else if (/^postgres(ql)?:\/\//i.test(databaseUrl)) {
  destination = path.join(backupRoot, `prod.predeploy.${timestamp()}.dump`)
  const result = spawnSync('pg_dump', ['--format=custom', '--no-owner', '--file', destination, databaseUrl], { encoding: 'utf8' })
  if (result.error || result.status !== 0) fail(result.error?.message || result.stderr || 'pg_dump failed')
} else {
  fail('DATABASE_URL must use file:, postgres:, or postgresql:')
}

const copied = fs.statSync(destination)
if (copied.size <= 0) fail('backup size verification failed')
pruneOldBackups()

console.log('Database backup created.')
console.log(`source=${source}`)
console.log(`backup=${destination}`)
console.log(`size=${copied.size}`)
console.log(`retentionDays=${retentionDays}`)
