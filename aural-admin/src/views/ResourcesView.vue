<template>
  <div class="resource-page page-shell">
    <section class="business-command-panel resources-command-panel">
      <div class="business-command-main">
        <span class="business-kicker">资源运营</span>
        <h2>先确认素材可用、引用清楚、风险可控</h2>
        <p>这里统一管理官网图片、文件、引用关系和替换影响范围。日常优先处理未使用素材、严重大图和疑似重复资源。</p>
        <div class="business-command-actions">
          <el-upload
            :action="`${BASE}/api/upload`"
            :headers="adminUploadHeaders()"
            :accept="UPLOAD_ACCEPT"
            multiple
            :show-file-list="false"
            :before-upload="beforeBatchUpload"
            :on-success="handleBatchUploadSuccess"
            :on-error="handleBatchUploadError"
          >
            <el-button type="primary" color="#fff" class="light-btn">批量上传</el-button>
          </el-upload>
          <el-button color="#222" class="dark-btn" :loading="loading" @click="fetchResources">刷新资源</el-button>
        </div>
      </div>
      <div class="business-task-grid">
        <article v-for="item in resourceOpsCards" :key="item.label" class="business-task-card" :class="item.tone">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
          <small>{{ item.desc }}</small>
        </article>
      </div>
    </section>

    <section class="page-hero secondary-hero">
      <div>
        <h1>官网资源库</h1>
        <p>统一查看上传素材、引用关系、重复素材和资源替换影响范围。</p>
      </div>
      <div class="hero-actions">
        <el-button type="danger" plain :disabled="unusedUploads.length === 0" @click="openCleanupDialog">清理未使用</el-button>
        <el-button type="warning" plain @click="openReplaceDialog()">替换引用</el-button>
      </div>
    </section>

    <div class="upload-policy-panel">
      <strong>上传规范</strong>
      <span>{{ uploadPolicyText }} 首页、产品和新闻图片建议优先使用 WebP，单图尽量控制在 2MB 内；视频建议先压缩再上传。</span>
    </div>

    <div v-if="uploadProgress.active || uploadProgress.total" class="upload-progress-panel">
      <div>
        <strong>批量上传进度</strong>
        <span>{{ uploadProgress.success }} 成功 / {{ uploadProgress.failed }} 失败 / 共 {{ uploadProgress.total }} 个</span>
      </div>
      <el-progress :percentage="uploadProgressPercent" :status="uploadProgress.failed ? 'warning' : uploadProgressPercent === 100 ? 'success' : undefined" />
      <el-button v-if="uploadProgress.failed" size="small" type="warning" plain @click="fetchResources">刷新资源库</el-button>
    </div>

    <div v-if="lastUploadedResources.length" class="upload-result-panel">
      <div class="upload-result-head">
        <div>
          <strong>最近上传成功</strong>
          <span>素材已进入资源库，可直接复制地址、打开预览或定位到资源列表。</span>
        </div>
        <el-button size="small" @click="lastUploadedResources = []">收起</el-button>
      </div>
      <div class="upload-result-list">
        <article v-for="item in lastUploadedResources" :key="item.url">
          <div>
            <strong>{{ item.name }}</strong>
            <small>{{ item.url }}</small>
          </div>
          <div class="upload-result-actions">
            <el-button size="small" @click="copyUrl(item.url)">复制地址</el-button>
            <el-button size="small" color="#222" class="dark-btn" @click="openAsset(item.url)">前台预览</el-button>
            <el-button size="small" type="primary" plain @click="focusUploadedResource(item)">去资源库查看</el-button>
          </div>
        </article>
      </div>
    </div>

    <div class="table-tools">
      <div class="resource-summary">
        <el-tag effect="dark" type="success">已引用 {{ resourceSummary.usedCount || 0 }}</el-tag>
        <el-tag effect="dark">上传资源 {{ resourceSummary.uploadCount || 0 }}</el-tag>
        <el-tag effect="dark" type="warning">未使用 {{ resourceSummary.unusedCount || 0 }}</el-tag>
        <el-tag v-if="resourceSummary.optimizationCount" effect="dark" type="warning">需优化 {{ resourceSummary.optimizationCount }}</el-tag>
        <el-tag v-if="resourceSummary.pendingOptimizationCount" effect="dark" type="warning">待处理风险 {{ resourceSummary.pendingOptimizationCount }}</el-tag>
        <el-tag v-if="resourceSummary.heavyImageCount" effect="dark" type="danger">大图风险 {{ resourceSummary.heavyImageCount }}</el-tag>
        <el-tag v-if="resourceSummary.optimizedCount" effect="dark" type="success">已优化 {{ resourceSummary.optimizedCount }}</el-tag>
        <el-tag effect="dark" type="info">上传缓存 {{ resourceCachePolicyLabel }}</el-tag>
        <el-tag v-if="duplicateGroups.length" effect="dark" type="danger">疑似重复 {{ duplicateGroups.length }}</el-tag>
      </div>
      <div class="filter-row wrap">
        <el-input v-model="resourceKeyword" placeholder="搜索文件名或地址" class="w-320" clearable />
        <el-select v-model="resourceType" class="w-130">
          <el-option label="全部类型" value="all" />
          <el-option label="图片" value="image" />
          <el-option label="文件" value="file" />
        </el-select>
        <el-select v-model="resourceUse" class="w-130">
          <el-option label="全部引用" value="all" />
          <el-option label="已使用" value="used" />
          <el-option label="未使用" value="unused" />
        </el-select>
        <el-select v-model="resourceRisk" class="w-130">
          <el-option label="全部性能" value="all" />
          <el-option label="需优化" value="needs" />
          <el-option label="严重大图" value="danger" />
          <el-option label="已优化" value="optimized" />
          <el-option label="正常" value="ok" />
        </el-select>
        <el-button type="warning" plain @click="showRiskImages">筛出风险图片</el-button>
        <el-button type="danger" plain @click="showHeavyImages">只看严重大图</el-button>
      </div>
    </div>

    <el-tabs v-model="resourceTab" class="dark-tabs">
      <el-tab-pane label="前台引用清单" name="used">
        <div v-if="loading" class="empty-panel compact-empty">资源引用扫描中...</div>
        <template v-else>
          <div v-if="siteResources.length" class="mobile-resource-list">
            <article v-for="row in siteResources" :key="`${row.section}-${row.title}-${row.url}`" class="mobile-resource-card">
              <div class="mobile-resource-main">
                <span>{{ row.section || '页面资源' }}</span>
                <strong>{{ row.title || '未命名引用' }}</strong>
                <small>{{ row.url }}</small>
              </div>
              <div class="mobile-resource-meta">
                <el-tag size="small" effect="dark">{{ row.kind || 'asset' }}</el-tag>
              </div>
              <div class="mobile-resource-actions">
                <el-button size="small" color="#222" class="dark-btn" @click="openAsset(row.url)">查看</el-button>
                <el-button size="small" @click="copyUrl(row.url)">复制</el-button>
                <el-button size="small" type="warning" plain @click="openReplaceDialog(row.url)">替换</el-button>
              </div>
            </article>
          </div>
          <div v-else class="empty-panel compact-empty">暂无前台资源引用</div>
          <el-table :data="siteResources" border class="wide-table responsive-table" max-height="640" empty-text="暂无前台资源引用">
            <el-table-column prop="section" label="页面/模块" width="130" />
            <el-table-column prop="title" label="引用位置" min-width="220" show-overflow-tooltip />
            <el-table-column prop="kind" label="类型" width="90" />
            <el-table-column prop="url" label="资源地址" min-width="260" show-overflow-tooltip />
            <el-table-column label="操作" width="180" align="center">
              <template #default="{ row }">
                <el-button-group>
                  <el-button size="small" color="#222" class="dark-btn" @click="openAsset(row.url)">查看</el-button>
                  <el-button size="small" @click="copyUrl(row.url)">复制</el-button>
                  <el-button size="small" type="warning" plain @click="openReplaceDialog(row.url)">替换</el-button>
                </el-button-group>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </el-tab-pane>

      <el-tab-pane label="图片素材" name="images">
        <div v-if="loading" class="empty-panel compact-empty">图片素材加载中...</div>
        <div v-else-if="imageUploads.length" class="asset-grid">
          <article v-for="row in imageUploads" :key="row.url" class="asset-card">
            <div class="asset-preview"><img :src="mediaSrc(row.url)" :alt="row.name" /></div>
            <div class="asset-body">
              <div class="asset-header">
                <div class="asset-title" :title="row.name">{{ row.name }}</div>
                <el-tag size="small" :type="row.inUse ? 'success' : 'warning'" effect="dark">{{ row.inUse ? '已使用' : '未使用' }}</el-tag>
              </div>
              <div class="asset-meta">
                <span>{{ row.size }}</span>
                <span>{{ row.dimensions?.width || '-' }} x {{ row.dimensions?.height || '-' }}</span>
                <span>引用 {{ getReferenceCount(row.url) }} 处</span>
              </div>
              <div class="asset-risk" :class="`is-${row.riskLevel || 'ok'}`">
                <el-tag size="small" :type="riskTagType(row.riskLevel)" effect="dark">{{ riskLabel(row.riskLevel) }}</el-tag>
                <span>{{ row.suggestedAction || '当前图片体积和尺寸正常' }}</span>
              </div>
              <div v-if="row.optimizationState" class="asset-optimization-state" :class="`is-${row.optimizationState.status}`">
                <el-tag size="small" :type="row.optimizationState.status === 'optimized' ? 'success' : 'info'" effect="dark">
                  {{ row.optimizationState.status === 'optimized' ? '已优化' : '待处理' }}
                </el-tag>
                <span>{{ row.optimizationState.note || row.optimizationState.backupUrl || '已记录处理状态' }}</span>
              </div>
              <ul v-if="row.riskMessages?.length" class="asset-risk-list">
                <li v-for="message in row.riskMessages" :key="message">{{ message }}</li>
              </ul>
              <div class="asset-actions">
                <el-button size="small" color="#222" class="dark-btn" @click="openAsset(row.url)">查看</el-button>
                <el-button size="small" @click="copyUrl(row.url)">复制</el-button>
                <el-button size="small" type="warning" plain @click="openReplaceDialog(row.url)">替换</el-button>
                <el-button size="small" type="success" plain @click="openOptimizeDialog(row)">标记优化</el-button>
                <el-button size="small" type="danger" plain :disabled="row.inUse" @click="deleteAsset(row)">{{ row.inUse ? '引用中' : '删除' }}</el-button>
              </div>
            </div>
          </article>
        </div>
        <div v-else class="empty-panel">暂无符合筛选条件的图片素材。</div>
      </el-tab-pane>

      <el-tab-pane label="文件资源" name="files">
        <div v-if="loading" class="empty-panel compact-empty">文件资源加载中...</div>
        <template v-else>
          <div v-if="fileUploads.length" class="mobile-resource-list">
            <article v-for="row in fileUploads" :key="row.url" class="mobile-resource-card">
              <div class="mobile-resource-main">
                <span>{{ row.ext || 'file' }}</span>
                <strong>{{ row.name }}</strong>
                <small>{{ row.url }}</small>
              </div>
              <div class="mobile-resource-meta">
                <el-tag size="small" effect="dark">{{ row.size }}</el-tag>
                <el-tag size="small" :type="row.inUse ? 'success' : 'warning'" effect="dark">{{ row.inUse ? `引用 ${getReferenceCount(row.url)} 处` : '未使用' }}</el-tag>
              </div>
              <div class="mobile-resource-actions">
                <el-button size="small" color="#222" class="dark-btn" @click="openAsset(row.url)">查看</el-button>
                <el-button size="small" @click="copyUrl(row.url)">复制</el-button>
                <el-button size="small" type="warning" plain @click="openReplaceDialog(row.url)">替换</el-button>
                <el-button size="small" type="danger" plain :disabled="row.inUse" @click="deleteAsset(row)">{{ row.inUse ? '引用中' : '删除' }}</el-button>
              </div>
            </article>
          </div>
          <div v-else class="empty-panel compact-empty">暂无符合筛选条件的文件资源</div>
          <el-table :data="fileUploads" border class="wide-table responsive-table" max-height="640" empty-text="暂无符合筛选条件的文件资源">
            <el-table-column label="预览" width="100" align="center">
              <template #default="{ row }">
                <el-tag effect="dark">{{ row.ext || 'file' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="name" label="文件名" min-width="220" show-overflow-tooltip />
            <el-table-column prop="type" label="类型" width="90" />
            <el-table-column prop="size" label="大小" width="110" />
            <el-table-column label="状态" width="100" align="center">
              <template #default="{ row }"><el-tag :type="row.inUse ? 'success' : 'warning'" effect="dark">{{ row.inUse ? '已使用' : '未使用' }}</el-tag></template>
            </el-table-column>
            <el-table-column label="引用" width="90" align="center">
              <template #default="{ row }">{{ getReferenceCount(row.url) }} 处</template>
            </el-table-column>
            <el-table-column prop="url" label="URL" min-width="260" show-overflow-tooltip />
            <el-table-column label="操作" width="240" align="center">
              <template #default="{ row }">
                <el-button-group>
                  <el-button size="small" color="#222" class="dark-btn" @click="openAsset(row.url)">查看</el-button>
                  <el-button size="small" @click="copyUrl(row.url)">复制</el-button>
                  <el-button size="small" type="warning" plain @click="openReplaceDialog(row.url)">替换</el-button>
                  <el-button size="small" type="danger" plain :disabled="row.inUse" @click="deleteAsset(row)">{{ row.inUse ? '引用中' : '删除' }}</el-button>
                </el-button-group>
              </template>
            </el-table-column>
          </el-table>
        </template>
      </el-tab-pane>

      <el-tab-pane label="重复素材提醒" name="duplicates">
        <el-alert title="按文件大小和扩展名识别疑似重复素材，建议运营确认后再清理。" type="warning" :closable="false" show-icon class="mb-16" />
        <el-table :data="duplicateGroups" border class="wide-table" empty-text="暂无疑似重复素材">
          <el-table-column label="大小/类型" width="140">
            <template #default="{ row }">{{ row.key }}</template>
          </el-table-column>
          <el-table-column label="文件" min-width="420">
            <template #default="{ row }">
              <div class="duplicate-list">
                <button v-for="item in row.items" :key="item.url" type="button" @click="copyUrl(item.url)">{{ item.name }}</button>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="replaceDialogOpen" title="一键替换资源引用" width="640px" class="dark-dialog" append-to-body destroy-on-close>
      <el-alert
        title="替换会同步更新前台正在引用的产品、新闻、CMS、艺术家和全局配置资源地址。"
        type="warning"
        :closable="false"
        show-icon
        class="mb-16"
      />
      <el-form ref="replaceFormRef" :model="replaceForm" :rules="replaceRules" label-width="96px">
        <el-form-item label="旧 URL" prop="oldUrl">
          <el-input v-model="replaceForm.oldUrl" placeholder="/uploads/old-image.webp" />
        </el-form-item>
        <el-form-item label="新 URL" prop="newUrl">
          <el-input v-model="replaceForm.newUrl" placeholder="/uploads/new-image.webp" />
        </el-form-item>
        <el-form-item label="命中位置">
          <div class="replace-hit-list">
            <div v-if="replaceHits.length === 0">当前旧 URL 暂未命中前台引用。</div>
            <div v-for="item in replaceHits" :key="`${item.section}-${item.title}`">
              <strong>{{ item.section }}</strong>
              <span>{{ item.title }}</span>
            </div>
          </div>
        </el-form-item>
      </el-form>

      <div class="risk-summary">
        <strong>影响范围</strong>
        <span>当前命中 {{ replaceHits.length }} 处前台资源引用；提交后会同步更新产品、新闻、CMS、艺术家和全局配置中的匹配 URL。</span>
      </div>

      <div v-if="replaceResult.length" class="replace-result">
        <strong>本次已更新</strong>
        <span v-for="item in replaceResult" :key="item.label">{{ item.label }} {{ item.count }} 处</span>
      </div>

      <template #footer>
        <el-button @click="replaceDialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="replaceLoading" @click="submitReplace">确认替换</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="cleanupDialogOpen" title="清理未使用资源" width="720px" class="dark-dialog" append-to-body destroy-on-close>
      <el-alert title="清理前已按当前引用清单过滤，仅会删除未被前台内容引用的本地上传资源。" type="warning" :closable="false" show-icon class="mb-16" />
      <div class="risk-summary">
        <strong>影响范围</strong>
        <span>当前将清理 {{ cleanupPreviewTargets.length }} 个未使用资源。删除后文件会从服务器 uploads 目录移除，无法从资源库恢复；已被产品、新闻、CMS、艺术家或全局配置引用的资源不会进入本列表。</span>
      </div>
      <div class="cleanup-filter-summary">
        <span>当前筛选：{{ cleanupFilterSummary }}</span>
        <span>图片 {{ cleanupImageCount }} 个 / 文件 {{ cleanupFileCount }} 个</span>
        <span>确认口令：{{ cleanupConfirmPhrase }}</span>
      </div>
      <el-table :data="cleanupPreviewTargets" border max-height="360" class="wide-table">
        <el-table-column prop="name" label="文件名" min-width="220" show-overflow-tooltip />
        <el-table-column prop="type" label="类型" width="90" />
        <el-table-column prop="size" label="大小" width="110" />
        <el-table-column prop="url" label="URL" min-width="260" show-overflow-tooltip />
      </el-table>
      <el-input
        v-model="cleanupConfirmInput"
        class="cleanup-confirm-input"
        :placeholder="`请输入“${cleanupConfirmPhrase}”以确认本次清理`"
        clearable
      />
      <el-checkbox v-model="cleanupConfirmed" class="danger-confirm-checkbox">
        我已确认以上资源未被官网内容引用，并了解删除后无法从资源库恢复。
      </el-checkbox>
      <template #footer>
        <el-button @click="cleanupDialogOpen = false">取消</el-button>
        <el-button type="danger" :loading="cleanupLoading" :disabled="!cleanupPreviewTargets.length || !cleanupConfirmed || cleanupConfirmInput !== cleanupConfirmPhrase" @click="submitCleanupUnused">确认清理</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="optimizeDialogOpen" title="记录图片优化状态" width="560px" class="dark-dialog" append-to-body destroy-on-close>
      <el-alert title="这里只记录运营处理状态，不会自动压缩、删除或替换图片文件。" type="info" :closable="false" show-icon class="mb-16" />
      <el-form label-width="112px">
        <el-form-item label="资源地址">
          <el-input v-model="optimizeForm.url" disabled />
        </el-form-item>
        <el-form-item label="处理状态">
          <el-select v-model="optimizeForm.status">
            <el-option label="已优化" value="optimized" />
            <el-option label="待处理" value="pending" />
          </el-select>
        </el-form-item>
        <el-form-item label="原图备份位置">
          <el-input v-model="optimizeForm.backupUrl" placeholder="如 backups/originals/xxx.jpg，可选" />
        </el-form-item>
        <el-form-item label="处理备注">
          <el-input v-model="optimizeForm.note" type="textarea" :rows="3" maxlength="500" show-word-limit placeholder="如已转 WebP、已裁切为首页尺寸、保留原图备份等" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="optimizeDialogOpen = false">取消</el-button>
        <el-button type="primary" :loading="optimizeLoading" @click="submitOptimizationState">保存记录</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { BASE, adminUploadHeaders, api, extractErrorMessage, mediaSrc, sensitiveConfirmation } from '../lib/api'
import { bytesFromSizeLabel } from '../lib/format'
import { UPLOAD_ACCEPT, uploadPolicyText, validateUploadFile } from '../lib/uploadPolicy'

const resourceTab = ref('used')
const siteResources = ref([])
const uploadedResources = ref([])
const loading = ref(false)
const resourceKeyword = ref('')
const resourceType = ref('all')
const resourceUse = ref('all')
const resourceRisk = ref('all')
const resourceSummary = reactive({
  usedCount: 0,
  uploadCount: 0,
  unusedCount: 0,
  optimizationCount: 0,
  pendingOptimizationCount: 0,
  heavyImageCount: 0,
  optimizedCount: 0,
  cachePolicy: null
})
const replaceDialogOpen = ref(false)
const replaceLoading = ref(false)
const cleanupDialogOpen = ref(false)
const cleanupLoading = ref(false)
const cleanupConfirmed = ref(false)
const cleanupConfirmInput = ref('')
const cleanupPreviewTargets = ref([])
const optimizeDialogOpen = ref(false)
const optimizeLoading = ref(false)
const replaceFormRef = ref(null)
const replaceResult = ref([])
const replaceForm = reactive({ oldUrl: '', newUrl: '' })
const optimizeForm = reactive({ url: '', status: 'optimized', backupUrl: '', note: '' })
const resourceStateKey = 'aural-resource-view-state'
const stateReady = ref(false)
const uploadProgress = reactive({ active: false, total: 0, success: 0, failed: 0 })
const lastUploadedResources = ref([])

const assetUrlValidator = (rule, value, callback) => {
  const url = String(value || '').trim()
  if (!url) return callback(new Error('请输入资源地址'))
  if (!/^(https?:\/\/|\/uploads\/)/i.test(url)) return callback(new Error('资源地址需以 http(s) 或 /uploads/ 开头'))
  return callback()
}

const replaceRules = {
  oldUrl: [{ validator: assetUrlValidator, trigger: 'blur' }],
  newUrl: [{ validator: assetUrlValidator, trigger: 'blur' }]
}

const matchesRiskFilter = (item) => {
  const level = item.riskLevel || item.optimization?.riskLevel || 'ok'
  if (resourceRisk.value === 'all') return true
  if (resourceRisk.value === 'needs') return level !== 'ok' && item.optimizationState?.status !== 'optimized'
  if (resourceRisk.value === 'optimized') return item.optimizationState?.status === 'optimized'
  return level === resourceRisk.value
}

const filteredUploads = computed(() => {
  const keyword = resourceKeyword.value.trim().toLowerCase()
  return uploadedResources.value.filter((item) => {
    const matchKeyword = !keyword || [item.name, item.url, item.ext].filter(Boolean).some((field) => String(field).toLowerCase().includes(keyword))
    const matchType = resourceType.value === 'all' || item.type === resourceType.value
    const matchUse = resourceUse.value === 'all' || (resourceUse.value === 'used' ? item.inUse : !item.inUse)
    return matchKeyword && matchType && matchUse && matchesRiskFilter(item)
  })
})

const imageUploads = computed(() => filteredUploads.value.filter((item) => item.type === 'image'))
const fileUploads = computed(() => filteredUploads.value.filter((item) => item.type !== 'image'))
const unusedUploads = computed(() => uploadedResources.value.filter((item) => !item.inUse))
const resourceOpsCards = computed(() => [
  { label: '已引用', value: resourceSummary.usedCount || siteResources.value.length, desc: '前台正在使用的素材', tone: 'success' },
  { label: '未使用', value: resourceSummary.unusedCount || unusedUploads.value.length, desc: '可复核后清理', tone: unusedUploads.value.length ? 'warning' : 'success' },
  { label: '大图风险', value: resourceSummary.heavyImageCount || 0, desc: '建议压缩或替换', tone: resourceSummary.heavyImageCount ? 'danger' : 'success' },
  { label: '疑似重复', value: duplicateGroups.value.length, desc: '同类型同体积素材', tone: duplicateGroups.value.length ? 'warning' : 'success' }
])
const cleanupTargets = computed(() => filteredUploads.value.filter((item) => !item.inUse))
const cleanupImageCount = computed(() => cleanupPreviewTargets.value.filter((item) => item.type === 'image').length)
const cleanupFileCount = computed(() => cleanupPreviewTargets.value.filter((item) => item.type !== 'image').length)
const cleanupConfirmPhrase = computed(() => `确认清理${cleanupPreviewTargets.value.length}个`)
const resourceCachePolicyLabel = computed(() => {
  const seconds = Number(resourceSummary.cachePolicy?.maxAgeSeconds || 0)
  if (!seconds) return '已启用'
  const days = Math.round(seconds / 86400)
  return days >= 365 ? '1 年' : `${Math.max(1, days)} 天`
})
const cleanupFilterSummary = computed(() => {
  const typeMap = { all: '全部类型', image: '图片', file: '文件' }
  const riskMap = { all: '全部性能', needs: '需优化', danger: '严重大图', optimized: '已优化', ok: '正常' }
  const keyword = resourceKeyword.value.trim()
  return [
    typeMap[resourceType.value] || '全部类型',
    '未使用',
    riskMap[resourceRisk.value] || '全部性能',
    keyword ? `关键词“${keyword}”` : '无关键词'
  ].join(' / ')
})
const resetEmptyUnusedFilter = () => {
  if (resourceUse.value === 'unused' && Number(resourceSummary.unusedCount || 0) === 0) {
    resourceUse.value = 'all'
  }
}
const uploadProgressPercent = computed(() => {
  if (!uploadProgress.total) return 0
  return Math.round(((uploadProgress.success + uploadProgress.failed) / uploadProgress.total) * 100)
})

const duplicateGroups = computed(() => {
  const groups = new Map()
  uploadedResources.value.forEach((item) => {
    const key = `${item.ext || 'file'} / ${Math.round(bytesFromSizeLabel(item.size) / 1024)}KB`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  })
  return [...groups.entries()].filter(([, items]) => items.length > 1).map(([key, items]) => ({ key, items }))
})

const replaceHits = computed(() => siteResources.value.filter((item) => item.url === replaceForm.oldUrl))

const getReferenceCount = (url) => siteResources.value.filter((item) => item.url === url).length

const riskLabel = (level = 'ok') => {
  if (level === 'danger') return '严重大图'
  if (level === 'warning') return '建议优化'
  return '正常'
}

const riskTagType = (level = 'ok') => {
  if (level === 'danger') return 'danger'
  if (level === 'warning') return 'warning'
  return 'success'
}

const fetchResources = async () => {
  loading.value = true
  try {
    const res = await api.get('/api/admin/resources')
    siteResources.value = res.data?.used || []
    uploadedResources.value = res.data?.uploads || []
    Object.assign(resourceSummary, {
      usedCount: 0,
      uploadCount: 0,
      unusedCount: 0,
      optimizationCount: 0,
      pendingOptimizationCount: 0,
      heavyImageCount: 0,
      optimizedCount: 0,
      cachePolicy: null,
      ...(res.data?.summary || {})
    })
    resetEmptyUnusedFilter()
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, '资源库加载失败'))
  } finally {
    loading.value = false
  }
}

