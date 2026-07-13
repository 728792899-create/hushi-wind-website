// https://nuxt.com/docs/api/configuration/nuxt-config
// Nuxt runs `prepare` during npm postinstall with production semantics. Allow that
// install-time type generation to use local fallbacks; an actual production build
// still requires explicit public URLs and keeps the deployment fuse intact.
const isInstallPrepare = process.env.npm_lifecycle_event === 'postinstall'
const isProductionBuild = process.env.NODE_ENV === 'production' && !isInstallPrepare
const sentryEnabled = Boolean(process.env.NUXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN)
const sentryUploadEnabled = sentryEnabled && Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
)

const requiredPublicUrl = (name: string, devFallback: string) => {
  const value = process.env[name]
  if (value) return value
  if (isProductionBuild) {
    throw new Error(`[production config] ${name} is required. Set it to the official deployment URL before building.`)
  }
  return devFallback
}

const publicApiBase = requiredPublicUrl('NUXT_PUBLIC_API_BASE', 'http://127.0.0.1:1337')
const internalApiBase = process.env.NUXT_API_INTERNAL_BASE || process.env.API_INTERNAL_BASE || publicApiBase
const publicSiteUrl = requiredPublicUrl('NUXT_PUBLIC_SITE_URL', 'http://127.0.0.1:3000')
const publicBrandImageBase = process.env.NUXT_PUBLIC_BRAND_IMAGE_BASE || '/uploads/real-assets'

const originFromUrl = (value?: string) => {
  try {
    if (!value || value.startsWith('/')) return ''
    return new URL(value).origin
  } catch {
    return ''
  }
}

const assetOrigins = Array.from(new Set([
  originFromUrl(publicApiBase),
  originFromUrl(process.env.NUXT_PUBLIC_UPLOAD_BASE),
  originFromUrl(process.env.NUXT_PUBLIC_CDN_URL)
].filter(Boolean)))

const assetSourceList = ["'self'", 'data:', 'blob:', 'https:', ...assetOrigins].join(' ')
const connectSourceList = ["'self'", 'https:', ...assetOrigins].join(' ')

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: process.env.NODE_ENV !== 'production' && process.env.NUXT_DEVTOOLS !== 'false' },
  modules: [
    '@nuxtjs/tailwindcss',
    ...(sentryEnabled ? ['@sentry/nuxt/module'] : [])
  ],
  css: ['~/assets/css/design-tokens.css'],
  vite: {
    optimizeDeps: {
      include: ['gsap', 'gsap/ScrollTrigger']
    }
  },
  nitro: {
    routeRules: {
      '/_nuxt/**': {
        headers: {
          'Cache-Control': 'public, max-age=31536000, immutable'
        }
      },
      '/uploads/**': {
        headers: {
          'Cache-Control': 'public, max-age=2592000, stale-while-revalidate=86400'
        }
      },
      '/favicon.ico': {
        headers: {
          'Cache-Control': 'public, max-age=604800'
        }
      },
      '/**': {
        headers: {
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
          'Content-Security-Policy': `default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src ${assetSourceList}; media-src ${assetSourceList}; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src ${connectSourceList}`
        }
      }
    }
  },
  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      title: '胡氏管乐 | HUSHI WIND',
      titleTemplate: '%s',
      meta: [
        { name: 'description', content: '胡氏管乐提供原声钢琴、吉他、合成器与专业音响系统，覆盖演奏、录音、教学与现场扩声场景。' },
        { name: 'theme-color', content: '#050505' },
        { property: 'og:type', content: 'website' },
        { property: 'og:site_name', content: '胡氏管乐 HUSHI WIND' },
        { name: 'twitter:card', content: 'summary_large_image' }
      ]
    }
  },
  runtimeConfig: {
    apiInternalBase: internalApiBase,
    public: {
      apiBase: publicApiBase,
      siteUrl: publicSiteUrl,
      brandImageBase: publicBrandImageBase,
      mixpanelEnabled: process.env.NUXT_PUBLIC_MIXPANEL_ENABLED === 'true'
    }
  },
  sourcemap: sentryUploadEnabled ? { client: 'hidden', server: true } : false,
  sentry: sentryEnabled
    ? {
        enabled: true,
        telemetry: false,
        authToken: sentryUploadEnabled ? process.env.SENTRY_AUTH_TOKEN : undefined,
        org: sentryUploadEnabled ? process.env.SENTRY_ORG : undefined,
        project: sentryUploadEnabled ? process.env.SENTRY_PROJECT : undefined,
        sourcemaps: { disable: !sentryUploadEnabled }
      }
    : { enabled: false }
})
