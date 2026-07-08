<template>
  <div class="min-h-screen bg-[#fbfbfd] text-black selection:bg-black selection:text-white relative overflow-x-hidden" :class="{'overflow-hidden': showArtistModal}">
    
    <div class="page-back-button fixed top-24 left-4 md:top-32 md:left-12 z-[70] md:z-[100] pointer-events-none">
      <button @click="handleBack" class="flex items-center gap-4 text-white hover:scale-105 transition-transform duration-300 group pointer-events-auto mix-blend-difference">
        <div class="w-10 h-10 flex items-center justify-center rounded-full border border-white/50 group-hover:border-white transition-colors">
          <svg class="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
        </div>
        <span class="hidden md:block text-xs font-bold tracking-[0.2em] uppercase">返回</span>
      </button>
    </div>

    <section class="h-[44vh] md:h-[62vh] relative flex items-center justify-center overflow-hidden bg-black text-white">
      <div class="absolute inset-0 z-0">
        <img v-if="sysConfig.artistHeroImageUrl" :src="mediaUrl(sysConfig.artistHeroImageUrl)" alt="胡氏管乐艺术家" loading="eager" fetchpriority="high" decoding="async" sizes="100vw" class="w-full h-full object-cover opacity-60 transform scale-105" @error="imageFallback" />
        <div v-else class="w-full h-full bg-zinc-900"></div>
        <div class="absolute inset-0 bg-gradient-to-b from-black/45 via-black/10 to-transparent"></div>
        <div class="absolute inset-x-0 bottom-0 h-[18vh] bg-gradient-to-b from-transparent to-[#fbfbfd]"></div>
      </div>
      
      <div class="relative z-10 text-center px-4 animate-in fade-in max-w-4xl mx-auto pt-12 md:pt-20">
        <h1 class="text-[clamp(2.8rem,14vw,4.5rem)] md:text-8xl lg:text-[7rem] font-serif italic tracking-tighter text-white mb-5 md:mb-8 drop-shadow-2xl leading-none">
          Master's Choice.
        </h1>
        <p class="text-zinc-300 text-xs md:text-lg max-w-2xl mx-auto leading-relaxed tracking-wide font-light drop-shadow-md">
          世界上最挑剔的耳朵，选择了胡氏管乐。<br/>
          认识那些与我们共同塑造音乐未来的杰出艺术家们，感受指尖流淌的纯粹之音。
        </p>
      </div>
    </section>

    <div class="max-w-[72rem] mx-auto px-4 md:px-10 pb-20 md:pb-36 pt-9 md:pt-20 relative z-20" data-no-scroll-fx>
      
      <div v-if="pending" class="artist-showcase-grid">
        <div v-for="i in 6" :key="i" class="artist-card-skeleton w-full overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5 animate-pulse">
          <div class="artist-media-shell w-full bg-zinc-200"></div>
          <div class="artist-meta px-5 py-5 md:px-6 md:py-6">
            <div class="h-px bg-zinc-200 w-10 mb-5"></div>
            <div class="h-3 bg-zinc-200 w-1/3 mb-4"></div>
            <div class="h-7 bg-zinc-300 w-2/3"></div>
          </div>
        </div>
      </div>
      
      <FrontState
        v-else-if="error"
        type="error"
        eyebrow="Artist Connection"
        title="艺术家内容暂时无法加载"
        description="无法连接至艺术家数据源，请检查后端服务状态，或稍后重新加载。"
        show-retry
        @retry="refreshA"
      />

      <FrontState
        v-else-if="displayArtists.length === 0"
        eyebrow="No Artists"
        title="艺术家内容正在准备"
        description="当前还没有已发布的艺术家资料，可以先查看产品中心或提交合作申请。"
        :show-retry="false"
      />

      <div v-else class="artist-showcase-grid gsap-gallery" data-no-scroll-fx>
        <div 
          v-for="artist in displayArtists" 
          :key="artist.id" 
          @click="openArtistModal(artist)"
          role="button"
          tabindex="0"
          @keydown.enter.prevent="openArtistModal(artist)"
          @keydown.space.prevent="openArtistModal(artist)"
          class="artist-card group cursor-pointer flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-[0_12px_36px_rgba(15,23,42,0.07)] md:shadow-[0_18px_50px_rgba(15,23,42,0.08)] ring-1 ring-black/5"
          data-no-scroll-fx
        >
          <div class="artist-media artist-media-shell w-full overflow-hidden bg-zinc-100 relative">
            <img 
              :src="artist.image" 
              :alt="artist.name" 
              loading="lazy"
              decoding="async"
              sizes="(min-width: 1024px) 33vw, 100vw"
              class="artist-image w-full h-full object-cover transition-transform duration-1000 ease-[cubic-bezier(0.25,1,0.5,1)] group-hover:scale-105" 
              @error="imageFallback"
            />
            <div class="absolute inset-0 border border-black/5 pointer-events-none"></div>
          </div>
          
          <div class="artist-meta flex w-full flex-1 flex-col justify-end px-5 py-5 md:px-5 lg:px-6 md:py-6">
            <div class="w-6 h-[1px] bg-black/30 mb-3 md:mb-4 group-hover:w-16 group-hover:bg-black transition-all duration-700 ease-out"></div>
            
            <p class="text-zinc-400 text-[10px] tracking-[0.25em] mb-2 uppercase font-semibold">{{ artist.role }}</p>
            <h2 class="text-xl md:text-2xl lg:text-3xl font-serif text-black group-hover:text-zinc-500 transition-colors duration-500">{{ artist.name }}</h2>
            <p class="mt-3 md:mt-4 text-xs leading-relaxed text-zinc-500 line-clamp-2">{{ artist.equipment || 'HUSHI WIND Artist Series' }}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="bg-[#111111] text-white w-full py-20 md:py-40 px-5 md:px-8 relative z-20">
      <div class="max-w-3xl mx-auto text-center gsap-fade-up">
        <h2 class="text-3xl md:text-6xl font-serif italic mb-6 md:mb-10 text-white leading-tight">Join the Family.</h2>
        <p class="text-zinc-400 mb-9 md:mb-16 text-sm md:text-lg leading-relaxed tracking-wide max-w-xl mx-auto font-light">
          我们始终在寻找那些对声音有极致追求的灵魂。如果您是专业演奏者并希望与胡氏管乐展开深度合作，请向我们提交您的履历与作品集。
        </p>
        <button @click="openApplyModal" class="apply-btn group relative overflow-hidden inline-flex items-center justify-center gap-4">
          <span class="relative z-10 text-xs tracking-[0.2em] uppercase font-bold text-black">提交合作申请</span> 
          <svg class="w-4 h-4 relative z-10 transform group-hover:translate-x-1 transition-transform text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="square" stroke-linejoin="miter" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
        </button>
      </div>
    </div>

    <Teleport to="body">
      <Transition name="apple-modal">
        <div v-if="showArtistModal && activeArtist" class="fixed inset-0 z-[200] flex items-center justify-center bg-white/80 backdrop-blur-3xl overflow-y-auto" @keydown.esc="closeArtistModal" tabindex="-1">
          
          <button @click="closeArtistModal" class="absolute top-8 right-8 md:top-12 md:right-12 w-12 h-12 flex items-center justify-center rounded-full bg-zinc-100 hover:bg-zinc-200 transition-colors z-50">
            <svg class="w-5 h-5 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>

          <div class="max-w-7xl mx-auto w-full min-h-screen md:min-h-0 px-6 py-24 md:p-12 flex flex-col md:flex-row items-center gap-12 md:gap-24 relative">
            
            <div class="w-full md:w-1/2 aspect-square md:aspect-[4/5] rounded-2xl overflow-hidden shadow-2xl relative">
              <img :src="activeArtist.image" :alt="activeArtist.name" loading="lazy" decoding="async" sizes="(min-width: 768px) 40vw, 100vw" class="w-full h-full object-cover" @error="imageFallback" />
              <div class="absolute inset-0 border border-black/10 rounded-2xl pointer-events-none"></div>
            </div>
            
            <div class="w-full md:w-1/2 flex flex-col justify-center">
              <p class="text-zinc-500 text-sm tracking-[0.3em] uppercase font-bold mb-4">{{ activeArtist.role }}</p>
              <h2 class="text-5xl md:text-7xl font-serif text-black mb-10 leading-tight">{{ activeArtist.name }}</h2>
              
              <div class="w-16 h-[2px] bg-black mb-10"></div>
              
              <p class="text-lg md:text-xl text-zinc-600 leading-relaxed font-light mb-16 whitespace-pre-line">
                {{ activeArtist.bio || '一位将对音乐的极致追求融入灵魂的杰出演奏家。通过与胡氏管乐的深度合作，不断探索声学与艺术表达的新边界。' }}
              </p>

              <div>
                <span class="text-xs text-zinc-400 uppercase tracking-[0.2em] font-bold block mb-4">Preferred Equipment</span>
                <p class="text-2xl font-serif text-black">{{ activeArtist.equipment || 'HUSHI WIND Master Series' }}</p>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="application-modal">
      <div v-if="showApplyModal" class="modal-overlay" @click.self="closeApplyModal" @keydown.esc="closeApplyModal" tabindex="-1">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="font-serif italic text-3xl text-black">Application</h2>
            <button class="close-btn" @click="closeApplyModal">✕</button>
          </div>
          <p class="text-xs text-zinc-400 tracking-widest uppercase mb-8 border-b border-zinc-100 pb-4">HUSHI WIND Artist Program</p>
          
          <form @submit.prevent="submitApplication" class="apply-form">
            <div class="form-group"><label>姓名 / 艺名 <span>*</span></label><input v-model="form.name" type="text" maxlength="30" required placeholder="请输入您的称呼" /></div>
            <div class="form-group"><label>联系邮箱 <span>*</span></label><input v-model="form.email" type="email" required placeholder="example@email.com" /></div>
            <div class="form-group"><label>联系电话</label><input v-model="form.phone" type="tel" maxlength="11" placeholder="您的手机号码 (选填)" /></div>
            <div class="form-group"><label>作品集链接 <span>*</span></label><input v-model="form.portfolioUrl" type="url" required placeholder="B站 / YouTube 主页链接" /></div>
            <div class="form-group"><label>合作意向简述</label><textarea v-model="form.message" rows="3" placeholder="简述您的音乐履历与诉求..."></textarea></div>
            <input v-model="honeypot" type="text" name="website" tabindex="-1" autocomplete="off" class="hidden" aria-hidden="true" />
            <button type="submit" class="submit-btn" :disabled="isSubmitting">
              <span class="inline-flex items-center justify-center gap-3">
                <span v-if="isSubmitting" class="h-3 w-3 rounded-full border-2 border-white/40 border-t-white animate-spin"></span>
                {{ isSubmitting ? 'ENCRYPTING & SENDING...' : 'SUBMIT APPLICATION' }}
              </span>
            </button>
          </form>
        </div>
      </div>
      </Transition>
    </Teleport>

  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

