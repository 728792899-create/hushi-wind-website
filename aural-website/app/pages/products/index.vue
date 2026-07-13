<template>
  <div
    class="min-h-screen bg-white text-black font-sans relative"
    :class="selectedCompareProducts.length ? 'pb-52 md:pb-48' : 'pb-24 md:pb-32'"
  >
    <div class="page-back-button fixed top-24 left-4 md:top-32 md:left-12 z-[70] md:z-[100] mix-blend-difference pointer-events-none">
      <button @click="handleBack" class="flex items-center gap-4 text-white hover:scale-105 transition-transform duration-300 group pointer-events-auto cursor-pointer">
        <div class="w-10 h-10 flex items-center justify-center rounded-full border border-white/50 group-hover:border-white transition-colors">
          <svg class="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </div>
        <span class="hidden md:block text-xs font-bold tracking-[0.2em] uppercase">返回</span>
      </button>
    </div>

    <section class="bg-zinc-950 text-white pt-24 pb-11 md:pt-32 md:pb-24 relative overflow-hidden">
      <div class="absolute inset-y-0 right-0 w-1/2 bg-white/5 blur-[120px] pointer-events-none"></div>

      <div class="max-w-7xl mx-auto px-4 relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6 md:gap-8 border-b border-white/10 pb-6 md:pb-8 mt-2 md:mt-4">
        <div>
          <span class="text-[9px] md:text-[10px] text-zinc-500 tracking-[0.28em] md:tracking-[0.35em] uppercase font-bold block mb-3 md:mb-4">The HUSHI WIND Collection</span>
          <h1 class="text-3xl md:text-6xl font-black tracking-[0.04em] md:tracking-[0.06em] uppercase mb-3 md:mb-4">全线产品目录</h1>
          <p class="text-zinc-400 text-sm md:text-base leading-relaxed max-w-2xl">探索每一件声学作品，从原声钢琴到舞台设备，找到适合演奏、创作与现场扩声的方案。</p>
        </div>
        <div class="grid grid-cols-2 gap-5 md:gap-6 text-left md:text-right">
          <div>
            <p class="text-2xl md:text-3xl font-serif italic text-white">{{ products.length }}</p>
            <p class="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Products</p>
          </div>
          <div>
            <p class="text-2xl md:text-3xl font-serif italic text-white">{{ categories.length - 1 }}</p>
            <p class="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Series</p>
          </div>
        </div>
      </div>
    </section>

    <section class="relative z-30 bg-white/95 backdrop-blur-xl border-b border-gray-100 shadow-sm md:sticky md:top-16">
      <div class="max-w-7xl mx-auto px-4 py-3 md:py-3 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        <div class="overflow-x-auto no-scrollbar">
          <div class="flex gap-4 md:gap-7 xl:gap-9 min-w-max">
            <button
              v-for="cat in categories"
              :key="cat.value"
              type="button"
              @click="setCategory(cat.value)"
              class="relative min-h-10 md:min-h-10 rounded-sm py-2 text-[11px] md:text-[11px] font-black tracking-[0.08em] md:tracking-[0.1em] transition-all duration-300"
              :class="activeCategory === cat.value ? 'text-black' : 'text-gray-400 hover:text-black'"
            >
              {{ cat.label }}
              <span class="absolute bottom-0 left-0 h-[2px] bg-black transition-all duration-300" :class="activeCategory === cat.value ? 'w-full' : 'w-0'"></span>
            </button>
          </div>
        </div>

        <div class="flex w-full gap-2 lg:hidden">
          <div class="relative flex-1">
            <input v-model="searchQuery" type="search" inputmode="search" placeholder="搜索产品 / 场景" class="h-11 w-full rounded-xl border border-gray-200 px-4 pr-10 text-sm outline-none transition-all focus:border-black focus:bg-zinc-50" @keyup.enter="syncFiltersToRoute" />
            <button v-if="searchQuery" type="button" class="absolute right-9 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-gray-400 transition-colors hover:text-black" aria-label="清空搜索" @click="searchQuery = ''">&times;</button>
            <svg class="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          <button type="button" class="flex h-11 shrink-0 items-center justify-center rounded-xl border border-black bg-black px-4 text-xs font-black tracking-widest text-white" @click="openFilterDrawer">
            筛选
            <span v-if="activeFilterTags.length" class="ml-2 rounded-full bg-white px-2 py-0.5 text-[10px] text-black">{{ activeFilterTags.length }}</span>
          </button>
        </div>

        <div class="hidden flex-col gap-2 sm:flex-row sm:items-center lg:flex">
          <div class="relative">
            <input v-model="searchQuery" type="search" placeholder="搜索产品 / 参数 / 场景" class="h-10 w-full sm:w-56 xl:w-64 border border-gray-200 px-3 pr-10 text-sm outline-none focus:border-black focus:bg-zinc-50 transition-all" @keyup.enter="syncFiltersToRoute" />
            <button v-if="searchQuery" type="button" class="absolute right-9 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black transition-colors" aria-label="清空搜索" @click="searchQuery = ''">&times;</button>
            <svg class="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          <select v-model="priceFilter" aria-label="价格区间" class="h-10 border border-gray-200 bg-white px-3 text-sm outline-none focus:border-black">
            <option value="all">全部价格</option>
            <option value="consult">咨询报价</option>
            <option value="under10000">1 万以内</option>
            <option value="10000-50000">1-5 万</option>
            <option value="over50000">5 万以上</option>
          </select>
          <select v-model="stockFilter" aria-label="库存状态" class="h-10 border border-gray-200 bg-white px-3 text-sm outline-none focus:border-black">
            <option value="all">全部库存</option>
            <option value="inStock">可咨询体验</option>
            <option value="outStock">待补货</option>
          </select>
          <select v-model="sortMode" aria-label="产品排序" class="h-10 border border-gray-200 bg-white px-3 text-sm outline-none focus:border-black">
            <option value="featured">推荐优先</option>
            <option value="latest">最新更新</option>
            <option value="priceAsc">价格从低到高</option>
            <option value="priceDesc">价格从高到低</option>
          </select>
        </div>
      </div>
    </section>

    <section class="max-w-7xl mx-auto px-4 pt-8 md:pt-16" aria-label="产品结果">
      <div v-if="pending" class="py-32 flex flex-col items-center justify-center text-gray-400">
        <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-black mb-6"></div>
        <p class="text-[10px] tracking-[0.3em] font-bold uppercase">连接产品数据...</p>
      </div>

      <FrontState
        v-else-if="error"
        type="error"
        eyebrow="Data Connection"
        title="产品数据暂时无法加载"
        description="无法连接至胡氏管乐数据中心，请检查后端服务状态，或稍后重新加载产品目录。"
        show-retry
        @retry="refresh"
      />

      <template v-else>
        <div class="flex flex-col md:flex-row md:justify-between md:items-end gap-4 md:gap-5 mb-6 md:mb-8">
          <div>
            <p class="hidden text-xs text-gray-400 tracking-widest uppercase font-bold mb-2 md:block">{{ filteredProducts.length }} results</p>
            <p class="hidden text-sm text-gray-500 leading-relaxed sm:block">{{ filterSummary }}</p>
          </div>
          <div class="flex items-center justify-between gap-3 md:hidden">
            <p class="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-400">已筛选 {{ filteredProducts.length }} 项</p>
            <div class="inline-flex rounded-full border border-zinc-200 bg-zinc-50 p-1">
              <button
                type="button"
                class="h-8 rounded-full px-3 text-[10px] font-black tracking-widest transition-colors"
                :class="mobileViewMode === 'compact' ? 'bg-black text-white' : 'text-zinc-500'"
                @click="mobileViewMode = 'compact'"
              >
                列表
              </button>
              <button
                type="button"
                class="h-8 rounded-full px-3 text-[10px] font-black tracking-widest transition-colors"
                :class="mobileViewMode === 'grid' ? 'bg-black text-white' : 'text-zinc-500'"
                @click="mobileViewMode = 'grid'"
              >
                网格
              </button>
            </div>
          </div>
          <div class="flex flex-wrap gap-2 md:justify-end">
            <span v-for="tag in activeFilterTags" :key="tag" class="px-3 py-2 bg-zinc-100 text-[10px] font-bold tracking-widest text-black uppercase transition-colors hover:bg-zinc-200">{{ tag }}</span>
            <button v-if="hasFilters" type="button" @click="resetFilters" class="text-xs font-bold tracking-widest text-black border-b border-black pb-1 hover:text-zinc-500 hover:border-zinc-400 transition-colors">清除筛选</button>
          </div>
        </div>

        <TransitionGroup
          v-if="filteredProducts.length > 0"
          name="product-grid"
          tag="div"
          class="product-results-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-7 md:gap-y-14 items-stretch"
          :class="mobileViewMode === 'grid' ? 'mobile-grid-mode' : 'mobile-compact-mode'"
          role="list"
          :aria-label="`${filteredProducts.length} 个产品结果`"
        >
          <NuxtLink
            v-for="(product, index) in filteredProducts"
            :key="product.id"
            :to="`/products/${product.slug || product.id}`"
            @click="trackProductClick(product)"
            class="product-tile group cursor-pointer flex h-full flex-col rounded-2xl md:rounded-[1.35rem] p-2 -m-2 transition-all duration-500 hover:bg-white hover:shadow-[0_24px_60px_-32px_rgba(0,0,0,0.45)]"
            role="listitem"
          >
            <div class="product-media relative aspect-[16/10] md:aspect-[4/5] overflow-hidden bg-[#f8f8f8] mb-4 md:mb-6 rounded-2xl md:rounded-[1.15rem]">
              <img
                v-if="product.image"
                :src="product.image"
                :alt="product.title"
                :loading="index < 2 ? 'eager' : 'lazy'"
                :fetchpriority="index < 2 ? 'high' : 'auto'"
                decoding="async"
                sizes="(min-width: 1024px) 25vw, (min-width: 768px) 50vw, 100vw"
                class="w-full h-full object-cover transition-all duration-[800ms] group-hover:scale-105"
                @error="imageFallback"
              />
              <div v-else class="w-full h-full flex flex-col items-center justify-center text-gray-300 bg-gray-50 border border-gray-100">
                <svg class="w-8 h-8 mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <span class="text-[9px] tracking-[0.3em] font-bold">NO IMAGE</span>
              </div>

              <div class="absolute top-3 left-3 md:top-4 md:left-4 flex gap-2">
                <span v-if="product.isFeatured" class="bg-black text-white text-[9px] px-2.5 py-1.5 md:px-3 md:py-2 font-bold tracking-widest uppercase">推荐</span>
                <span v-if="!isProductPublished(product.status)" class="bg-white text-black text-[9px] px-2.5 py-1.5 md:px-3 md:py-2 font-bold tracking-widest uppercase">未上架</span>
              </div>

              <button
                type="button"
                class="product-compare-button absolute right-3 top-3 md:right-4 md:top-4 z-20 min-h-10 md:min-h-11 rounded-full px-3 md:px-4 py-2 text-[10px] font-black tracking-widest shadow-lg backdrop-blur transition-all"
                :class="isCompareSelected(product.id) ? 'bg-black text-white' : 'bg-white/90 text-black hover:bg-black hover:text-white'"
                :aria-pressed="isCompareSelected(product.id)"
                :aria-label="isCompareSelected(product.id) ? `取消对比 ${product.title}` : `加入对比 ${product.title}`"
                @click.prevent.stop="toggleCompare(product)"
              >
                {{ isCompareSelected(product.id) ? '已选' : '对比' }}
              </button>

              <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-500 hidden md:flex items-center justify-center opacity-0 group-hover:opacity-100">
                <span class="bg-black text-white px-8 py-4 text-[10px] font-black tracking-[0.2em] transform translate-y-4 group-hover:translate-y-0 transition-all duration-500">
                  DISCOVER
                </span>
              </div>
            </div>

            <div class="product-card-body flex flex-col flex-grow justify-between">
              <div>
                <div class="flex justify-between items-center gap-4 mb-3 md:mb-4">
                  <p class="text-[9px] text-gray-400 tracking-[0.4em] uppercase font-bold line-clamp-1">
                    {{ product.series || product.type }}
                  </p>
                  <p class="text-[9px] text-gray-400 tracking-[0.2em] uppercase font-bold whitespace-nowrap">
                    库存: <span class="text-black">{{ product.quantity }}</span>
                  </p>
                </div>
                <h3 class="text-base md:text-lg font-black tracking-wider text-black mb-2 md:mb-3 leading-snug group-hover:opacity-60 transition-opacity">
                  {{ product.title }}
                </h3>
                <p class="product-desc text-xs text-gray-500 leading-relaxed line-clamp-2">{{ product.description }}</p>
              </div>
              <div class="product-footer mt-4 md:mt-5 pt-3 md:pt-4 border-t border-gray-100 flex justify-between items-end">
                <p class="text-[13px] font-black text-black tracking-widest">{{ formatPrice(product.price) }}</p>
                <span class="text-[9px] text-gray-400 tracking-[0.2em] uppercase font-bold">详情</span>
              </div>
            </div>
          </NuxtLink>
        </TransitionGroup>

        <FrontState
          v-else
          eyebrow="No Products"
          title="没有找到匹配产品"
          description="可以清除筛选条件查看完整产品目录，或前往支持页面提交具体选型需求。"
          :show-retry="hasFilters"
          @retry="resetFilters"
        />
      </template>
    </section>

    <Transition name="compare-bar">
      <div v-if="selectedCompareProducts.length" class="fixed bottom-4 left-1/2 z-[110] w-[calc(100vw-2rem)] max-w-5xl -translate-x-1/2 rounded-2xl border border-zinc-200 bg-white/95 px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_24px_70px_-28px_rgba(0,0,0,0.45)] backdrop-blur-xl md:px-5 md:pb-4" data-no-scroll-fx>
        <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div class="min-w-0">
            <p class="text-[10px] font-black uppercase tracking-[0.28em] text-zinc-400">Product Compare</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <span v-for="item in selectedCompareProducts" :key="item.id" class="inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3 py-2 text-xs font-bold text-black">
                {{ item.title }}
                <button type="button" class="text-zinc-400 hover:text-black" :aria-label="`移除 ${item.title}`" @click="removeCompare(item.id)">&times;</button>
              </span>
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button type="button" class="min-h-11 border border-zinc-200 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-zinc-500 transition-colors hover:border-black hover:text-black" @click="clearCompare">
              清空
            </button>
            <button type="button" class="min-h-11 flex-1 bg-black px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-zinc-800 disabled:bg-zinc-300 md:flex-none" :disabled="selectedCompareProducts.length < 2" @click="openCompare">
              开始对比 {{ selectedCompareProducts.length }}/3
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <Teleport to="body">
      <Transition name="compare-modal">
        <LazyProductCompareModal
          v-if="isCompareOpen"
          :products="selectedCompareProducts"
          @close="closeCompare"
        />
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="filter-drawer">
        <div v-if="isFilterDrawerOpen" class="fixed inset-0 z-[210] bg-black/50 backdrop-blur-sm lg:hidden" data-no-scroll-fx @keydown.esc="closeFilterDrawer" tabindex="-1">
          <button type="button" class="absolute inset-0 cursor-default" aria-label="关闭筛选" @click="closeFilterDrawer"></button>
          <div class="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-[1.5rem] bg-white px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5 shadow-2xl">
            <div class="mb-5 flex items-center justify-between">
              <div>
                <p class="text-[10px] font-black uppercase tracking-[0.28em] text-zinc-400">Filters</p>
                <h2 class="mt-1 text-xl font-black text-black">筛选产品</h2>
              </div>
              <button type="button" class="flex h-11 w-11 items-center justify-center rounded-full bg-zinc-100 text-2xl leading-none text-zinc-500" aria-label="关闭筛选" @click="closeFilterDrawer">&times;</button>
            </div>

            <div class="space-y-5">
              <div>
                <label class="mb-2 block text-[10px] font-black uppercase tracking-widest text-zinc-400">产品系列</label>
                <div class="grid grid-cols-2 gap-2">
                  <button
                    v-for="cat in categories"
                    :key="`drawer-${cat.value}`"
                    type="button"
                    class="min-h-11 rounded-xl border px-3 py-3 text-xs font-bold transition-colors"
                    :class="activeCategory === cat.value ? 'border-black bg-black text-white' : 'border-zinc-200 bg-white text-zinc-500'"
                    @click="setCategory(cat.value)"
                  >
                    {{ cat.label }}
                  </button>
                </div>
              </div>

              <div class="grid gap-4">
                <label class="flex flex-col gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                  价格区间
                  <select v-model="priceFilter" class="h-12 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-black outline-none focus:border-black">
                    <option value="all">全部价格</option>
                    <option value="consult">咨询报价</option>
                    <option value="under10000">1 万以内</option>
                    <option value="10000-50000">1-5 万</option>
                    <option value="over50000">5 万以上</option>
                  </select>
                </label>
                <label class="flex flex-col gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                  库存状态
                  <select v-model="stockFilter" class="h-12 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-black outline-none focus:border-black">
                    <option value="all">全部库存</option>
                    <option value="inStock">可咨询体验</option>
                    <option value="outStock">待补货</option>
                  </select>
                </label>
                <label class="flex flex-col gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                  排序方式
                  <select v-model="sortMode" class="h-12 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-black outline-none focus:border-black">
                    <option value="featured">推荐优先</option>
                    <option value="latest">最新更新</option>
                    <option value="priceAsc">价格从低到高</option>
                    <option value="priceDesc">价格从高到低</option>
                  </select>
                </label>
              </div>

              <div v-if="activeFilterTags.length" class="flex flex-wrap gap-2">
                <span v-for="tag in activeFilterTags" :key="`drawer-tag-${tag}`" class="rounded-full bg-zinc-100 px-3 py-2 text-[10px] font-bold tracking-widest text-black">{{ tag }}</span>
              </div>
            </div>

            <div class="sticky bottom-0 mt-6 grid grid-cols-2 gap-3 bg-white pt-4">
              <button type="button" class="min-h-12 rounded-xl border border-zinc-200 text-xs font-black tracking-widest text-zinc-500" @click="resetFilters">
                清除筛选
              </button>
              <button type="button" class="min-h-12 rounded-xl bg-black text-xs font-black tracking-widest text-white" @click="closeFilterDrawer">
                查看 {{ filteredProducts.length }} 件
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { conversionEvents } from '../../lib/analytics'
import { filterAndSortProducts, formatProductPrice, normalizeCatalogProduct } from '../../lib/products'

