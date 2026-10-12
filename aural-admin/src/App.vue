<template>
  <el-config-provider :locale="zhCn">
    <div v-if="!sessionReady" class="session-loading" role="status">
      正在验证登录状态…
    </div>
    <main v-else-if="!isLoggedIn" class="login-container">
      <section class="login-brand">
        <span class="wordmark">HUSHI <small>INSTRUMENTS</small></span>
        <h1>让好乐器，<br />被更多人听见。</h1>
        <p>胡氏管乐 · 官网管理</p>
      </section>
      <section class="login-card">
        <span class="eyebrow">WELCOME BACK</span>
        <h2>登录管理后台</h2>
        <p class="muted-text">{{ resumeEditor ? "原编辑内容已暂存；登录同一账号后可继续。请勿刷新页面。" : "维护产品、品牌内容与客户咨询。" }}</p>
        <el-form label-position="top" @submit.prevent="handleLogin">
          <el-form-item label="账号"
            ><el-input
              v-model="loginForm.username"
              autocomplete="username"
              placeholder="请输入账号"
              size="large"
          /></el-form-item>
          <el-form-item label="密码"
            ><el-input
              v-model="loginForm.password"
              autocomplete="current-password"
              type="password"
              placeholder="请输入密码"
              size="large"
              show-password
          /></el-form-item>
          <details class="login-extra">
            <summary>已开启两步验证</summary>
            <el-input
              v-model="loginForm.totpCode"
              aria-label="动态验证码"
              placeholder="6 位动态验证码"
              maxlength="6"
              inputmode="numeric"
              autocomplete="one-time-code"
            />
          </details>
          <el-button
            type="primary"
            native-type="submit"
            class="login-btn"
            size="large"
            :loading="loginLoading"
            >登录</el-button
          >
        </el-form>
      </section>
    </main>
    <div
      v-if="sessionReady && (isLoggedIn || resumeEditor)"
      v-show="isLoggedIn"
      :inert="!isLoggedIn ? true : undefined"
      class="studio-layout"
      :class="{ 'nav-collapsed': isCollapse, 'is-mobile': isMobile }"
    >
      <a class="skip-link" href="#main-content">跳到主要内容</a>
      <button
        v-if="isMobile && !isCollapse"
        class="mobile-aside-mask"
        aria-label="关闭导航"
        @click="closeMobileNav"
      ></button>
      <aside
        class="studio-sidebar"
        aria-label="主导航"
        ref="sidebarRef"
        @keydown="handleNavKeys"
      >
        <RouterLink to="/dashboard" class="brand-sidebar"
          ><span class="brand-monogram">胡</span
          ><span class="brand-copy"
            ><strong>胡氏管乐</strong><small>HUSHI INSTRUMENTS</small></span
          ></RouterLink
        >
        <nav class="studio-nav">
          <RouterLink
            v-for="item in navigation"
            :key="item.path"
            :to="item.path"
            :class="{
              active: item.group
                ? route.meta.group === item.group
                : route.path === item.path,
            }"
            :title="item.label"
            ><el-icon><component :is="icons[item.icon]" /></el-icon
            ><span>{{ item.label }}</span></RouterLink
          >
        </nav>
        <div class="sidebar-bottom">
          <p>匠心造乐　声动世界</p>
          <span class="sidebar-caption">HUSHI INSTRUMENTS</span>
        </div>
      </aside>
      <div
        class="studio-workspace"
        :inert="isMobile && !isCollapse ? true : undefined"
      >
        <header class="studio-header">
          <div class="header-left">
            <button
              class="icon-button"
              ref="navToggleRef"
              aria-label="切换导航"
              :aria-expanded="!isCollapse"
              @click="toggleAside"
            >
              <el-icon
                ><Expand v-if="isCollapse" /><Fold v-else
              /></el-icon></button
            ><span class="header-breadcrumb"
              >管理后台 <span aria-hidden="true">/</span>
              {{
                route.meta.group === 'content' ? '官网内容' : pageTitle
              }}</span
            >
          </div>
          <div class="header-right">
            <el-button text :icon="TopRight" @click="openPreview('/')"
              >查看官网</el-button
            ><RouterLink to="/settings" class="user-chip"
              ><span class="user-avatar">{{ avatarInitial }}</span
              ><span>{{
                currentUser?.displayName || currentUser?.username
              }}</span></RouterLink
            ><el-button
              text
              :icon="SwitchButton"
              aria-label="退出登录"
              @click="handleLogout"
            />
          </div>
        </header>
        <main id="main-content" class="admin-main" tabindex="-1">
          <div v-if="route.name !== 'dashboard'" class="page-title-row">
            <div>
              <span class="eyebrow"
                >HUSHI /
                {{
                  route.meta.group === 'content'
                    ? 'CONTENT'
                    : String(route.name || '').toUpperCase()
                }}</span
              >
              <h1>
                {{ route.meta.group === 'content' ? '官网内容' : pageTitle }}
              </h1>
              <p>{{ pageDescription }}</p>
            </div>
          </div>
          <nav
            v-if="route.meta.group === 'content'"
            class="section-tabs"
            aria-label="官网内容栏目"
          >
            <RouterLink
              v-for="item in contentLinks"
              :key="item.path"
              :to="item.path"
              >{{ item.label }}</RouterLink
            >
          </nav>
          <RouterView v-if="allowed" :key="currentUser?.id" />
          <section v-else class="empty-panel">
            <h2>此页面需要相应权限</h2>
            <p>请选择侧栏中可访问的栏目，或联系管理员调整账号权限。</p>
          </section>
        </main>
      </div>
    </div>
    <el-dialog
      :model-value="isLoggedIn && idleCountdown > 0"
      title="即将因长时间未操作而退出"
      width="min(420px, 92vw)"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :show-close="false"
      align-center
    >
      <p role="timer" aria-live="polite">
        为保护后台数据，{{ idleSecondsShown }} 秒后将自动退出。未保存的编辑内容会暂存，重新登录同一账号后可继续。
      </p>
      <template #footer>
        <el-button @click="handleLogout">退出登录</el-button>
        <el-button type="primary" @click="continueSession">继续使用</el-button>
      </template>
    </el-dialog>
  </el-config-provider>
