<template>
  <div>
    <section class="business-command-panel crm-command-panel">
      <div class="business-command-main">
        <span class="business-kicker">客户线索</span>
        <h2>每天优先处理未读、紧急和需要下一步动作的客户</h2>
        <p>这里集中处理官网咨询、报价需求、售后服务和艺术家申请。先筛出未读与紧急，再在详情抽屉记录跟进结果。</p>
        <div class="business-command-actions">
          <el-button type="primary" color="#fff" class="light-btn" @click="showUnreadInquiries">处理未读工单</el-button>
          <el-button color="#222" class="dark-btn" @click="showUrgentInquiries">查看紧急工单</el-button>
        </div>
      </div>
      <div class="business-task-grid">
        <article v-for="item in crmOpsCards" :key="item.label" class="business-task-card" :class="item.tone">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
          <small>{{ item.desc }}</small>
        </article>
      </div>
    </section>

    <el-tabs v-model="crmTab" class="dark-tabs enterprise-crm-tabs">
      <el-tab-pane name="inquiries">
        <template #label>
          客户工单
          <el-badge v-if="unreadCount > 0" :value="unreadCount" type="danger" class="tab-badge" />
        </template>

        <div class="crm-summary">
          <div v-for="item in summaryCards" :key="item.label" class="crm-summary-card" :class="item.tone">
            <strong>{{ item.value }}</strong>
            <span>{{ item.label }}</span>
          </div>
        </div>

        <div class="table-tools stacked">
          <div class="filter-row wrap">
            <el-input v-model="inquiryFilters.keyword" placeholder="搜索客户、联系方式、产品或备注" :prefix-icon="Search" class="w-320" clearable @keyup.enter="fetchInquiries" />
            <el-select v-model="inquiryFilters.status" class="w-130" @change="fetchInquiries"><el-option label="全部阶段" value="all" /><el-option v-for="item in inquiryStatusOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select>
            <el-select v-model="inquiryFilters.priority" class="w-130" @change="fetchInquiries"><el-option label="全部优先级" value="all" /><el-option v-for="item in inquiryPriorityOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select>
            <el-select v-model="inquiryFilters.type" class="w-130" @change="fetchInquiries"><el-option label="全部类型" value="all" /><el-option v-for="item in inquiryTypeOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select>
            <el-input v-model="inquiryFilters.city" placeholder="城市" class="w-130" clearable @keyup.enter="fetchInquiries" />
            <el-input v-model="inquiryFilters.product" placeholder="产品" class="w-160" clearable @keyup.enter="fetchInquiries" />
            <el-date-picker v-model="inquiryDateRange" type="daterange" start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD" class="date-range" @change="fetchInquiries" />
          </div>
          <div class="filter-row">
            <el-button color="#222" class="dark-btn" @click="fetchInquiries">筛选</el-button>
            <el-button @click="resetInquiryFilters">重置</el-button>
            <el-button type="success" plain @click="exportInquiries">导出 CSV</el-button>
            <el-button type="warning" plain :disabled="!selectedInquiryIds.length" @click="bulkMarkRead">批量已读</el-button>
          </div>
        </div>

        <el-alert v-if="crmError" :title="crmError" type="error" show-icon :closable="false" class="mb-16" />

        <div class="mobile-admin-list crm-mobile-list" v-loading="inquiriesLoading">
          <article v-for="row in inquiries" :key="row.id" class="mobile-admin-card crm-mobile-card">
            <div class="mobile-list-body">
              <div class="mobile-list-tags">
                <el-tag size="small" :type="inquiryStatusMeta(row.status).type" effect="dark">{{ inquiryStatusMeta(row.status).label }}</el-tag>
                <el-tag size="small" :type="inquiryPriorityMeta(row.priority).type" effect="dark">{{ inquiryPriorityMeta(row.priority).label }}</el-tag>
                <el-tag size="small" effect="dark">{{ inquiryTypeLabel(row.inquiryType) }}</el-tag>
              </div>
              <strong>{{ row.customerName }}</strong>
              <small>{{ row.contactInfo }}</small>
              <p>{{ row.productTitle || '未关联产品' }} · {{ row.city || '未填城市' }}</p>
              <div class="mobile-list-meta">
                <span>{{ nextActionLabel(row) }}</span>
                <span>{{ formatTime(row.createdAt) }}</span>
              </div>
              <div class="mobile-list-actions">
                <el-button size="small" color="#222" class="dark-btn" @click="openInquiryDrawer(row)">详情</el-button>
                <el-button v-if="!row.isRead" size="small" type="success" plain @click="readInquiry(row.id)">已读</el-button>
                <el-button size="small" type="danger" @click="deleteInquiry(row.id)">删除</el-button>
              </div>
            </div>
          </article>
          <div v-if="!inquiriesLoading && !inquiries.length" class="empty-panel compact-empty">暂无客户工单</div>
        </div>

        <el-table :data="inquiries" border class="wide-table mobile-hidden-table" row-key="id" v-loading="inquiriesLoading" empty-text="暂无客户工单" @selection-change="selectedInquiryIds = $event.map(row => row.id)" :row-class-name="rowClassName">
          <el-table-column type="selection" width="45" />
          <el-table-column label="阶段" width="100" align="center">
            <template #default="{ row }"><el-tag :type="inquiryStatusMeta(row.status).type" effect="dark">{{ inquiryStatusMeta(row.status).label }}</el-tag></template>
          </el-table-column>
          <el-table-column label="优先级" width="90" align="center">
            <template #default="{ row }"><el-tag :type="inquiryPriorityMeta(row.priority).type" effect="dark">{{ inquiryPriorityMeta(row.priority).label }}</el-tag></template>
          </el-table-column>
          <el-table-column label="类型" width="110"><template #default="{ row }">{{ inquiryTypeLabel(row.inquiryType) }}</template></el-table-column>
          <el-table-column prop="customerName" label="客户" width="120" />
          <el-table-column prop="contactInfo" label="联系方式" width="150" />
          <el-table-column prop="productTitle" label="产品" width="170" show-overflow-tooltip />
          <el-table-column prop="city" label="城市" width="100" />
          <el-table-column prop="message" label="需求描述" min-width="260" show-overflow-tooltip />
          <el-table-column label="下一步" width="150">
            <template #default="{ row }">{{ nextActionLabel(row) }}</template>
          </el-table-column>
          <el-table-column label="提交时间" width="170"><template #default="{ row }">{{ formatTime(row.createdAt) }}</template></el-table-column>
          <el-table-column label="操作" width="180" align="center">
            <template #default="{ row }">
              <el-button-group>
                <el-button size="small" color="#222" class="dark-btn" @click="openInquiryDrawer(row)">详情</el-button>
                <el-button v-if="!row.isRead" size="small" type="success" plain @click="readInquiry(row.id)">已读</el-button>
                <el-button size="small" :icon="Delete" type="danger" @click="deleteInquiry(row.id)" />
              </el-button-group>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

        <el-tab-pane name="artistApps">
        <template #label>
          艺术家招募审批
          <el-badge v-if="pendingArtists > 0" :value="pendingArtists" type="warning" class="tab-badge" />
        </template>
        <div class="mobile-admin-list crm-mobile-list" v-loading="artistAppsLoading">
          <article v-for="row in artistApps" :key="row.id" class="mobile-admin-card crm-mobile-card">
            <div class="mobile-list-body">
              <div class="mobile-list-tags">
                <el-tag size="small" :type="row.status === 'pending' ? 'warning' : 'success'" effect="dark">{{ row.status === 'pending' ? '待审阅' : '已跟进' }}</el-tag>
                <el-tag size="small" effect="dark">{{ row.name || '未命名申请' }}</el-tag>
              </div>
              <strong>{{ row.name }}</strong>
              <small>{{ row.email }}</small>
              <p>{{ row.message || '暂无简介' }}</p>
              <div class="mobile-list-meta">
                <span>{{ formatTime(row.createdAt) }}</span>
              </div>
              <div class="mobile-list-actions">
                <el-button v-if="row.status === 'pending'" size="small" type="success" plain @click="reviewArtist(row.id)">标记跟进</el-button>
                <el-button size="small" type="danger" @click="deleteArtistApp(row.id)">删除</el-button>
              </div>
            </div>
          </article>
          <div v-if="!artistAppsLoading && !artistApps.length" class="empty-panel compact-empty">暂无艺术家申请</div>
        </div>

        <el-table :data="artistApps" border class="wide-table mobile-hidden-table" v-loading="artistAppsLoading" empty-text="暂无艺术家申请">
          <el-table-column label="状态" width="100" align="center">
            <template #default="{ row }"><el-tag :type="row.status === 'pending' ? 'warning' : 'success'" effect="dark">{{ row.status === 'pending' ? '待审阅' : '已跟进' }}</el-tag></template>
          </el-table-column>
          <el-table-column prop="name" label="姓名/艺名" width="120" />
          <el-table-column prop="email" label="联系邮箱" width="180" />
          <el-table-column label="作品集" width="120"><template #default="{ row }"><a :href="row.portfolioUrl" target="_blank" class="link">查看链接</a></template></el-table-column>
          <el-table-column prop="message" label="个人简介/意向" min-width="260" show-overflow-tooltip />
          <el-table-column label="提交时间" width="170"><template #default="{ row }">{{ formatTime(row.createdAt) }}</template></el-table-column>
          <el-table-column label="操作" width="190" align="center">
            <template #default="{ row }">
              <el-button v-if="row.status === 'pending'" size="small" type="success" plain @click="reviewArtist(row.id)">标记跟进</el-button>
              <el-button size="small" :icon="Delete" type="danger" @click="deleteArtistApp(row.id)" />
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-drawer v-model="drawerOpen" title="工单详情与跟进" size="520px" class="dark-drawer">
      <template v-if="activeInquiry">
        <el-descriptions :column="1" border size="small" class="mb-18">
          <el-descriptions-item label="客户">{{ inquiryForm.customerName || '-' }}</el-descriptions-item>
          <el-descriptions-item label="联系方式">{{ inquiryForm.contactInfo || '-' }}</el-descriptions-item>
          <el-descriptions-item label="产品">{{ inquiryForm.productTitle || '-' }}</el-descriptions-item>
          <el-descriptions-item label="城市">{{ inquiryForm.city || '-' }}</el-descriptions-item>
          <el-descriptions-item label="提交时间">{{ formatTime(activeInquiry.createdAt) }}</el-descriptions-item>
        </el-descriptions>

        <div class="timeline-block">
          <h3>跟进时间线</h3>
          <el-timeline>
            <el-timeline-item :timestamp="formatTime(activeInquiry.createdAt)" type="primary">客户提交 {{ inquiryTypeLabel(activeInquiry.inquiryType) }}</el-timeline-item>
            <el-timeline-item v-if="activeInquiry.followedAt" :timestamp="formatTime(activeInquiry.followedAt)" type="success">最近一次跟进：{{ inquiryStatusMeta(activeInquiry.status).label }}</el-timeline-item>
            <el-timeline-item v-if="activeInquiry.internalNote" type="warning">{{ activeInquiry.internalNote }}</el-timeline-item>
          </el-timeline>
        </div>

        <el-form :model="inquiryForm" label-width="90px">
          <el-row :gutter="16">
            <el-col :span="12"><el-form-item label="跟进阶段"><el-select v-model="inquiryForm.status" class="full"><el-option v-for="item in inquiryStatusOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="优先级"><el-select v-model="inquiryForm.priority" class="full"><el-option v-for="item in inquiryPriorityOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item></el-col>
          </el-row>
          <el-form-item label="下次动作"><el-input v-model="inquiryForm.nextAction" placeholder="例如：明天下午回电确认试奏时间" /></el-form-item>
          <el-form-item label="客户需求"><el-input :model-value="inquiryForm.message" type="textarea" :rows="5" readonly /></el-form-item>
          <el-form-item label="内部备注"><el-input v-model="inquiryForm.internalNote" type="textarea" :rows="5" placeholder="记录联系结果、报价、上门安排或下一步动作" /></el-form-item>
        </el-form>

        <div class="drawer-footer">
          <el-button @click="drawerOpen = false">取消</el-button>
          <el-button type="primary" @click="submitInquiryFollowup">保存跟进</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Search } from '@element-plus/icons-vue'
