export const useImageFallback = (fallback = '') => {
  const fallbackUrl = fallback || useBrandAssets().productPiano

  return (event) => {
    const image = event?.target
    if (!image || image.dataset.fallbackApplied === 'true') return
    image.dataset.fallbackApplied = 'true'
    image.src = fallbackUrl
  }
}