</template>

<script setup>
import { confirmPendingWork } from './lib/editorLifecycle'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import {
  House,
  Collection,
  Document,
  ChatDotRound,
  Picture,
  Setting,
  Fold,
  Expand,
  TopRight,
  SwitchButton,
} from '@element-plus/icons-vue'
import { canAccess, navigationFor, visibleContentPages } from './lib/navigation'
import {
  clearToken,
  extractErrorMessage,
  getCurrentUser,
  getToken,
  hasToken,
  login,
  openPreview,
  refreshSession,
  validateSession,
} from './lib/api'
import {
  lastActivityAt,
  markActivity,
  sessionAction,
  tokenClaims,
  trackActivity,
} from './lib/sessionIdle'

const route = useRoute()
const router = useRouter()

const isLoggedIn = ref(hasToken())
const isMobile = ref(window.innerWidth <= 900)
const isCollapse = ref(isMobile.value)
const loginLoading = ref(false)
const currentUser = ref(getCurrentUser())
const loginForm = reactive({ username: '', password: '', totpCode: '' })
let sessionWatchTimer = 0
let stopActivityTracking = null
let sessionEndsAt = Infinity
let endNoticeShown = false
let refreshInFlight = false
let refreshRetryAt = 0
const idleCountdown = ref(0)
const idleSecondsShown = ref(0)
const sessionReady = ref(!hasToken())
const icons = { House, Collection, Document, ChatDotRound, Picture, Setting }
const navigation = computed(() => navigationFor(currentUser.value))
const contentLinks = computed(() => visibleContentPages(currentUser.value))
const allowed = computed(() =>
  canAccess(currentUser.value, route.meta.permission),
)
const ensureAccessibleRoute = () => {
  if (!canAccess(currentUser.value, route.meta.permission))
    router.replace(navigation.value[0]?.path || '/settings')
}
const pageTitle = computed(
  () =>
    route.meta?.label ||
    route.matched?.[0]?.meta?.label ||
    route.name ||
    '胡氏管乐',
)
const pageDescription = computed(
  () => route.meta?.desc || '管理官网内容、客户工单与系统安全。',
)
const avatarInitial = computed(() => {
  const name =
    currentUser.value?.displayName || currentUser.value?.username || 'A'
  return String(name).trim().slice(0, 1).toUpperCase() || 'A'
})
const sidebarRef = ref(null),
  navToggleRef = ref(null)
const closeMobileNav = async () => {
  isCollapse.value = true
  await nextTick()
  navToggleRef.value?.focus()
}
const toggleAside = async () => {
  isCollapse.value = !isCollapse.value
  if (isMobile.value && !isCollapse.value) {
    await nextTick()
    sidebarRef.value?.querySelector('a')?.focus()
  }
}
const handleNavKeys = (event) => {
  if (!isMobile.value || isCollapse.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    closeMobileNav()
  }
  if (event.key !== 'Tab') return
  const links = Array.from(sidebarRef.value?.querySelectorAll('a,button') || [])
  const first = links[0],
    last = links[links.length - 1]
  if (event.shiftKey && event.target === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && event.target === last) {
    event.preventDefault()
    first?.focus()
  }
}
const syncViewport = () => {
  const nextIsMobile = window.innerWidth <= 900
  if (nextIsMobile && !isMobile.value) isCollapse.value = true
  if (!nextIsMobile && isMobile.value) isCollapse.value = false
  isMobile.value = nextIsMobile
}

const resumeEditor = ref(false)
watch(isLoggedIn, value => { if (typeof document !== 'undefined') document.body.classList.toggle('admin-session-locked', !value) }, {immediate:true})
const handleLogin = async () => {
  if (loginLoading.value) return
  loginLoading.value = true
  try {
    const res = await login(
      loginForm.username,
      loginForm.password,
      loginForm.totpCode,
    )
    currentUser.value = res.user
    isLoggedIn.value = true
    resumeEditor.value = false
    sessionReady.value = true
    loginForm.password = ''
    loginForm.totpCode = ''
    ensureAccessibleRoute()
    startSessionWatch(res)
    if (route.path === '/') router.replace('/dashboard')
  } catch (error) {
    const code = error?.response?.data?.error?.code
    const message =
      code === 'TOTP_REQUIRED'
        ? '请输入正确的 2FA 动态验证码'
        : extractErrorMessage(
            error,
            '登录失败，请检查账号、密码或 API 服务状态',
          )
    ElMessage.error(message)
  } finally {
    loginLoading.value = false
  }
}