const openAsset = (url) => {
  if (!url) return
  window.open(mediaSrc(url), '_blank', 'noopener,noreferrer')
}

const copyUrl = async (url) => {
  await navigator.clipboard.writeText(url)
  ElMessage.success('资源地址已复制')
}

const openReplaceDialog = (url = '') => {
  replaceResult.value = []
  Object.assign(replaceForm, { oldUrl: url, newUrl: '' })
  replaceDialogOpen.value = true
}

const openOptimizeDialog = (row) => {
  Object.assign(optimizeForm, {
    url: row.url,
    status: row.optimizationState?.status || 'optimized',
    backupUrl: row.optimizationState?.backupUrl || '',
    note: row.optimizationState?.note || ''
  })
  optimizeDialogOpen.value = true
}

const submitOptimizationState = async () => {
  if (!optimizeForm.url) return
  optimizeLoading.value = true
  try {
    await api.post('/api/admin/resources/optimization-status', { ...optimizeForm })
    ElMessage.success('图片优化状态已记录')
    optimizeDialogOpen.value = false
    await fetchResources()
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, '图片优化状态保存失败'))
  } finally {
    optimizeLoading.value = false
  }
}

const submitReplace = async () => {
  try {
    await replaceFormRef.value?.validate()
    if (replaceForm.oldUrl === replaceForm.newUrl) {
      ElMessage.warning('新旧资源地址不能相同')
      return
    }
    await ElMessageBox.confirm(
      `确认将 ${replaceForm.oldUrl} 替换为 ${replaceForm.newUrl}？当前前台引用清单命中 ${replaceHits.value.length} 处，替换后会直接影响对应页面素材展示。`,
      '批量替换资源确认',
      { type: 'warning', confirmButtonText: '确认替换', cancelButtonText: '取消' }
    )
    replaceLoading.value = true
    const res = await api.post('/api/admin/resources/replace', { ...replaceForm, ...sensitiveConfirmation() })
    replaceResult.value = res.data?.changed || []
    await fetchResources()
    ElMessage.success(`已替换 ${res.data?.total || 0} 处引用`)
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(error?.response?.data?.error?.message || '资源替换失败，请检查 URL')
  } finally {
    replaceLoading.value = false
  }
}

