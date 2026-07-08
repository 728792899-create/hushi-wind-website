<template>
  <div class="min-h-screen bg-[#fbfbfd] text-black selection:bg-black selection:text-white overflow-x-hidden">
    
    <section class="home-hero relative min-h-[calc(100dvh-4rem)] md:h-screen flex flex-col justify-center items-center text-center px-4 overflow-hidden bg-black" data-scroll-fx>
      <div class="home-hero-media absolute inset-0 z-0">
        <img v-if="sysConfig.heroImageUrl" :src="mediaUrl(sysConfig.heroImageUrl)" alt="胡氏管乐" loading="eager" fetchpriority="high" decoding="async" sizes="100vw" class="home-hero-image w-full h-full object-cover opacity-80 md:scale-105 md:animate-[slowZoom_20s_ease-in-out_infinite_alternate]" @error="heroFallback" />
        <div v-else class="home-hero-image w-full h-full bg-zinc-900 md:scale-105"></div>
        <div class="absolute inset-0 bg-gradient-to-b from-black/50 via-black/25 to-transparent"></div>
        <div class="absolute inset-x-0 bottom-0 h-[22vh] bg-gradient-to-b from-transparent to-[#fbfbfd]"></div>
      </div>
      
      <div class="home-hero-content relative z-10 w-full max-w-5xl mx-auto pt-6 md:pt-20">
        <h1 class="gsap-hero home-hero-title text-[clamp(1.82rem,8.7vw,2.55rem)] md:text-8xl lg:text-[7rem] font-serif italic tracking-normal md:tracking-tighter mb-4 md:mb-8 text-white drop-shadow-2xl leading-[1.2] md:leading-none">
          <span v-for="(line, index) in heroTitleLines" :key="`${line}-${index}`" class="home-hero-title-line block md:inline">{{ line }}</span>
        </h1>
        <p class="gsap-hero home-hero-copy text-sm md:text-xl text-zinc-300 mb-7 md:mb-14 max-w-2xl mx-auto font-light tracking-wide leading-relaxed drop-shadow-md">
          {{ sysConfig.aboutText || '探索融合百年工匠精神与现代声学科技的全新演奏体验。' }}
        </p>
        <div class="gsap-hero">
          <NuxtLink to="/products" class="inline-flex min-h-11 items-center gap-3 px-7 py-4 md:px-10 md:py-5 bg-white/10 backdrop-blur-md border border-white/20 text-white text-xs font-bold uppercase tracking-[0.16em] md:tracking-[0.2em] hover:bg-white hover:text-black transition-all duration-500 rounded-full group" @click="trackHomeCta('hero-products')">
            <span>探索产品宇宙</span>
            <svg class="w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
          </NuxtLink>
        </div>
      </div>
      
      <div class="gsap-hero absolute bottom-12 left-1/2 -translate-x-1/2 hidden md:flex flex-col items-center text-zinc-400">
        <span class="text-[10px] uppercase tracking-[0.3em] mb-3 font-bold">Scroll</span>
        <div class="w-[1px] h-12 bg-white/20 overflow-hidden"><div class="w-full h-1/2 bg-white animate-scroll-down"></div></div>
      </div>
    </section>

    <section class="py-20 md:py-40 px-5 md:px-12 relative z-10" data-scroll-fx>
      <div class="max-w-[90rem] mx-auto">
        <div class="gsap-fade-up flex flex-col md:flex-row justify-between items-start md:items-end mb-10 md:mb-20 pb-6 md:pb-8 border-b border-zinc-200/80 gap-4 md:gap-6">
          <div>
            <span class="text-[10px] font-mono text-zinc-400 tracking-[0.25em] md:tracking-[0.3em] uppercase mb-3 md:mb-4 block font-bold">Masterpieces</span>
            <h2 class="text-4xl md:text-5xl lg:text-6xl font-serif text-black tracking-tighter">Featured Series.</h2>
          </div>
          <NuxtLink to="/products" class="text-xs text-zinc-500 uppercase tracking-widest hover:text-black border-b border-transparent hover:border-black transition-all font-bold pb-1" @click="trackHomeCta('featured-view-all')">
            View All Collection &rarr;
          </NuxtLink>
        </div>
        
        <div v-if="productsPending && localProducts.length === 0" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-20">
          <div v-for="i in 4" :key="i" class="w-full flex flex-col animate-pulse">
            <div class="w-full aspect-[4/5] bg-zinc-200 mb-6 rounded-3xl"></div>
            <div class="h-px bg-zinc-200 w-8 mb-4"></div>
            <div class="h-3 bg-zinc-200 w-1/4 mb-3"></div>
            <div class="h-6 bg-zinc-300 w-1/2"></div>
          </div>
        </div>
        
        <div v-else class="gsap-card-container grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-8 md:gap-y-20 items-start">
          <NuxtLink v-for="product in localProducts" :key="product.id" :to="`/products/${product.attributes.slug || product.id}`" class="gsap-card product-card interactive-card scroll-lift group flex h-full w-full cursor-pointer flex-col items-start self-stretch rounded-2xl md:rounded-[1.75rem]" @click="trackHomeProduct(product)">
            <div class="scroll-media featured-product-media w-full aspect-[16/10] md:aspect-[4/5] overflow-hidden mb-5 md:mb-8 bg-zinc-100 rounded-2xl md:rounded-3xl relative shadow-[0_15px_30px_-5px_rgba(0,0,0,0.05)] transition-shadow duration-700 group-hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.15)]">
              <img v-if="product.attributes.image" :src="mediaUrl(product.attributes.image.data.attributes.url)" :alt="product.attributes.title" loading="lazy" decoding="async" sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" class="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105" @error="imageFallback" />
              <div class="absolute inset-0 border border-black/5 rounded-3xl pointer-events-none"></div>
            </div>
            
            <div class="home-featured-body w-full flex flex-1 flex-col px-1 md:px-2 transform group-hover:-translate-y-1 transition-transform duration-500">
              <div class="w-6 h-[1px] bg-black/20 mb-3 md:mb-4 group-hover:w-12 group-hover:bg-black transition-all duration-700 ease-out"></div>
              <p class="text-[10px] text-zinc-400 tracking-[0.25em] uppercase mb-2 font-bold">{{ product.attributes.series || product.attributes.categoryName || product.attributes.type }}</p>
              <h3 class="text-xl md:text-2xl font-serif text-black group-hover:text-zinc-500 transition-colors duration-500 mb-2">{{ product.attributes.title }}</h3>
              <p class="mt-auto text-xs font-mono text-zinc-500">¥ {{ (product.attributes.price || 0).toFixed(2) }}</p>
            </div>
          </NuxtLink>
        </div>
      </div>
    </section>

    <section class="py-16 md:py-28 lg:py-32 px-5 md:px-12 relative overflow-hidden text-white flex items-center min-h-[auto] md:min-h-[68vh] lg:min-h-[72vh]" data-scroll-fx>
      <div v-if="sysConfig.coreTechBgImageUrl" class="absolute inset-0 z-0">
        <img :src="mediaUrl(sysConfig.coreTechBgImageUrl)" alt="Core Technology Background" loading="lazy" decoding="async" sizes="100vw" class="w-full h-full object-cover" @error="heroFallback" />
      </div>
      <div class="absolute inset-0 z-0 transition-colors duration-500" :style="{ backgroundColor: sysConfig.coreTechBgColor || '#0a0a0a', opacity: sysConfig.coreTechBgImageUrl ? 0.7 : 1 }"></div>
      
      <div class="absolute inset-0 z-0 bg-gradient-to-r from-black/25 via-black/62 to-black/92 pointer-events-none"></div>
      
      <div class="max-w-[76rem] mx-auto w-full flex flex-col lg:flex-row items-center gap-8 lg:gap-14 relative z-10">
        <div class="gsap-slide-right scroll-drift w-full max-w-[34rem] lg:w-[46%] aspect-[16/10] md:aspect-[4/3] relative bg-zinc-900/30 backdrop-blur-xl rounded-2xl md:rounded-[1.75rem] overflow-hidden shadow-[0_24px_50px_-18px_rgba(0,0,0,0.9)] border border-white/10 group">
          <img v-if="sysConfig.coreTechImageUrl" :src="mediaUrl(sysConfig.coreTechImageUrl)" alt="Core Technology Product" loading="lazy" decoding="async" sizes="(min-width: 1024px) 46vw, 100vw" class="absolute inset-0 w-full h-full object-cover opacity-100 group-hover:scale-105 transition-transform duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]" @error="imageFallback" />
          <div v-else class="w-full h-full flex flex-col items-center justify-center text-zinc-600"><span class="text-2xl font-bold tracking-widest">HUSHI WIND CORE</span></div>
          <div class="absolute inset-0 bg-gradient-to-tr from-black/30 via-transparent to-white/10 pointer-events-none"></div>
        </div>
        
        <div class="gsap-slide-left scroll-lift w-full lg:w-[54%] flex flex-col justify-center">
          <span class="text-[10px] font-mono tracking-[0.24em] md:tracking-[0.28em] text-zinc-400 mb-4 md:mb-5 uppercase font-bold drop-shadow-md">Core Technology</span>
          <h2 class="text-3xl md:text-5xl lg:text-[3.6rem] font-serif text-white mb-5 md:mb-7 leading-[1.12] md:leading-[1.08] whitespace-pre-line drop-shadow-lg">{{ sysConfig.coreTechTitle || '声学与数字的\n完美共振。' }}</h2>
          <p class="text-zinc-300 text-sm md:text-lg mb-7 md:mb-9 leading-relaxed drop-shadow-md font-light max-w-[34rem]">{{ sysConfig.coreTechDesc || '我们不仅仅是制造乐器，我们是在塑造声音的灵魂...' }}</p>
          <NuxtLink to="/info/brand-story?source=home" class="w-max pb-2 border-b border-white/30 hover:border-white text-xs font-bold uppercase tracking-[0.2em] transition-colors text-white drop-shadow-md" @click="trackHomeCta('core-technology-brand-story')">
            {{ sysConfig.coreTechLinkText || 'Explore Engineering' }}
          </NuxtLink>
        </div>
      </div>
    </section>

    <section class="home-quote-section relative min-h-[300px] md:min-h-[440px] lg:min-h-[500px] py-16 md:py-28 lg:py-32 flex items-center justify-center overflow-hidden bg-black border-y border-black/90" data-scroll-fx>
      <div class="gsap-parallax-bg absolute inset-0 z-0 h-[112%] -top-[6%]">
        <img v-if="sysConfig.quoteBgImageUrl" :src="mediaUrl(sysConfig.quoteBgImageUrl)" alt="Brand Quote Background" loading="lazy" decoding="async" sizes="100vw" class="w-full h-full object-cover opacity-75" @error="heroFallback" />
        <div v-else class="w-full h-full bg-zinc-900"></div>
        <div class="absolute inset-0 bg-gradient-to-b from-black/55 via-black/45 to-black/60 backdrop-blur-[1px]"></div>
      </div>
      <div class="relative z-10 text-center text-white px-6 max-w-4xl gsap-fade-up scroll-lift">
        <svg class="w-7 h-7 md:w-8 md:h-8 mx-auto mb-5 md:mb-7 text-white/35" fill="currentColor" viewBox="0 0 24 24"><path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/></svg>
        <h2 class="text-4xl md:text-6xl lg:text-7xl font-serif italic mb-10 leading-tight drop-shadow-2xl text-white whitespace-pre-line">{{ sysConfig.quoteText || '"真正的乐器，\n是演奏者灵魂的自然延伸。"' }}</h2>
        <div class="w-10 h-[1px] bg-white/30 mx-auto mb-6"></div>
        <p class="text-zinc-400 tracking-[0.3em] uppercase text-xs font-bold">{{ sysConfig.quoteAuthor || '全球顶级艺术家的共同选择' }}</p>
      </div>
    </section>

    <section class="py-20 md:py-40 px-5 md:px-12 relative bg-[#f5f5f7]" data-scroll-fx>
      <div class="max-w-[90rem] mx-auto">
        <div class="text-center mb-10 md:mb-24 gsap-fade-up">
          <span class="text-[10px] font-mono tracking-[0.26em] md:tracking-[0.3em] text-zinc-400 uppercase font-bold block mb-3 md:mb-4">Ecosystem</span>
          <h2 class="text-3xl md:text-6xl font-serif text-black">超越硬件的完整体验.</h2>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-8 gsap-card-container-2">
          <article v-for="service in services" :key="service.title" class="gsap-service-card interactive-card scroll-lift bg-white rounded-2xl md:rounded-[2rem] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.03)] hover:shadow-[0_24px_70px_-18px_rgba(0,0,0,0.16)] transition-all duration-700 border border-zinc-100 flex flex-col overflow-hidden group">
            <div class="scroll-media relative w-full aspect-[16/10] overflow-hidden bg-zinc-100">
              <img
                v-if="service.imageUrl"
                :src="service.imageUrl"
                :alt="service.title"
                loading="lazy"
                decoding="async"
                sizes="(min-width: 768px) 33vw, 100vw"
                class="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
                @error="serviceFallback"
              />
              <div v-else class="absolute inset-0 bg-zinc-200"></div>
              <div class="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent"></div>
              <div class="absolute left-4 bottom-4 md:left-6 md:bottom-6 h-10 md:h-12 min-w-10 md:min-w-12 px-3 md:px-4 rounded-full bg-white/90 backdrop-blur text-black flex items-center justify-center text-[10px] md:text-xs font-bold tracking-[0.16em] md:tracking-[0.18em] uppercase shadow-sm">
                {{ service.icon }}
              </div>
            </div>

            <div class="home-service-body p-5 md:p-8 lg:p-10 flex flex-col items-start flex-1">
              <span class="text-[10px] font-mono text-zinc-400 tracking-[0.24em] md:tracking-[0.28em] uppercase mb-3 md:mb-4 block font-bold">{{ service.kicker }}</span>
              <h3 class="text-2xl md:text-3xl font-serif text-black mb-3 md:mb-4 leading-tight">{{ service.title }}</h3>
              <p class="home-service-desc text-zinc-500 text-sm md:text-base leading-relaxed mb-6 md:mb-10 flex-grow font-light">{{ service.desc }}</p>
              <NuxtLink :to="service.link?.startsWith('/') ? service.link : '/'" class="text-black text-[10px] font-bold uppercase tracking-[0.2em] border-b border-black/20 pb-1 group-hover:border-black transition-colors" @click="trackHomeCta(`ecosystem-${service.title}`)">{{ service.actionText }}</NuxtLink>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section class="py-20 md:py-40 px-5 md:px-12 bg-white" data-scroll-fx>
      <div class="max-w-[90rem] mx-auto">
        <div class="gsap-fade-up flex flex-col md:flex-row justify-between items-start md:items-end mb-10 md:mb-20 pb-6 md:pb-8 border-b border-zinc-200/80 gap-4 md:gap-6">
          <div>
            <span class="text-[10px] font-mono text-zinc-400 tracking-[0.25em] md:tracking-[0.3em] uppercase mb-3 md:mb-4 block font-bold">Journals</span>
            <h2 class="text-4xl md:text-5xl lg:text-6xl font-serif text-black tracking-tighter">Brand Vision.</h2>
          </div>
          <NuxtLink to="/news" class="text-xs text-zinc-500 uppercase tracking-widest hover:text-black border-b border-transparent hover:border-black transition-all font-bold pb-1" @click="trackHomeCta('news-view-all')">
            Read All News &rarr;
          </NuxtLink>
        </div>

        <div v-if="newsPending && localNews.length === 0" class="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-16">
           <div v-for="i in 3" :key="i" class="animate-pulse w-full flex flex-col"><div class="w-full aspect-[4/3] bg-zinc-200 mb-8 rounded-3xl"></div><div class="h-px bg-zinc-200 w-8 mb-4"></div><div class="h-3 bg-zinc-200 w-1/4 mb-3"></div><div class="h-6 w-full bg-zinc-300"></div></div>
        </div>
        
        <FrontState
          v-else-if="localNews.length === 0"
          eyebrow="Brand Vision"
          title="暂无已发布资讯"
          description="品牌新闻、产品发布和活动动态正在整理中。"
          :show-retry="false"
        />

        <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-8 md:gap-y-16">
          <NuxtLink v-for="news in localNews" :key="news.id" :to="`/news/${news.id || news.slug}`" class="gsap-news-card interactive-card scroll-lift group cursor-pointer flex flex-col items-start w-full rounded-2xl md:rounded-[1.75rem]" @click="trackHomeNews(news)">
            <div class="scroll-media home-news-media w-full aspect-[16/10] md:aspect-[4/3] overflow-hidden mb-5 md:mb-8 bg-zinc-100 rounded-2xl md:rounded-3xl relative shadow-[0_15px_30px_-5px_rgba(0,0,0,0.05)] transition-shadow duration-700 group-hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.15)]">
              <img v-if="news.image" :src="news.image" :alt="news.title" loading="lazy" decoding="async" sizes="(min-width: 768px) 33vw, 100vw" class="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105" @error="serviceFallback" />
              <div class="absolute inset-0 border border-black/5 rounded-3xl pointer-events-none"></div>
            </div>
            
            <div class="home-news-body w-full flex flex-1 flex-col px-1 md:px-2 transform group-hover:-translate-y-1 transition-transform duration-500">
              <div class="w-6 h-[1px] bg-black/20 mb-3 md:mb-4 group-hover:w-16 group-hover:bg-black transition-all duration-700 ease-out"></div>
              <span class="text-[10px] font-mono text-zinc-400 uppercase tracking-[0.2em] block mb-3 font-bold">{{ news.date }}</span>
              <h3 class="text-xl md:text-2xl font-serif text-black group-hover:text-zinc-500 transition-colors duration-500 leading-snug line-clamp-2 pr-4">{{ news.title }}</h3>
            </div>
          </NuxtLink>
        </div>
      </div>
    </section>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, onActivated } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

