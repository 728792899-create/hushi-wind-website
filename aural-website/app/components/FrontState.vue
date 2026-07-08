<template>
  <div class="front-state mx-auto flex max-w-xl flex-col items-center justify-center px-4 py-20 text-center">
    <div class="mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-zinc-200 bg-white shadow-sm">
      <svg v-if="type === 'error'" class="h-7 w-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      </svg>
      <svg v-else class="h-7 w-7 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 7h16M4 12h16M4 17h10" />
      </svg>
    </div>

    <p class="mb-3 text-[10px] font-bold uppercase tracking-[0.32em] text-zinc-400">{{ eyebrow }}</p>
    <h2 class="mb-4 text-2xl font-bold text-black md:text-3xl">{{ title }}</h2>
    <p class="max-w-md text-sm leading-relaxed text-zinc-500">{{ description }}</p>

    <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
      <button
        v-if="showRetry"
        type="button"
        class="border border-black bg-black px-6 py-3 text-[10px] font-bold uppercase tracking-[0.22em] text-white transition-colors hover:bg-zinc-800"
        @click="$emit('retry')"
      >
        重新加载
      </button>
      <NuxtLink
        v-if="homeLink"
        to="/"
        class="border border-zinc-200 px-6 py-3 text-[10px] font-bold uppercase tracking-[0.22em] text-black transition-colors hover:border-black"
      >
        返回首页
      </NuxtLink>
      <NuxtLink
        v-if="supportLink"
        to="/support"
        class="border border-zinc-200 px-6 py-3 text-[10px] font-bold uppercase tracking-[0.22em] text-black transition-colors hover:border-black"
      >
        联系支持
      </NuxtLink>
    </div>
  </div>
</template>

<script setup>
defineEmits(['retry'])

defineProps({
  type: { type: String, default: 'empty' },
  eyebrow: { type: String, default: 'Current State' },
  title: { type: String, default: '暂无内容' },
  description: { type: String, default: '当前没有可展示的数据，请稍后再试。' },
  showRetry: { type: Boolean, default: false },
  homeLink: { type: Boolean, default: true },
  supportLink: { type: Boolean, default: true }
})
</script>

<style scoped>
.front-state {
  min-height: 22rem;
}
</style>
