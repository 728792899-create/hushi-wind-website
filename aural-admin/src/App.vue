<template>
  <div v-if="!isLoggedIn" class="login-container">
    <el-card class="login-card">
      <div class="brand">
        <h1>胡氏管乐</h1>
        <p>Control Center</p>
      </div>
      <el-form @submit.prevent="handleLogin">
        <el-form-item>
          <el-input v-model="loginForm.username" placeholder="ADMIN USER" size="large" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="loginForm.password" type="password" placeholder="PASSWORD" size="large" show-password />
        </el-form-item>
        <el-form-item>
          <el-input v-model="loginForm.totpCode" placeholder="2FA 动态码（已启用时填写）" size="large" maxlength="6" inputmode="numeric" clearable />
        </el-form-item>
        <el-button type="primary" class="login-btn" size="large" :loading="loginLoading" @click="handleLogin">系统验证登录</el-button>
      </el-form>
    </el-card>
  </div>

  <el-container v-else class="admin-layout" :class="{ 'is-mobile': isMobile, 'aside-open': isMobile && !isCollapse, 'is-compact': densityName === 'compact' }">
    <div v-if="isMobile && !isCollapse" class="mobile-aside-mask" @click="isCollapse = true"></div>
    <el-aside :width="asideWidth" class="admin-aside">
      <div class="brand-sidebar">
        <div class="brand-mark"><el-icon><Platform /></el-icon></div>
        <div v-if="!isCollapse" class="brand-copy">
          <h2>胡氏管乐</h2>
          <span>企业运营后台</span>
        </div>
      </div>

      <el-menu
        :collapse="isCollapse"
        :default-active="route.path"
        router
        active-text-color="#fff"
        background-color="transparent"
        text-color="var(--admin-muted)"
        :unique-opened="true"
        class="enterprise-menu"
      >
        <div v-if="!isCollapse" class="menu-section-label">运营中心</div>
        <el-menu-item v-if="can('dashboard:read')" index="/dashboard"><el-icon><DataLine /></el-icon><span>运营工作台</span></el-menu-item>

        <div v-if="!isCollapse" class="menu-section-label">官网内容</div>
        <el-sub-menu v-if="canAny(['products:read', 'artists:read', 'config:read', 'articles:read', 'cms:read', 'resources:read'])" index="content">
          <template #title><el-icon><Reading /></el-icon><span>内容运营</span></template>
          <el-menu-item v-if="can('products:read')" index="/products">产品管理</el-menu-item>
          <el-menu-item v-if="can('articles:read')" index="/articles">新闻管理</el-menu-item>
          <el-menu-item v-if="can('cms:read')" index="/cms">页面内容</el-menu-item>
          <el-menu-item v-if="can('resources:read')" index="/resources">资源库</el-menu-item>
          <el-menu-item v-if="can('artists:read')" index="/artists">艺术家管理</el-menu-item>
          <el-menu-item v-if="can('config:read')" index="/config">全局配置</el-menu-item>
        </el-sub-menu>

        <div v-if="!isCollapse" class="menu-section-label">客户线索</div>
        <el-menu-item v-if="can('crm:read')" index="/crm">
          <el-icon><ChatDotRound /></el-icon>
          <template #title>
            <span>客户与工单</span>
            <el-badge v-if="statsBadge > 0" :value="statsBadge" class="menu-badge" />
          </template>
        </el-menu-item>

        <div v-if="!isCollapse" class="menu-section-label">安全运维</div>
        <el-menu-item v-if="can('logs:read')" index="/security"><el-icon><Lock /></el-icon><span>安全与审计</span></el-menu-item>
        <el-menu-item index="/help"><el-icon><QuestionFilled /></el-icon><span>后台帮助</span></el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="admin-header">
        <div class="header-left">
          <el-icon @click="toggleAside" class="cp"><Expand v-if="isCollapse" /><Fold v-else /></el-icon>
          <div class="page-heading">
            <span class="page-title">{{ pageTitle }}</span>
            <small>{{ pageDescription }}</small>
          </div>
          <el-button v-if="isMobile" class="mobile-more-btn" text @click="toggleMobileTools">
            <el-icon><MoreFilled /></el-icon>
            <span>更多</span>
          </el-button>
        </div>
        <div class="header-tools" :class="{ 'is-mobile-open': mobileToolsOpen }">
          <div class="global-shortcuts">
            <el-button v-if="can('crm:read')" text @click="goHeader('/crm')">处理客户</el-button>
            <el-button v-if="can('products:read')" text @click="goHeader('/products')">产品运营</el-button>
            <el-button v-if="can('articles:read')" text @click="goHeader('/articles')">内容发布</el-button>
            <el-button v-if="can('logs:read')" text @click="goHeader('/security')">安全巡检</el-button>
          </div>
          <el-button text @click="goHeader('/help')">帮助</el-button>
          <el-button v-if="route.name === 'products' && can('products:write')" type="primary" class="light-btn" @click="emitPageAction('product:add')">+ 上架乐器</el-button>
          <el-button v-if="route.name === 'articles' && can('articles:write')" type="primary" class="light-btn" @click="emitPageAction('article:add')">+ 发布新闻</el-button>
          <el-button v-if="route.name === 'artists' && can('artists:write')" type="primary" class="light-btn" @click="emitPageAction('artist:add')">+ 新增艺术家</el-button>
          <el-button v-if="route.name === 'cms' && can('cms:write')" type="primary" class="light-btn" @click="emitPageAction('cms:add')">+ 新增此页内容</el-button>
          <el-button v-if="route.name === 'resources' && can('resources:read')" color="#222" class="dark-btn" @click="emitPageAction('resources:refresh')">刷新资源</el-button>
          <el-select v-model="themeName" class="theme-select" size="small" @change="applyTheme">
            <el-option v-for="theme in adminThemes" :key="theme.value" :label="theme.label" :value="theme.value">
              <div class="theme-option">
                <span class="theme-swatch" :style="{ background: theme.preview }"></span>
                <span>{{ theme.label }}</span>
              </div>
            </el-option>
          </el-select>
          <el-select v-model="densityName" class="density-select" size="small" @change="applyDensity">
            <el-option label="舒适" value="comfortable" />
            <el-option label="紧凑" value="compact" />
          </el-select>
          <el-divider direction="vertical" />
          <el-avatar :size="32" class="admin-avatar">{{ avatarInitial }}</el-avatar>
          <span class="admin-user-label">{{ currentUser?.displayName || currentUser?.username || 'admin' }}</span>
          <el-button type="info" text @click="handleLogout">安全退出</el-button>
        </div>
      </el-header>

      <el-main class="admin-main">
        <Suspense>
          <RouterView @stats-change="setStatsBadge" />
          <template #fallback>
            <div class="module-loading">Loading Module...</div>
          </template>
        </Suspense>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ChatDotRound, DataLine, Expand, Fold, Lock, MoreFilled, Platform, QuestionFilled, Reading } from '@element-plus/icons-vue'
