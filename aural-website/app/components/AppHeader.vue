<template>
  <header
    class="sticky top-0 z-[180] w-full transition-all duration-300 will-change-transform"
    :class="[
      isScrolled ? 'bg-white/90 backdrop-blur-xl border-b border-gray-200/80 shadow-[0_10px_30px_-24px_rgba(0,0,0,0.35)]' : 'bg-white/95 backdrop-blur-sm border-b border-gray-100',
      isHeaderHidden ? '-translate-y-full' : 'translate-y-0'
    ]"
  >
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center transition-[height] duration-300" :class="isScrolled ? 'h-14' : 'h-16'">
        <NuxtLink to="/" class="text-2xl font-serif font-bold tracking-widest text-black uppercase transition-all duration-300 hover:tracking-[0.18em]" @click="closeMobileMenu">
          胡氏管乐
        </NuxtLink>

        <nav class="hidden md:flex space-x-10" aria-label="主导航">
          <NuxtLink v-for="item in navItems" :key="item.to" :to="item.to" class="nav-link">{{ item.label }}</NuxtLink>
        </nav>

        <div class="flex items-center gap-3 text-sm">
          <button @click="openSearch" class="search-trigger flex h-11 items-center gap-2 rounded-full px-3 font-medium text-gray-600 transition-colors hover:text-black" aria-label="打开搜索">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <span class="hidden sm:inline">搜索</span>
            <kbd class="hidden lg:inline-flex items-center rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-bold text-zinc-400">/</kbd>
          </button>

          <button @click="toggleMobileMenu" class="md:hidden w-10 h-10 flex items-center justify-center rounded-full border border-gray-200 text-black transition-all hover:border-black hover:bg-black hover:text-white" :aria-expanded="isMobileMenuOpen" :aria-label="isMobileMenuOpen ? '关闭菜单' : '打开菜单'">
            <span class="relative block w-5 h-4">
              <span class="absolute left-0 top-0 h-[2px] w-full bg-current transition-transform" :class="isMobileMenuOpen ? 'translate-y-[7px] rotate-45' : ''"></span>
              <span class="absolute left-0 top-[7px] h-[2px] w-full bg-current transition-opacity" :class="isMobileMenuOpen ? 'opacity-0' : 'opacity-100'"></span>
              <span class="absolute left-0 bottom-0 h-[2px] w-full bg-current transition-transform" :class="isMobileMenuOpen ? '-translate-y-[7px] -rotate-45' : ''"></span>
            </span>
          </button>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <Transition name="mobile-menu">
        <div
          v-if="isMobileMenuOpen"
          class="mobile-menu-overlay fixed inset-0 z-[230] flex h-[100dvh] flex-col overflow-hidden bg-white text-black md:hidden"
          style="position: fixed; inset: 0; width: 100vw; height: 100dvh; z-index: 230;"
          role="dialog"
          aria-modal="true"
          aria-label="移动导航菜单"
          @keydown.esc="closeMobileMenuWithHistory"
        >
          <div class="flex h-20 shrink-0 items-center justify-between border-b border-zinc-100 px-4 pt-[env(safe-area-inset-top)]">
            <NuxtLink to="/" class="text-2xl font-serif font-bold tracking-widest uppercase" @click="closeMobileMenu">
              胡氏管乐
            </NuxtLink>
            <div class="flex items-center gap-3">
              <button type="button" class="flex h-11 w-11 items-center justify-center rounded-full text-zinc-500" aria-label="打开搜索" @click="openSearch">
                <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </button>
              <button type="button" class="flex h-14 w-14 items-center justify-center rounded-full bg-black text-white" aria-label="关闭菜单" @click="closeMobileMenuWithHistory">
                <span class="text-5xl font-light leading-none">&times;</span>
              </button>
            </div>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto px-4 py-6 pb-[calc(2rem+env(safe-area-inset-bottom))]">
            <div class="grid grid-cols-2 gap-3">
              <NuxtLink to="/products" class="mobile-quick-link bg-black text-white" @click="closeMobileMenu">
                产品中心
              </NuxtLink>
              <NuxtLink to="/support?type=experience" class="mobile-quick-link border border-zinc-200 text-black" @click="closeMobileMenu">
                预约试奏
              </NuxtLink>
              <NuxtLink to="/support" class="mobile-quick-link border border-zinc-200 text-black" @click="closeMobileMenu">
                售后支持
              </NuxtLink>
              <button type="button" class="mobile-quick-link border border-zinc-200 text-left text-black" @click="openSearch">
                全站搜索
              </button>
            </div>

            <nav class="mt-9 flex flex-col gap-1" aria-label="移动导航">
              <NuxtLink v-for="item in navItems" :key="item.to" :to="item.to" class="mobile-link" @click="closeMobileMenu">
                {{ item.label }}
              </NuxtLink>
            </nav>
          </div>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="search-fade">
        <div
          v-if="isSearchOpen"
          class="mobile-search-overlay fixed inset-0 z-[240] flex h-[100dvh] flex-col overflow-hidden bg-zinc-950/96 px-4 pb-[env(safe-area-inset-bottom)] pt-[calc(0.75rem+env(safe-area-inset-top))] text-white backdrop-blur-2xl md:px-12 md:pb-12 md:pt-12"
          role="dialog"
          aria-modal="true"
          aria-label="全站搜索"
          @keydown.esc="closeSearchWithHistory"
        >
          <div class="mx-auto flex w-full max-w-6xl shrink-0 items-center justify-between gap-3 pb-4 md:pb-12">
            <button
              type="button"
              @click="closeSearchWithHistory"
              class="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 text-xs font-bold tracking-[0.18em] text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="关闭搜索"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 19l-7-7 7-7" /></svg>
              返回
            </button>
            <p class="text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600 md:hidden">Search</p>
            <button
              type="button"
              @click="closeSearchWithHistory"
              class="hidden h-12 w-12 items-center justify-center rounded-full text-4xl leading-none text-zinc-500 transition-all duration-300 hover:rotate-90 hover:bg-white/10 hover:text-white md:flex"
              aria-label="关闭搜索"
            >
              &times;
            </button>
          </div>
          <LazyAppSearchPanel v-if="isSearchOpen" :initial-query="initialSearchQuery" @close="closeSearch" />
        </div>
      </Transition>
    </Teleport>
  </header>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const { track } = useAuralTrack()

