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

export const useCompleteApiList = (url, options = {}) => {
  const key = computed(() => `${options.key || 'catalog'}:${unref(url)}`)
  return useAsyncData(
    key,
    (_app, { signal } = {}) => fetchCompleteList(unref(url), $fetch, { signal }),
    { default: () => ({ data: [] }), ...options, key: undefined }
  )
}
