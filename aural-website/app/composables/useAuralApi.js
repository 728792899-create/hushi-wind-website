import { fetchCompleteList } from '../utils/fetchCompleteList'
export const useApiBase = () => {
  const config = useRuntimeConfig()
  return computed(() => {
    const serverBase = process.server ? config.apiInternalBase : ''
    return String(serverBase || config.public.apiBase || '').replace(/\/$/, '')
  })
}

export const usePublicApiBase = () => {
  const config = useRuntimeConfig()
  return computed(() => String(config.public.apiBase || '').replace(/\/$/, ''))
}

export const useApiUrl = (path = '') => {
  const isStarter = useRuntimeConfig().public.siteMode === 'starter'
  const apiBase = useApiBase()
  const route = useRoute()
  return computed(() => {
    const resolved = typeof path === 'function' ? path() : unref(path)
    const normalizedPath = String(resolved).startsWith('/') ? resolved : `/${resolved}`
    const preview =
      !isStarter &&
      typeof route.query.previewToken === 'string' &&
      !/\/(events|inquiries|artist-applications)(\?|$)/.test(normalizedPath)
        ? route.query.previewToken
        : ''
    return `${apiBase.value}${normalizedPath}${preview ? `${normalizedPath.includes('?') ? '&' : '?'}previewToken=${encodeURIComponent(preview)}` : ''}`
  })
}

export const useMediaUrl = () => {
  const isStarter = useRuntimeConfig().public.siteMode === 'starter'
  const apiBase = usePublicApiBase()
  return (path, fallback = '') => {
    // Reject characters browsers can reinterpret before resolving a media URL.
    if (typeof path !== 'string' || /[\u0000-\u001f\u007f-\u009f\\]/.test(path)) return fallback
    const value = path.trim()
    if (!value || value.startsWith('//')) return fallback
    if (isStarter && /^\/launch-assets\/[a-z-]+\.(?:svg|jpg)$/.test(value)) return value
    if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
      if (!/^https?:\/\/[^/?#]/i.test(value)) return fallback
      try {
        if (!new URL(value).hostname) return fallback
        return value
      } catch {
        return fallback
      }
    }
    const normalizedPath = value.startsWith('/') ? value : `/${value}`
    return `${apiBase.value}${normalizedPath}`
  }
}

export const useApiRequestKey = (url, namespace = 'api') => {
  const config = useRuntimeConfig()
  return computed(() => {
    const value = String(typeof url === 'function' ? url() : unref(url))
    const bases = [config.apiInternalBase, config.public.apiBase]
      .filter(Boolean).map(base => String(base).replace(/\/$/, '')).sort((a, b) => b.length - a.length)
    const base = bases.find(candidate => value.startsWith(`${candidate}/`) || value === candidate || value.startsWith(`${candidate}?`))
    // The transport origin differs on SSR, but content identity does not.
    // Keep every query parameter, including preview credentials, in the key.
    const identity = base ? value.slice(base.length) || '/' : value
    return `${typeof namespace === 'function' ? namespace() : unref(namespace)}:${identity}`
  })
}

export const useAuralFetch = (url, options = {}) => useFetch(url, {
  timeout: 15000,
  retry: 0,
  ...options,
  key: useApiRequestKey(url, options.key || 'api')
})

export const useCompleteApiList = (url, options = {}) => {
  const key = useApiRequestKey(url, options.key || 'catalog')
  return useAsyncData(
    key,
    (_app, { signal } = {}) => fetchCompleteList(unref(url), $fetch, { signal }),
    { default: () => ({ data: [] }), timeout: 15000, ...options, key: undefined }
  )
}
