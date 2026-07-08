<template>
  <div>
    <section class="business-command-panel cms-command-panel">
      <div class="business-command-main">
        <span class="business-kicker">页面内容运营</span>
        <h2>把官网栏目内容按发布流程维护清楚</h2>
        <p>这里维护 FAQ、下载中心、音响页、品牌历程、首页入口、视频指南和独立 CMS 页面。先看当前栏目数量与待完善内容，再新增、预览或发布。</p>
        <div class="business-command-actions">
          <el-button color="#222" class="dark-btn" @click="previewCurrentContentTab">预览当前官网页</el-button>
          <el-button type="primary" color="#fff" class="light-btn" @click="openAddContent">新增此页内容</el-button>
        </div>
      </div>
      <div class="business-task-grid">
        <article v-for="item in cmsOpsCards" :key="item.label" class="business-task-card" :class="item.tone">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
          <small>{{ item.desc }}</small>
        </article>
      </div>
    </section>

    <div class="table-tools enterprise-table-tools">
      <span class="muted-text">内容支持草稿、已发布、隐藏；保存前会进行字段完整度检查。</span>
      <div class="filter-row">
        <el-input v-model="contentKeyword" placeholder="搜索当前栏目内容" :prefix-icon="Search" class="w-220" clearable @input="handleContentSearchInput" />
        <el-select v-model="contentStatusFilter" class="w-140" @change="handleContentFilterChange">
          <el-option label="全部状态" value="all" />
          <el-option v-for="item in publishStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
      </div>
    </div>

    <section v-if="contentTab === 'pageContent'" class="policy-page-quick-entry">
      <div class="policy-page-quick-entry-head">
        <div>
          <strong>正式页面快捷入口</strong>
          <span>三个条款页都在这里统一维护，建议先选中对应条目再编辑或预览。</span>
        </div>
        <el-button text type="primary" @click="jumpToPolicyPage('privacy')">隐私政策</el-button>
      </div>
      <div class="policy-page-quick-entry-grid">
        <article v-for="item in policyPageQuickItems" :key="item.slug" class="policy-page-quick-entry-card">
          <div>
            <strong>{{ item.title }}</strong>
            <small>路由：/info/{{ item.slug }}</small>
            <p>{{ item.desc }}</p>
          </div>
          <div class="policy-page-quick-entry-actions">
            <el-button size="small" @click="selectPolicyPage(item.slug)">定位记录</el-button>
            <el-button size="small" color="#222" class="dark-btn" @click="previewPolicyPage(item.slug)">预览前台</el-button>
          </div>
        </article>
      </div>
    </section>

    <el-alert v-if="contentError" :title="contentError" description="请检查网络或后台 API 状态后重试。" type="error" show-icon :closable="false" class="mb-16" />

    <el-tabs v-model="contentTab" class="dark-tabs" @tab-change="handleContentTabChange">
      <el-tab-pane label="常见问题 (FAQ)" name="faq">
        <content-table :rows="contentData.faq" endpoint="support-faqs" :loading="contentLoading.faq" @edit="openEditContent" @delete="handleDelete" @preview="previewRow" @version="openContentVersionDrawer">
          <el-table-column prop="question" label="问题摘要" min-width="250" show-overflow-tooltip />
          <el-table-column prop="category" label="分类" width="110"><template #default="{ row }">{{ faqCategoryLabel(row.category) }}</template></el-table-column>
          <el-table-column prop="answer" label="详细解答" min-width="300" show-overflow-tooltip />
        </content-table>
      </el-tab-pane>
      <el-tab-pane label="支持下载中心" name="download">
        <content-table :rows="contentData.download" endpoint="support-downloads" :loading="contentLoading.download" @edit="openEditContent" @delete="handleDelete" @preview="previewRow" @version="openContentVersionDrawer">
          <el-table-column prop="name" label="资源名称" min-width="240" />
          <el-table-column prop="type" label="文件类型" width="150" />
          <el-table-column prop="size" label="文件大小" width="120" />
        </content-table>
      </el-tab-pane>
      <el-tab-pane label="音响解决方案" name="audioSol">
        <content-table :rows="contentData.audioSol" endpoint="audio-solutions" :loading="contentLoading.audioSol" @edit="openEditContent" @delete="handleDelete" @preview="previewRow" @version="openContentVersionDrawer">
          <el-table-column label="背景预览" width="120" align="center"><template #default="{ row }"><img :src="mediaSrc(row.imageUrl)" v-if="row.imageUrl" class="mini-preview" /></template></el-table-column>
          <el-table-column prop="title" label="中文大标题" width="200" />
          <el-table-column prop="en" label="英文副标" width="200" />
          <el-table-column prop="desc" label="核心描述" min-width="260" show-overflow-tooltip />
        </content-table>
      </el-tab-pane>
      <el-tab-pane label="音响技术指标" name="audioStat">
        <content-table :rows="contentData.audioStat" endpoint="audio-stats" :loading="contentLoading.audioStat" @edit="openEditContent" @delete="handleDelete" @preview="previewRow" @version="openContentVersionDrawer">
          <el-table-column prop="label" label="指标名称" width="200" />
          <el-table-column prop="value" label="技术数值" width="160" />
          <el-table-column prop="desc" label="补充描述" min-width="260" show-overflow-tooltip />
        </content-table>
      </el-tab-pane>
      <el-tab-pane label="品牌百年历程" name="timeline">
        <content-table :rows="contentData.timeline" endpoint="brand-timelines" :loading="contentLoading.timeline" @edit="openEditContent" @delete="handleDelete" @preview="previewRow" @version="openContentVersionDrawer">
          <el-table-column label="纪实图" width="100" align="center"><template #default="{ row }"><img :src="mediaSrc(row.imageUrl)" v-if="row.imageUrl" class="mini-preview-portrait" /></template></el-table-column>
          <el-table-column prop="year" label="时代/年份" width="140" />
          <el-table-column prop="title" label="标题" width="220" />
          <el-table-column prop="desc" label="故事" min-width="260" show-overflow-tooltip />
        </content-table>
      </el-tab-pane>
      <el-tab-pane label="首页高价值入口" name="ecosystem">
        <content-table :rows="contentData.ecosystem" endpoint="ecosystem-services" :loading="contentLoading.ecosystem" @edit="openEditContent" @delete="handleDelete" @preview="previewRow" @version="openContentVersionDrawer">
          <el-table-column label="图片" width="120" align="center"><template #default="{ row }"><img :src="mediaSrc(row.imageUrl)" v-if="row.imageUrl" class="mini-preview" /></template></el-table-column>
          <el-table-column prop="icon" label="图标短字" width="100" />
          <el-table-column prop="title" label="标题" width="180" />
          <el-table-column prop="link" label="跳转" width="150" />
          <el-table-column prop="desc" label="描述" min-width="260" show-overflow-tooltip />
        </content-table>
      </el-tab-pane>
      <el-tab-pane label="支持视频指南" name="quickGuide">
        <content-table :rows="contentData.quickGuide" endpoint="quick-guides" :loading="contentLoading.quickGuide" @edit="openEditContent" @delete="handleDelete" @preview="previewRow" @version="openContentVersionDrawer">
          <el-table-column label="封面" width="120" align="center"><template #default="{ row }"><img :src="mediaSrc(row.coverUrl)" v-if="row.coverUrl" class="mini-preview" /></template></el-table-column>
          <el-table-column prop="title" label="标题" min-width="220" />
          <el-table-column prop="duration" label="时长" width="100" />
          <el-table-column prop="category" label="品类" width="140" />
        </content-table>
      </el-tab-pane>
      <el-tab-pane label="独立 CMS 页面" name="pageContent">
        <content-table ref="pageContentTableRef" :rows="contentData.pageContent" endpoint="page-contents" :loading="contentLoading.pageContent" @edit="openEditContent" @delete="handleDelete" @preview="previewRow" @version="openContentVersionDrawer">
          <el-table-column prop="slug" label="路由后缀" width="180" />
          <el-table-column prop="title" label="页面标题" min-width="240" />
          <el-table-column prop="content" label="正文摘要" min-width="300" show-overflow-tooltip />
        </content-table>
      </el-tab-pane>
    </el-tabs>

    <div class="table-pagination">
      <span class="pagination-total">当前栏目共 {{ currentContentTotal }} 条内容</span>
      <el-pagination
        v-model:current-page="contentPage"
        v-model:page-size="contentPageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="currentContentTotal"
        layout="sizes, prev, pager, next"
        background
        @size-change="handleContentPageSizeChange"
        @current-change="handleContentPageChange"
      />
    </div>

    <el-dialog v-model="cDiag" :title="isEdit ? '编辑页面内容' : '新增页面内容'" width="720px" class="dark-dialog" append-to-body destroy-on-close :before-close="requestCloseContentDialog">
      <el-alert :title="contentQuality.title" :type="contentQuality.type" :description="contentQuality.description" show-icon :closable="false" class="mb-16" />
      <el-form ref="contentFormRef" :model="cForm" :rules="contentRules" label-width="112px">
        <section class="form-section is-emphasis">
          <div class="form-section-title">
            <strong>发布设置</strong>
            <span>草稿不会公开展示；隐藏适合临时下线；确认无误后再发布。</span>
          </div>
          <el-form-item label="发布状态"><el-select v-model="cForm.status" class="full"><el-option v-for="item in publishStatusOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
        </section>

        <section class="form-section">
          <div class="form-section-title">
            <strong>内容字段</strong>
            <span>当前栏目只显示需要维护的字段，带红色提示的内容建议优先补齐。</span>
          </div>
          <template v-if="contentTab === 'faq'">
            <el-form-item label="问题" prop="question"><el-input v-model="cForm.question" /></el-form-item>
            <el-form-item label="分类" prop="category"><el-select v-model="cForm.category" class="full"><el-option v-for="item in faqCategories" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
            <el-form-item label="解答"><el-input type="textarea" :rows="4" v-model="cForm.answer" maxlength="800" show-word-limit /></el-form-item>
          </template>
          <template v-else-if="contentTab === 'download'">
            <el-form-item label="真实文件">
              <el-upload class="file-upload" :action="`${BASE}/api/upload`" :headers="adminUploadHeaders()" :accept="DOCUMENT_ACCEPT" :before-upload="beforeDocumentUpload" :show-file-list="false" :on-success="handleFileSuccess" :on-error="handleUploadError">
                <el-button type="primary" plain color="#222" class="dark-btn">上传资料 (PDF/ZIP/RAR)</el-button>
                <div v-if="cForm.fileUrl" class="ready-text">文件已就绪</div>
              </el-upload>
              <p class="field-hint">{{ documentUploadHint }}</p>
            </el-form-item>
            <el-form-item label="资源名称" prop="name"><el-input v-model="cForm.name" /></el-form-item>
            <el-form-item label="文件类型" prop="type"><el-input v-model="cForm.type" /></el-form-item>
            <el-form-item label="文件大小"><el-input v-model="cForm.size" /></el-form-item>
          </template>
          <template v-else-if="contentTab === 'audioSol'">
            <el-form-item label="精美配图"><image-upload v-model="cForm.imageUrl" width="220px" height="130px" /></el-form-item>
            <el-form-item label="英文副标" prop="en"><el-input v-model="cForm.en" /></el-form-item>
            <el-form-item label="中文大标题" prop="title"><el-input v-model="cForm.title" /></el-form-item>
            <el-form-item label="核心描述"><el-input type="textarea" :rows="3" v-model="cForm.desc" /></el-form-item>
          </template>
          <template v-else-if="contentTab === 'audioStat'">
            <el-form-item label="指标短标" prop="label"><el-input v-model="cForm.label" /></el-form-item>
            <el-form-item label="核心数值" prop="value"><el-input v-model="cForm.value" /></el-form-item>
            <el-form-item label="通俗描述"><el-input type="textarea" :rows="2" v-model="cForm.desc" /></el-form-item>
          </template>
          <template v-else-if="contentTab === 'timeline'">
            <el-form-item label="历史纪实图"><image-upload v-model="cForm.imageUrl" width="140px" height="170px" /></el-form-item>
            <el-form-item label="时代/年份" prop="year"><el-input v-model="cForm.year" /></el-form-item>
            <el-form-item label="纪元大标题" prop="title"><el-input v-model="cForm.title" /></el-form-item>
            <el-form-item label="详细故事"><el-input type="textarea" :rows="4" v-model="cForm.desc" /></el-form-item>
          </template>
          <template v-else-if="contentTab === 'ecosystem'">
            <el-form-item label="卡片图片"><image-upload v-model="cForm.imageUrl" width="220px" height="130px" /></el-form-item>
            <el-form-item label="图标短字" prop="icon"><el-input v-model="cForm.icon" /></el-form-item>
            <el-form-item label="卡片标题" prop="title"><el-input v-model="cForm.title" /></el-form-item>
            <el-form-item label="服务描述"><el-input type="textarea" :rows="3" v-model="cForm.desc" /></el-form-item>
            <el-form-item label="跳转路由" prop="link"><el-input v-model="cForm.link" /></el-form-item>
          </template>
          <template v-else-if="contentTab === 'quickGuide'">
            <el-form-item label="视频封面"><image-upload v-model="cForm.coverUrl" width="220px" height="120px" /></el-form-item>
            <el-form-item label="视频文件">
              <el-upload class="file-upload" :action="`${BASE}/api/upload`" :headers="adminUploadHeaders()" :accept="VIDEO_ACCEPT" :before-upload="beforeVideoUpload" :show-file-list="false" :on-success="handleVideoSuccess" :on-error="handleUploadError">
                <el-button type="primary" plain color="#222" class="dark-btn">上传 MP4 视频</el-button>
                <div v-if="cForm.videoUrl" class="ready-text">视频已就绪</div>
              </el-upload>
              <p class="field-hint">{{ videoUploadHint }}</p>
            </el-form-item>
            <el-form-item label="视频标题" prop="title"><el-input v-model="cForm.title" /></el-form-item>
            <el-form-item label="视频总时长" prop="duration"><el-input v-model="cForm.duration" /></el-form-item>
            <el-form-item label="所属品类" prop="category"><el-input v-model="cForm.category" /></el-form-item>
          </template>
          <template v-else-if="contentTab === 'pageContent'">
            <el-form-item label="路由后缀" prop="slug"><el-input v-model="cForm.slug" /></el-form-item>
            <el-form-item label="页面主标题" prop="title"><el-input v-model="cForm.title" /></el-form-item>
            <el-form-item label="长篇富文本"><el-input type="textarea" :rows="12" v-model="cForm.content" maxlength="5000" show-word-limit /></el-form-item>
          </template>
        </section>

        <section v-if="contentTab !== 'pageContent'" class="form-section">
          <div class="form-section-title">
            <strong>排序与预览</strong>
            <span>数值越小通常越靠前，保存后可通过前台预览确认展示位置。</span>
          </div>
          <el-form-item label="排序权重"><el-input-number v-model="cForm.sortOrder" :min="0" class="full" /></el-form-item>
        </section>
      </el-form>
      <template #footer>
        <div class="dialog-footer-actions">
          <span class="dialog-footer-hint">{{ contentChangeHint }}</span>
          <div class="dialog-footer-buttons">
            <el-button @click="requestCloseContentDialog()">取消</el-button>
            <el-button @click="submitContent('draft')">保存草稿</el-button>
            <el-button color="#222" class="dark-btn" @click="previewCurrentDraft">发布前预览</el-button>
            <el-button type="warning" plain @click="submitContent('hidden')">保存并隐藏</el-button>
            <el-button type="primary" @click="submitContent('published')">保存并发布</el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <el-drawer v-model="contentVersionDrawerOpen" title="CMS 内容版本历史" size="620px" class="dark-drawer" append-to-body>
      <template v-if="activeVersionContent">
        <div class="version-current">
          <strong>{{ getContentTitle(activeVersionContent) }}</strong>
          <span>{{ activeVersionEndpoint }} / ID {{ activeVersionContent.id }}</span>
        </div>

        <el-alert
          title="回滚会把当前 CMS 内容恢复到所选历史快照，并自动保存当前内容作为可恢复记录。"
          type="warning"
          :closable="false"
          show-icon
          class="mb-16"
        />

        <div v-if="contentVersionsLoading" class="empty-panel compact-empty">版本记录加载中...</div>
        <div v-else-if="contentVersions.length === 0" class="empty-panel compact-empty">暂无历史版本。内容创建或编辑后会自动生成版本记录。</div>
        <div v-else class="version-list">
          <article v-for="version in contentVersions" :key="version.id" class="version-item">
            <div class="version-item-main">
              <strong>{{ version.title || getContentTitle(activeVersionContent) }}</strong>
              <span>{{ formatTime(version.createdAt) }} / {{ version.operator || '系统' }}</span>
              <small>{{ contentVersionSummary(version) }}</small>
            </div>
            <el-button type="warning" plain :loading="restoringContentVersionId === version.id" @click="restoreContentVersion(version)">回滚</el-button>
          </article>
        </div>
      </template>
  </el-drawer>

    <el-drawer v-model="policyPageDrawerOpen" title="正式页面快捷管理" size="420px" class="dark-drawer" append-to-body>
      <div class="policy-page-drawer">
        <p class="policy-page-drawer-hint">隐私政策、使用条款、售后/保修说明属于正式公开页面，建议在这里统一检查状态和预览。</p>
        <div v-for="item in policyPageQuickItems" :key="item.slug" class="policy-page-drawer-item">
          <div>
            <strong>{{ item.title }}</strong>
            <span>/info/{{ item.slug }}</span>
          </div>
          <div class="policy-page-drawer-actions">
            <el-button size="small" @click="selectPolicyPage(item.slug)">选中</el-button>
            <el-button size="small" color="#222" class="dark-btn" @click="previewPolicyPage(item.slug)">预览</el-button>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import ContentTable from '../components/ContentTable.vue'
