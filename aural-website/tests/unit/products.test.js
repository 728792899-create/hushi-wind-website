import { describe, expect, it } from 'vitest'
import { filterAndSortProducts, formatProductPrice, normalizeCatalogProduct, parseJsonValue } from '../../app/lib/products'

const products = [
  { id: 1, title: 'Stage 88', type: 'synth', series: 'DX', description: '舞台键盘', price: 18000, quantity: 3, isFeatured: true, updatedAt: '2026-01-01', scenes: ['舞台'], specs: [{ label: '键数', value: '88' }] },
  { id: 2, title: 'Concert Grand', type: 'piano', series: 'C', description: '三角钢琴', price: 0, quantity: 0, isFeatured: false, updatedAt: '2026-06-01', scenes: ['音乐厅'], specs: [] },
  { id: 3, title: 'Studio Guitar', type: 'guitar', series: 'T', description: '录音吉他', price: 9000, quantity: 2, isFeatured: false, updatedAt: '2026-04-01', scenes: ['录音'], specs: [] }
]

describe('product catalog model', () => {
  it('normalizes API records and safely parses JSON fields', () => {
    const normalized = normalizeCatalogProduct({ id: 9, attributes: { title: 'DX', imageUrl: '/dx.webp', specs: '[{"label":"键数","value":"88"}]' } }, (value) => `https://api.test${value}`)
    expect(normalized.image).toBe('https://api.test/dx.webp')
    expect(normalized.specs[0].value).toBe('88')
    expect(parseJsonValue('{broken', ['fallback'])).toEqual(['fallback'])
  })

  it('combines category, keyword, price and stock filters', () => {
    expect(filterAndSortProducts(products, { category: 'synth', query: '88', stock: 'inStock' }).map((item) => item.id)).toEqual([1])
    expect(filterAndSortProducts(products, { price: 'consult', stock: 'outStock' }).map((item) => item.id)).toEqual([2])
    expect(filterAndSortProducts(products, { price: 'under10000' }).map((item) => item.id)).toEqual([3])
  })

  it('sorts deterministically and formats consult pricing', () => {
    expect(filterAndSortProducts(products, { sort: 'priceAsc' }).map((item) => item.id)).toEqual([2, 3, 1])
    expect(filterAndSortProducts(products, { sort: 'latest' }).map((item) => item.id)).toEqual([2, 3, 1])
    expect(formatProductPrice(0)).toBe('咨询报价')
    expect(formatProductPrice(12800)).toBe('¥ 12800.00')
  })
})
