<template>
  <div class="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-4">
    <div class="max-w-2xl text-center">
      <p class="mb-5 text-[10px] font-bold uppercase tracking-[0.35em] text-zinc-500">
        {{ isNotFound ? '404 Not Found' : 'Service Notice' }}
      </p>
      <h1 class="mb-6 text-4xl font-serif italic leading-tight md:text-6xl">
        {{ isNotFound ? '页面暂时没有找到' : '服务暂时无法响应' }}
      </h1>
      <p class="mx-auto mb-10 max-w-xl text-sm leading-relaxed text-zinc-400 md:text-base">
        {{ isNotFound ? '链接可能已更新、内容已隐藏，或您输入的地址有误。可以返回首页继续浏览产品与支持内容。' : '当前服务出现短暂异常，请稍后重试；如需预约试奏或售后支持，也可以先进入支持页面提交需求。' }}
      </p>
      <div class="flex flex-col justify-center gap-3 sm:flex-row">
        <button type="button" class="bg-white px-8 py-4 text-xs font-bold uppercase tracking-widest text-black transition-colors hover:bg-zinc-200" @click="goHome">
          返回首页
        </button>
        <NuxtLink to="/support" class="border border-white/20 px-8 py-4 text-xs font-bold uppercase tracking-widest text-white transition-colors hover:border-white">
          联系支持
        </NuxtLink>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  error: {
    type: Object,
    default: () => ({})
  }
})

const isNotFound = computed(() => Number(props.error?.statusCode) === 404)

const goHome = () => clearError({ redirect: '/' })

useHead({
  title: () => isNotFound.value ? '页面未找到 | 胡氏管乐' : '服务异常 | 胡氏管乐',
  meta: [
    { name: 'robots', content: 'noindex' }
  ]
})
</script>
