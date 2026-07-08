<template>
  <div class="bg-white min-h-screen pb-32 relative">
    <div class="page-back-button fixed top-24 left-4 md:top-32 md:left-12 z-[70] md:z-[100] mix-blend-difference pointer-events-none">
      <button @click="handleBack" class="flex items-center gap-4 text-white hover:scale-105 transition-transform duration-300 group pointer-events-auto">
        <div class="w-10 h-10 flex items-center justify-center rounded-full border border-white/50 group-hover:border-white transition-colors">
          <svg class="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </div>
        <span class="hidden md:block text-xs font-bold tracking-[0.2em]">返回</span>
      </button>
    </div>

    <div v-if="pending" class="min-h-screen flex flex-col items-center justify-center text-zinc-400">
      <div class="w-10 h-10 border-4 border-zinc-100 border-t-black rounded-full animate-spin mb-4"></div>
      <p class="font-mono text-xs uppercase tracking-widest">Loading Article...</p>
    </div>

    <FrontState
      v-else-if="error"
      type="error"
      eyebrow="News Connection"
      title="资讯详情暂时无法加载"
      description="无法连接至资讯数据源，请检查后端服务状态，或稍后重新加载。"
      show-retry
      @retry="refresh"
    />

    <FrontState
      v-else-if="!article"
      eyebrow="Article Missing"
      title="未找到这篇资讯"
      description="该内容可能已隐藏、删除或链接已更新。你可以返回资讯中心继续浏览最新内容。"
      :show-retry="false"
    />

    <article v-else class="animate-in">
      <section class="min-h-[64vh] relative flex items-end bg-black overflow-hidden">
        <img :src="article.image" :alt="article.title" loading="eager" fetchpriority="high" decoding="async" sizes="100vw" class="absolute inset-0 w-full h-full object-cover opacity-45" @error="imageFallback" />
        <div class="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/10"></div>
        <div class="relative z-10 max-w-5xl mx-auto w-full px-4 pb-16 md:pb-20 text-white">
          <NuxtLink to="/news" class="mb-6 inline-flex min-h-11 items-center justify-center border border-white/30 bg-white/10 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.22em] text-white backdrop-blur transition-colors hover:border-white hover:bg-white hover:text-black">
            ← 返回资讯中心
          </NuxtLink>
          <p class="text-[10px] font-bold tracking-[0.3em] uppercase text-zinc-400 mb-5">{{ article.category }} / {{ article.date }} / 约 {{ article.readingMinutes }} 分钟阅读</p>
          <h1 class="text-4xl md:text-6xl font-serif italic leading-tight mb-6">{{ article.title }}</h1>
          <p class="text-zinc-300 text-base md:text-lg leading-relaxed max-w-3xl">{{ article.desc }}</p>
        </div>
      </section>

      <section class="news-detail-body max-w-3xl mx-auto px-4 py-16 md:py-24">
        <div class="mb-10 flex flex-wrap items-center gap-3 text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">
          <span>{{ article.category }}</span>
          <span class="h-px w-6 bg-zinc-200"></span>
          <span>{{ article.date }}</span>
          <span class="h-px w-6 bg-zinc-200"></span>
          <span>{{ article.readingMinutes }} min read</span>
        </div>
        <div class="article-prose">
          <template v-for="(block, index) in article.contentBlocks" :key="`${article.id}-${block.type}-${index}`">
            <h2 v-if="block.type === 'heading'">{{ block.text }}</h2>
            <blockquote v-else-if="block.type === 'quote'">{{ block.text }}</blockquote>
            <figure v-else-if="block.type === 'image'">
              <img :src="block.src" :alt="block.alt || article.title" loading="lazy" decoding="async" sizes="(min-width: 768px) 720px, 100vw" @error="imageFallback" />
              <figcaption v-if="block.caption">{{ block.caption }}</figcaption>
            </figure>
            <figure v-else-if="block.type === 'video'" class="article-video">
              <video :src="block.src" controls preload="metadata" playsinline></video>
              <figcaption v-if="block.caption">{{ block.caption }}</figcaption>
            </figure>
            <p v-else :class="index === firstParagraphIndex ? 'article-lead' : ''">{{ block.text }}</p>
          </template>
        </div>
        <div class="mt-12 flex flex-wrap gap-3">
          <button v-if="canNativeShare" type="button" class="article-share-button" @click="shareArticle">系统分享</button>
          <button type="button" class="article-share-button" @click="copyArticleLink">复制链接</button>
          <a :href="`mailto:?subject=${encodeURIComponent(article.title)}&body=${encodeURIComponent(articleUrl)}`" class="article-share-button">邮件分享</a>
        </div>
        <div class="mt-12 pt-8 border-t border-zinc-200 flex flex-col gap-5 sm:flex-row sm:justify-between sm:items-center">
          <NuxtLink to="/news" class="text-xs font-bold tracking-[0.2em] uppercase border-b border-black pb-1 text-black hover:text-gray-500 hover:border-gray-400 transition-colors">
            返回资讯中心
          </NuxtLink>
          <span class="text-[10px] text-zinc-400 uppercase tracking-widest">HUSHI WIND News</span>
        </div>
      </section>

      <section v-if="articleNavigation.prev || articleNavigation.next" class="max-w-6xl mx-auto px-4 pb-16 md:pb-20">
        <div class="grid gap-4 md:grid-cols-2">
          <NuxtLink
            v-if="articleNavigation.prev"
            :to="newsDetailPath(articleNavigation.prev)"
            class="article-nav-card"
          >
            <span>上一篇</span>
            <strong>{{ articleNavigation.prev.title }}</strong>
            <small>{{ articleNavigation.prev.summary }}</small>
          </NuxtLink>
          <div v-else class="hidden md:block"></div>
          <NuxtLink
            v-if="articleNavigation.next"
            :to="newsDetailPath(articleNavigation.next)"
            class="article-nav-card md:text-right"
          >
            <span>下一篇</span>
            <strong>{{ articleNavigation.next.title }}</strong>
            <small>{{ articleNavigation.next.summary }}</small>
          </NuxtLink>
        </div>
      </section>

      <section v-if="relatedArticles.length" class="max-w-6xl mx-auto px-4 pb-20 md:pb-28">
        <div class="mb-8 border-t border-zinc-200 pt-10">
          <p class="mb-3 text-[10px] font-bold uppercase tracking-[0.28em] text-zinc-400">Related Reading</p>
          <h2 class="text-3xl md:text-4xl font-serif italic text-black">继续阅读</h2>
        </div>
        <div class="grid gap-5 md:grid-cols-3">
          <NuxtLink
            v-for="item in relatedArticles"
            :key="item.id"
            :to="newsDetailPath(item)"
            class="group border border-zinc-100 bg-white transition-colors hover:border-black"
          >
            <div class="aspect-[16/10] overflow-hidden bg-zinc-100">
              <img :src="item.image" :alt="item.title" loading="lazy" decoding="async" sizes="(min-width: 768px) 33vw, 100vw" class="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" @error="imageFallback" />
            </div>
            <div class="p-5">
              <p class="mb-3 text-[9px] font-bold uppercase tracking-[0.26em] text-zinc-400">{{ item.category }} / {{ item.date }}</p>
              <h3 class="mb-3 text-lg font-black leading-snug text-black transition-colors group-hover:text-zinc-500">{{ item.title }}</h3>
              <p class="line-clamp-2 text-sm leading-relaxed text-zinc-500">{{ item.summary }}</p>
            </div>
          </NuxtLink>
        </div>
      </section>
    </article>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const mediaUrl = useMediaUrl()