const route = useRoute()
const router = useRouter()
const mediaUrl = useMediaUrl()
const brandAssets = useBrandAssets()
const imageFallback = useImageFallback(brandAssets.productPiano)
const productsUrl = useApiUrl('/api/products')
const { track } = useAuralTrack()
const toast = useState('global-toast', () => ({ show: false, message: '', type: 'success' }))
const smartBack = useSmartBack('/')

const handleBack = () => {
  smartBack()
}

const { data: apiResponse, pending, error, refresh } = await useFetch(productsUrl, {
  key: 'products-index',
  default: () => ({ data: [] })
})

const allowedValues = {
  category: ['all'],
  price: ['all', 'consult', 'under10000', '10000-50000', 'over50000'],
  stock: ['all', 'inStock', 'outStock'],
  sort: ['featured', 'latest', 'priceAsc', 'priceDesc']
}

const readQueryValue = (key, fallback, allowed = null) => {
  const value = typeof route.query[key] === 'string' ? route.query[key] : fallback
  return allowed && !allowed.includes(value) ? fallback : value
}

const pendingCategoryFromRoute = ref(readQueryValue('category', 'all'))
const activeCategory = ref(pendingCategoryFromRoute.value)
const searchQuery = ref(readQueryValue('q', ''))
const priceFilter = ref(readQueryValue('price', 'all', allowedValues.price))
const stockFilter = ref(readQueryValue('stock', 'all', allowedValues.stock))
const sortMode = ref(readQueryValue('sort', 'featured', allowedValues.sort))
const mobileViewMode = ref('compact')
let isRestoringScroll = false
let scrollRestoreTimer = 0