import ImageUpload from '../components/ImageUpload.vue'
import { BASE, adminUploadHeaders, api, extractErrorMessage, listData, mediaSrc, openPreview, paginationMeta } from '../lib/api'
import { faqCategories, faqCategoryLabel, publishStatusOptions } from '../lib/meta'
import { formatTime, qualityResult } from '../lib/format'
import { DOCUMENT_ACCEPT, VIDEO_ACCEPT, documentUploadHint, formatBytes, validateUploadFile, videoUploadHint } from '../lib/uploadPolicy'
import { changedFieldLabels, changedFieldSentence } from '../lib/changeSummary'

const contentTab = ref('faq')
const contentKeyword = ref('')
const contentStatusFilter = ref('all')
const contentPage = ref(1)
const contentPageSize = ref(20)
const contentTotal = reactive({})
const contentLoading = reactive({})
const contentError = ref('')
const cDiag = ref(false)
const isEdit = ref(false)
const curId = ref(null)
const contentFormRef = ref(null)
const cForm = reactive({})
const contentVersionDrawerOpen = ref(false)
const contentVersionsLoading = ref(false)
const restoringContentVersionId = ref(null)
const activeVersionContent = ref(null)
const activeVersionEndpoint = ref('')
const contentVersions = ref([])
const pageContentTableRef = ref(null)
const policyPageDrawerOpen = ref(false)
const originalContentPayload = ref(null)
const policyPageQuickItems = [
  { slug: 'privacy', title: '隐私政策', desc: '说明个人信息收集、保存、使用、删除和第三方服务规则。' },
  { slug: 'terms', title: '使用条款', desc: '说明网站使用边界、知识产权、免责声明和争议处理方式。' },
  { slug: 'warranty', title: '售后/保修说明', desc: '说明保修范围、送修流程、费用规则和售后支持方式。' }
]
const contentEndpoints = { faq: 'support-faqs', download: 'support-downloads', audioSol: 'audio-solutions', audioStat: 'audio-stats', timeline: 'brand-timelines', ecosystem: 'ecosystem-services', quickGuide: 'quick-guides', pageContent: 'page-contents' }
const contentPreviewRoutes = { faq: '/support', download: '/support', audioSol: '/audio', audioStat: '/audio', timeline: '/info/brand-story', ecosystem: '/', quickGuide: '/support', pageContent: '/info/brand-story' }
const contentData = reactive({ faq: [], download: [], audioSol: [], audioStat: [], timeline: [], ecosystem: [], quickGuide: [], pageContent: [] })
const defaultForms = {
  faq: { question: '', answer: '', category: 'general', sortOrder: 0, status: 'published' },
  download: { name: '', type: 'Manual', size: '', fileUrl: '', sortOrder: 0, status: 'published' },
  audioSol: { title: '', en: '', desc: '', imageUrl: '', sortOrder: 0, status: 'published' },
  audioStat: { label: '', value: '', desc: '', sortOrder: 0, status: 'published' },
  timeline: { year: '', title: '', desc: '', imageUrl: '', sortOrder: 0, status: 'published' },
  ecosystem: { icon: '', title: '', desc: '', imageUrl: '', link: '', sortOrder: 0, status: 'published' },
  quickGuide: { title: '', duration: '', category: '', coverUrl: '', videoUrl: '', sortOrder: 0, status: 'published' },
  pageContent: { slug: '', title: '', content: '', status: 'published' }
}
const contentStateKey = 'hushi-admin-cms-state'
let contentSearchTimer = null

