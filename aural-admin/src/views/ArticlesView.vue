<template>
  <div class="panel content-panel">
    <div class="table-tools enterprise-table-tools">
      <div class="filter-row wrap">
        <el-input
          v-model="articleSearch"
          placeholder="搜索新闻标题、分类或摘要"
          :prefix-icon="Search"
          class="w-320"
          clearable
          @input="handleArticleSearchInput"
        />
        <el-select
          v-model="articleStatusFilter"
          placeholder="发布状态"
          class="w-150"
          @change="handleArticleFilterChange"
        >
          <el-option label="全部状态" value="all" />
          <el-option
            v-for="item in publishStatusOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
        <el-button v-if="activeArticleFilters" plain @click="showArticleAll"
          >返回全部</el-button
        >
      </div>
      <el-button
        v-if="hasPermission('articles:write')"
        type="primary"
        class="light-btn"
        @click="openAddArticle"
        >新增新闻</el-button
      >
    </div>

    <el-alert
      v-if="articleError"
      :title="articleError"
      description="请检查网络或后台 API 状态后重试。"
      type="error"
      show-icon
      :closable="false"
      class="mb-16"
    />

    <div
      class="mobile-admin-list article-mobile-list"
      v-loading="articleLoading"
    >
      <article
        v-for="row in articles"
        :key="row.id"
        class="mobile-admin-card article-mobile-card"
      >
        <div class="mobile-list-media">
          <el-image
            :src="mediaSrc(row.attributes.image?.data?.attributes?.url)"
            v-if="row.attributes.image"
            fit="cover"
          />
          <span v-else>无图</span>
        </div>
        <div class="mobile-list-body">
          <div class="mobile-list-tags">
            <el-tag
              size="small"
              :type="publishStatusMeta(row.attributes.status).type"
              effect="light"
              >{{ publishStatusMeta(row.attributes.status).label }}</el-tag
            >
            <el-tag size="small" effect="light">{{
              row.attributes.category || 'News'
            }}</el-tag>
          </div>
          <strong>{{ row.attributes.title }}</strong>
          <small>{{ row.attributes.date }}</small>
          <p>{{ row.attributes.description || '暂无摘要' }}</p>
          <div class="mobile-list-meta">
            <span>{{ row.attributes.slug || `ID ${row.id}` }}</span>
          </div>
          <div class="mobile-list-actions">
            <el-button
              :disabled="
                !['published', 'active'].includes(row.attributes.status)
              "
              :icon="DocumentCopy"
              size="small"
              @click="openPreview(articlePreviewPath(row))"
              class="dark-btn"
              >预览</el-button
            >
            <el-button
              v-if="hasPermission('articles:write')"
              :icon="Edit"
              size="small"
              @click="openEditArticle(row)"
              class="dark-btn"
              >编辑</el-button
            >
            <el-button
              :icon="Clock"
              size="small"
              @click="openArticleVersionDrawer(row)"
              >版本</el-button
            >
            <el-button
              v-if="hasPermission('articles:write')"
              :icon="Delete"
              size="small"
              type="danger"
              @click="handleDelete(row.id)"
              >删除</el-button
            >
          </div>
        </div>
      </article>
      <div
        v-if="!articleLoading && !articles.length"
        class="empty-panel compact-empty"
      >
        暂无新闻内容
      </div>
    </div>

    <el-table
      :data="articles"
      border
      class="wide-table mobile-hidden-table"
      v-loading="articleLoading"
      empty-text="暂无新闻内容"
    >
      <el-table-column label="封面" width="90" align="center">
        <template #default="{ row }"
          ><el-image
            :src="mediaSrc(row.attributes.image?.data?.attributes?.url)"
            v-if="row.attributes.image"
            class="t-img"
        /></template>
      </el-table-column>
      <el-table-column
        prop="attributes.title"
        label="新闻标题"
        min-width="220"
      />
      <el-table-column prop="attributes.category" label="分类" width="140" />
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }"
          ><el-tag
            :type="publishStatusMeta(row.attributes.status).type"
            effect="light"
            >{{ publishStatusMeta(row.attributes.status).label }}</el-tag
          ></template
        >
      </el-table-column>
      <el-table-column prop="attributes.date" label="发布日期" width="140" />
      <el-table-column label="管理" fixed="right" width="210" align="center">
        <template #default="{ row }">
          <div class="row-action-group">
            <el-button
              :disabled="
                !['published', 'active'].includes(row.attributes.status)
              "
              :icon="DocumentCopy"
              size="small"
              title="预览前台新闻页"
              aria-label="预览前台新闻页"
              @click="openPreview(articlePreviewPath(row))"
              class="dark-btn"
              >预览</el-button
            >
            <el-button
              v-if="hasPermission('articles:write')"
              :icon="Edit"
              size="small"
              title="编辑新闻内容"
              aria-label="编辑新闻内容"
              @click="openEditArticle(row)"
              class="dark-btn"
              >编辑</el-button
            >
            <el-dropdown trigger="click">
              <el-button
                size="small"
                title="更多新闻操作"
                aria-label="更多新闻操作"
                >更多</el-button
              >
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="openArticleVersionDrawer(row)"
                    >查看版本历史</el-dropdown-item
                  >
                  <el-dropdown-item
                    v-if="hasPermission('articles:write')"
                    class="danger-dropdown-item"
                    @click="handleDelete(row.id)"
                    >删除新闻</el-dropdown-item
                  >
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <div class="table-pagination">
      <span class="pagination-total">共 {{ articleTotal }} 条新闻</span>
      <el-pagination
        v-model:current-page="articlePage"
        v-model:page-size="articlePageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="articleTotal"
        layout="sizes, prev, pager, next"
        background
        @size-change="handleArticlePageSizeChange"
        @current-change="handleArticlePageChange"
      />
    </div>

    <el-dialog
      v-model="aDiag"
      :title="isEdit ? '编辑新闻' : '发布新闻'"
      width="760px"
      class="dark-dialog"
      append-to-body
      destroy-on-close
      :before-close="requestCloseArticleDialog"
    >
      <el-form
        ref="articleFormRef"
        :disabled="saving || pendingUploads > 0"
        :model="aForm"
        :rules="articleRules"
        label-width="90px"
      >
        <section class="form-section is-emphasis">
          <div class="form-section-title">
            <strong>基础信息</strong>
            <span
              >标题、栏目和日期会直接出现在新闻列表、详情页和搜索结果中。</span
            >
          </div>
          <el-form-item label="新闻标题" prop="title"
            ><el-input v-model="aForm.title"
          /></el-form-item>
          <el-row :gutter="20">
            <el-col :span="12"
              ><el-form-item label="栏目分类" prop="category"
                ><el-input v-model="aForm.category" /></el-form-item
            ></el-col>
            <el-col :span="12"
              ><el-form-item label="发布日期" prop="date"
                ><el-date-picker
                  v-model="aForm.date"
                  value-format="YYYY-MM-DD"
                  type="date"
                  class="full" /></el-form-item
            ></el-col>
          </el-row>
        </section>

        <section class="form-section">
          <div class="form-section-title">
            <strong>封面与正文</strong>
            <span
              >封面建议使用真实活动或产品图片，摘要控制在适合列表阅读的长度。</span
            >
          </div>
          <el-form-item label="新闻封面"
            ><image-upload
              v-model="aForm.imageUrl"
              width="220px"
              height="120px"
          /></el-form-item>
          <el-form-item label="正文详情">
            <div class="article-editor-field">
              <el-input
                v-model="aForm.description"
                type="textarea"
                :rows="7"
                placeholder="可填写正文段落；也可以使用下方格式助手插入小标题、引用、图片或视频。"
              />
              <div class="article-format-helper">
                <div>
                  <strong>正文格式助手</strong>
                  <span>每种格式单独成行，保存后会在新闻详情页自动排版。</span>
                </div>
                <div class="article-format-actions">
                  <el-button
                    size="small"
                    @click="appendArticleSnippet('heading')"
                    >插入小标题</el-button
                  >
                  <el-button size="small" @click="appendArticleSnippet('quote')"
                    >插入引用</el-button
                  >
                  <el-upload
                    :http-request="uploadRequest"
                    :action="`${BASE}/api/upload`"
                    :headers="adminUploadHeaders()"
                    :accept="IMAGE_ACCEPT"
                    :show-file-list="false"
                    :before-upload="
                      (file) => beforeArticleBodyUpload(file, 'image')
                    "
                    :on-success="
                      (res, file) =>
                        uploads.complete(file, () =>
                          handleArticleBodyImageSuccess(res, file),
                        )
                    "
                    :on-error="
                      (error, file) =>
                        uploads.complete(file, () =>
                          handleArticleBodyUploadError(error),
                        )
                    "
                  >
                    <el-button size="small" type="primary" plain
                      >上传图片插入</el-button
                    >
                  </el-upload>
                  <el-upload
                    :http-request="uploadRequest"
                    :action="`${BASE}/api/upload`"
                    :headers="adminUploadHeaders()"
                    :accept="VIDEO_ACCEPT"
                    :show-file-list="false"
                    :before-upload="
                      (file) => beforeArticleBodyUpload(file, 'video')
                    "
                    :on-success="
                      (res, file) =>
                        uploads.complete(file, () =>
                          handleArticleBodyVideoSuccess(res, file),
                        )
                    "
                    :on-error="
                      (error, file) =>
                        uploads.complete(file, () =>
                          handleArticleBodyUploadError(error),
                        )
                    "
                  >
                    <el-button size="small" type="primary" plain
                      >上传视频插入</el-button
                    >
                  </el-upload>
                </div>
                <p>
                  图片和视频会先上传到资源库，再自动插入正文；也可以手动填写：![图片说明](/uploads/example.jpg
                  "图片说明")。
                </p>
              </div>
            </div>
          </el-form-item>
        </section>

        <section class="form-section">
          <div class="form-section-title">
            <strong>发布与预览</strong>
            <span>草稿仅保存在后台；已发布内容保存后直接更新官网。</span>
          </div>
          <el-form-item label="发布状态"
            ><el-select v-model="aForm.status" class="full"
              ><el-option
                v-for="item in publishStatusOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value" /></el-select
          ></el-form-item>
          <el-form-item label="发布预览">
            <div class="seo-preview">
              <strong>{{
                aForm.seoTitle || `${aForm.title || '新闻标题'} | 胡氏管乐`
              }}</strong>
              <span
                >{{ aForm.category || 'News' }} /
                {{ aForm.date || '发布日期' }}</span
              >
              <p>
                {{
                  aForm.seoDescription ||
                  aForm.description ||
                  '新闻摘要会显示在资讯中心和搜索结果中。'
                }}
              </p>
            </div>
          </el-form-item>
        </section>

        <details class="form-disclosure">
          <summary>搜索与分享设置（选填）</summary>
          <section class="form-section">
            <el-form-item label="SEO 标题"
              ><el-input
                v-model="aForm.seoTitle"
                maxlength="80"
                show-word-limit
                placeholder="例如：胡氏管乐 Care+ 服务体系正式上线 | 胡氏管乐"
            /></el-form-item>
            <el-form-item label="SEO 描述"
              ><el-input
                v-model="aForm.seoDescription"
                type="textarea"
                :rows="3"
                maxlength="160"
                show-word-limit
                placeholder="建议 60-120 字，概括这篇新闻最重要的信息。"
            /></el-form-item>
            <el-form-item label="关键词"
              ><el-input
                v-model="aForm.seoKeywords"
                placeholder="用英文逗号分隔，例如：管乐,售后服务,胡氏管乐"
            /></el-form-item>
            <el-form-item label="分享图"
              ><image-upload
                v-model="aForm.ogImageUrl"
                width="220px"
                height="120px"
            /></el-form-item>
            <p class="field-hint">
              分享图未填写时，会自动使用新闻封面。保存并发布后，可查看官网上的实际展示效果。
            </p>
          </section>
        </details>
        <ContentWorkflow
          v-if="isEdit"
          module="article"
          :record-id="curId"
          :payload="articlePayload()"
          :preview-path="articlePreviewPath()"
          :busy="saving || pendingUploads > 0"
          @busy="workflowBusy = $event"
          @saved="originalArticlePayload = $event"
          @loaded="Object.assign(aForm, $event)"
          @published="handleWorkflowPublished"
        />
      </el-form>
      <template #footer>
        <p v-if="pendingUploads" class="upload-status" role="status">
          素材上传中，请完成后保存（{{ pendingUploads }}）
        </p>
        <div class="dialog-footer-actions">
          <span class="dialog-footer-hint">{{ articleChangeHint }}</span>
          <div class="dialog-footer-buttons">
            <el-button @click="requestCloseArticleDialog()">取消</el-button>
            <el-button
              class="dark-btn"
              :disabled="
                !isEdit || originalArticlePayload?.status !== 'published'
              "
              @click="previewArticleForm"
              >查看已发布页面</el-button
            >
            <el-button
              v-if="hasPermission('articles:write')"
              type="primary"
              :loading="saving"
              :disabled="pendingUploads > 0"
              @click="submitArticle()"
              >保存新闻</el-button
            >
          </div>
        </div>
      </template>
    </el-dialog>

    <el-drawer
      v-model="articleVersionDrawerOpen"
      title="新闻版本历史"
      size="620px"
      class="dark-drawer"
      append-to-body
    >
      <template v-if="activeVersionArticle">
        <div class="version-current">
          <strong>{{
            activeVersionArticle.attributes?.title || '未命名新闻'
          }}</strong>
          <span
            >/news/{{
              activeVersionArticle.attributes?.slug || activeVersionArticle.id
            }}</span
          >
        </div>

        <el-alert
          title="回滚会把当前新闻恢复到所选历史快照，并自动保存当前内容作为可恢复记录。"
          type="warning"
          :closable="false"
          show-icon
          class="mb-16"
        />

        <div v-if="articleVersionsLoading" class="empty-panel compact-empty">
          版本记录加载中...
        </div>
        <div
          v-else-if="articleVersions.length === 0"
          class="empty-panel compact-empty"
        >
          暂无历史版本。新闻创建或编辑后会自动生成版本记录。
        </div>
        <div v-else class="version-list">
          <article
            v-for="version in articleVersions"
            :key="version.id"
            class="version-item"
          >
            <div class="version-item-main">
              <strong>{{
                version.title ||
                activeVersionArticle.attributes?.title ||
                '历史版本'
              }}</strong>
              <span
                >{{ formatTime(version.createdAt) }} /
                {{ version.operator || '系统' }}</span
              >
              <small>{{ articleVersionSummary(version) }}</small>
            </div>
            <el-button
              v-if="hasPermission('articles:write')"
              type="warning"
              plain
              :loading="restoringArticleVersionId === version.id"
              @click="restoreArticleVersion(version)"
              >回滚</el-button
            >
          </article>
        </div>
        <el-button v-if="historyHasMore" :disabled="articleVersionsLoading" @click="openArticleVersionDrawer(activeVersionArticle, true)">加载更早版本</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