const products = computed(() => (apiResponse.value?.data || []).map((item) => normalizeCatalogProduct(item, mediaUrl)))

const isProductPublished = (status) => ['published', 'active'].includes(status || 'published')

const categories = computed(() => {
  const labels = {
    piano: '原声钢琴',
    guitar: '吉他与贝斯',
    synth: '电子合成器',
    other: '其他设备'
  }
  const dynamic = [...new Set(products.value.map((product) => product.type).filter(Boolean))]
    .map((type) => ({ label: labels[type] || type, value: type }))
  allowedValues.category = ['all', ...dynamic.map((item) => item.value)]
  return [{ label: '全部系列', value: 'all' }, ...dynamic]
})

watch(categories, () => {
  if (!allowedValues.category.includes(activeCategory.value)) {
    activeCategory.value = allowedValues.category.includes(pendingCategoryFromRoute.value) ? pendingCategoryFromRoute.value : 'all'
  }
}, { immediate: true })

const setCategory = (value) => {
  activeCategory.value = value
}

const buildFilterQuery = () => {
  const query = { ...route.query }
  delete query.category
  delete query.q
  delete query.price
  delete query.stock
  delete query.sort

  if (activeCategory.value !== 'all') query.category = activeCategory.value
  if (searchQuery.value.trim()) query.q = searchQuery.value.trim()
  if (priceFilter.value !== 'all') query.price = priceFilter.value
  if (stockFilter.value !== 'all') query.stock = stockFilter.value
  if (sortMode.value !== 'featured') query.sort = sortMode.value
  return query
}

