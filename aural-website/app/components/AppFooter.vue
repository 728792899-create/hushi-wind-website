<template>
  <footer class="bg-zinc-950 pt-20 pb-10 text-zinc-400 border-t border-zinc-900">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 mb-16">
        <div class="col-span-2 lg:col-span-2 pr-8">
          <span class="text-3xl font-serif font-bold tracking-widest text-white mb-6 block uppercase">胡氏管乐</span>
          <p class="text-sm text-zinc-500 mb-6 leading-relaxed">
            致力于用卓越的声学技术和制造工艺，激发全球音乐爱好者的创造力与灵感。
          </p>
        </div>

        <div v-for="(section, title) in footerNav" :key="title">
          <h4 class="text-white text-[10px] font-bold mb-6 tracking-[0.2em] uppercase">{{ title }}</h4>
          <ul class="space-y-4 text-xs">
            <li v-for="link in section" :key="link.name">
              <NuxtLink :to="link.url" class="hover:text-white transition-colors duration-300">{{ link.name }}</NuxtLink>
            </li>
          </ul>
        </div>
      </div>

      <div class="pt-8 border-t border-zinc-800 flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0 text-[10px] text-zinc-500 tracking-[0.14em] font-bold">
        <div class="flex flex-wrap justify-center gap-x-6 gap-y-3 md:justify-start">
          <NuxtLink to="/products?source=footer-bottom" class="hover:text-zinc-300">产品中心</NuxtLink>
          <NuxtLink to="/support?type=experience&source=footer-bottom" class="hover:text-zinc-300">预约体验</NuxtLink>
          <NuxtLink to="/support?source=footer-bottom" class="hover:text-zinc-300">服务支持</NuxtLink>
          <NuxtLink to="/info/brand-story?source=footer-bottom" class="hover:text-zinc-300">品牌故事</NuxtLink>
          <NuxtLink to="/news?source=footer-bottom" class="hover:text-zinc-300">新闻动态</NuxtLink>
        </div>
        <div class="flex flex-wrap justify-center gap-x-4 gap-y-3 md:justify-end">
          <span>&copy; {{ new Date().getFullYear() }} 胡氏管乐</span>
          <NuxtLink to="/info/privacy?source=footer" class="hover:text-white">隐私政策</NuxtLink>
          <NuxtLink to="/info/terms?source=footer" class="hover:text-white">使用条款</NuxtLink>
          <NuxtLink to="/info/warranty?source=footer" class="hover:text-white">售后与保修说明</NuxtLink>
        </div>
      </div>
    </div>
  </footer>
</template>

<script setup>
// 这里所有的 url 都加上了 ?source=footer 或 &source=footer
const footerNav = {
  '产品世界': [
    { name: '全部乐器', url: '/products?source=footer' },
    { name: '专业音响', url: '/audio?source=footer' },
    { name: '新品发布', url: '/news?source=footer' }
  ],
  '支持服务': [
    { name: '经销商查询', url: '/support?type=dealer&source=footer' },
    { name: '保修与维修', url: '/info/warranty?source=footer' },
    { name: '驱动下载', url: '/support?type=download&source=footer' }
  ],
  '关于品牌': [
    { name: '品牌故事', url: '/info/brand-story?source=footer' },
    { name: '隐私政策', url: '/info/privacy?source=footer' },
    { name: '使用条款', url: '/info/terms?source=footer' }
  ]
}
</script>
