<template>
  <div class="bg-[#fbfbfd] min-h-screen pb-32 relative overflow-x-hidden">

    <div class="page-back-button fixed top-24 left-4 md:top-32 md:left-12 z-[70] md:z-[100] mix-blend-difference pointer-events-none">
      <button @click="handleBack" class="flex items-center gap-4 text-white hover:scale-105 transition-transform duration-300 group pointer-events-auto">
        <div class="w-10 h-10 flex items-center justify-center rounded-full border border-white/50 group-hover:border-white transition-colors">
          <svg class="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
        </div>
        <span class="hidden md:block text-xs font-bold tracking-[0.2em] uppercase">返回</span>
      </button>
    </div>

    <section class="relative flex h-[38vh] min-h-[260px] items-center justify-center overflow-hidden bg-black text-white md:h-[60vh]">
      <div class="absolute inset-0 z-0">
        <img v-if="sysConfig.supportHeroImageUrl" :src="mediaUrl(sysConfig.supportHeroImageUrl)" class="w-full h-full object-cover opacity-40 transform scale-105 animate-[slowZoom_20s_ease-in-out_infinite_alternate]" alt="Support Background" loading="eager" fetchpriority="high" decoding="async" sizes="100vw" />
        <img v-else :src="brandAssets.supportHero" class="w-full h-full object-cover opacity-40 transform scale-105 animate-[slowZoom_20s_ease-in-out_infinite_alternate]" alt="Support Background" loading="eager" fetchpriority="high" decoding="async" sizes="100vw" />
      </div>
      <div class="relative z-10 text-center px-4 animate-in fade-in pt-8 md:pt-0">
        <h1 class="text-4xl md:text-9xl font-serif italic tracking-tighter text-white mb-4 md:mb-5 drop-shadow-2xl">Support</h1>
        <p class="text-zinc-300 text-xs md:text-xl max-w-2xl mx-auto font-light tracking-wide uppercase leading-relaxed drop-shadow-md">提供专业级技术支持与数字化售后解决方案。</p>
      </div>
    </section>

    <section class="max-w-[85rem] mx-auto px-4 md:px-12 mt-5 md:-mt-20 relative z-20">
      <div class="support-action-list grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        <div v-for="(item, index) in supportCategories" :key="item.name" role="button" tabindex="0" @click="openModal(item.action)" @keydown.enter.prevent="openModal(item.action)" @keydown.space.prevent="openModal(item.action)" class="support-action-card group relative min-h-[7.25rem] md:min-h-[10.5rem] bg-white/95 md:bg-white/92 backdrop-blur-xl overflow-hidden rounded-2xl md:rounded-[2rem] shadow-[0_12px_32px_-18px_rgba(0,0,0,0.22)] md:shadow-[0_20px_50px_-10px_rgba(0,0,0,0.05)] hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.15)] cursor-pointer p-5 md:p-6 lg:p-10 flex flex-col justify-between border border-zinc-100 md:border-white/50 transition-all duration-700 ease-[cubic-bezier(0.25,1,0.5,1)] hover:-translate-y-2 md:aspect-[4/5]">

          <div class="default-view relative z-10">
            <div class="w-6 h-[1px] bg-black/20 mb-4 md:mb-6 group-hover:w-12 group-hover:bg-black transition-all duration-700 ease-out"></div>
            <div class="text-zinc-400 font-mono text-[10px] tracking-[0.3em] mb-2 font-bold">0{{ index + 1 }}</div>
            <h3 class="text-xl md:text-2xl font-serif text-black mb-2 md:mb-3 group-hover:text-blue-600 transition-colors duration-500">{{ item.name }}</h3>
            <p class="text-zinc-500 text-xs md:text-sm font-light leading-relaxed">{{ item.tagline }}</p>
          </div>

          <div class="pointer-events-none absolute right-4 top-5 z-0 flex items-center justify-center md:static md:flex-1 opacity-100 md:opacity-10 group-hover:opacity-100 transition-opacity duration-700">
             <div class="flex h-10 w-10 md:h-20 md:w-20 items-center justify-center rounded-full border border-black/10 bg-zinc-50 text-xs md:text-xl font-serif italic text-black">{{ item.iconText }}</div>
          </div>
          <span class="support-action-arrow pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 text-xl text-zinc-300">→</span>

          <div class="absolute inset-0 border border-black/5 rounded-[2rem] pointer-events-none"></div>
        </div>
      </div>
    </section>

    <section class="py-16 md:py-40 max-w-4xl mx-auto px-4 mt-4 md:mt-10">
      <div class="text-center mb-8 md:mb-20">
        <span class="text-[10px] md:text-xs font-mono tracking-[0.26em] md:tracking-[0.3em] text-zinc-400 uppercase block mb-3 md:mb-4">Knowledge Base</span>
        <h2 class="text-2xl md:text-4xl font-serif italic text-black">常见问题 (FAQ)</h2>
        <div class="mt-8 flex gap-2 overflow-x-auto px-1 pb-2 md:flex-wrap md:justify-center">
          <button
            v-for="category in faqCategories"
            :key="category.value"
            type="button"
            class="min-h-11 shrink-0 px-4 py-2 rounded-full border text-[10px] font-bold tracking-widest uppercase transition-all"
            :class="activeFaqCategory === category.value ? 'bg-black text-white border-black' : 'bg-white text-zinc-500 border-zinc-200 hover:border-black hover:text-black'"
            @click="activeFaqCategory = category.value; activeFaq = null"
          >
            {{ category.label }}
          </button>
        </div>
      </div>

      <div v-if="pendingFaqs" class="text-center py-10"><div class="w-8 h-8 border-4 border-zinc-200 border-t-black rounded-full animate-spin mx-auto"></div></div>
      <FrontState
        v-else-if="errF"
        type="error"
        eyebrow="FAQ Connection"
        title="FAQ 暂时无法加载"
        description="无法连接至支持知识库，请检查后端服务状态，或稍后重新加载。"
        show-retry
        @retry="refreshFaqs"
      />

      <FrontState
        v-else-if="displayFaqs.length === 0"
        eyebrow="No FAQ"
        title="当前分类暂无 FAQ"
        description="可以切换其他分类，或直接提交支持工单让客服协助处理。"
        :show-retry="false"
      />

      <div v-else class="space-y-4">
        <div v-for="(faq, index) in displayFaqs" :key="index" class="border border-zinc-200/60 rounded-2xl bg-white p-4 md:p-8 cursor-pointer group hover:shadow-md transition-all duration-300 hover:-translate-y-1" role="button" tabindex="0" :aria-expanded="activeFaq === index" @click="toggleFaq(index, faq)" @keydown.enter.prevent="toggleFaq(index, faq)" @keydown.space.prevent="toggleFaq(index, faq)">
          <div class="flex justify-between items-start gap-4">
            <p class="font-bold text-base md:text-lg text-black group-hover:text-blue-600 transition-colors leading-snug">{{ faq.question }}</p>
            <span class="text-2xl text-zinc-400 group-hover:text-black transition-transform duration-300" :class="activeFaq === index ? 'rotate-45' : ''">+</span>
          </div>
          <Transition name="faq-expand">
          <div v-if="activeFaq === index" class="mt-5 md:mt-6 text-zinc-500 text-sm font-light leading-relaxed border-t border-zinc-100 pt-5 md:pt-6">
              <p>{{ faq.answer }}</p>
              <div class="mt-6 flex flex-wrap items-center gap-3">
                <span class="text-[10px] font-bold uppercase tracking-[0.24em] text-zinc-400">是否解决问题</span>
                <button type="button" class="min-h-11 rounded-full border border-zinc-200 px-4 py-2 text-[10px] font-bold tracking-widest text-black transition-colors hover:border-black" @click.stop="sendFaqFeedback(faq, true)">已解决</button>
                <button type="button" class="min-h-11 rounded-full border border-zinc-200 px-4 py-2 text-[10px] font-bold tracking-widest text-black transition-colors hover:border-black" @click.stop="sendFaqFeedback(faq, false)">未解决</button>
              </div>
            </div>
          </Transition>
        </div>
      </div>

      <div class="mt-14 md:mt-32 border-t border-zinc-200 pt-10 md:pt-20 flex flex-col items-center">
        <p class="text-[10px] md:text-xs tracking-[0.28em] md:tracking-[0.3em] text-zinc-400 uppercase mb-6 md:mb-8 font-bold">客服支持</p>
        <div class="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-16">
          <a :href="supportPhoneHref" class="flex min-h-11 items-center gap-4 text-black" @click="trackSupportPhone">
            <svg class="w-6 h-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
            <span class="font-serif italic text-2xl md:text-3xl tracking-widest">{{ supportPhone }}</span>
          </a>
          <span class="hidden md:block text-zinc-200">|</span>
          <a :href="`mailto:${supportEmail}`" class="flex min-h-11 items-center gap-4 text-black" @click="trackSupportEmail">
            <svg class="w-6 h-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
            <span class="font-serif italic text-lg md:text-xl tracking-wider">{{ supportEmail }}</span>
          </a>
        </div>
      </div>
    </section>

    <Teleport to="body">
      <Transition name="apple-modal">
        <div v-if="modal.show" class="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-900/40 backdrop-blur-md p-4 overflow-y-auto" @keydown.esc="closeModal" tabindex="-1">
          <div @click="closeModal" class="absolute inset-0 cursor-pointer"></div>

          <div class="support-modal relative bg-white/95 backdrop-blur-xl w-full max-w-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:p-10 lg:p-14 shadow-2xl rounded-[1.75rem] md:rounded-[2.5rem] border border-white flex flex-col max-h-[92dvh] my-auto">
            <button @click="closeModal" class="absolute top-5 right-5 md:top-8 md:right-8 w-11 h-11 flex items-center justify-center rounded-full bg-zinc-100 hover:bg-zinc-200 transition-all hover:rotate-90 z-50" aria-label="关闭弹窗">
              <svg class="w-4 h-4 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
            
            <div class="mb-6 md:mb-10 flex-shrink-0 pr-12" v-if="modal.type !== 'videoPlayer'">
              <h3 class="text-2xl md:text-3xl font-serif italic text-black mb-2">{{ modalTitle }}</h3>
              <p class="text-zinc-400 text-xs tracking-[0.2em] uppercase font-bold">{{ modalSubtitle }}</p>
            </div>

            <div class="flex-1 overflow-y-auto pr-1 md:pr-4 custom-scrollbar">

              <div v-if="modal.type === 'download'" class="space-y-4">
                <div v-if="pendingDownloads" class="text-center py-10 text-xs text-zinc-400 tracking-widest uppercase">Syncing...</div>
                <FrontState
                  v-else-if="displayDownloads.length === 0"
                  eyebrow="Downloads"
                  title="暂无可下载资料"
                  description="对应产品资料发布后会在这里展示；也可以提交支持工单获取人工协助。"
                  :show-retry="false"
                />
                <div v-else v-for="file in displayDownloads" :key="file.id" class="flex justify-between items-center p-6 bg-zinc-50/50 hover:bg-zinc-100 transition-colors rounded-2xl border border-zinc-100">
                  <div><p class="font-bold text-sm text-black mb-1">{{ file.name }}</p><p class="text-[10px] text-zinc-400 uppercase font-mono">{{ file.size }} | {{ file.type }}</p></div>
                  <a v-if="file.fileUrl" :href="file.fileUrl" target="_blank" download class="inline-flex min-h-11 items-center text-xs font-bold border-b border-black/20 pb-1 hover:border-black transition-colors text-black" @click="trackDownload(file)">DOWNLOAD</a>
                  <span v-else class="text-xs font-bold text-zinc-300 cursor-not-allowed">NO FILE</span>
                </div>
              </div>

              <div v-if="modal.type === 'quickstart'" class="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div v-if="pendingGuides" class="col-span-2 text-center py-10 text-xs text-zinc-400 tracking-widest uppercase">Loading...</div>
                <FrontState
                  v-else-if="displayGuides.length === 0"
                  class="col-span-2"
                  eyebrow="Guides"
                  title="暂无视频指南"
                  description="快速上手视频正在整理中。当前可通过支持工单获取产品使用建议。"
                  :show-retry="false"
                />
                <div v-else v-for="guide in displayGuides" :key="guide.title" class="group cursor-pointer flex flex-col" @click="playVideo(guide)">
                  <div class="aspect-video bg-black mb-4 overflow-hidden rounded-2xl relative shadow-sm group-hover:shadow-lg transition-all duration-500">
                     <img :src="guide.cover" :alt="guide.title" loading="lazy" decoding="async" sizes="(min-width: 768px) 33vw, 100vw" class="w-full h-full object-cover opacity-70 group-hover:scale-105 transition-transform duration-700 ease-out" />
                     <div class="absolute inset-0 flex items-center justify-center"><div class="w-12 h-12 rounded-full flex items-center justify-center bg-white/20 backdrop-blur-md group-hover:bg-white group-hover:text-black transition-all text-sm border border-white/30 text-white">▶</div></div>
                  </div>
                  <div class="w-4 h-[1px] bg-black/20 mb-3 group-hover:w-8 transition-all duration-500"></div>
                  <h4 class="font-serif text-lg text-black mb-1 leading-snug">{{ guide.title }}</h4>
                  <p class="text-[10px] text-zinc-400 uppercase font-mono tracking-widest">{{ guide.duration }} | {{ guide.category }}</p>
                </div>
              </div>

              <div v-if="modal.type === 'videoPlayer'" class="w-full pt-4">
                <video :src="currentVideo?.videoUrl" controls autoplay class="w-full aspect-video bg-black rounded-2xl shadow-xl outline-none mb-6"></video>
                <h4 class="text-2xl font-serif text-black">{{ currentVideo?.title }}</h4>
                <p class="text-xs text-zinc-400 uppercase font-mono tracking-widest mt-2 mb-8">{{ currentVideo?.category }}</p>
                <button @click="modal.type = 'quickstart'" class="min-h-11 text-xs font-bold border-b border-black/20 pb-1 hover:border-black transition-colors text-black">&larr; BACK TO LIST</button>
              </div>

              <div v-if="modal.type === 'contact'">
                <div v-if="supportSubmitError" class="mb-5 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm leading-relaxed text-red-700">
                  {{ supportSubmitError }} 请检查必填信息后再次提交，已填写内容会保留在表单中。
                </div>
                <form @submit.prevent="handleFormSubmit" class="flex flex-col gap-6">
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div class="flex flex-col gap-2">
                      <label class="text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">服务类型</label>
                      <select v-model="contactForm.serviceType" class="w-full border border-zinc-200 px-5 py-4 rounded-xl outline-none focus:border-black bg-zinc-50 transition-all">
                        <option value="repair">故障报修</option>
                        <option value="maintenance">保养维护</option>
                        <option value="software">固件 / 软件支持</option>
                        <option value="experience">试奏与门店咨询</option>
                      </select>
                    </div>
                    <div class="flex flex-col gap-2">
                      <label class="text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">购买渠道</label>
                      <input v-model="contactForm.purchaseChannel" type="text" maxlength="40" placeholder="官网 / 门店 / 经销商" class="w-full border border-zinc-200 px-5 py-4 rounded-xl outline-none focus:border-black focus:bg-white bg-zinc-50 transition-all" />
                    </div>
                  </div>
                  <div class="flex flex-col gap-2">
                    <label class="text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">姓名 <span>*</span></label>
                      <input v-model="contactForm.customerName" @input="contactForm.customerName = contactForm.customerName.replace(/[^\u4e00-\u9fa5a-zA-Z\s·]/g, '').slice(0, 20)" type="text" maxlength="20" autocomplete="name" required class="w-full border border-zinc-200 px-5 py-4 rounded-xl outline-none focus:border-black focus:bg-white bg-zinc-50 transition-all" />
                  </div>
                  <div class="flex flex-col gap-2">
                    <label class="text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">联系电话 <span>*</span></label>
                    <input v-model="contactForm.contactInfo" @input="contactForm.contactInfo = contactForm.contactInfo.replace(/[^\d]/g, '').slice(0, 11)" type="tel" inputmode="tel" autocomplete="tel" maxlength="11" required class="w-full border border-zinc-200 px-5 py-4 rounded-xl outline-none focus:border-black focus:bg-white bg-zinc-50 transition-all" />
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div class="flex flex-col gap-2">
                      <label class="text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">产品型号</label>
                      <input v-model="contactForm.productTitle" type="text" maxlength="60" placeholder="例如 C3 Studio Grand" class="w-full border border-zinc-200 px-5 py-4 rounded-xl outline-none focus:border-black bg-zinc-50 transition-all" />
                    </div>
                    <div class="flex flex-col gap-2">
                      <label class="text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">序列号</label>
                      <input v-model="contactForm.serialNumber" type="text" maxlength="40" placeholder="机身铭牌或保修卡编号" class="w-full border border-zinc-200 px-5 py-4 rounded-xl outline-none focus:border-black bg-zinc-50 transition-all" />
                    </div>
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div class="flex flex-col gap-2">
                      <label class="text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">所在城市</label>
                      <input v-model="contactForm.city" type="text" maxlength="30" placeholder="例如 上海" class="w-full border border-zinc-200 px-5 py-4 rounded-xl outline-none focus:border-black bg-zinc-50 transition-all" />
                    </div>
                    <div class="flex flex-col gap-2">
                      <label class="text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">期望服务时间</label>
                      <input v-model="contactForm.preferredTime" type="text" maxlength="40" placeholder="例如 工作日下午" class="w-full border border-zinc-200 px-5 py-4 rounded-xl outline-none focus:border-black bg-zinc-50 transition-all" />
                    </div>
                  </div>
                  <div class="flex flex-col gap-2">
                    <label class="text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">故障描述 <span>*</span></label>
                    <textarea v-model="contactForm.message" rows="4" required placeholder="请描述现象、发生频率、是否影响演奏或连接。" class="w-full border border-zinc-200 px-5 py-4 rounded-xl outline-none focus:border-black bg-zinc-50 transition-all"></textarea>
                  </div>
                  <input v-model="honeypot" type="text" name="website" tabindex="-1" autocomplete="off" class="hidden" aria-hidden="true" />
                  <button type="submit" :disabled="isSubmittingContact" class="w-full bg-black text-white py-5 rounded-xl text-xs font-bold uppercase tracking-[0.2em] hover:bg-zinc-800 transition-all disabled:bg-zinc-300 disabled:cursor-wait mt-4 min-h-12">
                    <span class="inline-flex items-center justify-center gap-3">
                      <span v-if="isSubmittingContact" class="h-3 w-3 rounded-full border-2 border-white/40 border-t-white animate-spin"></span>
                      {{ isSubmittingContact ? 'SENDING...' : 'SUBMIT TICKET' }}
                    </span>
                  </button>
                </form>
              </div>

              <div v-if="modal.type === 'dealer'" class="text-center py-10">
                <input type="text" placeholder="Enter City (e.g. Beijing)" class="w-full border border-zinc-200 px-5 py-4 rounded-xl outline-none focus:border-black bg-zinc-50 transition-all mb-6 text-center" />
                <button class="w-full bg-black text-white py-5 rounded-xl text-xs font-bold uppercase tracking-[0.2em] hover:bg-zinc-800 transition-all min-h-12" @click="triggerToast('暂无授权体验中心数据', 'error')">SEARCH LOCATION</button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, reactive, watch, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { conversionEvents } from '../lib/analytics'

