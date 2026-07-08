#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { loadEnvFile } = require('./load-env')

const root = path.resolve(__dirname, '..')
loadEnvFile(path.join(root, '.env'))

const deployLogDir = path.resolve(process.env.DEPLOY_LOG_DIR || path.join(root, 'logs', 'deployments'))
const historyFile = path.join(deployLogDir, 'history.jsonl')
const limit = Number.parseInt(process.argv[2] || process.env.DEPLOY_HISTORY_LIMIT || '10', 10)

if (!fs.existsSync(historyFile)) {
  console.log(`No deployment history found: ${historyFile}`)
  process.exit(0)
}

const rows = fs.readFileSync(historyFile, 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    try { return JSON.parse(line) } catch { return null }
  })
  .filter(Boolean)
  .slice(-Math.max(1, limit))
  .reverse()

if (!rows.length) {
  console.log('No deployment history found.')
  process.exit(0)
}

console.table(rows.map((item) => ({
  id: item.id,
  status: item.status,
  startedAt: item.startedAt,
  duration: item.durationMs ? `${Math.round(item.durationMs / 1000)}s` : '-',
  modules: Array.isArray(item.modules) ? item.modules.join(',') : '',
  stage: item.stageRoot,
  error: item.error || ''
})))

console.log(`history=${historyFile}`)
