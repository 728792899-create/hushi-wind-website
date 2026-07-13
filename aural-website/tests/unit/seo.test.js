import { describe, expect, it } from 'vitest'
import {
  absoluteUrl,
  buildBreadcrumbSchema,
  buildBusinessSchema,
  buildFaqSchema,
  buildProductSchema,
  buildSeoMeta,
  createStructuredDataScript
} from '../../app/lib/seo'

describe('SEO builders', () => {
  it('normalizes canonical and Open Graph URLs', () => {
    const seo = buildSeoMeta({
      baseUrl: 'https://www.example.com/',
      title: 'DX-88 | 胡氏管乐',
      description: '专业舞台键盘产品详情与预约咨询。',
      path: 'products/dx-88',
      image: '/uploads/dx-88.webp'
    })
    expect(seo.canonical).toBe('https://www.example.com/products/dx-88')
    expect(seo.ogUrl).toBe(seo.canonical)
    expect(seo.ogImage).toBe('https://www.example.com/uploads/dx-88.webp')
    expect(absoluteUrl('https://www.example.com', 'https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg')
  })

  it('creates valid breadcrumb, FAQ and organization graph shapes', () => {
    const breadcrumb = buildBreadcrumbSchema('https://www.example.com', [
      { name: '首页', path: '/' },
      { name: '产品', path: '/products' }
    ])
    expect(breadcrumb.itemListElement.map((item) => item.position)).toEqual([1, 2])
    expect(breadcrumb.itemListElement[1].item).toBe('https://www.example.com/products')

    const faq = buildFaqSchema([{ question: '保修多久？', answer: '以产品页说明为准。' }, { question: '', answer: 'ignored' }])
    expect(faq.mainEntity).toHaveLength(1)
    expect(faq.mainEntity[0].acceptedAnswer.text).toContain('产品页')

    const business = buildBusinessSchema('https://www.example.com')
    expect(business['@graph'].map((item) => item['@type'])).toEqual(['Organization', 'WebSite'])
  })

  it('omits unknown offer prices instead of serializing a fake zero price', () => {
    const schema = buildProductSchema({
      baseUrl: 'https://www.example.com',
      product: {
        id: 1,
        slug: 'demo',
        title: 'Demo',
        description: 'Demo product',
        gallery: ['https://cdn.example.com/demo.jpg'],
        typeLabel: '电子键盘',
        quantity: 1,
        price: 0,
        specs: []
      }
    })
    expect(schema.offers.url).toBe('https://www.example.com/products/demo')
    expect(schema.offers).not.toHaveProperty('price')
    expect(schema.offers.availability).toContain('InStock')
  })

  it('creates an Unhead-compatible JSON-LD script with parseable content', () => {
    const script = createStructuredDataScript({ '@context': 'https://schema.org', '@type': 'Product', name: 'DX-88' }, 'product-schema')
    expect(script).toMatchObject({ key: 'product-schema', type: 'application/ld+json' })
    expect(script).not.toHaveProperty('children')
    expect(JSON.parse(script.textContent)).toMatchObject({ '@type': 'Product', name: 'DX-88' })
  })
})
