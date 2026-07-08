#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')
const { loadEnvFile } = require('./load-env')

const root = path.resolve(__dirname, '..')
loadEnvFile(path.join(root, '.env'))

const apply = process.argv.includes('--apply')
const backupEnabled = !process.argv.includes('--no-backup')
const prisma = new PrismaClient()

const replacements = [
  ['上空声学研发团队', '胡氏管乐技术服务团队'],
  ['上空 Care+', '胡氏管乐 Care+'],
  ['上空乐器', '胡氏管乐'],
  ['上空音乐', '胡氏管乐'],
  ['SHANGKONG Instruments', 'HUSHI WIND Instruments'],
  ['support@shangkong.com', 'service@hushiguanle.com'],
  ['hr@aural.com', 'hr@hushiguanle.com'],
  ['上空', '胡氏管乐']
]

const modelFields = [
  ['systemConfig', 'SystemConfig', ['aboutTitle', 'aboutText', 'contactEmail', 'footerText', 'coreTechTitle', 'coreTechDesc', 'coreTechLinkText', 'quoteText', 'quoteAuthor']],
  ['article', 'Article', ['title', 'description', 'category', 'seoTitle', 'seoDescription', 'seoKeywords']],
  ['supportFaq', 'SupportFaq', ['question', 'answer', 'category']],
  ['supportDownload', 'SupportDownload', ['name', 'type', 'size']],
  ['audioSolution', 'AudioSolution', ['en', 'title', 'desc']],
  ['audioStat', 'AudioStat', ['label', 'value', 'desc']],
  ['brandTimeline', 'BrandTimeline', ['year', 'title', 'desc']],
  ['ecosystemService', 'EcosystemService', ['icon', 'title', 'desc']],
  ['quickGuide', 'QuickGuide', ['title', 'duration', 'category']],
  ['pageContent', 'PageContent', ['title', 'content']],
  ['product', 'Product', ['title', 'categoryName', 'description', 'specs', 'features', 'scenes', 'warranty', 'series', 'seoTitle', 'seoDescription', 'seoKeywords']],
  ['artist', 'Artist', ['role', 'bio', 'equipment']]
]

const fail = async (message) => {
  console.error(`Brand cleanup failed: ${message}`)
  await prisma.$disconnect()
  process.exit(1)
}

const resolveDatabaseFile = () => {
  const databaseUrl = process.env.DATABASE_URL || ''
  if (!databaseUrl.startsWith('file:')) return null
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

const backupDatabase = () => {
  const databaseFile = resolveDatabaseFile()
  if (!databaseFile || !fs.existsSync(databaseFile)) return null
  const stat = fs.statSync(databaseFile)
  if (!stat.isFile() || stat.size <= 0) return null
  const backupDir = path.resolve(process.env.DATABASE_BACKUP_DIR || path.join(root, 'backups'))
  fs.mkdirSync(backupDir, { recursive: true })
  const backupFile = path.join(backupDir, `brand-cleanup.${timestamp()}.db`)
  fs.copyFileSync(databaseFile, backupFile)
  return backupFile
}

const replaceText = (value) => {
  if (typeof value !== 'string' || !value) return value
  let next = value
  replacements.forEach(([from, to]) => {
    next = next.split(from).join(to)
  })
  return next
}

const previewValue = (value) => String(value || '').replace(/\s+/g, ' ').slice(0, 160)

const collectChanges = async () => {
  const changes = []
  for (const [model, label, fields] of modelFields) {
    let rows = []
    try {
      rows = await prisma[model].findMany()
    } catch (error) {
      console.warn(`Skip ${label}: ${error.message}`)
      continue
    }

    rows.forEach((row) => {
      const data = {}
      const fieldChanges = []
      fields.forEach((field) => {
        const before = row[field]
        const after = replaceText(before)
        if (after !== before) {
          data[field] = after
          fieldChanges.push({ field, before, after })
        }
      })
      if (fieldChanges.length) {
        changes.push({ model, label, id: row.id, data, fieldChanges })
      }
    })
  }
  return changes
}

;(async () => {
  const changes = await collectChanges()

  console.log(`Brand cleanup mode: ${apply ? 'APPLY' : 'DRY RUN'}`)
  console.log(`matchedRecords=${changes.length}`)

  changes.forEach((item) => {
    console.log(`\n[${item.label}] id=${item.id}`)
    item.fieldChanges.forEach((change) => {
      console.log(`- ${change.field}`)
      console.log(`  before: ${previewValue(change.before)}`)
      console.log(`  after : ${previewValue(change.after)}`)
    })
  })

  if (!changes.length) {
    await prisma.$disconnect()
    return
  }

  if (!apply) {
    console.log('\nNo data changed. Re-run with --apply to update database.')
    await prisma.$disconnect()
    return
  }

  const backupFile = backupEnabled ? backupDatabase() : null
  if (backupEnabled && !backupFile) await fail('database backup could not be created')
  if (backupFile) console.log(`\nBackup created: ${backupFile}`)

  for (const item of changes) {
    await prisma[item.model].update({ where: { id: item.id }, data: item.data })
  }

  await prisma.operationLog.create({
    data: {
      operator: 'system-script',
      action: 'BRAND_CLEANUP',
      module: 'system',
      target: 'database-content',
      summary: `清理旧品牌文案 ${changes.length} 条记录`,
      afterData: JSON.stringify({
        changedRecords: changes.length,
        changedTables: [...new Set(changes.map((item) => item.label))],
        backupFile
      }).slice(0, 8000)
    }
  }).catch(() => {})

  console.log(`\nBrand cleanup applied. changedRecords=${changes.length}`)
  await prisma.$disconnect()
})().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
