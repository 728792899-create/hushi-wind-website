export const SEO_DEFAULTS = Object.freeze({
  title: '胡氏管乐 | HUSHI WIND',
  description: '胡氏管乐提供原声钢琴、吉他、合成器与专业音响系统，覆盖演奏、录音、教学与现场扩声场景。',
  image: '/uploads/real-assets/hero-concert-grand-piano.jpg'
})

export const absoluteUrl = (base, value) => {
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  const cleanBase = String(base || '').replace(/\/$/, '')
  const normalized = String(value).startsWith('/') ? value : `/${value}`
  return `${cleanBase}${normalized}`
}

export const createStructuredDataScript = (schema, key) => ({
  ...(key ? { key } : {}),
  type: 'application/ld+json',
  textContent: JSON.stringify(schema)
})

export const buildSeoMeta = ({ baseUrl, title, description, path, image, type = 'website' } = {}) => {
  const seoTitle = title || SEO_DEFAULTS.title
  const seoDescription = description || SEO_DEFAULTS.description
  const url = absoluteUrl(baseUrl, path || '/')
  const imageUrl = absoluteUrl(baseUrl, image || SEO_DEFAULTS.image)
  return {
    title: seoTitle,
    description: seoDescription,
    ogTitle: seoTitle,
    ogDescription: seoDescription,
    ogType: type,
    ogUrl: url,
    ogImage: imageUrl,
    twitterCard: 'summary_large_image',
    twitterTitle: seoTitle,
    twitterDescription: seoDescription,
    twitterImage: imageUrl,
    canonical: url
  }
}

export const buildBreadcrumbSchema = (baseUrl, items = []) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items
    .filter((item) => item?.name && (item.url || item.path))
    .map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(baseUrl, item.url || item.path)
    }))
})

export const buildFaqSchema = (faqs = []) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs
    .filter((item) => item?.question && item?.answer)
    .slice(0, 20)
    .map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer }
    }))
})

export const buildBusinessSchema = (baseUrl) => {
  const organizationId = `${baseUrl}/#organization`
  const websiteId = `${baseUrl}/#website`
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organizationId,
        name: '胡氏管乐',
        alternateName: 'HUSHI WIND',
        url: baseUrl,
        logo: `${baseUrl}/favicon.ico`,
        contactPoint: [{
          '@type': 'ContactPoint',
          contactType: 'customer support',
          url: `${baseUrl}/support`,
          availableLanguage: ['zh-CN']
        }]
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
  }
}

export const buildProductSchema = ({ baseUrl, product, relatedProducts = [] } = {}) => {
  if (!product) return null
  const url = absoluteUrl(baseUrl, `/products/${product.slug || product.id}`)
  const offer = {
    '@type': 'Offer',
    priceCurrency: 'CNY',
    availability: product.quantity > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    url
  }
  if (Number(product.price || 0) > 0) offer.price = Number(product.price)

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': `${url}#product`,
    name: product.title,
    description: product.description,
    image: product.gallery,
    brand: { '@type': 'Brand', name: '胡氏管乐 HUSHI WIND' },
    ...(product.sku ? { sku: product.sku } : {}),
    ...(product.model ? { model: product.model } : {}),
    ...(product.color ? { color: product.color } : {}),
    category: product.typeLabel,
    isRelatedTo: relatedProducts.map((item) => ({
      '@type': 'Product',
      name: item.title,
      url: absoluteUrl(baseUrl, `/products/${item.slug || item.id}`)
    })),
    additionalProperty: (product.specs || []).map((spec) => ({
      '@type': 'PropertyValue',
      name: spec.label,
      value: spec.value
    })),
    offers: offer
  }
}
