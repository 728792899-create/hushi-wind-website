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
  const apiBase = useApiBase()
  const route = useRoute()
  return computed(() => {
    const resolved = typeof path === 'function' ? path() : unref(path)
    const normalizedPath = String(resolved).startsWith('/') ? resolved : `/${resolved}`
    const preview =
      typeof route.query.previewToken === 'string' &&
      !/\/(events|inquiries|artist-applications)(\?|$)/.test(normalizedPath)
        ? route.query.previewToken
        : ''
    return `${apiBase.value}${normalizedPath}${preview ? `${normalizedPath.includes('?') ? '&' : '?'}previewToken=${encodeURIComponent(preview)}` : ''}`
  })
}

export const useMediaUrl = () => {
  const apiBase = usePublicApiBase()
  return (path, fallback = '') => {
    if (!path) return fallback
    if (/^https?:\/\//i.test(path)) return path
    const normalizedPath = String(path).startsWith('/') ? path : `/${path}`
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
