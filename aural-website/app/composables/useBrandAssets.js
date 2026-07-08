import { siteConfig } from '~/config/site.config'

const DEFAULT_BRAND_IMAGE_BASE = '/uploads/real-assets'

export const useBrandAsset = () => {
  const config = useRuntimeConfig()
  const mediaUrl = useMediaUrl()
  const base = String(config.public.brandImageBase || DEFAULT_BRAND_IMAGE_BASE).replace(/\/$/, '')

  return (filename, fallback = '') => {
    if (!filename) return fallback
    if (/^https?:\/\//i.test(filename) || filename.startsWith('/uploads/')) return mediaUrl(filename, fallback)
    return mediaUrl(`${base}/${filename}`, fallback)
  }
}

export const useBrandAssets = () => {
  const asset = useBrandAsset()
  const assets = siteConfig.brandAssets

  return {
    heroPiano: asset(assets.heroPiano),
    productPiano: asset(assets.productPiano),
    productPianoDetail: asset('product-c3-piano-detail.jpg'),
    productGuitar: asset('product-t6-electric-guitar-main.jpg'),
    productKeyboard: asset('product-dx88-stage-keyboard-main.jpg'),
    audioHero: asset('audio-hero-recording-studio.jpg'),
    audioConsole: asset('audio-solution-console.jpg'),
    audioLive: asset('audio-solution-live-stage.jpg'),
    artistHero: asset('artists-hero-performance.jpg'),
    artistPiano: asset('artist-lin-zhiyuan-piano.jpg'),
    artistGuitar: asset('artist-chen-yichuan-guitar.jpg'),
    artistKeyboard: asset('artist-zhou-nianan-keyboard.jpg'),
    supportHero: asset('support-hero-service-desk.jpg'),
    brandCraft: asset('home-core-acoustic-craft.jpg'),
    brandShowroom: asset('home-core-showroom-background.jpg'),
    brandStage: asset('home-quote-performance-stage.jpg')
  }
}
