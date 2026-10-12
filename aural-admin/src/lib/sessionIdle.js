// 会话只在用户有操作时续期：服务端每次续期只顺延空闲时长（默认 30 分钟），
// 且不超过登录起算的绝对时长。最近操作时间与 token 一样存于 localStorage，多个标签页共享。
export const ACTIVITY_KEY = 'aural-admin-last-activity'
export const WARN_BEFORE_MS = 2 * 60_000
export const REFRESH_MIN_INTERVAL_MS = 60_000
const ACTIVITY_THROTTLE_MS = 5_000
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']

export const tokenClaims = (token) => {
  try {
    const payload = String(token || '').split('.')[0]
    if (!payload) return null
    const binary = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  }
}

// end/idle-end：已到期（绝对时长/无操作）；refresh：自签发后有操作，续期；
// warn-end/warn-idle：两分钟内到期，提示保存或确认继续；wait：无需处理。
export const sessionAction = ({ now, exp, iat, lastActivity, absoluteEnd = Infinity }) => {
  if (!exp) return 'end'
  const capped = exp >= absoluteEnd - 1000
  if (now >= exp) return capped ? 'end' : 'idle-end'
  const nearExpiry = exp - now <= WARN_BEFORE_MS
  const active = lastActivity > iat
  if (!capped && active && (nearExpiry || now - iat >= REFRESH_MIN_INTERVAL_MS)) return 'refresh'
  if (nearExpiry) return capped ? 'warn-end' : 'warn-idle'
  return 'wait'
}

export const lastActivityAt = (storage = window.localStorage) => {
  try {
    return Number(storage.getItem(ACTIVITY_KEY)) || 0
  } catch {
    return 0
  }
}

export const markActivity = (storage = window.localStorage, now = Date.now()) => {
  try {
    storage.setItem(ACTIVITY_KEY, String(now))
  } catch {}
}

export const trackActivity = (target = window) => {
  let last = 0
  const onActivity = () => {
    const now = Date.now()
    if (now - last < ACTIVITY_THROTTLE_MS) return
    last = now
    markActivity(target.localStorage, now)
  }
  ACTIVITY_EVENTS.forEach((type) =>
    target.addEventListener(type, onActivity, { capture: true, passive: true }),
  )
  return () =>
    ACTIVITY_EVENTS.forEach((type) =>
      target.removeEventListener(type, onActivity, { capture: true }),
    )
}
