import { computed, unref } from 'vue'
import { buildBreadcrumbSchema, buildBusinessSchema, buildFaqSchema, createStructuredDataScript } from '../lib/seo'

const resolveValue = (value, fallback = '') => {
  const next = typeof value === 'function' ? value() : unref(value)
  return next || fallback
}

export const useBreadcrumbSchema = (items = []) => {
  const siteUrl = useSiteUrl()

  useHead(() => {
    const resolvedItems = resolveValue(items, [])
      .map((item, index) => ({
        name: resolveValue(item.name, ''),
        url: resolveValue(item.url || item.path, '')
      }))
      .filter((item) => item.name && item.url)

    if (!resolvedItems.length) return {}

    return {
      script: [
        createStructuredDataScript(buildBreadcrumbSchema(siteUrl.value, resolvedItems))
      ]
    }
  })
}

export const useFaqSchema = (faqs) => {
  useHead(() => {
    const faqItems = resolveValue(faqs, [])
      .filter((item) => item?.question && item?.answer)
      .slice(0, 20)

    if (!faqItems.length) return {}

    return {
      script: [
        createStructuredDataScript(buildFaqSchema(faqItems))
      ]
    }
  })
}

export const useGlobalBusinessSchema = () => {
  const siteUrl = useSiteUrl()

  useHead(() => {
    const baseUrl = siteUrl.value
    if (!baseUrl) return {}

    return {
      script: [
        createStructuredDataScript(buildBusinessSchema(baseUrl), 'global-business-schema')
      ]
    }
  })
}

export const useResolvedStructuredScripts = (scripts) => computed(() => resolveValue(scripts, []))