const handleWorkflowPublished = () => { aDiag.value = false; fetchArticles() }
import { uploadRequest } from '../lib/uploadRequest'
import ContentWorkflow from '../components/ContentWorkflow.vue'
const workflowBusy = ref(false)
import { useEditorUploads, useUnsavedChanges } from '../lib/editorLifecycle'
const uploads = useEditorUploads()
const pendingUploads = uploads.pending
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Clock,
  Delete,
  DocumentCopy,
  Edit,
  Search,
} from '@element-plus/icons-vue'
import ImageUpload from '../components/ImageUpload.vue'
import {
  BASE,
  hasPermission,
  adminUploadHeaders,
  api,
  extractErrorMessage,
  isRecordConflict,
  listData,
  mediaSrc,
  openPreview,
  paginationMeta,
} from '../lib/api'
import { publishStatusMeta, publishStatusOptions } from '../lib/meta'
import { formatTime, qualityResult } from '../lib/format'
import { changedFieldLabels, changedFieldSentence } from '../lib/changeSummary'
import {
  IMAGE_ACCEPT,
  VIDEO_ACCEPT,
  validateUploadFile,
} from '../lib/uploadPolicy'

const articles = ref([])
const articleSearch = ref('')
const articleStatusFilter = ref('all')
const articleLoading = ref(false)
const articleError = ref('')
const articlePage = ref(1)
const articlePageSize = ref(20)
const articleTotal = ref(0)
const aDiag = ref(false)
const saving = ref(false)
const isEdit = ref(false)
const curId = ref(null)
// 打开时的记录版本；保存时用 If-Match 提交，记录已被他人改过则返回 409，表单保持不动
const curRevision = ref(null)
const articleFormRef = ref(null)
const emptyArticleForm = () => ({
  title: '',
  category: 'Event',
  date: '',
  description: '',
  imageUrl: '',
  status: 'draft',
  seoTitle: '',
  seoDescription: '',
  seoKeywords: '',
  ogImageUrl: '',
})
const aForm = reactive(emptyArticleForm())
const articleVersionDrawerOpen = ref(false)
const articleVersionsLoading = ref(false)
const restoringArticleVersionId = ref(null)
const activeVersionArticle = ref(null)
const articleVersions = ref([])
const historyPage = ref(1), historyHasMore = ref(false)
const articleStateKey = 'hushi-admin-articles-state'
const originalArticlePayload = ref(null)
let articleSearchTimer = null

