<template>
  <div>
    <section class="business-command-panel products-command-panel">
      <div class="business-command-main">
        <span class="business-kicker">产品运营</span>
        <h2>先保证官网产品可售、可信、可预览</h2>
        <p>这里管理前台产品详情、价格库存、发布状态和内容完整度。日常优先处理草稿、资料不完整和低库存产品。</p>
        <div class="business-command-actions">
          <el-button type="primary" color="#fff" class="light-btn" @click="openAddProduct">上架新乐器</el-button>
          <el-button color="#222" class="dark-btn" @click="openProductAudit">内容体检</el-button>
        </div>
      </div>
      <div class="business-task-grid">
        <article v-for="item in productOpsCards" :key="item.label" class="business-task-card" :class="item.tone">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
          <small>{{ item.desc }}</small>
        </article>
      </div>
    </section>

    <div class="table-tools enterprise-table-tools">
      <div class="filter-row wrap">
        <el-input v-model="searchQuery" placeholder="搜索乐器名称、参数或场景..." :prefix-icon="Search" class="w-320" @input="handleProductSearchInput" clearable />
        <el-select v-model="productStatusFilter" placeholder="发布状态" class="w-140" @change="handleProductFilterChange">
          <el-option label="全部状态" value="all" />
          <el-option v-for="item in publishStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-button v-if="activeProductFilters" plain @click="showProductAll">返回全部</el-button>
      </div>
      <div class="filter-row">
        <el-button color="#222" class="dark-btn" @click="openProductAudit">内容体检</el-button>
        <el-button type="primary" color="#fff" class="light-btn" @click="openAddProduct">+ 上架乐器</el-button>
      </div>
    </div>

    <section class="data-quality-panel product-quality-panel">
      <div class="data-quality-heading">
        <span class="business-kicker">发布前数据体检</span>
        <h3>{{ productQualityIssues.length ? `发现 ${productQualityIssues.length} 个产品需要复核` : '当前筛选范围暂无待复核产品' }}</h3>
        <p>{{ activeProductFilters && !products.length ? '当前筛选条件下没有产品；可点击“返回全部”查看完整产品列表。' : '这些提示只基于当前列表数据做运营提醒，不会自动修改数据库；建议先编辑完善，再预览前台产品页。' }}</p>
      </div>
      <div v-if="productQualityIssues.length" class="data-quality-list">
        <article v-for="item in productQualityIssues" :key="item.key" class="data-quality-card" :class="item.tone">
          <div>
            <strong>{{ item.name }}</strong>
            <small>{{ item.path }}</small>
          </div>
          <p>{{ item.reason }}</p>
          <el-button size="small" color="#222" class="dark-btn" @click="openEditProduct(item.row)">去完善</el-button>
        </article>
      </div>
      <div v-else class="empty-panel compact-empty">
        {{ activeProductFilters ? '当前筛选范围没有发现问题；如需查看全部产品，请返回全部。' : '当前产品列表没有发现明显的发布前风险。' }}
      </div>
    </section>

    <el-alert v-if="productError" :title="productError" description="请检查网络或后台 API 状态后重试。" type="error" show-icon :closable="false" class="mb-16" />

    <div class="mobile-admin-list product-mobile-list" v-loading="productsLoading">
      <article v-for="row in products" :key="row.id" class="mobile-admin-card product-mobile-card">
        <div class="mobile-list-media">
          <el-image
            v-if="row.attributes.image || row.attributes.imageUrl"
            :src="mediaSrc(row.attributes.image?.data?.attributes?.url || row.attributes.imageUrl)"
            fit="cover"
          />
          <span v-else>无图</span>
        </div>
        <div class="mobile-list-body">
          <div class="mobile-list-tags">
            <el-tag size="small" :type="publishStatusMeta(row.attributes.status).type" effect="dark">{{ publishStatusMeta(row.attributes.status).label }}</el-tag>
            <el-tag size="small" :type="productQualityFromAttributes(row.attributes).type" effect="dark">{{ productQualityFromAttributes(row.attributes).score }}%</el-tag>
          </div>
          <strong>{{ row.attributes.title }}</strong>
          <small>{{ row.attributes.series || row.attributes.slug || '未设置系列' }}</small>
          <div class="mobile-list-meta">
            <span>¥ {{ (row.attributes.price || 0).toFixed(2) }}</span>
            <span>库存 {{ row.attributes.quantity || 0 }}</span>
          </div>
          <div class="mobile-list-actions">
            <el-button :icon="DocumentCopy" size="small" @click="openPreview(`/products/${row.attributes.slug || row.id}`)" color="#111" class="dark-btn">预览</el-button>
            <el-button :icon="Edit" size="small" @click="openEditProduct(row)" color="#222" class="dark-btn">编辑</el-button>
            <el-button :icon="Clock" size="small" @click="openVersionDrawer(row)">版本</el-button>
            <el-button :icon="Delete" size="small" type="danger" @click="handleDelete(row.id)">删除</el-button>
          </div>
        </div>
      </article>
      <div v-if="!productsLoading && !products.length" class="empty-panel compact-empty">暂无产品内容</div>
    </div>

    <el-table :data="products" border class="wide-table mobile-hidden-table" v-loading="productsLoading" empty-text="暂无产品内容">
      <el-table-column label="主图" width="90" align="center">
        <template #default="{ row }"><el-image :src="mediaSrc(row.attributes.image?.data?.attributes?.url)" v-if="row.attributes.image" class="t-img" /></template>
      </el-table-column>
      <el-table-column prop="attributes.title" label="乐器名称" min-width="170" />
      <el-table-column prop="attributes.slug" label="URL 后缀" min-width="150" show-overflow-tooltip />
      <el-table-column prop="attributes.series" label="所属系列" width="130" />
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }"><el-tag :type="publishStatusMeta(row.attributes.status).type" effect="dark">{{ publishStatusMeta(row.attributes.status).label }}</el-tag></template>
      </el-table-column>
      <el-table-column label="完整度" width="110" align="center">
        <template #default="{ row }">
          <el-tag :type="productQualityFromAttributes(row.attributes).type" effect="dark">{{ productQualityFromAttributes(row.attributes).score }}%</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="零售价" width="120">
        <template #default="{ row }">¥ {{ (row.attributes.price || 0).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="库存" width="80" align="center">
        <template #default="{ row }">{{ row.attributes.quantity || 0 }}</template>
      </el-table-column>
      <el-table-column label="管理" width="210" align="center">
        <template #default="{ row }">
          <div class="row-action-group">
            <el-button :icon="DocumentCopy" size="small" title="预览前台产品页" aria-label="预览前台产品页" @click="openPreview(`/products/${row.attributes.slug || row.id}`)" color="#111" class="dark-btn">预览</el-button>
            <el-button :icon="Edit" size="small" title="编辑产品内容" aria-label="编辑产品内容" @click="openEditProduct(row)" color="#222" class="dark-btn">编辑</el-button>
            <el-dropdown trigger="click">
              <el-button size="small" title="更多产品操作" aria-label="更多产品操作">更多</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="openVersionDrawer(row)">查看版本历史</el-dropdown-item>
                  <el-dropdown-item class="danger-dropdown-item" @click="handleDelete(row.id)">删除产品</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </template>
      </el-table-column>
    </el-table>

    <div class="table-pagination">
      <span class="pagination-total">共 {{ productTotal }} 个产品</span>
      <el-pagination
        v-model:current-page="productPage"
        v-model:page-size="productPageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="productTotal"
        layout="sizes, prev, pager, next"
        background
        @size-change="handleProductPageSizeChange"
        @current-change="handleProductPageChange"
      />
    </div>

    <el-dialog v-model="pDiag" :title="isEdit ? '编辑乐器' : '上架新乐器'" width="860px" class="dark-dialog" append-to-body destroy-on-close :before-close="requestCloseProductDialog">
      <el-alert :title="productQuality.title" :type="productQuality.type" :description="productQuality.description" show-icon :closable="false" class="mb-16" />
      <el-form ref="productFormRef" :model="pForm" :rules="productRules" label-width="96px">
        <section class="form-section is-emphasis">
          <div class="form-section-title">
            <strong>基础信息</strong>
            <span>先填名称、主图、分类和前台 URL 后缀，决定用户在官网如何识别这款乐器。</span>
          </div>
          <el-row :gutter="20">
            <el-col :span="8">
              <image-upload v-model="pForm.imageUrl" height="188px" />
              <div class="main-image-tools">
                <el-button size="small" :disabled="!pForm.imageUrl" @click="addMainImageToGallery">主图加入详情图</el-button>
                <el-button size="small" :disabled="!pForm.imageUrl" @click="pForm.imageUrl = ''">清除主图</el-button>
              </div>
            </el-col>
            <el-col :span="16">
              <el-form-item label="名称" prop="title"><el-input v-model="pForm.title" @blur="ensureSlug" /></el-form-item>
              <el-form-item label="后缀" prop="slug">
                <el-input v-model="pForm.slug" :disabled="isEdit">
                  <template #append><el-button @click="generateSlug">生成</el-button></template>
                </el-input>
              </el-form-item>
              <el-form-item label="系列"><el-input v-model="pForm.series" /></el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="20">
            <el-col :span="12"><el-form-item label="中文分类" prop="categoryName"><el-input v-model="pForm.categoryName" /></el-form-item></el-col>
            <el-col :span="12">
              <el-form-item label="系统归类" prop="type">
                <el-select v-model="pForm.type" class="full" @change="applyTypeTemplate">
                  <el-option label="钢琴" value="piano" />
                  <el-option label="吉他" value="guitar" />
                  <el-option label="电子键盘" value="synth" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
        </section>

        <section class="form-section">
          <div class="form-section-title">
            <strong>价格与发布</strong>
            <span>控制库存、售价、发布状态和首页推荐，建议未完善前先保存为草稿。</span>
          </div>
          <el-row :gutter="20">
            <el-col :span="8"><el-form-item label="库存量" prop="quantity"><el-input-number v-model="pForm.quantity" :min="0" class="full" /></el-form-item></el-col>
            <el-col :span="8"><el-form-item label="零售价" prop="price"><el-input v-model="pForm.price" /></el-form-item></el-col>
            <el-col :span="8"><el-form-item label="发布状态"><el-select v-model="pForm.status" class="full"><el-option v-for="item in publishStatusOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item></el-col>
          </el-row>

          <el-row :gutter="20">
            <el-col :span="12"><el-form-item label="首页推荐"><el-switch v-model="pForm.isFeatured" /></el-form-item></el-col>
            <el-col :span="12">
              <el-form-item label="前台预览">
                <el-button color="#222" class="dark-btn" @click="previewCurrentProduct">打开详情页</el-button>
              </el-form-item>
            </el-col>
          </el-row>
        </section>

        <section class="form-section">
          <div class="form-section-title">
            <strong>SEO 与简介</strong>
            <span>简介会出现在搜索摘要、分享卡片和部分产品列表中，建议用简短自然的卖点描述。</span>
          </div>
          <el-form-item label="SEO 预览">
            <div class="seo-preview">
              <strong>{{ pForm.title || '产品标题' }} | 胡氏管乐</strong>
              <span>/products/{{ pForm.slug || 'product-slug' }}</span>
              <p>{{ pForm.description || '产品简介会显示在搜索摘要与分享卡片中。' }}</p>
            </div>
          </el-form-item>

          <el-form-item label="简介"><el-input v-model="pForm.description" type="textarea" :rows="3" placeholder="可先简短填写，后续再完善产品卖点、适用空间与音色描述。" /></el-form-item>
        </section>

        <section class="form-section">
          <div class="form-section-title">
            <strong>媒体资源</strong>
            <span>详情图会按当前顺序展示在产品详情页，可批量上传、拖拽排序或替换单张图片。</span>
          </div>
          <el-form-item label="详情图集">
            <div class="gallery-manager">
              <div class="gallery-actions">
                <el-upload
                  :action="`${BASE}/api/upload`"
                  :headers="adminUploadHeaders()"
                  accept="image/*"
                  multiple
                  :show-file-list="false"
                  :before-upload="beforeGalleryUpload"
                  :on-success="handleGalleryUploadSuccess"
                  :on-error="handleGalleryUploadError"
                >
                  <el-button type="primary" plain :icon="Upload">批量上传详情图</el-button>
                </el-upload>
                <el-input v-model="galleryUrlInput" placeholder="也可以粘贴图片地址，例如 /uploads/example.jpg" clearable @keyup.enter="addGalleryUrl">
                  <template #append><el-button @click="addGalleryUrl">添加</el-button></template>
                </el-input>
              </div>
              <div class="gallery-toolbar">
                <span>已添加 {{ galleryPreview.length }} 张，支持拖拽排序。</span>
                <div>
                  <el-button size="small" :disabled="!pForm.imageUrl" @click="addMainImageToGallery">加入主图</el-button>
                  <el-button size="small" :disabled="!galleryPreview.length" @click="clearGallery">清空图集</el-button>
                </div>
              </div>
              <p class="field-hint">图片会按当前顺序展示在产品详情页。{{ imageUploadHint }} 日常运营可直接批量上传，也可拖动图片调整顺序。</p>
              <div v-if="galleryPreview.length" class="gallery-grid">
                <div
                  v-for="(image, index) in galleryPreview"
                  :key="`${image}-${index}`"
                  class="gallery-card"
                  :class="{ dragging: galleryDragIndex === index }"
                  draggable="true"
                  @dragstart="handleGalleryDragStart(index)"
                  @dragover.prevent
                  @dragenter.prevent
                  @drop.prevent="handleGalleryDrop(index)"
                  @dragend="handleGalleryDragEnd"
                >
                  <el-image :src="mediaSrc(image)" :preview-src-list="[mediaSrc(image)]" fit="cover" preview-teleported />
                  <span class="gallery-index">{{ index + 1 }}</span>
                  <span class="gallery-drag-handle">拖拽排序</span>
                  <div class="gallery-card-actions">
                    <el-button size="small" :disabled="pForm.imageUrl === image" @click="setMainImageFromGallery(image)">设主图</el-button>
                    <el-upload
                      :action="`${BASE}/api/upload`"
                      :headers="adminUploadHeaders()"
                      accept="image/*"
                      :show-file-list="false"
                      :before-upload="beforeGalleryUpload"
                      :on-success="(res) => handleGalleryReplaceSuccess(res, index)"
                      :on-error="handleGalleryUploadError"
                    >
                      <el-button size="small">替换</el-button>
                    </el-upload>
                    <el-button size="small" type="danger" @click="removeGallery(index)">删除</el-button>
                  </div>
                </div>
              </div>
              <div v-else class="gallery-empty">暂无详情图，保存后也可以稍后补充。</div>
            </div>
          </el-form-item>
        </section>

        <section class="form-section">
          <div class="form-section-title">
            <strong>产品详情</strong>
            <span>参数、特性、适用场景和保修说明会影响客户选型，建议发布前尽量补齐。</span>
          </div>
          <el-form-item label="参数" prop="specsText"><el-input v-model="pForm.specsText" type="textarea" :rows="5" placeholder="每行一项，格式：参数名：参数值" /></el-form-item>
          <el-form-item label="核心特性" prop="featuresText"><el-input v-model="pForm.featuresText" type="textarea" :rows="4" placeholder="每行一条卖点" /></el-form-item>
          <el-row :gutter="20">
            <el-col :span="12"><el-form-item label="适用场景" prop="scenesText"><el-input v-model="pForm.scenesText" type="textarea" :rows="3" placeholder="每行一个场景" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="保修说明" prop="warranty"><el-input v-model="pForm.warranty" type="textarea" :rows="3" /></el-form-item></el-col>
          </el-row>
        </section>
      </el-form>
      <template #footer>
        <div class="dialog-footer-actions">
          <span class="dialog-footer-hint">{{ productChangeHint }}</span>
          <div class="dialog-footer-buttons">
            <el-button @click="requestCloseProductDialog()">取消</el-button>
            <el-button @click="submitProduct('draft')">保存草稿</el-button>
            <el-button color="#222" class="dark-btn" @click="submitProduct">保存</el-button>
            <el-button type="primary" @click="submitProduct('published')">保存并发布</el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="productAuditDiag" title="产品内容批量体检" width="820px" class="dark-dialog" append-to-body destroy-on-close>
      <el-alert :title="`发现 ${productAuditMissingRows.length} 个产品仍有内容缺口`" type="warning" :closable="false" show-icon class="mb-16" />
      <el-table :data="productAuditRows" border max-height="460">
        <el-table-column prop="title" label="产品" min-width="180" show-overflow-tooltip />
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }"><el-tag :type="publishStatusMeta(row.status).type" effect="dark">{{ publishStatusMeta(row.status).label }}</el-tag></template>
        </el-table-column>
        <el-table-column label="完整度" width="100" align="center">
          <template #default="{ row }"><el-tag :type="row.score >= 85 ? 'success' : row.score >= 60 ? 'warning' : 'danger'" effect="dark">{{ row.score }}%</el-tag></template>
        </el-table-column>
        <el-table-column label="缺失项" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">{{ row.missing.join('、') || '内容完整' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="110" align="center">
          <template #default="{ row }"><el-button size="small" color="#222" class="dark-btn" @click="openEditProduct(row.row)">编辑</el-button></template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <el-drawer v-model="versionDrawerOpen" title="产品版本历史" size="620px" class="dark-drawer" append-to-body>
      <template v-if="activeVersionProduct">
        <div class="version-current">
          <strong>{{ activeVersionProduct.attributes?.title || '未命名产品' }}</strong>
          <span>/products/{{ activeVersionProduct.attributes?.slug || activeVersionProduct.id }}</span>
        </div>

        <el-alert
          title="回滚会把当前产品内容恢复到所选历史快照，并自动保存当前版本作为可恢复记录。"
          type="warning"
          :closable="false"
          show-icon
          class="mb-16"
        />

        <div v-if="versionsLoading" class="empty-panel compact-empty">版本记录加载中...</div>
        <div v-else-if="productVersions.length === 0" class="empty-panel compact-empty">暂无历史版本。产品创建或编辑后会自动生成版本记录。</div>
        <div v-else class="version-list">
          <article v-for="version in productVersions" :key="version.id" class="version-item">
            <div class="version-item-main">
              <strong>{{ version.title || activeVersionProduct.attributes?.title || '历史版本' }}</strong>
              <span>{{ formatTime(version.createdAt) }} / {{ version.operator || '系统' }}</span>
              <small>{{ versionSummary(version) }}</small>
            </div>
            <el-button type="warning" plain :loading="restoringVersionId === version.id" @click="restoreProductVersion(version)">回滚</el-button>
          </article>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Clock, Delete, DocumentCopy, Edit, Search, Upload } from '@element-plus/icons-vue'
