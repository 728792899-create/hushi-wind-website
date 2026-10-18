import axios from 'axios'
import { ref } from 'vue'
const sessionRevision = ref(0)
import { sessionExpired } from './navigation.js'
import { tokenClaims } from './sessionIdle.js'
import { createQueryCache, isQueryCancelled, queryCancelled } from './queryCache.js'

export const BASE = (
  import.meta.env.VITE_API_BASE ||
  (import.meta.env.DEV ? 'http://127.0.0.1:1337' : '')
).replace(/\/$/, '')
export const SITE = (
  import.meta.env.VITE_SITE_URL ||
  (import.meta.env.DEV ? 'http://127.0.0.1:3000' : '')
).replace(/\/$/, '')
export const SENSITIVE_CONFIRMATION_TEXT =
  import.meta.env.VITE_SENSITIVE_CONFIRMATION_TEXT || '确认执行'
export const AUTH_KEY = 'aural-admin-auth-token'
export const USER_KEY = 'aural-admin-user'
const QUERY_REVISION_KEY = 'aural-admin-query-revision'

export const storageGet = (key, fallback = '') => {
  try {
    return window.localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

export const storageSet = (key, value) => {
  try {
    window.localStorage.setItem(key, value)
  } catch {}
}

export const storageRemove = (key) => {
  try {
    window.localStorage.removeItem(key)
  } catch {}
}

export const getToken = () => storageGet(AUTH_KEY)
export const setToken = (token) => {
  const previous = queryScope()
  storageSet(AUTH_KEY, token)
  if (previous !== queryScope()) listQueries.clear()
}
export const setCurrentUser = (user) => {
  const previous = queryScope()
  storageSet(USER_KEY, JSON.stringify(user || null))
  sessionRevision.value++
  if (previous !== queryScope()) listQueries.clear()
}
export const getCurrentUser = () => {
  sessionRevision.value
  try {
    return JSON.parse(storageGet(USER_KEY, 'null'))
  } catch {
    return null
  }
}
export const clearToken = () => {
  listQueries.clear()
  storageRemove(AUTH_KEY)
  storageRemove(USER_KEY)
  sessionRevision.value++
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
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const openPreview = (path = '/') => {
  const normalizedPath = String(path || '/').startsWith('/') ? path : `/${path}`
  window.open(`${SITE}${normalizedPath}`, '_blank', 'noopener,noreferrer')
}

export const extractErrorMessage = (
  error,
  fallback = '操作失败，请检查表单内容',
) => {
  const code = error?.response?.data?.error?.code
  if (code === 'TOKEN_EXPIRED') return '登录已过期，请重新登录后台'
  if (code === 'TOKEN_REVOKED') return '账号会话已被重置，请重新登录后台'
  if (code === 'ACCOUNT_LOCKED') return '账号已被临时锁定，请稍后再试'
  return (
    error?.response?.data?.error?.message ||
    error?.response?.data?.message ||
    error?.message ||
    fallback
  )
}

// 保存时记录已被他人修改（服务端 409 RECORD_CHANGED）：页面应刷新数据源，但保留表单输入
export const isRecordConflict = (error) =>
  error?.response?.status === 409 &&
  error?.response?.data?.error?.code === 'RECORD_CHANGED'

export const api = axios.create({
  baseURL: BASE,
  timeout: 20000,
})

function queryScope() {
  const token = getToken(), user = getCurrentUser(), claims = tokenClaims(token)
  if (!token || !user || (claims?.exp && claims.exp <= Date.now())) return ''
  // Refresh changes iat/exp but keeps the same login owner and token version.
  // A fresh login, permission change or session revocation gets a different scope.
  return JSON.stringify([user.id, user.role, user.status, [...(user.permissions || [])].sort(),
    claims ? [claims.uid, claims.tv, claims.auth] : token])
}
const listQueries = createQueryCache({
  getScope: queryScope,
  read: async (url, params, signal) => (await api.get(url, { params, signal })).data,
})
export { isQueryCancelled }
export const invalidateListQueries = () => {
  listQueries.invalidate()
  storageSet(QUERY_REVISION_KEY, `${Date.now()}:${Math.random()}`)
}
const cacheableLists = new Set(['/api/admin/resources', '/api/products', '/api/catalog'])
export const readList = async (url, { params = {}, signal, force = false } = {}) => {
  if (!cacheableLists.has(url)) throw new Error('该接口不支持列表缓存')
  const scope = queryScope()
  for (let attempt = 0; ; attempt++) {
    try { return { data: await listQueries.get(url, params, { signal, force }) } }
    catch (error) {
      if (error?.code !== 'ERR_QUERY_INVALIDATED') throw error
      if (signal?.aborted || !scope || scope !== queryScope()) throw queryCancelled()
      // A concurrent edit must not turn an active first load into a silent empty
      // page. Retry only data invalidation, never permission/auth/network errors.
      if (attempt >= 2) throw new Error('列表正在频繁更新，请稍后重新加载')
    }
  }
}
if (typeof window !== 'undefined') window.addEventListener?.('storage', event => {
  if (event.key === QUERY_REVISION_KEY) listQueries.invalidate()
  else if ([AUTH_KEY, USER_KEY, null].includes(event.key)) listQueries.refreshScope()
})

api.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => {
    const { method = 'get', url = '' } = response.config || {}
    if (!['get', 'head', 'options'].includes(method.toLowerCase()) && url !== '/api/auth/refresh')
      invalidateListQueries()
    return response
  },
  (error) => {
    const status = error?.response?.status
    const url = error?.config?.url || ''
    if (status === 403) listQueries.clear({ exceptSignal: error?.config?.signal })
    else if (error?.response?.data?.error?.code === 'RECORD_CHANGED') invalidateListQueries()
    if (sessionExpired(status, url)) {
      clearToken()
      window.dispatchEvent(
        new CustomEvent('admin-auth-expired', {
          detail: error?.response?.data?.error || null,
        }),
      )
    }
    return Promise.reject(error)
  },
)

export const login = async (username, password, totpCode = '') => {
  const res = await api.post('/api/auth/login', {
    username,
    password,
    totpCode,
  })
  if (!res.data?.token) throw new Error('登录失败')
  setToken(res.data.token)
  setCurrentUser(res.data.user)
  return res.data
}

export const validateSession = async () => {
  const res = await api.get('/api/auth/session')
  if (res.data?.user) setCurrentUser(res.data.user)
  return res
}

export const refreshSession = async () => {
  const res = await api.post('/api/auth/refresh')
  if (res.data?.token) setToken(res.data.token)
  if (res.data?.user) setCurrentUser(res.data.user)
  return res
}

export const recordExport = (payload) =>
  api.post('/api/admin/export-records', payload)
export const sensitiveConfirmation = () => ({
  confirmation: SENSITIVE_CONFIRMATION_TEXT,
})
export const sensitiveHeaders = () => ({
  'X-Sensitive-Confirmation': encodeURIComponent(SENSITIVE_CONFIRMATION_TEXT),
})

export const listData = (res) => res?.data?.data || []
export const paginationMeta = (res) =>
  res?.data?.meta?.pagination || {
    page: 1,
    pageSize: 20,
    total: listData(res).length,
    pageCount: 1,
  }