const articleRules = {
  title: [{ required: true, message: '请输入新闻标题', trigger: 'blur' }],
  category: [{ required: true, message: '请输入栏目分类', trigger: 'blur' }],
  date: [{ required: true, message: '请选择发布日期', trigger: 'change' }],
  description: [],
}

const activeArticleFilters = computed(
  () =>
    Boolean(articleSearch.value.trim()) || articleStatusFilter.value !== 'all',
)

const articleChangeLabels = {
  title: '新闻标题',
  category: '栏目分类',
  date: '发布日期',
  description: '正文详情',
  imageUrl: '新闻封面',
  seoTitle: 'SEO 标题',
  seoDescription: 'SEO 描述',
  seoKeywords: 'SEO 关键词',
  ogImageUrl: '分享图',
  status: '发布状态',
}

const articlePayload = () => ({ ...aForm })

const articleChangeHint = computed(() =>
  changedFieldSentence(
    originalArticlePayload.value,
    articlePayload(),
    articleChangeLabels,
    isEdit.value
      ? '当前没有未保存修改。'
      : '新新闻可先保存草稿，确认后再发布。',
  ),
)

const articlePreviewPath = (row) => `/news/${row?.id || curId.value || ''}`

const articleSnippets = {
  heading: '## 小标题',
  quote: '> 这里填写需要强调的引用内容。',
}