const syncFiltersToRoute = () => {
  router.replace({ path: route.path, query: buildFilterQuery() })
}

watch([activeCategory, priceFilter, stockFilter, sortMode], syncFiltersToRoute)

const filteredProducts = computed(() => filterAndSortProducts(products.value, {
  category: activeCategory.value,
  query: searchQuery.value,
  price: priceFilter.value,
  stock: stockFilter.value,
  sort: sortMode.value
}))

const hasFilters = computed(() => activeCategory.value !== 'all' || searchQuery.value || priceFilter.value !== 'all' || stockFilter.value !== 'all' || sortMode.value !== 'featured')
const selectedCategoryLabel = computed(() => categories.value.find((item) => item.value === activeCategory.value)?.label || '全部系列')
const priceLabels = { all: '全部价格', consult: '咨询报价', under10000: '1 万以内', '10000-50000': '1-5 万', over50000: '5 万以上' }
const stockLabels = { all: '全部库存', inStock: '可咨询体验', outStock: '待补货' }
const sortLabels = { featured: '推荐优先', latest: '最新更新', priceAsc: '价格从低到高', priceDesc: '价格从高到低' }
const activeFilterTags = computed(() => [
  activeCategory.value !== 'all' ? selectedCategoryLabel.value : '',
  priceFilter.value !== 'all' ? priceLabels[priceFilter.value] : '',
  stockFilter.value !== 'all' ? stockLabels[stockFilter.value] : '',
  sortMode.value !== 'featured' ? sortLabels[sortMode.value] : '',
  searchQuery.value ? `关键词：${searchQuery.value}` : ''
].filter(Boolean))
const filterSummary = computed(() => {
  if (!hasFilters.value) return '当前展示全部在售与可咨询产品，默认优先呈现推荐型号。'
  const category = selectedCategoryLabel.value
  const keyword = searchQuery.value ? `，匹配“${searchQuery.value}”` : ''
  return `当前筛选 ${category}${keyword}，按「${sortLabels[sortMode.value]}」排序。`
})

