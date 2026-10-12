<template>
  <section class="panel crm-panel">
    <nav class="section-tabs" aria-label="咨询类型">
      <button
        :class="{ active: tab === 'inquiries' }"
        @click="changeTab('inquiries')"
      >
        客户咨询</button
      ><button
        :class="{ active: tab === 'artistApps' }"
        @click="changeTab('artistApps')"
      >
        艺术家合作
      </button>
    </nav>
    <p v-if="tab === 'inquiries' && !can('admin:write') && can('crm:write')" class="field-hint">
      仅显示分配给你的咨询。负责人由超级管理员分配或调整。
    </p>
    <div class="table-tools">
      <div v-if="tab === 'inquiries'" class="filter-row wrap">
        <el-input
          v-model="filters.keyword"
          class="w-320"
          :prefix-icon="Search"
          placeholder="搜索客户、乐器或需求"
          clearable
          @keyup.enter="applyFilters"
          @clear="applyFilters"
        /><el-select
          v-model="filters.status"
          class="w-140"
          @change="applyFilters"
          aria-label="跟进阶段"
          ><el-option value="all" label="全部阶段" /><el-option
            v-for="item in inquiryStatusOptions"
            :key="item.value"
            :value="item.value"
            :label="item.label" /></el-select
        ><el-select
          v-model="filters.type"
          class="w-140"
          @change="applyFilters"
          aria-label="咨询类型"
          ><el-option value="all" label="全部类型" /><el-option
            v-for="item in inquiryTypeOptions"
            :key="item.value"
            :value="item.value"
            :label="item.label" /></el-select
        ><el-button @click="applyFilters">搜索</el-button
        ><el-button
          v-if="
            filters.keyword ||
            filters.status !== 'all' ||
            filters.type !== 'all'
          "
          text
          @click="resetFilters"
          >重置</el-button
        >
      </div>
      <div v-else class="filter-row">
        <el-input
          v-model="appFilters.keyword"
          placeholder="搜索申请人"
          clearable
          @keyup.enter="applyFilters"
          @clear="applyFilters"
        /><el-select v-model="appFilters.status" aria-label="申请状态" @change="applyFilters"
          ><el-option label="全部状态" value="all" /><el-option
            v-for="(label, value) in artistStatuses"
            :key="value"
            :label="label"
            :value="value"
        /></el-select>
      </div>
      <el-button :loading="loading" @click="load">刷新</el-button>
    </div>
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      show-icon
      :closable="false"
      class="mb-16"
    />
    <el-table
      v-if="tab === 'inquiries'"
      :data="rows"
      v-loading="loading"
      class="wide-table mobile-hidden-table"
      empty-text="暂无符合条件的咨询"
      ><el-table-column label="客户" min-width="140"
        ><template #default="{ row }"
          ><strong>{{ row.customerName || '访客' }}</strong
          ><span v-if="!row.isRead" class="unread-dot" title="未读"></span
          ><small class="cell-subtitle">{{
            row.city || '未填写城市'
          }}</small></template
        ></el-table-column
      ><el-table-column label="咨询内容" min-width="240"
        ><template #default="{ row }"
          >{{ row.productTitle || inquiryTypeLabel(row.inquiryType)
          }}<small class="cell-subtitle text-ellipsis">{{
            row.message || '未填写详情'
          }}</small></template
        ></el-table-column
      ><el-table-column label="类型" width="120"
        ><template #default="{ row }">{{
          inquiryTypeLabel(row.inquiryType)
        }}</template></el-table-column
      ><el-table-column label="阶段" width="110"
        ><template #default="{ row }"
          ><el-tag :type="inquiryStatusMeta(row.status).type">{{
            inquiryStatusMeta(row.status).label
          }}</el-tag></template
        ></el-table-column
      ><el-table-column label="提交时间" width="170"
        ><template #default="{ row }">{{
          formatTime(row.createdAt)
        }}</template></el-table-column
      ><el-table-column fixed="right" label="操作" width="110"
        ><template #default="{ row }"
          ><el-button text type="primary" @click="open(row)">{{
            can('crm:write') ? '查看 / 跟进' : '查看详情'
          }}</el-button></template
        ></el-table-column
      ></el-table
    >
    <el-table
      v-else
      :data="rows"
      v-loading="loading"
      class="wide-table mobile-hidden-table"
      empty-text="暂无合作申请"
      ><el-table-column
        prop="name"
        label="申请人"
        min-width="140"
      /><el-table-column
        prop="portfolioUrl"
        label="作品资料"
        min-width="160"
      /><el-table-column label="状态" width="120"
        ><template #default="{ row }"
          ><el-tag :type="row.status === 'pending' ? 'warning' : 'info'">{{
            artistStatus(row.status)
          }}</el-tag></template
        ></el-table-column
      ><el-table-column label="申请时间" min-width="170"
        ><template #default="{ row }">{{
          formatTime(row.createdAt)
        }}</template></el-table-column
      ><el-table-column fixed="right" label="操作" width="110"
        ><template #default="{ row }"
          ><el-button text type="primary" @click="open(row)"
            >查看申请</el-button
          ></template
        ></el-table-column
      ></el-table
    >
    <div class="mobile-admin-list" v-loading="loading">
      <article v-for="row in rows" :key="row.id" class="mobile-admin-card">
        <div class="mobile-list-body">
          <strong>{{ row.customerName || row.name || '访客' }}</strong>
          <p>
            {{
              row.productTitle ||
              row.portfolioUrl ||
              inquiryTypeLabel(row.inquiryType)
            }}
          </p>
          <small
            >{{
              tab === 'inquiries'
                ? inquiryStatusMeta(row.status).label
                : artistStatus(row.status)
            }}
            · {{ formatTime(row.createdAt) }}</small
          ><el-button @click="open(row)">查看详情</el-button>
        </div>
      </article>
      <div v-if="!rows.length && !loading" class="empty-panel">
        暂无符合条件的记录
      </div>
    </div>
    <div class="table-pagination">
      <span>共 {{ total }} 条{{ tab === 'inquiries' ? '咨询' : '申请' }}</span
      ><el-pagination
        v-model:current-page="page"
        :page-size="20"
        :total="total"
        layout="prev, pager, next"
        :pager-count="5"
        @current-change="load"
      />
    </div>
    <el-drawer
      v-model="drawer"
      :title="tab === 'inquiries' ? '咨询详情与跟进' : '艺术家合作申请'"
      size="560px"
      :before-close="closeDrawer"
      ><template v-if="active"
        ><div class="customer-heading">
          <span class="customer-initial">{{
            (active.customerName || active.name || '客').slice(0, 1)
          }}</span>
          <div>
            <h2>{{ active.customerName || active.name }}</h2>
            <p>{{ formatTime(active.createdAt) }}</p>
          </div>
        </div>
        <dl class="detail-list">
          <dt>联系方式</dt>
          <dd class="contact-reveal">
            <template v-if="!can('crm:private')">当前账号无查看权限</template>
            <template v-else-if="contact.value !== null">
              <span>{{ contact.value || '未填写' }}</span>
              <small class="field-hint">本次查看已记入操作记录</small>
            </template>
            <template v-else>
              <span>已隐藏</span>
              <el-button
                size="small"
                :loading="contact.loading"
                @click="revealContact"
                >查看联系方式</el-button
              >
              <el-alert
                v-if="contact.error"
                :title="contact.error"
                type="error"
                :closable="false"
              />
            </template>
          </dd>
          <dt>{{ tab === 'inquiries' ? '咨询产品' : '作品资料' }}</dt>
          <dd>
            <a
              v-if="
                tab === 'artistApps' &&
                /^https?:\/\//i.test(active.portfolioUrl || '')
              "
              :href="active.portfolioUrl"
              target="_blank"
              rel="noopener noreferrer"
              >查看作品集 ↗</a
            ><span v-else>{{
              active.productTitle || active.portfolioUrl || '未填写'
            }}</span>
          </dd>
          <dt>城市</dt>
          <dd>{{ active.city || '未填写' }}</dd>
          <template v-if="tab === 'inquiries'"
            ><dt>预算 / 时间</dt>
            <dd>
              {{ active.budget || '未填写' }} /
              {{ active.preferredTime || '未填写' }}
            </dd></template
          >
        </dl>
        <h3>{{ tab === 'inquiries' ? '客户需求' : '合作资料' }}</h3>
        <p class="message-body">
          {{
            active.message || active.bio || active.experience || '未填写详情'
          }}
        </p>
        <el-divider />
        <el-form label-position="top" :disabled="!can('crm:write') || saving"
          ><template v-if="tab === 'inquiries'"
            ><div class="form-two-columns">
              <el-form-item label="跟进阶段"
                ><el-select v-model="form.status" class="full"
                  ><el-option
                    v-for="item in inquiryStatusOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value" /></el-select></el-form-item
              ><el-form-item label="优先级"
                ><el-select v-model="form.priority" class="full"
                  ><el-option
                    v-for="item in inquiryPriorityOptions"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value" /></el-select
              ></el-form-item>
            </div>
            <div class="form-two-columns">
              <el-form-item label="负责人"
                ><el-select v-model="form.assigneeId" clearable :disabled="!can('admin:write')"
                  ><el-option
                    v-for="person in assignees"
                    :key="person.id"
                    :label="person.displayName || person.username"
                    :value="person.id" /></el-select></el-form-item
              ><el-form-item label="下次跟进时间"
                ><el-date-picker
                  v-model="form.nextFollowUpAt"
                  type="datetime"
                  value-format="YYYY-MM-DDTHH:mm:ssZ"
                  placeholder="安排回访"
              /></el-form-item>
            </div>
            <el-form-item label="乐器序列号"
              ><el-input v-model="form.serialNumber" maxlength="100"
            /></el-form-item>
            <el-form-item label="本次跟进记录"
              ><el-input
                v-model="form.followUpNote"
                type="textarea"
                :rows="3"
                maxlength="4000"
                show-word-limit
                placeholder="每次保存追加到时间线"
            /></el-form-item>
            <el-form-item label="内部汇总备注"
              ><el-input
                v-model="form.internalNote"
                type="textarea"
                :rows="6"
                placeholder="记录沟通结果与下一步安排" /></el-form-item></template
          ><el-form-item v-else label="申请状态"
            ><el-select v-model="form.status" class="full"
              ><el-option
                v-for="(label, value) in artistStatuses"
                :key="value"
                :label="label"
                :value="value" /></el-select></el-form-item
        ></el-form>
        <section v-if="tab === 'inquiries'">
          <h3>跟进时间线</h3>
          <el-alert
            v-if="historyError"
            :title="historyError"
            type="error"
            :closable="false"
          /><el-timeline
            ><el-timeline-item
              v-for="item in history"
              :key="item.id"
              :timestamp="formatTime(item.createdAt)"
              >{{ item.operator }} · {{ inquiryStatusMeta(item.status).label }}
              <p class="message-body">{{ item.note }}</p></el-timeline-item
            ></el-timeline
          >
          <p v-if="!history.length" class="field-hint">暂无跟进记录</p>
        </section>
        <el-button
          v-if="
            tab === 'artistApps' &&
            active.status === 'approved' &&
            !active.artistId &&
            can('artists:write') &&
            can('crm:write')
          "
          :loading="saving"
          @click="convertArtist"
          >建立艺术家草稿</el-button
        >
        <p v-if="active.artistId" class="field-hint">
          已建立艺术家档案 #{{ active.artistId }}，请在艺术家栏目完善后发布。
        </p>
        <p v-if="!can('crm:write')" class="field-hint">
          当前账号为只读，无法修改跟进记录。
        </p>
        <el-alert
          v-if="saveError"
          :title="saveError"
          type="error"
          :closable="false"
          show-icon /></template
      ><template #footer
        ><el-button @click="closeDrawer(() => (drawer = false))">关闭</el-button
        ><el-button
          v-if="can('crm:write')"
          type="primary"
          :loading="saving"
          @click="save"
          >保存跟进</el-button
        ></template
      ></el-drawer
    >
  </section>
