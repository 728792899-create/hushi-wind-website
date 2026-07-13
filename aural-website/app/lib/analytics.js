export const conversionEvents = Object.freeze({
  productView: 'product_view',
  productSearch: 'product_search',
  productCompare: 'product_compare',
  resourceDownload: 'resource_download',
  inquiryStart: 'inquiry_start',
  inquirySubmit: 'inquiry_submit'
})

const blockedKey = /(^|_)(name|phone|mobile|contact|email|address|message|customer|serial|token|password)($|_)/i

const safeValue = (value, depth = 0) => {
  if (depth > 2 || value === undefined || value === null) return undefined
  if (typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') return value.slice(0, 300)
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safeValue(item, depth + 1)).filter((item) => item !== undefined)
  if (typeof value !== 'object') return undefined
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !blockedKey.test(key))
    .slice(0, 30)
    .map(([key, item]) => [key, safeValue(item, depth + 1)])
    .filter(([, item]) => item !== undefined))
}

export const sanitizeAnalyticsMetadata = (metadata) => safeValue(metadata) || {}

export const isMixpanelAllowed = (storage) => {
  try { return storage?.getItem('hushi:analytics-consent') === 'granted' } catch { return false }
}