const route = useRoute(); const router = useRouter()
const smartBack = useSmartBack('/')
const handleBack = () => smartBack()

const isOffline = useState('global-offline')
const toast = useState('global-toast')
const mediaUrl = useMediaUrl()
const brandAssets = useBrandAssets()
const configUrl = useApiUrl('/api/config')
const faqsUrl = useApiUrl('/api/support-faqs')
const downloadsUrl = useApiUrl('/api/support-downloads')
const guidesUrl = useApiUrl('/api/quick-guides')
const inquiriesUrl = useApiUrl('/api/inquiries')
const { track, guardPayload: getTrackingPayload } = useAuralTrack()
const triggerToast = (msg, type) => { toast.value = { show: true, message: msg, type }; setTimeout(() => toast.value.show = false, 4000) }

// 🌟 抓取全局系统配置以获取支持页巨幕
const { data: configRes, error: errC, refresh: refreshC } = await useFetch(configUrl, { lazy: true, key: 'support-config' })
const sysConfig = computed(() => configRes.value || {})
const supportPhone = computed(() => sysConfig.value.contactPhone || '400-888-7726')
const supportEmail = computed(() => sysConfig.value.contactEmail || 'service@hushiguanle.com')
const supportPhoneHref = computed(() => `tel:${supportPhone.value.replace(/[^\d+]/g, '')}`)

