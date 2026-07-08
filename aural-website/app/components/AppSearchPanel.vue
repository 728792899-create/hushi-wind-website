<template>
  <div class="search-panel w-full max-w-6xl mx-auto flex min-h-0 flex-1 flex-col">
    <div class="relative mb-5 border-b-2 border-zinc-800 pb-4 transition-colors duration-500 focus-within:border-white md:mb-16 md:pb-6">
      <input
        ref="searchInput"
        v-model="query"
        type="text"
        placeholder="搜索产品、新闻、FAQ 或支持资料"
        inputmode="search"
        enterkeyhint="search"
        autocomplete="off"
        autocapitalize="off"
        class="w-full bg-transparent pl-0 pr-14 text-2xl font-bold leading-tight text-white outline-none placeholder:text-zinc-500 sm:text-4xl md:text-7xl"
        @keydown.enter.prevent="submitSearch"
      />
      <button
        v-if="query"
        type="button"
        class="absolute right-0 top-1/2 -translate-y-1/2 text-xs font-bold tracking-[0.2em] text-zinc-500 transition-colors hover:text-white"
        @click="clearQuery"
      >
        清空
      </button>
    </div>

    <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(5rem+env(safe-area-inset-bottom))] pr-1 md:pb-20 md:pr-4">
      <div v-if="!query" class="animate-in slide-in-from-bottom-8 grid grid-cols-1 gap-12 duration-700 lg:grid-cols-3 lg:gap-16">
        <div class="lg:col-span-1">
          <h3 class="search-section-title">热门探索</h3>
          <div v-if="hotTags.length" class="flex flex-wrap gap-3 md:gap-4">
            <button
              v-for="tag in hotTags"
              :key="tag"
              type="button"
              class="rounded-full border border-zinc-800 px-5 py-3 text-xs tracking-widest transition-all hover:bg-white hover:text-black md:text-sm"
              @click="selectHotTag(tag)"
            >
              {{ tag }}
            </button>
          </div>
          <div v-else class="flex flex-wrap gap-3 md:gap-4">
            <button
              v-for="tag in fallbackHotTags"
              :key="tag"
              type="button"
              class="rounded-full border border-zinc-800 px-5 py-3 text-xs tracking-widest transition-all hover:bg-white hover:text-black md:text-sm"
              @click="selectHotTag(tag)"
            >
              {{ tag }}
            </button>
          </div>
        </div>

        <div class="lg:col-span-2">
          <h3 class="search-section-title">推荐入口</h3>
          <div v-if="searchPending && featuredProducts.length === 0" class="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4">
            <NuxtLink
              v-for="item in quickSearchLinks"
              :key="item.to"
              :to="item.to"
              class="search-quick-card"
              @click="closeSearch"
            >
              <span>{{ item.kicker }}</span>
              <strong>{{ item.label }}</strong>
            </NuxtLink>
          </div>
          <div v-else-if="featuredProducts.length > 0" class="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
            <NuxtLink
              v-for="item in featuredProducts"
              :key="item.id"
              :to="`/products/${item.slug || item.id}`"
              class="group search-card"
              @click="trackSearchProductClick(item, 'featured-search-product')"
            >
              <div class="h-20 w-20 flex-shrink-0 overflow-hidden rounded-sm bg-zinc-800 md:h-24 md:w-24">
                <img :src="item.image" :alt="item.title" loading="lazy" decoding="async" sizes="(min-width: 768px) 33vw, 100vw" class="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" @error="imageFallback" />
              </div>
              <div class="min-w-0">
                <span class="font-mono text-[10px] uppercase tracking-widest text-zinc-500">{{ item.category }}</span>
                <h4 class="mt-1 mb-2 line-clamp-2 text-base font-bold text-white transition-colors group-hover:text-blue-400 md:text-lg">{{ item.title }}</h4>
                <span class="border-b border-zinc-700 pb-1 text-xs text-zinc-400">查看详情</span>
              </div>
            </NuxtLink>
          </div>
          <p v-else class="text-sm text-zinc-600">暂无推荐内容，相关产品、资讯和支持内容正在整理中。</p>
        </div>
      </div>

      <div v-else class="animate-in duration-500">
        <div class="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <h4 class="search-section-title mb-0">为您找到 {{ searchResults.length }} 个结果</h4>
          <div v-if="searchResults.length" class="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:flex-wrap">
            <button
              v-for="tab in resultTabs"
              :key="tab.value"
              type="button"
              class="rounded-full border px-3 py-2 text-[10px] font-bold tracking-widest transition-colors"
              :class="activeResultType === tab.value ? 'border-white bg-white text-black' : 'border-zinc-800 text-zinc-400 hover:border-zinc-500 hover:text-white'"
              @click="activeResultType = tab.value"
            >
              {{ tab.label }} {{ tab.count }}
            </button>
          </div>
        </div>

        <div v-if="searchPending && fullSearchRequested && searchResults.length === 0" class="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div v-for="i in 6" :key="i" class="h-28 animate-pulse rounded-sm border border-zinc-800 bg-zinc-900/60"></div>
        </div>

        <div v-else-if="filteredSearchResults.length > 0" class="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8 lg:grid-cols-3">
          <NuxtLink
            v-for="item in filteredSearchResults"
            :key="`${item.type}-${item.id}`"
            :to="searchResultTo(item)"
            class="group search-card border-zinc-800 hover:border-zinc-600"
            @click="trackSearchResultClick(item, 'search-result')"
          >
            <div class="flex h-20 w-20 flex-shrink-0 items-center justify-center overflow-hidden rounded-sm bg-zinc-800">
              <img v-if="item.image" :src="item.image" :alt="item.title" loading="lazy" decoding="async" sizes="(min-width: 768px) 33vw, 72vw" class="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" @error="imageFallback" />
              <span v-else class="text-[10px] font-black tracking-widest text-zinc-500">{{ item.badge }}</span>
            </div>
            <div class="min-w-0">
              <span class="font-mono text-[10px] uppercase tracking-widest text-zinc-500">{{ item.label }} / {{ item.category }}</span>
              <h4 class="mt-1 line-clamp-1 text-base font-bold text-white transition-colors group-hover:text-blue-400">{{ item.title }}</h4>
              <p class="mt-2 line-clamp-1 text-xs text-zinc-500">{{ item.description }}</p>
            </div>
          </NuxtLink>
        </div>

        <div v-else class="py-16 text-center md:py-20">
          <p class="mb-2 text-2xl font-bold text-zinc-400">未找到匹配内容</p>
          <p class="text-zinc-600">换个关键词，或从产品目录、支持中心继续浏览。</p>
          <div class="mt-8 flex flex-wrap justify-center gap-3">
            <NuxtLink to="/products" class="inline-flex bg-white px-6 py-3 text-xs font-bold uppercase tracking-widest text-black transition-colors hover:bg-zinc-200" @click="closeSearch">
              浏览产品
            </NuxtLink>
            <NuxtLink to="/support" class="inline-flex border border-zinc-700 px-6 py-3 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:border-white" @click="closeSearch">
              服务支持
            </NuxtLink>
            <NuxtLink to="/support?type=experience" class="inline-flex border border-zinc-700 px-6 py-3 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:border-white" @click="closeSearch">
              预约试奏
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  initialQuery: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['close'])

