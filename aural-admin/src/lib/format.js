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

export const linesToArray = (value) => String(value || '').split('\n').map((v) => v.trim()).filter(Boolean)

export const specsToText = (value) => safeParse(value).map((item) => `${item.label || ''}：${item.value || ''}`).join('\n')

export const textToSpecs = (value) => linesToArray(value).map((line) => {
  const [label, ...rest] = line.split(/[:：]/)
  return { label: (label || '').trim(), value: rest.join('：').trim() }
}).filter((item) => item.label && item.value)

export const qualityResult = (items) => {
  const missing = items.filter((item) => !item.ok).map((item) => item.label)
  const score = items.length ? Math.round(((items.length - missing.length) / items.length) * 100) : 100
  return { score, type: score >= 85 ? 'success' : score >= 60 ? 'warning' : 'error', missing }
}

export const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`

export const downloadTextFile = (filename, content, type = 'text/csv;charset=utf-8;') => {
  const blob = new Blob(['\ufeff', content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export const toSlug = (value) => {
  const input = String(value || '').trim().toLowerCase()
  const ascii = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
  if (ascii) return ascii
  return `product-${Date.now().toString(36)}`
}

export const formatTime = (value) => value ? new Date(value).toLocaleString() : '-'

export const bytesFromSizeLabel = (size = '') => {
  const text = String(size || '').trim().toLowerCase()
  const number = Number.parseFloat(text)
  if (!Number.isFinite(number)) return 0
  if (text.includes('mb')) return number * 1024 * 1024
  if (text.includes('kb')) return number * 1024
  return number
}
