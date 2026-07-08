import { computed, unref } from 'vue'

const DEFAULT_TITLE = '胡氏管乐 | HUSHI WIND'
const DEFAULT_DESCRIPTION = '胡氏管乐提供原声钢琴、吉他、合成器与专业音响系统，覆盖演奏、录音、教学与现场扩声场景。'
const DEFAULT_IMAGE = '/uploads/real-assets/hero-concert-grand-piano.jpg'

const resolveValue = (value, fallback = '') => {
  const next = typeof value === 'function' ? value() : unref(value)
  return next || fallback
}

const absoluteUrl = (base, value) => {
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  const normalized = String(value).startsWith('/') ? value : `/${value}`
  return `${base}${normalized}`
}

export const useSiteUrl = () => {
  const config = useRuntimeConfig()
  return computed(() => (config.public.siteUrl || '').replace(/\/$/, ''))
}

export const useSiteSeo = ({
  title,
  description,
  path,
  image,
  type = 'website'
} = {}) => {
  const route = useRoute()
  const siteUrl = useSiteUrl()
  const seoTitle = computed(() => resolveValue(title, DEFAULT_TITLE))
  const seoDescription = computed(() => resolveValue(description, DEFAULT_DESCRIPTION))
  const seoPath = computed(() => resolveValue(path, route.path || '/'))
  const seoUrl = computed(() => absoluteUrl(siteUrl.value, seoPath.value))
  const seoImage = computed(() => absoluteUrl(siteUrl.value, resolveValue(image, DEFAULT_IMAGE)))

  useSeoMeta({
    title: seoTitle,
    description: seoDescription,
    ogTitle: seoTitle,
    ogDescription: seoDescription,
    ogType: type,
    ogUrl: seoUrl,
    ogImage: seoImage,
    twitterCard: 'summary_large_image',
    twitterTitle: seoTitle,
    twitterDescription: seoDescription,
    twitterImage: seoImage
  })

  useHead({
    link: [
      { rel: 'canonical', href: seoUrl }
    ]
  })
}
