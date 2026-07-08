<template>
  <div>
    <section class="business-command-panel articles-command-panel">
      <div class="business-command-main">
        <span class="business-kicker">内容运营</span>
        <h2>把新闻发布变成可检查、可预览、可回滚的流程</h2>
        <p>这里维护官网新闻资讯。发布前先看封面、正文、SEO 和前台预览，避免空封面、短正文或误发布。</p>
        <div class="business-command-actions">
          <el-button type="primary" color="#fff" class="light-btn" @click="openAddArticle">发布新闻</el-button>
          <el-button v-if="articleStatusFilter === 'draft'" color="#222" class="dark-btn" @click="showArticleAll">返回全部新闻</el-button>
          <el-button v-else color="#222" class="dark-btn" @click="articleStatusFilter = 'draft'; handleArticleFilterChange()">查看草稿</el-button>
        </div>
      </div>
      <div class="business-task-grid">
        <article v-for="item in articleOpsCards" :key="item.label" class="business-task-card" :class="item.tone">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
          <small>{{ item.desc }}</small>
        </article>
      </div>
    </section>

    <div class="table-tools enterprise-table-tools">
      <div class="filter-row wrap">
        <el-input v-model="articleSearch" placeholder="搜索新闻标题、分类或摘要" :prefix-icon="Search" class="w-320" clearable @input="handleArticleSearchInput" />
        <el-select v-model="articleStatusFilter" placeholder="发布状态" class="w-150" @change="handleArticleFilterChange">
          <el-option label="全部状态" value="all" />
          <el-option v-for="item in publishStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-button v-if="activeArticleFilters" plain @click="showArticleAll">返回全部</el-button>
      </div>
      <el-button type="primary" color="#fff" class="light-btn" @click="openAddArticle">+ 发布新闻</el-button>
    </div>

    <section class="data-quality-panel article-quality-panel">
      <div class="data-quality-heading">
        <span class="business-kicker">发布前数据体检</span>
        <h3>{{ articleQualityIssues.length ? `发现 ${articleQualityIssues.length} 条新闻需要复核` : '当前筛选范围暂无待复核新闻' }}</h3>
        <p>{{ activeArticleFilters && !articles.length ? '当前筛选条件下没有新闻；可点击“返回全部”查看完整新闻列表。' : '这些提示只基于当前新闻列表做运营提醒，不会自动修改数据库；建议先编辑完善，再预览前台新闻页。' }}</p>
      </div>
      <div v-if="articleQualityIssues.length" class="data-quality-list">
        <article v-for="item in articleQualityIssues" :key="item.key" class="data-quality-card" :class="item.tone">
          <div>
            <strong>{{ item.name }}</strong>
            <small>{{ item.path }}</small>
          </div>
          <p>{{ item.reason }}</p>
          <el-button size="small" color="#222" class="dark-btn" @click="openEditArticle(item.row)">去完善</el-button>
        </article>
      </div>
      <div v-else class="empty-panel compact-empty">
        {{ activeArticleFilters ? '当前筛选范围没有发现问题；如需查看全部新闻，请返回全部。' : '当前新闻列表没有发现明显的发布前风险。' }}
      </div>
    </section>

    <el-alert v-if="articleError" :title="articleError" description="请检查网络或后台 API 状态后重试。" type="error" show-icon :closable="false" class="mb-16" />

    <div class="mobile-admin-list article-mobile-list" v-loading="articleLoading">
      <article v-for="row in articles" :key="row.id" class="mobile-admin-card article-mobile-card">
        <div class="mobile-list-media">
          <el-image :src="mediaSrc(row.attributes.image?.data?.attributes?.url)" v-if="row.attributes.image" fit="cover" />
          <span v-else>无图</span>
        </div>
        <div class="mobile-list-body">
          <div class="mobile-list-tags">
            <el-tag size="small" :type="publishStatusMeta(row.attributes.status).type" effect="dark">{{ publishStatusMeta(row.attributes.status).label }}</el-tag>
            <el-tag size="small" effect="dark">{{ row.attributes.category || 'News' }}</el-tag>
          </div>
          <strong>{{ row.attributes.title }}</strong>
          <small>{{ row.attributes.date }}</small>
          <p>{{ row.attributes.description || '暂无摘要' }}</p>
          <div class="mobile-list-meta">
            <span>{{ row.attributes.slug || `ID ${row.id}` }}</span>
          </div>
          <div class="mobile-list-actions">
            <el-button :icon="DocumentCopy" size="small" @click="openPreview(articlePreviewPath(row))" color="#111" class="dark-btn">预览</el-button>
            <el-button :icon="Edit" size="small" @click="openEditArticle(row)" color="#222" class="dark-btn">编辑</el-button>
            <el-button :icon="Clock" size="small" @click="openArticleVersionDrawer(row)">版本</el-button>
            <el-button :icon="Delete" size="small" type="danger" @click="handleDelete(row.id)">删除</el-button>
          </div>
        </div>
      </article>
      <div v-if="!articleLoading && !articles.length" class="empty-panel compact-empty">暂无新闻内容</div>
    </div>

    <el-table :data="articles" border class="wide-table mobile-hidden-table" v-loading="articleLoading" empty-text="暂无新闻内容">
      <el-table-column label="封面" width="90" align="center">
        <template #default="{ row }"><el-image :src="mediaSrc(row.attributes.image?.data?.attributes?.url)" v-if="row.attributes.image" class="t-img" /></template>
      </el-table-column>
      <el-table-column prop="attributes.title" label="新闻标题" min-width="220" />
      <el-table-column prop="attributes.category" label="分类" width="140" />
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }"><el-tag :type="publishStatusMeta(row.attributes.status).type" effect="dark">{{ publishStatusMeta(row.attributes.status).label }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="attributes.date" label="发布日期" width="140" />
      <el-table-column label="管理" width="210" align="center">
        <template #default="{ row }">
          <div class="row-action-group">
            <el-button :icon="DocumentCopy" size="small" title="预览前台新闻页" aria-label="预览前台新闻页" @click="openPreview(articlePreviewPath(row))" color="#111" class="dark-btn">预览</el-button>
            <el-button :icon="Edit" size="small" title="编辑新闻内容" aria-label="编辑新闻内容" @click="openEditArticle(row)" color="#222" class="dark-btn">编辑</el-button>
            <el-dropdown trigger="click">
              <el-button size="small" title="更多新闻操作" aria-label="更多新闻操作">更多</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="openArticleVersionDrawer(row)">查看版本历史</el-dropdown-item>
                  <el-dropdown-item class="danger-dropdown-item" @click="handleDelete(row.id)">删除新闻</el-dropdown-item>
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

    <el-dialog v-model="aDiag" :title="isEdit ? '编辑新闻' : '发布新闻'" width="760px" class="dark-dialog" append-to-body destroy-on-close :before-close="requestCloseArticleDialog">
      <el-alert :title="articleQuality.title" :type="articleQuality.type" :description="articleQuality.description" show-icon :closable="false" class="mb-16" />
      <el-form ref="articleFormRef" :model="aForm" :rules="articleRules" label-width="90px">
        <section class="form-section is-emphasis">
          <div class="form-section-title">
            <strong>基础信息</strong>
            <span>标题、栏目和日期会直接出现在新闻列表、详情页和搜索结果中。</span>
          </div>
          <el-form-item label="新闻标题" prop="title"><el-input v-model="aForm.title" /></el-form-item>
          <el-row :gutter="20">
            <el-col :span="12"><el-form-item label="栏目分类" prop="category"><el-input v-model="aForm.category" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="发布日期" prop="date"><el-date-picker v-model="aForm.date" value-format="YYYY-MM-DD" type="date" class="full" /></el-form-item></el-col>
          </el-row>
        </section>

        <section class="form-section">
          <div class="form-section-title">
            <strong>封面与正文</strong>
            <span>封面建议使用真实活动或产品图片，摘要控制在适合列表阅读的长度。</span>
          </div>
          <el-form-item label="新闻封面"><image-upload v-model="aForm.imageUrl" width="220px" height="120px" /></el-form-item>
          <el-form-item label="正文详情">
            <div class="article-editor-field">
              <el-input v-model="aForm.description" type="textarea" :rows="7" placeholder="可填写正文段落；也可以使用下方格式助手插入小标题、引用、图片或视频。" />
              <div class="article-format-helper">
                <div>
                  <strong>正文格式助手</strong>
                  <span>每种格式单独成行，保存后会在新闻详情页自动排版。</span>
                </div>
                <div class="article-format-actions">
                  <el-button size="small" @click="appendArticleSnippet('heading')">插入小标题</el-button>
                  <el-button size="small" @click="appendArticleSnippet('quote')">插入引用</el-button>
                  <el-upload
                    :action="`${BASE}/api/upload`"
                    :headers="adminUploadHeaders()"
                    :accept="IMAGE_ACCEPT"
                    :show-file-list="false"
                    :before-upload="(file) => beforeArticleBodyUpload(file, 'image')"
                    :on-success="handleArticleBodyImageSuccess"
                    :on-error="handleArticleBodyUploadError"
                  >
                    <el-button size="small" type="primary" plain>上传图片插入</el-button>
                  </el-upload>
                  <el-upload
                    :action="`${BASE}/api/upload`"
                    :headers="adminUploadHeaders()"
                    :accept="VIDEO_ACCEPT"
                    :show-file-list="false"
                    :before-upload="(file) => beforeArticleBodyUpload(file, 'video')"
                    :on-success="handleArticleBodyVideoSuccess"
                    :on-error="handleArticleBodyUploadError"
                  >
                    <el-button size="small" type="primary" plain>上传视频插入</el-button>
                  </el-upload>
                </div>
                <p>图片和视频会先上传到资源库，再自动插入正文；也可以手动填写：![图片说明](/uploads/example.jpg "图片说明")。</p>
              </div>
            </div>
          </el-form-item>
        </section>

        <section class="form-section">
          <div class="form-section-title">
            <strong>发布与预览</strong>
            <span>未确认前建议保存草稿，发布前可先打开前台预览效果。</span>
          </div>
          <el-form-item label="发布状态"><el-select v-model="aForm.status" class="full"><el-option v-for="item in publishStatusOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
          <el-form-item label="发布预览">
            <div class="seo-preview">
              <strong>{{ aForm.seoTitle || `${aForm.title || '新闻标题'} | 胡氏管乐` }}</strong>
              <span>{{ aForm.category || 'News' }} / {{ aForm.date || '发布日期' }}</span>
              <p>{{ aForm.seoDescription || aForm.description || '新闻摘要会显示在资讯中心和搜索结果中。' }}</p>
            </div>
          </el-form-item>
        </section>

        <section class="form-section">
          <div class="form-section-title">
            <strong>SEO 与分享</strong>
            <span>用于搜索结果、微信分享和浏览器标签；不填写时会自动使用新闻标题、正文和封面图。</span>
          </div>
          <el-form-item label="SEO 标题"><el-input v-model="aForm.seoTitle" maxlength="80" show-word-limit placeholder="例如：胡氏管乐 Care+ 服务体系正式上线 | 胡氏管乐" /></el-form-item>
          <el-form-item label="SEO 描述"><el-input v-model="aForm.seoDescription" type="textarea" :rows="3" maxlength="160" show-word-limit placeholder="建议 60-120 字，概括这篇新闻最重要的信息。" /></el-form-item>
          <el-form-item label="关键词"><el-input v-model="aForm.seoKeywords" placeholder="用英文逗号分隔，例如：管乐,售后服务,胡氏管乐" /></el-form-item>
          <el-form-item label="分享图"><image-upload v-model="aForm.ogImageUrl" width="220px" height="120px" /></el-form-item>
          <p class="field-hint">分享图未填写时，会自动使用新闻封面。正式发布前建议点击“发布前预览”确认标题、封面和正文显示正常。</p>
        </section>
      </el-form>
      <template #footer>
        <div class="dialog-footer-actions">
          <span class="dialog-footer-hint">{{ articleChangeHint }}</span>
          <div class="dialog-footer-buttons">
            <el-button @click="requestCloseArticleDialog()">取消</el-button>
            <el-button @click="submitArticle('draft')">保存草稿</el-button>
            <el-button color="#222" class="dark-btn" @click="previewArticleForm">发布前预览</el-button>
            <el-button type="warning" plain @click="submitArticle('hidden')">保存并隐藏</el-button>
            <el-button type="primary" @click="submitArticle('published')">保存并发布</el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <el-drawer v-model="articleVersionDrawerOpen" title="新闻版本历史" size="620px" class="dark-drawer" append-to-body>
      <template v-if="activeVersionArticle">
        <div class="version-current">
          <strong>{{ activeVersionArticle.attributes?.title || '未命名新闻' }}</strong>
          <span>/news/{{ activeVersionArticle.attributes?.slug || activeVersionArticle.id }}</span>
        </div>

        <el-alert
          title="回滚会把当前新闻恢复到所选历史快照，并自动保存当前内容作为可恢复记录。"
          type="warning"
          :closable="false"
          show-icon
          class="mb-16"
        />

        <div v-if="articleVersionsLoading" class="empty-panel compact-empty">版本记录加载中...</div>
        <div v-else-if="articleVersions.length === 0" class="empty-panel compact-empty">暂无历史版本。新闻创建或编辑后会自动生成版本记录。</div>
        <div v-else class="version-list">
          <article v-for="version in articleVersions" :key="version.id" class="version-item">
            <div class="version-item-main">
              <strong>{{ version.title || activeVersionArticle.attributes?.title || '历史版本' }}</strong>
              <span>{{ formatTime(version.createdAt) }} / {{ version.operator || '系统' }}</span>
              <small>{{ articleVersionSummary(version) }}</small>
            </div>
            <el-button type="warning" plain :loading="restoringArticleVersionId === version.id" @click="restoreArticleVersion(version)">回滚</el-button>
          </article>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Clock, Delete, DocumentCopy, Edit, Search } from '@element-plus/icons-vue'
