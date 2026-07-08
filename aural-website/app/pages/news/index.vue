<template>
  <div class="bg-white min-h-screen pb-32 relative">
    
    <div class="page-back-button fixed top-24 left-4 md:top-32 md:left-12 z-[70] md:z-[100] mix-blend-difference pointer-events-none">
      <button @click="handleBack" class="flex items-center gap-4 text-white hover:scale-105 transition-transform duration-300 group pointer-events-auto">
        <div class="w-10 h-10 flex items-center justify-center rounded-full border border-white/50 group-hover:border-white transition-colors">
          <svg class="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
        </div>
        <span class="hidden md:block text-xs font-bold tracking-[0.2em] uppercase">返回</span>
      </button>
    </div>

    <div class="max-w-7xl mx-auto px-4 pt-32 mb-20 gsap-fade-up">
      <h1 class="text-6xl md:text-8xl font-serif italic tracking-tighter text-black mb-6">News & Events</h1>
      <p class="text-xl text-gray-500 max-w-2xl font-light">掌握 胡氏管乐 最前沿的声学科技、品牌动向与艺术家访谈。</p>
    </div>

    <div v-if="pending" class="py-40 text-center">
      <div class="w-10 h-10 border-4 border-zinc-100 border-t-black rounded-full animate-spin mx-auto mb-4"></div>
      <p class="text-zinc-400 font-mono text-xs uppercase tracking-widest">Loading Articles...</p>
    </div>

    <FrontState
      v-else-if="error"
      type="error"
      eyebrow="News Connection"
      title="资讯数据暂时无法加载"
      description="无法连接至资讯数据源，请检查后端服务状态，或稍后重新加载。"
      show-retry
      @retry="refresh"
    />

    <div v-else class="max-w-7xl mx-auto px-4">
      <div v-if="allData.length" class="news-filter-panel mb-12 rounded-sm border border-zinc-200 bg-zinc-50/80 p-4 md:mb-16 md:p-6">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div class="min-w-0 flex-1">
            <label class="mb-2 block text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-500" for="news-search-input">搜索资讯</label>
            <div class="relative">
              <input
                id="news-search-input"
                v-model="searchKeyword"
                type="search"
                inputmode="search"
                placeholder="搜索新闻、活动、艺术家访谈"
                class="news-search-field h-11 w-full rounded-sm border border-zinc-200 bg-white px-4 pr-11 text-sm text-zinc-900 outline-none transition-colors focus:border-black"
                @keyup.enter="updateFilterQuery"
              />
              <button
                v-if="searchKeyword"
                type="button"
                class="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-black"
                aria-label="清空新闻搜索"
                @click="searchKeyword = ''"
              >
                &times;
              </button>
            </div>
          </div>

          <div class="news-filter-summary flex shrink-0 items-center justify-between gap-3 text-xs text-zinc-500 lg:justify-end">
            <span class="font-mono uppercase tracking-[0.18em]">{{ filteredNews.length }} Articles</span>
            <button
              v-if="hasActiveFilters"
              type="button"
              class="rounded-full border border-zinc-300 px-3 py-2 text-[11px] font-bold tracking-wider text-zinc-700 transition-colors hover:border-black hover:text-black"
              @click="clearFilters"
            >
              清除筛选
            </button>
          </div>
        </div>

        <div class="mt-5 flex flex-col gap-3 md:flex-row md:items-center">
          <span class="shrink-0 text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-500">分类</span>
          <div class="news-category-strip flex gap-2 overflow-x-auto pb-1">
            <button
              v-for="category in categoryOptions"
              :key="category.value"
              type="button"
              class="news-category-pill shrink-0 rounded-full border px-4 py-2 text-xs font-bold transition-colors"
              :class="activeCategory === category.value ? 'border-black bg-black text-white' : 'border-zinc-200 bg-white text-zinc-600 hover:border-black hover:text-black'"
              @click="selectCategory(category.value)"
            >
              {{ category.label }}
            </button>
          </div>
        </div>
      </div>
      
      <div v-if="displayFeatured" class="mb-24 group gsap-fade-up">
        <NuxtLink
          v-if="!route.query.id"
          :to="newsDetailPath(displayFeatured)"
          @click="trackNewsClick(displayFeatured, 'featured-news-link')"
          class="inline-flex mb-6 text-[10px] font-bold tracking-[0.24em] uppercase text-zinc-500 border-b border-zinc-200 pb-1 hover:text-black hover:border-black transition-colors"
        >
          查看完整资讯
        </NuxtLink>
        <div class="news-featured-media aspect-video md:aspect-[21/9] bg-zinc-100 mb-8 overflow-hidden rounded-sm relative border border-zinc-100 shadow-sm">
          <img :src="displayFeatured.image" :alt="displayFeatured.title" loading="eager" fetchpriority="high" decoding="async" sizes="(min-width: 768px) 55vw, 100vw" class="w-full h-full object-cover" @error="imageFallback" />
          <div class="absolute top-6 left-6 bg-black text-white text-[10px] font-bold uppercase tracking-[0.2em] px-3 py-1">
            {{ displayFeatured.category }}
          </div>
        </div>
        <div class="max-w-4xl">
          <span class="text-sm font-mono text-zinc-400 uppercase tracking-widest mb-4 block">{{ displayFeatured.date }}</span>
          <h2 class="text-3xl md:text-5xl font-bold text-gray-900 leading-tight mb-6">{{ displayFeatured.title }}</h2>
          <p class="text-lg text-gray-500 leading-relaxed line-clamp-3">{{ displayFeatured.desc }}</p>
        </div>
      </div>

      <FrontState
        v-else
        class="mb-24 border border-zinc-100 bg-zinc-50"
        eyebrow="News Center"
        :title="emptyStateTitle"
        :description="emptyStateDescription"
        :show-retry="Boolean(route.query.id) || hasActiveFilters"
        @retry="handleEmptyRetry"
      />

      <div v-if="remainingNews.length > 0" class="border-t border-gray-200 pt-16">
        <h3 class="text-sm font-bold uppercase tracking-widest text-black mb-12">更多资讯</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-x-12 gap-y-16">
          <NuxtLink v-for="news in remainingNews" :key="news.id" :to="newsDetailPath(news)" class="gsap-news-card group block cursor-pointer" @click="trackNewsClick(news, 'news-list-card')">
            <div class="news-card-media aspect-[4/3] bg-zinc-100 mb-6 overflow-hidden rounded-sm relative shadow-sm border border-zinc-100">
              <img :src="news.image" :alt="news.title" loading="lazy" decoding="async" sizes="(min-width: 768px) 33vw, 100vw" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 grayscale group-hover:grayscale-0" @error="imageFallback" />
            </div>
            <span class="text-xs font-mono text-zinc-400 uppercase tracking-wider block mb-3">{{ news.date }}</span>
            <h4 class="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2">{{ news.title }}</h4>
          </NuxtLink>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

