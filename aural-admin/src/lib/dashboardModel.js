export const chartPointsFor = (values = []) => {
  const normalized = values.map((value) => Number(value || 0)).filter(Number.isFinite)
  if (!normalized.length) return []
  const min = Math.min(...normalized)
  const max = Math.max(...normalized)
  const range = Math.max(1, max - min)
  const width = 300
  const height = 118
  const left = 10
  const top = 18
  return normalized.map((value, index) => ({
    key: `${index}-${value}`,
    x: left + (normalized.length === 1 ? width / 2 : (index / (normalized.length - 1)) * width),
    y: top + height - ((value - min) / range) * height
  }))
}

const compact = (value) => {
  const number = Number(value || 0)
  const abs = Math.abs(number)
  if (abs >= 100000000) {
    const text = (number / 100000000).toFixed(abs >= 1000000000 ? 1 : 2)
    return `${text.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')}亿`
  }
  if (abs >= 10000) {
    const text = (number / 10000).toFixed(abs >= 1000000 ? 1 : 2)
    return `${text.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')}万`
  }
  return number.toLocaleString('zh-CN', { maximumFractionDigits: 0 })
}

export const formatCompactNumber = compact
export const formatCompactMoney = compact

export const formatBytes = (value) => {
  const bytes = Number(value || 0)
  if (!bytes) return '0 B'
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

export const backupAgeText = (record, now = Date.now()) => {
  if (!record?.createdAt) return '暂无备份记录'
  const ageHours = Math.max(0, Math.round((now - new Date(record.createdAt).getTime()) / 3600000))
  if (ageHours < 24) return `${ageHours || 1} 小时前 / ${record.status || '-'}`
  return `${Math.round(ageHours / 24)} 天前 / ${record.status || '-'}`
}

export const diskSummaryText = (disk) => {
  const mounts = disk?.mounts || []
  if (!mounts.length) return '暂无磁盘数据'
  const target = mounts.find((item) => item.danger) || mounts[0]
  return `${target.mount || target.target} 已用 ${target.usedPercent || 0}% / 剩余 ${formatCompactNumber(target.freeMb || 0)}MB`
}

export const pm2SummaryText = (pm2) => {
  const processes = pm2?.processes || []
  if (!processes.length) return pm2?.error || '暂无 PM2 数据'
  return processes.map((item) => `${item.name}:${item.status}`).join(' / ')
}

export const monitorTypeLabel = (type) => ({ frontend_error: 'JS', resource_error: '资源', api_error: 'API', form_submit_failed: '表单' }[type] || type || '监控')
export const deviceLabel = (device) => ({ desktop: '桌面端', tablet: '平板', mobile: '移动端', unknown: '未知设备' }[device] || device || '未知设备')
export const riskTone = (level) => ({ critical: 'danger', error: 'danger', warning: 'warning' }[level] || 'warning')
export const riskLabel = (item = {}) => ({
  api_5xx: 'API', slow_api: '慢接口', login_failed: '登录', backup_failed: '备份',
  health_check_failed: '健康', frontend_error: '前端', resource_error: '资源', form_submit_failed: '表单'
}[item.type] || (item.level === 'critical' ? '严重' : '提醒'))

export const operationLabel = (row = {}) => {
  const moduleText = {
    products: '产品', articles: '新闻', cms: 'CMS', resources: '资源', crm: '工单',
    security: '安全', config: '配置', system: '系统'
  }[row.module] || row.module || '后台'
  return `${moduleText} / ${row.summary || row.action || '-'}${row.target ? ` / ${row.target}` : ''}`
}
