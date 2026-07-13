import { beforeEach, describe, expect, it } from 'vitest'
import {
  AUTH_KEY, CSRF_KEY, USER_KEY, clearToken, extractErrorMessage, getCsrfToken,
  getCurrentUser, getToken, hasPermission, setCsrfToken, setCurrentUser, setToken
} from '../src/lib/api'

describe('admin session storage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('keeps credentials in tab-scoped session storage only', () => {
    setToken('signed-token')
    setCsrfToken('csrf-token')
    setCurrentUser({ username: 'operator', permissions: ['products:read'] })

    expect(getToken()).toBe('signed-token')
    expect(getCsrfToken()).toBe('csrf-token')
    expect(getCurrentUser().username).toBe('operator')
    expect(window.sessionStorage.getItem(AUTH_KEY)).toBe('signed-token')
    expect(window.sessionStorage.getItem(CSRF_KEY)).toBe('csrf-token')
    expect(window.localStorage.getItem(AUTH_KEY)).toBeNull()
    expect(window.localStorage.getItem(USER_KEY)).toBeNull()
  })

  it('evaluates permissions and clears all authentication state', () => {
    setToken('token')
    setCsrfToken('csrf')
    setCurrentUser({ permissions: ['products:read'] })
    expect(hasPermission('products:read')).toBe(true)
    expect(hasPermission('products:write')).toBe(false)
    clearToken()
    expect(getToken()).toBe('')
    expect(getCurrentUser()).toBeNull()
  })

  it('maps session security errors to actionable messages', () => {
    expect(extractErrorMessage({ response: { data: { error: { code: 'TOKEN_REVOKED' } } } })).toContain('会话已被重置')
    expect(extractErrorMessage({ response: { data: { error: { message: '服务器拒绝请求' } } } })).toBe('服务器拒绝请求')
  })
})