const route = useRoute(); const router = useRouter()
const smartBack = useSmartBack('/')
let ctx;
let animationTimer = 0
let searchTrackTimer = 0

const mediaUrl = useMediaUrl()
const brandAssets = useBrandAssets()
const imageFallback = useImageFallback(brandAssets.brandCraft)
const articlesUrl = useApiUrl('/api/articles?populate=*')
const { track } = useAuralTrack()
const { data: strapiNews, pending, error, refresh } = await useFetch(articlesUrl, { lazy: true, key: 'news-index' })

const searchKeyword = ref(typeof route.query.q === 'string' ? route.query.q : '')
const activeCategory = ref(typeof route.query.category === 'string' ? route.query.category : 'all')

const allData = computed(() => {
  if (strapiNews.value?.data && strapiNews.value.data.length > 0) {
    return strapiNews.value.data.map(item => ({
      id: item.id,
      slug: item.attributes.slug || '',
      date: item.attributes.date || item.attributes.createdAt?.split('T')[0] || '',
      title: item.attributes.title || '未命名资讯',
      desc: item.attributes.seoDescription || item.attributes.description || '',
      category: item.attributes.category || 'News',
      image: item.attributes.image?.data ? mediaUrl(item.attributes.image.data.attributes.url) : brandAssets.brandCraft
    }))
  }
  return []
})