const { data: rawFaqs, pending: pendingFaqs, error: errF, refresh: refreshFaqs } = await useFetch(faqsUrl, { lazy: true, key: 'support-faqs' })
const faqCategories = [
  { label: '全部', value: 'all' },
  { label: '保修', value: 'warranty' },
  { label: '维护', value: 'maintenance' },
  { label: '固件', value: 'software' },
  { label: '试奏', value: 'experience' },
  { label: '运输', value: 'delivery' },
  { label: '报修', value: 'repair' }
]
const activeFaqCategory = ref('all')
const displayFaqs = computed(() => {
  const list = rawFaqs.value?.data?.length > 0 ? rawFaqs.value.data : []
  if (activeFaqCategory.value === 'all') return list
  return list.filter((faq) => faq.category === activeFaqCategory.value)
})

const { data: rawDownloads, pending: pendingDownloads, error: errD, refresh: refreshDownloads } = await useFetch(downloadsUrl, { lazy: true, server: false, immediate: false, key: 'support-downloads' })
const displayDownloads = computed(() => {
  if (rawDownloads.value?.data?.length > 0) return rawDownloads.value.data.map(d => ({ ...d, fileUrl: mediaUrl(d.fileUrl, null) }))
  return []
})

const { data: rawGuides, pending: pendingGuides, error: errG, refresh: refreshGuides } = await useFetch(guidesUrl, { lazy: true, server: false, immediate: false, key: 'support-guides' })
const displayGuides = computed(() => {
  if (rawGuides.value?.data?.length > 0) return rawGuides.value.data.map(g => ({ ...g, cover: mediaUrl(g.coverUrl, brandAssets.productKeyboard), videoUrl: mediaUrl(g.videoUrl, null) }))
  return []
})