import ImageUpload from '../components/ImageUpload.vue'
import { BASE, adminUploadHeaders, api, extractErrorMessage, listData, mediaSrc, openPreview, paginationMeta } from '../lib/api'
import { publishStatusMeta, publishStatusOptions } from '../lib/meta'
import { formatTime, qualityResult } from '../lib/format'
import { changedFieldLabels, changedFieldSentence } from '../lib/changeSummary'
import { IMAGE_ACCEPT, VIDEO_ACCEPT, validateUploadFile } from '../lib/uploadPolicy'

const articles = ref([])
const articleSearch = ref('')
const articleStatusFilter = ref('all')
const articleLoading = ref(false)
const articleError = ref('')
const articlePage = ref(1)
const articlePageSize = ref(20)
const articleTotal = ref(0)
const aDiag = ref(false)
const isEdit = ref(false)
const curId = ref(null)
const articleFormRef = ref(null)
const emptyArticleForm = () => ({
  title: '',
  category: 'Event',
  date: '',
  description: '',
  imageUrl: '',
  status: 'published',
  seoTitle: '',
  seoDescription: '',
  seoKeywords: '',
  ogImageUrl: ''
})
const aForm = reactive(emptyArticleForm())
const articleVersionDrawerOpen = ref(false)
const articleVersionsLoading = ref(false)
const restoringArticleVersionId = ref(null)
const activeVersionArticle = ref(null)
const articleVersions = ref([])
const articleStateKey = 'hushi-admin-articles-state'
const originalArticlePayload = ref(null)
let articleSearchTimer = null