import { api, extractErrorMessage, listData, recordExport, sensitiveConfirmation } from '../lib/api'
import { csvEscape, downloadTextFile, formatTime } from '../lib/format'
import { inquiryPriorityMeta, inquiryPriorityOptions, inquiryStatusMeta, inquiryStatusOptions, inquiryTypeLabel, inquiryTypeOptions } from '../lib/meta'

const emit = defineEmits(['stats-change'])

const crmTab = ref('inquiries')
const inquiries = ref([])
const artistApps = ref([])
const inquiriesLoading = ref(false)
const artistAppsLoading = ref(false)
const crmError = ref('')
const selectedInquiryIds = ref([])
const drawerOpen = ref(false)
const activeInquiry = ref(null)
const inquiryDateRange = ref([])
const inquiryFilters = reactive({ keyword: '', status: 'all', priority: 'all', type: 'all', city: '', product: '' })
const inquiryForm = reactive({ id: null, status: 'new', priority: 'normal', internalNote: '', nextAction: '', customerName: '', contactInfo: '', productTitle: '', city: '', message: '' })
const crmStateKey = 'hushi-admin-crm-state'

const unreadCount = computed(() => inquiries.value.filter((row) => !row.isRead).length)
const urgentCount = computed(() => inquiries.value.filter((row) => row.priority === 'urgent').length)
const pendingArtists = computed(() => artistApps.value.filter((row) => row.status === 'pending').length)

