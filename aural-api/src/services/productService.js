const { createError } = require('../core/http')
const { validateProductPayload } = require('../validation/productValidation')

const publicStatusWhere = { OR: [{ status: 'published' }, { status: 'active' }] }

const mergeWhere = (...parts) => {
  const valid = parts.filter((part) => part && Object.keys(part).length)
  if (!valid.length) return {}
  if (valid.length === 1) return valid[0]
  return { AND: valid }
}

const pagination = (query, fallbackSize) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1)
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize, 10) || fallbackSize))
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize }
}

const statusWhere = (status) => {
  if (!status || status === 'all') return {}
  if (status === 'published') return publicStatusWhere
  return { status }
}

const createProductService = ({ repository, saveContentVersion, auditOperation }) => ({
  async list(req, isAdmin) {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
    const type = typeof req.query.type === 'string' ? req.query.type.trim() : ''
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : ''
    const pageData = pagination(req.query, isAdmin ? 20 : 50)
    const filters = mergeWhere({
      ...(type && type !== 'all' ? { type } : {}),
      ...(search ? { OR: [
        { title: { contains: search } }, { series: { contains: search } },
        { categoryName: { contains: search } }, { description: { contains: search } },
        { specs: { contains: search } }, { features: { contains: search } }, { scenes: { contains: search } }
      ] } : {})
    }, isAdmin ? statusWhere(status) : {})
    const where = mergeWhere(isAdmin ? {} : publicStatusWhere, filters)
    const [total, list] = await Promise.all([repository.count(where), repository.list(where, pageData)])
    return { list, total, ...pageData }
  },

  async checkSlug(slug, excludeId = 0) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw createError(400, 'VALIDATION_ERROR', '产品 URL 后缀格式不正确')
    return !(await repository.findSlug(slug, excludeId))
  },

  versions: (id) => repository.versions(id),

  async create(req) {
    const data = validateProductPayload({ ...req.body, lastEditedBy: req.admin.username })
    if (data.status === 'published' && !data.publishedAt) data.publishedAt = new Date()
    const created = await repository.create(data)
    await saveContentVersion(req, 'product', created)
    await auditOperation(req, { action: 'CREATE', module: 'products', target: created.title, targetId: created.id, summary: '创建产品', afterData: created })
    return created
  },

  async update(req, id) {
    const before = await repository.findById(id)
    if (!before) throw createError(404, 'NOT_FOUND', '产品不存在')
    await saveContentVersion(req, 'product', before)
    const data = validateProductPayload({ ...req.body, lastEditedBy: req.admin.username })
    if (data.status === 'published' && !data.publishedAt) data.publishedAt = before.publishedAt || new Date()
    if (data.status === 'hidden' && !data.hiddenAt) data.hiddenAt = new Date()
    const updated = await repository.update(id, data)
    await auditOperation(req, { action: 'UPDATE', module: 'products', target: updated.title, targetId: id, summary: '更新产品', beforeData: before, afterData: updated })
    return updated
  },

  async restore(req, id, versionId) {
    const version = await repository.version(versionId)
    if (!version || version.module !== 'product' || version.recordId !== id) throw createError(404, 'NOT_FOUND', '版本不存在')
    const before = await repository.findById(id)
    if (!before) throw createError(404, 'NOT_FOUND', '产品不存在')
    const snapshot = JSON.parse(version.snapshot)
    delete snapshot.id
    delete snapshot.createdAt
    delete snapshot.updatedAt
    const updated = await repository.update(id, validateProductPayload({ ...snapshot, lastEditedBy: req.admin.username }))
    await saveContentVersion(req, 'product', before)
    await auditOperation(req, { action: 'RESTORE', module: 'products', target: updated.title, targetId: id, summary: `恢复版本 ${versionId}`, beforeData: before, afterData: updated })
    return updated
  },

  async remove(req, id) {
    const before = await repository.findById(id)
    if (!before) throw createError(404, 'NOT_FOUND', '产品不存在')
    await saveContentVersion(req, 'product', before)
    await repository.remove(id)
    await auditOperation(req, { action: 'DELETE', module: 'products', target: before.title, targetId: id, summary: '删除产品', beforeData: before })
  }
})

module.exports = { createProductService }