const mediaUrl = useMediaUrl()
const brandAssets = useBrandAssets()
const imageFallback = useImageFallback(brandAssets.productPiano)
const { track } = useAuralTrack()
const productsUrl = useApiUrl('/api/products')
const articlesUrl = useApiUrl('/api/articles')
const faqsUrl = useApiUrl('/api/support-faqs')
const downloadsUrl = useApiUrl('/api/support-downloads')
const guidesUrl = useApiUrl('/api/quick-guides')
const pagesUrl = useApiUrl('/api/page-contents')

const query = ref(props.initialQuery || '')
const searchInput = ref(null)
const activeResultType = ref('all')
const fullSearchRequested = ref(false)
let productLoadPromise = null
let fullSearchLoadPromise = null
let searchTrackTimer = null
let lastTrackedSearch = ''

const fallbackHotTags = ['单簧管', '长笛', '萨克斯', '保养', '售后', '预约试奏']
const quickSearchLinks = [
  { label: '产品中心', kicker: 'Collection', to: '/products' },
  { label: '预约试奏', kicker: 'Experience', to: '/support?type=experience' },
  { label: '售后支持', kicker: 'Support', to: '/support' }
]

const { data: productResponse, pending: productsPending, refresh: refreshProducts } = useFetch(productsUrl, {
  lazy: true,
  server: false,
  immediate: false,
  default: () => ({ data: [] })
})
const { data: articleResponse, pending: articlesPending, refresh: refreshArticles } = useFetch(articlesUrl, {
  lazy: true,
  server: false,
  immediate: false,
  default: () => ({ data: [] })
})
const { data: faqResponse, pending: faqsPending, refresh: refreshFaqs } = useFetch(faqsUrl, {
  lazy: true,
  server: false,
  immediate: false,
  default: () => ({ data: [] })
})
const { data: downloadResponse, pending: downloadsPending, refresh: refreshDownloads } = useFetch(downloadsUrl, {
  lazy: true,
  server: false,
  immediate: false,
  default: () => ({ data: [] })
})
const { data: guideResponse, pending: guidesPending, refresh: refreshGuides } = useFetch(guidesUrl, {
  lazy: true,
  server: false,
  immediate: false,
  default: () => ({ data: [] })
})
const { data: pageResponse, pending: pagesPending, refresh: refreshPages } = useFetch(pagesUrl, {
  lazy: true,
  server: false,
  immediate: false,
  default: () => ({ data: [] })
})