const articleRules = {
  title: [{ required: true, message: '请输入新闻标题', trigger: 'blur' }],
  category: [{ required: true, message: '请输入栏目分类', trigger: 'blur' }],
  date: [{ required: true, message: '请选择发布日期', trigger: 'change' }],
  description: []
}

const articleQualityFromAttributes = (attrs) => qualityResult([
  { label: '新闻标题', ok: String(attrs.title || '').trim().length >= 4 },
  { label: '栏目分类', ok: Boolean(attrs.category) },
  { label: '发布日期', ok: Boolean(attrs.date) },
  { label: '新闻封面', ok: Boolean(attrs.imageUrl || attrs.image?.data?.attributes?.url) },
  { label: '正文详情不少于 40 字', ok: String(attrs.description || '').trim().length >= 40 }
])

const articleDraftCount = computed(() => articles.value.filter((row) => (row.attributes?.status || 'published') === 'draft').length)
const articleSuspiciousWords = ['测试', 'test', 'demo', '样例', '占位', '张三', '李四', '111111']
const getArticleImageUrl = (attrs) => attrs.imageUrl || attrs.image?.data?.attributes?.url || ''
const hasSuspiciousArticleText = (attrs) => {
  const text = [attrs.title, attrs.category, attrs.description, attrs.seoTitle, attrs.seoDescription, getArticleImageUrl(attrs)].filter(Boolean).join(' ').toLowerCase()
  return articleSuspiciousWords.some((word) => text.includes(word.toLowerCase()))
}
const articleQualityReason = (attrs) => {
  const quality = articleQualityFromAttributes(attrs)
  const imageUrl = getArticleImageUrl(attrs)
  if (quality.score < 80) return `内容完整度 ${quality.score}%：建议补齐${quality.missing.join('、')}。`
  if (hasSuspiciousArticleText(attrs)) return '疑似测试或占位内容：标题、分类、正文、SEO 或图片路径包含测试特征，发布前应复核。'
  if ((attrs.status || 'published') !== 'published') return '当前不是已发布状态：如需前台展示，请确认内容后再发布；如为内部草稿，可保持不公开。'
  if (/\/uploads\/\d+-/.test(imageUrl) && String(attrs.description || '').trim().length < 80) return '封面为临时上传路径，且正文偏短，建议确认是否为正式新闻素材。'
  return ''
}
const articleQualityIssues = computed(() => articles.value.map((row) => {
  const attrs = row.attributes || {}
  const reason = articleQualityReason(attrs)
  return reason ? {
    key: row.id,
    row,
    name: attrs.title || '未命名新闻',
    path: `/news/${row.id}`,
    reason,
    tone: hasSuspiciousArticleText(attrs) ? 'danger' : 'warning'
  } : null
}).filter(Boolean))
const articleHiddenCount = computed(() => articles.value.filter((row) => (row.attributes?.status || 'published') === 'hidden').length)
const articlePublishedCount = computed(() => articles.value.filter((row) => (row.attributes?.status || 'published') === 'published').length)
const articleIncompleteCount = computed(() => articles.value.filter((row) => articleQualityFromAttributes(row.attributes || {}).score < 80).length)
const activeArticleFilters = computed(() => Boolean(articleSearch.value.trim()) || articleStatusFilter.value !== 'all')
const articleOpsCards = computed(() => [
  { label: '新闻总数', value: articleTotal.value || articles.value.length, desc: '资讯内容池', tone: 'primary' },
  { label: '已发布', value: articlePublishedCount.value, desc: '前台可见内容', tone: 'success' },
  { label: '草稿/隐藏', value: articleDraftCount.value + articleHiddenCount.value, desc: '需要复核后发布', tone: articleDraftCount.value + articleHiddenCount.value ? 'warning' : 'success' },
  { label: '待完善', value: articleIncompleteCount.value, desc: '封面或正文不足', tone: articleIncompleteCount.value ? 'warning' : 'success' }
])

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
  status: '发布状态'
}

