<template>
  <div class="bg-white min-h-screen relative overflow-hidden">
    <Transition name="fade">
      <div v-if="pending" class="fixed inset-0 z-[300] bg-white flex flex-col items-center justify-center">
        <div class="w-12 h-12 border-4 border-zinc-100 border-t-black rounded-full animate-spin mb-6"></div>
        <p class="font-mono text-[10px] tracking-[0.3em] uppercase">Fetching Product Intel...</p>
      </div>
    </Transition>

    <div class="page-back-button fixed top-24 left-4 md:top-32 md:left-12 z-[70] md:z-[100] mix-blend-difference pointer-events-none">
      <button @click="handleBack" class="flex items-center gap-4 text-white hover:scale-105 transition-transform duration-300 group pointer-events-auto cursor-pointer">
        <div class="w-10 h-10 flex items-center justify-center rounded-full border border-white/50 group-hover:border-white transition-colors">
          <svg class="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        </div>
        <span class="hidden md:block text-xs font-bold tracking-[0.2em]">返回</span>
      </button>
    </div>

    <FrontState
      v-if="!pending && error"
      type="error"
      eyebrow="Product Connection"
      title="产品详情暂时无法加载"
      description="无法连接至产品数据源，请检查后端服务状态，或稍后重新加载。"
      show-retry
      @retry="refresh"
    />

    <FrontState
      v-else-if="!pending && !product"
      eyebrow="Product Missing"
      title="未找到该产品"
      description="该产品可能已隐藏、删除或链接已更新。你可以返回产品目录继续浏览其他型号。"
      :show-retry="false"
    />

    <div v-else-if="product" class="animate-in fade-in">
      <section class="min-h-[48vh] md:min-h-[68vh] relative flex items-end justify-center bg-black overflow-hidden pb-10 md:pb-16">
        <div class="absolute inset-0 z-0">
          <img :src="heroImage" :alt="product.title" loading="eager" fetchpriority="high" decoding="async" sizes="100vw" class="w-full h-full object-cover opacity-35 gsap-detail-hero-img" @error="imageFallback" />
          <div class="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-900/60 to-black/20"></div>
        </div>
        <div class="relative z-10 max-w-7xl w-full px-4 text-white gsap-fade-up">
          <p class="text-[10px] md:text-xs font-mono tracking-[0.35em] uppercase text-zinc-400 mb-5">{{ product.series }} Series</p>
          <div class="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 md:gap-8">
            <div>
              <h1 class="text-3xl font-serif italic tracking-tighter mb-4 md:mb-6 sm:text-5xl md:text-7xl">{{ product.title }}</h1>
              <p class="text-zinc-300 text-sm md:text-lg leading-relaxed max-w-2xl">{{ product.description }}</p>
            </div>
            <div class="lg:text-right">
              <p class="text-2xl md:text-4xl font-black tracking-widest">{{ formatPrice(product.price) }}</p>
              <p class="text-[10px] text-zinc-500 uppercase tracking-widest mt-3">库存 {{ product.quantity }} 件</p>
            </div>
          </div>
        </div>
      </section>

      <section class="max-w-7xl mx-auto px-4 py-10 md:py-24">
        <div class="flex flex-col lg:flex-row gap-8 lg:gap-16 items-start">
          <div class="product-detail-media w-full lg:w-1/2 lg:sticky lg:top-24 gsap-fade-up">
            <div class="product-detail-main-image aspect-[16/10] md:aspect-[4/5] bg-zinc-100 overflow-hidden shadow-xl md:shadow-2xl relative rounded-sm border border-zinc-100">
              <img :src="activeImage || product.imageUrl" :alt="product.title" loading="eager" fetchpriority="high" decoding="async" sizes="(min-width: 1024px) 50vw, 100vw" class="w-full h-full object-cover hover:scale-105 transition-transform duration-1000" @error="imageFallback" />
            </div>
            <div v-if="product.gallery.length > 1" class="product-detail-gallery grid grid-cols-3 gap-3 mt-4">
              <button
                v-for="image in product.gallery"
                :key="image"
                type="button"
                class="aspect-[4/3] border overflow-hidden bg-zinc-100 transition-all rounded-sm hover:-translate-y-0.5"
                :class="activeImage === image ? 'border-black opacity-100 ring-2 ring-black/10' : 'border-zinc-200 opacity-60 hover:opacity-100'"
                @click="activeImage = image"
              >
                <img :src="image" :alt="product.title" loading="lazy" decoding="async" sizes="(min-width: 1024px) 16vw, 33vw" class="w-full h-full object-cover transition-transform duration-500 hover:scale-105" @error="imageFallback" />
              </button>
            </div>
          </div>

          <div class="w-full lg:w-1/2 space-y-8 md:space-y-12 pt-2 lg:pt-4">
            <div class="gsap-fade-up-stagger">
              <span class="text-[10px] font-bold text-gray-400 uppercase tracking-[0.25em] mb-4 block">Product Story</span>
              <h2 class="text-2xl md:text-4xl font-serif italic mb-4 md:mb-5 text-black leading-tight">设计、触感与音色的平衡。</h2>
              <p class="text-sm md:text-base text-gray-600 leading-relaxed">{{ product.description }}</p>
            </div>

            <div class="detail-info-panel border-t border-gray-200 pt-8 md:pt-10 gsap-fade-up-stagger">
              <h3 class="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-6">核心声学特性</h3>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div v-for="(feat, idx) in product.features" :key="idx" class="space-y-3">
                  <div class="w-6 h-[2px] bg-black"></div>
                  <p class="text-gray-800 text-sm font-medium leading-relaxed">{{ feat }}</p>
                </div>
              </div>
            </div>

            <div class="detail-info-panel border-t border-gray-200 pt-8 md:pt-10 gsap-fade-up-stagger">
              <h3 class="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-6">结构化参数</h3>
              <dl class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div v-for="spec in product.specs" :key="spec.label" class="bg-zinc-50 border border-zinc-100 p-5 rounded-sm">
                  <dt class="text-gray-400 mb-2 text-xs">{{ spec.label }}</dt>
                  <dd class="font-bold text-black leading-snug">{{ spec.value }}</dd>
                </div>
              </dl>
            </div>

            <div class="detail-info-panel border-t border-gray-200 pt-8 md:pt-10 gsap-fade-up-stagger">
              <h3 class="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-6">产品信息</h3>
              <dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 text-sm">
                <div v-if="product.sku">
                  <dt class="text-gray-400 mb-1">SKU</dt>
                  <dd class="font-bold text-black">{{ product.sku }}</dd>
                </div>
                <div v-if="product.model">
                  <dt class="text-gray-400 mb-1">型号</dt>
                  <dd class="font-bold text-black">{{ product.model }}</dd>
                </div>
                <div v-if="product.color">
                  <dt class="text-gray-400 mb-1">颜色 / 配置</dt>
                  <dd class="font-bold text-black">{{ product.color }}</dd>
                </div>
                <div>
                  <dt class="text-gray-400 mb-1">产品系列</dt>
                  <dd class="font-bold text-black">{{ product.series }}</dd>
                </div>
                <div>
                  <dt class="text-gray-400 mb-1">产品分类</dt>
                  <dd class="font-bold text-black">{{ product.typeLabel }}</dd>
                </div>
                <div>
                  <dt class="text-gray-400 mb-1">库存状态</dt>
                  <dd class="font-bold text-black">{{ product.quantity > 0 ? '可咨询体验' : '待补货' }}</dd>
                </div>
                <div>
                  <dt class="text-gray-400 mb-1">报价方式</dt>
                  <dd class="font-bold text-black">{{ product.price ? '公开参考价' : '专属顾问报价' }}</dd>
                </div>
              </dl>
              <div v-if="product.scenes.length" class="mt-8">
                <p class="text-gray-400 text-xs mb-3">适用场景</p>
                <div class="flex flex-wrap gap-2">
                  <span v-for="scene in product.scenes" :key="scene" class="px-3 py-2 bg-black text-white text-[10px] font-bold tracking-widest uppercase">{{ scene }}</span>
                </div>
              </div>
              <p v-if="product.warranty" class="mt-8 text-xs md:text-sm text-gray-500 leading-relaxed border-l-2 border-black pl-5">{{ product.warranty }}</p>
              <div v-if="product.accessories.length" class="mt-8">
                <p class="text-gray-400 text-xs mb-3">推荐配件 / 组合</p>
                <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <span v-for="accessory in product.accessories" :key="accessory" class="rounded-sm border border-zinc-100 bg-zinc-50 px-4 py-3 text-xs font-bold text-zinc-700">{{ accessory }}</span>
                </div>
              </div>
            </div>

            <div v-if="relatedFaqs.length || supportDownloads.length" class="detail-info-panel border-t border-gray-200 pt-8 md:pt-10 gsap-fade-up-stagger">
              <h3 class="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-6">资料与售后支持</h3>
              <div class="grid grid-cols-1 gap-4">
                <a
                  v-for="file in supportDownloads"
                  :key="`download-${file.id || file.name}`"
                  :href="file.fileUrl || '/support?type=download'"
                  target="_blank"
                  class="group flex items-center justify-between gap-4 border border-zinc-100 bg-zinc-50 px-5 py-4 transition-colors hover:border-black"
                  @click="trackResourceDownload(file)"
                >
                  <span class="min-w-0">
                    <span class="block truncate text-sm font-bold text-black">{{ file.name }}</span>
                    <span class="mt-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-400">{{ file.type || '资料下载' }} {{ file.size ? `/ ${file.size}` : '' }}</span>
                  </span>
                  <span class="shrink-0 text-[10px] font-black uppercase tracking-widest text-zinc-400 group-hover:text-black">下载</span>
                </a>
                <NuxtLink
                  v-if="!supportDownloads.length"
                  to="/support?type=download&source=product-detail"
                  class="flex items-center justify-between gap-4 border border-zinc-100 bg-zinc-50 px-5 py-4 transition-colors hover:border-black"
                >
                  <span>
                    <span class="block text-sm font-bold text-black">查看产品资料与服务支持</span>
                    <span class="mt-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-400">Downloads & Service</span>
                  </span>
                  <span class="text-[10px] font-black uppercase tracking-widest text-zinc-400">进入</span>
                </NuxtLink>
              </div>
              <div v-if="relatedFaqs.length" class="mt-6 space-y-3">
                <details v-for="faq in relatedFaqs" :key="`faq-${faq.id || faq.question}`" class="group border border-zinc-100 bg-white px-5 py-4 open:border-black">
                  <summary class="cursor-pointer list-none text-sm font-bold text-black">
                    <span class="flex items-center justify-between gap-4">
                      <span>{{ faq.question }}</span>
                      <span class="text-zinc-300 transition-transform group-open:rotate-45">+</span>
                    </span>
                  </summary>
                  <p class="mt-4 text-sm leading-relaxed text-zinc-500">{{ faq.answer }}</p>
                </details>
              </div>
            </div>

            <div class="bg-zinc-50 p-5 md:p-8 border border-gray-100 rounded-sm gsap-fade-up-stagger">
              <h3 class="text-xl font-bold mb-3 text-black">亲身感受纯粹之音</h3>
              <p class="text-xs md:text-sm text-gray-500 mb-6 leading-relaxed">留下联系方式，品牌顾问将协助您预约试奏、查询门店或获取专属报价。</p>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button type="button" @click="openModal('appointment')" class="min-h-12 bg-black text-white py-4 text-xs font-bold uppercase tracking-widest hover:bg-zinc-800 transition-all active:scale-95">预约试奏</button>
                <button type="button" @click="openModal('quote')" class="min-h-12 border border-black text-black py-4 text-xs font-bold uppercase tracking-widest hover:bg-black hover:text-white transition-all active:scale-95">咨询报价</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section v-if="relatedProducts.length" class="max-w-7xl mx-auto px-4 pb-20 md:pb-24">
        <div class="flex flex-col md:flex-row md:items-end md:justify-between gap-6 border-t border-gray-200 pt-12 mb-8">
          <div>
            <span class="text-[10px] font-bold text-gray-400 uppercase tracking-[0.25em] block mb-3">Related Collection</span>
            <h2 class="text-3xl md:text-4xl font-serif italic text-black">同类声学选择</h2>
          </div>
          <NuxtLink to="/products" class="text-xs font-bold tracking-[0.2em] uppercase border-b border-black pb-1 text-black hover:text-gray-500 hover:border-gray-400 transition-colors">
            返回目录
          </NuxtLink>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          <NuxtLink
            v-for="item in relatedProducts"
            :key="item.id"
            :to="`/products/${item.slug || item.id}`"
            class="group border border-gray-100 bg-white hover:border-black transition-colors"
          >
            <div class="aspect-[4/3] bg-zinc-100 overflow-hidden">
              <img :src="item.imageUrl" :alt="item.title" loading="lazy" decoding="async" sizes="(min-width: 768px) 33vw, 100vw" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" @error="imageFallback" />
            </div>
            <div class="p-5">
              <p class="text-[9px] text-gray-400 tracking-[0.3em] uppercase font-bold mb-3">{{ item.series }}</p>
              <h3 class="text-lg font-black text-black mb-3 leading-snug group-hover:text-gray-500 transition-colors">{{ item.title }}</h3>
              <div class="flex justify-between items-center border-t border-gray-100 pt-4 text-[11px] font-bold tracking-widest">
                <span>{{ formatPrice(item.price) }}</span>
                <span class="text-gray-400">库存 {{ item.quantity }}</span>
              </div>
            </div>
          </NuxtLink>
        </div>
      </section>

      <section class="py-24 bg-zinc-950 text-white text-center px-4 relative overflow-hidden">
        <div class="absolute inset-0 z-0 opacity-20 grayscale">
          <img :src="product.imageUrl" :alt="product.title" loading="lazy" decoding="async" sizes="100vw" class="w-full h-full object-cover" @error="imageFallback" />
        </div>
        <div class="relative z-10 max-w-4xl mx-auto gsap-fade-up">
          <h2 class="text-2xl md:text-4xl font-serif italic leading-tight mb-6">"它不只是一件设备，<br>更是情感与灵感的放大器。"</h2>
          <p class="text-zinc-500 tracking-[0.3em] uppercase text-[10px] font-bold">胡氏管乐技术服务团队</p>
        </div>
      </section>
    </div>

    <Transition name="mobile-cta">
      <div v-if="product && !isModalOpen" class="mobile-bottom-cta fixed bottom-0 left-0 right-0 z-[120] md:hidden bg-white/92 backdrop-blur-xl border-t border-zinc-200 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-18px_40px_-28px_rgba(0,0,0,0.55)] transition-all duration-300">
        <div class="flex items-center gap-3">
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-bold text-black">{{ product.title }}</p>
            <p class="text-[10px] tracking-widest text-zinc-400 uppercase">{{ formatPrice(product.price) }}</p>
          </div>
          <button type="button" @click="openModal('appointment')" class="min-h-11 rounded-sm bg-black px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-white">试奏</button>
          <button type="button" @click="openModal('quote')" class="min-h-11 rounded-sm border border-black px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-black">报价</button>
          <a :href="phoneHref" class="flex min-h-11 items-center rounded-sm border border-zinc-200 px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-black" @click="trackPhoneCta">电话</a>
        </div>
      </div>
    </Transition>

    <Teleport to="body">
      <Transition name="modal-pop">
        <div v-if="isModalOpen" class="fixed inset-0 z-[200] flex items-center justify-center p-4" @keydown.esc="closeModal" tabindex="-1">
          <div @click="closeModal" class="absolute inset-0 bg-black/60 backdrop-blur-md"></div>
          <div class="relative bg-white w-full max-w-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:p-10 shadow-2xl rounded-sm max-h-[90dvh] overflow-y-auto">
            <div class="flex justify-between items-start mb-8 gap-6">
              <div>
                <h2 class="text-xl font-bold uppercase tracking-widest">{{ modalTitle }}</h2>
                <p class="text-xs text-gray-400 mt-2">产品顾问将尽快与您联系。</p>
              </div>
              <button type="button" @click="closeModal" class="flex h-11 w-11 shrink-0 items-center justify-center text-gray-400 hover:text-black text-3xl leading-none transition-transform hover:rotate-90" aria-label="关闭弹窗">&times;</button>
            </div>
            <form @submit.prevent="handleSubmit" class="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <input type="text" :value="product?.title" disabled class="sm:col-span-2 w-full bg-gray-50 border px-6 py-4 text-gray-400 cursor-not-allowed font-bold text-sm" />
              <label class="form-field">
                <input v-model="formData.name" type="text" required maxlength="30" autocomplete="name" placeholder="您的姓名" class="form-control" />
                <span v-if="formErrors.name" class="form-error">{{ formErrors.name }}</span>
              </label>
              <label class="form-field">
                <input v-model="formData.phone" type="tel" required maxlength="11" inputmode="tel" autocomplete="tel" placeholder="联系电话" class="form-control" />
                <span v-if="formErrors.phone" class="form-error">{{ formErrors.phone }}</span>
              </label>
              <input v-model="formData.city" type="text" maxlength="30" autocomplete="address-level2" placeholder="所在城市" class="w-full border px-6 py-4 focus:border-black outline-none transition-colors text-sm min-h-12" />
              <select v-model="formData.budget" class="w-full border px-6 py-4 focus:border-black outline-none transition-colors text-sm bg-white">
                <option value="">预算区间</option>
                <option value="1 万以内">1 万以内</option>
                <option value="1-5 万">1-5 万</option>
                <option value="5-15 万">5-15 万</option>
                <option value="15 万以上">15 万以上</option>
              </select>
              <input v-model="formData.preferredTime" type="text" maxlength="40" placeholder="期望联系 / 试奏时间" class="sm:col-span-2 w-full border px-6 py-4 focus:border-black outline-none transition-colors text-sm min-h-12" />
              <textarea v-model="formData.message" rows="3" placeholder="补充需求，例如用途、场地、音色偏好或安装条件" class="sm:col-span-2 w-full border px-6 py-4 focus:border-black outline-none transition-colors text-sm min-h-28"></textarea>
              <input v-model="honeypot" type="text" name="website" tabindex="-1" autocomplete="off" class="hidden" aria-hidden="true" />
              <button type="submit" :disabled="isSubmitting" class="sm:col-span-2 w-full bg-black text-white py-4 mt-2 text-xs font-bold uppercase tracking-widest hover:bg-zinc-800 transition-all disabled:bg-gray-300 disabled:cursor-wait min-h-12">
                <span class="inline-flex items-center justify-center gap-3">
                  <span v-if="isSubmitting" class="h-3 w-3 rounded-full border-2 border-white/40 border-t-white animate-spin"></span>
                  {{ isSubmitting ? '提交中...' : '提交申请' }}
                </span>
              </button>
            </form>
          </div>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="modal-pop">
        <div v-if="showSuccessGuide && product" class="fixed inset-0 z-[210] flex items-center justify-center p-4">
          <button type="button" class="absolute inset-0 bg-black/55 backdrop-blur-md" aria-label="关闭提交成功引导" @click="showSuccessGuide = false"></button>
          <div class="relative w-full max-w-xl rounded-sm bg-white p-6 shadow-2xl md:p-10">
            <p class="mb-3 text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-400">Request Received</p>
            <h2 class="mb-4 text-2xl font-black text-black md:text-3xl">申请已提交</h2>
            <p class="mb-8 text-sm leading-relaxed text-zinc-500">
              产品顾问会根据您提交的产品、城市与时间偏好跟进。等待期间，可以继续查看同系列产品、售后政策或回到产品目录做对比。
            </p>
            <div class="grid gap-3 sm:grid-cols-3">
              <NuxtLink to="/products" class="border border-black px-4 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-black transition-colors hover:bg-black hover:text-white" @click="showSuccessGuide = false">
                产品目录
              </NuxtLink>
              <NuxtLink v-if="relatedProducts[0]" :to="`/products/${relatedProducts[0].slug || relatedProducts[0].id}`" class="border border-zinc-200 px-4 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-black transition-colors hover:border-black" @click="showSuccessGuide = false">
                同系列推荐
              </NuxtLink>
              <NuxtLink to="/support" class="border border-zinc-200 px-4 py-3 text-center text-[10px] font-bold uppercase tracking-widest text-black transition-colors hover:border-black" @click="showSuccessGuide = false">
                售后支持
              </NuxtLink>
            </div>
            <button type="button" class="mt-6 text-xs font-bold tracking-widest text-zinc-400 transition-colors hover:text-black" @click="showSuccessGuide = false">
              继续留在当前页面
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { computed, ref, reactive, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { conversionEvents } from '../../lib/analytics'
import { formatProductPrice, parseJsonValue } from '../../lib/products'
import { buildProductSchema, createStructuredDataScript } from '../../lib/seo'

const route = useRoute()
const router = useRouter()
const mediaUrl = useMediaUrl()
const brandAssets = useBrandAssets()
const imageFallback = useImageFallback(brandAssets.productPiano)
const siteUrl = useSiteUrl()
const productsUrl = useApiUrl('/api/products')
const inquiryUrl = useApiUrl('/api/inquiries')
const faqsUrl = useApiUrl('/api/support-faqs')
const downloadsUrl = useApiUrl('/api/support-downloads')
const toast = useState('global-toast')
const { track, guardPayload: getTrackingPayload } = useAuralTrack()
const smartBack = useSmartBack('/products')

const isModalOpen = ref(false)
const modalType = ref('appointment')
const isSubmitting = ref(false)
const activeImage = ref('')
const showSuccessGuide = ref(false)
useOverlayLock('product-inquiry-modal', isModalOpen)
useOverlayLock('product-success-guide', showSuccessGuide)
const inquiryOverlayHistory = useOverlayHistory('product-inquiry-modal', isModalOpen, () => {
  isModalOpen.value = false
})
const successOverlayHistory = useOverlayHistory('product-success-guide', showSuccessGuide, () => {
  showSuccessGuide.value = false
})
const formData = reactive({ name: '', phone: '', city: '', budget: '', preferredTime: '', message: '' })
const { honeypot, getGuardPayload, canSubmit, resetGuard } = useFormGuard('product-inquiry')
const trackedProductKeys = new Set()
let ctx
let animationTimer = 0

const { data: rawData, pending, error, refresh } = await useFetch(productsUrl, {
  lazy: true,
  key: 'products-detail-source',
  default: () => ({ data: [] })
})
const { data: faqResponse } = await useFetch(faqsUrl, {
  lazy: true,
  key: 'product-detail-faqs',
  default: () => ({ data: [] })
})
const { data: downloadResponse } = await useFetch(downloadsUrl, {
  lazy: true,
  server: false,
  key: 'product-detail-downloads',
  default: () => ({ data: [] })
})

const typeLabels = {
  piano: '原声钢琴',
  guitar: '吉他与贝斯',
  synth: '电子键盘'
}

const fallbackFeatures = {
  piano: [
    '严选高等级云杉音板与稳定共鸣结构，呈现自然、宽阔的动态层次。',
    '精密机械联动系统，带来细腻触键反馈与稳定控制。',
    '出厂前经过多轮调律与整音校准，保证音色一致性。',
    '兼顾家庭练习、教学与专业演奏场景。'
  ],
  guitar: [
    '精选稳定木材与舒适琴体曲线，兼顾共鸣与长时间演奏。',
    '高灵敏拾音系统，捕捉指尖动态与音色细节。',
    '人体工学琴颈设计，让复杂把位转换更顺畅。',
    '可靠电路与硬件配置，适合舞台和录音室使用。'
  ],
  synth: [
    '面向现代制作流程的音色引擎，兼顾舞台与录音室创作。',
    '丰富可编辑参数，帮助快速塑造个性化声音。',
    '高表现力键盘响应，提升实时演奏控制。',
    '支持外部扩展与多通道联动。'
  ],
  default: [
    '采用高品质材料与严谨结构设计，兼顾耐用性与表现力。',
    '经过声学检验和关键参数校准，保证稳定输出。',
    '适合演奏、创作、教学与专业应用场景。',
    '提供品牌技术支持与售后服务。'
  ]
}

const normalizeStringList = (value) => parseJsonValue(value, [])
  .map((item) => {
    if (typeof item === 'string') return item.trim()
    if (item && typeof item === 'object') return String(item.name || item.title || item.label || item.value || '').trim()
    return ''
  })
  .filter(Boolean)

const normalizeProduct = (targetProduct) => {
  const item = targetProduct.attributes || targetProduct
  const imagePath = item.image?.data?.attributes?.url || item.imageUrl
  const imageUrl = mediaUrl(imagePath, brandAssets.productPiano)
  const rawGallery = parseJsonValue(item.gallery, [])
  const gallery = [imagePath, ...rawGallery]
    .filter(Boolean)
    .map((image) => mediaUrl(image, imageUrl))
    .filter((image, index, list) => list.indexOf(image) === index)

  return {
    id: targetProduct.id,
    slug: item.slug || '',
    sku: item.sku || '',
    model: item.model || '',
    color: item.color || '',
    title: item.title || '产品详情',
    type: item.type || 'default',
    typeLabel: typeLabels[item.type] || item.type || '声学设备',
    description: item.description || '这件作品暂无详细描述，但它的声音足以说明一切。',
    price: Number(item.price || 0),
    quantity: Number(item.quantity || 0),
    series: item.series || item.categoryName || 'PREMIUM',
    imageUrl,
    gallery: gallery.length ? gallery : [imageUrl],
    specs: parseJsonValue(item.specs, [
      { label: '产品系列', value: item.series || item.categoryName || 'HUSHI WIND' },
      { label: '产品分类', value: typeLabels[item.type] || item.type || '声学设备' },
      { label: '库存状态', value: Number(item.quantity || 0) > 0 ? '可咨询体验' : '待补货' },
      { label: '报价方式', value: Number(item.price || 0) > 0 ? '公开参考价' : '专属顾问报价' }
    ]),
    features: parseJsonValue(item.features, fallbackFeatures[item.type] || fallbackFeatures.default),
    scenes: parseJsonValue(item.scenes, []),
    warranty: item.warranty || '',
    relatedProductIds: normalizeStringList(item.relatedProductIds),
    accessories: normalizeStringList(item.accessories)
  }
}

const product = computed(() => {
  const dataList = rawData.value?.data
  if (!dataList || dataList.length === 0) return null

  const requestedKey = String(route.params.id || '')
  const targetProduct = dataList.find((p) => {
    const attrs = p.attributes || p
    return p.id.toString() === requestedKey || attrs.slug === requestedKey
  })
  if (!targetProduct) return null

  return normalizeProduct(targetProduct)
})

const heroImage = computed(() => product.value?.gallery?.[0] || product.value?.imageUrl || '')
const modalTitle = computed(() => modalType.value === 'quote' ? '咨询报价' : '预约试奏')
const phoneHref = computed(() => 'tel:4008887726')
const relatedProducts = computed(() => {
  if (!product.value) return []
  const explicitIds = new Set(product.value.relatedProductIds.map(String))
  const currentScenes = new Set(product.value.scenes)
  return (rawData.value?.data || [])
    .map(normalizeProduct)
    .filter((item) => item.id !== product.value.id)
    .map((item) => ({
      ...item,
      score: Number(explicitIds.has(String(item.id)) || explicitIds.has(item.slug)) * 10
        + Number(item.type === product.value.type) * 4
        + Number(item.series === product.value.series) * 2
        + item.scenes.filter((scene) => currentScenes.has(scene)).length
    }))
    .sort((a, b) => b.score - a.score || b.quantity - a.quantity)
    .slice(0, 3)
})
const relatedFaqs = computed(() => {
  if (!product.value) return []
  const keywords = [
    product.value.title,
    product.value.series,
    product.value.typeLabel,
    product.value.type,
    product.value.model,
    product.value.sku
  ].filter(Boolean).map((item) => String(item).toLowerCase())
  const rows = faqResponse.value?.data || []
  return rows
    .filter((item) => {
      const haystack = `${item.question || ''} ${item.answer || ''} ${item.category || ''}`.toLowerCase()
      return keywords.some((keyword) => keyword && haystack.includes(keyword))
    })
    .slice(0, 3)
})
const supportDownloads = computed(() => {
  if (!product.value) return []
  const keywords = [product.value.title, product.value.series, product.value.typeLabel, product.value.model, product.value.sku]
    .filter(Boolean)
    .map((item) => String(item).toLowerCase())
  const rows = downloadResponse.value?.data || []
  return rows
    .filter((item) => {
      const haystack = `${item.name || ''} ${item.type || ''}`.toLowerCase()
      return keywords.some((keyword) => keyword && haystack.includes(keyword))
    })
    .slice(0, 3)
})

watch(product, (nextProduct) => {
  activeImage.value = nextProduct?.gallery?.[0] || nextProduct?.imageUrl || ''
  if (!nextProduct) return
  const trackingKey = `${nextProduct.id}:${nextProduct.slug || route.params.id}`
  if (trackedProductKeys.has(trackingKey)) return
  trackedProductKeys.add(trackingKey)
  track(conversionEvents.productView, {
    entityType: 'product',
    entityId: String(nextProduct.id),
    entityTitle: nextProduct.title,
    metadata: {
      type: nextProduct.type,
      series: nextProduct.series,
      price: nextProduct.price,
      quantity: nextProduct.quantity
    }
  })
}, { immediate: true })

const formatPrice = formatProductPrice

const handleBack = () => {
  smartBack()
}

const openModal = (type) => {
  showSuccessGuide.value = false
  modalType.value = type
  isModalOpen.value = true
  track('cta_click', {
    entityType: 'product',
    entityId: product.value?.id ? String(product.value.id) : '',
    entityTitle: product.value?.title || '',
    ctaName: type
  })
  track(conversionEvents.inquiryStart, {
    entityType: 'product',
    entityId: product.value?.id ? String(product.value.id) : '',
    entityTitle: product.value?.title || '',
    ctaName: type
  })
}

const closeModal = () => {
  inquiryOverlayHistory.closeViaHistory()
}

const showToast = (message, type = 'success') => {
  toast.value = { show: true, message, type }
  setTimeout(() => { toast.value.show = false }, 3500)
}

const resetForm = () => {
  Object.assign(formData, { name: '', phone: '', city: '', budget: '', preferredTime: '', message: '' })
}

const formErrors = reactive({ name: '', phone: '' })

const clearFormErrors = () => {
  formErrors.name = ''
  formErrors.phone = ''
}

watch(() => formData.name, () => { formErrors.name = '' })
watch(() => formData.phone, () => { formErrors.phone = '' })

const trackPhoneCta = () => {
  track('cta_click', {
    entityType: 'product',
    entityId: product.value?.id ? String(product.value.id) : '',
    entityTitle: product.value?.title || '',
    ctaName: 'mobile-phone-consult',
    metadata: { source: 'product-detail-mobile-cta' }
  })
}

const trackResourceDownload = (file) => {
  track(conversionEvents.resourceDownload, {
    entityType: 'support-download',
    entityId: String(file.id || ''),
    entityTitle: file.name || '',
    metadata: { source: 'product-detail', productId: product.value?.id, fileType: file.type || '' }
  })
}

const handleSubmit = async () => {
  clearFormErrors()
  const name = formData.name.trim()
  const phone = formData.phone.trim()
  if (name.length < 2) {
    formErrors.name = '请输入至少 2 个字符的姓名'
    return showToast('请输入有效姓名', 'error')
  }
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    formErrors.phone = '请输入有效的 11 位手机号'
    return showToast('请输入有效的 11 位手机号', 'error')
  }
  const guard = canSubmit()
  if (!guard.ok) return showToast(guard.message, 'error')

  isSubmitting.value = true
  try {
    await $fetch(inquiryUrl.value, {
      method: 'POST',
      body: {
        customerName: name,
        contactInfo: phone,
        inquiryType: modalType.value,
        productId: product.value?.id,
        productTitle: product.value?.title || '',
        city: formData.city.trim(),
        budget: formData.budget,
        preferredTime: formData.preferredTime.trim(),
        message: formData.message.trim() || '无补充需求',
        ...getTrackingPayload(),
        ...getGuardPayload()
      }
    })
    track(conversionEvents.inquirySubmit, {
      entityType: 'product',
      entityId: product.value?.id ? String(product.value.id) : '',
      entityTitle: product.value?.title || '',
      ctaName: modalType.value,
      metadata: { source: 'product-detail' }
    })
    showToast('申请已提交，品牌顾问将尽快联系您。')
    resetForm()
    resetGuard()
    inquiryOverlayHistory.closeDirect()
    showSuccessGuide.value = true
  } catch (error) {
    const message = error?.data?.error?.message || '提交失败，请稍后再试。'
    track('form_submit_failed', {
      entityType: 'product',
      entityId: product.value?.id ? String(product.value.id) : '',
      entityTitle: product.value?.title || '',
      ctaName: modalType.value,
      metadata: {
        source: 'product-detail',
        message,
        status: error?.status || error?.response?.status || ''
      }
    })
    showToast(message, 'error')
  } finally {
    isSubmitting.value = false
  }
}

