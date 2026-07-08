<template>
  <NuxtLayout>
    <div
      class="scroll-progress fixed left-0 top-0 z-[10000] h-[2px] bg-black/80 shadow-[0_0_18px_rgba(0,0,0,0.25)] transition-[width] duration-150 ease-out"
      :class="{ 'is-moving': isScrolling }"
      :style="{ width: `${scrollProgress}%` }"
    ></div>

    <div
      class="scroll-kinetic-layer"
      :class="[`is-${scrollDirection}`, { 'is-moving': isScrolling }]"
      :style="{
        '--scroll-progress': scrollProgress / 100,
        '--scroll-progress-pct': `${scrollProgress}%`,
        '--scroll-velocity': scrollVelocity,
        '--scroll-direction-factor': scrollDirection === 'down' ? 1 : -1,
        '--scroll-wake-y': `${(scrollDirection === 'down' ? 1 : -1) * scrollVelocity * -34}px`,
        '--scroll-edge-y': `${(scrollDirection === 'down' ? 1 : -1) * scrollVelocity * -24}px`
      }"
      aria-hidden="true"
    >
      <div class="scroll-direction-wake"></div>
      <div class="scroll-edge scroll-edge-left">
        <span
          v-for="i in 5"
          :key="`left-${i}`"
          :style="{
            '--line-width': `${10 + (i - 1) * 5}px`,
            '--line-shift': `${(scrollDirection === 'down' ? 1 : -1) * scrollVelocity * (4 + (i - 1) * 2)}px`
          }"
        ></span>
      </div>
      <div class="scroll-edge scroll-edge-right">
        <span
          v-for="i in 5"
          :key="`right-${i}`"
          :style="{
            '--line-width': `${10 + (i - 1) * 5}px`,
            '--line-shift': `${(scrollDirection === 'down' ? 1 : -1) * scrollVelocity * (4 + (i - 1) * 2)}px`
          }"
        ></span>
      </div>
      <div class="scroll-rail"><span></span></div>
      <div class="scroll-sweep"></div>
    </div>

    <NuxtPage />

    <Transition name="toast-slide">
      <div v-if="toast.show" role="status" aria-live="polite" class="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] overflow-hidden flex items-center gap-4 px-6 py-4 pr-12 bg-zinc-900/90 backdrop-blur-xl border border-white/10 text-white shadow-2xl min-w-[320px] max-w-[calc(100vw-2rem)] rounded-sm">
        <div :class="toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'" class="w-2 h-2 rounded-full shadow-[0_0_10px_currentColor]"></div>
        <span class="text-[13px] font-medium tracking-widest">{{ toast.message }}</span>
        <button type="button" class="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors" aria-label="关闭提示" @click="toast.show = false">
          &times;
        </button>
        <span class="toast-meter absolute left-0 bottom-0 h-[2px]" :class="toast.type === 'error' ? 'bg-red-400' : 'bg-green-400'"></span>
      </div>
    </Transition>

    <Transition name="fade">
      <div v-if="isOffline" class="fixed bottom-6 right-6 z-[9999] flex items-center gap-3 px-4 py-2 bg-orange-500/10 border border-orange-500/30 backdrop-blur-md rounded-sm text-orange-500 shadow-lg cursor-help transition-all hover:bg-orange-500/20" title="无法连接到后端服务，部分动态内容可能暂时不可用">
        <span class="relative flex h-2 w-2">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
          <span class="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
        </span>
        <span class="text-[10px] font-bold uppercase tracking-widest">连接异常</span>
      </div>
    </Transition>
  </NuxtLayout>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router'
import { onMounted, onBeforeUnmount, nextTick, ref } from 'vue'

const route = useRoute()
const router = useRouter()
const { track } = useAuralTrack()
useGlobalBusinessSchema()
const toast = useState('global-toast', () => ({ show: false, message: '', type: 'success' }))
const isOffline = useState('global-offline', () => false)
const scrollProgress = ref(0)
const scrollDirection = ref('down')
const scrollVelocity = ref(0)
const isScrolling = ref(false)