const articleQuality = computed(() => {
  const result = qualityResult([
    { label: '新闻标题', ok: String(aForm.title || '').trim().length >= 4 },
    { label: '栏目分类', ok: Boolean(aForm.category) },
    { label: '发布日期', ok: Boolean(aForm.date) },
    { label: '新闻封面', ok: Boolean(aForm.imageUrl) },
    { label: '正文详情不少于 40 字', ok: String(aForm.description || '').trim().length >= 40 }
  ])
  return {
    title: `新闻内容完整度 ${result.score}%`,
    type: result.type,
    description: result.missing.length ? `建议补齐：${result.missing.join('、')}。` : '新闻字段完整，可以发布并预览前台效果。'
  }
})

const articlePayload = () => ({ ...aForm })

const articleChangeHint = computed(() => changedFieldSentence(originalArticlePayload.value, articlePayload(), articleChangeLabels, isEdit.value ? '当前没有未保存修改。' : '新新闻可先保存草稿，确认后再发布。'))

const articlePreviewPath = (row) => `/news/${row?.id || curId.value || ''}`

const articleSnippets = {
  heading: '## 小标题',
  quote: '> 这里填写需要强调的引用内容。'
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
  return name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim() || '新闻素材'
}

const appendArticleBodyMedia = (kind, url, caption) => {
  if (!url) return
  const safeCaption = caption || (kind === 'video' ? '视频说明' : '图片说明')
  const snippet = kind === 'video'
    ? `@[video](${url} "${safeCaption}")`
    : `![${safeCaption}](${url} "${safeCaption}")`
  const current = String(aForm.description || '').trimEnd()
  aForm.description = current ? `${current}\n\n${snippet}` : snippet
}

