const fs = require('fs')
const path = require('path')

const parseEnvLine = (line) => {
  const trimmed = String(line || '').trim()
  if (!trimmed || trimmed.startsWith('#')) return null
  const index = trimmed.indexOf('=')
  if (index <= 0) return null
  const key = trimmed.slice(0, index).trim()
  let value = trimmed.slice(index + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  return { key, value }
}

const loadEnvFile = (envPath = path.resolve(__dirname, '..', '.env')) => {
  if (!fs.existsSync(envPath)) return false
  const content = fs.readFileSync(envPath, 'utf8')
  content.split(/\r?\n/).forEach((line) => {
    const parsed = parseEnvLine(line)
    if (!parsed) return
    if (process.env[parsed.key] === undefined) process.env[parsed.key] = parsed.value
  })
  return true
}

module.exports = { loadEnvFile }
