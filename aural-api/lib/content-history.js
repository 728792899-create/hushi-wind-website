// History is immutable; removed catalog names must not be resurrected by a restore.
async function reconcileCatalogSnapshot(prisma, snapshot, current) {
  const data = { ...snapshot };
  if (!current) return data;
  if (typeof data.series === 'string' && data.series !== current.series && data.series &&
      !await prisma.productSeries.findUnique({ where: { name: data.series } })) {
    data.series = current.series || '';
  }
  if ('categoryName' in current && typeof data.type === 'string' && current.type && data.type !== current.type &&
      !await prisma.productCategory.findUnique({ where: { slug: data.type } })) {
    data.type = current.type;
    data.categoryName = current.categoryName;
  }
  return data;
}
async function contentHistory(prisma, module, recordId, query = {}) {
  const number = (value, fallback, max) => Math.max(1, Math.min(max, Number.parseInt(value, 10) || fallback));
  const page = number(query.page, 1, 10000), pageSize = number(query.pageSize, 30, 100);
  const search = typeof query.search === 'string' ? query.search.trim().slice(0, 100) : '';
  const where = { module, recordId, ...(search ? { OR: [{ operator: { contains: search } }, { snapshot: { contains: search } }] } : {}) };
  const [total, data] = await Promise.all([
    prisma.contentVersion.count({ where }),
    prisma.contentVersion.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { data, meta: { pagination: { page, pageSize, total, pageCount: Math.max(1, Math.ceil(total / pageSize)) } } };
}
module.exports = { reconcileCatalogSnapshot, contentHistory };