let ctx;
let animationTimer = 0
let gsapLib = null
let scrollTriggerLib = null

const isOffline = useState('global-offline')
const mediaUrl = useMediaUrl()
const brandAssets = useBrandAssets()
const imageFallback = useImageFallback(brandAssets.productPiano)
const heroFallback = useImageFallback(brandAssets.heroPiano)
const serviceFallback = useImageFallback(brandAssets.supportHero)
const configUrl = useApiUrl('/api/config')
const productsUrl = useApiUrl('/api/products')
const articlesUrl = useApiUrl('/api/articles?populate=*')
const servicesUrl = useApiUrl('/api/ecosystem-services')
const { track } = useAuralTrack()

const { data: configRes, error: errC, refresh: refreshC } = await useFetch(configUrl, { lazy: true, key: 'home-config' })
const sysConfig = computed(() => configRes.value || {})
const heroTitle = computed(() => String(sysConfig.value.aboutTitle || '纯粹之音，始于指尖。').trim())
const splitHeroTitleLine = (value, maxLength = 9) => {
  const line = String(value || '').trim()
  if (!line || line.length <= maxLength) return line ? [line] : []
  const pivot = Math.ceil(line.length / 2)
  return [line.slice(0, pivot), line.slice(pivot)]
}
const heroTitleLines = computed(() => {
  const title = heroTitle.value
  if (title.includes('\n')) return title.split(/\n+/).map(line => line.trim()).filter(Boolean)
  const punctuated = title.match(/^(.{4,12}[，,、：:；;])(.+)$/)
  if (punctuated) return [...splitHeroTitleLine(punctuated[1]), ...splitHeroTitleLine(punctuated[2])]
  if (title.length > 14) return splitHeroTitleLine(title)
  return [title]
})