const beforeArticleBodyUpload = (file, kind) => {
  const result = validateUploadFile(file, { kind })
  if (!result.ok) ElMessage.warning(result.message)
  return result.ok
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
  try { parsed = JSON.parse(error?.message || '{}') } catch {}
  ElMessage.error(parsed?.error?.message || extractErrorMessage(error, '素材上传失败'))
}

const fetchArticles = async () => {
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
        pageSize: articlePageSize.value
      }
    })
    articles.value = listData(res)
    articleTotal.value = paginationMeta(res).total || articles.value.length
  } catch (error) {
    articleError.value = extractErrorMessage(error, '新闻列表加载失败')
    articles.value = []
    articleTotal.value = 0
  } finally {
    articleLoading.value = false
  }
}

const saveArticleState = () => {
  try {
    window.localStorage.setItem(articleStateKey, JSON.stringify({
      search: articleSearch.value,
      status: articleStatusFilter.value,
      page: articlePage.value,
      pageSize: articlePageSize.value
    }))
  } catch {}
}

const restoreArticleState = () => {
  try {
    const state = JSON.parse(window.localStorage.getItem(articleStateKey) || '{}')
    if (typeof state.search === 'string') articleSearch.value = state.search
    if (typeof state.status === 'string') articleStatusFilter.value = state.status
    if (Number.isFinite(Number(state.page))) articlePage.value = Number(state.page)
    if (Number.isFinite(Number(state.pageSize))) articlePageSize.value = Number(state.pageSize)
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
  isEdit.value = false
  curId.value = null
  Object.assign(aForm, {
    ...emptyArticleForm(),
    date: new Date().toISOString().split('T')[0]
  })
  originalArticlePayload.value = articlePayload()
  aDiag.value = true
}

const openEditArticle = (row) => {
  isEdit.value = true
  curId.value = row.id
  Object.assign(aForm, {
    ...emptyArticleForm(),
    ...row.attributes,
    imageUrl: row.attributes.image?.data?.attributes?.url || row.attributes.imageUrl || '',
    ogImageUrl: row.attributes.ogImageUrl || ''
  })
  originalArticlePayload.value = articlePayload()
  aDiag.value = true
}

const previewArticleForm = () => {
  if (isEdit.value && curId.value) openPreview(articlePreviewPath())
  else openPreview('/news')
}

const requestCloseArticleDialog = async (done) => {
  const changedFields = changedFieldLabels(originalArticlePayload.value, articlePayload(), articleChangeLabels)
  if (changedFields.length) {
    try {
      await ElMessageBox.confirm(`当前有未保存修改：${changedFields.join('、')}。关闭后这些修改不会保存。`, '未保存修改', {
        type: 'warning',
        confirmButtonText: '放弃修改',
        cancelButtonText: '继续编辑'
      })
    } catch {
      return
    }
  }
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
    snapshot.description ? `摘要：${String(snapshot.description).slice(0, 42)}` : ''
  ].filter(Boolean)
  return parts.join(' / ') || '历史快照'
}

