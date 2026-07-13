import { describe, expect, it } from 'vitest'
import { chartPointsFor, formatBytes, formatCompactNumber, operationLabel, riskLabel } from '../src/lib/dashboardModel'
import { backupHealthFor, inDateRange, prettyJson, readinessActionLabel, readinessTagType } from '../src/lib/securityModel'

describe('dashboard view model', () => {
  it('maps chart values into a bounded SVG plot', () => {
    const points = chartPointsFor([10, 20, 15])
    expect(points).toHaveLength(3)
    expect(points.every((point) => point.x >= 10 && point.x <= 310)).toBe(true)
    expect(points.every((point) => point.y >= 18 && point.y <= 136)).toBe(true)
  })

  it('formats operational summaries consistently', () => {
    expect(formatCompactNumber(12500)).toBe('1.25万')
    expect(formatBytes(1024 * 1024)).toBe('1.00 MB')
    expect(riskLabel({ type: 'api_5xx' })).toBe('API')
    expect(operationLabel({ module: 'products', summary: '更新产品', target: 'DX-88' })).toBe('产品 / 更新产品 / DX-88')
  })
})

describe('security view model', () => {
  it('classifies backup freshness and readiness actions', () => {
    const now = new Date('2026-07-14T00:00:00Z').getTime()
    expect(backupHealthFor(null, now).tone).toBe('danger')
    expect(backupHealthFor({ status: 'success', createdAt: '2026-07-13T00:00:00Z' }, now).tone).toBe('success')
    expect(backupHealthFor({ status: 'success', createdAt: '2026-07-01T00:00:00Z' }, now).tone).toBe('warning')
    expect(readinessActionLabel({ key: 'two_factor' })).toContain('2FA')
    expect(readinessTagType({ ok: false, level: 'critical' })).toBe('danger')
  })

  it('filters date ranges and safely renders audit JSON', () => {
    expect(inDateRange('2026-07-14T10:00:00Z', ['2026-07-14', '2026-07-14'])).toBe(true)
    expect(inDateRange('2026-07-16T10:00:00Z', ['2026-07-14', '2026-07-14'])).toBe(false)
    expect(prettyJson('{"before":1}')).toContain('"before": 1')
    expect(prettyJson('plain text')).toBe('plain text')
  })
})