const contentRules = {
  question: [{ required: true, message: '请输入问题', trigger: 'blur' }],
  answer: [],
  category: [{ required: true, message: '请选择分类', trigger: 'change' }],
  name: [{ required: true, message: '请输入资源名称', trigger: 'blur' }],
  type: [{ required: true, message: '请输入类型', trigger: 'blur' }],
  title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
  en: [{ required: true, message: '请输入英文副标', trigger: 'blur' }],
  desc: [],
  label: [{ required: true, message: '请输入指标名称', trigger: 'blur' }],
  value: [{ required: true, message: '请输入指标数值', trigger: 'blur' }],
  year: [{ required: true, message: '请输入年份', trigger: 'blur' }],
  icon: [{ required: true, message: '请输入图标短字', trigger: 'blur' }],
  link: [{ required: true, message: '请输入跳转路由', trigger: 'blur' }],
  duration: [{ required: true, message: '请输入时长', trigger: 'blur' }],
  slug: [
    { required: true, message: '请输入路由后缀', trigger: 'blur' },
    { pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, message: '只能使用小写字母、数字和短横线', trigger: 'blur' }
  ],
  content: []
}

const contentQualityRules = {
  faq: [{ label: '问题', ok: () => Boolean(cForm.question) }, { label: '分类', ok: () => Boolean(cForm.category) }, { label: '解答不少于 20 字', ok: () => String(cForm.answer || '').trim().length >= 20 }],
  download: [{ label: '资源名称', ok: () => Boolean(cForm.name) }, { label: '文件类型', ok: () => Boolean(cForm.type) }, { label: '文件地址', ok: () => Boolean(cForm.fileUrl) }],
  audioSol: [{ label: '中文标题', ok: () => Boolean(cForm.title) }, { label: '英文副标', ok: () => Boolean(cForm.en) }, { label: '配图', ok: () => Boolean(cForm.imageUrl) }, { label: '描述不少于 20 字', ok: () => String(cForm.desc || '').trim().length >= 20 }],
  audioStat: [{ label: '指标名称', ok: () => Boolean(cForm.label) }, { label: '技术数值', ok: () => Boolean(cForm.value) }, { label: '通俗描述', ok: () => Boolean(cForm.desc) }],
  timeline: [{ label: '年份', ok: () => Boolean(cForm.year) }, { label: '标题', ok: () => Boolean(cForm.title) }, { label: '纪实图', ok: () => Boolean(cForm.imageUrl) }, { label: '故事不少于 30 字', ok: () => String(cForm.desc || '').trim().length >= 30 }],
  ecosystem: [{ label: '图标短字', ok: () => Boolean(cForm.icon) }, { label: '标题', ok: () => Boolean(cForm.title) }, { label: '服务描述', ok: () => Boolean(cForm.desc) }, { label: '跳转路由', ok: () => Boolean(cForm.link) }],
  quickGuide: [{ label: '标题', ok: () => Boolean(cForm.title) }, { label: '封面', ok: () => Boolean(cForm.coverUrl) }, { label: '所属品类', ok: () => Boolean(cForm.category) }],
  pageContent: [{ label: '路由后缀', ok: () => Boolean(cForm.slug) }, { label: '页面标题', ok: () => Boolean(cForm.title) }, { label: '正文不少于 80 字', ok: () => String(cForm.content || '').trim().length >= 80 }]
}

