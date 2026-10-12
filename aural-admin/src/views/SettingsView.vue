<template>
  <div class="settings-layout">
    <nav class="settings-nav" aria-label="设置栏目">
      <button
        v-for="item in tabs"
        :key="item.id"
        :class="{ active: tab === item.id }"
        @click="changeTab(item.id)"
        :disabled="saving"
      >
        {{ item.label }}</button
      ><RouterLink to="/help">使用帮助 ↗</RouterLink>
    </nav>
    <section class="panel settings-panel" v-loading="loading">
      <el-alert
        v-if="error"
        :title="error"
        type="error"
        show-icon
        :closable="false"
        class="mb-16"
      />
      <template v-if="tab === 'account'"
        ><div class="panel-heading">
          <div>
            <h2>账号安全</h2>
            <p>{{ user.username }} · {{ user.displayName || '管理账号' }}</p>
          </div>
        </div>
        <section class="settings-block">
          <h3>修改密码</h3>
          <p>{{ passwordPolicy.description }}。修改后需要重新登录。</p>
          <el-form
            :disabled="saving"
            label-position="top"
            @submit.prevent="changePassword"
            class="narrow-form"
            ><el-form-item label="当前密码"
              ><el-input
                v-model="password.oldPassword"
                type="password"
                show-password
                autocomplete="current-password" /></el-form-item
            ><el-form-item label="新密码"
              ><el-input
                v-model="password.newPassword"
                type="password"
                show-password
                autocomplete="new-password" /></el-form-item
            ><el-form-item label="确认新密码"
              ><el-input
                v-model="password.confirm"
                type="password"
                show-password
                autocomplete="new-password" /></el-form-item
            ><el-button type="primary" native-type="submit" :loading="saving"
              >更新密码</el-button
            ></el-form
          >
        </section>
        <section class="settings-block">
          <div class="panel-heading">
            <div>
              <h3>两步验证</h3>
              <p>登录时使用身份验证器中的 6 位动态码。</p>
            </div>
            <el-tag :type="user.totpEnabled ? 'success' : 'info'">{{
              user.totpEnabled ? '已启用' : '未启用'
            }}</el-tag>
          </div>
          <el-button
            v-if="!user.totpEnabled && !secret"
            :loading="saving"
            @click="setupTotp"
            >设置两步验证</el-button
          >
          <div v-if="secret" class="inline-note">
            <p>
              在身份验证器中添加账号，选择“输入设置密钥”，然后输入以下密钥：
            </p>
            <code class="wrap-text">{{ secret }}</code>
          </div>
          <div v-if="secret || user.totpEnabled" class="filter-row mt-16">
            <el-input
              v-model="code"
              :disabled="saving"
              aria-label="两步验证动态码"
              placeholder="6 位动态验证码"
              inputmode="numeric"
              maxlength="6"
              class="w-220"
            /><el-button
              :type="user.totpEnabled ? 'default' : 'primary'"
              :loading="saving"
              @click="toggleTotp"
              >{{ user.totpEnabled ? '关闭两步验证' : '验证并启用' }}</el-button
            >
          </div>
        </section>
      </template>
      <template v-if="tab === 'team'"
        ><div class="panel-heading">
          <div>
            <h2>团队与权限</h2>
            <p>按工作职责分配账号，每位成员使用独立账号。</p>
          </div>
          <el-button type="primary" @click="editUser()">新增成员</el-button>
        </div>
        <div class="role-guide">
          <span v-for="(role, key) in roles" :key="key"
            ><strong>{{ role.label }}</strong> ·
            {{
              (role.permissions?.includes('*') ? '全部管理权限' : '') ||
              role.description ||
              role.permissions
                ?.filter((p) => p.endsWith(':write'))
                .map((p) => moduleLabel(p.split(':')[0]))
                .join('、') ||
              '查看授权内容'
            }}</span
          >
        </div>
        <el-table :data="users" class="wide-table"
          ><el-table-column
            prop="displayName"
            label="成员"
            min-width="120"
          /><el-table-column
            prop="username"
            label="账号"
            min-width="120"
          /><el-table-column label="角色" min-width="120"
            ><template #default="{ row }">{{
              roles[row.role]?.label || row.role
            }}</template></el-table-column
          ><el-table-column label="状态" width="100"
            ><template #default="{ row }"
              ><el-tag :type="row.status === 'active' ? 'success' : 'info'">{{
                row.status === 'active' ? '启用' : '停用'
              }}</el-tag></template
            ></el-table-column
          ><el-table-column label="操作" width="110"
            ><template #default="{ row }"
              ><el-button text type="primary" @click="editUser(row)"
                >管理</el-button
              ></template
            ></el-table-column
          ></el-table
        ></template
      >
      <template v-if="tab === 'backups'"
        ><div class="panel-heading">
          <div>
            <h2>数据备份</h2>
            <p>保存数据库与本地素材的完整副本，并检查文件完整性。</p>
          </div>
          <el-button
            v-if="can('backups:create')"
            type="primary"
            :loading="saving"
            @click="createBackup"
            >创建备份</el-button
          >
        </div>
        <el-table :data="rows" class="wide-table"
          ><el-table-column
            prop="filename"
            label="备份文件"
            min-width="260"
            show-overflow-tooltip
          /><el-table-column label="时间" min-width="170"
            ><template #default="{ row }">{{
              formatTime(row.createdAt)
            }}</template></el-table-column
          ><el-table-column
            prop="operator"
            label="操作人"
            width="120"
          /><el-table-column label="结果" width="90"
            ><template #default="{ row }"
              ><el-tag
                :type="row.status === 'success' ? 'success' : 'danger'"
                >{{ row.status !== 'success' ? '失败' : /恢复演练通过|校验通过/.test(row.message || '') ? '已校验' : '已创建' }}</el-tag
              ></template
            ></el-table-column
          ><el-table-column
            v-if="can('backups:create')"
            label="检查"
            width="120"
            ><template #default="{ row }"
              ><el-button
                text
                :disabled="row.status !== 'success' || saving"
                @click="verifyBackup(row)"
                >校验副本</el-button
              ></template
            ></el-table-column
          ></el-table
        >
        <p class="field-hint">
          服务运行时每日自动备份数据库与素材，校验后清理过期副本，至少保留两个有效完整恢复点。校验不会覆盖当前数据库；异地备份与正式恢复仍需维护人员配置和验收。
        </p></template
      >
      <template v-if="tab === 'activity'"
        ><div class="panel-heading">
          <div>
            <h2>操作记录</h2>
            <p>查看产品、内容和账号的变更记录。</p>
          </div>
          <el-button @click="loadTab">刷新</el-button>
        </div>
        <div class="filter-row wrap mb-16">
          <el-input
            v-model="logFilters.operator"
            placeholder="搜索操作人"
            clearable
            class="w-220"
            @keyup.enter="logSearch"
            @clear="logSearch"
          /><el-select
            v-model="logFilters.module"
            class="w-140"
            @change="logSearch"
            ><el-option label="全部栏目" value="all" /><el-option
              v-for="value in [
                'products',
                'articles',
                'artists',
                'cms',
                'config',
                'crm',
                'resources',
                'system',
                'auth',
              ]"
              :key="value"
              :value="value"
              :label="moduleLabel(value)" /></el-select
          ><el-date-picker
            v-model="logFilters.startDate"
            value-format="YYYY-MM-DD"
            placeholder="开始日期"
            @change="logSearch"
          /><el-date-picker
            v-model="logFilters.endDate"
            value-format="YYYY-MM-DD"
            placeholder="结束日期"
            @change="logSearch"
          /><el-button @click="logSearch">筛选</el-button>
        </div>
        <el-table :data="rows" class="wide-table"
          ><el-table-column label="时间" min-width="175"
            ><template #default="{ row }">{{
              formatTime(row.createdAt)
            }}</template></el-table-column
          ><el-table-column
            prop="operator"
            label="操作人"
            width="130" /><el-table-column label="栏目" width="120"
            ><template #default="{ row }">{{
              moduleLabel(row.module)
            }}</template></el-table-column
          ><el-table-column
            prop="summary"
            label="操作"
            min-width="240"
            show-overflow-tooltip /></el-table
      ></template>
      <template v-if="tab === 'recycle'"
        ><div class="panel-heading">
          <div>
            <h2>回收站</h2>
            <p>误删内容可恢复；恢复后请核对官网显示。</p>
          </div>
          <el-button @click="loadTab">刷新</el-button>
        </div>
        <el-table :data="rows"
          ><el-table-column
            prop="title"
            label="内容"
            min-width="160"
          /><el-table-column label="类型"><template #default="{row}">{{ contentModuleLabel(row.module) }}</template></el-table-column><el-table-column
            label="删除时间"
            min-width="170"
            ><template #default="{ row }">{{
              formatTime(row.createdAt)
            }}</template></el-table-column
          ><el-table-column label="操作" fixed="right" width="100"
            ><template #default="{ row }"
              ><el-button text :disabled="saving" @click="restoreDeleted(row)"
                >恢复</el-button
              ></template
            ></el-table-column
          ></el-table
        ></template
      >
      <template v-if="tab === 'notifications'"
        ><h2>通知投递</h2>
        <p class="field-hint">
          查看 Webhook 投递结果与重试记录。未配置通知地址时，不会创建投递任务。
        </p>
        <el-table :data="rows"
          ><el-table-column prop="type" label="类型" /><el-table-column
            prop="status"
            label="状态"
          /><el-table-column prop="attempts" label="尝试次数" /><el-table-column
            prop="error"
            label="失败原因"
            min-width="200"
          /><el-table-column label="操作"
            ><template #default="{ row }"
              ><el-button
                v-if="can('alerts:write')"
                :disabled="
                  saving || ['sent', 'sending', 'pending'].includes(row.status)
                "
                text
                @click="retryNotification(row)"
                >重试</el-button
              ></template
            ></el-table-column
          ></el-table
        ></template
      >
      <template v-if="tab === 'maintenance'"
        ><h2>自动维护记录</h2>
        <p class="field-hint">
          每日清理过期访问日志、投递记录与过期备份，不会自动删除产品或客户咨询。
        </p>
        <el-table :data="rows"
          ><el-table-column prop="task" label="任务" /><el-table-column
            prop="status"
            label="结果"
          /><el-table-column
            prop="details"
            label="详情"
            min-width="240"
          /><el-table-column label="时间" min-width="170"
            ><template #default="{ row }">{{
              formatTime(row.createdAt)
            }}</template></el-table-column
          ></el-table
        ></template
      >
      <div
        v-if="
          [
            'backups',
            'activity',
            'recycle',
            'notifications',
            'maintenance',
          ].includes(tab)
        "
        class="table-pagination"
      >
        <span>共 {{ total }} 条记录</span
        ><el-pagination
          v-model:current-page="page"
          :total="total"
          :page-size="20"
          layout="prev, pager, next"
          :pager-count="5"
          @current-change="loadTab"
        />
      </div>
    </section>
    <el-dialog
      v-model="memberOpen"
      :title="member.id ? '管理成员' : '新增成员'"
      width="520px"
      destroy-on-close
      :before-close="closeMember"
      ><el-alert
        v-if="error"
        :title="error"
        type="error"
        show-icon
        :closable="false"
        class="mb-16"
      />
      <el-form :disabled="saving" label-position="top"
        ><el-form-item label="账号"
          ><el-input
            v-model="member.username"
            :disabled="!!member.id"
            placeholder="3–32 位字母、数字或下划线" /></el-form-item
        ><el-form-item label="显示名称"
          ><el-input v-model="member.displayName" /></el-form-item
        ><el-form-item v-if="!member.id" label="初始密码"
          ><el-input
            v-model="member.password"
            type="password"
            show-password
            autocomplete="new-password"
            :placeholder="passwordPolicy.description" /></el-form-item
        ><el-form-item label="角色"
          ><el-select
            v-model="member.role"
            class="full"
            :disabled="member.id === user.id"
            ><el-option
              v-for="(role, key) in roles"
              :key="key"
              :label="role.label"
              :value="key" /></el-select></el-form-item
        ><el-form-item label="状态"
          ><el-switch
            v-model="member.status"
            active-value="active"
            inactive-value="disabled"
            active-text="启用"
            :disabled="member.id === user.id"
        /></el-form-item>
        <p v-if="member.id === user.id" class="field-hint">
          当前账号的角色与状态需由其他超级管理员调整。
        </p></el-form
      >
      <details
        v-if="member.id && member.id !== user.id"
        class="form-disclosure"
      >
        <summary>重置登录密码</summary>
        <p class="field-hint">重置后，该成员的已有登录会话将失效。</p>
        <el-input
          v-model="resetPassword"
          :disabled="saving"
          type="password"
          show-password
          autocomplete="new-password"
          :placeholder="passwordPolicy.description"
        /><el-button
          class="mt-16"
          :loading="saving"
          @click="resetMemberPassword"
          >重置密码</el-button
        >
      </details>
      <template #footer
        ><el-button @click="closeMember()">取消</el-button
        ><el-button type="primary" :loading="saving" @click="saveMember"
          >保存成员</el-button
        ></template
      ></el-dialog
    >
  </div>