defineOptions({ name: 'ArtistsPage' })

const router = useRouter()
const smartBack = useSmartBack('/')
const handleBack = () => smartBack()

const toast = useState('global-toast')
const isOffline = useState('global-offline')
const triggerToast = (msg, type) => { toast.value = { show: true, message: msg, type }; setTimeout(() => toast.value.show = false, 4000) }

const mediaUrl = useMediaUrl()
const brandAssets = useBrandAssets()
const imageFallback = useImageFallback(brandAssets.artistHero)
const configUrl = useApiUrl('/api/config')
const artistsUrl = useApiUrl('/api/artists')
const artistApplicationsUrl = useApiUrl('/api/artist-applications')
const { track, guardPayload: getTrackingPayload } = useAuralTrack()

const { data: configRes, error: errC, refresh: refreshC } = await useFetch(configUrl, { lazy: true, key: 'artists-config' })
const sysConfig = computed(() => configRes.value || {})

useSiteSeo({
  title: '艺术家 | 胡氏管乐 Master\'s Choice',
  description: '认识与胡氏管乐合作的专业演奏者、制作人和艺术家，了解他们的音乐履历与常用设备。',
  path: '/artists',
  image: () => sysConfig.value.artistHeroImageUrl ? mediaUrl(sysConfig.value.artistHeroImageUrl) : undefined
})

