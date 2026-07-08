<template>
  <div class="bg-white min-h-screen">
    
    <div class="page-back-button fixed top-24 left-4 md:top-32 md:left-12 z-[70] md:z-[100] mix-blend-difference pointer-events-none">
      <button 
        v-if="route.query.source"
        @click="handleBack" 
        class="flex items-center gap-4 text-white hover:scale-105 transition-transform duration-300 group pointer-events-auto"
      >
        <div class="w-10 h-10 flex items-center justify-center rounded-full border border-white/50 group-hover:border-white transition-colors">
          <svg class="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
        </div>
        <span class="hidden md:block text-xs font-bold tracking-[0.2em] uppercase">返回</span>
      </button>
    </div>

    <section class="h-screen relative flex items-center justify-center overflow-hidden bg-black text-white">
      <img :src="brandAssets.brandShowroom" class="absolute inset-0 w-full h-full object-cover opacity-40 gsap-story-hero-img" alt="Heritage" loading="eager" fetchpriority="high" decoding="async" sizes="100vw" />
      <div class="relative z-10 text-center px-4">
        <h1 class="text-5xl md:text-8xl font-serif italic mb-6 gsap-story-text drop-shadow-xl">百年回响</h1>
        <p class="text-xl md:text-2xl tracking-[0.4em] uppercase text-zinc-300 gsap-story-text font-light">HUSHI WIND Brand Story</p>
      </div>
      <div class="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center text-white/50 gsap-story-text">
        <div class="w-[1px] h-16 bg-white/20 overflow-hidden"><div class="w-full h-1/2 bg-white animate-scroll-down"></div></div>
      </div>
    </section>

    <section class="py-32 px-4 max-w-6xl mx-auto space-y-40">
      
      <div v-if="pending" class="text-center py-20 text-gray-400">正在翻阅历史档案...</div>
      
      <template v-else>
        <div 
          v-for="(item, index) in displayTimelines" 
          :key="item.id" 
          class="flex flex-col gap-12 lg:gap-20 items-center gsap-story-section"
          :class="index % 2 !== 0 ? 'md:flex-row-reverse' : 'md:flex-row'"
        >
          <div class="brand-timeline-copy w-full md:w-1/2">
            <span class="text-zinc-400 font-mono tracking-widest text-sm mb-4 block border-b border-zinc-200 pb-2 w-max">{{ item.year }}</span>
            <h2 class="text-4xl lg:text-5xl font-bold mb-8 text-black leading-tight">{{ item.title }}</h2>
            <p class="text-zinc-500 text-lg leading-relaxed">{{ item.desc }}</p>
          </div>
          <div class="brand-timeline-media w-full md:w-1/2 aspect-[4/5] bg-zinc-100 overflow-hidden rounded-sm shadow-xl">
            <img :src="item.image" :alt="item.title" loading="lazy" decoding="async" sizes="(min-width: 1024px) 50vw, 100vw" class="w-full h-full object-cover scale-110 gsap-story-img" />
          </div>
        </div>
      </template>

    </section>

    <section class="py-40 bg-zinc-950 text-white text-center px-4">
      <div class="max-w-4xl mx-auto gsap-story-footer">
        <h2 class="text-4xl md:text-6xl font-bold mb-10 tracking-tight text-white">成为传奇的一部分。</h2>
        <NuxtLink to="/products?source=brand-story" class="inline-block border border-white/30 px-12 py-5 text-sm font-bold tracking-widest uppercase hover:bg-white hover:text-black transition-all duration-300">
          探索全部乐器
        </NuxtLink>
      </div>
    </section>

  </div>
</template>