const appendArticleSnippet = (type) => {
  const snippet = articleSnippets[type]
  if (!snippet) return
  const current = String(aForm.description || '').trimEnd()
  aForm.description = current ? `${current}\n\n${snippet}` : snippet
}

const uploadCaptionFromFile = (file) => {
  const name = String(file?.name || '').trim()
  if (!name) return '新闻素材'
  return (
    name
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim() || '新闻素材'
  )
}

const appendArticleBodyMedia = (kind, url, caption) => {
  if (!url) return
  const safeCaption = caption || (kind === 'video' ? '视频说明' : '图片说明')
  const snippet =
    kind === 'video'
      ? `@[video](${url} "${safeCaption}")`
      : `![${safeCaption}](${url} "${safeCaption}")`
  const current = String(aForm.description || '').trimEnd()
  aForm.description = current ? `${current}\n\n${snippet}` : snippet
}

const beforeArticleBodyUpload = (file, kind) => {
  const result = validateUploadFile(file, { kind })
  if (!result.ok) ElMessage.warning(result.message)
  return result.ok && uploads.begin(file)
}

const handleArticleBodyImageSuccess = (res, file) => {
  appendArticleBodyMedia('image', res?.url, uploadCaptionFromFile(file))
  ElMessage.success('图片已上传并插入正文')
}