if (process.client) {
  window.history.scrollRestoration = 'manual'

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const isCoarsePointer = window.matchMedia('(pointer: coarse)')
  const isCompactViewport = () => window.innerWidth < 768
  const shouldReduceMotion = () => prefersReducedMotion.matches
  const shouldUseCompactMotion = () => isCoarsePointer.matches || isCompactViewport()
  const shouldUseLiteScrollMotion = () => shouldReduceMotion() || shouldUseCompactMotion()
  const getMotionScale = () => (shouldUseCompactMotion() ? 0 : 1)
  let lastScrollY = window.scrollY || 0
  let lastScrollTime = performance.now()
  let scrollFrame = 0
  let scrollStopTimer = 0
  let revealObserver = null
  let scanTimer = 0
  let scanFallbackTimer = 0
  let restoreTimer = 0
  let lastTrackedPath = ''

  const updateRootScrollVars = () => {
    const motionScale = getMotionScale()
    const directionFactor = scrollDirection.value === 'down' ? 1 : -1
    document.documentElement.dataset.scrollDirection = scrollDirection.value
    document.documentElement.style.setProperty('--scroll-progress', String(scrollProgress.value / 100))
    document.documentElement.style.setProperty('--scroll-progress-pct', `${scrollProgress.value}%`)
    document.documentElement.style.setProperty('--scroll-velocity', String(scrollVelocity.value))
    document.documentElement.style.setProperty('--scroll-direction-factor', String(directionFactor))
    document.documentElement.style.setProperty('--scroll-motion-scale', String(motionScale))
    document.documentElement.style.setProperty('--scroll-reveal-nudge', `${scrollVelocity.value * directionFactor * -8 * motionScale}px`)
    document.documentElement.style.setProperty('--scroll-section-nudge', `${scrollVelocity.value * directionFactor * -8 * motionScale}px`)
    document.documentElement.style.setProperty('--scroll-lift-y', `${scrollVelocity.value * directionFactor * -10 * motionScale}px`)
    document.documentElement.style.setProperty('--scroll-lift-soft-y', `${scrollVelocity.value * directionFactor * -5 * motionScale}px`)
    document.documentElement.style.setProperty('--scroll-card-y', `${scrollVelocity.value * directionFactor * -14 * motionScale}px`)
    document.documentElement.style.setProperty('--scroll-card-soft-y', `${scrollVelocity.value * directionFactor * -7 * motionScale}px`)
    document.documentElement.style.setProperty('--scroll-card-scale', String(1 + scrollVelocity.value * 0.012 * motionScale))
    document.documentElement.style.setProperty('--scroll-drift-x', `${scrollVelocity.value * directionFactor * 9 * motionScale}px`)
    document.documentElement.style.setProperty('--scroll-drift-y', `${scrollVelocity.value * -7 * motionScale}px`)
    document.documentElement.style.setProperty('--scroll-drift-soft-x', `${scrollVelocity.value * directionFactor * 5 * motionScale}px`)
    document.documentElement.style.setProperty('--scroll-drift-soft-y', `${scrollVelocity.value * -4 * motionScale}px`)
  }

  const updateScrollState = () => {
    scrollFrame = 0
    if (shouldReduceMotion()) {
      scrollVelocity.value = 0
      isScrolling.value = false
      updateRootScrollVars()
      return
    }
    const currentY = Math.max(0, window.scrollY || 0)
    const now = performance.now()
    const delta = currentY - lastScrollY
    const elapsed = Math.max(16, now - lastScrollTime)
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight

    scrollProgress.value = maxScroll > 0 ? Math.min(100, Math.max(0, (currentY / maxScroll) * 100)) : 0
    if (Math.abs(delta) > 1) scrollDirection.value = delta > 0 ? 'down' : 'up'
    if (shouldUseLiteScrollMotion()) {
      scrollVelocity.value = 0
      isScrolling.value = false
    } else {
      scrollVelocity.value = Math.min(1, Math.abs(delta) / elapsed / 2.2)
      isScrolling.value = true
    }
    updateRootScrollVars()

    clearTimeout(scrollStopTimer)
    if (!shouldUseLiteScrollMotion()) {
      scrollStopTimer = window.setTimeout(() => {
        scrollVelocity.value = 0
        isScrolling.value = false
        updateRootScrollVars()
      }, 140)
    }

    lastScrollY = currentY
    lastScrollTime = now
  }

  const requestScrollUpdate = () => {
    if (!scrollFrame) scrollFrame = window.requestAnimationFrame(updateScrollState)
  }

  const handleGlobalKeydown = (event) => {
    const key = event.key?.toLowerCase()
    const activeTag = document.activeElement?.tagName?.toLowerCase()
    const isTyping = ['input', 'textarea', 'select'].includes(activeTag)

    if ((event.metaKey || event.ctrlKey) && key === 'k') {
      event.preventDefault()
      window.dispatchEvent(new CustomEvent('aural-open-search'))
    }

    if (key === '/' && !isTyping && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault()
      window.dispatchEvent(new CustomEvent('aural-open-search'))
    }
  }

  const revealSelectors = [
    'main [data-scroll-fx]',
    'main .scroll-lift',
    'main .scroll-drift',
    'main .interactive-card',
    'main .product-tile',
    'main .solution-card',
    'main .stat-card'
  ].join(',')

  const setupScrollReveals = () => {
    if (shouldReduceMotion()) {
      revealObserver?.disconnect()
      document.querySelectorAll('.scroll-reveal').forEach((node) => {
        node.classList.add('is-visible')
      })
      return
    }
    revealObserver?.disconnect()

    const nodes = Array.from(document.querySelectorAll(revealSelectors))
      .filter((node) => !node.closest('[data-no-scroll-fx]'))
      .filter((node) => !node.matches('[class*="gsap-"], [class*="animate-in"]'))
      .filter((node) => !node.closest('[class*="gsap-"]'))
      .filter((node) => !(shouldUseCompactMotion() && node.matches('main .scroll-media, main .scroll-drift')))
      .filter((node, index, list) => list.indexOf(node) === index)

    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const isAbove = entry.boundingClientRect.bottom < 0
        entry.target.classList.toggle('is-above', !entry.isIntersecting && isAbove)
        entry.target.classList.toggle('is-below', !entry.isIntersecting && !isAbove)
        entry.target.classList.toggle('is-visible', entry.isIntersecting)
      })
    }, { threshold: 0.16, rootMargin: '0px 0px -8% 0px' })

    nodes.forEach((node, index) => {
      node.classList.add('scroll-reveal')
      node.style.setProperty('--reveal-delay', `${Math.min(index % 8, 7) * 34}ms`)
      node.style.setProperty('--reveal-start-y', `${(scrollDirection.value === 'down' ? 1 : -1) * 42}px`)
      if (!node.style.getPropertyValue('--reveal-depth')) {
        node.style.setProperty('--reveal-depth', String((index % 5) + 1))
      }
      const rect = node.getBoundingClientRect()
      if (rect.top < window.innerHeight * 0.92 && rect.bottom > 0) node.classList.add('is-visible')
      revealObserver.observe(node)
    })
  }

  const scheduleScrollRevealScan = () => {
    clearTimeout(scanTimer)
    clearTimeout(scanFallbackTimer)
    scanTimer = window.setTimeout(setupScrollReveals, 120)
    scanFallbackTimer = window.setTimeout(setupScrollReveals, 700)
  }

  const handleBeforeUnload = () => {
    sessionStorage.setItem('hardRefreshPos', window.scrollY.toString())
    sessionStorage.setItem('hardRefreshPath', window.location.pathname)
  }

  const trackPageView = (path = route.fullPath) => {
    if (!path || path === lastTrackedPath) return
    lastTrackedPath = path
    track('page_view', { pagePath: path })
  }

  router.afterEach((to, from) => {
    if (to.path !== '/' && to.path !== from.path) {
      nextTick(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    }
    nextTick(scheduleScrollRevealScan)
    nextTick(() => trackPageView(to.fullPath))
  })

  onMounted(() => {
    updateScrollState()
    setupScrollReveals()
    window.addEventListener('scroll', requestScrollUpdate, { passive: true })
    window.addEventListener('resize', requestScrollUpdate)
    prefersReducedMotion.addEventListener('change', scheduleScrollRevealScan)
    isCoarsePointer.addEventListener('change', requestScrollUpdate)
    window.addEventListener('keydown', handleGlobalKeydown)
    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('load', scheduleScrollRevealScan)
    trackPageView(route.fullPath)

    const savedPos = sessionStorage.getItem('hardRefreshPos')
    if (savedPos && sessionStorage.getItem('hardRefreshPath') === window.location.pathname) {
      const targetY = parseInt(savedPos, 10)
      const shouldRestoreScroll = window.location.pathname === '/' && targetY > window.innerHeight * 0.5
      if (shouldRestoreScroll) {
        let attempts = 0
        const forceScroll = () => {
          window.scrollTo({ top: targetY, behavior: 'instant' })
          if (Math.abs(window.scrollY - targetY) > 5 && attempts < 10) {
            attempts += 1
            restoreTimer = window.setTimeout(forceScroll, 50)
          }
        }
        restoreTimer = window.setTimeout(forceScroll, 10)
      }
    }
    sessionStorage.removeItem('hardRefreshPos')
    sessionStorage.removeItem('hardRefreshPath')

    scanFallbackTimer = window.setTimeout(setupScrollReveals, 600)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('scroll', requestScrollUpdate)
    window.removeEventListener('resize', requestScrollUpdate)
    prefersReducedMotion.removeEventListener('change', scheduleScrollRevealScan)
    isCoarsePointer.removeEventListener('change', requestScrollUpdate)
    window.removeEventListener('keydown', handleGlobalKeydown)
    window.removeEventListener('beforeunload', handleBeforeUnload)
    window.removeEventListener('load', scheduleScrollRevealScan)
    revealObserver?.disconnect()
    window.cancelAnimationFrame(scrollFrame)
    clearTimeout(scrollStopTimer)
    clearTimeout(scanTimer)
    clearTimeout(scanFallbackTimer)
    clearTimeout(restoreTimer)
  })
}
</script>