import ImageUpload from '../components/ImageUpload.vue'
import { BASE, adminUploadHeaders, api, extractErrorMessage, listData, mediaSrc, openPreview, paginationMeta } from '../lib/api'
import { productTypeTemplates, publishStatusMeta, publishStatusOptions } from '../lib/meta'
import { formatTime, linesToArray, qualityResult, safeParse, specsToText, textToSpecs, toSlug } from '../lib/format'
import { imageUploadHint, validateUploadFile } from '../lib/uploadPolicy'
import { changedFieldLabels, changedFieldSentence } from '../lib/changeSummary'

const searchQuery = ref('')
const productStatusFilter = ref('all')
const products = ref([])
const productsLoading = ref(false)
const productError = ref('')
const productPage = ref(1)
const productPageSize = ref(20)
const productTotal = ref(0)
const productAuditItems = ref([])
const pDiag = ref(false)
const productAuditDiag = ref(false)
const versionDrawerOpen = ref(false)
const versionsLoading = ref(false)
const restoringVersionId = ref(null)
const activeVersionProduct = ref(null)
const productVersions = ref([])
const isEdit = ref(false)
const curId = ref(null)
const productFormRef = ref(null)
const galleryUrlInput = ref('')
const galleryDragIndex = ref(null)
const originalProductPayload = ref(null)
let productSearchTimer = null

