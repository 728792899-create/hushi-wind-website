<template>
  <div
    ref="dialogRef"
    class="fixed inset-0 z-[220] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md"
    data-no-scroll-fx
    role="dialog"
    aria-modal="true"
    aria-labelledby="product-compare-title"
    tabindex="-1"
    @keydown.esc="close"
    @keydown="handleKeydown"
  >
    <button type="button" class="absolute inset-0 cursor-default" aria-label="关闭产品对比" @click="close"></button>
    <div class="relative flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div class="flex items-start justify-between gap-6 border-b border-zinc-100 px-5 py-5 md:px-8">
        <div>
          <p class="mb-2 text-[10px] font-black uppercase tracking-[0.28em] text-zinc-400">Compare</p>
          <h2 id="product-compare-title" class="text-2xl font-black text-black md:text-3xl">产品选型对比</h2>
          <p class="mt-2 text-sm leading-relaxed text-zinc-500">对比价格、库存、参数、适用场景与售后说明，快速判断哪一款更适合当前用途。</p>
        </div>
        <button type="button" data-autofocus class="h-11 w-11 shrink-0 rounded-full bg-zinc-100 text-2xl leading-none text-zinc-500 transition-all hover:bg-black hover:text-white" aria-label="关闭对比" @click="close">&times;</button>
      </div>

      <div class="overflow-auto px-4 py-5 md:px-8 md:py-7" tabindex="0" aria-label="产品对比内容，可横向滚动">
        <div class="space-y-4 md:hidden">
          <article v-for="item in products" :key="`mobile-${item.id}`" class="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
            <NuxtLink :to="`/products/${item.slug || item.id}`" class="flex gap-4" @click="close">
              <div class="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-zinc-100">
                <img v-if="item.image" :src="item.image" :alt="item.title" loading="lazy" decoding="async" sizes="96px" class="h-full w-full object-cover" @error="imageFallback" />
              </div>
              <div class="min-w-0">
                <p class="text-[10px] font-bold uppercase tracking-widest text-zinc-400">{{ item.series || item.type }}</p>
                <h3 class="mt-1 text-base font-black leading-snug text-black">{{ item.title }}</h3>
                <p class="mt-2 text-xs font-bold text-zinc-600">{{ formatPrice(item.price) }}</p>
              </div>
            </NuxtLink>
            <dl class="mt-4 divide-y divide-zinc-200 text-sm">
              <div v-for="row in compareRows" :key="`${item.id}-${row.label}`" class="grid grid-cols-[6rem_1fr] gap-3 py-3">
                <dt class="text-xs font-black text-zinc-400">{{ row.label }}</dt>
                <dd class="leading-relaxed text-zinc-700">{{ compareValueFor(row, item) }}</dd>
              </div>
            </dl>
          </article>
        </div>

        <table class="hidden min-w-[720px] w-full border-separate border-spacing-0 text-left text-sm md:table">
          <thead>
            <tr>
              <th class="sticky left-0 z-10 w-36 bg-white pb-4 pr-4 text-[10px] font-black uppercase tracking-widest text-zinc-400">项目</th>
              <th v-for="item in products" :key="item.id" class="pb-4 pr-4 align-top">
                <NuxtLink :to="`/products/${item.slug || item.id}`" class="group block" @click="close">
                  <div class="mb-3 aspect-[4/3] overflow-hidden rounded-xl bg-zinc-100">
                    <img v-if="item.image" :src="item.image" :alt="item.title" loading="lazy" decoding="async" sizes="(min-width: 768px) 25vw, 96px" class="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" @error="imageFallback" />
                  </div>
                  <p class="text-base font-black leading-snug text-black group-hover:text-zinc-500">{{ item.title }}</p>
                  <p class="mt-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400">{{ item.series || item.type }}</p>
                </NuxtLink>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in compareRows" :key="row.label">
              <th class="sticky left-0 z-10 border-t border-zinc-100 bg-white py-4 pr-4 text-xs font-black text-zinc-500">{{ row.label }}</th>
              <td v-for="(value, index) in row.values" :key="`${row.label}-${index}`" class="border-t border-zinc-100 py-4 pr-4 leading-relaxed text-zinc-700">
                {{ value || '暂未填写' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  products: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['close'])
const dialogRef = ref(null)
const { handleKeydown } = useDialogFocus(dialogRef)
const brandAssets = useBrandAssets()
const imageFallback = useImageFallback(brandAssets.productPiano)

const close = () => {
  emit('close')
}

const asList = (value) => Array.isArray(value) ? value : []

const formatPrice = (price) => {
  const amount = Number(price || 0)
  if (!amount) return '咨询报价'
  return `¥ ${amount.toFixed(2)}`
}

const compareRows = computed(() => {
  const selected = props.products || []
  const specLabels = [...new Set(selected.flatMap((product) => asList(product.specs).map((spec) => spec.label).filter(Boolean)))]
  const row = (label, mapper) => ({ label, values: selected.map(mapper) })
  return [
    row('参考价格', (product) => formatPrice(product.price)),
    row('库存状态', (product) => Number(product.quantity || 0) > 0 ? `可咨询体验：${product.quantity} 件` : '待补货'),
    row('产品系列', (product) => product.series),
    row('产品分类', (product) => product.type),
    row('适用场景', (product) => asList(product.scenes).join(' / ')),
    row('核心特性', (product) => asList(product.features).slice(0, 3).join(' / ')),
    row('售后说明', (product) => product.warranty)
  ].concat(specLabels.map((label) => row(`参数：${label}`, (product) => asList(product.specs).find((spec) => spec.label === label)?.value || '')))
})

const compareValueFor = (row, item) => {
  const index = props.products.findIndex((product) => product.id === item.id)
  return row.values[index] || '暂未填写'
}
</script>

<style scoped>
.compare-modal-enter-active,
.compare-modal-leave-active { transition: opacity 0.28s ease; }
.compare-modal-enter-from,
.compare-modal-leave-to { opacity: 0; }
.compare-modal-enter-active > div.relative,
.compare-modal-leave-active > div.relative { transition: transform 0.34s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.34s ease; }
.compare-modal-enter-from > div.relative,
.compare-modal-leave-to > div.relative { transform: translateY(18px) scale(0.98); opacity: 0; }
</style>
