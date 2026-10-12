<template>
  <div class="panel content-panel">
    <div class="table-tools enterprise-table-tools">
      <span class="muted-text">合作艺术家与演奏者资料</span
      ><el-button
        v-if="hasPermission('artists:write')"
        type="primary"
        @click="openAddArtist"
        >新增艺术家</el-button
      >
    </div>

    <el-alert
      v-if="artistError"
      :title="artistError"
      description="请检查网络或后台 API 状态后重试。"
      type="error"
      show-icon
      :closable="false"
      class="mb-16"
    />

    <div
      class="mobile-admin-list artist-mobile-list"
      v-loading="artistsLoading"
    >
      <article
        v-for="row in artists"
        :key="row.id"
        class="mobile-admin-card artist-mobile-card"
      >
        <div class="mobile-list-media portrait">
          <el-image
            v-if="row.attributes.image || row.attributes.imageUrl"
            :src="
              mediaSrc(
                row.attributes.image?.data?.attributes?.url ||
                  row.attributes.imageUrl,
              )
            "
            fit="cover"
          />
          <span v-else>无图</span>
        </div>
        <div class="mobile-list-body">
          <strong>{{ row.attributes.name }}</strong>
          <small>{{ row.attributes.role || '未设置头衔' }}</small>
          <p>{{ row.attributes.bio || '暂无简介' }}</p>
          <div class="mobile-list-meta">
            <span>{{ row.attributes.equipment || '未设置设备' }}</span>
            <span>排序 {{ row.attributes.sortOrder || 0 }}</span>
          </div>
          <div class="mobile-list-actions">
            <el-button
              :icon="DocumentCopy"
              aria-label="预览"
              size="small"
              @click="openPreview('/artists')"
              class="dark-btn"
              >预览</el-button
            >
            <el-button
              v-if="hasPermission('artists:write')"
              :icon="Edit"
              aria-label="编辑"
              size="small"
              @click="openEditArtist(row)"
              class="dark-btn"
              >编辑</el-button
            >
            <el-button
              v-if="hasPermission('artists:write')"
              :icon="Delete"
              aria-label="删除"
              size="small"
              type="danger"
              @click="handleDelete(row.id)"
              >删除</el-button
            >
          </div>
        </div>
      </article>
      <div
        v-if="!artistsLoading && !artists.length"
        class="empty-panel compact-empty"
      >
        暂无艺术家内容
      </div>
    </div>

    <div class="table-tools">
      <el-input
        v-model="artistSearch"
        placeholder="搜索姓名、乐器或使用设备"
        clearable
        @keyup.enter="() => {
          artistPage = 1
          fetchArtists()
        }"
        @clear="() => {
          artistPage = 1
          fetchArtists()
        }"
      /><el-select
        v-model="artistStatus"
        aria-label="艺术家状态"
        @change="() => {
          artistPage = 1
          fetchArtists()
        }"
        ><el-option label="全部状态" value="all" /><el-option
          label="草稿"
          value="draft" /><el-option
          label="已发布"
          value="published" /><el-option
          label="隐藏"
          value="hidden" /></el-select
      ><el-button
        @click="() => {
          artistPage = 1
          fetchArtists()
        }"
        >搜索</el-button
      >
    </div>
    <el-table
      :data="artists"
      border
      class="wide-table mobile-hidden-table"
      v-loading="artistsLoading"
      empty-text="暂无艺术家内容"
    >
      <el-table-column label="照片" width="80" align="center">
        <template #default="{ row }"
          ><el-image
            :src="mediaSrc(row.attributes.image?.data?.attributes?.url)"
            v-if="row.attributes.image"
            class="t-img"
        /></template>
      </el-table-column>
      <el-table-column prop="attributes.name" label="艺术家姓名" width="150" />
      <el-table-column prop="attributes.role" label="头衔 / 乐器" width="150" />
      <el-table-column
        prop="attributes.bio"
        label="个人简介"
        min-width="260"
        show-overflow-tooltip
      />
      <el-table-column
        prop="attributes.equipment"
        label="使用设备"
        width="180"
        show-overflow-tooltip
      />
      <el-table-column
        prop="attributes.sortOrder"
        label="排序"
        width="70"
        align="center"
      />
      <el-table-column label="管理" fixed="right" width="180" align="center">
        <template #default="{ row }">
          <el-button-group>
            <el-button
              :icon="DocumentCopy"
              aria-label="预览"
              size="small"
              @click="openPreview('/artists')"
              class="dark-btn"
            />
            <el-button
              v-if="hasPermission('artists:write')"
              :icon="Edit"
              aria-label="编辑"
              size="small"
              @click="openEditArtist(row)"
              class="dark-btn"
            />
            <el-button
              v-if="hasPermission('artists:write')"
              :icon="Delete"
              aria-label="删除"
              size="small"
              type="danger"
              @click="handleDelete(row.id)"
            />
          </el-button-group>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-row">
      <span>共 {{ artistTotal }} 位艺术家</span
      ><el-pagination
        v-model:current-page="artistPage"
        :page-size="20"
        :total="artistTotal"
        layout="prev, pager, next"
        @current-change="fetchArtists"
      />
    </div>
    <el-dialog
      v-model="artistDiag"
      :title="isEdit ? '编辑艺术家' : '新增艺术家'"
      width="620px"
      class="dark-dialog"
      append-to-body
      destroy-on-close
      :before-close="closeArtist"
    >
      <el-form
        ref="artistFormRef"
        :disabled="saving || pendingUploads > 0"
        :model="artistForm"
        :rules="rules"
        label-width="90px"
      >
        <el-form-item label="艺术家照片"
          ><image-upload
            v-model="artistForm.imageUrl"
            width="150px"
            height="200px"
        /></el-form-item>
        <el-row :gutter="20">
          <el-col :span="12"
            ><el-form-item label="姓名/艺名" prop="name"
              ><el-input v-model="artistForm.name" /></el-form-item
          ></el-col>
          <el-col :span="12"
            ><el-form-item label="头衔/乐器" prop="role"
              ><el-input v-model="artistForm.role" /></el-form-item
          ></el-col>
        </el-row>
        <el-form-item label="个人简介"
          ><el-input
            v-model="artistForm.bio"
            type="textarea"
            :rows="4"
            maxlength="500"
            show-word-limit
            placeholder="输入艺术家的音乐经历、代表作品、合作案例等。"
        /></el-form-item>
        <el-form-item label="使用设备"
          ><el-input
            v-model="artistForm.equipment"
            placeholder="例如：胡氏管乐定制单簧管 / 萨克斯"
        /></el-form-item>
        <el-form-item label="发布状态"
          ><el-select v-model="artistForm.status"
            ><el-option label="草稿" value="draft" /><el-option
              label="已发布"
              value="published" /><el-option
              label="隐藏"
              value="hidden" /></el-select
        ></el-form-item>
        <el-form-item label="排序权重"
          ><el-input-number
            v-model="artistForm.sortOrder"
            :min="0"
            class="full"
        /></el-form-item>
        <ContentWorkflow
          v-if="isEdit"
          module="artist"
          :record-id="curId"
          :payload="artistForm"
          :preview-path="'/artists'"
          :busy="saving || pendingUploads > 0"
          @busy="workflowBusy = $event"
          @saved="originalArtist = JSON.stringify($event)"
          @loaded="Object.assign(artistForm, $event)"
          @published="handleWorkflowPublished"
        />
      </el-form>
      <template #footer>
        <el-button @click="closeArtist()">取消</el-button>
        <el-button class="dark-btn" @click="openPreview('/artists')"
          >前台预览</el-button
        >
        <el-button
          v-if="hasPermission('artists:write')"
          type="primary"
          :loading="saving"
          :disabled="pendingUploads > 0"
          @click="submitArtist"
          >确认保存</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
