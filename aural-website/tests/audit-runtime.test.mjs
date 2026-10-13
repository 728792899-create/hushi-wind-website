import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  parseAuditResult,
  validateExceptions,
  collectExternalPackages,
  evaluateAdvisories
} from '../scripts/audit-runtime-core.mjs'

const today = '2026-10-13'
const advisoryUrl = 'https://github.com/advisories/GHSA-fixture-tool'
const sourceAdvisory = (name = 'tool', severity = 'high', url = advisoryUrl) => ({
  name, severity, url, title: 'Synthetic audit fixture', range: '<2.0.0'
})
const vulnerability = (name, via, severity = 'high') => ({ name, via, severity })
const reportFor = (vulnerabilities = {}) => {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 }
  for (const entry of Object.values(vulnerabilities)) {
    counts[entry.severity]++
    counts.total++
  }
  return { auditReportVersion: 2, vulnerabilities, metadata: { vulnerabilities: counts } }
}
const auditResult = (report = reportFor(), status = 0) => ({ status, signal: null, stdout: JSON.stringify(report) })
const activeReport = () => reportFor({ tool: vulnerability('tool', [sourceAdvisory()]) })
const exception = (overrides = {}) => ({
  package: 'tool', advisory: advisoryUrl, path: 'build-tool > tool',
  reason: 'Synthetic build-only dependency; absent from the external inventory.',
  reviewed: '2026-10-01', expires: '2026-12-30', ...overrides
})
const validatedExceptions = (items = [exception()]) => validateExceptions({ exceptions: items }, today)

test('audit accepts a complete zero-vulnerability report', () => {
  assert.deepEqual([...parseAuditResult(auditResult())], [])
})

test('audit rejects registry errors, subprocess failures and incomplete output', () => {
  const invalid = [
    ['registry error JSON', auditResult({ error: { code: 'ENOAUDIT', summary: 'Fixture registry failure' } }, 1)],
    ['error field alongside a valid report', auditResult({ ...reportFor(), error: null })],
    ['unknown exit status', auditResult(reportFor(), 2)],
    ['missing exit status', { ...auditResult(), status: null }],
    ['terminated subprocess', { ...auditResult(), signal: 'SIGTERM' }],
    ['spawn failure', { ...auditResult(), error: new Error('fixture spawn failure') }],
    ['truncated JSON', { ...auditResult(), stdout: '{"auditReportVersion":2' }],
    ['empty output', { ...auditResult(), stdout: '' }],
    ['failed status with no vulnerabilities', auditResult(reportFor(), 1)]
  ]
  for (const [label, result] of invalid) assert.throws(() => parseAuditResult(result), Error, label)
})

test('audit requires complete report fields and internally consistent counts', () => {
  const mutations = [
    ['missing report version', report => { delete report.auditReportVersion }],
    ['unsupported report version', report => { report.auditReportVersion = 1 }],
    ['missing vulnerability map', report => { delete report.vulnerabilities }],
    ['array vulnerability map', report => { report.vulnerabilities = [] }],
    ['missing metadata', report => { delete report.metadata }],
    ['missing counts', report => { delete report.metadata.vulnerabilities }],
    ['missing severity count', report => { delete report.metadata.vulnerabilities.low }],
    ['wrong severity count', report => { report.metadata.vulnerabilities.high = 0 }],
    ['noninteger count', report => { report.metadata.vulnerabilities.low = 0.5 }],
    ['wrong total', report => { report.metadata.vulnerabilities.total = 2 }],
    ['string total', report => { report.metadata.vulnerabilities.total = '1' }]
  ]
  for (const [label, mutate] of mutations) {
    const report = activeReport()
    mutate(report)
    assert.throws(() => parseAuditResult(auditResult(report, 1)), Error, label)
  }
  for (const report of [null, [], 'invalid']) {
    assert.throws(() => parseAuditResult(auditResult(report)), /invalid v2 report/)
  }
})