<style>
html { scroll-behavior: smooth; }

body {
  text-rendering: optimizeLegibility;
  --scroll-progress: 0;
  --scroll-velocity: 0;
  --scroll-direction-factor: 1;
}

.page-back-button {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

body.mobile-menu-open .page-back-button,
body.search-open .page-back-button,
body.overlay-open .page-back-button {
  opacity: 0;
  pointer-events: none;
  transform: translate3d(-8px, 0, 0);
}

body.mobile-menu-open .mobile-bottom-cta,
body.search-open .mobile-bottom-cta,
body.overlay-open .mobile-bottom-cta {
  opacity: 0;
  pointer-events: none;
  transform: translate3d(0, 100%, 0);
}

:where(a, button, input, select, textarea, [role="button"]) {
  -webkit-tap-highlight-color: transparent;
}

:where(a, button, [role="button"]) {
  touch-action: manipulation;
}

:where(a, button, input, select, textarea):focus-visible {
  outline: 2px solid rgba(17, 17, 17, 0.95);
  outline-offset: 3px;
}

:where(button, a, [role="button"]):active {
  transform: translateY(1px) scale(0.99);
}

.scroll-progress {
  transform-origin: left center;
}

.scroll-progress.is-moving {
  height: 3px;
  box-shadow: 0 0 22px rgba(0, 0, 0, 0.35);
}

.scroll-kinetic-layer {
  position: fixed;
  inset: 0;
  z-index: 45;
  pointer-events: none;
  overflow: hidden;
  opacity: 0;
  transition: opacity 0.25s ease;
}

.scroll-kinetic-layer.is-moving {
  opacity: calc(0.08 + var(--scroll-velocity) * 0.18);
}

.scroll-direction-wake {
  display: none;
}

.scroll-edge {
  position: absolute;
  top: 11vh;
  bottom: 11vh;
  width: 34px;
  display: grid;
  align-content: space-between;
  opacity: calc(var(--scroll-velocity) * 0.42);
  transform: translateY(var(--scroll-edge-y));
  transition: transform 0.24s ease-out, opacity 0.24s ease-out;
}

.scroll-edge-left {
  left: clamp(10px, 1.2vw, 22px);
}

.scroll-edge-right {
  right: clamp(44px, 3.6vw, 72px);
}

.scroll-edge span {
  display: block;
  width: var(--line-width);
  height: 1px;
  margin-left: auto;
  background: rgba(0, 0, 0, 0.2);
  transform: translateX(var(--line-shift));
}

.scroll-edge-left span {
  margin-left: 0;
  margin-right: auto;
}

.scroll-kinetic-layer.is-up .scroll-edge span {
  transform: translateX(var(--line-shift));
}

.scroll-rail {
  position: absolute;
  right: clamp(12px, 1.4vw, 24px);
  top: 14vh;
  width: 1px;
  height: 72vh;
  background: rgba(0, 0, 0, 0.05);
  transform: translateX(calc(var(--scroll-velocity) * -4px));
}

.scroll-rail span {
  position: absolute;
  left: -1px;
  top: min(calc(100% - 78px), var(--scroll-progress-pct));
  width: 3px;
  height: 78px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.38);
  box-shadow: 0 0 14px rgba(0, 0, 0, 0.14);
  transition: top 0.12s linear;
}

