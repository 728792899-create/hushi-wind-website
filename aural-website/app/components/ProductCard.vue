<template>
  <NuxtLink :to="link" class="product-card group block cursor-pointer">
    <div class="w-full aspect-[4/3] bg-gray-100 mb-4 overflow-hidden relative">
      
      <div v-if="!imageUrl" class="absolute inset-0 flex items-center justify-center text-sm text-gray-400 bg-gray-200">
        [ {{ imageText }} ]
      </div>

      <img 
        v-else 
        :src="imageUrl" 
        :alt="title" 
        loading="lazy"
        decoding="async"
        sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
        class="absolute inset-0 w-full h-full object-cover" 
      />
      
    </div>
    <h3 class="text-lg font-bold text-gray-900">{{ title }}</h3>
    <p class="text-sm text-gray-500 mt-1 line-clamp-2">{{ description }}</p>
  </NuxtLink>
</template>

<script setup>
// 新增了 imageUrl 属性
defineProps({
  title: { type: String, required: true },
  description: { type: String, required: true },
  imageText: { type: String, default: '图片加载中' },
  imageUrl: { type: String, default: '' }, 
  link: { type: String, default: '#' }
})
</script>

<style scoped>
.product-card img {
  transition: transform 0.4s ease, opacity 0.4s ease;
}
.product-card:hover img {
  transform: scale(1.03); 
  opacity: 0.9;
}
</style>
