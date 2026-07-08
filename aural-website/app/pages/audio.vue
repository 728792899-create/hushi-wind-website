<template>
  <div class="bg-[#fbfbfd] min-h-screen pb-32 overflow-x-hidden">
    
    <div class="page-back-button fixed top-24 left-4 md:top-32 md:left-12 z-[70] md:z-[100] mix-blend-difference pointer-events-none">
      <button @click="handleBack" class="flex items-center gap-4 text-white hover:scale-105 transition-transform duration-300 group pointer-events-auto">
        <div class="w-10 h-10 flex items-center justify-center rounded-full border border-white/50 group-hover:border-white transition-colors">
          <svg class="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
        </div>
        <span class="hidden md:block text-xs font-bold tracking-[0.2em] uppercase">返回</span>
      </button>
    </div>

    <section class="h-[60vh] relative flex items-center justify-center overflow-hidden bg-black text-white">
      <div class="absolute inset-0 z-0">
        <img v-if="sysConfig.audioHeroImageUrl" :src="mediaUrl(sysConfig.audioHeroImageUrl)" class="w-full h-full object-cover opacity-40 transform scale-105 animate-[slowZoom_20s_ease-in-out_infinite_alternate]" alt="Professional Audio Background" loading="eager" fetchpriority="high" decoding="async" sizes="100vw" />
        <img v-else :src="brandAssets.audioHero" class="w-full h-full object-cover opacity-40 transform scale-105 animate-[slowZoom_20s_ease-in-out_infinite_alternate]" alt="Professional Audio Background" loading="eager" fetchpriority="high" decoding="async" sizes="100vw" />
      </div>
      <div class="relative z-10 text-center px-4 animate-in fade-in">
        <h1 class="text-6xl md:text-9xl font-serif italic tracking-tighter text-white mb-6 drop-shadow-2xl">Professional</h1>
        <p class="text-zinc-300 text-lg md:text-xl max-w-2xl mx-auto font-light tracking-wide uppercase leading-relaxed drop-shadow-md">塑造震撼人心的现场声学体验。</p>
      </div>
    </section>

    <section class="max-w-[85rem] mx-auto px-6 md:px-12 py-32">
      <div class="flex justify-between items-end mb-20 border-b border-zinc-200 pb-6">
        <h2 class="text-4xl font-serif italic text-black tracking-tight">Solutions.</h2>
        <span class="text-xs text-zinc-400 font-mono uppercase tracking-widest">System Solutions / 01</span>
      </div>

      <div v-if="pendingSol" class="grid grid-cols-1 md:grid-cols-2 gap-12 animate-pulse">
        <div v-for="i in 2" :key="i" class="aspect-video bg-zinc-200 rounded-[2rem]"></div>
      </div>
      
      <FrontState
        v-else-if="errSol"
        type="error"
        eyebrow="Audio Connection"
        title="音频方案暂时无法加载"
        description="无法连接至专业音频方案数据源，请检查后端服务状态，或稍后重新加载。"
        show-retry
        @retry="refreshSol"
      />

      <FrontState
        v-else-if="displaySolutions.length === 0"
        eyebrow="Audio Solutions"
        title="专业音频方案正在整理"
        description="专业音频方案内容正在整理中。当前可以前往支持页面提交场地与扩声需求。"
        :show-retry="false"
      />

      <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-12">
        <NuxtLink v-for="sol in displaySolutions" :key="sol.id" :to="sol.link || '/support'" class="solution-card group cursor-pointer flex flex-col items-start w-full rounded-[2rem]">
          
          <div class="w-full aspect-video overflow-hidden mb-6 bg-black rounded-[2rem] relative shadow-sm hover:shadow-2xl transition-shadow duration-700">
            <img :src="sol.image" class="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-1000 ease-[cubic-bezier(0.25,1,0.5,1)]" :alt="sol.title" loading="lazy" decoding="async" sizes="(min-width: 768px) 50vw, 100vw" />
            <div class="absolute inset-0 border border-white/10 rounded-[2rem] pointer-events-none"></div>
          </div>
          
          <div class="w-full px-4">
            <div class="w-6 h-[1px] bg-black/30 mb-4 group-hover:w-16 group-hover:bg-black transition-all duration-700 ease-out"></div>
            <p class="text-[10px] text-zinc-400 tracking-[0.3em] mb-2 uppercase font-semibold">{{ sol.en }}</p>
            <h3 class="text-2xl font-serif text-black group-hover:text-zinc-500 transition-colors duration-500 mb-2">{{ sol.title }}</h3>
            <p class="text-sm text-zinc-500 font-light leading-relaxed line-clamp-2 max-w-sm">{{ sol.desc }}</p>
            <span class="inline-flex mt-5 text-[10px] font-bold uppercase tracking-[0.2em] border-b border-black/20 pb-1 group-hover:border-black transition-colors">了解方案</span>
          </div>
        </NuxtLink>
      </div>
    </section>

    <section class="bg-white py-32 px-4 border-t border-zinc-100">
      <div class="max-w-7xl mx-auto text-center">
        <h2 class="text-xs font-mono text-zinc-400 uppercase tracking-[0.3em] mb-20">Core Specifications</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-16">
          <div v-if="pendingStat" v-for="i in 3" :key="i" class="animate-pulse"><div class="h-10 bg-zinc-200 w-1/2 mx-auto mb-4 rounded-sm"></div><div class="h-4 bg-zinc-200 w-1/3 mx-auto rounded-sm"></div></div>
          
          <div v-else v-for="stat in displayStats" :key="stat.id" class="stat-card flex flex-col items-center rounded-2xl px-6 py-8">
            <h3 class="text-6xl lg:text-7xl font-serif italic text-black mb-6 tracking-tighter">{{ stat.value }}</h3>
            <p class="text-xs font-bold tracking-[0.2em] text-black uppercase mb-3">{{ stat.label }}</p>
            <p class="text-sm text-zinc-500 font-light leading-relaxed max-w-xs">{{ stat.desc }}</p>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'