.scroll-sweep {
  display: none;
}

.scroll-reveal {
  --reveal-start-y: 34px;
  --reveal-depth: 1;
  opacity: 1;
  filter: none;
  transform: translate3d(0, 18px, 0);
  transition:
    transform 0.72s cubic-bezier(0.16, 1, 0.3, 1) var(--reveal-delay, 0ms);
  will-change: transform;
}

.scroll-reveal.is-above {
  --reveal-start-y: -32px;
}

.scroll-reveal.is-below {
  --reveal-start-y: 42px;
}

.scroll-reveal.is-visible {
  opacity: 1;
  filter: none;
  transform: translate3d(0, var(--scroll-reveal-nudge), 0);
}

main section.scroll-reveal {
  opacity: 1;
  filter: none;
  transform: translate3d(0, var(--scroll-section-nudge), 0);
}

main :where(.scroll-media, .scroll-lift) {
  transform: translate3d(0, var(--scroll-lift-soft-y), 0);
  transition: transform 0.34s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: transform;
}

main :where([class*="gsap-"]) :where(.scroll-media, .scroll-lift),
main :where([class*="gsap-"]).scroll-media,
main :where([class*="gsap-"]).scroll-lift,
main :where([class*="gsap-"]).scroll-drift {
  transform: none;
}