const PRODUCT_TABLE_STATE_KEY = 'hushi-admin-products-table-state'

const baseProductForm = {
  title: '', slug: '', type: 'piano', categoryName: '原声钢琴', description: '', imageUrl: '',
  galleryText: '', specsText: '', featuresText: '', scenesText: '', warranty: '', series: '',
  quantity: 1, price: 0, isFeatured: false, status: 'published'
}
const pForm = reactive({ ...baseProductForm })

const productRules = {
  title: [{ required: true, message: '请输入产品名称', trigger: 'blur' }],
  slug: [
    { required: true, message: '请输入 URL 后缀', trigger: 'blur' },
    { pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, message: '只能使用小写字母、数字和短横线', trigger: 'blur' }
  ],
  type: [{ required: true, message: '请选择系统归类', trigger: 'change' }],
  categoryName: [{ required: true, message: '请输入中文分类', trigger: 'blur' }],
  quantity: [{ type: 'number', min: 0, message: '库存不能小于 0', trigger: 'change' }],
  price: [{ validator: (rule, value, callback) => Number(value) >= 0 ? callback() : callback(new Error('价格不能小于 0')), trigger: 'blur' }]
}

const productQualityFromAttributes = (attrs) => qualityResult([
  { label: '主图', ok: Boolean(attrs.imageUrl || attrs.image?.data?.attributes?.url) },
  { label: '产品简介', ok: String(attrs.description || '').trim().length >= 20 },
  { label: '详情图集', ok: safeParse(attrs.gallery).length >= 1 },
  { label: '结构化参数', ok: safeParse(attrs.specs).length >= 3 },
  { label: '核心特性', ok: safeParse(attrs.features).length >= 3 },
  { label: '适用场景', ok: safeParse(attrs.scenes).length >= 2 },
  { label: '保修说明', ok: String(attrs.warranty || '').trim().length >= 10 }
])