const initAnimations = () => {
  if (process.server || !product.value) return
  useGsapCleanup(ctx, ScrollTrigger)

  ctx = gsap.context(() => {
    gsap.from('.gsap-fade-up', { y: 30, opacity: 0, duration: 1, ease: 'power3.out' })
    gsap.to('.gsap-detail-hero-img', { scale: 1.05, duration: 15, ease: 'none' })
    gsap.utils.toArray('.gsap-fade-up-stagger').forEach((elem) => {
      gsap.from(elem, { scrollTrigger: { trigger: elem, start: 'top 90%' }, y: 30, opacity: 0, duration: 0.8, ease: 'power3.out' })
    })
  })
}

onMounted(() => {
  gsap.registerPlugin(ScrollTrigger)
  if (!pending.value) initAnimations()
})

watch(pending, (newVal) => {
  if (newVal || process.server) return
  window.clearTimeout(animationTimer)
  animationTimer = window.setTimeout(initAnimations, 150)
})

onBeforeUnmount(() => {
  if (process.client) window.clearTimeout(animationTimer)
  useGsapCleanup(ctx, ScrollTrigger)
})

useSiteSeo({
  title: () => `${product.value?.title || '产品详情'} | 胡氏管乐`,
  description: () => product.value?.description || '查看胡氏管乐产品详情、核心特性、结构化参数与预约咨询方式。',
  path: () => `/products/${product.value?.slug || route.params.id}`,
  image: () => product.value?.imageUrl
})