test('audit counts dependency nodes but returns only unique direct high and critical advisories', () => {
  const criticalUrl = 'https://github.com/advisories/GHSA-fixture-critical'
  const report = reportFor({
    tool: vulnerability('tool', [sourceAdvisory(), sourceAdvisory()]),
    parent: vulnerability('parent', ['tool']),
    critical: vulnerability('critical', [sourceAdvisory('critical', 'critical', criticalUrl)], 'critical'),
    low: vulnerability('low', [sourceAdvisory('low', 'low', 'https://github.com/advisories/GHSA-fixture-low')], 'low')
  })
  const advisories = parseAuditResult(auditResult(report, 1))
  assert.equal(report.metadata.vulnerabilities.total, 4)
  assert.deepEqual([...advisories.keys()], [advisoryUrl, criticalUrl])
  assert.equal(advisories.get(advisoryUrl).pkg, 'tool')
  assert.equal(advisories.get(criticalUrl).severity, 'critical')
  assert.ok(![...advisories.values()].some(item => item.pkg === 'parent'))
})

test('audit follows cyclic dependency graphs only when they reach a real source advisory', () => {
  const cycle = {
    first: vulnerability('first', ['second']),
    second: vulnerability('second', ['first'])
  }
  assert.throws(() => parseAuditResult(auditResult(reportFor(cycle), 1)), /missing source advisory/)
  const connected = structuredClone(cycle)
  connected.second.via.push('tool')
  connected.tool = vulnerability('tool', [sourceAdvisory()])
  assert.deepEqual([...parseAuditResult(auditResult(reportFor(connected), 1)).keys()], [advisoryUrl])
  assert.throws(() => parseAuditResult(auditResult(reportFor({ parent: vulnerability('parent', ['absent']) }), 1)), /missing advisory dependency/)
})

test('audit rejects malformed vulnerability entries and conflicting advisory packages', () => {
  const invalidEntries = [
    null,
    { ...vulnerability('tool', [sourceAdvisory()]), name: 'other' },
    vulnerability('tool', []),
    vulnerability('tool', [sourceAdvisory()], 'unknown'),
    vulnerability('tool', [null]),
    vulnerability('tool', [sourceAdvisory('other')]),
    vulnerability('tool', [{ ...sourceAdvisory(), url: 'http://example.invalid/advisory' }])
  ]
  for (const field of ['name', 'severity', 'url', 'title', 'range']) {
    const source = sourceAdvisory()
    delete source[field]
    invalidEntries.push(vulnerability('tool', [source]))
  }
  for (const entry of invalidEntries) {
    const report = activeReport()
    report.vulnerabilities.tool = entry
    assert.throws(() => parseAuditResult(auditResult(report, 1)), Error, JSON.stringify(entry))
  }
  const conflicting = reportFor({
    tool: vulnerability('tool', [sourceAdvisory()]),
    other: vulnerability('other', [sourceAdvisory('other')])
  })
  assert.throws(() => parseAuditResult(auditResult(conflicting, 1)), /conflicting package/)
})

test('exceptions require every review field, HTTPS advisories and a valid document', () => {
  for (const document of [null, [], {}, { exceptions: {} }]) {
    assert.throws(() => validateExceptions(document, today), /invalid audit exceptions document/)
  }
  for (const field of ['package', 'advisory', 'path', 'reason', 'reviewed', 'expires']) {
    for (const value of [undefined, '', '   ']) {
      assert.throws(() => validatedExceptions([exception({ [field]: value })]), /missing required fields/, field)
    }
  }
  assert.throws(() => validatedExceptions([exception({ advisory: 'http://example.invalid/advisory' })]), /HTTPS/)
  assert.deepEqual([...validatedExceptions([])], [])
})

test('exceptions reject invalid calendar dates, future review dates and reversed windows', () => {
  for (const overrides of [
    { reviewed: '2026-02-29' },
    { reviewed: '2026-2-01' },
    { expires: '2026-11-31' },
    { expires: '2026-13-01' }
  ]) assert.throws(() => validatedExceptions([exception(overrides)]), /invalid .* date/)
  assert.throws(() => validateExceptions({ exceptions: [] }, '2026-02-30'), /invalid current date/)
  assert.throws(() => validatedExceptions([exception({ reviewed: '2026-10-14' })]), /review window/)
  assert.throws(() => validatedExceptions([exception({ expires: '2026-09-30' })]), /review window/)
  assert.equal(validateExceptions({ exceptions: [exception({ reviewed: '2024-02-29', expires: '2024-05-29' })] }, '2024-03-01').size, 1)
})

