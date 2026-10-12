export const safeParse = (value, fallback = []) => {
  if (!value) return fallback
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

export const linesToArray = (value) =>
  String(value || '')
    .split('\n')
    .map((v) => v.trim())
    .filter(Boolean)

export const specsToText = (value) =>
  safeParse(value)
    .map((item) => `${item.label || ''}：${item.value || ''}`)
    .join('\n')

export const textToSpecs = (value) =>
  linesToArray(value)
    .map((line) => {
      const [label, ...rest] = line.split(/[:：]/)
      return { label: (label || '').trim(), value: rest.join('：').trim() }
    })
    .filter((item) => item.label && item.value)

export const qualityResult = (items) => {
  const missing = items.filter((item) => !item.ok).map((item) => item.label)
  const score = items.length
    ? Math.round(((items.length - missing.length) / items.length) * 100)
    : 100
  return {
    score,
    type: score >= 85 ? 'success' : score >= 60 ? 'warning' : 'error',
    missing,
  }
}

export const csvEscape = (value) =>
  `"${String(value ?? '').replace(/"/g, '""')}"`

export const downloadTextFile = (
  filename,
  content,
  type = 'text/csv;charset=utf-8;',
) => {
  const blob = new Blob(['\ufeff', content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export const toSlug = (value) => {
  const input = String(value || '')
    .trim()
    .toLowerCase()
  const ascii = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
  if (ascii) return ascii
  return `product-${Date.now().toString(36)}`
}

// 后台统一显示格式，不随浏览器语言变化：时间 2026-09-13 18:04（本地时区），空值 —
const pad = (n) => String(n).padStart(2, '0')
export const formatTime = (value) => {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return '—'
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const money = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  minimumFractionDigits: 2,
})
// ¥12,800.00；空值与非数字显示 —
export const formatMoney = (value) => {
  if (value === null || value === undefined || value === '') return '—'
  const number = Number(value)
  return Number.isFinite(number) ? money.format(number) : '—'
}

export const bytesFromSizeLabel = (size = '') => {
  const text = String(size || '')
    .trim()
    .toLowerCase()
  const number = Number.parseFloat(text)
  if (!Number.isFinite(number)) return 0
  if (text.includes('mb')) return number * 1024 * 1024
  if (text.includes('kb')) return number * 1024
  return number
}