const galleryPreview = computed(() => linesToArray(pForm.galleryText))

const productAuditRows = computed(() => productAuditItems.value.map((row) => {
  const attrs = row.attributes || {}
  const result = productQualityFromAttributes(attrs)
  return { id: row.id, title: attrs.title || '未命名产品', status: attrs.status || 'published', score: result.score, missing: result.missing, row }
}).sort((a, b) => a.score - b.score))

const productAuditMissingRows = computed(() => productAuditRows.value.filter((item) => item.missing.length))

const currentProductQualityRows = computed(() => products.value.map((row) => productQualityFromAttributes(row.attributes || {})))
const productSuspiciousWords = ['测试', 'test', 'demo', '样例', '占位', '张三', '李四', '111111']
const getProductImageUrl = (attrs) => attrs.imageUrl || attrs.image?.data?.attributes?.url || ''
const hasSuspiciousProductText = (attrs) => {
  const text = [attrs.title, attrs.slug, attrs.series, attrs.description, getProductImageUrl(attrs)].filter(Boolean).join(' ').toLowerCase()
  return productSuspiciousWords.some((word) => text.includes(word.toLowerCase()))
}
const productQualityReason = (attrs) => {
  const quality = productQualityFromAttributes(attrs)
  const imageUrl = getProductImageUrl(attrs)
  if (quality.score < 80) return `内容完整度 ${quality.score}%：建议补齐${quality.missing.join('、')}。`
  if (hasSuspiciousProductText(attrs)) return '疑似测试或占位数据：名称、URL、系列、简介或图片路径包含测试特征，发布前应复核。'
  if ((attrs.status || 'published') === 'published' && Number(attrs.quantity || 0) <= 0) return '已发布但库存为 0：前台可能仍可见，建议确认是否下架、补库存或改为隐藏。'
  if (/\/uploads\/\d+-/.test(imageUrl) && String(attrs.description || '').trim().length < 60) return '主图为临时上传路径，且简介偏短，建议确认是否为正式产品素材。'
  return ''
}
const productQualityIssues = computed(() => products.value.map((row) => {
  const attrs = row.attributes || {}
  const reason = productQualityReason(attrs)
  return reason ? {
    key: row.id,
    row,
    name: attrs.title || '未命名产品',
    path: attrs.slug ? `/products/${attrs.slug}` : `ID ${row.id}`,
    reason,
    tone: hasSuspiciousProductText(attrs) || Number(attrs.quantity || 0) <= 0 ? 'danger' : 'warning'
  } : null
}).filter(Boolean))
const productDraftCount = computed(() => products.value.filter((row) => (row.attributes?.status || 'published') === 'draft').length)
const productHiddenCount = computed(() => products.value.filter((row) => (row.attributes?.status || 'published') === 'hidden').length)
const productLowStockCount = computed(() => products.value.filter((row) => Number(row.attributes?.quantity || 0) <= 0).length)
const productIncompleteCount = computed(() => currentProductQualityRows.value.filter((item) => item.score < 80).length)
const activeProductFilters = computed(() => Boolean(searchQuery.value.trim()) || productStatusFilter.value !== 'all')
const productOpsCards = computed(() => [
  { label: '产品总数', value: productTotal.value || products.value.length, desc: '当前官网产品池', tone: 'primary' },
  { label: '待完善', value: productIncompleteCount.value, desc: '完整度低于 80%', tone: productIncompleteCount.value ? 'warning' : 'success' },
  { label: '草稿/隐藏', value: productDraftCount.value + productHiddenCount.value, desc: '未公开展示内容', tone: productDraftCount.value + productHiddenCount.value ? 'warning' : 'success' },
  { label: '低库存', value: productLowStockCount.value, desc: '库存为 0 需确认', tone: productLowStockCount.value ? 'danger' : 'success' }
])

