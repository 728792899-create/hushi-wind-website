<template>
  <section class="content-workflow" aria-label="发布工作流" v-if="recordId">
    <div>
      <strong>修改草稿与预览</strong><el-button text :disabled="locked" @click="load">重新获取最新草稿</el-button>
      <p class="field-hint">
        保存修改草稿不会更新官网。预览链接最长有效 15 分钟，内容变化后需重新预览。重新获取草稿后，点击“加载修改草稿”才会替换当前表单。
      </p>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <a
      v-if="previewUrl"
      :href="previewUrl"
      target="_blank"
      rel="noopener noreferrer"
      >打开预览页面 ↗</a
    >
    <p v-if="draft" class="field-hint">
      {{ draft.operator }} 保存于 {{ formatTime(draft.updatedAt) }}
    </p>
    <div class="filter-row wrap">
      <el-button :disabled="locked" @click="loadHistory()">历史版本</el-button>
      <el-button
        v-if="canWrite"
        :loading="action === 'save'"
        :disabled="locked"
        @click="saveDraft"
        >保存修改草稿</el-button
      >
      <el-button
        :loading="action === 'preview'"
        :disabled="locked"
        @click="preview"
        >预览已保存内容 ↗</el-button
      >
      <el-button
        v-if="draft && canWrite"
        :disabled="locked"
        @click="$emit('loaded', draft.payload)"
        >加载修改草稿</el-button
      >
      <el-button
        v-if="draft && canWrite"
        type="primary"
        :loading="action === 'publish'"
        :disabled="locked"
        @click="publish"
        >发布修改草稿</el-button
      >
      <el-button
        v-if="draft && canWrite"
        text
        type="danger"
        :disabled="locked"
        @click="discard"
        >放弃草稿</el-button
      >
    </div>
    <el-dialog
      v-model="historyOpen"
      title="历史版本"
      width="620px"
      append-to-body
      :close-on-click-modal="false"
      ><el-alert
        v-if="error"
        :title="error"
        type="error"
        :closable="false"
      /><el-table :data="history" v-loading="action === 'history'"
        ><el-table-column label="保存时间"
          ><template #default="{ row }">{{
            formatTime(row.createdAt)
          }}</template></el-table-column
        ><el-table-column prop="operator" label="操作人" /><el-table-column
          label="操作"
          ><template #default="{ row }"
            ><el-button
              v-if="canWrite"
              :disabled="locked"
              text
              @click="restore(row)"
              >恢复此版本</el-button
            ></template
          ></el-table-column
        ></el-table
      >
      <el-button v-if="historyHasMore" :disabled="locked" @click="loadHistory(true)">加载更早版本</el-button>
      <p v-if="!history.length" class="field-hint">暂无历史版本</p></el-dialog
    >
  </section>
</template>
<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api, SITE, extractErrorMessage } from '../lib/api'
import { formatTime } from '../lib/format'
const props = defineProps({
  module: { type: String, required: true },
  recordId: [Number, String],
  payload: Object,
  previewPath: { type: String, default: '/' },
  canWrite: { type: Boolean, default: true },
  busy: Boolean,
})
const emit = defineEmits(['loaded', 'published', 'saved', 'busy'])
const previewUrl = ref('')
const historyOpen = ref(false),
  history = ref([])
const initialLoading = ref(false)
const historyPage = ref(1), historyHasMore = ref(false)
const draft = ref(null),
  action = ref(''),
  error = ref('')
const locked = computed(
  () => props.busy || initialLoading.value || Boolean(action.value),
)
let requestId = 0
onBeforeUnmount(() => {
  requestId++
  emit('busy', false)
})
watch(action, (value) => emit('busy', Boolean(value)))
const endpoint = () =>
  `/api/admin/content-drafts/${props.module}/${props.recordId}`
async function load() {
  const request = ++requestId
  draft.value = null
  previewUrl.value = ''
  error.value = ''
  if (!props.recordId) return
  initialLoading.value = true
  try {
    const r = await api.get(endpoint())
    if (request === requestId) draft.value = r.data.data
  } catch (e) {
    if (request === requestId) error.value = extractErrorMessage(e)
  } finally {
    if (request === requestId) initialLoading.value = false
  }
}
watch(() => [props.module, props.recordId], load, { immediate: true })
async function run(name, task) {
  if (locked.value) return
  action.value = name
  error.value = ''
  try {
    await task()
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') error.value = extractErrorMessage(e)
  } finally {
    action.value = ''
  }
}
const versionHeaders = () => ({ 'If-Match': draft.value?.version || 'none' })
const saveDraft = () =>
  run('save', async () => {
    const payload = JSON.parse(JSON.stringify(props.payload))
    const r = await api.put(endpoint(), payload, {headers:versionHeaders()})
    draft.value = r.data.data
    emit('saved', payload)
    ElMessage.success('修改草稿已保存，官网保持原内容')
  })
const preview = () =>
  run('preview', async () => {
    const r = await api.post(
      `/api/admin/preview-ticket/${props.module}/${props.recordId}`, {}, {headers:versionHeaders()},
    )
    previewUrl.value = `${SITE}${props.previewPath}${props.previewPath.includes('?') ? '&' : '?'}previewToken=${encodeURIComponent(r.data.token)}`
    window.open(previewUrl.value, '_blank', 'noopener,noreferrer')
  })
const publish = () =>
  run('publish', async () => {
    await ElMessageBox.confirm(
      '将已保存的修改草稿发布到官网？请先预览核对。',
      '发布确认',
      { confirmButtonText: '确认发布', cancelButtonText: '继续核对' },
    )
    const r = await api.post(endpoint() + '/publish', {}, {headers:versionHeaders()})
    draft.value = null
    emit('published', r.data.data)
    ElMessage.success('已发布到官网')
  })
const discard = () =>
  run('discard', async () => {
    await ElMessageBox.confirm(
      '放弃服务器上的修改草稿？官网内容保持不变。',
      '放弃草稿',
      { confirmButtonText: '放弃草稿', cancelButtonText: '保留' },
    )
    await api.delete(endpoint(), {headers:versionHeaders()})
    draft.value = null
  })
const loadHistory = (append = false) =>
  run('history', async () => {
    historyOpen.value = true
    const nextPage = append ? historyPage.value + 1 : 1
    if (!append) { history.value = []; historyHasMore.value = false }
    const r = await api.get(
      `/api/admin/content-history/${props.module}/${props.recordId}`,
      { params: { page: nextPage, pageSize: 30 } },
    )
    history.value = append ? [...history.value, ...r.data.data] : r.data.data
    historyPage.value = nextPage
    historyHasMore.value = nextPage < (r.data.meta?.pagination?.pageCount || 1)
  })
const restore = (row) =>
  run('restore', async () => {
    await ElMessageBox.confirm(
      '恢复此版本？当前内容会先保存为历史版本。',
      '恢复确认',
    )
    const r = await api.post(
      `/api/admin/content-history/${props.module}/${props.recordId}/${row.id}/restore`,
    )
    historyOpen.value = false
    emit('published', r.data.data)
    ElMessage.success('已恢复历史版本')
  })
defineExpose({ saveDraft })
</script>
