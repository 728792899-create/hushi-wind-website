const normalizeBase = (value, fallback) => String(value || fallback).replace(/\/$/, '')

const fetchRows = async (apiBase, route) => {
  try {
    const result = await $fetch(`${apiBase}${route}`)
    return Array.isArray(result?.data) ? result.data : []
  } catch {
    return []
  }
}

const rowId = (row) => String(row?.id || row?.attributes?.id || '')
const rowSlug = (row) => row?.attributes?.slug || row?.slug || ''

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  if (url.pathname === '/news') {
    const legacyId = url.searchParams.get('id')
    if (legacyId) {
      return sendRedirect(event, `/news/${encodeURIComponent(legacyId)}`, 301)
    }
  }

  const config = useRuntimeConfig(event)
  const apiBase = normalizeBase(config.apiInternalBase || config.public.apiBase, '')

  const productMatch = url.pathname.match(/^\/products\/(\d+)$/)
  if (productMatch) {
    const rows = await fetchRows(apiBase, '/api/products')
    const target = rows.find((row) => rowId(row) === productMatch[1])
    const slug = rowSlug(target)
    if (slug) return sendRedirect(event, `/products/${encodeURIComponent(slug)}`, 301)
  }

  // News detail pages keep numeric IDs as the canonical stable route.
  // Slugs are still accepted by the page, but automatic ID -> slug redirects can
  // collapse different news items when imported content has duplicate slugs.
})