const deleteAsset = async (row) => {
  const hits = siteResources.value.filter((item) => item.url === row.url)
  if (hits.length) {
    ElMessage.warning(`该资源仍被 ${hits.length} 处引用，不能删除`)
    return
  }
  try {
    await ElMessageBox.confirm(`确认删除未使用资源 ${row.name}？此操作会永久删除上传文件 ${row.url}，删除后无法从资源库恢复。`, '敏感操作确认', { type: 'warning' })
    await api.delete('/api/admin/resources', { data: { url: row.url, ...sensitiveConfirmation() } })
    ElMessage.success('资源已删除')
    fetchResources()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(extractErrorMessage(error, '资源删除失败'))
  }
}

const resetUploadProgressIfNeeded = () => {
  if (!uploadProgress.active && uploadProgress.total && uploadProgress.success + uploadProgress.failed >= uploadProgress.total) {
    Object.assign(uploadProgress, { active: false, total: 0, success: 0, failed: 0 })
    lastUploadedResources.value = []
  }
}

const uploadedResourceType = (url = '') => {
  return /\.(jpe?g|png|webp|gif|svg)$/i.test(url) ? 'image' : 'file'
}

const beforeBatchUpload = (file) => {
  const result = validateUploadFile(file)
  if (!result.ok) {
    ElMessage.warning(result.message)
    return false
  }
  resetUploadProgressIfNeeded()
  uploadProgress.active = true
  uploadProgress.total += 1
  return true
}