const navItems = [
  { label: '产品中心', to: '/products' },
  { label: '专业音响', to: '/audio' },
  { label: '艺术家', to: '/artists' },
  { label: '服务支持', to: '/support' }
]

const isSearchOpen = ref(false)
const isMobileMenuOpen = ref(false)
const isScrolled = ref(false)
const isHeaderHidden = ref(false)
const initialSearchQuery = ref('')
useOverlayLock('header-search', isSearchOpen, { className: 'search-open' })
useOverlayLock('mobile-menu', isMobileMenuOpen, { className: 'mobile-menu-open' })
const closeMobileMenuHistory = useOverlayHistory('mobile-menu', isMobileMenuOpen, () => {
  isMobileMenuOpen.value = false
})
const closeSearchHistory = useOverlayHistory('header-search', isSearchOpen, () => {
  isSearchOpen.value = false
  initialSearchQuery.value = ''
})

const openSearch = async () => {
  isSearchOpen.value = true
  isMobileMenuOpen.value = false
  track('cta_click', { ctaName: 'open-search', metadata: { source: 'header' } })
}

const closeSearch = () => {
  closeSearchHistory.closeDirect()
}

const closeSearchWithHistory = () => {
  closeSearchHistory.closeViaHistory()
}

const toggleMobileMenu = () => {
  isMobileMenuOpen.value = !isMobileMenuOpen.value
}

const closeMobileMenu = () => {
  closeMobileMenuHistory.closeDirect()
}