const resetFilters = () => {
  activeCategory.value = 'all'
  searchQuery.value = ''
  priceFilter.value = 'all'
  stockFilter.value = 'all'
  sortMode.value = 'featured'
}

const selectedCompareIds = ref([])
const isCompareOpen = ref(false)
const isFilterDrawerOpen = ref(false)
const compareLimit = 3
useOverlayLock('products-compare', isCompareOpen)
useOverlayLock('products-filter', isFilterDrawerOpen)
const compareOverlayHistory = useOverlayHistory('products-compare', isCompareOpen, () => {
  isCompareOpen.value = false
})
const filterOverlayHistory = useOverlayHistory('products-filter', isFilterDrawerOpen, () => {
  isFilterDrawerOpen.value = false
})

const selectedCompareProducts = computed(() => {
  const productMap = new Map(products.value.map((product) => [String(product.id), product]))
  return selectedCompareIds.value.map((id) => productMap.get(String(id))).filter(Boolean)
})

const isCompareSelected = (id) => selectedCompareIds.value.includes(String(id))

const showToast = (message, type = 'success') => {
  toast.value = { show: true, message, type }
  window.setTimeout(() => { toast.value.show = false }, 3200)
}

const toggleCompare = (product) => {
  const id = String(product.id)
  if (isCompareSelected(id)) {
    selectedCompareIds.value = selectedCompareIds.value.filter((item) => item !== id)
    return
  }
  if (selectedCompareIds.value.length >= compareLimit) {
    showToast('最多选择 3 件产品进行对比。', 'error')
    return
  }
  selectedCompareIds.value = [...selectedCompareIds.value, id]
  track(conversionEvents.productCompare, {
    entityType: 'product',
    entityId: id,
    entityTitle: product.title,
    ctaName: 'product-compare-add',
    metadata: { source: 'product-catalog', stage: 'selection' }
  })
}