const searchPending = computed(() => (
  productsPending.value ||
  articlesPending.value ||
  faqsPending.value ||
  downloadsPending.value ||
  guidesPending.value ||
  pagesPending.value
))

const normalizeRows = (response) => (response.value?.data || []).map((item) => ({ id: item.id, ...(item.attributes || item) }))

const products = computed(() => {
  const fallback = brandAssets.productPiano
  return (productResponse.value?.data || []).map((item) => {
    const attributes = item.attributes || item
    const imagePath = attributes.image?.data?.attributes?.url || attributes.imageUrl
    return {
      id: item.id,
      slug: attributes.slug || '',
      title: attributes.title || '未命名产品',
      category: attributes.series || attributes.categoryName || attributes.type || 'HUSHI WIND',
      description: attributes.description || '',
      type: attributes.type || '',
      featured: Boolean(attributes.isFeatured),
      image: mediaUrl(imagePath, fallback)
    }
  })
})

const hotTags = computed(() => {
  const tags = products.value
    .flatMap((item) => [item.category, item.type, item.title])
    .filter(Boolean)
  return [...new Set(tags)].slice(0, 6)
})

const featuredProducts = computed(() => {
  const featured = products.value.filter((item) => item.featured)
  return (featured.length > 0 ? featured : products.value).slice(0, 4)
})

const productResultsSource = computed(() => products.value.map((item) => ({
  ...item,
  type: 'product',
  label: '产品',
  badge: 'ITEM',
  to: `/products/${item.slug || item.id}`,
  searchable: [item.title, item.category, item.description, item.type]
})))

const articleResultsSource = computed(() => normalizeRows(articleResponse).map((item) => ({
  id: item.id,
  type: 'article',
  label: '新闻',
  badge: 'NEWS',
  title: item.title || '未命名新闻',
  category: item.category || 'News',
  description: item.description || '',
  image: mediaUrl(item.image?.data?.attributes?.url || item.imageUrl, ''),
  slug: item.slug || '',
  to: `/news/${item.id || item.slug}`,
  searchable: [item.title, item.category, item.description]
})))