watch([errC, errF, errD, errG], (errs) => { isOffline.value = errs.some(Boolean) }, { immediate: true })

onMounted(() => {
  if (route.query.type === 'experience') {
    contactForm.serviceType = 'experience'
    openModal('contact')
  }
})

const activeFaq = ref(null)
const modal = reactive({ show: false, type: '' })
const currentVideo = ref(null)
const faqFeedbackKeys = ref({})
const supportSubmitError = ref('')
useOverlayLock('support-modal', () => modal.show)
const supportModalHistory = useOverlayHistory('support-modal', () => modal.show, () => {
  modal.show = false
})

watch(() => modal.show, (newVal) => { 
  if (!newVal) currentVideo.value = null 
})

const playVideo = (guide) => {
  track('cta_click', {
    entityType: 'quick-guide',
    entityTitle: guide.title,
    ctaName: 'play-support-guide',
    metadata: { category: guide.category }
  })
  if (guide.videoUrl) { currentVideo.value = guide; modal.type = 'videoPlayer' } 
  else { triggerToast('抱歉，该视频暂未上传源文件。', 'error') }
}

const isSubmittingContact = ref(false)
const serviceTypeLabels = {
  repair: '故障报修',
  maintenance: '保养维护',
  software: '固件 / 软件支持',
  experience: '试奏与门店咨询'
}
const contactForm = reactive({ serviceType: 'repair', customerName: '', contactInfo: '', productTitle: '', serialNumber: '', purchaseChannel: '', city: '', preferredTime: '', message: '' })
const { honeypot, getGuardPayload, canSubmit, resetGuard } = useFormGuard('support-ticket')