</template>
<script setup>
const contentModuleLabel = value => ({product:'产品',article:'新闻',artist:'艺术家',config:'官网设置',supportFaq:'常见问题',supportDownload:'下载资料',quickGuide:'使用指南',pageContent:'独立页面',audioSolution:'音响方案',audioStat:'音响指标',brandTimeline:'品牌历程',ecosystemService:'首页入口',inquiry:'客户咨询',artistApplication:'合作申请'})[value] || value

import { useUnsavedChanges } from '../lib/editorLifecycle'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  api,
  getCurrentUser,
  hasPermission as can,
  clearToken,
  setToken,
  setCurrentUser,
  listData,
  paginationMeta,
  sensitiveConfirmation,
  extractErrorMessage,
} from '../lib/api'
import { formatTime } from '../lib/format'
const passwordPolicy = reactive({
  minLength: 12,
  maxLength: 64,
  complex: true,
  description: '12–64 位，包含大小写字母、数字和符号',
})
const validPassword = (value) =>
  typeof value === 'string' &&
  value.length >= passwordPolicy.minLength &&
  value.length <= passwordPolicy.maxLength &&
  /[A-Za-z]/.test(value) &&
  /\d/.test(value) &&
  (!passwordPolicy.complex ||
    (/[a-z]/.test(value) && /[A-Z]/.test(value) && /[^A-Za-z0-9]/.test(value)))