useBreadcrumbSchema(() => [
  { name: '首页', path: '/' },
  { name: '艺术家', path: '/artists' }
])

const { data: rawArtists, pending, error, refresh: refreshA } = await useFetch(artistsUrl, { lazy: true, key: 'artists-list' })

watch([error, errC], (errs) => {
  isOffline.value = errs.some(Boolean)
}, { immediate: true })

const displayArtists = computed(() => {
  if (rawArtists.value?.data && rawArtists.value.data.length > 0) {
    return rawArtists.value.data.map(item => ({
      id: item.id, 
      name: item.attributes.name, 
      role: item.attributes.role,
      bio: item.attributes.bio,           
      equipment: item.attributes.equipment, 
      image: item.attributes.image?.data ? mediaUrl(item.attributes.image.data.attributes.url) : brandAssets.artistHero
    }))
  }
  return []
})

const showArtistModal = ref(false)
const activeArtist = ref(null)
const showApplyModal = ref(false)
useOverlayLock('artist-profile-modal', showArtistModal)
useOverlayLock('artist-apply-modal', showApplyModal)
const artistProfileHistory = useOverlayHistory('artist-profile-modal', showArtistModal, () => {
  showArtistModal.value = false
})
const artistApplyHistory = useOverlayHistory('artist-apply-modal', showApplyModal, () => {
  showApplyModal.value = false
})

