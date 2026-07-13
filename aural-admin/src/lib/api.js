import axios from 'axios'

export const BASE = (import.meta.env.VITE_API_BASE || (import.meta.env.DEV ? 'http://127.0.0.1:1337' : '')).replace(/\/$/, '')
export const SITE = (import.meta.env.VITE_SITE_URL || (import.meta.env.DEV ? 'http://127.0.0.1:3000' : '')).replace(/\/$/, '')
export const SENSITIVE_CONFIRMATION_TEXT = import.meta.env.VITE_SENSITIVE_CONFIRMATION_TEXT || '确认执行'
export const AUTH_KEY = 'aural-admin-auth-token'
export const USER_KEY = 'aural-admin-user'
export const CSRF_KEY = 'aural-admin-csrf-token'

try {
  window.localStorage.removeItem(AUTH_KEY)
  window.localStorage.removeItem(USER_KEY)
  window.localStorage.removeItem(CSRF_KEY)
} catch {}

export const storageGet = (key, fallback = '') => {
  try { return window.sessionStorage.getItem(key) || fallback } catch { return fallback }
}

export const storageSet = (key, value) => {
  try { window.sessionStorage.setItem(key, value) } catch {}
}

export const storageRemove = (key) => {
  try {
    window.sessionStorage.removeItem(key)
    window.localStorage.removeItem(key)
  } catch {}
}

export const getToken = () => storageGet(AUTH_KEY)
export const setToken = (token) => storageSet(AUTH_KEY, token)
export const getCsrfToken = () => storageGet(CSRF_KEY)
export const setCsrfToken = (token) => storageSet(CSRF_KEY, token)
export const setCurrentUser = (user) => storageSet(USER_KEY, JSON.stringify(user || null))
export const getCurrentUser = () => {
  try { return JSON.parse(storageGet(USER_KEY, 'null')) } catch { return null }
}
export const clearToken = () => {
  storageRemove(AUTH_KEY)
  storageRemove(USER_KEY)
  storageRemove(CSRF_KEY)
}
export const hasToken = () => Boolean(getToken())
export const hasPermission = (permission) => {
  const permissions = getCurrentUser()?.permissions || []
  return permissions.includes('*') || permissions.includes(permission)
}

export const mediaSrc = (path, fallback = '') => {
  if (!path) return fallback
  if (/^https?:\/\//i.test(path)) return path
  const normalizedPath = String(path).startsWith('/') ? path : `/${path}`
  return `${BASE}${normalizedPath}`
}

export const adminUploadHeaders = () => {
  const token = getToken()
  const csrfToken = getCsrfToken()
  return token ? { Authorization: `Bearer ${token}`, 'X-CSRF-Token': csrfToken, 'X-Requested-With': 'hushi-admin' } : {}
}

export const openPreview = (path = '/') => {
  const normalizedPath = String(path || '/').startsWith('/') ? path : `/${path}`
  window.open(`${SITE}${normalizedPath}`, '_blank', 'noopener,noreferrer')
}

export const extractErrorMessage = (error, fallback = '操作失败，请检查表单内容') => {
  const code = error?.response?.data?.error?.code
  if (code === 'TOKEN_EXPIRED') return '登录已过期，请重新登录后台'
  if (code === 'TOKEN_REVOKED') return '账号会话已被重置，请重新登录后台'
  if (code === 'ACCOUNT_LOCKED') return '账号已被临时锁定，请稍后再试'
  return error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || fallback
}

export const api = axios.create({
  baseURL: BASE,
  timeout: 20000
})

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  config.headers['X-Requested-With'] = 'hushi-admin'
  if (token && !['get', 'head', 'options'].includes(String(config.method || 'get').toLowerCase())) {
    config.headers['X-CSRF-Token'] = getCsrfToken()
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status
    const url = error?.config?.url || ''
    if ((status === 401 || status === 403) && !url.includes('/api/auth/login')) {
      clearToken()
      window.dispatchEvent(new CustomEvent('admin-auth-expired', { detail: error?.response?.data?.error || null }))
    }
    return Promise.reject(error)
  }
)

export const login = async (username, password, totpCode = '') => {
  const res = await api.post('/api/auth/login', { username, password, totpCode })
  if (!res.data?.token) throw new Error('登录失败')
  setToken(res.data.token)
  setCsrfToken(res.data.csrfToken || '')
  setCurrentUser(res.data.user)
  return res.data
}

export const validateSession = async () => {
  const res = await api.get('/api/auth/session')
  if (res.data?.csrfToken) setCsrfToken(res.data.csrfToken)
  if (res.data?.user) setCurrentUser(res.data.user)
  return res
}

export const refreshSession = async () => {
  const res = await api.post('/api/auth/refresh')
  if (res.data?.token) setToken(res.data.token)
  if (res.data?.csrfToken) setCsrfToken(res.data.csrfToken)
  if (res.data?.user) setCurrentUser(res.data.user)
  return res
}

export const recordExport = (payload) => api.post('/api/admin/export-records', payload)
export const sensitiveConfirmation = () => ({ confirmation: SENSITIVE_CONFIRMATION_TEXT })
export const sensitiveHeaders = () => ({ 'X-Sensitive-Confirmation': encodeURIComponent(SENSITIVE_CONFIRMATION_TEXT) })

export const listData = (res) => res?.data?.data || []
export const paginationMeta = (res) => res?.data?.meta?.pagination || { page: 1, pageSize: 20, total: listData(res).length, pageCount: 1 }
