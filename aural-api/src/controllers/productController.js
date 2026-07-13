const { createError } = require('../core/http')
const { canAdmin } = require('../security/permissions')

const toId = (value) => {
  const id = Number.parseInt(value, 10)
  if (!Number.isInteger(id) || id <= 0) throw createError(400, 'INVALID_ID', '无效的数据 ID')
  return id
}

const payload = (data, total, page, pageSize) => ({
  data,
  meta: { pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } }
})

const serialize = (product) => ({
  id: product.id,
  attributes: {
    ...product,
    image: product.imageUrl ? { data: { attributes: { url: product.imageUrl } } } : null
  }
})

const createProductController = (service) => ({
  list: async (req, res) => {
    const adminRequested = req.query.admin === '1' || req.query.preview === '1'
    if (adminRequested && !req.admin) throw createError(401, 'UNAUTHORIZED', '请先登录后台')
    if (adminRequested && !canAdmin(req.admin, 'products:read')) throw createError(403, 'FORBIDDEN', '当前账号没有产品查看权限')
    const result = await service.list(req, adminRequested)
    res.json(payload(result.list.map(serialize), result.total, result.page, result.pageSize))
  },
  checkSlug: async (req, res) => res.json({ available: await service.checkSlug(String(req.params.slug || '').trim(), Number.parseInt(req.query.excludeId, 10) || 0) }),
  versions: async (req, res) => res.json({ data: await service.versions(toId(req.params.id)) }),
  restore: async (req, res) => res.json(await service.restore(req, toId(req.params.id), toId(req.params.versionId))),
  create: async (req, res) => res.status(201).json(await service.create(req)),
  update: async (req, res) => res.json(await service.update(req, toId(req.params.id))),
  remove: async (req, res) => {
    await service.remove(req, toId(req.params.id))
    res.json({ success: true })
  }
})

module.exports = { createProductController }
