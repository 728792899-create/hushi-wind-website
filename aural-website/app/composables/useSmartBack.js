export const useSmartBack = (fallback = '/') => {
  const router = useRouter()
  const fallbackPath = fallback || '/'

  return () => {
    if (!process.client) return router.push(fallbackPath)

    const stateBack = window.history.state?.back
    let sameSiteReferrer = false

    try {
      sameSiteReferrer = Boolean(document.referrer && new URL(document.referrer).origin === window.location.origin)
    } catch {
      sameSiteReferrer = false
    }

    if (stateBack || sameSiteReferrer) return router.back()
    return router.push(fallbackPath)
  }
}