const handleArticleBodyVideoSuccess = (res, file) => {
  appendArticleBodyMedia('video', res?.url, uploadCaptionFromFile(file))
  ElMessage.success('视频已上传并插入正文')
}

const handleArticleBodyUploadError = (error) => {
  let parsed = null
  try {
    parsed = JSON.parse(error?.message || '{}')
  } catch {}
  ElMessage.error(
    parsed?.error?.message || extractErrorMessage(error, '素材上传失败'),
  )
}

let listRequestId = 0
const fetchArticles = async () => {
  const request = ++listRequestId
  articleLoading.value = true
  articleError.value = ''
  saveArticleState()
  try {
    const res = await api.get('/api/articles', {
      params: {
        admin: 1,
        search: articleSearch.value,
        status: articleStatusFilter.value,
        page: articlePage.value,
        pageSize: articlePageSize.value,
      },
    })
    if (request !== listRequestId) return
    articles.value = listData(res)
    articleTotal.value = paginationMeta(res).total || articles.value.length
    const lastPage = Math.max(
      1,
      Math.ceil(articleTotal.value / articlePageSize.value),
    )
    if (articlePage.value > lastPage) {
      articlePage.value = lastPage
      return fetchArticles()
    }
  } catch (error) {
    if (request !== listRequestId) return
    articleError.value = extractErrorMessage(error, '新闻列表加载失败')
    articles.value = []
    articleTotal.value = 0
  } finally {
    if (request === listRequestId) articleLoading.value = false
  }
}