const normalizedSearchKeyword = computed(() => searchKeyword.value.trim().toLowerCase())

const categoryOptions = computed(() => {
  const categories = Array.from(new Set(allData.value.map((item) => item.category).filter(Boolean)))
  return [
    { value: 'all', label: '全部资讯' },
    ...categories.map((category) => ({ value: category, label: category }))
  ]
})

const filteredNews = computed(() => {
  const keyword = normalizedSearchKeyword.value
  return allData.value.filter((item) => {
    const matchesCategory = activeCategory.value === 'all' || item.category === activeCategory.value
    if (!matchesCategory) return false
    if (!keyword) return true
    const haystack = [item.title, item.desc, item.category, item.date].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(keyword)
  })
})

const hasActiveFilters = computed(() => Boolean(normalizedSearchKeyword.value) || activeCategory.value !== 'all')

const displayFeatured = computed(() => {
  const hasQueryId = route.query.id !== undefined
  if (!hasQueryId) return filteredNews.value[0]
  const queryId = parseInt(route.query.id)
  return allData.value.find(n => n.id === queryId) || null
})

const newsSeoDescription = computed(() => {
  const desc = String(displayFeatured.value?.desc || '').trim()
  if (desc.length >= 20) return desc
  if (displayFeatured.value?.title) {
    return `阅读胡氏管乐关于${displayFeatured.value.title}的品牌资讯、产品动态、活动信息与艺术家内容。`
  }
  return '浏览胡氏管乐最新品牌资讯、产品发布、活动动态、服务消息与艺术家访谈。'
})

const remainingNews = computed(() => filteredNews.value.filter(n => n.id !== displayFeatured.value?.id))

const emptyStateTitle = computed(() => {
  if (route.query.id) return '未找到这篇资讯'
  if (allData.value.length && hasActiveFilters.value) return '没有找到匹配资讯'
  return '暂无已发布资讯'
})

const emptyStateDescription = computed(() => {
  if (route.query.id) return '可能已隐藏、删除或链接参数不正确。你可以返回资讯中心继续浏览最新内容。'
  if (allData.value.length && hasActiveFilters.value) return '可以清除筛选条件，或尝试使用产品、活动、艺术家等关键词继续搜索。'
  return '品牌资讯内容正在整理中，内容确认后会在资讯中心展示。'
})

const newsDetailPath = (news) => `/news/${news?.id || news?.slug || ''}`

watch([() => route.query.id, allData, pending], ([legacyId]) => {
  if (!legacyId || pending.value) return
  const target = allData.value.find((item) => String(item.id) === String(legacyId))
  if (target) router.replace(newsDetailPath(target))
}, { immediate: true })

watch(() => route.query, (query) => {
  const nextSearch = typeof query.q === 'string' ? query.q : ''
  const nextCategory = typeof query.category === 'string' ? query.category : 'all'
  if (searchKeyword.value !== nextSearch) searchKeyword.value = nextSearch
  if (activeCategory.value !== nextCategory) activeCategory.value = nextCategory
})

const updateFilterQuery = () => {
  if (route.query.id !== undefined) return
  const keyword = searchKeyword.value.trim()
  const nextQuery = { ...route.query }

  if (keyword) nextQuery.q = keyword
  else delete nextQuery.q

  if (activeCategory.value !== 'all') nextQuery.category = activeCategory.value
  else delete nextQuery.category

  const currentKeyword = typeof route.query.q === 'string' ? route.query.q : ''
  const currentCategory = typeof route.query.category === 'string' ? route.query.category : 'all'
  if (currentKeyword === (keyword || '') && currentCategory === activeCategory.value) return

  router.replace({ path: '/news', query: nextQuery })
}