const openArtistModal = (artist) => {
  activeArtist.value = artist
  showArtistModal.value = true
  track('cta_click', {
    entityType: 'artist',
    entityId: String(artist.id),
    entityTitle: artist.name,
    ctaName: 'artist-card'
  })
}

const closeArtistModal = () => {
  artistProfileHistory.closeViaHistory()
}

const closeApplyModal = () => {
  artistApplyHistory.closeViaHistory()
}

const openApplyModal = () => {
  showApplyModal.value = true
  track('cta_click', { ctaName: 'artist-application-open' })
  track('form_open', { entityType: 'artist-application', ctaName: 'artist-application' })
}

const form = reactive({ name: '', email: '', phone: '', portfolioUrl: '', message: '' })
const isSubmitting = ref(false)
const { honeypot, getGuardPayload, canSubmit, resetGuard } = useFormGuard('artist-application')

const submitApplication = async () => {
  const name = form.name.trim();
  if (!name || name.length < 2) { return triggerToast('请输入有效姓名或艺名 (至少2个字符)', 'error'); }
  const guard = canSubmit()
  if (!guard.ok) return triggerToast(guard.message, 'error')

  isSubmitting.value = true
  try {
    await $fetch(artistApplicationsUrl.value, { method: 'POST', body: { ...form, ...getTrackingPayload(), ...getGuardPayload() } })
    track('form_submit', {
      entityType: 'artist-application',
      entityTitle: form.name,
      ctaName: 'artist-application',
      metadata: { source: 'artists-page' }
    })
    triggerToast('申请已加密提交！专属运营专员将尽快审阅。', 'success')
    artistApplyHistory.closeDirect()
    resetGuard()
    Object.keys(form).forEach(key => form[key] = '') 
  } catch (error) {
    const message = error?.data?.error?.message || '无法连接至服务器，请检查网络或后端状态。'
    track('form_submit_failed', {
      entityType: 'artist-application',
      entityTitle: form.name,
      ctaName: 'artist-application',
      metadata: {
        source: 'artists-page',
        message,
        status: error?.status || error?.response?.status || ''
      }
    })
    triggerToast(message, 'error')
  } finally {
    isSubmitting.value = false
  }
}

