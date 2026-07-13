#!/usr/bin/env node

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const databaseUrl = process.env.DATABASE_URL || 'file:./dev.db'
if (!databaseUrl.startsWith('file:')) {
  console.log('Automated demo verification targets SQLite; use pg_restore --list for PostgreSQL dumps.')
  process.exit(0)
}

const rawPath = databaseUrl.slice('file:'.length)
const rootCandidate = path.resolve(root, rawPath)
const source = fs.existsSync(rootCandidate) ? rootCandidate : path.resolve(root, 'prisma', rawPath)
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hushi-backup-verify-'))

const run = (command, args, env = process.env) => {
  const result = spawnSync(command, args, { cwd: root, env, encoding: 'utf8' })
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || `${command} failed`)
  return result.stdout.trim()
}

try {
  const output = run(process.execPath, ['scripts/backup-database.js'], { ...process.env, DATABASE_URL: databaseUrl, DATABASE_BACKUP_DIR: tempRoot })
  const backup = output.split('\n').find((line) => line.startsWith('backup='))?.slice(7)
  if (!backup || !fs.existsSync(backup)) throw new Error('backup file was not created')
  const restored = path.join(tempRoot, 'restored.db')
  fs.copyFileSync(backup, restored)
  const integrity = run('sqlite3', [restored, 'PRAGMA integrity_check;'])
  if (integrity !== 'ok') throw new Error(`restored database integrity failed: ${integrity}`)
  const countSql = 'SELECT (SELECT COUNT(*) FROM Product) || ":" || (SELECT COUNT(*) FROM AdminUser);'
  const sourceCounts = run('sqlite3', [source, countSql])
  const restoredCounts = run('sqlite3', [restored, countSql])
  if (sourceCounts !== restoredCounts) throw new Error(`row count mismatch: source=${sourceCounts}, restored=${restoredCounts}`)
  console.log(`Backup restore verification passed. product:admin=${restoredCounts}`)
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true })
}