const removeCompare = (id) => {
  selectedCompareIds.value = selectedCompareIds.value.filter((item) => item !== String(id))
  if (selectedCompareIds.value.length < 2) isCompareOpen.value = false
}

const clearCompare = () => {
  selectedCompareIds.value = []
  isCompareOpen.value = false
}

const closeCompare = () => {
  compareOverlayHistory.closeViaHistory()
}

const openCompare = () => {
  if (selectedCompareProducts.value.length < 2) {
    showToast('请选择至少 2 件产品再进行对比。', 'error')
    return
  }
  isCompareOpen.value = true
  track(conversionEvents.productCompare, {
    ctaName: 'product-compare-open',
    metadata: {
      source: 'product-catalog',
      stage: 'comparison-opened',
      productIds: selectedCompareProducts.value.map((item) => item.id),
      productTitles: selectedCompareProducts.value.map((item) => item.title)
    }
  })
}

const openFilterDrawer = () => {
  isFilterDrawerOpen.value = true
}

const closeFilterDrawer = () => {
  filterOverlayHistory.closeViaHistory()
}

watch(products, () => {
  const currentIds = new Set(products.value.map((product) => String(product.id)))
  selectedCompareIds.value = selectedCompareIds.value.filter((id) => currentIds.has(id))
})