const contentQuality = computed(() => {
  const rules = contentQualityRules[contentTab.value] || []
  const result = qualityResult(rules.map((item) => ({ label: item.label, ok: item.ok() })))
  return {
    title: `当前内容完整度 ${result.score}%`,
    type: result.type,
    description: result.missing.length ? `建议补齐：${result.missing.join('、')}。` : '内容字段完整，可以发布并预览前台效果。'
  }
})

const contentChangeLabels = {
  question: '问题',
  answer: '解答',
  category: '分类',
  name: '资源名称',
  type: '类型',
  size: '大小',
  fileUrl: '文件地址',
  title: '标题',
  en: '英文副标',
  desc: '描述',
  label: '指标名称',
  value: '核心数值',
  year: '年份',
  imageUrl: '图片',
  icon: '图标短字',
  link: '跳转路由',
  duration: '时长',
  coverUrl: '视频封面',
  videoUrl: '视频文件',
  slug: '路由后缀',
  content: '正文',
  sortOrder: '排序',
  status: '发布状态'
}

const contentPayload = () => {
  const payload = { ...cForm }
  delete payload.id
  return payload
}

const contentChangeHint = computed(() => changedFieldSentence(originalContentPayload.value, contentPayload(), contentChangeLabels, isEdit.value ? '当前没有未保存修改。' : '新内容可先保存草稿，确认后再发布。'))

