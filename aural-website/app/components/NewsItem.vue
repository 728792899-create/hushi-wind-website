<template>
  <NuxtLink :to="link" class="group block border-b border-gray-200 pb-8 mb-8 last:border-b-0 last:mb-0 last:pb-2">
    <div class="flex flex-col sm:flex-row sm:items-baseline sm:justify-between mb-2">
      <h3 class="text-xl md:text-2xl font-bold text-gray-900 group-hover:text-gray-600 transition-colors duration-300 pr-4">
        {{ title }}
      </h3>
      <span class="text-sm text-gray-400 font-mono tracking-tight mt-2 sm:mt-0 flex-shrink-0">
        {{ date }}
      </span>
    </div>
    <p class="text-gray-500 line-clamp-2">
      {{ summary }}
    </p>
  </NuxtLink>
</template>

<script setup>
// 定义新闻组件接收的数据格式
defineProps({
  title: { type: String, required: true },
  date: { type: String, required: true },
  summary: { type: String, required: true },
  link: { type: String, default: '#' }
})
</script>