const productQuality = computed(() => {
  const result = productQualityFromAttributes({
    imageUrl: pForm.imageUrl,
    description: pForm.description,
    gallery: JSON.stringify(linesToArray(pForm.galleryText)),
    specs: JSON.stringify(textToSpecs(pForm.specsText)),
    features: JSON.stringify(linesToArray(pForm.featuresText)),
    scenes: JSON.stringify(linesToArray(pForm.scenesText)),
    warranty: pForm.warranty
  })
  return {
    title: `产品内容完整度 ${result.score}%`,
    type: result.type,
    description: result.missing.length ? `建议补齐：${result.missing.join('、')}。` : '内容已经满足官网详情页展示与转化所需字段。'
  }
})

const productChangeHint = computed(() => changedFieldSentence(originalProductPayload.value, productPayload(), productChangeLabels, isEdit.value ? '当前没有未保存修改。' : '新产品可先保存草稿，完善后再发布。'))

const parseVersionSnapshot = (version) => {
  try {
    return JSON.parse(version.snapshot || '{}')
  } catch {
    return {}
  }
}

const versionSummary = (version) => {
  const snapshot = parseVersionSnapshot(version)
  const parts = [
    snapshot.status ? `状态：${publishStatusMeta(snapshot.status).label}` : '',
    snapshot.price != null ? `价格：¥ ${Number(snapshot.price || 0).toFixed(2)}` : '',
    snapshot.quantity != null ? `库存：${snapshot.quantity}` : '',
    snapshot.series ? `系列：${snapshot.series}` : ''
  ].filter(Boolean)
  return parts.join(' / ') || '历史快照'
}