const brandAssets = useBrandAssets()
const imageFallback = useImageFallback(brandAssets.brandCraft)
const siteUrl = useSiteUrl()
const apiBase = useApiBase()
const requestedKey = computed(() => String(route.params.id || '').trim())
const isNumericArticleId = computed(() => /^\d+$/.test(requestedKey.value))
const articlesUrl = useApiUrl('/api/articles?populate=*')
const { track } = useAuralTrack()
const toast = useState('global-toast')
const canNativeShare = ref(false)

const { data: strapiNews, pending: listPending, error: listError, refresh: refreshList } = await useFetch(articlesUrl, {
  lazy: true,
  key: 'news-detail-source',
  default: () => ({ data: [] })
})

const { data: articleDetailResponse, pending: detailPending, error: detailError, refresh: refreshDetail } = await useAsyncData(
  () => `news-detail-direct-${requestedKey.value || 'empty'}`,
  async () => {
    if (!isNumericArticleId.value) return { data: null }
    return await $fetch(`${apiBase.value}/api/articles/${requestedKey.value}`)
  },
  {
    watch: [requestedKey],
    default: () => ({ data: null })
  }
)

const splitParagraphs = (value) => {
  const text = String(value || '').replace(/\r/g, '').trim()
  if (!text) return ['这篇资讯正在整理中，更多内容将陆续补充。']
  const explicitBlocks = text.split(/\n{1,}/).map((item) => item.trim()).filter(Boolean)
  if (explicitBlocks.length > 1) return explicitBlocks

  const sentences = text.match(/[^。！？!?]+[。！？!?]?/g) || [text]
  const blocks = []
  let current = ''
  sentences.forEach((sentence) => {
    const next = sentence.trim()
    if (!next) return
    if (current && `${current}${next}`.length > 180) {
      blocks.push(current)
      current = next
    } else {
      current = `${current}${next}`
    }
  })
  if (current) blocks.push(current)
  return blocks.length ? blocks : [text]
}