test('exceptions allow ninety days and the expiry day but reject ninety-one days and expired entries', () => {
  assert.equal(validatedExceptions().size, 1, '2026-10-01 through 2026-12-30 is ninety days')
  assert.throws(() => validatedExceptions([exception({ expires: '2026-12-31' })]), /at most 90 days/)
  assert.equal(validatedExceptions([exception({ expires: today })]).size, 1)
  assert.throws(() => validatedExceptions([exception({ expires: '2026-10-12' })]), /expired/)
  assert.throws(() => validatedExceptions([exception(), exception()]), /duplicate exception/)
})

const scratchRoot = fileURLToPath(new URL('../../logs/step10-20261013/', import.meta.url))
function withInventory(action) {
  fs.mkdirSync(scratchRoot, { recursive: true })
  const directory = fs.mkdtempSync(path.join(scratchRoot, 'audit-runtime-test-'))
  try { return action(directory) } finally { fs.rmSync(directory, { recursive: true, force: true }) }
}
function packageAt(directory, name) {
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name, version: '1.0.0' }))
}

test('external inventory finds scoped, nested and symlinked packages without looping', () => withInventory(directory => {
  const modules = path.join(directory, 'node_modules')
  packageAt(path.join(modules, 'plain'), 'plain')
  packageAt(path.join(modules, '@scope', 'outer'), '@scope/outer')
  packageAt(path.join(modules, '@scope', 'outer', 'node_modules', '@nested', 'tool'), '@nested/tool')
  const linked = path.join(directory, 'store', 'linked')
  packageAt(linked, 'linked')
  fs.symlinkSync(linked, path.join(modules, 'linked'), 'dir')
  fs.symlinkSync(modules, path.join(linked, 'node_modules'), 'dir')
  fs.mkdirSync(path.join(modules, '.bin'))
  fs.writeFileSync(path.join(modules, 'README'), 'fixture non-package file')
  assert.deepEqual([...collectExternalPackages(modules)].sort(), ['@nested/tool', '@scope/outer', 'linked', 'plain'])
}))

test('external inventory fails closed on missing, empty, broken or invalid package manifests', () => {
  const cases = [
    ['missing directory', () => {}],
    ['empty directory', modules => fs.mkdirSync(modules)],
    ['missing manifest', modules => fs.mkdirSync(path.join(modules, 'bad'), { recursive: true })],
    ['empty manifest', modules => {
      fs.mkdirSync(path.join(modules, 'bad'), { recursive: true })
      fs.writeFileSync(path.join(modules, 'bad', 'package.json'), '')
    }],
    ['truncated manifest', modules => {
      fs.mkdirSync(path.join(modules, 'bad'), { recursive: true })
      fs.writeFileSync(path.join(modules, 'bad', 'package.json'), '{"name":')
    }],
    ['missing package name', modules => packageAt(path.join(modules, 'bad'), undefined)],
    ['blank package name', modules => packageAt(path.join(modules, 'bad'), ' ')],
    ['broken symlink', modules => {
      fs.mkdirSync(modules)
      fs.symlinkSync(path.join(modules, 'absent'), path.join(modules, 'broken'), 'dir')
    }]
  ]
  for (const [label, create] of cases) withInventory(directory => {
    const modules = path.join(directory, 'node_modules')
    create(modules)
    assert.throws(() => collectExternalPackages(modules), Error, label)
  })
})

test('reviewed advisories still block vulnerable external packages and require matching exceptions', () => {
  const advisories = parseAuditResult(auditResult(activeReport(), 1))
  assert.deepEqual(evaluateAdvisories(advisories, validatedExceptions(), new Set(['safe'])), { errors: [], stale: [] })
  const shipped = evaluateAdvisories(advisories, validatedExceptions(), new Set(['tool']))
  assert.equal(shipped.errors.length, 1)
  assert.match(shipped.errors[0], /shipped as an external package/)
  const missing = evaluateAdvisories(advisories, validatedExceptions([]), new Set(['safe']))
  assert.equal(missing.errors.length, 1)
  assert.match(missing.errors[0], /not reviewed/)
  const wrongPackage = evaluateAdvisories(advisories, validatedExceptions([exception({ package: 'different-tool' })]), new Set(['safe']))
  assert.equal(wrongPackage.errors.length, 1)
  assert.match(wrongPackage.errors[0], /package mismatch/)
  const staleEntry = exception({ advisory: 'https://github.com/advisories/GHSA-fixture-old', package: 'old-tool' })
  assert.deepEqual(evaluateAdvisories(advisories, validatedExceptions([exception(), staleEntry]), new Set(['safe'])).stale, [staleEntry])
})