const saveProductTableState = () => {
  try {
    window.localStorage.setItem(PRODUCT_TABLE_STATE_KEY, JSON.stringify({
      search: searchQuery.value,
      status: productStatusFilter.value,
      page: productPage.value,
      pageSize: productPageSize.value
    }))
  } catch {}
}

const restoreProductTableState = () => {
  try {
    const state = JSON.parse(window.localStorage.getItem(PRODUCT_TABLE_STATE_KEY) || '{}')
    if (typeof state.search === 'string') searchQuery.value = state.search
    if (typeof state.status === 'string') productStatusFilter.value = state.status
    if (Number.isFinite(Number(state.page))) productPage.value = Number(state.page)
    if (Number.isFinite(Number(state.pageSize))) productPageSize.value = Number(state.pageSize)
  } catch {}
}

const fetchProducts = async () => {
  productsLoading.value = true
  productError.value = ''
  saveProductTableState()
  try {
    const res = await api.get('/api/products', {
      params: {
        admin: 1,
        search: searchQuery.value,
        status: productStatusFilter.value,
        page: productPage.value,
        pageSize: productPageSize.value
      }
    })
    products.value = listData(res)
    const meta = paginationMeta(res)
    productTotal.value = meta.total || products.value.length
    if (meta.page && meta.page !== productPage.value) productPage.value = meta.page
  } catch (error) {
    productError.value = extractErrorMessage(error, '产品列表加载失败')
    products.value = []
    productTotal.value = 0
  } finally {
    productsLoading.value = false
  }
}

const handleProductSearchInput = () => {
  productPage.value = 1
  window.clearTimeout(productSearchTimer)
  productSearchTimer = window.setTimeout(fetchProducts, 260)
}

const handleProductFilterChange = () => {
  productPage.value = 1
  fetchProducts()
}