const handleFormSubmit = async () => {
  supportSubmitError.value = ''
  const name = contactForm.customerName.trim();
  if (!name || name.length < 2) { supportSubmitError.value = '请输入完整有效的姓名。'; return triggerToast('请输入完整有效的姓名', 'error'); }
  const phoneRegex = /^1[3-9]\d{9}$/;
  if (!phoneRegex.test(contactForm.contactInfo)) { supportSubmitError.value = '请输入有效的 11 位手机号码。'; return triggerToast('请输入有效的 11 位手机号码', 'error'); }
  if (contactForm.message.trim().length < 5) { supportSubmitError.value = '请详细描述您的故障问题。'; return triggerToast('请详细描述您的故障问题', 'error'); }
  const guard = canSubmit()
  if (!guard.ok) { supportSubmitError.value = guard.message; return triggerToast(guard.message, 'error') }

  isSubmittingContact.value = true
  try {
    await $fetch(inquiriesUrl.value, {
      method: 'POST',
      body: {
        customerName: name,
        contactInfo: contactForm.contactInfo,
        inquiryType: contactForm.serviceType === 'experience' ? 'appointment' : 'repair',
        productTitle: contactForm.productTitle.trim(),
        city: contactForm.city.trim(),
        preferredTime: contactForm.preferredTime.trim(),
        message: [
          `服务类型：${serviceTypeLabels[contactForm.serviceType] || '故障报修'}`,
          contactForm.serialNumber ? `序列号：${contactForm.serialNumber.trim()}` : '',
          contactForm.purchaseChannel ? `购买渠道：${contactForm.purchaseChannel.trim()}` : '',
          `问题描述：${contactForm.message.trim()}`
        ].filter(Boolean).join('\n'),
        ...getTrackingPayload(),
        ...getGuardPayload()
      }
    })
    track(conversionEvents.inquirySubmit, {
      entityType: 'support',
      entityTitle: serviceTypeLabels[contactForm.serviceType] || '故障报修',
      ctaName: 'support-ticket',
      metadata: { source: 'support-page', serviceType: contactForm.serviceType }
    })
    triggerToast('报修申请已生成专属工单。', 'success')
    resetGuard()
    closeModal()
    Object.assign(contactForm, { serviceType: 'repair', customerName: '', contactInfo: '', productTitle: '', serialNumber: '', purchaseChannel: '', city: '', preferredTime: '', message: '' })
  } catch (error) {
    supportSubmitError.value = error?.data?.error?.message || '提交失败，请稍后重试。'
    track('form_submit_failed', {
      entityType: 'support',
      entityTitle: serviceTypeLabels[contactForm.serviceType] || '故障报修',
      ctaName: 'support-ticket',
      metadata: {
        source: 'support-page',
        serviceType: contactForm.serviceType,
        message: supportSubmitError.value,
        status: error?.status || error?.response?.status || ''
      }
    })
    triggerToast(supportSubmitError.value, 'error')
  } finally { isSubmittingContact.value = false }
}