import { clearToken, extractErrorMessage, getCurrentUser, hasPermission, hasToken, login, refreshSession, validateSession } from './lib/api'

const route = useRoute()
const router = useRouter()

const isLoggedIn = ref(hasToken())
const isMobile = ref(window.innerWidth <= 900)
const isCollapse = ref(isMobile.value)
const mobileToolsOpen = ref(false)
const loginLoading = ref(false)
const statsBadge = ref(0)
const currentUser = ref(getCurrentUser())
const loginForm = reactive({ username: '', password: '', totpCode: '' })
let sessionRefreshTimer = 0
const THEME_KEY = 'aural-admin-theme'
const DENSITY_KEY = 'hushi-admin-density'
const adminThemes = [
  { value: 'graphite', label: '石墨绿', preview: 'linear-gradient(135deg, #07080a, #78c6a3)' },
  { value: 'midnight', label: '午夜蓝', preview: 'linear-gradient(135deg, #07111f, #7aa7ff)' },
  { value: 'spruce', label: '云杉绿', preview: 'linear-gradient(135deg, #0b1512, #75b79b)' },
  { value: 'slate', label: '冷灰蓝', preview: 'linear-gradient(135deg, #111827, #8fb3d9)' },
  { value: 'walnut', label: '胡桃金', preview: 'linear-gradient(135deg, #120d08, #d9b76e)' },
  { value: 'studio', label: '录音棚紫', preview: 'linear-gradient(135deg, #110d18, #b69cff)' },
  { value: 'porcelain', label: '青瓷浅色', preview: 'linear-gradient(135deg, #eef6f2, #5b9d87)' },
  { value: 'mist', label: '雾白灰', preview: 'linear-gradient(135deg, #f5f7f8, #607d8b)' },
  { value: 'seasalt', label: '海盐蓝', preview: 'linear-gradient(135deg, #eef6f7, #4b8fa1)' },
  { value: 'sandstone', label: '砂岩浅色', preview: 'linear-gradient(135deg, #f7f2ea, #a2764f)' },
  { value: 'daylight', label: '日间绿', preview: 'linear-gradient(135deg, #f3f5f2, #4f8f71)' }
]
const themeName = ref(window.localStorage.getItem(THEME_KEY) || 'graphite')
const densityName = ref(window.localStorage.getItem(DENSITY_KEY) || 'comfortable')

const pageTitle = computed(() => route.meta?.label || route.matched?.[0]?.meta?.label || route.name || '胡氏管乐')
const pageDescription = computed(() => route.meta?.desc || '管理官网内容、客户工单与系统安全。')
const avatarInitial = computed(() => {
  const name = currentUser.value?.displayName || currentUser.value?.username || 'A'
  return String(name).trim().slice(0, 1).toUpperCase() || 'A'
})
const asideWidth = computed(() => {
  if (isMobile.value) return isCollapse.value ? '0px' : '246px'
  return isCollapse.value ? '64px' : '246px'
})