</template>
<script setup>
import { useUnsavedChanges } from '../lib/editorLifecycle'
import { onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Search } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  api,
  hasPermission as can,
  listData,
  paginationMeta,
  extractErrorMessage,
} from '../lib/api'
import { formatTime } from '../lib/format'
import {
  inquiryStatusOptions,
  inquiryStatusMeta,
  inquiryTypeOptions,
  inquiryTypeLabel,
  inquiryPriorityOptions,
} from '../lib/meta'
// 联系方式默认隐藏，逐条查看，每次查看由服务端写入操作记录
const contact = reactive({ value: null, loading: false, error: '' })
let contactRequest = 0
function resetContact() {
  contactRequest++
  Object.assign(contact, { value: null, loading: false, error: '' })
}
async function revealContact() {
  if (!active.value || contact.loading) return
  const request = ++contactRequest
  const resource = tab.value === 'inquiries' ? 'inquiries' : 'artist-applications'
  contact.loading = true
  contact.error = ''
  try {
    const { data } = await api.post(`/api/${resource}/${active.value.id}/contact`)
    if (request !== contactRequest) return
    contact.value =
      tab.value === 'inquiries'
        ? data.data.contactInfo
        : [data.data.email, data.data.phone].filter(Boolean).join(' / ')
  } catch (e) {
    if (request === contactRequest)
      contact.error = extractErrorMessage(e, '暂时无法查看，请重试')
  } finally {
    if (request === contactRequest) contact.loading = false
  }
}
const assignees = ref([]),
  history = ref([]),
  historyError = ref(''),
  appFilters = reactive({ keyword: '', status: 'all' })