const modalTitle = computed(() => ({ download: 'Downloads', quickstart: 'Video Guides', contact: 'Technical Support', dealer: 'Find a Dealer' }[modal.type] || ''))
const modalSubtitle = computed(() => ({ download: '获取最新固件与驱动', quickstart: '高清视频教程', contact: '提交维修工单', dealer: '查找线下体验中心' }[modal.type] || ''))

const supportCategories = [
  { name: 'Firmware & Drivers', tagline: '获取最新固件。', action: 'download', iconText: 'FW' },
  { name: 'Quick Start', tagline: '视频化引导。', action: 'quickstart', iconText: 'QS' }, 
  { name: 'Repair Service', tagline: '专家级售后服务。', action: 'contact', iconText: 'RS' },
  { name: 'Find Dealer', tagline: '体验声学魅力。', action: 'dealer', iconText: 'FD' }
]

const faqTrackingId = (faq) => String(faq.id || faq.question || '')
const toggleFaq = (index, faq) => {
  const nextActive = activeFaq.value === index ? null : index
  activeFaq.value = nextActive
  if (nextActive !== null) {
    track('faq_click', {
      entityType: 'faq',
      entityId: faqTrackingId(faq),
      entityTitle: faq.question,
      metadata: { category: faq.category || activeFaqCategory.value }
    })
  }
}