useSiteSeo({
  title: '胡氏管乐 | 纯粹之音，始于指尖',
  description: '探索胡氏管乐的原声钢琴、吉他、电子合成器与专业音响系统，了解品牌技术、艺术家生态与最新资讯。',
  path: '/',
  image: () => sysConfig.value.heroImageUrl ? mediaUrl(sysConfig.value.heroImageUrl) : undefined
})

useHead(() => {
  const heroImage = sysConfig.value.heroImageUrl ? mediaUrl(sysConfig.value.heroImageUrl) : ''
  return heroImage ? {
    link: [
      {
        rel: 'preload',
        as: 'image',
        href: heroImage,
        fetchpriority: 'high'
      }
    ]
  } : {}
})

const localProducts = ref([])
const { data: productsRes, pending: productsPending, error: errP, refresh: refreshP } = await useFetch(productsUrl, { lazy: true, key: 'home-products' })
watch(productsRes, (newVal) => { if (newVal?.data && newVal.data.length > 0) localProducts.value = newVal.data.slice(0, 4) }, { immediate: true })

const localNews = ref([])
const { data: strapiNews, pending: newsPending, error: errN, refresh: refreshN } = await useFetch(articlesUrl, { lazy: true, key: 'home-articles' })
watch(strapiNews, (newVal) => {
  if (newVal?.data?.length > 0) localNews.value = newVal.data.slice(0, 3).map(item => ({ id: item.id, slug: item.attributes.slug || '', date: item.attributes.date || 'NEW', title: item.attributes.title, image: item.attributes.image?.data ? mediaUrl(item.attributes.image.data.attributes.url) : null }))
  else localNews.value = []
}, { immediate: true })

