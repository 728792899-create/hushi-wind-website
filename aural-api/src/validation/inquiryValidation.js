const { createError } = require('../core/http')

const publicFields = ['customerName', 'contactInfo', 'message', 'inquiryType', 'productId', 'productTitle', 'city', 'budget', 'preferredTime']
const updateFields = ['status', 'priority', 'internalNote', 'isRead']
const contactPattern = /^[0-9+()\-\s]{6,30}$/
const statuses = ['new', 'contacted', 'quoted', 'processing', 'done', 'closed']
const priorities = ['normal', 'high', 'urgent']

const pick = (source = {}, fields) => fields.reduce((result, key) => {
  if (Object.prototype.hasOwnProperty.call(source, key)) result[key] = source[key]
  return result
}, {})

const trim = (data, fields) => fields.forEach((field) => {
  if (typeof data[field] === 'string') data[field] = data[field].trim()
})

const validateInquiryPayload = (body = {}) => {
  const data = pick(body, publicFields)
  trim(data, ['customerName', 'contactInfo', 'message', 'productTitle', 'city', 'budget', 'preferredTime'])
  if (data.productId !== null && data.productId !== '' && data.productId !== undefined) {
    data.productId = Number.parseInt(data.productId, 10)
    if (!Number.isInteger(data.productId) || data.productId <= 0) throw createError(400, 'INVALID_ID', '无效的数据 ID')
  } else delete data.productId
  data.status = 'new'
  data.priority = 'normal'
  if (!data.customerName) throw createError(400, 'VALIDATION_ERROR', '客户姓名不能为空')
  if (!data.contactInfo) throw createError(400, 'VALIDATION_ERROR', '联系方式不能为空')
  if (!data.message) throw createError(400, 'VALIDATION_ERROR', '需求描述不能为空')
  if (data.customerName.length < 2 || data.customerName.length > 40) throw createError(400, 'VALIDATION_ERROR', '客户姓名长度不正确')
  if (!contactPattern.test(data.contactInfo)) throw createError(400, 'VALIDATION_ERROR', '联系方式格式不正确')
  if (data.message.length < 2 || data.message.length > 1000) throw createError(400, 'VALIDATION_ERROR', '需求描述长度不正确')
  return data
}

const normalizeInquiryUpdatePayload = (body = {}) => {
  const data = pick(body, updateFields)
  if (Object.prototype.hasOwnProperty.call(data, 'isRead')) data.isRead = Boolean(data.isRead)
  if (Object.prototype.hasOwnProperty.call(data, 'status')) data.status = statuses.includes(data.status) ? data.status : 'new'
  if (Object.prototype.hasOwnProperty.call(data, 'priority')) data.priority = priorities.includes(data.priority) ? data.priority : 'normal'
  if (data.status && data.status !== 'new') data.followedAt = new Date()
  if (typeof data.internalNote === 'string') data.internalNote = data.internalNote.trim().slice(0, 4000)
  return data
}

module.exports = { validateInquiryPayload, normalizeInquiryUpdatePayload }