const parseImageLine = (line) => {
  const markdown = line.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)$/)
  if (markdown) return { src: markdown[2], alt: markdown[1], caption: markdown[3] || markdown[1] }
  const plainUrl = line.match(/^((?:https?:\/\/|\/uploads\/).+\.(?:jpe?g|png|webp|gif))(?:\s+(.+))?$/i)
  if (plainUrl) return { src: plainUrl[1], alt: plainUrl[2] || '', caption: plainUrl[2] || '' }
  return null
}

const parseVideoLine = (line) => {
  const markdown = line.match(/^@\[(?:video|视频)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)$/i)
  if (markdown) return { src: markdown[1], caption: markdown[2] || '' }
  const plainUrl = line.match(/^((?:https?:\/\/|\/uploads\/)[^\s]+\.(?:mp4|webm|ogg|mov|m4v))(?:\s+(.+))?$/i)
  if (plainUrl) return { src: plainUrl[1], caption: plainUrl[2] || '' }
  return null
}

const parseContentBlocks = (value) => {
  const text = String(value || '').replace(/\r/g, '').trim()
  if (!text) return [{ type: 'paragraph', text: '这篇资讯正在整理中，更多内容将陆续补充。' }]

  const hasRichMarkers = /(^|\n)(#{2,3}\s|>\s|!\[[^\]]*\]\(|@\[video\]\(|@\[视频\]\(|(?:https?:\/\/|\/uploads\/).+\.(?:jpe?g|png|webp|gif|mp4|webm|ogg|mov|m4v))/i.test(text)
  if (!text.includes('\n') && !hasRichMarkers) {
    return splitParagraphs(text).map((paragraph) => ({ type: 'paragraph', text: paragraph }))
  }

  const blocks = []
  let paragraphLines = []
  const flushParagraph = () => {
    const paragraph = paragraphLines.join(' ').replace(/\s+/g, ' ').trim()
    if (paragraph) blocks.push(...splitParagraphs(paragraph).map((item) => ({ type: 'paragraph', text: item })))
    paragraphLines = []
  }

  text.split('\n').forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed) {
      flushParagraph()
      return
    }

    const heading = trimmed.match(/^#{2,3}\s+(.+)$/)
    const image = parseImageLine(trimmed)
    const video = parseVideoLine(trimmed)
    if (heading) {
      flushParagraph()
      blocks.push({ type: 'heading', text: heading[1].trim() })
      return
    }
    if (trimmed.startsWith('>')) {
      flushParagraph()
      blocks.push({ type: 'quote', text: trimmed.replace(/^>\s?/, '').trim() })
      return
    }
    if (image) {
      flushParagraph()
      blocks.push({ type: 'image', src: mediaUrl(image.src, brandAssets.brandCraft), alt: image.alt, caption: image.caption })
      return
    }
    if (video) {
      flushParagraph()
      blocks.push({ type: 'video', src: mediaUrl(video.src), caption: video.caption })
      return
    }

    paragraphLines.push(trimmed)
  })
  flushParagraph()
  return blocks.length ? blocks : [{ type: 'paragraph', text }]
}

const readingMinutes = (value) => {
  const text = String(value || '').replace(/\s+/g, '')
  return Math.max(1, Math.ceil(text.length / 450))
}

const shortSummary = (value, size = 96) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > size ? `${text.slice(0, size)}...` : text
}