const closeMobileMenuWithHistory = () => {
  closeMobileMenuHistory.closeViaHistory()
}

let lastHeaderScrollY = 0
const handleScroll = () => {
  const currentY = Math.max(0, window.scrollY || 0)
  const delta = currentY - lastHeaderScrollY
  isScrolled.value = currentY > 16

  if (!isSearchOpen.value && !isMobileMenuOpen.value) {
    if (delta > 8 && currentY > 140) isHeaderHidden.value = true
    if (delta < -8 || currentY < 80) isHeaderHidden.value = false
  }

  lastHeaderScrollY = currentY
}

const handleOpenSearchEvent = () => {
  openSearch()
}

watch(() => route.fullPath, (newVal, oldVal) => {
  closeMobileMenu()
  if (route.query.openSearch) return
  if (oldVal?.includes('openSearch=') && !newVal.includes('openSearch=')) return
  closeSearch()
})

watch(() => route.query.openSearch, (newVal) => {
  if (newVal) {
    initialSearchQuery.value = String(newVal)
    isSearchOpen.value = true
    if (!process.client) return
    setTimeout(() => {
      const q = { ...route.query }
      delete q.openSearch
      router.replace({ query: q })
    }, 0)
  }
}, { immediate: true })

onMounted(() => {
  handleScroll()
  window.addEventListener('scroll', handleScroll, { passive: true })
  window.addEventListener('aural-open-search', handleOpenSearchEvent)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', handleScroll)
  window.removeEventListener('aural-open-search', handleOpenSearchEvent)
})
</script>

<style scoped>
.nav-link { @apply relative text-xs font-bold uppercase tracking-widest text-gray-400 hover:text-black transition-colors py-2; }
.nav-link::after { content: ""; position: absolute; left: 0; bottom: 0; height: 2px; width: 100%; background: #000; transform: scaleX(0); transform-origin: right; transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
.nav-link:hover::after, .nav-link.router-link-active::after { transform: scaleX(1); transform-origin: left; }
.nav-link.router-link-active { @apply text-black; }
.mobile-link { @apply block px-2 py-4 text-sm font-bold tracking-[0.2em] text-black border-b border-gray-100; }
.mobile-quick-link { @apply flex min-h-14 items-center justify-center rounded-2xl px-4 py-4 text-xs font-black tracking-[0.22em] transition-all active:scale-[0.98]; }
.search-trigger:hover { box-shadow: inset 0 0 0 1px rgba(0,0,0,0.08); }

.mobile-menu-enter-active,
.mobile-menu-leave-active { transition: opacity 0.28s ease, transform 0.32s cubic-bezier(0.16, 1, 0.3, 1); }
.mobile-menu-enter-from,
.mobile-menu-leave-to { opacity: 0; transform: translateY(-12px); }

.search-fade-enter-active,
.search-fade-leave-active { transition: opacity 0.34s ease, transform 0.34s cubic-bezier(0.16, 1, 0.3, 1); }
.search-fade-enter-from,
.search-fade-leave-to { opacity: 0; transform: translateY(-8px); backdrop-filter: blur(0px); }

.mobile-search-overlay {
  background:
    radial-gradient(circle at 18% 18%, rgba(255, 255, 255, 0.08), transparent 32rem),
    radial-gradient(circle at 78% 74%, rgba(255, 255, 255, 0.06), transparent 26rem),
    rgba(9, 9, 11, 0.98) !important;
  color: #fff !important;
  overscroll-behavior: contain;
  touch-action: pan-y;
}

.mobile-search-overlay :deep(input),
.mobile-search-overlay :deep(button),
.mobile-search-overlay :deep(a),
.mobile-search-overlay :deep(p),
.mobile-search-overlay :deep(span),
.mobile-search-overlay :deep(strong),
.mobile-search-overlay :deep(h3),
.mobile-search-overlay :deep(h4) {
  text-shadow: none;
}

.mobile-menu-overlay {
  overscroll-behavior: contain;
  touch-action: pan-y;
}

</style>