useHead(() => ({
  script: product.value ? [
    createStructuredDataScript(buildProductSchema({ baseUrl: siteUrl.value, product: product.value, relatedProducts: relatedProducts.value }))
  ] : []
}))

useBreadcrumbSchema(() => [
  { name: '首页', path: '/' },
  { name: '产品中心', path: '/products' },
  { name: product.value?.title || '产品详情', path: `/products/${product.value?.slug || route.params.id}` }
])
</script>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.5s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.modal-pop-enter-active, .modal-pop-leave-active { transition: opacity 0.35s ease; }
.modal-pop-enter-from, .modal-pop-leave-to { opacity: 0; }
.modal-pop-enter-active > div.relative, .modal-pop-leave-active > div.relative { transition: transform 0.45s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.45s ease; }
.modal-pop-enter-from > div.relative { transform: translateY(18px) scale(0.97); opacity: 0; }
.modal-pop-leave-to > div.relative { transform: translateY(-8px) scale(0.98); opacity: 0; }
.mobile-cta-enter-active, .mobile-cta-leave-active { transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease; }
.mobile-cta-enter-from, .mobile-cta-leave-to { transform: translateY(100%); opacity: 0; }
.animate-in { animation: fadeIn 0.7s ease-out forwards; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
.form-field { display: flex; flex-direction: column; gap: 0.5rem; }
.form-control { width: 100%; min-height: 3rem; border: 1px solid #e5e7eb; padding: 1rem 1.5rem; font-size: 0.875rem; outline: none; transition: border-color 0.2s ease, background-color 0.2s ease; }
.form-control:focus { border-color: #000; background-color: #fafafa; }
.form-error { color: #dc2626; font-size: 0.75rem; line-height: 1.2; }
img { -webkit-user-drag: none; }

@media (min-width: 1024px) {
  .product-detail-media {
    max-height: calc(100vh - 7rem);
    overflow: hidden;
  }

  .product-detail-main-image {
    height: min(68vh, 680px);
    aspect-ratio: auto;
  }

  .product-detail-gallery {
    max-height: 8.5rem;
    overflow-y: auto;
    padding-right: 0.25rem;
  }

  .detail-info-panel {
    scroll-margin-top: 6rem;
  }
}
</style>