const { data: rawServices, error: errS, refresh: refreshS } = await useFetch(servicesUrl, { lazy: true, key: 'home-services' })
const fallbackServices = [
  { icon: 'CARE', title: '胡氏管乐 Care+', desc: '覆盖保修登记、维修工单、调律预约和配件咨询，为乐器和音频设备提供持续服务。', link: '/support' },
  { icon: 'LIVE', title: '演出与扩声方案', desc: '为剧场、学校、Livehouse 和录音棚提供设备选型、系统调试与应用建议。', link: '/audio' },
  { icon: 'PRO', title: '艺术家合作计划', desc: '面向专业演奏者、制作人和教育者开放合作申请，共同探索声音表达的新边界。', link: '/artists' }
]

const serviceVisuals = [
  {
    keywords: ['care', '售后', '保修', '维修', '调律'],
    imageUrl: '/uploads/real-assets/support-hero-service-desk.jpg',
    kicker: 'Care & Support',
    actionText: '预约售后支持'
  },
  {
    keywords: ['live', '扩声', '演出', '剧场', '录音棚'],
    imageUrl: '/uploads/real-assets/audio-solution-live-stage.jpg',
    kicker: 'Live & Studio',
    actionText: '查看音频方案'
  },
  {
    keywords: ['pro', '艺术家', '合作', '演奏者', '教育者'],
    imageUrl: '/uploads/real-assets/artists-hero-performance.jpg',
    kicker: 'Artist Program',
    actionText: '了解合作计划'
  }
]
const resolveServiceVisual = (service, index) => {
  const content = `${service.icon || ''} ${service.title || ''} ${service.desc || ''}`.toLowerCase()
  return serviceVisuals.find(visual => visual.keywords.some(keyword => content.includes(keyword.toLowerCase()))) || serviceVisuals[index % serviceVisuals.length]
}
const services = computed(() => {
  const source = rawServices.value?.data?.length > 0 ? rawServices.value.data : fallbackServices
  return source.map((service, index) => {
    const visual = resolveServiceVisual(service, index)
    return {
      ...service,
      imageUrl: mediaUrl(service.imageUrl || visual.imageUrl, ''),
      kicker: service.kicker || visual.kicker,
      actionText: service.actionText || visual.actionText || '探索详情'
    }
  })
})

