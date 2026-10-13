import semver from 'semver'

const severities = ['info', 'low', 'moderate', 'high', 'critical']
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const hasText = (value) => typeof value === 'string' && value.trim().length > 0
const requireValue = (condition, message) => { if (!condition) throw new Error(message) }
const isHttpsUrl = (value) => {
  try { return new URL(value).protocol === 'https:' } catch { return false }
}

// npm exits 1 for vulnerabilities AND registry failures. Accept only a complete
// v2 report, never an error document or an interrupted/failed subprocess.
export function parseAuditResult(result) {
  requireValue(!result.error && !result.signal && [0, 1].includes(result.status), 'npm audit did not complete successfully')
  let report
  try { report = JSON.parse(result.stdout) } catch { throw new Error('npm audit returned invalid JSON') }
  requireValue(isObject(report) && !Object.hasOwn(report, 'error') && report.auditReportVersion === 2 && isObject(report.vulnerabilities), 'npm audit returned an invalid v2 report')
  const counts = report.metadata?.vulnerabilities
  requireValue(isObject(counts), 'npm audit is missing vulnerability counts')
  const actualCounts = Object.fromEntries(severities.map((key) => [key, 0]))
  const advisories = new Map()
  for (const [pkg, vuln] of Object.entries(report.vulnerabilities)) {
    requireValue(isObject(vuln) && vuln.name === pkg && severities.includes(vuln.severity) && Array.isArray(vuln.via) && vuln.via.length > 0, `invalid vulnerability entry: ${pkg}`)
    actualCounts[vuln.severity]++
    for (const via of vuln.via) {
      if (typeof via === 'string') {
        requireValue(Object.hasOwn(report.vulnerabilities, via), `missing advisory dependency: ${via}`)
        continue
      }
      requireValue(isObject(via) && via.name === pkg && hasText(via.title) && hasText(via.range) && semver.validRange(via.range) !== null && isHttpsUrl(via.url) && severities.includes(via.severity), `invalid advisory for ${pkg}`)
      if (!['high', 'critical'].includes(via.severity)) continue
      const existing = advisories.get(via.url)
      requireValue(!existing || (existing.pkg === pkg && existing.range === via.range && existing.severity === via.severity), `conflicting package, range or severity for advisory: ${via.url}`)
      advisories.set(via.url, { pkg, severity: via.severity, title: via.title, range: via.range })
    }
  }
  const reachesAdvisory = (pkg, visited = new Set()) => {
    if (visited.has(pkg)) return false
    visited.add(pkg)
    return report.vulnerabilities[pkg].via.some((via) => typeof via !== 'string' || reachesAdvisory(via, visited))
  }
  for (const pkg of Object.keys(report.vulnerabilities)) {
    requireValue(reachesAdvisory(pkg), `missing source advisory for ${pkg}`)
  }
  for (const severity of severities) {
    requireValue(Number.isSafeInteger(counts[severity]) && counts[severity] === actualCounts[severity], `npm audit ${severity} count does not match report`)
  }
  const total = Object.keys(report.vulnerabilities).length
  requireValue(counts.total === total && !(result.status === 1 && total === 0), 'npm audit total/exit status does not match report')
  return advisories
}

function dateValue(value, label) {
  requireValue(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), `invalid ${label} date`)
  const stamp = Date.parse(`${value}T00:00:00.000Z`)
  requireValue(Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value, `invalid ${label} date`)
  return stamp
}

export function validateExceptions(document, today = new Date().toISOString().slice(0, 10)) {
  requireValue(isObject(document) && Array.isArray(document.exceptions), 'invalid audit exceptions document')
  const currentDate = dateValue(today, 'current')
  const byUrl = new Map()
  for (const item of document.exceptions) {
    requireValue(isObject(item) && ['package', 'advisory', 'path', 'reason', 'reviewed', 'expires'].every((key) => hasText(item[key])), 'exception is missing required fields')
    requireValue(isHttpsUrl(item.advisory), 'exception advisory must be an HTTPS URL')
    requireValue(!byUrl.has(item.advisory), `duplicate exception: ${item.advisory}`)
    const reviewed = dateValue(item.reviewed, 'reviewed')
    const expires = dateValue(item.expires, 'expires')
    requireValue(reviewed <= currentDate && expires >= reviewed && expires - reviewed <= 90 * 86400000, `exception review window must be at most 90 days: ${item.advisory}`)
    requireValue(expires >= currentDate, `exception expired on ${item.expires}: ${item.advisory}`)
    byUrl.set(item.advisory, item)
  }
  return byUrl
}

export function evaluateAdvisories(advisories, exceptions, artifactPackages) {
  requireValue(Array.isArray(artifactPackages) && artifactPackages.every(pkg => isObject(pkg) && hasText(pkg.name) && typeof pkg.version === 'string' && semver.valid(pkg.version) === pkg.version && Array.isArray(pkg.targets) && pkg.targets.length > 0), 'invalid versioned artifact inventory')
  const errors = []
  for (const [url, advisory] of advisories) {
    const label = `${advisory.severity} ${advisory.pkg}@${advisory.range} ${url}`
    requireValue(hasText(advisory.range) && semver.validRange(advisory.range) !== null, `invalid advisory range: ${label}`)
    // Use the direct advisory range, not npm's aggregate/meta-vulnerability range.
    // Include prereleases, matching npm's advisory evaluation semantics.
    const affected = artifactPackages.filter(pkg => pkg.name === advisory.pkg && semver.satisfies(pkg.version, advisory.range, { includePrerelease: true }))
    if (affected.length) errors.push(`affected package in build/artifact inventory: ${label}; ${affected.map(pkg => `${pkg.name}@${pkg.version} [${pkg.targets.join(',')}]`).join('; ')}`)
    const exception = exceptions.get(url)
    if (!exception) errors.push(`not reviewed (add an exception or upgrade): ${label}`)
    else if (exception.package !== advisory.pkg) errors.push(`exception package mismatch: ${label}`)
  }
  return { errors, stale: [...exceptions.values()].filter((item) => !advisories.has(item.advisory)) }
}
