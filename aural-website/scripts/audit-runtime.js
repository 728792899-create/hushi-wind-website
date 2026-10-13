#!/usr/bin/env node

// Audit every dependency class: dev/build dependencies can be inlined into
// client, SSR or Nitro chunks. A reviewed exception never exempts shipped code.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { evaluateAdvisories, parseAuditResult, validateExceptions } from './audit-runtime-core.mjs'
import { verifyArtifactManifest } from './artifact-inventory.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export async function auditWebsite({ rootDir = root, outputDir = path.resolve(rootDir, process.env.WEBSITE_OUTPUT_DIR || '.output'), run = spawnSync } = {}) {
  const { manifest, packages } = await verifyArtifactManifest({ rootDir, outputDir })
  const advisories = parseAuditResult(run('npm', ['audit', '--include=dev', '--include=optional', '--include=peer', '--json'], {
    cwd: rootDir, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    timeout: 120000, stdio: ['ignore', 'pipe', 'pipe']
  }))
  const exceptions = validateExceptions(JSON.parse(fs.readFileSync(path.join(rootDir, 'audit-exceptions.json'), 'utf8')))
  const { errors, stale } = evaluateAdvisories(advisories, exceptions, packages)
  if (errors.length) throw new Error(errors.join('\n- '))
  return { manifest, packages, advisories, stale }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) try {
  const { manifest, packages, advisories, stale } = await auditWebsite()
  stale.forEach((item) => console.warn(`Stale exception (no longer reported, remove it): ${item.package} ${item.advisory}`))
  const targets = Object.entries(manifest.provenance.stages).map(([name, stage]) => `${name}: ${stage.chunks.length} chunks/${stage.chunks.reduce((sum, chunk) => sum + chunk.modules.length, 0)} rendered entries/${stage.graphModules.length} loaded modules`).join('; ')
  console.log(`Artifact audit passed. ${manifest.files.length} output file checksums and build inputs verified. ${targets}. ${packages.length - manifest.external.length} bundled package identities; ${manifest.external.length} external package instances. ${advisories.size} high/critical advisories reviewed; no affected versions in the build/artifact inventory.`)
} catch (error) {
  console.error(`Runtime audit failed:\n- ${error.message}`)
  process.exitCode = 1
}
