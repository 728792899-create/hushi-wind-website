#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')
const { loadEnvFile } = require('./load-env')

const root = path.resolve(__dirname, '..')
loadEnvFile(path.join(root, '.env'))

const requiredTables = [
  { name: 'AdminUser', minRows: 1 },
  { name: 'Product', minRows: 0 },
  { name: 'Article', minRows: 0 },
  { name: 'SystemConfig', minRows: 1 },
  { name: 'SupportFaq', minRows: 0 },
  { name: 'Artist', minRows: 0 }
]

const fail = (message) => {
  console.error(`Database check failed: ${message}`)
  process.exit(1)
}

const resolveDatabaseFile = () => {
  const databaseUrl = process.env.DATABASE_URL || ''
  if (!databaseUrl.startsWith('file:')) fail('DATABASE_URL must be a SQLite file: URL')
  const rawPath = databaseUrl.replace(/^file:/, '')
  if (path.isAbsolute(rawPath)) return rawPath
  const rootRelative = path.resolve(root, rawPath)
  if (fs.existsSync(rootRelative)) return rootRelative
  return path.resolve(root, 'prisma', rawPath)
}

const databaseFile = resolveDatabaseFile()
if (!fs.existsSync(databaseFile)) fail(`database file does not exist: ${databaseFile}`)

const stat = fs.statSync(databaseFile)
if (!stat.isFile() || stat.size <= 0) fail(`database file is empty or invalid: ${databaseFile}`)

const prisma = new PrismaClient()

const countTable = async (name) => {
  try {
    const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS count FROM "${name}"`)
    return { ok: true, count: Number(rows?.[0]?.count || 0) }
  } catch (error) {
    return { ok: false, count: 0, error: error.code || error.message }
  }
}

;(async () => {
  console.log('Database check started.')
  console.log(`file=${databaseFile}`)
  console.log(`size=${stat.size}`)

  const failures = []
  for (const table of requiredTables) {
    const result = await countTable(table.name)
    if (!result.ok) {
      failures.push(`${table.name}: missing (${result.error})`)
      console.log(`FAIL ${table.name}: missing`)
      continue
    }
    if (result.count < table.minRows) {
      failures.push(`${table.name}: count ${result.count} < ${table.minRows}`)
      console.log(`FAIL ${table.name}: count=${result.count}, min=${table.minRows}`)
      continue
    }
    console.log(`OK ${table.name}: count=${result.count}`)
  }

  await prisma.$disconnect()

  if (failures.length) {
    console.error('Core database integrity check failed:')
    failures.forEach((item) => console.error(`- ${item}`))
    process.exit(1)
  }

  console.log('Database check passed.')
})().catch(async (error) => {
  console.error(`Database check failed: ${error.message}`)
  await prisma.$disconnect()
  process.exit(1)
})
