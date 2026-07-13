const { createError } = require('../core/http')

const fields = [
  'title', 'slug', 'type', 'categoryName', 'description', 'imageUrl', 'gallery',
  'specs', 'features', 'scenes', 'warranty', 'series', 'quantity', 'price',
  'isFeatured', 'status', 'sku', 'model', 'color', 'seoTitle', 'seoDescription',
  'seoKeywords', 'ogImageUrl', 'relatedProductIds', 'accessories',
  'availableFrom', 'availableUntil', 'publishedAt', 'hiddenAt', 'lastEditedBy'
]
const statuses = ['published', 'active', 'draft', 'hidden', 'inactive']
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const pick = (source = {}) => fields.reduce((result, key) => {
  if (Object.prototype.hasOwnProperty.call(source, key)) result[key] = source[key]
  return result
}, {})

const normalizeProductPayload = (body = {}) => {
  const data = pick(body)
  ;['title', 'slug', 'type', 'categoryName', 'description', 'sku', 'model', 'color', 'seoTitle', 'seoDescription', 'seoKeywords', 'ogImageUrl', 'relatedProductIds', 'accessories', 'lastEditedBy'].forEach((field) => {
    if (typeof data[field] === 'string') data[field] = data[field].trim()
  })
  if (Object.prototype.hasOwnProperty.call(data, 'quantity')) data.quantity = Number.parseInt(data.quantity, 10) || 0
  if (Object.prototype.hasOwnProperty.call(data, 'price')) data.price = Number.parseFloat(data.price) || 0
  if (Object.prototype.hasOwnProperty.call(data, 'isFeatured')) data.isFeatured = Boolean(data.isFeatured)
  ;['availableFrom', 'availableUntil', 'publishedAt', 'hiddenAt'].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(data, field)) data[field] = data[field] ? new Date(data[field]) : null
  })
  data.status = statuses.includes(data.status) ? data.status : 'published'
  if (data.status === 'active') data.status = 'published'
  return data
}

const validateProductPayload = (body) => {
  const data = normalizeProductPayload(body)
  if (!data.title) throw createError(400, 'VALIDATION_ERROR', '产品名称不能为空')
  if (!data.slug) throw createError(400, 'VALIDATION_ERROR', '产品 URL 后缀不能为空')
  if (!data.type) throw createError(400, 'VALIDATION_ERROR', '系统归类不能为空')
  if (!data.categoryName) throw createError(400, 'VALIDATION_ERROR', '中文分类不能为空')
  if (data.description == null) data.description = ''
  if (!slugPattern.test(data.slug)) throw createError(400, 'VALIDATION_ERROR', '产品 URL 后缀只能使用小写字母、数字和短横线')
  if (data.price < 0) throw createError(400, 'VALIDATION_ERROR', '价格不能小于 0')
  if (data.quantity < 0) throw createError(400, 'VALIDATION_ERROR', '库存不能小于 0')
  if (data.imageUrl && !/^(https?:\/\/|\/uploads\/)/i.test(data.imageUrl)) throw createError(400, 'VALIDATION_ERROR', '主图地址格式不正确')
  if (data.ogImageUrl && !/^(https?:\/\/|\/uploads\/)/i.test(data.ogImageUrl)) throw createError(400, 'VALIDATION_ERROR', 'OG 图地址格式不正确')
  return data
}

module.exports = { normalizeProductPayload, validateProductPayload }