const sendFaqFeedback = (faq, helpful) => {
  const key = `${faqTrackingId(faq)}:${helpful}`
  if (faqFeedbackKeys.value[key]) return
  faqFeedbackKeys.value[key] = true
  track('faq_feedback', {
    entityType: 'faq',
    entityId: faqTrackingId(faq),
    entityTitle: faq.question,
    metadata: { helpful, category: faq.category || activeFaqCategory.value }
  })
  triggerToast(helpful ? '感谢反馈，我们会继续优化支持内容。' : '已记录反馈，客服团队会补充更清晰的解答。', 'success')
}

const trackSupportPhone = () => {
  track('cta_click', { ctaName: 'support-phone', metadata: { source: 'support-direct-desk' } })
}

const trackSupportEmail = () => {
  track('cta_click', { ctaName: 'support-email', metadata: { source: 'support-direct-desk' } })
}

const openModal = (type) => {
  modal.type = type
  modal.show = true
  track('cta_click', { ctaName: `support-${type}`, metadata: { source: 'support-card' } })
  if (type === 'download' && !rawDownloads.value && !pendingDownloads.value) refreshDownloads()
  if (type === 'quickstart' && !rawGuides.value && !pendingGuides.value) refreshGuides()
  if (type === 'contact') {
    track(conversionEvents.inquiryStart, { entityType: 'support', ctaName: 'support-ticket' })
  }
}
const trackDownload = (file) => {
  triggerToast('资料即将开始下载...', 'success')
  track(conversionEvents.resourceDownload, {
    entityType: 'support-download',
    entityId: String(file.id || ''),
    entityTitle: file.name || '',
    metadata: { source: 'support-page', fileType: file.type || '' }
  })
}
const closeModal = () => { supportModalHistory.closeViaHistory() }

