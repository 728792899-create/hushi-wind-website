export const inDateRange = (value, range) => {
  if (!range?.length || !value) return true
  const time = new Date(value).getTime()
  const start = new Date(range[0]).setHours(0, 0, 0, 0)
  const end = new Date(range[1]).setHours(23, 59, 59, 999)
  return time >= start && time <= end
}

export const statusLabel = (status) => ({ active: '启用', disabled: '停用' }[status] || status || '-')
export const statusType = (status) => ({ active: 'success', disabled: 'info' }[status] || 'warning')
export const alertLevelLabel = (level) => ({ critical: '严重', warning: '警告' }[level] || level || '-')
export const alertLevelType = (level) => ({ critical: 'danger', warning: 'warning' }[level] || 'info')

export const readinessTagType = (item = {}) => item.ok ? 'success' : ({ critical: 'danger', warning: 'warning' }[item.level] || 'info')
export const readinessStatusLabel = (item = {}) => item.ok ? '已通过' : ({ critical: '必须处理', warning: '建议整改' }[item.level] || '待确认')
export const readinessActionLabel = (item = {}) => ({
  credentials: '去改密码/账号',
  two_factor: '去绑定 2FA',
  backup: '去备份记录',
  open_alerts: '去处理告警',
  api_errors: '查看日志',
  login_failures: '查看日志'
}[item.key] || (item.ok ? '查看状态' : '查看详情'))

export const fileSize = (value) => {
  const bytes = Number(value || 0)
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export const parseJsonValue = (value) => {
  if (!value) return null
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return value }
}

export const prettyJson = (value) => {
  const parsed = parseJsonValue(value)
  if (!parsed) return '无记录'
  if (typeof parsed === 'string') return parsed
  return JSON.stringify(parsed, null, 2)
}

export const backupHealthFor = (row, now = Date.now()) => {
  if (!row) return { tone: 'danger', title: '没有可用备份', desc: '上线后应立即创建一次数据库备份。' }
  if (row.status !== 'success') return { tone: 'danger', title: '最近备份失败', desc: row.message || '请检查服务器文件权限和数据库路径。' }
  const ageMs = now - new Date(row.createdAt).getTime()
  const ageDays = Math.max(0, Math.floor(ageMs / (24 * 60 * 60 * 1000)))
  if (ageMs > 7 * 24 * 60 * 60 * 1000) return { tone: 'warning', title: `已 ${ageDays} 天未备份`, desc: '建议本周补一次手动备份并做恢复演练。' }
  return { tone: 'success', title: '备份状态正常', desc: `最近 ${ageDays || '今天'} 已有成功备份。` }
}