const handleWorkflowPublished = () => { artistDiag.value = false; fetchArtists() }
import ContentWorkflow from '../components/ContentWorkflow.vue'
const workflowBusy = ref(false)
import { useEditorUploads, useUnsavedChanges } from '../lib/editorLifecycle'
const uploads = useEditorUploads()
const pendingUploads = uploads.pending
const originalArtist = ref('')
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, DocumentCopy, Edit } from '@element-plus/icons-vue'
import ImageUpload from '../components/ImageUpload.vue'
import {
  api,
  hasPermission,
  extractErrorMessage,
  isRecordConflict,
  listData,
  paginationMeta,
  mediaSrc,
  openPreview,
} from '../lib/api'

const artistPage = ref(1),
  artistTotal = ref(0),
  artistSearch = ref(''),
  artistStatus = ref('all')
let artistRequestId = 0
const artists = ref([])
const artistsLoading = ref(false)
const artistError = ref('')
const artistDiag = ref(false)
const saving = ref(false)
const isEdit = ref(false)
const curId = ref(null)
// 打开时的记录版本；保存时用 If-Match 提交，记录已被他人改过则返回 409，表单保持不动
const curRevision = ref(null)
const artistFormRef = ref(null)
const artistForm = reactive({
  name: '',
  role: '',
  imageUrl: '',
  bio: '',
  equipment: '',
  sortOrder: 0,
  status: 'draft',
})