let ctx;
let animationTimer = 0
onMounted(() => {
  gsap.registerPlugin(ScrollTrigger)
  if (!pending.value) initAnimations()
})

watch(pending, (newVal) => {
  if (newVal || process.server) return
  window.clearTimeout(animationTimer)
  animationTimer = window.setTimeout(initAnimations, 100)
})

const initAnimations = () => {
  if (process.server) return
  useGsapCleanup(ctx, ScrollTrigger)
  ctx = gsap.context(() => {
    gsap.from('.animate-in', { y: 40, opacity: 0, duration: 1.5, ease: 'power3.out', delay: 0.2 })
    
    gsap.from('.gsap-gallery .artist-media', {
      scrollTrigger: { trigger: '.gsap-gallery', start: 'top 88%', toggleActions: 'play none none none' },
      opacity: 0,
      scale: 0.985,
      duration: 0.8,
      stagger: 0.08,
      ease: 'power3.out',
      clearProps: 'opacity,transform'
    })

    gsap.from('.gsap-gallery .artist-meta', {
      scrollTrigger: { trigger: '.gsap-gallery', start: 'top 88%', toggleActions: 'play none none none' },
      opacity: 0,
      y: 18,
      duration: 0.75,
      stagger: 0.08,
      ease: 'power3.out',
      clearProps: 'opacity,transform'
    })
  })
}

onBeforeUnmount(() => {
  if (process.client) window.clearTimeout(animationTimer)
  useGsapCleanup(ctx, ScrollTrigger)
})
</script>

<style scoped>
.animate-in { animation: fadeIn 0.8s ease-out forwards; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

/* 毛玻璃模态框动画 */
.apple-modal-enter-active,
.apple-modal-leave-active {
  transition: opacity 0.5s ease, backdrop-filter 0.5s ease;
}
.apple-modal-enter-from,
.apple-modal-leave-to {
  opacity: 0;
  backdrop-filter: blur(0px);
}
.apple-modal-enter-active > div,
.apple-modal-leave-active > div {
  transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.6s ease;
}
.apple-modal-enter-from > div {
  transform: scale(0.95) translateY(20px);
  opacity: 0;
}
.apple-modal-leave-to > div {
  transform: scale(0.98) translateY(-10px);
  opacity: 0;
}

.apply-btn { background-color: #fff; color: #000; padding: 24px 56px; cursor: pointer; transition: all 0.4s ease; border-radius: 4px;}
.apply-btn:hover { background-color: #f0f0f0; transform: scale(1.02); }
.artist-showcase-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2rem;
  align-items: stretch;
}

.artist-card {
  min-width: 0;
  transform: translate3d(0, 0, 0);
  transition:
    transform 0.45s cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 0.45s ease,
    border-color 0.45s ease;
  will-change: transform;
}

.artist-card:hover,
.artist-card:focus-visible {
  transform: translateY(-6px);
  box-shadow: 0 26px 70px rgba(15, 23, 42, 0.13);
}

.artist-media {
  isolation: isolate;
}

.artist-media::after {
  content: "";
  position: absolute;
  inset: auto 0 0 0;
  height: 38%;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.2), transparent);
  opacity: 0;
  transition: opacity 0.5s ease;
  pointer-events: none;
}

.artist-card:hover .artist-media::after,
.artist-card:focus-visible .artist-media::after {
  opacity: 1;
}

.artist-media-shell {
  height: min(64vw, 340px);
}

.artist-image {
  object-position: center 45%;
}