const currentContentTotal = computed(() => Number(contentTotal[contentTab.value] || 0))
const allContentRows = computed(() => Object.values(contentData).flat())
const cmsDraftCount = computed(() => allContentRows.value.filter((row) => (row.status || 'published') === 'draft').length)
const cmsHiddenCount = computed(() => allContentRows.value.filter((row) => (row.status || 'published') === 'hidden').length)
const cmsCurrentRows = computed(() => contentData[contentTab.value] || [])
const cmsCurrentIncompleteCount = computed(() => cmsCurrentRows.value.filter((row) => {
  const title = getContentTitle(row)
  const body = row.answer || row.desc || row.content || row.fileUrl || row.videoUrl || row.imageUrl || row.coverUrl || ''
  return !title || title === '未命名内容' || String(body).trim().length < 8
}).length)
const cmsTotalCount = computed(() => Object.values(contentTotal).reduce((sum, value) => sum + Number(value || 0), 0) || allContentRows.value.length)
const cmsOpsCards = computed(() => [
  { label: '内容总量', value: cmsTotalCount.value, desc: '全部 CMS 栏目记录', tone: 'primary' },
  { label: '当前栏目', value: currentContentTotal.value, desc: '正在维护的栏目内容', tone: 'success' },
  { label: '草稿/隐藏', value: cmsDraftCount.value + cmsHiddenCount.value, desc: '发布前需复核', tone: cmsDraftCount.value + cmsHiddenCount.value ? 'warning' : 'success' },
  { label: '待完善', value: cmsCurrentIncompleteCount.value, desc: '标题或正文素材不足', tone: cmsCurrentIncompleteCount.value ? 'warning' : 'success' }
])

