const { createError } = require('../core/http')
const { normalizeInquiryUpdatePayload, validateInquiryPayload } = require('../validation/inquiryValidation')

const queryValue = (value) => typeof value === 'string' ? value.trim() : ''
const mergeWhere = (...parts) => {
  const valid = parts.filter((part) => part && Object.keys(part).length)
  return valid.length > 1 ? { AND: valid } : (valid[0] || {})
}
const parseDate = (value, end = false) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  if (end) date.setHours(23, 59, 59, 999)
  else date.setHours(0, 0, 0, 0)
  return date
}
const pageData = (query) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1)
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize, 10) || 20))
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize }
}

const createInquiryService = ({ repository, auditOperation }) => ({
  validatePublic: validateInquiryPayload,
  create: (data) => repository.create(data),
  async list(query) {
    const keyword = queryValue(query.keyword)
    const status = queryValue(query.status)
    const priority = queryValue(query.priority)
    const type = queryValue(query.type)
    const city = queryValue(query.city)
    const product = queryValue(query.product)
    const startDate = parseDate(query.startDate)
    const endDate = parseDate(query.endDate, true)
    const paging = pageData(query)
    const where = mergeWhere(
      status && status !== 'all' ? { status } : {},
      priority && priority !== 'all' ? { priority } : {},
      type && type !== 'all' ? (type === 'general' ? { OR: [{ inquiryType: null }, { inquiryType: '' }, { inquiryType: 'general' }] } : { inquiryType: type }) : {},
      city ? { city: { contains: city } } : {},
      product ? { productTitle: { contains: product } } : {},
      keyword ? { OR: [
        { customerName: { contains: keyword } }, { contactInfo: { contains: keyword } },
        { productTitle: { contains: keyword } }, { city: { contains: keyword } },
        { message: { contains: keyword } }, { internalNote: { contains: keyword } }
      ] } : {},
      startDate || endDate ? { createdAt: { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) } } : {}
    )
    const [total, rows] = await Promise.all([repository.count(where), repository.list(where, paging)])
    return { rows, total, ...paging }
  },
  async markRead(req, id) {
    await repository.update(id, { isRead: true })
    await auditOperation(req, { action: 'READ', module: 'crm', target: 'inquiry', targetId: id, summary: '标记工单已读' })
  },
  async update(req, id) {
    const before = await repository.findById(id)
    if (!before) throw createError(404, 'NOT_FOUND', '工单不存在')
    const data = await repository.update(id, normalizeInquiryUpdatePayload(req.body))
    await auditOperation(req, { action: 'UPDATE', module: 'crm', target: before.customerName, targetId: id, summary: '更新工单跟进', beforeData: before, afterData: data })
    return data
  },
  async remove(req, id) {
    const before = await repository.findById(id)
    if (!before) throw createError(404, 'NOT_FOUND', '工单不存在')
    await repository.remove(id)
    await auditOperation(req, { action: 'DELETE', module: 'crm', target: before.customerName, targetId: id, summary: '删除工单', beforeData: before })
  }
})

module.exports = { createInquiryService }
