export const parseJsonValue = (value, fallback = []) => {
  if (!value) return fallback
  if (Array.isArray(value)) return value
  try { return JSON.parse(value) } catch { return fallback }
}

export const normalizeCatalogProduct = (source, resolveMedia = (value) => value) => {
  const attributes = source.attributes || source
  const imagePath = attributes.image?.data?.attributes?.url || attributes.imageUrl
  return {
    id: source.id,
    title: attributes.title || '未命名产品',
    slug: attributes.slug || '',
    type: attributes.type || 'other',
    series: attributes.series || attributes.categoryName || attributes.type || 'HUSHI WIND',
    description: attributes.description || '该产品暂无详细介绍。',
    image: resolveMedia(imagePath, ''),
    quantity: Number(attributes.quantity || 0),
    price: Number(attributes.price || 0),
    isFeatured: Boolean(attributes.isFeatured),
    status: attributes.status || 'published',
    updatedAt: attributes.updatedAt || attributes.createdAt || '',
    specs: parseJsonValue(attributes.specs, []),
    features: parseJsonValue(attributes.features, []),
    scenes: parseJsonValue(attributes.scenes, []),
    warranty: attributes.warranty || ''
  }
}

const matchesPrice = (price, filter) => filter === 'all'
  || (filter === 'consult' && price === 0)
  || (filter === 'under10000' && price > 0 && price < 10000)
  || (filter === '10000-50000' && price >= 10000 && price <= 50000)
  || (filter === 'over50000' && price > 50000)

export const filterAndSortProducts = (products, filters = {}) => {
  const category = filters.category || 'all'
  const price = filters.price || 'all'
  const stock = filters.stock || 'all'
  const sort = filters.sort || 'featured'
  const keyword = String(filters.query || '').trim().toLowerCase()
  const filtered = products.filter((product) => {
    const matchCategory = category === 'all' || product.type === category
    const matchStock = stock === 'all'
      || (stock === 'inStock' && product.quantity > 0)
      || (stock === 'outStock' && product.quantity <= 0)
    const searchable = [product.title, product.series, product.description, product.type]
      .concat(product.scenes || [])
      .concat((product.specs || []).map((spec) => `${spec.label} ${spec.value}`))
      .filter(Boolean)
      .map((value) => String(value).toLowerCase())
    return matchCategory && matchesPrice(product.price, price) && matchStock
      && (!keyword || searchable.some((field) => field.includes(keyword)))
  })

  return [...filtered].sort((a, b) => {
    if (sort === 'priceAsc') return a.price - b.price
    if (sort === 'priceDesc') return b.price - a.price
    if (sort === 'latest') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    return Number(b.isFeatured) - Number(a.isFeatured)
  })
}

export const formatProductPrice = (price) => Number(price || 0) > 0 ? `¥ ${Number(price).toFixed(2)}` : '咨询报价'