const getContentTitle = (row = {}) => row.title || row.question || row.name || row.label || row.slug || row.year || row.icon || '未命名内容'

const parseContentVersionSnapshot = (version) => {
  try {
    return JSON.parse(version.snapshot || '{}')
  } catch {
    return {}
  }
}

const contentVersionSummary = (version) => {
  const snapshot = parseContentVersionSnapshot(version)
  const parts = [
    snapshot.status ? `状态：${snapshot.status}` : '',
    snapshot.category ? `分类：${snapshot.category}` : '',
    snapshot.type ? `类型：${snapshot.type}` : '',
    snapshot.slug ? `后缀：${snapshot.slug}` : '',
    snapshot.sortOrder != null ? `排序：${snapshot.sortOrder}` : '',
    snapshot.desc ? `描述：${String(snapshot.desc).slice(0, 42)}` : '',
    snapshot.answer ? `解答：${String(snapshot.answer).slice(0, 42)}` : '',
    snapshot.content ? `正文：${String(snapshot.content).slice(0, 42)}` : ''
  ].filter(Boolean)
  return parts.join(' / ') || '历史快照'
}

const saveContentState = () => {
  try {
    window.localStorage.setItem(contentStateKey, JSON.stringify({
      tab: contentTab.value,
      keyword: contentKeyword.value,
      status: contentStatusFilter.value,
      page: contentPage.value,
      pageSize: contentPageSize.value
    }))
  } catch {}
}