const trackNewsSearch = () => {
  if (process.server) return
  const keyword = normalizedSearchKeyword.value
  if (!keyword && activeCategory.value === 'all') return

  window.clearTimeout(searchTrackTimer)
  searchTrackTimer = window.setTimeout(() => {
    track('search', {
      searchTerm: keyword || activeCategory.value,
      metadata: {
        source: 'news-index',
        category: activeCategory.value,
        resultCount: filteredNews.value.length
      }
    })
  }, 450)
}

watch([searchKeyword, activeCategory], () => {
  updateFilterQuery()
  trackNewsSearch()
})

const selectCategory = (category) => {
  activeCategory.value = category || 'all'
}

const clearFilters = () => {
  searchKeyword.value = ''
  activeCategory.value = 'all'
}

const handleEmptyRetry = () => {
  if (route.query.id) {
    router.replace('/news')
    return
  }
  clearFilters()
}

const handleBack = () => smartBack()

const trackNewsClick = (news, ctaName) => {
  if (!news) return
  track('cta_click', {
    entityType: 'news',
    entityId: String(news.id),
    entityTitle: news.title,
    ctaName,
    metadata: { source: 'news-list', category: news.category }
  })
}

const initAnimations = () => {
  if (process.server) return
  useGsapCleanup(ctx, ScrollTrigger)
  ctx = gsap.context(() => {
    gsap.from('.gsap-fade-up', { y: 40, opacity: 0, duration: 1, stagger: 0.2, ease: 'power3.out' })
    gsap.from('.gsap-news-card', { scrollTrigger: { trigger: '.gsap-news-card', start: 'top 85%' }, y: 40, opacity: 0, duration: 0.8, stagger: 0.15, ease: 'power2.out' })
  })
}

// 🚀 强制回到顶部
onMounted(() => {
  window.scrollTo(0, 0)

  gsap.registerPlugin(ScrollTrigger)
  if (!pending.value) initAnimations()
})

watch(pending, (newVal) => {
  if (newVal || process.server) return
  window.clearTimeout(animationTimer)
  animationTimer = window.setTimeout(initAnimations, 100)
})
onBeforeUnmount(() => {
  if (process.client) {
    window.clearTimeout(animationTimer)
    window.clearTimeout(searchTrackTimer)
  }
  useGsapCleanup(ctx, ScrollTrigger)
})

useSiteSeo({
  title: () => `${displayFeatured.value?.title || '资讯中心'} | 胡氏管乐`,
  description: newsSeoDescription,
  path: '/news',
  image: () => displayFeatured.value?.image
})

useBreadcrumbSchema(() => [
  { name: '首页', path: '/' },
  { name: '新闻动态', path: '/news' }
])
</script>

<style scoped>
.news-filter-panel {
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.04);
}

.news-search-field::-webkit-search-cancel-button {
  display: none;
}

.news-category-strip {
  scrollbar-width: thin;
  scrollbar-color: rgba(24, 24, 27, 0.22) transparent;
}

.news-category-strip::-webkit-scrollbar {
  height: 4px;
}

.news-category-strip::-webkit-scrollbar-thumb {
  background: rgba(24, 24, 27, 0.22);
  border-radius: 999px;
}

@media (min-width: 768px) {
  .news-featured-media {
    max-height: 34rem;
  }

  .news-card-media {
    height: 16rem;
    aspect-ratio: auto;
  }
}

@media (max-width: 767px) {
  .news-filter-panel {
    margin-left: -0.25rem;
    margin-right: -0.25rem;
  }

  .news-category-pill {
    min-height: 2.5rem;
  }

  .news-filter-summary {
    min-height: 2.5rem;
  }
}
</style>