const normalizeArticle = (item) => {
  if (!item) return null
  const attrs = item.attributes || item
  const id = item.id || attrs.id
  if (!id) return null
  const imagePath = attrs.image?.data?.attributes?.url || attrs.imageUrl
  const ogImagePath = attrs.ogImageUrl || imagePath
  const body = attrs.description || ''
  const seoDescription = attrs.seoDescription || shortSummary(body, 160)
  return {
    id,
    slug: attrs.slug || '',
    date: attrs.date || attrs.createdAt?.split('T')[0] || '',
    title: attrs.title || '未命名资讯',
    seoTitle: attrs.seoTitle || '',
    seoDescription,
    seoKeywords: attrs.seoKeywords || '',
    desc: seoDescription,
    body,
    paragraphs: splitParagraphs(body),
    contentBlocks: parseContentBlocks(body),
    readingMinutes: readingMinutes(body),
    summary: shortSummary(body),
    category: attrs.category || 'News',
    image: imagePath ? mediaUrl(imagePath) : brandAssets.brandCraft,
    ogImage: ogImagePath ? mediaUrl(ogImagePath) : '',
    updatedAt: attrs.updatedAt || attrs.createdAt || attrs.date || ''
  }
}

const allData = computed(() => {
  if (strapiNews.value?.data && strapiNews.value.data.length > 0) {
    return strapiNews.value.data.map(normalizeArticle).filter(Boolean)
  }
  return []
})

const detailArticle = computed(() => normalizeArticle(articleDetailResponse.value?.data))

const article = computed(() => {
  if (detailArticle.value) return detailArticle.value
  return allData.value.find((item) => item.id.toString() === requestedKey.value || item.slug === requestedKey.value) || null
})
const newsDetailPath = (news) => `/news/${news?.id || news?.slug || ''}`
const currentArticlePath = computed(() => `/news/${requestedKey.value || article.value?.id || ''}`)
const articleUrl = computed(() => article.value ? `${siteUrl.value}${currentArticlePath.value}` : `${siteUrl.value}/news`)
const pending = computed(() => (isNumericArticleId.value ? detailPending.value : listPending.value) && !article.value)
const error = computed(() => {
  if (isNumericArticleId.value && detailError.value && !article.value) return detailError.value
  if (!isNumericArticleId.value && listError.value && !article.value) return listError.value
  return null
})
const chronologicalArticles = computed(() => [...allData.value].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || b.id - a.id))
const articleNavigation = computed(() => {
  if (!article.value) return { prev: null, next: null }
  const index = chronologicalArticles.value.findIndex((item) => item.id === article.value.id)
  if (index < 0) return { prev: null, next: null }
  return {
    prev: chronologicalArticles.value[index + 1] || null,
    next: chronologicalArticles.value[index - 1] || null
  }
})
const relatedArticles = computed(() => {
  if (!article.value) return []
  return allData.value
    .filter((item) => item.id !== article.value.id)
    .map((item) => ({
      ...item,
      score: Number(item.category === article.value.category) * 3 + Number(item.date <= article.value.date)
    }))
    .sort((a, b) => b.score - a.score || String(b.date).localeCompare(String(a.date)))
    .slice(0, 3)
})
const trackedArticleKeys = new Set()
const firstParagraphIndex = computed(() => article.value?.contentBlocks?.findIndex((block) => block.type === 'paragraph') ?? -1)

const refresh = async () => {
  await Promise.all([refreshDetail(), refreshList()])
}

watch(article, (nextArticle) => {
  if (!nextArticle) return
  const trackingKey = `${nextArticle.id}:${nextArticle.slug || route.params.id}`
  if (trackedArticleKeys.has(trackingKey)) return
  trackedArticleKeys.add(trackingKey)
  track('news_view', {
    entityType: 'news',
    entityId: String(nextArticle.id),
    entityTitle: nextArticle.title,
    metadata: { category: nextArticle.category }
  })
}, { immediate: true })

const smartBack = useSmartBack('/news')
const handleBack = () => smartBack()
const copyArticleLink = async () => {
  if (process.server) return
  try {
    await navigator.clipboard.writeText(articleUrl.value)
    toast.value = { show: true, message: '资讯链接已复制。', type: 'success' }
  } catch {
    toast.value = { show: true, message: '复制失败，请手动复制浏览器地址。', type: 'error' }
  }
  window.setTimeout(() => { toast.value.show = false }, 3000)
}

const shareArticle = async () => {
  if (process.server || !navigator.share || !article.value) return
  try {
    await navigator.share({
      title: article.value.title,
      text: article.value.desc || '胡氏管乐新闻动态',
      url: articleUrl.value
    })
    track('cta_click', {
      entityType: 'news',
      entityId: String(article.value.id),
      entityTitle: article.value.title,
      ctaName: 'native-share-news',
      metadata: { source: 'news-detail' }
    })
  } catch {}
}