const user = ref(getCurrentUser() || {}),
  tab = ref('account'),
  loading = ref(false),
  saving = ref(false),
  error = ref(''),
  users = ref([]),
  roles = ref({}),
  rows = ref([]),
  page = ref(1),
  total = ref(0),
  secret = ref(''),
  code = ref(''),
  memberOpen = ref(false)
const logFilters = reactive({
  operator: '',
  module: 'all',
  startDate: '',
  endDate: '',
})
const logSearch = () => {
  page.value = 1
  loadTab()
}
const resetPassword = ref('')
const password = reactive({ oldPassword: '', newPassword: '', confirm: '' }),
  member = reactive({})
const tabs = computed(() => [
  { id: 'account', label: '账号安全' },
  ...([
    'products:write',
    'articles:write',
    'cms:write',
    'crm:write',
    'artists:write',
  ].some(can)
    ? [{ id: 'recycle', label: '回收站' }]
    : []),
  ...(can('admin:write') ? [{ id: 'team', label: '团队与权限' }] : []),
  ...(can('logs:read')
    ? [
        { id: 'backups', label: '数据备份' },
        { id: 'activity', label: '操作记录' },
        { id: 'notifications', label: '通知投递' },
        { id: 'maintenance', label: '维护记录' },
      ]
    : []),
])
const moduleLabel = (m) =>
  ({
    products: '产品',
    articles: '新闻',
    crm: '客户咨询',
    cms: '官网栏目',
    config: '首页与品牌',
    artists: '艺术家',
    resources: '素材',
    security: '账号安全',
    system: '系统',
    auth: '登录',
  })[m] ||
  m ||
  '—'