let historyRequest = 0
async function loadHistory(id) {
  const request = ++historyRequest
  history.value = []
  historyError.value = ''
  try {
    const r = await api.get(`/api/inquiries/${id}/follow-ups`)
    if (request === historyRequest) history.value = r.data.data
  } catch (e) {
    if (request === historyRequest) historyError.value = extractErrorMessage(e)
  }
}
async function convertArtist() {
  if (saving.value) return
  saving.value = true
  try {
    await ElMessageBox.confirm(
      '将通过的申请建立为艺术家草稿？私人联系方式不会公开。',
      '建立档案',
    )
    const r = await api.post(
      `/api/artist-applications/${active.value.id}/create-artist`,
    )
    active.value.artistId = r.data.data.id
    ElMessage.success('艺术家草稿已建立')
    await load()
  } catch (e) {
    if (e !== 'cancel' && e !== 'close')
      saveError.value = extractErrorMessage(e)
  } finally {
    saving.value = false
  }
}
onMounted(async () => {
  try {
    assignees.value = (await api.get('/api/admin/crm/assignees')).data.data
  } catch {}
})
const route = useRoute(),
  tab = ref('inquiries'),
  rows = ref([]),
  page = ref(1),
  total = ref(0),
  loading = ref(false),
  error = ref(''),
  drawer = ref(false),
  active = ref(null),
  saving = ref(false),
  saveError = ref('')