<script setup>
import { computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

const route = useRoute()
const router = useRouter()
const smartBack = useSmartBack('/')
let ctx;
let animationTimer = 0

const handleBack = () => smartBack()

const mediaUrl = useMediaUrl()
const brandAssets = useBrandAssets()
const timelineUrl = useApiUrl('/api/brand-timelines')

// 🌟 动态拉取 时间轴
const { data: rawTimeline, pending } = await useFetch(timelineUrl, { lazy: true, key: 'timeline' })

const fallbackTimelines = [
  { id: 1, year: '2016', title: '从声学维修与选品服务开始。', desc: '胡氏管乐团队最早服务于本地音乐教室、排练室与演出空间，围绕乐器维护、试奏选型和音频系统调试建立服务标准。', image: brandAssets.brandCraft },
  { id: 2, year: '2022', title: '形成乐器与专业音频一体化体验。', desc: '我们将原声乐器、数字键盘、吉他和现场扩声方案纳入同一套体验流程，让用户从选购到售后都能获得连续支持。', image: brandAssets.brandShowroom },
  { id: 3, year: '2026', title: '建设线上运营与售后支持体系。', desc: '通过产品内容、预约咨询、维修工单和知识库，将线下顾问经验沉淀为可持续运营的企业级服务能力。', image: brandAssets.supportHero }
]

const displayTimelines = computed(() => {
  if (rawTimeline.value?.data?.length > 0) {
    return rawTimeline.value.data.map(item => ({ ...item, image: mediaUrl(item.imageUrl, fallbackTimelines[0].image) }))
  }
  return fallbackTimelines
})

useSiteSeo({
  title: '品牌故事 | 胡氏管乐 HUSHI WIND',
  description: '回顾胡氏管乐 HUSHI WIND 的品牌历程、声学工艺传承与数字技术演进。',
  path: '/info/brand-story',
  image: brandAssets.brandShowroom
})

useBreadcrumbSchema(() => [
  { name: '首页', path: '/' },
  { name: '品牌故事', path: '/info/brand-story' }
])

const initAnimations = () => {
  if (process.server) return
  useGsapCleanup(ctx, ScrollTrigger)

  ctx = gsap.context(() => {
    gsap.registerPlugin(ScrollTrigger)
    gsap.from('.gsap-story-text', { y: 40, opacity: 0, duration: 1.5, stagger: 0.3, ease: 'power3.out' })
    gsap.to('.gsap-story-hero-img', { scale: 1.15, duration: 15, ease: 'none' })

    gsap.utils.toArray('.gsap-story-section').forEach(section => {
      gsap.from(section, { scrollTrigger: { trigger: section, start: 'top 85%' }, y: 60, opacity: 0, duration: 1.2, ease: 'power3.out' })
      const img = section.querySelector('.gsap-story-img')
      if (img) {
        gsap.to(img, { scrollTrigger: { trigger: section, start: 'top bottom', end: 'bottom top', scrub: true }, yPercent: 15, ease: 'none' })
      }
    })
    gsap.from('.gsap-story-footer', { scrollTrigger: { trigger: '.gsap-story-footer', start: 'top 85%' }, y: 40, opacity: 0, duration: 1, ease: 'power3.out' })
    
    // 渲染完 DOM 后强制刷新一次高度侦测
    ScrollTrigger.refresh()
  })
}

onMounted(() => { if (!pending.value) initAnimations() })
watch(pending, (newVal) => {
  if (newVal || process.server) return
  window.clearTimeout(animationTimer)
  animationTimer = window.setTimeout(initAnimations, 100)
})
onBeforeUnmount(() => {
  if (process.client) window.clearTimeout(animationTimer)
  useGsapCleanup(ctx, ScrollTrigger)
})
</script>

<style scoped>
@keyframes scrollDown { 0% { transform: translateY(-100%); } 100% { transform: translateY(200%); } }
.animate-scroll-down { animation: scrollDown 2s cubic-bezier(0.65, 0, 0.35, 1) infinite; }

@media (min-width: 768px) {
  .brand-timeline-copy {
    min-height: 28rem;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .brand-timeline-copy h2 {
    display: -webkit-box;
    overflow: hidden;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
  }

  .brand-timeline-copy p {
    display: -webkit-box;
    overflow: hidden;
    -webkit-line-clamp: 5;
    -webkit-box-orient: vertical;
  }

  .brand-timeline-media {
    height: min(70vh, 34rem);
    aspect-ratio: auto;
  }
}
</style>
