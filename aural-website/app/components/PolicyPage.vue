<template>
  <main class="min-h-screen bg-zinc-50 px-4 py-8 text-zinc-900 md:py-16">
    <article :id="topAnchorId" class="mx-auto max-w-6xl">
      <div class="mb-6 flex flex-wrap items-center justify-between gap-4 text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
        <NuxtLink to="/" class="inline-flex items-center gap-2 border border-zinc-200 bg-white px-4 py-2 text-zinc-900 transition-colors hover:border-zinc-400 hover:bg-zinc-50">
          返回首页
        </NuxtLink>
        <span>最近更新：{{ updatedAt }}</span>
      </div>

      <section class="rounded-3xl border border-zinc-200 bg-white px-6 py-8 shadow-sm md:px-10 md:py-12">
        <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
          <div class="min-w-0">
            <p class="mb-4 text-[10px] font-bold uppercase tracking-[0.28em] text-zinc-400">{{ eyebrow }}</p>
            <h1 class="max-w-3xl text-4xl font-black leading-tight text-zinc-950 md:text-5xl">{{ title }}</h1>
            <p v-if="summary" class="mt-5 max-w-3xl text-sm leading-7 text-zinc-500 md:text-base">
              {{ summary }}
            </p>

            <div class="mt-8 flex flex-wrap gap-3">
              <NuxtLink to="/support?source=policy" class="inline-flex items-center justify-center border border-zinc-900 bg-zinc-900 px-5 py-3 text-xs font-bold uppercase tracking-[0.18em] text-white transition-colors hover:bg-zinc-700">
                联系支持
              </NuxtLink>
              <NuxtLink to="/info/brand-story" class="inline-flex items-center justify-center border border-zinc-200 px-5 py-3 text-xs font-bold uppercase tracking-[0.18em] text-zinc-900 transition-colors hover:border-zinc-400 hover:bg-zinc-50">
                品牌故事
              </NuxtLink>
              <a :href="`#${sectionItems[0]?.id || topAnchorId}`" class="inline-flex items-center justify-center border border-zinc-200 px-5 py-3 text-xs font-bold uppercase tracking-[0.18em] text-zinc-600 transition-colors hover:border-zinc-400 hover:bg-zinc-50">
                快速阅读
              </a>
            </div>
          </div>

          <div class="rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
            <p class="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-400">文档更新</p>
            <p class="mt-2 text-sm font-semibold text-zinc-900">{{ updatedAt }}</p>
            <p class="mt-4 text-xs leading-6 text-zinc-500">
              页面内容会根据业务流程、服务政策和合规要求适时调整。涉及具体服务、价格或合同条款时，请以客服回复、门店确认或正式合同为准。
            </p>
          </div>
        </div>
      </section>

      <div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div class="min-w-0">
          <section v-if="sectionItems.length" class="rounded-2xl border border-zinc-200 bg-white px-5 py-4 shadow-sm md:hidden">
            <details class="group">
              <summary class="cursor-pointer list-none text-sm font-bold tracking-[0.18em] text-zinc-700">
                目录 / {{ sectionItems.length }} 章
              </summary>
              <nav class="mt-4 grid gap-2">
                <a
                  v-for="section in sectionItems"
                  :key="section.key"
                  :href="`#${section.id}`"
                  class="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-white"
                >
                  {{ section.index }}. {{ section.title }}
                </a>
              </nav>
            </details>
          </section>

          <div class="mt-6 space-y-6">
            <section
              v-for="section in sectionItems"
              :key="section.key"
              :id="section.id"
              class="scroll-mt-28 rounded-3xl border border-zinc-200 bg-white px-6 py-7 shadow-sm md:px-10"
            >
              <div class="mb-4 flex items-start justify-between gap-4">
                <div>
                  <p class="mb-2 text-[10px] font-bold tracking-[0.28em] text-zinc-400">第 {{ section.index }} 节</p>
                  <h2 class="text-xl font-bold text-zinc-950">{{ section.title }}</h2>
                </div>
              </div>
              <div class="space-y-3 text-sm leading-8 text-zinc-600 md:text-[15px]">
                <p v-for="paragraph in section.body" :key="`${section.key}-${paragraph}`">{{ paragraph }}</p>
              </div>
            </section>
          </div>

          <div class="mt-6 rounded-3xl border border-zinc-200 bg-zinc-950 px-6 py-6 text-sm leading-8 text-zinc-300 md:px-10">
            如需咨询政策细节、售后流程或个人信息处理事项，请直接前往支持页面提交工单。涉及具体服务与价格时，请以客服回复、门店确认或正式合同为准。
          </div>

          <div class="mt-4 flex justify-end">
            <a href="#policy-top" class="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-zinc-500 transition-colors hover:text-zinc-900">
              ↑ 返回顶部
            </a>
          </div>
        </div>

        <aside class="hidden lg:block">
          <div class="sticky top-28 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <p class="text-[10px] font-bold uppercase tracking-[0.28em] text-zinc-400">目录</p>
            <nav class="mt-4 space-y-2">
              <a
                v-for="section in sectionItems"
                :key="section.key"
                :href="`#${section.id}`"
                class="block rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-white"
              >
                {{ section.index }}. {{ section.title }}
              </a>
            </nav>
            <div class="mt-4 grid gap-3">
              <NuxtLink to="/support?source=policy" class="inline-flex items-center justify-center border border-zinc-900 bg-zinc-900 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-white transition-colors hover:bg-zinc-700">
                联系支持
              </NuxtLink>
              <NuxtLink to="/info/brand-story" class="inline-flex items-center justify-center border border-zinc-200 px-4 py-3 text-xs font-bold uppercase tracking-[0.18em] text-zinc-900 transition-colors hover:border-zinc-400 hover:bg-zinc-50">
                品牌故事
              </NuxtLink>
            </div>
          </div>
        </aside>
      </div>
    </article>
  </main>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  eyebrow: {
    type: String,
    default: 'Policy'
  },
  title: {
    type: String,
    required: true
  },
  summary: {
    type: String,
    default: ''
  },
  updatedAt: {
    type: String,
    default: '2026-05-20'
  },
  sections: {
    type: Array,
    required: true
  }
})

const topAnchorId = 'policy-top'

const sectionItems = computed(() => (Array.isArray(props.sections) ? props.sections : [])
  .map((section, index) => ({
    index: index + 1,
    id: `policy-section-${index + 1}`,
    key: `${index + 1}-${String(section?.title || 'section')}`,
    title: String(section?.title || '').trim() || `第 ${index + 1} 节`,
    body: Array.isArray(section?.body)
      ? section.body.map((paragraph) => String(paragraph || '').trim()).filter(Boolean)
      : []
  }))
  .filter((section) => section.title || section.body.length))
</script>