let requestId = 0
async function loadTab() {
  const id = ++requestId
  error.value = ''
  rows.value = []
  loading.value = true
  try {
    if (tab.value === 'team') {
      const res = await api.get('/api/admin/users')
      if (id !== requestId) return
      users.value = listData(res)
      roles.value = res.data.roles || {}
    }
    if (
      [
        'backups',
        'activity',
        'recycle',
        'notifications',
        'maintenance',
      ].includes(tab.value)
    ) {
      const res = await api.get(
        {
          backups: '/api/admin/backups',
          activity: '/api/admin/operation-logs',
          recycle: '/api/admin/recycle-bin',
          notifications: '/api/admin/notifications',
          maintenance: '/api/admin/maintenance',
        }[tab.value],
        {
          params: {
            page: page.value,
            pageSize: 20,
            ...(tab.value === 'activity'
              ? {
                  ...logFilters,
                  startDate: logFilters.startDate || '',
                  endDate: logFilters.endDate || '',
                }
              : {}),
          },
        },
      )
      if (id !== requestId) return
      rows.value = listData(res)
      total.value = paginationMeta(res).total
    }
  } catch (e) {
    if (id === requestId) error.value = extractErrorMessage(e, '加载失败')
  } finally {
    if (id === requestId) loading.value = false
  }
}
watch(tab, () => {
  page.value = 1
  loadTab()
})
async function run(action) {
  if (saving.value) return
  saving.value = true
  error.value = ''
  try {
    await action()
  } catch (e) {
    if (!['cancel', 'close'].includes(e))
      error.value = extractErrorMessage(e, '操作失败')
  } finally {
    saving.value = false
  }
}
function changePassword() {
  if (
    !password.oldPassword ||
    !validPassword(password.newPassword) ||
    password.newPassword !== password.confirm
  ) {
    ElMessage.warning('请填写当前密码，并确保新密码符合要求且两次输入一致')
    return
  }
  return run(async () => {
    await api.post('/api/auth/change-password', {
      oldPassword: password.oldPassword,
      newPassword: password.newPassword,
    })
    clearToken()
    window.dispatchEvent(new CustomEvent('admin-auth-expired'))
    ElMessage.success('密码已更新，请重新登录')
  })
}
function setupTotp() {
  return run(async () => {
    const res = await api.post('/api/auth/2fa/setup')
    secret.value = res.data.secret
  })
}
function toggleTotp() {
  if (!/^\d{6}$/.test(code.value)) {
    ElMessage.warning('请输入 6 位动态码')
    return
  }
  return run(async () => {
    if (user.value.totpEnabled)
      await ElMessageBox.confirm(
        '关闭后登录将只验证密码。确认关闭两步验证？',
        '两步验证',
        {
          type: 'warning',
        },
      )
    const res = await api.post(
      `/api/auth/2fa/${user.value.totpEnabled ? 'disable' : 'enable'}`,
      {
        code: code.value,
      },
    )
    setToken(res.data.token)
    setCurrentUser(res.data.user)
    user.value = res.data.user
    window.dispatchEvent(
      new CustomEvent('admin-session-updated', { detail: res.data }),
    )
    secret.value = ''
    code.value = ''
    ElMessage.success('两步验证设置已更新')
  })
}
let originalMember = ''
const { confirmLeave } = useUnsavedChanges({
  dirty: () =>
    (memberOpen.value &&
      (JSON.stringify(member) !== originalMember || !!resetPassword.value)) ||
    !!password.oldPassword ||
    !!password.newPassword ||
    !!password.confirm ||
    !!code.value ||
    !!secret.value,
  busy: () => saving.value,
})
async function closeMember(done) {
  if (!(await confirmLeave())) return
  if (typeof done === 'function') done()
  else memberOpen.value = false
}
async function changeTab(next) {
  if (next === tab.value || !(await confirmLeave())) return
  Object.assign(password, { oldPassword: '', newPassword: '', confirm: '' })
  code.value = ''
  secret.value = ''
  memberOpen.value = false
  tab.value = next
}
function editUser(row) {
  if (saving.value) return
  error.value = ''
  resetPassword.value = ''
  for (const key of Object.keys(member)) delete member[key]
  Object.assign(
    member,
    row
      ? {
          id: row.id,
          username: row.username,
          displayName: row.displayName,
          role: row.role,
          status: row.status,
        }
      : {
          username: '',
          displayName: '',
          password: '',
          role: 'readonly',
          status: 'active',
        },
  )
  originalMember = JSON.stringify(member)
  memberOpen.value = true
}
function saveMember() {
  if (
    !member.id &&
    (!/^[a-zA-Z0-9_-]{3,32}$/.test(member.username) ||
      !validPassword(member.password))
  ) {
    ElMessage.warning('请检查账号格式与初始密码')
    return
  }
  return run(async () => {
    if (member.id)
      await api.put(`/api/admin/users/${member.id}`, {
        displayName: member.displayName,
        role: member.role,
        status: member.status,
      })
    else await api.post('/api/admin/users', { ...member })
    memberOpen.value = false
    member.password = ''
    await loadTab()
    ElMessage.success('成员已保存')
  })
}
function resetMemberPassword() {
  if (!validPassword(resetPassword.value)) {
    ElMessage.warning(passwordPolicy.description)
    return
  }
  return run(async () => {
    await ElMessageBox.confirm(
      `重置「${member.username}」的密码并使其现有会话失效？`,
      '重置成员密码',
      {
        type: 'warning',
        confirmButtonText: '重置密码',
        cancelButtonText: '取消',
      },
    )
    await api.post(`/api/admin/users/${member.id}/reset-password`, {
      newPassword: resetPassword.value,
      ...sensitiveConfirmation(),
    })
    resetPassword.value = ''
    ElMessage.success('成员密码已重置')
  })
}
function restoreDeleted(row) {
  return run(async () => {
    await ElMessageBox.confirm(`恢复“${row.title}”？`, '恢复内容')
    await api.post(`/api/admin/recycle-bin/${row.id}/restore`)
    await loadTab()
    ElMessage.success('内容已恢复')
  })
}
function retryNotification(row) {
  return run(async () => {
    await api.post(`/api/admin/notifications/${row.id}/retry`)
    await loadTab()
    ElMessage.success('已安排重试')
  })
}
function createBackup() {
  return run(async () => {
    await ElMessageBox.confirm('创建当前数据库与本地素材的服务器备份？', '创建备份', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
    })
    await api.post('/api/admin/backups', sensitiveConfirmation())
    page.value = 1
    await loadTab()
    ElMessage.success('备份已创建')
  })
}
function verifyBackup(row) {
  return run(async () => {
    const res = await api.post(
      `/api/admin/backups/${row.id}/verify-restore`,
      sensitiveConfirmation(),
    )
    ElMessage.success(res.data.message || '备份副本校验完成')
    await loadTab()
  })
}
onMounted(async () => {
  try {
    Object.assign(passwordPolicy, (await api.get('/api/auth/policy')).data)
  } catch {}
  await loadTab()
})
</script>
