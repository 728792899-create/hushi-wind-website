const { createError } = require('../core/http')
const { canAdmin } = require('../security/permissions')

const toId = (value) => {
  const id = Number.parseInt(value, 10)
  if (!Number.isInteger(id) || id <= 0) throw createError(400, 'INVALID_ID', '无效的数据 ID')
  return id
}

const createInquiryController = (service, dependencies) => ({
  create: async (req, res) => {
    try {
      dependencies.assertPublicFormGuard(req, 'inquiry')
    } catch (error) {
      await dependencies.createAlert({
        level: 'warning',
        type: 'form_submit_failed',
        title: '公开表单提交被拦截',
        message: error.message,
        metadata: { form: 'inquiry', pagePath: req.body?.pagePath, code: error.code, ip: dependencies.getRequestMeta(req).ip }
      })
      throw error
    }
    const data = service.validatePublic(req.body)
    const created = await service.create(data)
    dependencies.notifyWebhook('inquiry_created', {
      id: created.id,
      type: created.inquiryType,
      priority: created.priority,
      city: created.city,
      productTitle: created.productTitle,
      customerName: created.customerName,
      contactInfo: dependencies.maskContact(created.contactInfo)
    })
    await dependencies.recordAnalyticsEvent(req, {
      eventType: 'inquiry_submit',
      pagePath: req.body.pagePath,
      source: req.body.source,
      sessionId: req.body.sessionId,
      visitorId: req.body.visitorId,
      entityType: data.productId ? 'product' : 'support',
      entityId: data.productId ? String(data.productId) : '',
      entityTitle: data.productTitle,
      ctaName: data.inquiryType === 'quote' ? 'quote' : data.inquiryType === 'appointment' ? 'appointment' : 'support-ticket',
      metadata: { budget: data.budget, inquiryType: data.inquiryType }
    })
    res.status(201).json({ success: true, data: created })
  },
  list: async (req, res) => {
    const result = await service.list(req.query)
    const rows = canAdmin(req.admin, 'crm:private') ? result.rows : result.rows.map((row) => ({
      ...row,
      contactInfo: dependencies.maskContact(row.contactInfo),
      internalNote: row.internalNote ? '已隐藏' : ''
    }))
    res.json({
      data: rows,
      meta: { pagination: { page: result.page, pageSize: result.pageSize, total: result.total, pageCount: Math.max(1, Math.ceil(result.total / result.pageSize)) } }
    })
  },
  markRead: async (req, res) => {
    await service.markRead(req, toId(req.params.id))
    res.json({ success: true })
  },
  update: async (req, res) => res.json({ success: true, data: await service.update(req, toId(req.params.id)) }),
  remove: async (req, res) => {
    await service.remove(req, toId(req.params.id))
    res.json({ success: true })
  }
})

module.exports = { createInquiryController }
