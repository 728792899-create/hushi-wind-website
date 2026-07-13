const roleDefinitions = {
  super_admin: { label: '超级管理员', permissions: ['*'] },
  operations: {
    label: '运营管理员',
    permissions: [
      'dashboard:read', 'products:read', 'products:write', 'articles:read', 'articles:write',
      'cms:read', 'cms:write', 'artists:read', 'artists:write', 'config:read', 'config:write',
      'resources:read', 'resources:write', 'exports:create', 'logs:read', 'backups:create'
    ]
  },
  support: { label: '客服', permissions: ['dashboard:read', 'crm:read', 'crm:write', 'crm:private', 'exports:create'] },
  editor: { label: '内容编辑', permissions: ['dashboard:read', 'articles:read', 'articles:write', 'cms:read', 'cms:write', 'artists:read', 'products:read', 'resources:read', 'config:read'] },
  readonly: { label: '只读观察员', permissions: ['dashboard:read', 'products:read', 'articles:read', 'cms:read', 'artists:read', 'resources:read', 'crm:read', 'config:read', 'logs:read'] }
}

const canAdmin = (admin, permission) => {
  if (!admin) return false
  const permissions = roleDefinitions[admin.role]?.permissions || []
  return permissions.includes('*') || permissions.includes(permission)
}

const publicAdminUser = (admin) => ({
  id: admin.id,
  username: admin.username,
  displayName: admin.displayName || admin.username,
  role: admin.role,
  roleLabel: roleDefinitions[admin.role]?.label || admin.role,
  status: admin.status,
  permissions: roleDefinitions[admin.role]?.permissions || [],
  totpEnabled: Boolean(admin.totpEnabled),
  lastLoginAt: admin.lastLoginAt
})

module.exports = { roleDefinitions, canAdmin, publicAdminUser }