onMounted(() => {
  canNativeShare.value = Boolean(navigator.share)
})

useSiteSeo({
  title: () => article.value?.seoTitle || `${article.value?.title || '资讯详情'} | 胡氏管乐`,
  description: () => article.value?.seoDescription || article.value?.desc || '浏览胡氏管乐最新品牌资讯、产品发布、活动动态与艺术家访谈。',
  path: () => currentArticlePath.value,
  image: () => article.value?.ogImage || article.value?.image,
  type: 'article'
})

useHead(() => ({
  meta: article.value?.seoKeywords ? [
    { name: 'keywords', content: article.value.seoKeywords }
  ] : []
}))

useHead(() => ({
  script: article.value ? [
    {
      type: 'application/ld+json',
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: article.value.title,
        description: article.value.seoDescription || article.value.desc,
        image: [article.value.ogImage || article.value.image],
        datePublished: article.value.date,
        dateModified: article.value.updatedAt || article.value.date,
        articleSection: article.value.category,
        wordCount: String(article.value.body || article.value.desc || '').replace(/\s+/g, '').length,
        author: { '@type': 'Organization', name: '胡氏管乐 HUSHI WIND' },
        publisher: { '@type': 'Organization', name: '胡氏管乐 HUSHI WIND' },
        url: articleUrl.value,
        mainEntityOfPage: articleUrl.value
      })
    }
  ] : []
}))

useBreadcrumbSchema(() => [
  { name: '首页', path: '/' },
  { name: '新闻动态', path: '/news' },
  { name: article.value?.title || '资讯详情', path: currentArticlePath.value }
])
</script>

<style scoped>
.animate-in { animation: fadeIn 0.7s ease-out forwards; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
.article-prose {
  color: #3f3f46;
  font-size: 1.0625rem;
  line-height: 2;
}
.article-prose p + p {
  margin-top: 1.4rem;
}
.article-prose h2 {
  margin: 3rem 0 1.2rem;
  color: #18181b;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(1.75rem, 4vw, 2.5rem);
  font-style: italic;
  line-height: 1.2;
}
.article-prose blockquote {
  margin: 2.5rem 0;
  border-left: 3px solid #18181b;
  background: #fafafa;
  color: #27272a;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(1.25rem, 3vw, 1.8rem);
  font-style: italic;
  line-height: 1.65;
  padding: 1.5rem 1.75rem;
}
.article-prose figure {
  margin: 2.75rem 0;
}
.article-prose figure img {
  display: block;
  width: 100%;
  max-height: 34rem;
  object-fit: cover;
  border: 1px solid #f4f4f5;
  background: #f4f4f5;
}
.article-prose .article-video {
  border: 1px solid #f4f4f5;
  background: #0a0a0a;
}
.article-prose .article-video video {
  display: block;
  width: 100%;
  max-height: 34rem;
  background: #0a0a0a;
}
.article-prose figcaption {
  margin-top: 0.75rem;
  color: #a1a1aa;
  font-size: 0.75rem;
  line-height: 1.5;
  text-align: center;
}
.article-lead {
  color: #18181b;
  font-size: 1.2rem;
  line-height: 1.9;
}
.article-share-button {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  justify-content: center;
  border: 1px solid #e4e4e7;
  padding: 0.75rem 1rem;
  font-size: 0.625rem;
  font-weight: 800;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #18181b;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}
.article-share-button:hover {
  border-color: #18181b;
  background-color: #fafafa;
}
.article-nav-card {
  display: grid;
  min-height: 10rem;
  align-content: center;
  gap: 0.75rem;
  border: 1px solid #e4e4e7;
  background: #fff;
  padding: 1.5rem;
  color: #18181b;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}
.article-nav-card:hover {
  border-color: #18181b;
  background: #fafafa;
}
.article-nav-card span {
  font-size: 0.625rem;
  font-weight: 800;
  letter-spacing: 0.22em;
  color: #a1a1aa;
}
.article-nav-card strong {
  font-size: 1.15rem;
  line-height: 1.35;
}
.article-nav-card small {
  display: -webkit-box;
  overflow: hidden;
  color: #71717a;
  font-size: 0.875rem;
  line-height: 1.65;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

@media (min-width: 768px) {
  .news-detail-body {
    max-width: 50rem;
  }

  .news-detail-body p {
    line-height: 2.15;
  }
}
</style>