const saveArticleState = () => {
  try {
    window.localStorage.setItem(
      articleStateKey,
      JSON.stringify({
        search: articleSearch.value,
        status: articleStatusFilter.value,
        page: articlePage.value,
        pageSize: articlePageSize.value,
      }),
    )
  } catch {}
}

const restoreArticleState = () => {
  try {
    const state = JSON.parse(
      window.localStorage.getItem(articleStateKey) || '{}',
    )
    if (typeof state.search === 'string') articleSearch.value = state.search
    if (typeof state.status === 'string')
      articleStatusFilter.value = state.status
    if (Number.isFinite(Number(state.page)))
      articlePage.value = Number(state.page)
    if (Number.isFinite(Number(state.pageSize)))
      articlePageSize.value = Number(state.pageSize)
  } catch {}
}

const handleArticleSearchInput = () => {
  articlePage.value = 1
  window.clearTimeout(articleSearchTimer)
  articleSearchTimer = window.setTimeout(fetchArticles, 260)
}

const handleArticleFilterChange = () => {
  articlePage.value = 1
  fetchArticles()
}

const showArticleAll = () => {
  articleSearch.value = ''
  articleStatusFilter.value = 'all'
  articlePage.value = 1
  window.clearTimeout(articleSearchTimer)
  fetchArticles()
}

const handleArticlePageChange = () => {
  fetchArticles()
}

const handleArticlePageSizeChange = () => {
  articlePage.value = 1
  fetchArticles()
}

const openAddArticle = () => {
  if (!hasPermission('articles:write')) return
  isEdit.value = false
  curId.value = null
  curRevision.value = null
  Object.assign(aForm, {
    ...emptyArticleForm(),
    date: new Date().toISOString().split('T')[0],
  })
  originalArticlePayload.value = articlePayload()
  aDiag.value = true
}

const openEditArticle = (row) => {
  if (!hasPermission('articles:write')) return
  isEdit.value = true
  curId.value = row.id
  curRevision.value = row.attributes?.revision ?? null
  Object.assign(aForm, {
    ...emptyArticleForm(),
    ...row.attributes,
    imageUrl:
      row.attributes.image?.data?.attributes?.url ||
      row.attributes.imageUrl ||
      '',
    ogImageUrl: row.attributes.ogImageUrl || '',
  })
  originalArticlePayload.value = articlePayload()
  aDiag.value = true
}

const previewArticleForm = () => {
  if (isEdit.value && curId.value) openPreview(articlePreviewPath())
  else openPreview('/news')
}

const { confirmLeave } = useUnsavedChanges({
  dirty: () =>
    aDiag.value &&
    changedFieldLabels(
      originalArticlePayload.value,
      articlePayload(),
      articleChangeLabels,
    ).length > 0,
  busy: () => saving.value || workflowBusy.value || pendingUploads.value > 0,
})
const requestCloseArticleDialog = async (done) => {
  if (!(await confirmLeave())) return
  if (typeof done === 'function') done()
  else aDiag.value = false
}

const parseArticleVersionSnapshot = (version) => {
  try {
    return JSON.parse(version.snapshot || '{}')
  } catch {
    return {}
  }
}

const articleVersionSummary = (version) => {
  const snapshot = parseArticleVersionSnapshot(version)
  const parts = [
    snapshot.status ? `状态：${publishStatusMeta(snapshot.status).label}` : '',
    snapshot.category ? `分类：${snapshot.category}` : '',
    snapshot.date ? `日期：${snapshot.date}` : '',
    snapshot.description
      ? `摘要：${String(snapshot.description).slice(0, 42)}`
      : '',
  ].filter(Boolean)
  return parts.join(' / ') || '历史快照'
}

