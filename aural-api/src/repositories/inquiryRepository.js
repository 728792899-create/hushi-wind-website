const createInquiryRepository = (prisma) => ({
  create: (data) => prisma.inquiry.create({ data }),
  count: (where) => prisma.inquiry.count({ where }),
  list: (where, { skip, take }) => prisma.inquiry.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
  findById: (id) => prisma.inquiry.findUnique({ where: { id } }),
  update: (id, data) => prisma.inquiry.update({ where: { id }, data }),
  remove: (id) => prisma.inquiry.delete({ where: { id } })
})

module.exports = { createInquiryRepository }