useSiteSeo({
  title: '服务与支持 | 胡氏管乐',
  description: '获取胡氏管乐产品保修、维护、固件下载、视频指南、维修工单与线下体验支持。',
  path: '/support',
  image: () => sysConfig.value.supportHeroImageUrl ? mediaUrl(sysConfig.value.supportHeroImageUrl) : undefined
})

useFaqSchema(() => displayFaqs.value)

useBreadcrumbSchema(() => [
  { name: '首页', path: '/' },
  { name: '服务与支持', path: '/support' }
])
</script>

<style scoped>
.animate-in { animation: fadeIn 0.8s ease-out forwards; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes slowZoom { 0% { transform: scale(1); } 100% { transform: scale(1.08); } }
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #e5e5e5; border-radius: 10px; }
.support-modal :where(input, select, textarea, button, a) { min-height: 44px; }
.faq-expand-enter-active, .faq-expand-leave-active { transition: opacity 0.28s ease, transform 0.28s ease; }
.faq-expand-enter-from, .faq-expand-leave-to { opacity: 0; transform: translateY(-8px); }

@media (min-width: 768px) {
  .support-action-card {
    transform: translateZ(0);
  }

  .support-action-card:hover {
    transform: translateY(-4px);
  }

  .support-action-card h3 {
    min-height: 3.5rem;
  }

  .support-action-card p {
    display: -webkit-box;
    overflow: hidden;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
  }
}

@media (max-width: 767px) {
  .support-action-list {
    gap: 0.65rem;
  }

  .support-action-card {
    min-height: 88px;
    display: grid;
    grid-template-columns: 3rem minmax(0, 1fr) 1.5rem;
    align-items: center;
    gap: 0.75rem;
    padding: 0.85rem 0.95rem;
    border-radius: 1rem;
    box-shadow: 0 10px 28px -24px rgba(0, 0, 0, 0.3);
  }

  .support-action-card .default-view {
    grid-column: 2;
    min-width: 0;
  }

  .support-action-card .default-view > div:first-child {
    display: none;
  }

  .support-action-card .default-view > div:nth-child(2) {
    display: none;
  }

  .support-action-card h3 {
    margin: 0 0 0.25rem;
    font-size: 1rem;
    line-height: 1.2;
  }

  .support-action-card p {
    max-width: 100%;
    overflow: hidden;
    font-size: 0.75rem;
    line-height: 1.35;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .support-action-card > div.pointer-events-none {
    position: static;
    grid-column: 1;
    grid-row: 1;
    opacity: 1;
    justify-self: start;
  }

  .support-action-card > div.pointer-events-none > div {
    width: 2.65rem;
    height: 2.65rem;
    font-size: 0.68rem;
    background: #f7f7f8;
  }

  .support-action-arrow {
    display: block;
  }

  .support-action-card:hover {
    transform: none;
  }

  .support-action-card img,
  .support-action-card:hover img {
    transform: none !important;
  }
}

/* Apple 级弹窗动画 */
.apple-modal-enter-active, .apple-modal-leave-active { transition: opacity 0.4s ease; }
.apple-modal-enter-from, .apple-modal-leave-to { opacity: 0; }
.apple-modal-enter-active > div.relative, .apple-modal-leave-active > div.relative { transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.5s ease; }
.apple-modal-enter-from > div.relative { transform: scale(0.95) translateY(20px); opacity: 0; }
.apple-modal-leave-to > div.relative { transform: scale(0.98) translateY(-10px); opacity: 0; }
</style>
