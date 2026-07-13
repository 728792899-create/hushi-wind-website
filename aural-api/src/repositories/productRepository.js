const createProductRepository = (prisma) => ({
  count: (where) => prisma.product.count({ where }),
  list: (where, { skip, take }) => prisma.product.findMany({ where, orderBy: { updatedAt: 'desc' }, skip, take }),
  findById: (id) => prisma.product.findUnique({ where: { id } }),
  findSlug: (slug, excludeId = 0) => prisma.product.findFirst({ where: { slug, ...(excludeId ? { NOT: { id: excludeId } } : {}) } }),
  create: (data) => prisma.product.create({ data }),
  update: (id, data) => prisma.product.update({ where: { id }, data }),
  remove: (id) => prisma.product.delete({ where: { id } }),
  versions: (id) => prisma.contentVersion.findMany({ where: { module: 'product', recordId: id }, orderBy: { createdAt: 'desc' }, take: 30 }),
  version: (versionId) => prisma.contentVersion.findUnique({ where: { id: versionId } })
})

module.exports = { createProductRepository }
