#!/usr/bin/env node

// Nuxt dependencies include dev/build tools. Require bounded, reviewed
// exceptions and reject affected packages in the external server inventory.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { collectExternalPackages, evaluateAdvisories, parseAuditResult, validateExceptions } from './audit-runtime-core.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

try {
  const externalPackages = collectExternalPackages(path.join(root, '.output', 'server', 'node_modules'))
  const advisories = parseAuditResult(spawnSync('npm', ['audit', '--omit=dev', '--json'], {
    cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    timeout: 120000, stdio: ['ignore', 'pipe', 'pipe']
  }))
  const exceptions = validateExceptions(JSON.parse(fs.readFileSync(path.join(root, 'audit-exceptions.json'), 'utf8')))
  const { errors, stale } = evaluateAdvisories(advisories, exceptions, externalPackages)
  if (errors.length) throw new Error(errors.join('\n- '))
  stale.forEach((item) => console.warn(`Stale exception (no longer reported, remove it): ${item.package} ${item.advisory}`))
  console.log(`Runtime audit passed. ${advisories.size} high/critical advisories reviewed; none in ${externalPackages.size} external server packages. Bundled code is outside this inventory.`)
} catch (error) {
  console.error(`Runtime audit failed:\n- ${error.message}`)
  process.exitCode = 1
}
