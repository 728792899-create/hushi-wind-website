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
  return computed(() => {
    const normalizedPath = String(path).startsWith('/') ? path : `/${path}`
    return `${apiBase.value}${normalizedPath}`
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