const trackHomeCta = (ctaName) => {
  track('cta_click', { ctaName, metadata: { source: 'home' } })
}

const trackHomeProduct = (product) => {
  const attributes = product.attributes || product
  track('cta_click', {
    entityType: 'product',
    entityId: String(product.id),
    entityTitle: attributes.title,
    ctaName: 'home-featured-product',
    metadata: { source: 'home' }
  })
}

const trackHomeNews = (news) => {
  track('cta_click', {
    entityType: 'news',
    entityId: String(news.id),
    entityTitle: news.title,
    ctaName: 'home-news-card',
    metadata: { source: 'home' }
  })
}

watch([errC, errP, errN, errS], (errs) => {
  isOffline.value = errs.some(Boolean)
}, { immediate: true })

onBeforeRouteLeave((to, from, next) => { if (process.client) sessionStorage.setItem('homeScrollPos', window.scrollY.toString()); next() })
onActivated(async () => {
  if (process.client) {
    const savedY = sessionStorage.getItem('homeScrollPos')
    if (savedY) {
      window.scrollTo(0, parseInt(savedY, 10))
      if (!scrollTriggerLib) await loadGsap()
      requestAnimationFrame(() => scrollTriggerLib?.refresh?.())
    }
  }
})

const loadGsap = async () => {
  if (gsapLib && scrollTriggerLib) return { gsap: gsapLib, ScrollTrigger: scrollTriggerLib }
  const [{ gsap }, scrollTriggerModule] = await Promise.all([
    import('gsap'),
    import('gsap/ScrollTrigger')
  ])
  gsapLib = gsap
  scrollTriggerLib = scrollTriggerModule.ScrollTrigger
  gsapLib.registerPlugin(scrollTriggerLib)
  return { gsap: gsapLib, ScrollTrigger: scrollTriggerLib }
}

