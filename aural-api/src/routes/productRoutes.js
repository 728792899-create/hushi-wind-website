const { asyncHandler } = require('../core/http')
const { createProductController } = require('../controllers/productController')
const { createProductRepository } = require('../repositories/productRepository')
const { createProductService } = require('../services/productService')

const registerProductRoutes = (app, dependencies) => {
  const repository = createProductRepository(dependencies.prisma)
  const service = createProductService({
    repository,
    saveContentVersion: dependencies.saveContentVersion,
    auditOperation: dependencies.auditOperation
  })
  const controller = createProductController(service)
  const requireRead = [dependencies.requireAdmin, dependencies.requirePermission('products:read')]
  const requireWrite = [dependencies.requireAdmin, dependencies.requirePermission('products:write')]

  app.get('/api/products', asyncHandler(controller.list))
  app.get('/api/products/slug-check/:slug', ...requireRead, asyncHandler(controller.checkSlug))
  app.get('/api/products/:id/versions', ...requireRead, asyncHandler(controller.versions))
  app.post('/api/products/:id/restore/:versionId', ...requireWrite, asyncHandler(controller.restore))
  app.post('/api/products', ...requireWrite, asyncHandler(controller.create))
  app.put('/api/products/:id', ...requireWrite, asyncHandler(controller.update))
  app.delete('/api/products/:id', ...requireWrite, asyncHandler(controller.remove))
}

module.exports = { registerProductRoutes }
