<template>
  <div class="max-w-4xl mx-auto px-4 py-24 min-h-screen relative">
    
    <div v-if="pending" class="py-32 animate-pulse">
      <div class="w-1/3 h-10 bg-zinc-100 mb-12"></div>
      <div class="space-y-4">
        <div class="w-full h-4 bg-zinc-50"></div>
        <div class="w-5/6 h-4 bg-zinc-50"></div>
        <div class="w-full h-4 bg-zinc-50"></div>
      </div>
    </div>

    <div v-else-if="pageData">
      <button @click="handleBack" class="mb-10 inline-flex items-center text-black font-bold border-b-2 border-black pb-1 group transition-all">
        <span class="mr-2 transform transition-transform group-hover:-translate-x-1">←</span> 
        返回
      </button>

      <div class="mb-8 rounded-3xl border border-zinc-200 bg-white px-6 py-7 shadow-sm md:px-10">
        <p class="mb-3 text-[10px] font-bold uppercase tracking-[0.28em] text-zinc-400">品牌信息</p>
        <h1 class="text-4xl font-bold text-zinc-900">{{ pageData.title }}</h1>
      </div>
      
      <div class="prose prose-lg max-w-none rounded-3xl border border-zinc-200 bg-white px-6 py-7 text-zinc-600 leading-relaxed shadow-sm whitespace-pre-line md:px-10">
        {{ pageData.content }}
      </div>
    </div>

    <FrontState
      v-else-if="error"
      type="error"
      eyebrow="页面加载"
      title="页面内容暂时无法加载"
      description="无法连接至内容数据源，请检查后端服务状态，或稍后重新加载。"
      show-retry
      @retry="refresh"
    />

    <FrontState
      v-else
      eyebrow="内容整理中"
      title="页面内容尚未创建"
      description="该页面内容正在整理中，你可以先返回首页或前往支持页面联系我们。"
      :show-retry="false"
    />

  </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const smartBack = useSmartBack('/')
const handleBack = () => smartBack()

const isOffline = useState('global-offline')
const pageUrl = useApiUrl(`/api/page-contents/${route.params.slug}`)

const { data: rawPage, pending, error, refresh } = await useFetch(pageUrl, { lazy: true, key: `info-page-${route.params.slug}` })

watch(error, (newErr) => { if (newErr) isOffline.value = true }, { immediate: true })

const pageData = computed(() => rawPage.value?.data || null)

const plainDescription = computed(() => {
  const text = pageData.value?.content || '查看胡氏管乐官方页面内容。'
  return text.replace(/\s+/g, ' ').trim().slice(0, 120)
})

useSiteSeo({
  title: () => `${pageData.value?.title || '页面内容'} | 胡氏管乐`,
  description: () => plainDescription.value,
  path: () => `/info/${route.params.slug}`
})

useBreadcrumbSchema(() => [
  { name: '首页', path: '/' },
  { name: '品牌信息', path: '/info/brand-story' },
  { name: pageData.value?.title || '页面内容', path: `/info/${route.params.slug}` }
])
</script>