const faqResultsSource = computed(() => normalizeRows(faqResponse).map((item) => ({
  id: item.id || item.question,
  type: 'faq',
  label: 'FAQ',
  badge: 'FAQ',
  title: item.question || '常见问题',
  category: item.category || 'Support',
  description: item.answer || '',
  to: '/support',
  searchable: [item.question, item.answer, item.category]
})))

const downloadResultsSource = computed(() => normalizeRows(downloadResponse).map((item) => ({
  id: item.id || item.name,
  type: 'download',
  label: '资料',
  badge: 'FILE',
  title: item.name || '支持资料',
  category: item.type || 'Download',
  description: item.size ? `文件大小：${item.size}` : '产品说明、驱动或保养资料',
  to: '/support',
  searchable: [item.name, item.type, item.size]
})))

const guideResultsSource = computed(() => normalizeRows(guideResponse).map((item) => ({
  id: item.id || item.title,
  type: 'guide',
  label: '指南',
  badge: 'GUIDE',
  title: item.title || '快速指南',
  category: item.category || 'Guide',
  description: item.duration ? `视频时长：${item.duration}` : '产品上手和服务指南',
  image: mediaUrl(item.coverUrl, ''),
  to: '/support',
  searchable: [item.title, item.category, item.duration]
})))

const pageResultsSource = computed(() => normalizeRows(pageResponse).map((item) => ({
  id: item.id || item.slug,
  type: 'page',
  label: '页面',
  badge: 'PAGE',
  title: item.title || '品牌页面',
  category: item.slug || 'Info',
  description: String(item.content || '').replace(/\s+/g, ' ').slice(0, 140),
  to: `/info/${item.slug || 'brand-story'}`,
  searchable: [item.title, item.slug, item.content]
})))

const allSearchSources = computed(() => [
  ...productResultsSource.value,
  ...articleResultsSource.value,
  ...faqResultsSource.value,
  ...downloadResultsSource.value,
  ...guideResultsSource.value,
  ...pageResultsSource.value
])

const searchResults = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return []
  return allSearchSources.value.filter((item) => {
    return (item.searchable || [])
      .filter(Boolean)
      .some((field) => String(field).toLowerCase().includes(keyword))
  })
})

const filteredSearchResults = computed(() => {
  if (activeResultType.value === 'all') return searchResults.value
  return searchResults.value.filter((item) => item.type === activeResultType.value)
})

const resultTypeLabels = {
  all: '全部',
  product: '产品',
  article: '新闻',
  faq: 'FAQ',
  download: '资料',
  guide: '指南',
  page: '页面'
}

const resultTabs = computed(() => {
  const counts = searchResults.value.reduce((map, item) => {
    map[item.type] = (map[item.type] || 0) + 1
    return map
  }, { all: searchResults.value.length })
  return Object.keys(resultTypeLabels)
    .map((type) => ({ value: type, label: resultTypeLabels[type], count: counts[type] || 0 }))
    .filter((tab) => tab.value === 'all' || tab.count > 0)
})

const ensureFeaturedData = () => {
  if (productResponse.value?.data?.length) return Promise.resolve()
  if (productLoadPromise) return productLoadPromise
  productLoadPromise = refreshProducts().catch(() => {}).finally(() => {
    productLoadPromise = null
  })
  return productLoadPromise
}

const ensureFullSearchData = () => {
  fullSearchRequested.value = true
  if (fullSearchLoadPromise) return fullSearchLoadPromise
  fullSearchLoadPromise = Promise.all([
    productResponse.value?.data?.length ? Promise.resolve() : refreshProducts(),
    articleResponse.value?.data?.length ? Promise.resolve() : refreshArticles(),
    faqResponse.value?.data?.length ? Promise.resolve() : refreshFaqs(),
    downloadResponse.value?.data?.length ? Promise.resolve() : refreshDownloads(),
    guideResponse.value?.data?.length ? Promise.resolve() : refreshGuides(),
    pageResponse.value?.data?.length ? Promise.resolve() : refreshPages()
  ]).catch(() => {}).finally(() => {
    fullSearchLoadPromise = null
  })
  return fullSearchLoadPromise
}