const handleBatchUploadSuccess = (res, file) => {
  uploadProgress.success += 1
  if (res?.url) {
    lastUploadedResources.value = [
      {
        name: file?.name || res.url.split('/').pop() || 'uploaded-resource',
        url: res.url,
        type: uploadedResourceType(res.url)
      },
      ...lastUploadedResources.value.filter((item) => item.url !== res.url)
    ].slice(0, 6)
  }
  if (uploadProgress.success + uploadProgress.failed >= uploadProgress.total) {
    uploadProgress.active = false
    ElMessage.success(`批量上传完成，成功 ${uploadProgress.success} 个，失败 ${uploadProgress.failed} 个`)
    fetchResources()
  }
}

const handleBatchUploadError = (error) => {
  uploadProgress.failed += 1
  ElMessage.error(extractErrorMessage(error, '资源上传失败'))
  if (uploadProgress.success + uploadProgress.failed >= uploadProgress.total) {
    uploadProgress.active = false
    fetchResources()
  }
}

const focusUploadedResource = (item) => {
  resourceTab.value = item.type === 'image' ? 'images' : 'files'
  resourceType.value = item.type === 'image' ? 'image' : 'file'
  resourceUse.value = 'all'
  resourceRisk.value = 'all'
  resourceKeyword.value = item.url.split('/').pop() || item.url
}