const summaryCards = computed(() => [
  { label: '未读工单', value: unreadCount.value, tone: 'urgent' },
  { label: '紧急工单', value: urgentCount.value, tone: 'danger' },
  { label: '今日新增', value: todayCount.value, tone: '' },
  { label: '待审艺术家', value: pendingArtists.value, tone: 'warning' }
])

const activePipelineCount = computed(() => inquiries.value.filter((row) => !['done', 'closed'].includes(row.status)).length)
const crmOpsCards = computed(() => [
  { label: '未读工单', value: unreadCount.value, desc: '需要先确认客户需求', tone: unreadCount.value ? 'danger' : 'success' },
  { label: '紧急工单', value: urgentCount.value, desc: '建议当天处理', tone: urgentCount.value ? 'danger' : 'success' },
  { label: '进行中', value: activePipelineCount.value, desc: '报价/服务/待跟进', tone: activePipelineCount.value ? 'primary' : 'success' },
  { label: '艺术家申请', value: pendingArtists.value, desc: '待审阅合作线索', tone: pendingArtists.value ? 'warning' : 'success' }
])

const todayCount = computed(() => {
  const today = new Date().toDateString()
  return inquiries.value.filter((item) => item.createdAt && new Date(item.createdAt).toDateString() === today).length
})