const initAnimations = async () => {
  if (process.server) return
  const isMobile = window.matchMedia('(max-width: 767px), (pointer: coarse)').matches
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (prefersReducedMotion) return
  const { gsap, ScrollTrigger } = await loadGsap()
  useGsapCleanup(ctx, ScrollTrigger)
  ctx = gsap.context(() => {
    gsap.from('.gsap-hero', {
      y: isMobile ? 24 : 40,
      opacity: 0,
      duration: isMobile ? 1.2 : 1.5,
      stagger: isMobile ? 0.14 : 0.2,
      ease: isMobile ? 'power2.out' : 'power3.out',
      delay: 0.2
    })

    if (isMobile) return

    gsap.to('.home-hero-media', {
      yPercent: 8,
      scale: 1.03,
      ease: 'none',
      scrollTrigger: { trigger: '.home-hero', start: 'top top', end: 'bottom top', scrub: 1.1 }
    })
    gsap.to('.home-hero-title', { yPercent: -10, ease: 'none', scrollTrigger: { trigger: '.home-hero', start: 'top top', end: 'bottom top', scrub: 1.1 } })
    gsap.to('.home-hero-copy', { yPercent: -6, ease: 'none', scrollTrigger: { trigger: '.home-hero', start: 'top top', end: 'bottom top', scrub: 1.1 } })
    gsap.utils.toArray('.gsap-fade-up').forEach(elem => gsap.from(elem, { scrollTrigger: { trigger: elem, start: 'top 88%', toggleActions: 'play none none none' }, y: 34, opacity: 0, duration: 0.8, ease: 'power3.out' }))
    gsap.from('.gsap-card', { scrollTrigger: { trigger: '.gsap-card-container', start: 'top 88%', toggleActions: 'play none none none' }, y: 32, opacity: 0, duration: 0.7, stagger: 0.06, ease: 'power3.out', clearProps: 'transform,opacity' })
    gsap.from('.gsap-slide-right', { scrollTrigger: { trigger: '.gsap-slide-right', start: 'top 84%', toggleActions: 'play none none none' }, x: -34, opacity: 0, duration: 0.9, ease: 'power3.out' })
    gsap.from('.gsap-slide-left', { scrollTrigger: { trigger: '.gsap-slide-left', start: 'top 84%', toggleActions: 'play none none none' }, x: 34, opacity: 0, duration: 0.9, ease: 'power3.out', delay: 0.08 })
    gsap.to('.gsap-slide-right', { yPercent: -3, ease: 'none', scrollTrigger: { trigger: '.gsap-slide-right', start: 'top bottom', end: 'bottom top', scrub: 1 } })
    gsap.to('.gsap-slide-left', { yPercent: 3, ease: 'none', scrollTrigger: { trigger: '.gsap-slide-left', start: 'top bottom', end: 'bottom top', scrub: 1 } })
    gsap.to('.gsap-parallax-bg', { yPercent: 10, ease: "none", scrollTrigger: { trigger: ".gsap-parallax-bg", start: "top bottom", end: "bottom top", scrub: 1.1 } })
    gsap.from('.gsap-service-card', { scrollTrigger: { trigger: '.gsap-card-container-2', start: 'top 88%', toggleActions: 'play none none none' }, y: 34, opacity: 0, duration: 0.8, stagger: 0.08, ease: 'power3.out', clearProps: 'transform,opacity' })
    gsap.from('.gsap-news-card', { scrollTrigger: { trigger: '.gsap-news-card', start: 'top 88%', toggleActions: 'play none none none' }, y: 34, opacity: 0, duration: 0.8, stagger: 0.1, ease: 'power3.out', clearProps: 'transform,opacity' })
    gsap.utils.toArray('.scroll-media').forEach((elem) => {
      gsap.to(elem, { yPercent: -2, ease: 'none', scrollTrigger: { trigger: elem, start: 'top bottom', end: 'bottom top', scrub: 1.1 } })
    })
  })
}