const openArticleVersionDrawer = async (row) => {
  activeVersionArticle.value = row
  articleVersionDrawerOpen.value = true
  articleVersions.value = []
  articleVersionsLoading.value = true
  try {
    const res = await api.get(`/api/articles/${row.id}/versions`)
    articleVersions.value = listData(res)
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, '新闻版本记录加载失败'))
  } finally {
    articleVersionsLoading.value = false
  }
}

const restoreArticleVersion = async (version) => {
  if (!activeVersionArticle.value) return
  try {
    await ElMessageBox.confirm(
      `确定将“${activeVersionArticle.value.attributes?.title || '该新闻'}”恢复到 ${formatTime(version.createdAt)} 的版本？当前内容会先保存为新的历史版本。`,
      '新闻版本回滚确认',
      { type: 'warning', confirmButtonText: '确认回滚', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  restoringArticleVersionId.value = version.id
  try {
    await api.post(`/api/articles/${activeVersionArticle.value.id}/restore/${version.id}`)
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
  const previousStatus = aForm.status
  try {
    await articleFormRef.value?.validate()
    if (targetStatus) aForm.status = targetStatus
    const payload = articlePayload()
    const changedFields = changedFieldLabels(originalArticlePayload.value, payload, articleChangeLabels)
    if (isEdit.value && changedFields.length) {
      await ElMessageBox.confirm(`本次将修改：${changedFields.join('、')}。确认保存？`, '保存前确认', { type: 'info' })
    }
    if (targetStatus === 'published') {
      await ElMessageBox.confirm('确认发布这篇新闻？发布后将进入前台新闻列表。', '发布前确认', { type: 'info' })
    }
    const res = await api[isEdit.value ? 'put' : 'post'](isEdit.value ? `/api/articles/${curId.value}` : '/api/articles', payload)
    const savedArticle = res.data || {}
    aDiag.value = false
    ElMessage.success(targetStatus === 'draft' ? '新闻草稿已保存' : targetStatus === 'hidden' ? '新闻已隐藏' : targetStatus === 'published' ? '新闻已发布' : '新闻已保存')
    await fetchArticles()
    if (payload.status === 'published') {
      try {
        await ElMessageBox.confirm('新闻已保存并发布，是否现在打开前台详情页检查效果？', '发布后验收', {
          type: 'success',
          confirmButtonText: '查看前台',
          cancelButtonText: '留在后台'
        })
        openPreview(`/news/${savedArticle.id || curId.value}`)
      } catch {}
    }
  } catch (error) {
    if ((error === 'cancel' || error === 'close') && targetStatus) aForm.status = previousStatus
    if (error !== 'cancel' && error !== 'close') ElMessage.error(extractErrorMessage(error, '请检查新闻表单'))
  }
}

const handleDelete = async (id) => {
  await ElMessageBox.confirm('确定删除这篇新闻？删除后该内容将从后台和官网新闻列表移除。', '敏感操作确认', { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' })
  await api.delete(`/api/articles/${id}`)
  ElMessage.success('已删除')
  fetchArticles()
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