const filters = reactive({ keyword: '', status: 'all', type: 'all' }),
  form = reactive({ status: 'new', priority: 'normal', internalNote: '' })
const artistStatuses = {
    pending: '待审阅',
    reviewed: '已跟进',
    approved: '已通过',
    rejected: '未通过',
  },
  artistStatus = (value) => artistStatuses[value] || value
let requestId = 0,
  savedForm = '',
  openedInquiry = ''
async function load() {
  const id = ++requestId
  loading.value = true
  error.value = ''
  try {
    const res = await api.get(
      tab.value === 'inquiries' ? '/api/inquiries' : '/api/artist-applications',
      {
        params: {
          ...(tab.value === 'inquiries' ? filters : appFilters),
          page: page.value,
          pageSize: 20,
        },
      },
    )
    if (id !== requestId) return
    rows.value = listData(res)
    total.value = paginationMeta(res).total
    if (page.value > 1 && !rows.value.length) {
      page.value--
      return load()
    }
    const selected = rows.value.find(
      (row) => String(row.id) === route.query.inquiry,
    )
    if (selected && openedInquiry !== String(selected.id)) {
      openedInquiry = String(selected.id)
      open(selected)
    }
  } catch (e) {
    if (id === requestId) {
      error.value = extractErrorMessage(e, '咨询加载失败')
      rows.value = []
      total.value = 0
    }
  } finally {
    if (id === requestId) loading.value = false
  }
}
function applyFilters() {
  page.value = 1
  load()
}
function resetFilters() {
  Object.assign(filters, { keyword: '', status: 'all', type: 'all' })
  applyFilters()
}
function changeTab(value) {
  tab.value = value
  page.value = 1
  load()
}
function open(row) {
  active.value = row
  resetContact()
  if (tab.value === 'inquiries') loadHistory(row.id)
  Object.assign(form, {
    status: row.status || (tab.value === 'inquiries' ? 'new' : 'pending'),
    priority: row.priority || 'normal',
    internalNote: row.internalNote || '',
    assigneeId: row.assigneeId || null,
    nextFollowUpAt: row.nextFollowUpAt || null,
    serialNumber: row.serialNumber || '',
    followUpNote: '',
  })
  savedForm = JSON.stringify(form)
  saveError.value = ''
  drawer.value = true
}
const { confirmLeave } = useUnsavedChanges({
  dirty: () =>
    drawer.value && can('crm:write') && JSON.stringify(form) !== savedForm,
  busy: () => saving.value,
})
async function closeDrawer(done) {
  if (!(await confirmLeave())) return
  resetContact()
  done()
}

async function save() {
  if (saving.value || !active.value || !can('crm:write')) return
  saving.value = true
  saveError.value = ''
  try {
    if (tab.value === 'inquiries')
      await api.put(`/api/inquiries/${active.value.id}`, {
        ...form,
        assigneeId: form.assigneeId || null,
        nextFollowUpAt: form.nextFollowUpAt || null,
        isRead: true,
      }, { headers: { 'If-Match': String(active.value.revision) } })
    else
      await api.put(`/api/artist-applications/${active.value.id}/status`, {
        status: form.status,
      })
    savedForm = JSON.stringify(form)
    drawer.value = false
    ElMessage.success('跟进已保存')
    await load()
  } catch (e) {
    saveError.value = extractErrorMessage(e, '保存失败，请重试')
  } finally {
    saving.value = false
  }
}
function readRoute() {
  tab.value = route.query.tab === 'artistApps' ? 'artistApps' : 'inquiries'
  filters.due = route.query.due === '1' ? '1' : ''
  const status = route.query.status
  filters.status = inquiryStatusOptions.some((item) => item.value === status)
    ? status
    : 'all'
  applyFilters()
}
watch(() => route.query, readRoute)
onMounted(readRoute)
</script>