const syncBadge = () => emit('stats-change', unreadCount.value + pendingArtists.value)

const fetchInquiries = async () => {
  inquiriesLoading.value = true
  crmError.value = ''
  const [startDate, endDate] = inquiryDateRange.value || []
  const params = { ...inquiryFilters, startDate, endDate }
  saveCrmState()
  try {
    const res = await api.get('/api/inquiries', { params })
    inquiries.value = listData(res)
    syncBadge()
  } catch (error) {
    crmError.value = extractErrorMessage(error, '工单列表加载失败')
    inquiries.value = []
  } finally {
    inquiriesLoading.value = false
  }
}

const fetchArtistApps = async () => {
  artistAppsLoading.value = true
  try {
    const res = await api.get('/api/artist-applications')
    artistApps.value = listData(res)
    syncBadge()
  } catch (error) {
    crmError.value = extractErrorMessage(error, '艺术家申请加载失败')
    artistApps.value = []
  } finally {
    artistAppsLoading.value = false
  }
}

const saveCrmState = () => {
  try {
    window.localStorage.setItem(crmStateKey, JSON.stringify({
      tab: crmTab.value,
      filters: { ...inquiryFilters },
      dateRange: inquiryDateRange.value
    }))
  } catch {}
}

const restoreCrmState = () => {
  try {
    const state = JSON.parse(window.localStorage.getItem(crmStateKey) || '{}')
    if (state.tab) crmTab.value = state.tab
    if (state.filters) Object.assign(inquiryFilters, state.filters)
    if (Array.isArray(state.dateRange)) inquiryDateRange.value = state.dateRange
  } catch {}
}

const resetInquiryFilters = () => {
  Object.assign(inquiryFilters, { keyword: '', status: 'all', priority: 'all', type: 'all', city: '', product: '' })
  inquiryDateRange.value = []
  fetchInquiries()
}

const showUnreadInquiries = () => {
  crmTab.value = 'inquiries'
  Object.assign(inquiryFilters, { keyword: '', status: 'all', priority: 'all', type: 'all', city: '', product: '' })
  inquiryDateRange.value = []
  fetchInquiries()
}

