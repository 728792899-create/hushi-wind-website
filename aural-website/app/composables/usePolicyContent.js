import { computed } from 'vue'

const DEFAULT_DATE_LABEL = '2026-05-20'

const normalizeText = (value = '') => String(value || '').replace(/\r/g, '').trim()

const isHeadingLine = (line = '') => /^(?:#{1,3}\s+|[一二三四五六七八九十0-9]+[、.．)]\s+|【.+】$)/.test(line)

const normalizeHeading = (line = '') => {
  const trimmed = String(line || '').trim()
  return trimmed
    .replace(/^#{1,3}\s+/, '')
    .replace(/^[一二三四五六七八九十0-9]+[、.．)]\s+/, '')
    .replace(/^【/, '')
    .replace(/】$/, '')
    .trim()
}

const splitParagraphs = (value = '') => {
  const text = normalizeText(value)
  if (!text) return []

  const blocks = text.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean)
  if (blocks.length > 1) return blocks

  const lines = text.split('\n').map((item) => item.trim()).filter(Boolean)
  if (lines.length > 1) return lines

  const sentences = text.match(/[^。！？!?]+[。！？!?]?/g) || [text]
  const merged = []
  let current = ''

  sentences.forEach((sentence) => {
    const next = sentence.trim()
    if (!next) return
    if (current && `${current}${next}`.length > 220) {
      merged.push(current)
      current = next
      return
    }
    current = `${current}${next}`
  })

  if (current) merged.push(current)
  return merged.length ? merged : [text]
}

const normalizeSections = (sections = []) => sections
  .map((section) => ({
    title: normalizeText(section?.title || ''),
    body: Array.isArray(section?.body)
      ? section.body.map((paragraph) => normalizeText(paragraph)).filter(Boolean)
      : []
  }))
  .filter((section) => section.title || section.body.length)

const parsePolicyContent = (content = '', fallbackTitle = '正文', fallbackSections = []) => {
  const text = normalizeText(content)
  if (!text) return normalizeSections(fallbackSections)

  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  const hasHeadings = lines.some((line) => isHeadingLine(line))

  if (!hasHeadings) {
    return [{
      title: fallbackTitle,
      body: splitParagraphs(text)
    }]
  }

  const sections = []
  let current = null

  const pushCurrent = () => {
    if (current && current.body.length) sections.push(current)
  }

  lines.forEach((line) => {
    if (isHeadingLine(line)) {
      pushCurrent()
      current = {
        title: normalizeHeading(line) || fallbackTitle,
        body: []
      }
      return
    }

    if (!current) {
      current = {
        title: fallbackTitle,
        body: []
      }
    }

    current.body.push(...splitParagraphs(line))
  })

  pushCurrent()
  return normalizeSections(sections.length ? sections : fallbackSections)
}

const extractSummary = (content = '', fallback = '') => {
  const text = normalizeText(content)
  if (!text) return fallback
  const summary = splitParagraphs(text).join(' ').replace(/\s+/g, ' ').trim()
  return summary.slice(0, 140) || fallback
}

const formatDateLabel = (value = '', fallback = DEFAULT_DATE_LABEL) => {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toISOString().slice(0, 10)
}

export const usePolicyContent = async (slug, fallback = {}) => {
  const pageUrl = useApiUrl(`/api/page-contents/${slug}`)
  const { data: rawPage, pending, error, refresh } = await useFetch(pageUrl, {
    lazy: true,
    key: `policy-page-${slug}`
  })

  const pageData = computed(() => rawPage.value?.data || null)
  const content = computed(() => pageData.value?.content || '')
  const title = computed(() => pageData.value?.title || fallback.title || '页面内容')
  const summary = computed(() => extractSummary(content.value, fallback.summary || ''))
  const sections = computed(() => parsePolicyContent(content.value, title.value, fallback.sections || []))
  const updatedAt = computed(() => formatDateLabel(pageData.value?.updatedAt || pageData.value?.createdAt, fallback.updatedAt || DEFAULT_DATE_LABEL))
  const eyebrow = computed(() => fallback.eyebrow || 'Policy')

  return {
    pageData,
    pending,
    error,
    refresh,
    content,
    title,
    summary,
    sections,
    updatedAt,
    eyebrow
  }
}
