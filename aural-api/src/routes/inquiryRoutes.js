const { asyncHandler } = require('../core/http')
const { createInquiryController } = require('../controllers/inquiryController')
const { createInquiryRepository } = require('../repositories/inquiryRepository')
const { createInquiryService } = require('../services/inquiryService')

const registerInquiryRoutes = (app, dependencies) => {
  const repository = createInquiryRepository(dependencies.prisma)
  const service = createInquiryService({ repository, auditOperation: dependencies.auditOperation })
  const controller = createInquiryController(service, dependencies)
  const requireRead = [dependencies.requireAdmin, dependencies.requirePermission('crm:read')]
  const requireWrite = [dependencies.requireAdmin, dependencies.requirePermission('crm:write')]

  app.post('/api/inquiries', asyncHandler(controller.create))
  app.get('/api/inquiries', ...requireRead, asyncHandler(controller.list))
  app.put('/api/inquiries/:id/read', ...requireWrite, asyncHandler(controller.markRead))
  app.put('/api/inquiries/:id', ...requireWrite, asyncHandler(controller.update))
  app.delete('/api/inquiries/:id', ...requireWrite, asyncHandler(controller.remove))
}

module.exports = { registerInquiryRoutes }
