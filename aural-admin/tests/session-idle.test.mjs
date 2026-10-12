import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACTIVITY_KEY,
  REFRESH_MIN_INTERVAL_MS,
  WARN_BEFORE_MS,
  lastActivityAt,
  sessionAction,
  tokenClaims,
  trackActivity,
} from '../src/lib/sessionIdle.js'

const MIN = 60_000
const token = (claims) => `${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`

test('token claims decode base64url payloads including non-ASCII usernames', () => {
  assert.deepEqual(tokenClaims(token({ sub: '运营', exp: 5, iat: 1 })), { sub: '运营', exp: 5, iat: 1 })
  assert.equal(tokenClaims(''), null)
  assert.equal(tokenClaims('not-base64!.x'), null)
})

test('refresh only after user activity since the token was issued', () => {
  const iat = 0, exp = 30 * MIN, absoluteEnd = 12 * 60 * MIN
  const now = 10 * MIN
  assert.equal(sessionAction({ now, exp, iat, lastActivity: 9 * MIN, absoluteEnd }), 'refresh')
  assert.equal(sessionAction({ now, exp, iat, lastActivity: 0, absoluteEnd }), 'wait')
  assert.equal(sessionAction({ now: REFRESH_MIN_INTERVAL_MS - 1, exp, iat, lastActivity: 1000, absoluteEnd }), 'wait', 'refresh is rate limited')
  const shortExp = 2 * MIN + 20_000
  assert.equal(sessionAction({ now: 30_000, exp: shortExp, iat, lastActivity: 25_000, absoluteEnd }), 'refresh', 'an active user inside the warning window is renewed, not warned, even with a short idle timeout')
})

test('idle sessions warn before expiry and then end as idle', () => {
  const iat = 0, exp = 30 * MIN, absoluteEnd = 12 * 60 * MIN
  assert.equal(sessionAction({ now: exp - WARN_BEFORE_MS - 1, exp, iat, lastActivity: 0, absoluteEnd }), 'wait')
  assert.equal(sessionAction({ now: exp - WARN_BEFORE_MS, exp, iat, lastActivity: 0, absoluteEnd }), 'warn-idle')
  assert.equal(sessionAction({ now: exp, exp, iat, lastActivity: 0, absoluteEnd }), 'idle-end')
})

test('a token capped by the absolute limit is not refreshed and ends as session end', () => {
  const iat = 0, exp = 20 * MIN, absoluteEnd = 20 * MIN
  assert.equal(sessionAction({ now: 10 * MIN, exp, iat, lastActivity: 9 * MIN, absoluteEnd }), 'wait')
  assert.equal(sessionAction({ now: exp - MIN, exp, iat, lastActivity: exp - MIN, absoluteEnd }), 'warn-end')
  assert.equal(sessionAction({ now: exp, exp, iat, lastActivity: exp, absoluteEnd }), 'end')
  assert.equal(sessionAction({ now: 1, exp: undefined, iat: 0, lastActivity: 0 }), 'end', 'missing token (e.g. signed out in another tab) ends the session')
})

test('activity tracking writes a shared, throttled timestamp and detaches cleanly', () => {
  const items = new Map(), listeners = new Map()
  const target = {
    localStorage: { getItem: (k) => items.get(k), setItem: (k, v) => items.set(k, v) },
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
  }
  const stop = trackActivity(target)
  assert.deepEqual([...listeners.keys()].sort(), ['keydown', 'pointerdown', 'scroll', 'touchstart', 'wheel'])
  listeners.get('keydown')()
  const first = Number(items.get(ACTIVITY_KEY))
  assert.ok(first > 0)
  listeners.get('pointerdown')()
  assert.equal(Number(items.get(ACTIVITY_KEY)), first, 'bursts within the throttle window write once')
  assert.equal(lastActivityAt(target.localStorage), first)
  stop()
  assert.equal(listeners.size, 0)
})