const setStatsBadge = (value) => {
  statsBadge.value = Number(value || 0)
}

const closeMobileTools = () => {
  if (isMobile.value) mobileToolsOpen.value = false
}

const toggleAside = () => {
  isCollapse.value = !isCollapse.value
  closeMobileTools()
}

const toggleMobileTools = () => {
  if (!isMobile.value) return
  if (!isCollapse.value) isCollapse.value = true
  mobileToolsOpen.value = !mobileToolsOpen.value
}

const goHeader = (path) => {
  router.push(path)
  closeMobileTools()
}

const emitPageAction = (name) => {
  window.dispatchEvent(new CustomEvent('admin-page-action', { detail: name }))
  closeMobileTools()
}

const can = (permission) => hasPermission(permission)
const canAny = (permissions) => permissions.some(can)

const applyTheme = () => {
  const nextTheme = adminThemes.some((theme) => theme.value === themeName.value) ? themeName.value : 'graphite'
  themeName.value = nextTheme
  document.documentElement.dataset.adminTheme = nextTheme
  window.localStorage.setItem(THEME_KEY, nextTheme)
}

const applyDensity = () => {
  const nextDensity = densityName.value === 'compact' ? 'compact' : 'comfortable'
  densityName.value = nextDensity
  document.documentElement.dataset.adminDensity = nextDensity
  window.localStorage.setItem(DENSITY_KEY, nextDensity)
}

const syncViewport = () => {
  const nextIsMobile = window.innerWidth <= 900
  if (nextIsMobile && !isMobile.value) isCollapse.value = true
  if (!nextIsMobile && isMobile.value) isCollapse.value = false
  isMobile.value = nextIsMobile
  if (!nextIsMobile) mobileToolsOpen.value = false
}

const handleLogin = async () => {
  loginLoading.value = true
  try {
    const res = await login(loginForm.username, loginForm.password, loginForm.totpCode)
    currentUser.value = res.user
    isLoggedIn.value = true
    scheduleSessionRefresh(res.expiresIn)
    if (route.path === '/') router.replace('/dashboard')
  } catch (error) {
    const code = error?.response?.data?.error?.code
    const message = code === 'TOTP_REQUIRED'
      ? '请输入正确的 2FA 动态验证码'
      : extractErrorMessage(error, '登录失败，请检查账号、密码或 API 服务状态')
    ElMessage.error(message)
  } finally {
    loginLoading.value = false
  }
}

const handleLogout = () => {
  clearTimeout(sessionRefreshTimer)
  clearToken()
  currentUser.value = null
  isLoggedIn.value = false
  statsBadge.value = 0
  mobileToolsOpen.value = false
}

const handleAuthExpired = (event) => {
  clearTimeout(sessionRefreshTimer)
  isLoggedIn.value = false
  currentUser.value = null
  statsBadge.value = 0
  const code = event?.detail?.code
  const message = code === 'TOKEN_EXPIRED'
    ? '登录已过期，请重新登录'
    : code === 'TOKEN_REVOKED'
      ? '账号会话已被重置，请重新登录'
      : code === 'ACCOUNT_LOCKED'
        ? '账号已被临时锁定，请稍后再试'
        : '登录状态已失效，请重新登录'
  ElMessage.warning(message)
}

const scheduleSessionRefresh = (expiresIn = 0) => {
  clearTimeout(sessionRefreshTimer)
  const seconds = Number(expiresIn || 0)
  if (!seconds || seconds < 120) return
  const delay = Math.max(60_000, (seconds - 300) * 1000)
  sessionRefreshTimer = window.setTimeout(async () => {
    try {
      const res = await refreshSession()
      currentUser.value = res.data?.user || getCurrentUser()
      scheduleSessionRefresh(res.data?.expiresIn)
    } catch {
      handleAuthExpired()
    }
  }, delay)
}

onMounted(async () => {
  applyTheme()
  applyDensity()
  syncViewport()
  window.addEventListener('resize', syncViewport)
  window.addEventListener('admin-auth-expired', handleAuthExpired)
  if (!isLoggedIn.value) return
  try {
    const res = await validateSession()
    currentUser.value = res.data?.user || getCurrentUser()
    scheduleSessionRefresh(res.data?.expiresIn)
    if (route.path === '/') router.replace('/dashboard')
  } catch {
    handleAuthExpired()
  }
})

watch(() => route.fullPath, () => {
  if (isMobile.value) {
    isCollapse.value = true
    mobileToolsOpen.value = false
  }
})

onBeforeUnmount(() => {
  clearTimeout(sessionRefreshTimer)
  window.removeEventListener('resize', syncViewport)
  window.removeEventListener('admin-auth-expired', handleAuthExpired)
})
</script>
