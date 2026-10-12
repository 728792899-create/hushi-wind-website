#!/usr/bin/env node

// Nuxt 的 dependencies 里混有只在 dev/build 阶段使用的工具链（devtools、listhen、tailwind 等），
// 单纯的 `npm audit --omit=dev` 无法区分它们和真正随 .output 发布的运行时依赖。
// 本门禁要求：
//   1. 每个 high/critical 漏洞都必须在 audit-exceptions.json 中有人工评估记录，否则失败；
//   2. 评估记录过期后失败，强制重新复核；
//   3. 无论是否登记，只要漏洞包出现在 .output/server/node_modules（真实交付物）中即失败。

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const serverModules = path.join(root, '.output', 'server', 'node_modules')
const exceptionsFile = path.join(root, 'audit-exceptions.json')
const blockingSeverities = new Set(['high', 'critical'])
const today = new Date().toISOString().slice(0, 10)

const fail = (messages) => {
  console.error('Runtime audit failed:')
  messages.forEach((message) => console.error(`- ${message}`))
  process.exit(1)
}

if (!fs.existsSync(serverModules)) fail([`server bundle not found: ${serverModules}. Run npm run build first.`])

const runAudit = () => {
  try {
    return execFileSync('npm', ['audit', '--omit=dev', '--json'], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  } catch (error) {
    // npm audit 发现漏洞时退出码非 0，但 stdout 仍是完整 JSON
    if (error.stdout) return error.stdout
    throw error
  }
}

const shippedPackages = new Set()
const collectShipped = (dir) => {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.name.startsWith('@')) {
      collectShipped(full)
      continue
    }
    const manifest = path.join(full, 'package.json')
    if (fs.existsSync(manifest)) {
      const { name } = JSON.parse(fs.readFileSync(manifest, 'utf8'))
      if (name) shippedPackages.add(name)
    }
    collectShipped(path.join(full, 'node_modules'))
  }
}
collectShipped(serverModules)

const report = JSON.parse(runAudit())
const advisories = new Map()
for (const [pkg, vuln] of Object.entries(report.vulnerabilities || {})) {
  for (const via of vuln.via) {
    if (typeof via === 'string' || !blockingSeverities.has(via.severity)) continue
    advisories.set(via.url, { pkg, severity: via.severity, title: via.title, range: via.range })
  }
}

const exceptions = JSON.parse(fs.readFileSync(exceptionsFile, 'utf8')).exceptions
const exceptionByUrl = new Map(exceptions.map((item) => [item.advisory, item]))
const errors = []

for (const [url, advisory] of advisories) {
  const label = `${advisory.severity} ${advisory.pkg}@${advisory.range} ${url}`
  if (shippedPackages.has(advisory.pkg)) errors.push(`shipped in .output: ${label}`)
  const exception = exceptionByUrl.get(url)
  if (!exception) errors.push(`not reviewed (add to audit-exceptions.json or upgrade): ${label} — ${advisory.title}`)
  else if (exception.expires < today) errors.push(`exception expired on ${exception.expires}: ${label}`)
}

const stale = exceptions.filter((item) => !advisories.has(item.advisory))
stale.forEach((item) => console.warn(`Stale exception (no longer reported, remove it): ${item.package} ${item.advisory}`))

if (errors.length) fail(errors)

console.log(`Runtime audit passed. ${advisories.size} high/critical advisory(ies) reviewed, none shipped in .output (${shippedPackages.size} runtime packages scanned).`)