const restoreContentState = () => {
  try {
    const state = JSON.parse(window.localStorage.getItem(contentStateKey) || '{}')
    if (state.tab && contentEndpoints[state.tab]) contentTab.value = state.tab
    if (typeof state.keyword === 'string') contentKeyword.value = state.keyword
    if (typeof state.status === 'string') contentStatusFilter.value = state.status
    if (Number.isFinite(Number(state.page))) contentPage.value = Number(state.page)
    if (Number.isFinite(Number(state.pageSize))) contentPageSize.value = Number(state.pageSize)
  } catch {}
}

const fetchContent = async (type) => {
  contentLoading[type] = true
  contentError.value = ''
  saveContentState()
  try {
    const res = await api.get(`/api/${contentEndpoints[type]}`, {
      params: {
        admin: 1,
        search: contentKeyword.value,
        status: contentStatusFilter.value,
        page: type === contentTab.value ? contentPage.value : 1,
        pageSize: contentPageSize.value
      }
    })
    contentData[type] = listData(res)
    contentTotal[type] = paginationMeta(res).total || contentData[type].length
  } catch (error) {
    if (type === contentTab.value) contentError.value = extractErrorMessage(error, '内容列表加载失败')
    contentData[type] = []
    contentTotal[type] = 0
  } finally {
    contentLoading[type] = false
  }
}

const fetchAllContent = () => Object.keys(contentEndpoints).forEach(fetchContent)

const handleContentTabChange = () => {
  contentPage.value = 1
  fetchContent(contentTab.value)
}

const handleContentSearchInput = () => {
  contentPage.value = 1
  window.clearTimeout(contentSearchTimer)
  contentSearchTimer = window.setTimeout(() => fetchContent(contentTab.value), 260)
}

const handleContentFilterChange = () => {
  contentPage.value = 1
  fetchContent(contentTab.value)
}

const handleContentPageChange = () => {
  fetchContent(contentTab.value)
}

const handleContentPageSizeChange = () => {
  contentPage.value = 1
  fetchContent(contentTab.value)
}

const openAddContent = () => {
  isEdit.value = false
  curId.value = null
  Object.keys(cForm).forEach((key) => delete cForm[key])
  Object.assign(cForm, { ...defaultForms[contentTab.value] })
  originalContentPayload.value = contentPayload()
  cDiag.value = true
}

const openEditContent = (row) => {
  isEdit.value = true
  curId.value = row.id
  Object.keys(cForm).forEach((key) => delete cForm[key])
  Object.assign(cForm, { ...defaultForms[contentTab.value], ...row })
  originalContentPayload.value = contentPayload()
  cDiag.value = true
}

const requestCloseContentDialog = async (done) => {
  const changedFields = changedFieldLabels(originalContentPayload.value, contentPayload(), contentChangeLabels)
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
  else cDiag.value = false
}

const submitContent = async (targetStatus = '') => {
  const previousStatus = cForm.status
  try {
    await contentFormRef.value?.validate()
    const ep = contentEndpoints[contentTab.value]
    if (targetStatus) cForm.status = targetStatus
    const payload = contentPayload()
    const changedFields = changedFieldLabels(originalContentPayload.value, payload, contentChangeLabels)
    if (isEdit.value && changedFields.length) {
      await ElMessageBox.confirm(`本次将修改：${changedFields.join('、')}。确认保存？`, '保存前确认', { type: 'info' })
    }
    if (targetStatus === 'published') {
      await ElMessageBox.confirm('确认发布当前内容？发布后将进入对应前台页面。', '发布前确认', { type: 'info' })
    }
    await api[isEdit.value ? 'put' : 'post'](isEdit.value ? `/api/${ep}/${curId.value}` : `/api/${ep}`, payload)
    cDiag.value = false
    fetchContent(contentTab.value)
    ElMessage.success(targetStatus === 'draft' ? '草稿已保存' : targetStatus === 'hidden' ? '内容已隐藏' : targetStatus === 'published' ? '内容已发布' : '配置已同步')
  } catch (error) {
    if ((error === 'cancel' || error === 'close') && targetStatus) cForm.status = previousStatus
    if (error !== 'cancel' && error !== 'close') ElMessage.error(extractErrorMessage(error, '请检查内容表单'))
  }
}