let searchTrackTimer = null
let lastTrackedSearch = ''

watch(searchQuery, (value) => {
  if (process.server) return
  window.clearTimeout(searchTrackTimer)
  const keyword = value.trim()
  if (!keyword || keyword.length < 2) return
  searchTrackTimer = window.setTimeout(() => {
    if (keyword === lastTrackedSearch) return
    lastTrackedSearch = keyword
    track(conversionEvents.productSearch, {
      searchTerm: keyword,
      metadata: {
        scope: 'products',
        resultCount: filteredProducts.value.length,
        category: activeCategory.value,
        price: priceFilter.value,
        stock: stockFilter.value,
        sort: sortMode.value
      }
    })
  }, 650)
})

const productScrollStorageKey = 'hushi-products-scroll-state'

const saveCatalogState = () => {
  if (process.server) return
  sessionStorage.setItem(productScrollStorageKey, JSON.stringify({
    path: route.fullPath,
    y: window.scrollY || 0,
    timestamp: Date.now()
  }))
}

const restoreCatalogState = () => {
  if (process.server) return
  const rawState = sessionStorage.getItem(productScrollStorageKey)
  if (!rawState) return
  try {
    const state = JSON.parse(rawState)
    if (state.path !== route.fullPath || Date.now() - Number(state.timestamp || 0) > 1000 * 60 * 30) return
    isRestoringScroll = true
    window.setTimeout(() => {
      window.scrollTo({ top: Number(state.y || 0), behavior: 'auto' })
      window.setTimeout(() => { isRestoringScroll = false }, 80)
    }, 120)
  } catch {
    sessionStorage.removeItem(productScrollStorageKey)
  }
}

const trackProductClick = (product) => {
  saveCatalogState()
  track('cta_click', {
    entityType: 'product',
    entityId: String(product.id),
    entityTitle: product.title,
    ctaName: 'catalog-product-card',
    metadata: {
      source: 'product-catalog',
      category: activeCategory.value,
      searchTerm: searchQuery.value.trim()
    }
  })
}

const formatPrice = formatProductPrice

watch(filteredProducts, () => {
  if (process.server || isRestoringScroll) return
  window.clearTimeout(scrollRestoreTimer)
  scrollRestoreTimer = window.setTimeout(() => {
    if (window.scrollY > 420) window.scrollTo({ top: 420, behavior: 'smooth' })
  }, 80)
})

onMounted(() => {
  restoreCatalogState()
})

onBeforeUnmount(() => {
  if (process.client) {
    window.clearTimeout(searchTrackTimer)
    window.clearTimeout(scrollRestoreTimer)
    saveCatalogState()
  }
})

useSiteSeo({
  title: '产品目录 | 胡氏管乐',
  description: '浏览胡氏管乐全线产品，按系列、价格、库存与适用场景筛选原声钢琴、吉他、合成器与专业音频设备。',
  path: '/products'
})

useBreadcrumbSchema(() => [
  { name: '首页', path: '/' },
  { name: '产品中心', path: '/products' }
])
</script>