main :where(.scroll-drift) {
  transform: translate3d(var(--scroll-drift-soft-x), var(--scroll-drift-soft-y), 0);
  transition: transform 0.34s cubic-bezier(0.16, 1, 0.3, 1);
  will-change: transform;
}

main :where(.interactive-card, .product-tile, .solution-card, .gsap-card, .gsap-service-card, .gsap-news-card).is-visible {
  transform: translate3d(0, var(--scroll-card-soft-y), 0);
}

html[data-scroll-direction="up"] main :where(.interactive-card, .product-tile, .solution-card, .gsap-card, .gsap-service-card, .gsap-news-card).is-visible {
  transform: translate3d(0, calc(var(--scroll-velocity) * 6px), 0);
}

@media (max-width: 767px), (pointer: coarse) {
  .scroll-kinetic-layer,
  .scroll-rail,
  .scroll-edge {
    display: none;
  }

  .scroll-progress.is-moving {
    height: 2px;
    box-shadow: none;
  }

  main :where(.scroll-media, .scroll-drift) {
    transform: none !important;
  }

  :where(button, a, [role="button"]):active {
    transform: none !important;
  }

  main :where(
    .home-hero-image,
    .gsap-detail-hero-img,
    .gsap-story-hero-img,
    [class*="slowZoom"],
    [class*="group-hover:scale"],
    [class*="hover:scale"],
    [class*="group-hover:-translate"],
    [class*="group-hover:translate"],
    [class*="hover:-translate"]
  ) {
    animation: none !important;
    transform: none !important;
  }

  .page-back-button {
    top: 4.75rem !important;
    left: 0.75rem !important;
    z-index: 70 !important;
  }

  .page-back-button button {
    gap: 0.5rem;
  }

  .page-back-button button > div {
    width: 2.25rem;
    height: 2.25rem;
  }

  main :where(.interactive-card, .product-tile, .solution-card, .gsap-card, .gsap-service-card, .gsap-news-card).is-visible,
  html[data-scroll-direction="up"] main :where(.interactive-card, .product-tile, .solution-card, .gsap-card, .gsap-service-card, .gsap-news-card).is-visible {
    transform: none !important;
  }
}

/* Toast */
.toast-slide-enter-active, .toast-slide-leave-active { transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
.toast-slide-enter-from, .toast-slide-leave-to { opacity: 0; transform: translate(-50%, -20px); backdrop-filter: blur(0px); }
.toast-meter { width: 100%; transform-origin: left; animation: toastMeter 3.5s linear forwards; }
@keyframes toastMeter { from { transform: scaleX(1); } to { transform: scaleX(0); } }

.fade-enter-active, .fade-leave-active { transition: opacity 0.5s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
  }

  .scroll-kinetic-layer { display: none; }
  .scroll-reveal {
    opacity: 1 !important;
    transform: none !important;
    filter: none !important;
  }

  main :where(.scroll-media, .scroll-lift, .scroll-drift) {
    transform: none !important;
  }
}
</style>