const handleDelete = async (id, endpoint) => {
  await ElMessageBox.confirm('确定彻底删除这条 CMS 内容？删除后对应前台区块可能不再展示。', '敏感操作确认', { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' })
  await api.delete(`/api/${endpoint}/${id}`)
  fetchContent(contentTab.value)
  ElMessage.success('已删除')
}

const previewCurrentContentTab = () => {
  const firstPage = contentTab.value === 'pageContent' ? contentData.pageContent.find((item) => item.slug) : null
  openPreview(firstPage ? `/info/${firstPage.slug}` : contentPreviewRoutes[contentTab.value])
}

const previewCurrentDraft = () => {
  if (contentTab.value === 'pageContent' && cForm.slug) openPreview(`/info/${cForm.slug}`)
  else previewCurrentContentTab()
}

const previewRow = (row) => {
  if (contentTab.value === 'pageContent' && row.slug) openPreview(`/info/${row.slug}`)
  else openPreview(contentPreviewRoutes[contentTab.value])
}

const selectPolicyPage = async (slug) => {
  if (contentTab.value !== 'pageContent') {
    contentTab.value = 'pageContent'
    contentPage.value = 1
    await fetchContent('pageContent')
  }
  await fetchContent('pageContent')
  const target = contentData.pageContent.find((item) => item.slug === slug)
  if (!target) {
    ElMessage.warning(`未找到 ${slug} 对应的 CMS 页面`)
    return
  }
  const row = { ...target }
  openEditContent(row)
}

const previewPolicyPage = async (slug) => {
  if (contentTab.value !== 'pageContent') {
    contentTab.value = 'pageContent'
    contentPage.value = 1
    await fetchContent('pageContent')
  } else if (!contentData.pageContent.length) {
    await fetchContent('pageContent')
  }
  const target = contentData.pageContent.find((item) => item.slug === slug)
  if (!target) {
    openPreview(`/info/${slug}`)
    return
  }
  openPreview(`/info/${target.slug}`)
}

const jumpToPolicyPage = (slug) => {
  policyPageDrawerOpen.value = true
  previewPolicyPage(slug)
}

const openContentVersionDrawer = async (row, endpoint) => {
  activeVersionContent.value = row
  activeVersionEndpoint.value = endpoint
  contentVersionDrawerOpen.value = true
  contentVersions.value = []
  contentVersionsLoading.value = true
  try {
    const res = await api.get(`/api/${endpoint}/${row.id}/versions`)
    contentVersions.value = listData(res)
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, 'CMS 版本记录加载失败'))
  } finally {
    contentVersionsLoading.value = false
  }
}

const restoreContentVersion = async (version) => {
  if (!activeVersionContent.value || !activeVersionEndpoint.value) return
  try {
    await ElMessageBox.confirm(
      `确定将“${getContentTitle(activeVersionContent.value)}”恢复到 ${formatTime(version.createdAt)} 的版本？当前内容会先保存为新的历史版本。`,
      'CMS 内容版本回滚确认',
      { type: 'warning', confirmButtonText: '确认回滚', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  restoringContentVersionId.value = version.id
  try {
    await api.post(`/api/${activeVersionEndpoint.value}/${activeVersionContent.value.id}/restore/${version.id}`)
    ElMessage.success('CMS 内容已恢复到所选版本')
    contentVersionDrawerOpen.value = false
    await fetchContent(contentTab.value)
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, 'CMS 内容版本回滚失败'))
  } finally {
    restoringContentVersionId.value = null
  }
}

const handleFileSuccess = (res, file) => {
  cForm.fileUrl = res.url
  cForm.size = formatBytes(file.size)
  ElMessage.success('资料文件已上传')
}

const handleVideoSuccess = (res) => {
  cForm.videoUrl = res.url
  ElMessage.success('视频文件已上传')
}

const beforeDocumentUpload = (file) => {
  const result = validateUploadFile(file, { kind: 'document' })
  if (!result.ok) ElMessage.warning(result.message)
  return result.ok
}

const beforeVideoUpload = (file) => {
  const result = validateUploadFile(file, { kind: 'video' })
  if (!result.ok) ElMessage.warning(result.message)
  return result.ok
}

const handleUploadError = (error) => {
  ElMessage.error(extractErrorMessage(error, '资源上传失败'))
}

const handlePageAction = (event) => {
  if (event.detail === 'cms:add') openAddContent()
}

onMounted(() => {
  window.addEventListener('admin-page-action', handlePageAction)
  restoreContentState()
  fetchAllContent()
})

onBeforeUnmount(() => {
  window.removeEventListener('admin-page-action', handlePageAction)
  window.clearTimeout(contentSearchTimer)
})
</script>