const showProductAll = () => {
  searchQuery.value = ''
  productStatusFilter.value = 'all'
  productPage.value = 1
  window.clearTimeout(productSearchTimer)
  fetchProducts()
}

const handleProductPageChange = () => {
  fetchProducts()
}

const handleProductPageSizeChange = () => {
  productPage.value = 1
  fetchProducts()
}

const openProductAudit = async () => {
  const res = await api.get('/api/products', { params: { admin: 1, status: 'all', pageSize: 100 } })
  productAuditItems.value = listData(res)
  productAuditDiag.value = true
}

const generateSlug = () => {
  pForm.slug = toSlug(pForm.title || pForm.series || pForm.categoryName)
}

const ensureSlug = () => {
  if (!isEdit.value && !pForm.slug && pForm.title) generateSlug()
}

const applyTypeTemplate = (type) => {
  const template = productTypeTemplates[type]
  if (!template) return
  if (!pForm.categoryName || pForm.categoryName === baseProductForm.categoryName) pForm.categoryName = template.categoryName
  if (!pForm.series) pForm.series = template.series
  if (!pForm.specsText) pForm.specsText = template.specsText
  if (!pForm.featuresText) pForm.featuresText = template.featuresText
  if (!pForm.scenesText) pForm.scenesText = template.scenesText
  if (!pForm.warranty) pForm.warranty = template.warranty
}

const openAddProduct = () => {
  isEdit.value = false
  curId.value = null
  Object.assign(pForm, { ...baseProductForm })
  applyTypeTemplate(pForm.type)
  originalProductPayload.value = productPayload()
  pDiag.value = true
}

const openEditProduct = (row) => {
  isEdit.value = true
  curId.value = row.id
  const attrs = row.attributes
  Object.assign(pForm, {
    ...baseProductForm,
    ...attrs,
    imageUrl: attrs.image?.data?.attributes?.url || attrs.imageUrl || '',
    galleryText: safeParse(attrs.gallery).join('\n'),
    specsText: specsToText(attrs.specs),
    featuresText: safeParse(attrs.features).join('\n'),
    scenesText: safeParse(attrs.scenes).join('\n')
  })
  originalProductPayload.value = productPayload()
  pDiag.value = true
}

const openVersionDrawer = async (row) => {
  activeVersionProduct.value = row
  versionDrawerOpen.value = true
  productVersions.value = []
  versionsLoading.value = true
  try {
    const res = await api.get(`/api/products/${row.id}/versions`)
    productVersions.value = listData(res)
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, '版本记录加载失败'))
  } finally {
    versionsLoading.value = false
  }
}

const restoreProductVersion = async (version) => {
  if (!activeVersionProduct.value) return
  try {
    await ElMessageBox.confirm(
      `确定将“${activeVersionProduct.value.attributes?.title || '该产品'}”恢复到 ${formatTime(version.createdAt)} 的版本？当前内容会先保存为新的历史版本。`,
      '产品版本回滚确认',
      { type: 'warning', confirmButtonText: '确认回滚', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  restoringVersionId.value = version.id
  try {
    await api.post(`/api/products/${activeVersionProduct.value.id}/restore/${version.id}`)
    ElMessage.success('产品已恢复到所选版本')
    versionDrawerOpen.value = false
    await fetchProducts()
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, '产品版本回滚失败'))
  } finally {
    restoringVersionId.value = null
  }
}

const moveGallery = (index, direction) => {
  const items = linesToArray(pForm.galleryText)
  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= items.length) return
  const [item] = items.splice(index, 1)
  items.splice(targetIndex, 0, item)
  pForm.galleryText = items.join('\n')
}

const addGalleryImage = (url, { silent = false } = {}) => {
  const value = String(url || '').trim()
  if (!value) return
  if (!/^(https?:\/\/|\/uploads\/)/i.test(value)) {
    ElMessage.warning('图片地址需要以 http(s) 或 /uploads/ 开头')
    return
  }
  const items = linesToArray(pForm.galleryText)
  if (items.includes(value)) {
    ElMessage.info('这张详情图已经在列表中')
    return
  }
  items.push(value)
  pForm.galleryText = items.join('\n')
  if (!silent) ElMessage.success('详情图已添加')
}

const replaceGalleryImage = (index, url) => {
  const value = String(url || '').trim()
  if (!value) return
  const items = linesToArray(pForm.galleryText)
  if (!items[index]) return
  if (!/^(https?:\/\/|\/uploads\/)/i.test(value)) {
    ElMessage.warning('图片地址需要以 http(s) 或 /uploads/ 开头')
    return
  }
  items[index] = value
  pForm.galleryText = items.join('\n')
  ElMessage.success('详情图已替换')
}

const beforeGalleryUpload = (file) => {
  const result = validateUploadFile(file, { kind: 'image' })
  if (!result.ok) ElMessage.warning(result.message)
  return result.ok
}

