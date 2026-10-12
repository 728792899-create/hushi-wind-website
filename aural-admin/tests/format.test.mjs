import test from 'node:test'
import assert from 'node:assert/strict'
import { formatMoney, formatTime } from '../src/lib/format.js'

test('money uses CNY with thousands separators and a dash for missing values', () => {
  assert.equal(formatMoney(12800), '¥12,800.00')
  assert.equal(formatMoney('128000.5'), '¥128,000.50')
  assert.equal(formatMoney(0), '¥0.00')
  for (const empty of [null, undefined, '', 'abc']) assert.equal(formatMoney(empty), '—')
})

test('time is YYYY-MM-DD HH:mm in local time regardless of browser language', () => {
  const local = new Date(2026, 8, 3, 7, 5, 59)
  assert.equal(formatTime(local), '2026-09-03 07:05')
  assert.equal(formatTime(local.toISOString()), '2026-09-03 07:05')
  for (const empty of [null, undefined, '', 'not-a-date']) assert.equal(formatTime(empty), '—')
})
