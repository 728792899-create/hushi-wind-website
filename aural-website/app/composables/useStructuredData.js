import { computed, unref } from 'vue'

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
        {
          type: 'application/ld+json',
          children: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: resolvedItems.map((item, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              name: item.name,
              item: item.url.startsWith('http') ? item.url : `${siteUrl.value}${item.url}`
            }))
          })
        }
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
        {
          type: 'application/ld+json',
          children: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: faqItems.map((item) => ({
              '@type': 'Question',
              name: item.question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: item.answer
              }
            }))
          })
        }
      ]
    }
  })
}

export const useGlobalBusinessSchema = () => {
  const siteUrl = useSiteUrl()

  useHead(() => {
    const baseUrl = siteUrl.value
    if (!baseUrl) return {}

    const organizationId = `${baseUrl}/#organization`
    const websiteId = `${baseUrl}/#website`

    return {
      script: [
        {
          key: 'global-business-schema',
          type: 'application/ld+json',
          children: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'Organization',
                '@id': organizationId,
                name: '胡氏管乐',
                alternateName: 'HUSHI WIND',
                url: baseUrl,
                logo: `${baseUrl}/favicon.ico`,
                contactPoint: [
                  {
                    '@type': 'ContactPoint',
                    contactType: 'customer support',
                    url: `${baseUrl}/support`,
                    availableLanguage: ['zh-CN']
                  }
                ]
              },
              {
                '@type': 'WebSite',
                '@id': websiteId,
                name: '胡氏管乐',
                alternateName: 'HUSHI WIND',
                url: baseUrl,
                inLanguage: 'zh-CN',
                publisher: { '@id': organizationId },
                potentialAction: {
                  '@type': 'SearchAction',
                  target: `${baseUrl}/products?q={search_term_string}`,
                  'query-input': 'required name=search_term_string'
                }
              }
            ]
          })
        }
      ]
    }
  })
}

export const useResolvedStructuredScripts = (scripts) => computed(() => resolveValue(scripts, []))