const addGalleryUrl = () => {
  addGalleryImage(galleryUrlInput.value)
  galleryUrlInput.value = ''
}

const handleGalleryUploadSuccess = (res) => {
  addGalleryImage(res?.url, { silent: true })
  ElMessage.success('详情图已添加')
}

const handleGalleryReplaceSuccess = (res, index) => {
  replaceGalleryImage(index, res?.url)
}

const handleGalleryUploadError = (error) => {
  ElMessage.error(extractErrorMessage(error, '详情图上传失败'))
}

const removeGallery = (index) => {
  const items = linesToArray(pForm.galleryText)
  items.splice(index, 1)
  pForm.galleryText = items.join('\n')
}

const clearGallery = async () => {
  try {
    await ElMessageBox.confirm(`确定清空当前 ${galleryPreview.value.length} 张详情图？这不会删除资源库里的图片文件。`, '清空详情图集', { type: 'warning' })
    pForm.galleryText = ''
  } catch {}
}

const setMainImageFromGallery = (url) => {
  pForm.imageUrl = url
  ElMessage.success('已设为产品主图')
}

const addMainImageToGallery = () => {
  addGalleryImage(pForm.imageUrl)
}

const handleGalleryDragStart = (index) => {
  galleryDragIndex.value = index
}

const handleGalleryDrop = (targetIndex) => {
  const sourceIndex = galleryDragIndex.value
  if (sourceIndex === null || sourceIndex === targetIndex) return
  const items = linesToArray(pForm.galleryText)
  const [item] = items.splice(sourceIndex, 1)
  items.splice(targetIndex, 0, item)
  pForm.galleryText = items.join('\n')
  galleryDragIndex.value = null
}

const handleGalleryDragEnd = () => {
  galleryDragIndex.value = null
}

const productPayload = () => {
  const payload = { ...pForm }
  payload.gallery = JSON.stringify(linesToArray(pForm.galleryText))
  payload.specs = JSON.stringify(textToSpecs(pForm.specsText))
  payload.features = JSON.stringify(linesToArray(pForm.featuresText))
  payload.scenes = JSON.stringify(linesToArray(pForm.scenesText))
  payload.price = Number(payload.price || 0)
  payload.quantity = Number(payload.quantity || 0)
  delete payload.galleryText
  delete payload.specsText
  delete payload.featuresText
  delete payload.scenesText
  return payload
}

const productChangeLabels = {
  title: '名称',
  slug: 'URL 后缀',
  type: '系统归类',
  categoryName: '中文分类',
  description: '简介',
  imageUrl: '主图',
  gallery: '详情图集',
  specs: '参数',
  features: '核心特性',
  scenes: '适用场景',
  warranty: '保修说明',
  series: '系列',
  quantity: '库存量',
  price: '零售价',
  isFeatured: '首页推荐',
  status: '发布状态'
}

const previewCurrentProduct = () => {
  openPreview(`/products/${pForm.slug || curId.value || ''}`)
}

const requestCloseProductDialog = async (done) => {
  const changedFields = changedFieldLabels(originalProductPayload.value, productPayload(), productChangeLabels)
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
  else pDiag.value = false
}

const submitProduct = async (targetStatus = '') => {
  const previousStatus = pForm.status
  try {
    await productFormRef.value?.validate()
    if (targetStatus) pForm.status = targetStatus
    const payload = productPayload()
    const changedFields = changedFieldLabels(originalProductPayload.value, payload, productChangeLabels)
    if (isEdit.value && changedFields.length) {
      await ElMessageBox.confirm(`本次将修改：${changedFields.join('、')}。确认保存？`, '保存前确认', { type: 'info' })
    }
    await api[isEdit.value ? 'put' : 'post'](isEdit.value ? `/api/products/${curId.value}` : '/api/products', payload)
    pDiag.value = false
    fetchProducts()
    ElMessage.success(targetStatus === 'draft' ? '草稿已保存' : targetStatus === 'published' ? '产品已保存并发布' : '产品内容已保存')
  } catch (error) {
    if ((error === 'cancel' || error === 'close') && targetStatus) pForm.status = previousStatus
    if (error !== 'cancel' && error !== 'close') ElMessage.error(extractErrorMessage(error, '请检查产品表单'))
  }
}

const handleDelete = async (id) => {
  await ElMessageBox.confirm('确定彻底删除这个产品？删除后该产品将从后台和官网产品列表移除。', '敏感操作确认', { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' })
  await api.delete(`/api/products/${id}`)
  ElMessage.success('已删除')
  fetchProducts()
}

const handlePageAction = (event) => {
  if (event.detail === 'product:add') openAddProduct()
}

onMounted(() => {
  window.addEventListener('admin-page-action', handlePageAction)
  restoreProductTableState()
  fetchProducts()
})

onBeforeUnmount(() => {
  window.removeEventListener('admin-page-action', handlePageAction)
  window.clearTimeout(productSearchTimer)
})
</script>
