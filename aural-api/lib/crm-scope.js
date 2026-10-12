// Role permissions answer what an account may do; this filter also limits which
// inquiries support staff may access. Never take the scope from request input.
const inquiryScope = (admin) =>
  admin?.role === 'support' ? { assigneeId: admin.id } : {};

const canAccessInquiry = (admin, row) =>
  Boolean(row) &&
  (admin?.role !== 'support' || row.assigneeId === admin.id);

const recycleScope = (admin) =>
  admin?.role === 'support'
    ? { OR: [{ module: { not: 'inquiry' } }, { inquiryAssigneeId: admin.id }] }
    : {};

module.exports = { inquiryScope, canAccessInquiry, recycleScope };