onMounted(() => { 
  if (!productsPending.value && !newsPending.value) void initAnimations() 
})
watch([productsPending, newsPending], ([p1, p2]) => {
  if (p1 || p2 || process.server) return
  window.clearTimeout(animationTimer)
  animationTimer = window.setTimeout(() => { void initAnimations() }, 100)
})
onBeforeUnmount(() => {
  if (process.client) window.clearTimeout(animationTimer)
  useGsapCleanup(ctx, scrollTriggerLib)
})
</script>

<style scoped>
@keyframes scrollDown { 0% { transform: translateY(-100%); } 100% { transform: translateY(200%); } }
.animate-scroll-down { animation: scrollDown 2s cubic-bezier(0.65, 0, 0.35, 1) infinite; }
@keyframes slowZoom { 0% { transform: scale(1); } 100% { transform: scale(1.08); } }
.interactive-card { transition: transform 0.55s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.55s ease, background-color 0.35s ease; }
.interactive-card:hover { transform: translateY(-4px); }
.product-card { transform: translate3d(0, 0, 0); }
.product-card > div:first-child { width: 100%; }
.home-quote-section h2 { font-size: clamp(2rem, 5vw, 3.75rem); margin-bottom: 1.75rem; }
img { -webkit-user-drag: none; }

@media (min-width: 768px) {
  .home-hero-media {
    background: #111;
  }

  .featured-product-media {
    min-height: min(42vw, 420px);
  }

  .home-featured-body {
    min-height: 9.5rem;
  }

  .home-featured-body h3 {
    min-height: 3.25rem;
    display: -webkit-box;
    overflow: hidden;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .home-service-body {
    min-height: 19rem;
  }

  .home-service-body h3 {
    min-height: 4.5rem;
  }

  .home-service-desc {
    display: -webkit-box;
    overflow: hidden;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
  }

  .home-news-body {
    min-height: 8.5rem;
  }
}

@media (max-width: 767px) {
  .home-hero {
    min-height: calc(100svh - 4rem);
    justify-content: flex-start;
    padding-top: clamp(6.25rem, 17svh, 8.25rem);
  }

  .home-hero-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    will-change: auto;
  }

  .home-hero-media {
    top: 0;
    bottom: 0;
    transform: none !important;
    transition: none !important;
    will-change: auto;
  }

  .home-hero-image {
    animation: none !important;
    transform: none !important;
    transition: none !important;
    transform-origin: center;
  }

  .scroll-media,
  .scroll-lift,
  .scroll-drift {
    transform: none !important;
  }

  .home-hero-title {
    max-width: min(22rem, 92vw);
    margin-inline: auto;
    margin-bottom: clamp(2.1rem, 8vw, 3rem) !important;
    text-wrap: balance;
    overflow-wrap: normal;
    line-height: 1.2 !important;
  }

  .home-hero-title-line {
    white-space: nowrap;
  }

  .home-hero-copy {
    max-width: min(21rem, 88vw);
    margin-top: 0 !important;
    margin-bottom: clamp(1.75rem, 7vw, 2.4rem) !important;
    font-size: clamp(0.82rem, 3.65vw, 0.96rem);
    line-height: 2;
  }

  .interactive-card:hover {
    transform: none;
  }

  .product-card > div,
  .gsap-news-card > div {
    transform: none !important;
  }

  .featured-product-media {
    height: clamp(150px, 42vw, 180px);
    aspect-ratio: auto;
    margin-bottom: 0.75rem;
  }

  .product-card > div:last-child {
    padding-inline: 0.1rem;
  }

  .product-card > div:last-child > div:first-child {
    margin-bottom: 0.5rem;
  }

  .product-card h3 {
    margin-bottom: 0.25rem;
    font-size: 1.1rem;
    line-height: 1.25;
  }

  .gsap-service-card .scroll-media {
    height: clamp(118px, 32vw, 150px);
    aspect-ratio: auto;
  }

  .home-service-body {
    padding: 1rem;
  }

  .home-service-body span {
    margin-bottom: 0.45rem;
  }

  .home-service-body h3 {
    margin-bottom: 0.45rem;
    font-size: 1.22rem;
    line-height: 1.18;
  }

  .home-service-desc {
    display: -webkit-box;
    overflow: hidden;
    margin-bottom: 0.9rem;
    line-height: 1.45;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .home-news-media {
    height: 150px;
    aspect-ratio: auto;
    margin-bottom: 0.75rem;
  }

  .gsap-news-card h3 {
    font-size: 1.1rem;
    line-height: 1.3;
  }

  .product-card img,
  .gsap-service-card img,
  .gsap-news-card img,
  .product-card:hover img,
  .gsap-service-card:hover img,
  .gsap-news-card:hover img {
    transform: none !important;
  }

  .home-quote-section h2 {
    font-size: clamp(2rem, 11vw, 2.8rem);
    margin-bottom: 1.25rem;
  }
}
</style>
