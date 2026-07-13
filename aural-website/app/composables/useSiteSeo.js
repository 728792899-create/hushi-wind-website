import { computed, unref } from 'vue'

import { buildSeoMeta, SEO_DEFAULTS } from '../lib/seo'

const resolveValue = (value, fallback = '') => {
  const next = typeof value === 'function' ? value() : unref(value)
  return next || fallback
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
  const seo = computed(() => buildSeoMeta({
    baseUrl: siteUrl.value,
    title: resolveValue(title, SEO_DEFAULTS.title),
    description: resolveValue(description, SEO_DEFAULTS.description),
    path: resolveValue(path, route.path || '/'),
    image: resolveValue(image, SEO_DEFAULTS.image),
    type
  }))

  useSeoMeta({
    title: computed(() => seo.value.title),
    description: computed(() => seo.value.description),
    ogTitle: computed(() => seo.value.ogTitle),
    ogDescription: computed(() => seo.value.ogDescription),
    ogType: computed(() => seo.value.ogType),
    ogUrl: computed(() => seo.value.ogUrl),
    ogImage: computed(() => seo.value.ogImage),
    twitterCard: 'summary_large_image',
    twitterTitle: computed(() => seo.value.twitterTitle),
    twitterDescription: computed(() => seo.value.twitterDescription),
    twitterImage: computed(() => seo.value.twitterImage)
  })

  useHead(() => ({ link: [{ rel: 'canonical', href: seo.value.canonical }] }))
}