const openCleanupDialog = () => {
  resourceUse.value = 'unused'
  cleanupConfirmed.value = false
  cleanupConfirmInput.value = ''
  cleanupPreviewTargets.value = filteredUploads.value.filter((item) => !item.inUse)
  cleanupDialogOpen.value = true
}

const showRiskImages = () => {
  resourceTab.value = 'images'
  resourceType.value = 'image'
  resourceUse.value = 'all'
  resourceRisk.value = 'needs'
}

const showHeavyImages = () => {
  resourceTab.value = 'images'
  resourceType.value = 'image'
  resourceUse.value = 'all'
  resourceRisk.value = 'danger'
}

const submitCleanupUnused = async () => {
  try {
    if (!cleanupConfirmed.value) {
      ElMessage.warning('请先勾选清理确认项')
      return
    }
    if (cleanupConfirmInput.value !== cleanupConfirmPhrase.value) {
      ElMessage.warning('请输入正确的清理确认口令')
      return
    }
    await ElMessageBox.confirm(`确认删除当前预览列表中的 ${cleanupPreviewTargets.value.length} 个未使用资源？此操作会永久删除服务器文件。`, '批量清理确认', { type: 'warning' })
    cleanupLoading.value = true
    let success = 0
    let failed = 0
    for (const row of cleanupPreviewTargets.value) {
      try {
        await api.delete('/api/admin/resources', { data: { url: row.url, ...sensitiveConfirmation() } })
        success += 1
      } catch {
        failed += 1
      }
    }
    cleanupDialogOpen.value = false
    await fetchResources()
    resourceKeyword.value = ''
    resourceUse.value = 'all'
    ElMessage.success(`清理完成：成功 ${success} 个，失败 ${failed} 个`)
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(extractErrorMessage(error, '批量清理失败'))
  } finally {
    cleanupLoading.value = false
  }
}

const handlePageAction = (event) => {
  if (event.detail === 'resources:refresh') fetchResources()
}

const loadViewState = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(resourceStateKey) || '{}')
    if (saved.resourceTab) resourceTab.value = saved.resourceTab
    if (saved.resourceKeyword) resourceKeyword.value = saved.resourceKeyword
    if (saved.resourceType) resourceType.value = saved.resourceType
    if (saved.resourceUse) resourceUse.value = saved.resourceUse
    if (saved.resourceRisk) resourceRisk.value = saved.resourceRisk
  } catch {}
}

watch([resourceTab, resourceKeyword, resourceType, resourceUse, resourceRisk], () => {
  if (!stateReady.value) return
  window.localStorage.setItem(resourceStateKey, JSON.stringify({
    resourceTab: resourceTab.value,
    resourceKeyword: resourceKeyword.value,
    resourceType: resourceType.value,
    resourceUse: resourceUse.value,
    resourceRisk: resourceRisk.value
  }))
})

onMounted(() => {
  loadViewState()
  stateReady.value = true
  window.addEventListener('admin-page-action', handlePageAction)
  fetchResources()
})

onBeforeUnmount(() => window.removeEventListener('admin-page-action', handlePageAction))
</script>