defineOptions({ name: 'AudioPage' }) 
const router = useRouter()
const smartBack = useSmartBack('/')
const handleBack = () => smartBack()

const isOffline = useState('global-offline')
const mediaUrl = useMediaUrl()
const brandAssets = useBrandAssets()
const configUrl = useApiUrl('/api/config')
const solutionsUrl = useApiUrl('/api/audio-solutions')
const statsUrl = useApiUrl('/api/audio-stats')

const { data: configRes, error: errC, refresh: refreshC } = await useFetch(configUrl, { lazy: true, key: 'audio-config' })
const sysConfig = computed(() => configRes.value || {})

const { data: rawSol, pending: pendingSol, error: errSol, refresh: refreshSol } = await useFetch(solutionsUrl, { lazy: true, key: 'audio-solutions' })
const displaySolutions = computed(() => {
  if (rawSol.value?.data?.length > 0) {
    return rawSol.value.data.map(s => ({ ...s, image: mediaUrl(s.imageUrl, brandAssets.audioConsole) }))
  }
  return []
})

const { data: rawStat, pending: pendingStat, error: errStat } = await useFetch(statsUrl, { lazy: true, key: 'audio-stats' })
const displayStats = computed(() => {
  if (rawStat.value?.data?.length > 0) return rawStat.value.data
  return []
})

watch([errC, errSol, errStat], (errs) => {
  isOffline.value = errs.some(Boolean)
}, { immediate: true })

useSiteSeo({
  title: '专业音响 | 胡氏管乐',
  description: '了解胡氏管乐专业音响解决方案，覆盖现场扩声、录音室监听、低延迟处理与高解析度采样场景。',
  path: '/audio',
  image: () => sysConfig.value.audioHeroImageUrl ? mediaUrl(sysConfig.value.audioHeroImageUrl) : undefined
})

useBreadcrumbSchema(() => [
  { name: '首页', path: '/' },
  { name: '专业音响', path: '/audio' }
])
</script>

<style scoped>
.animate-in { animation: fadeIn 0.8s ease-out forwards; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes slowZoom { 0% { transform: scale(1); } 100% { transform: scale(1.08); } }
.solution-card { transition: transform 0.55s cubic-bezier(0.16, 1, 0.3, 1); }
.solution-card:hover { transform: translateY(-8px); }
.stat-card { transition: background-color 0.35s ease, transform 0.35s ease, box-shadow 0.35s ease; }
.stat-card:hover { background: #fafafa; transform: translateY(-4px); box-shadow: 0 18px 40px -34px rgba(0,0,0,0.35); }
</style>