.artist-meta {
  min-height: 116px;
}

@media (max-width: 767px) {
  .artist-showcase-grid {
    gap: 0.85rem;
  }

  .artist-card:hover,
  .artist-card:focus-visible {
    transform: none;
    box-shadow: 0 12px 36px rgba(15, 23, 42, 0.08);
  }

  .artist-image,
  .artist-card:hover .artist-image {
    transform: none !important;
  }

  .artist-media-shell {
    height: clamp(160px, 45vw, 190px);
  }

  .artist-media::after {
    display: none;
  }

  .artist-meta {
    min-height: 86px;
    padding: 0.9rem 1rem;
  }

  .artist-meta > div:first-child {
    display: none;
  }

  .artist-meta p:first-of-type {
    margin-bottom: 0.25rem;
    font-size: 0.56rem;
    letter-spacing: 0.2em;
  }

  .artist-meta h2 {
    font-size: 1.15rem;
    line-height: 1.2;
  }

  .artist-meta p:last-child {
    margin-top: 0.45rem;
    line-height: 1.35;
  }

  .apply-btn {
    width: 100%;
    padding: 18px 24px;
  }

  .modal-overlay {
    align-items: flex-end;
    padding: 0.75rem;
  }

  .modal-content {
    width: 100%;
    max-height: 90dvh;
    overflow-y: auto;
    padding: 24px;
    border-radius: 20px;
  }

  .apply-form {
    gap: 14px;
  }

  .form-group input,
  .form-group textarea {
    min-height: 44px;
    padding: 13px 14px;
  }

  .submit-btn {
    min-height: 48px;
    padding: 14px;
  }
}

@media (min-width: 768px) {
  .artist-showcase-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: clamp(1.25rem, 2.4vw, 2.75rem);
  }

  .artist-media-shell {
    height: clamp(220px, 22vw, 320px);
  }

  .artist-meta {
    min-height: 156px;
  }
}

.modal-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: rgba(0, 0, 0, 0.6); display: flex; justify-content: center; align-items: center; z-index: 9999; backdrop-filter: blur(8px); }
.modal-content { background: #fff; color: #000; width: 90%; max-width: 480px; padding: 40px; border-radius: 0px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;}
@keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
.modal-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
.close-btn { background: none; border: none; font-size: 24px; cursor: pointer; color: #999; transition: color 0.3s; line-height: 1;}
.close-btn:hover { color: #000; transform: rotate(90deg); transition: all 0.3s;}
.apply-form { display: flex; flex-direction: column; gap: 20px; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 10px; font-weight: 800; letter-spacing: 2px; color: #555; text-transform: uppercase; }
.form-group label span { color: #e74c3c; }
.form-group input, .form-group textarea { border: 1px solid #e5e5e5; padding: 16px; font-size: 14px; border-radius: 0px; font-family: inherit; transition: all 0.3s; background: #fafafa;}
.form-group input:focus, .form-group textarea:focus { border-color: #000; outline: none; background: #fff; box-shadow: 0 0 0 1px #000;}
.submit-btn { background-color: #000; color: #fff; border: none; padding: 20px; font-size: 12px; font-weight: 900; letter-spacing: 3px; cursor: pointer; margin-top: 10px; transition: background-color 0.3s;}
.submit-btn:hover { background-color: #333; }
.submit-btn:disabled { background-color: #ccc; cursor: not-allowed; color: #666; }
.application-modal-enter-active, .application-modal-leave-active { transition: opacity 0.35s ease; }
.application-modal-enter-from, .application-modal-leave-to { opacity: 0; }
.application-modal-enter-active .modal-content, .application-modal-leave-active .modal-content { transition: transform 0.45s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.45s ease; }
.application-modal-enter-from .modal-content { transform: translateY(24px) scale(0.97); opacity: 0; }
.application-modal-leave-to .modal-content { transform: translateY(-8px) scale(0.98); opacity: 0; }
</style>