let versionRequestId = 0
watch(articleVersionDrawerOpen, (open) => {
  if (!open) { versionRequestId++; articleVersionsLoading.value = false }
})
const openArticleVersionDrawer = async (row, append = false) => {
  if (articleVersionsLoading.value) return
  const nextPage = append ? historyPage.value + 1 : 1
  if (!append) historyHasMore.value = false
  const request = ++versionRequestId
  activeVersionArticle.value = row
  articleVersionDrawerOpen.value = true
  if (!append) articleVersions.value = []
  articleVersionsLoading.value = true
  try {
    const res = await api.get(`/api/articles/${row.id}/versions`, { params: { page: nextPage, pageSize: 30 } })
    if (request !== versionRequestId) return
    articleVersions.value = append ? [...articleVersions.value, ...listData(res)] : listData(res)
    historyPage.value = nextPage
    historyHasMore.value = nextPage < (res.data.meta?.pagination?.pageCount || 1)
  } catch (error) {
    if (request !== versionRequestId) return
    ElMessage.error(extractErrorMessage(error, '新闻版本记录加载失败'))
  } finally {
    if (request === versionRequestId) articleVersionsLoading.value = false
  }
}

const restoreArticleVersion = async (version) => {
  if (!hasPermission('articles:write')) return
  if (!activeVersionArticle.value) return
  try {
    await ElMessageBox.confirm(
      `确定将“${activeVersionArticle.value.attributes?.title || '该新闻'}”恢复到 ${formatTime(version.createdAt)} 的版本？当前内容会先保存为新的历史版本。`,
      '新闻版本回滚确认',
      {
        type: 'warning',
        confirmButtonText: '确认回滚',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }
  restoringArticleVersionId.value = version.id
  try {
    await api.post(
      `/api/articles/${activeVersionArticle.value.id}/restore/${version.id}`,
    )
    ElMessage.success('新闻已恢复到所选版本')
    articleVersionDrawerOpen.value = false
    await fetchArticles()
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, '新闻版本回滚失败'))
  } finally {
    restoringArticleVersionId.value = null
  }
}

const submitArticle = async (targetStatus = '') => {
  if (!hasPermission('articles:write')) return
  if (saving.value) return
  if (pendingUploads.value)
    return ElMessage.info('请等待素材上传完成后再保存。')
  saving.value = true
  const previousStatus = aForm.status
  try {
    await articleFormRef.value?.validate()
    if (targetStatus) aForm.status = targetStatus
    const payload = articlePayload()
    const changedFields = changedFieldLabels(
      originalArticlePayload.value,
      payload,
      articleChangeLabels,
    )

    if (targetStatus === 'published') {
      await ElMessageBox.confirm(
        '确认发布这篇新闻？发布后将进入前台新闻列表。',
        '发布前确认',
        {
          type: 'info',
        },
      )
    }
    const res = await api[isEdit.value ? 'put' : 'post'](
      isEdit.value ? `/api/articles/${curId.value}` : '/api/articles',
      payload,
      isEdit.value
        ? { headers: { 'If-Match': String(curRevision.value ?? '') } }
        : {},
    )
    const savedArticle = res.data || {}
    aDiag.value = false
    ElMessage.success(
      targetStatus === 'draft'
        ? '新闻草稿已保存'
        : targetStatus === 'hidden'
          ? '新闻已隐藏'
          : targetStatus === 'published'
            ? '新闻已发布'
            : '新闻已保存',
    )
    await fetchArticles()
  } catch (error) {
    if ((error === 'cancel' || error === 'close') && targetStatus)
      aForm.status = previousStatus
    if (error !== 'cancel' && error !== 'close')
      ElMessage.error(extractErrorMessage(error, '请检查新闻表单'))
    // 列表里的旧数据会让“重新打开”仍拿到旧版本；刷新列表，弹窗与输入保持不动
    if (isRecordConflict(error)) fetchArticles()
  } finally {
    saving.value = false
  }
}

const handleDelete = async (id) => {
  if (!hasPermission('articles:write') || saving.value) return
  saving.value = true
  try {
    await ElMessageBox.confirm(
      '将这篇新闻移入回收站？官网将不再展示，可在设置的回收站中恢复。',
      '敏感操作确认',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
      },
    )
    await api.delete(`/api/articles/${id}`)
    ElMessage.success('已删除')
    fetchArticles()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close')
      ElMessage.error(extractErrorMessage(error, '删除失败，请重试'))
  } finally {
    saving.value = false
  }
}

const handlePageAction = (event) => {
  if (event.detail === 'article:add') openAddArticle()
}

onMounted(() => {
  window.addEventListener('admin-page-action', handlePageAction)
  restoreArticleState()
  fetchArticles()
})

onBeforeUnmount(() => {
  window.removeEventListener('admin-page-action', handlePageAction)
  window.clearTimeout(articleSearchTimer)
})
</script>