const showUrgentInquiries = () => {
  crmTab.value = 'inquiries'
  inquiryFilters.priority = 'urgent'
  fetchInquiries()
}

const exportInquiries = async () => {
  await ElMessageBox.confirm(
    `即将导出当前筛选结果中的 ${inquiries.value.length} 条客户工单，包含联系方式、需求描述和内部备注，并会写入导出审计记录。确认继续？`,
    '客户资料导出确认',
    { type: 'warning', confirmButtonText: '确认导出', cancelButtonText: '取消' }
  )
  const headers = ['阶段', '优先级', '类型', '客户', '联系方式', '产品', '城市', '预算', '期望时间', '需求描述', '内部备注', '提交时间']
  const rows = inquiries.value.map((row) => [
    inquiryStatusMeta(row.status).label,
    inquiryPriorityMeta(row.priority).label,
    inquiryTypeLabel(row.inquiryType),
    row.customerName,
    row.contactInfo,
    row.productTitle,
    row.city,
    row.budget,
    row.preferredTime,
    row.message,
    row.internalNote,
    row.createdAt ? new Date(row.createdAt).toLocaleString() : ''
  ])
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n')
  const filename = `hushi-inquiries-${new Date().toISOString().slice(0, 10)}.csv`
  await recordExport({ module: 'crm', rowCount: rows.length, filename, filters: inquiryFilters, ...sensitiveConfirmation() })
  downloadTextFile(filename, csv)
  ElMessage.success(`已导出 ${rows.length} 条工单`)
}

const rowClassName = ({ row }) => row.priority === 'urgent' ? 'urgent-row' : ''

const nextActionLabel = (row) => {
  if (row.status === 'new') return '首次联系'
  if (row.status === 'contacted') return '确认需求'
  if (row.status === 'quoted') return '跟进报价'
  if (row.status === 'processing') return '服务执行'
  return row.status === 'done' ? '归档复盘' : '-'
}

const readInquiry = async (id) => {
  await api.put(`/api/inquiries/${id}/read`)
  await fetchInquiries()
}

const bulkMarkRead = async () => {
  await Promise.all(selectedInquiryIds.value.map((id) => api.put(`/api/inquiries/${id}/read`)))
  selectedInquiryIds.value = []
  ElMessage.success('已批量标记已读')
  fetchInquiries()
}

const openInquiryDrawer = (row) => {
  activeInquiry.value = row
  Object.assign(inquiryForm, {
    id: row.id,
    status: row.status || 'new',
    priority: row.priority || 'normal',
    internalNote: row.internalNote || '',
    nextAction: nextActionLabel(row),
    customerName: row.customerName || '',
    contactInfo: row.contactInfo || '',
    productTitle: row.productTitle || '',
    city: row.city || '',
    message: row.message || ''
  })
  drawerOpen.value = true
}

const submitInquiryFollowup = async () => {
  const note = [inquiryForm.internalNote, inquiryForm.nextAction ? `下一步：${inquiryForm.nextAction}` : ''].filter(Boolean).join('\n')
  await api.put(`/api/inquiries/${inquiryForm.id}`, { status: inquiryForm.status, priority: inquiryForm.priority, internalNote: note, isRead: true })
  drawerOpen.value = false
  ElMessage.success('工单跟进已保存')
  fetchInquiries()
}

const deleteInquiry = async (id) => {
  await ElMessageBox.confirm('确定删除该工单？', '敏感操作确认', { type: 'warning' })
  await api.delete(`/api/inquiries/${id}`)
  ElMessage.success('已删除')
  fetchInquiries()
}

const reviewArtist = async (id) => {
  await api.put(`/api/artist-applications/${id}/status`, { status: 'reviewed' })
  ElMessage.success('已标记跟进')
  fetchArtistApps()
}

const deleteArtistApp = async (id) => {
  await ElMessageBox.confirm('确定删除该申请？', '敏感操作确认', { type: 'warning' })
  await api.delete(`/api/artist-applications/${id}`)
  ElMessage.success('已删除')
  fetchArtistApps()
}

onMounted(() => {
  restoreCrmState()
  fetchInquiries()
  fetchArtistApps()
})

watch(crmTab, saveCrmState)
</script>