const handleLogout = async () => {
  if (!(await confirmPendingWork())) return
  stopSessionWatch()
  clearToken()
  resumeEditor.value = false
  currentUser.value = null
  isLoggedIn.value = false
}

const handleAuthExpired = (event) => {
  if (!isLoggedIn.value) return
  stopSessionWatch()
  isLoggedIn.value = false
  resumeEditor.value = !!currentUser.value
  clearToken()
  const code = event?.detail?.code
  const message =
    {
      IDLE_TIMEOUT: '长时间未操作，已自动退出，请重新登录',
      SESSION_ENDED: '本次登录已达最长时长，请重新登录',
      TOKEN_EXPIRED: '登录已过期，请重新登录',
      TOKEN_REVOKED: '账号会话已被重置，请重新登录',
      ACCOUNT_LOCKED: '账号已被临时锁定，请稍后再试',
    }[code] || '登录状态已失效，请重新登录'
  ElMessage.warning(message)
}

const handleSessionUpdated = (event) => {
  currentUser.value = event.detail.user
  noteSession(event.detail)
}

const noteSession = (session = {}) => {
  const ends = Date.parse(session.sessionExpiresAt || '')
  if (Number.isFinite(ends)) sessionEndsAt = ends
}

const stopSessionWatch = () => {
  clearInterval(sessionWatchTimer)
  sessionWatchTimer = 0
  stopActivityTracking?.()
  stopActivityTracking = null
  idleCountdown.value = 0
}

const startSessionWatch = (session) => {
  noteSession(session)
  if (sessionWatchTimer) return
  endNoticeShown = false
  stopActivityTracking = trackActivity(window)
  sessionWatchTimer = window.setInterval(evaluateSession, 1000)
}

const renewSession = async () => {
  if (refreshInFlight || Date.now() < refreshRetryAt) return
  refreshInFlight = true
  try {
    const res = await refreshSession()
    currentUser.value = res.data?.user || getCurrentUser()
    noteSession(res.data)
  } catch (error) {
    if (error?.response?.status === 401) handleAuthExpired()
    else {
      refreshRetryAt = Date.now() + 30_000
      ElMessage.warning('网络暂时不可用，编辑内容已保留，将自动重试连接')
    }
  } finally {
    refreshInFlight = false
  }
}

const evaluateSession = () => {
  if (!isLoggedIn.value) return
  const claims = tokenClaims(getToken())
  const now = Date.now()
  const action = sessionAction({
    now,
    exp: claims?.exp,
    iat: claims?.iat,
    lastActivity: lastActivityAt(),
    absoluteEnd: sessionEndsAt,
  })
  idleCountdown.value =
    action === 'warn-idle' ? Math.ceil((claims.exp - now) / 1000) : 0
  if (idleCountdown.value) idleSecondsShown.value = idleCountdown.value
  if (action === 'refresh') renewSession()
  else if (action === 'warn-end' && !endNoticeShown) {
    endNoticeShown = true
    ElMessage.warning({
      message: '本次登录将在 2 分钟内到期，请及时保存正在编辑的内容',
      duration: 10_000,
    })
  } else if (action === 'idle-end' || action === 'end')
    handleAuthExpired({
      detail: { code: action === 'idle-end' ? 'IDLE_TIMEOUT' : 'SESSION_ENDED' },
    })
}

const continueSession = () => {
  markActivity()
  renewSession()
}

onMounted(async () => {
  syncViewport()
  window.addEventListener('resize', syncViewport)
  window.addEventListener('admin-auth-expired', handleAuthExpired)
  window.addEventListener('admin-session-updated', handleSessionUpdated)
  if (!isLoggedIn.value) return
  try {
    const res = await validateSession()
    currentUser.value = res.data?.user || getCurrentUser()
    startSessionWatch(res.data)
    ensureAccessibleRoute()
    if (route.path === '/') router.replace('/dashboard')
  } catch (error) {
    if (error?.response?.status === 401) handleAuthExpired()
    else {
      ElMessage.warning('连接暂时中断，已保留当前会话')
      startSessionWatch()
    }
  } finally {
    sessionReady.value = true
  }
})

watch(
  () => route.fullPath,
  () => {
    if (isMobile.value) {
      closeMobileNav()
    }
  },
)

onBeforeUnmount(() => {
  if (typeof document !== 'undefined') document.body.classList.remove('admin-session-locked')
  stopSessionWatch()
  window.removeEventListener('resize', syncViewport)
  window.removeEventListener('admin-auth-expired', handleAuthExpired)
  window.removeEventListener('admin-session-updated', handleSessionUpdated)
})
</script>