const rules = {
  name: [{ required: true, message: '请输入姓名或艺名', trigger: 'blur' }],
  role: [{ required: true, message: '请输入头衔或乐器', trigger: 'blur' }],
}

const fetchArtists = async () => {
  const request = ++artistRequestId
  artistsLoading.value = true
  artistError.value = ''
  try {
    const res = await api.get('/api/artists', {
      params: {
        admin: 1,
        page: artistPage.value,
        pageSize: 20,
        search: artistSearch.value,
        status: artistStatus.value,
      },
    })
    if (request !== artistRequestId) return
    artists.value = listData(res)
    artistTotal.value = paginationMeta(res).total
    const last = Math.max(1, Math.ceil(artistTotal.value / 20))
    if (artistPage.value > last) {
      artistPage.value = last
      return fetchArtists()
    }
  } catch (error) {
    if (request !== artistRequestId) return
    artistError.value = extractErrorMessage(error, '艺术家列表加载失败')
    artists.value = []
  } finally {
    if (request === artistRequestId) artistsLoading.value = false
  }
}

const openAddArtist = () => {
  if (!hasPermission('artists:write')) return
  isEdit.value = false
  curId.value = null
  curRevision.value = null
  Object.assign(artistForm, {
    name: '',
    role: '',
    bio: '',
    equipment: '',
    imageUrl: '',
    sortOrder: 0,
    status: 'draft',
  })
  originalArtist.value = JSON.stringify(artistForm)
  artistDiag.value = true
}

const openEditArtist = (row) => {
  if (!hasPermission('artists:write')) return
  isEdit.value = true
  curId.value = row.id
  curRevision.value = row.attributes?.revision ?? null
  Object.assign(artistForm, {
    name: row.attributes.name,
    role: row.attributes.role,
    bio: row.attributes.bio || '',
    equipment: row.attributes.equipment || '',
    sortOrder: row.attributes.sortOrder || 0,
    status: row.attributes.status || 'published',
    imageUrl: row.attributes.image?.data?.attributes?.url || '',
  })
  originalArtist.value = JSON.stringify(artistForm)
  artistDiag.value = true
}

const { confirmLeave } = useUnsavedChanges({
  dirty: () =>
    artistDiag.value && JSON.stringify(artistForm) !== originalArtist.value,
  busy: () => saving.value || workflowBusy.value || pendingUploads.value > 0,
})
async function closeArtist(done) {
  if (!(await confirmLeave())) return
  if (typeof done === 'function') done()
  else artistDiag.value = false
}
const submitArtist = async () => {
  if (
    !hasPermission('artists:write') ||
    saving.value ||
    workflowBusy.value ||
    pendingUploads.value
  )
    return
  saving.value = true
  try {
    await artistFormRef.value?.validate()
    await api[isEdit.value ? 'put' : 'post'](
      isEdit.value ? `/api/artists/${curId.value}` : '/api/artists',
      artistForm,
      isEdit.value
        ? { headers: { 'If-Match': String(curRevision.value ?? '') } }
        : {},
    )
    artistDiag.value = false
    ElMessage.success('艺术家内容已保存')
    fetchArtists()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close')
      ElMessage.error(extractErrorMessage(error, '请检查艺术家表单'))
    // 列表里的旧数据会让“重新打开”仍拿到旧版本；刷新列表，弹窗与输入保持不动
    if (isRecordConflict(error)) fetchArtists()
  } finally {
    saving.value = false
  }
}

const handleDelete = async (id) => {
  if (
    !hasPermission('artists:write') ||
    saving.value ||
    workflowBusy.value ||
    pendingUploads.value
  )
    return
  saving.value = true
  try {
    await ElMessageBox.confirm('将该艺术家移入回收站？可在设置的回收站中恢复。', '敏感操作确认', {
      type: 'warning',
    })
    await api.delete(`/api/artists/${id}`)
    ElMessage.success('已删除')
    fetchArtists()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close')
      ElMessage.error(extractErrorMessage(error, '艺术家删除失败'))
  } finally {
    saving.value = false
  }
}

const handlePageAction = (event) => {
  if (event.detail === 'artist:add') openAddArtist()
}

onMounted(() => {
  window.addEventListener('admin-page-action', handlePageAction)
  fetchArtists()
})

onBeforeUnmount(() =>
  window.removeEventListener('admin-page-action', handlePageAction),
)
</script>