<style scoped>
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
.product-tile:hover { transform: translateY(-4px); }
.product-grid-enter-active, .product-grid-leave-active { transition: opacity 0.28s ease, transform 0.28s ease; }
.product-grid-enter-from, .product-grid-leave-to { opacity: 0; transform: translateY(12px) scale(0.98); }
.product-grid-move { transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
.compare-bar-enter-active, .compare-bar-leave-active { transition: opacity 0.28s ease, transform 0.28s cubic-bezier(0.16, 1, 0.3, 1); }
.compare-bar-enter-from, .compare-bar-leave-to { opacity: 0; transform: translate(-50%, 18px); }
.compare-modal-enter-active, .compare-modal-leave-active { transition: opacity 0.28s ease; }
.compare-modal-enter-from, .compare-modal-leave-to { opacity: 0; }
.compare-modal-enter-active > div.relative, .compare-modal-leave-active > div.relative { transition: transform 0.34s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.34s ease; }
.compare-modal-enter-from > div.relative, .compare-modal-leave-to > div.relative { transform: translateY(18px) scale(0.98); opacity: 0; }
.filter-drawer-enter-active, .filter-drawer-leave-active { transition: opacity 0.25s ease; }
.filter-drawer-enter-from, .filter-drawer-leave-to { opacity: 0; }
.filter-drawer-enter-active > div:last-child, .filter-drawer-leave-active > div:last-child { transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.filter-drawer-enter-from > div:last-child, .filter-drawer-leave-to > div:last-child { transform: translateY(100%); }
img { -webkit-user-drag: none; }

@media (min-width: 768px) {
  .product-card-body {
    min-height: 13rem;
  }

  .product-card-body h3 {
    min-height: 3.15rem;
    display: -webkit-box;
    overflow: hidden;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .product-desc {
    min-height: 2.7rem;
  }

  .product-footer {
    min-height: 3.2rem;
  }

  .product-media img {
    transform: translateZ(0);
  }
}

@media (max-width: 767px) {
  .product-results-grid {
    gap: 0.75rem;
  }

  .mobile-compact-mode {
    display: flex;
    flex-direction: column;
  }

  .mobile-compact-mode .product-tile {
    min-height: 136px;
    display: grid;
    grid-template-columns: minmax(124px, 38vw) 1fr;
    gap: 0.75rem;
    align-items: stretch;
    padding: 0.55rem;
    margin: 0;
    border: 1px solid rgba(228, 228, 231, 0.9);
    border-radius: 1rem;
    background: #fff;
    box-shadow: 0 12px 32px -28px rgba(0, 0, 0, 0.28);
  }

  .mobile-compact-mode .product-media {
    aspect-ratio: auto;
    width: 100%;
    min-height: 124px;
    height: 100%;
    margin: 0;
    border-radius: 0.85rem;
  }

  .mobile-compact-mode .product-card-body {
    min-width: 0;
    padding: 0.15rem 0.15rem 0.1rem 0;
  }

  .mobile-compact-mode .product-card-body > div:first-child > div:first-child {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.25rem;
    margin-bottom: 0.45rem;
  }

  .mobile-compact-mode .product-card-body h3 {
    margin-bottom: 0.35rem;
    font-size: 0.98rem;
    line-height: 1.25;
    display: -webkit-box;
    overflow: hidden;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .mobile-compact-mode .product-desc {
    display: none;
  }

  .mobile-compact-mode .product-footer {
    margin-top: 0.55rem;
    padding-top: 0.55rem;
  }

  .mobile-compact-mode .product-footer span {
    display: none;
  }

  .mobile-compact-mode .product-compare-button {
    min-height: 1.75rem;
    right: 0.45rem;
    top: 0.45rem;
    padding: 0.35rem 0.55rem;
    font-size: 0.56rem;
    letter-spacing: 0.12em;
    box-shadow: none;
  }

  .mobile-compact-mode .product-media > div.absolute.top-3 {
    left: 0.45rem;
    top: 0.45rem;
  }

  .mobile-compact-mode .product-media > div.absolute.top-3 span {
    padding: 0.3rem 0.45rem;
    font-size: 0.52rem;
  }

  .mobile-grid-mode {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem 0.8rem;
  }

  .mobile-grid-mode .product-tile {
    padding: 0;
    margin: 0;
  }

  .mobile-grid-mode .product-media {
    aspect-ratio: 1 / 1;
    margin-bottom: 0.65rem;
    border-radius: 1rem;
  }

  .mobile-grid-mode .product-card-body h3 {
    font-size: 0.95rem;
    line-height: 1.25;
    margin-bottom: 0.25rem;
    display: -webkit-box;
    overflow: hidden;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .mobile-grid-mode .product-card-body > div:first-child > div:first-child {
    margin-bottom: 0.4rem;
  }

  .mobile-grid-mode .product-desc {
    display: none;
  }

  .mobile-grid-mode .product-footer {
    margin-top: 0.45rem;
    padding-top: 0.45rem;
  }

  .mobile-grid-mode .product-footer span {
    display: none;
  }

  .mobile-grid-mode .product-compare-button {
    min-height: 1.75rem;
    right: 0.45rem;
    top: 0.45rem;
    padding: 0.35rem 0.5rem;
    font-size: 0.52rem;
    box-shadow: none;
  }

  .product-tile:hover {
    transform: none;
  }

  .product-tile img,
  .product-tile:hover img {
    transform: none !important;
  }
}
</style>