const closeSearch = () => {
  emit('close')
}

const clearQuery = () => {
  query.value = ''
  activeResultType.value = 'all'
  nextTick(() => searchInput.value?.focus({ preventScroll: true }))
}

const submitSearch = async () => {
  if (query.value.trim().length >= 2) await ensureFullSearchData()
  searchInput.value?.blur()
}

const selectHotTag = (tag) => {
  query.value = tag
  track('cta_click', { ctaName: 'hot-search-tag', searchTerm: tag, metadata: { source: 'search-overlay' } })
}

const trackSearchProductClick = (item, ctaName) => {
  track('cta_click', {
    entityType: 'product',
    entityId: String(item.id),
    entityTitle: item.title,
    searchTerm: query.value.trim(),
    ctaName,
    metadata: { source: 'header-search' }
  })
  closeSearch()
}

const searchResultTo = (item) => ({ path: item.to || '/', query: { fromSearch: query.value.trim() } })

const trackSearchResultClick = (item, ctaName) => {
  const entityType = item.type === 'article' ? 'news' : item.type
  track('cta_click', {
    entityType,
    entityId: String(item.id),
    entityTitle: item.title,
    searchTerm: query.value.trim(),
    ctaName,
    metadata: { source: 'header-search', resultType: item.type, target: item.to }
  })
  closeSearch()
}

watch(query, (value) => {
  if (process.server) return
  const keyword = value.trim()
  activeResultType.value = 'all'
  window.clearTimeout(searchTrackTimer)
  if (!keyword || keyword.length < 2) return
  void ensureFullSearchData()
  searchTrackTimer = window.setTimeout(() => {
    if (keyword === lastTrackedSearch) return
    lastTrackedSearch = keyword
    track('search', {
      searchTerm: keyword,
      metadata: {
        scope: 'global',
        resultCount: searchResults.value.length,
        resultTypes: resultTabs.value.map((tab) => `${tab.value}:${tab.count}`)
      }
    })
  }, 650)
})

watch(() => props.initialQuery, (value) => {
  query.value = value || ''
  if (query.value.trim().length >= 2) void ensureFullSearchData()
})

onMounted(() => {
  nextTick(() => searchInput.value?.focus({ preventScroll: true }))
  if (query.value.trim().length >= 2) {
    void ensureFullSearchData()
  } else {
    void ensureFeaturedData()
  }
})

onBeforeUnmount(() => {
  if (process.client) window.clearTimeout(searchTrackTimer)
})
</script>

<style scoped>
.search-section-title { @apply mb-8 text-xs font-bold uppercase tracking-[0.3em] text-zinc-400; }
.search-card { @apply flex min-h-[7rem] items-center gap-5 rounded-sm border border-transparent bg-zinc-950/20 p-4 transition-all hover:bg-zinc-900 md:gap-6; }
.search-card:hover { transform: translateY(-2px); }
.search-quick-card { @apply flex min-h-[7rem] flex-col justify-between rounded-sm border border-zinc-700 bg-zinc-950/30 p-5 text-white transition-all hover:border-zinc-400 hover:bg-zinc-900; }
.search-quick-card span { @apply font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-400; }
.search-quick-card strong { @apply text-lg font-bold tracking-widest text-white; }
.animate-in { animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
.slide-in-from-bottom-8 { animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #3f3f46; border-radius: 10px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #52525b; }

@media (max-width: 767px) {
  .search-section-title { @apply mb-4 text-[10px]; }
  .search-card {
    min-height: 5.75rem;
    gap: 0.9rem;
    border-color: rgba(39, 39, 42, 0.75);
    padding: 0.85rem;
  }
  .search-card:hover {
    transform: none;
  }
  .search-quick-card {
    min-height: 5.75rem;
    padding: 1rem;
  }
}
</style>
