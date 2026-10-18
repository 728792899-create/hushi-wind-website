<template>
  <div class="panel content-panel">
    <div class="table-tools enterprise-table-tools">
      <div class="filter-row wrap">
        <el-input
          v-model="searchQuery"
          placeholder="搜索乐器名称、系列或参数"
          :prefix-icon="Search"
          class="w-320"
          @input="handleProductSearchInput"
          clearable
        />
        <el-select
          v-model="productStatusFilter"
          aria-label="发布状态"
          placeholder="发布状态"
          class="w-140"
          @change="handleProductFilterChange"
        >
          <el-option label="全部状态" value="all" />
          <el-option
            v-for="item in publishStatusOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
        <el-button v-if="activeProductFilters" plain @click="showProductAll"
          >返回全部</el-button
        >
      </div>
      <div class="filter-row">
        <el-button
          v-if="hasPermission('products:write')"
          type="primary"
          class="light-btn"
          @click="openAddProduct"
          >新增产品</el-button
        >
      </div>
    </div>

    <el-alert
      v-if="productError"
      :title="productError"
      description="请检查网络或后台 API 状态后重试。"
      type="error"
      show-icon
      :closable="false"
      class="mb-16"
    />
    <p v-if="productsLoading && products.length" class="field-hint" role="status">正在更新产品列表…</p>

    <div
      class="mobile-admin-list product-mobile-list"
      v-loading="productsLoading && !products.length"
      :aria-busy="productsLoading"
    >
      <article
        v-for="row in products"
        :key="row.id"
        class="mobile-admin-card product-mobile-card"
      >
        <div class="mobile-list-media">
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
          <div class="mobile-list-tags">
            <el-tag
              size="small"
              :type="publishStatusMeta(row.attributes.status).type"
              effect="light"
              >{{ publishStatusMeta(row.attributes.status).label }}</el-tag
            >
          </div>
          <strong>{{ row.attributes.title }}</strong>
          <small>{{
            row.attributes.series || row.attributes.slug || '未设置系列'
          }}</small>
          <div class="mobile-list-meta">
            <span>{{ formatMoney(row.attributes.price || 0) }}</span>
          </div>
          <div class="mobile-list-actions">
            <el-button
              :disabled="
                !['published', 'active'].includes(row.attributes.status)
              "
              :icon="DocumentCopy"
              size="small"
              @click="openPreview(`/products/${row.attributes.slug || row.id}`)"
              class="dark-btn"
              >预览</el-button
            >
            <el-button
              v-if="hasPermission('products:write')"
              :icon="Edit"
              size="small"
              @click="openEditProduct(row)"
              class="dark-btn"
              >编辑</el-button
            >
            <el-button
              :icon="Clock"
              size="small"
              @click="openVersionDrawer(row)"
              >版本</el-button
            >
            <el-button
              v-if="hasPermission('products:write')"
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
        v-if="!productsLoading && !products.length"
        class="empty-panel compact-empty"
      >
        暂无产品内容
      </div>
    </div>

    <el-table
      :data="products"
      border
      class="wide-table mobile-hidden-table"
      v-loading="productsLoading && !products.length"
      :aria-busy="productsLoading"
      empty-text="暂无产品内容"
    >
      <el-table-column label="主图" width="90" align="center">
        <template #default="{ row }"
          ><el-image
            :src="mediaSrc(row.attributes.image?.data?.attributes?.url)"
            v-if="row.attributes.image"
            class="t-img"
        /></template>
      </el-table-column>
      <el-table-column
        prop="attributes.title"
        label="乐器名称"
        min-width="170"
      />
      <el-table-column
        prop="attributes.categoryName"
        label="品类"
        width="140"
      /><el-table-column
        prop="attributes.series"
        label="系列"
        min-width="130"
        show-overflow-tooltip
      />
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }"
          ><el-tag
            :type="publishStatusMeta(row.attributes.status).type"
            effect="light"
            >{{ publishStatusMeta(row.attributes.status).label }}</el-tag
          ></template
        >
      </el-table-column>
      <el-table-column label="零售价" width="120">
        <template #default="{ row }"
          >{{ formatMoney(row.attributes.price || 0) }}</template
        >
      </el-table-column>
      <el-table-column label="管理" fixed="right" width="210" align="center">
        <template #default="{ row }">
          <div class="row-action-group">
            <el-button
              :disabled="
                !['published', 'active'].includes(row.attributes.status)
              "
              :icon="DocumentCopy"
              size="small"
              title="预览前台产品页"
              aria-label="预览前台产品页"
              @click="openPreview(`/products/${row.attributes.slug || row.id}`)"
              class="dark-btn"
              >预览</el-button
            >
            <el-button
              v-if="hasPermission('products:write')"
              :icon="Edit"
              size="small"
              title="编辑产品内容"
              aria-label="编辑产品内容"
              @click="openEditProduct(row)"
              class="dark-btn"
              >编辑</el-button
            >
            <el-dropdown trigger="click">
              <el-button
                size="small"
                title="更多产品操作"
                aria-label="更多产品操作"
                >更多</el-button
              >
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="openVersionDrawer(row)"
                    >查看版本历史</el-dropdown-item
                  >
                  <el-dropdown-item
                    v-if="hasPermission('products:write')"
                    class="danger-dropdown-item"
                    @click="handleDelete(row.id)"
                    >删除产品</el-dropdown-item
                  >
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
        :total="productTotal"
        layout="slot, prev, pager, next"
        background
        @current-change="handleProductPageChange"
      >
        <span class="el-pagination__sizes">
          <el-select
            v-model="productPageSize"
            aria-label="每页显示条数"
            @change="handleProductPageSizeChange"
          >
            <el-option
              v-for="size in [10, 20, 50, 100]"
              :key="size"
              :value="size"
              :label="`${size}条/页`"
            />
          </el-select>
        </span>
      </el-pagination>
    </div>

    <el-dialog
      v-model="pDiag"
      :title="isEdit ? '编辑乐器' : '新增产品'"
      width="860px"
      class="dark-dialog"
      append-to-body
      destroy-on-close
      :before-close="requestCloseProductDialog"
    >
      <CatalogManager @changed="loadCatalog" />
      <el-form
        ref="productFormRef"
        :disabled="saving || pendingUploads > 0"
        :model="pForm"
        :rules="productRules"
        label-width="96px"
      >
        <details class="form-disclosure" open>
          <summary>基础信息</summary>
          <section class="form-section">
            <el-row :gutter="20">
              <el-col :span="8">
                <image-upload v-model="pForm.imageUrl" height="188px" />
                <div class="main-image-tools">
                  <el-button
                    size="small"
                    :disabled="!pForm.imageUrl"
                    @click="addMainImageToGallery"
                    >主图加入详情图</el-button
                  >
                  <el-button
                    size="small"
                    :disabled="!pForm.imageUrl"
                    @click="pForm.imageUrl = ''"
                    >清除主图</el-button
                  >
                </div>
              </el-col>
              <el-col :span="16">
                <el-form-item label="名称" prop="title"
                  ><el-input v-model="pForm.title" @blur="ensureSlug"
                /></el-form-item>
                <el-form-item label="页面地址" prop="slug">
                  <el-input v-model="pForm.slug" :disabled="isEdit">
                    <template #append
                      ><el-button :disabled="isEdit" @click="generateSlug"
                        >生成</el-button
                      ></template
                    >
                  </el-input>
                </el-form-item>
                <el-form-item label="系列"
                  ><el-select
                    v-model="pForm.series"
                    filterable
                    allow-create
                    default-first-option
                    clearable
                    ><el-option
                      v-for="item in catalog.series.filter(
                        (s) => s.categorySlug === pForm.type,
                      )"
                      :key="item.id"
                      :label="item.name"
                      :value="item.name" /></el-select
                ></el-form-item>
              </el-col>
            </el-row>

            <el-row :gutter="20">
              <el-col :span="12"
                ><el-form-item label="分类名称" prop="categoryName"
                  ><el-input v-model="pForm.categoryName" /></el-form-item
              ></el-col>
              <el-col :span="12">
                <el-form-item label="产品品类" prop="type">
                  <el-select
                    v-model="pForm.type"
                    class="full"
                    @change="applyTypeTemplate"
                  >
                    <el-option
                      v-for="item in catalog.categories"
                      :key="item.slug"
                      :label="item.name"
                      :value="item.slug"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
          </section>
        </details>

        <details class="form-disclosure">
          <summary>价格与发布设置</summary>
          <section class="form-section">
            <el-row :gutter="20">
              <el-col :span="8"
                ><el-form-item label="库存量" prop="quantity"
                  ><el-input-number
                    v-model="pForm.quantity"
                    :min="0"
                    class="full" /></el-form-item
              ></el-col>
              <el-col :span="8"
                ><el-form-item label="零售价" prop="price"
                  ><el-input v-model="pForm.price" /></el-form-item
              ></el-col>
              <el-col :span="8"
                ><el-form-item label="发布状态"
                  ><el-select v-model="pForm.status" class="full"
                    ><el-option
                      v-for="item in publishStatusOptions"
                      :key="item.value"
                      :label="item.label"
                      :value="item.value" /></el-select></el-form-item
              ></el-col>
            </el-row>

            <el-row :gutter="20">
              <el-col :span="12"
                ><el-form-item label="首页推荐"
                  ><el-switch v-model="pForm.isFeatured" /></el-form-item
              ></el-col>
              <el-col :span="12">
                <el-form-item label="前台预览">
                  <el-button
                    class="dark-btn"
                    :disabled="
                      !isEdit || originalProductPayload?.status !== 'published'
                    "
                    @click="previewCurrentProduct"
                    >查看已发布页面</el-button
                  >
                </el-form-item>
              </el-col>
            </el-row>
          </section>
        </details>

        <details class="form-disclosure">
          <summary>SEO 与简介</summary>
          <section class="form-section">
            <el-form-item label="SEO 预览">
              <div class="seo-preview">
                <strong>{{ pForm.title || '产品标题' }} | 胡氏管乐</strong>
                <span>/products/{{ pForm.slug || 'product-slug' }}</span>
                <p>
                  {{
                    pForm.description ||
                    '产品简介会显示在搜索摘要与分享卡片中。'
                  }}
                </p>
              </div>
            </el-form-item>

            <el-form-item label="简介"
              ><el-input
                v-model="pForm.description"
                type="textarea"
                :rows="3"
                placeholder="可先简短填写，后续再完善产品卖点、适用空间与音色描述。"
            /></el-form-item>
          </section>
        </details>

        <details class="form-disclosure">
          <summary>媒体资源</summary>
          <section class="form-section">
            <el-form-item label="详情图集">
              <div class="gallery-manager">
                <div class="gallery-actions">
                  <el-upload
                    :http-request="uploadRequest"
                    :action="`${BASE}/api/upload`"
                    :headers="adminUploadHeaders()"
                    accept="image/*"
                    multiple
                    :show-file-list="false"
                    :before-upload="beforeGalleryUpload"
                    :on-success="
                      (res, file) =>
                        uploads.complete(file, () =>
                          handleGalleryUploadSuccess(res, file),
                        )
                    "
                    :on-error="
                      (error, file) =>
                        uploads.complete(file, () =>
                          handleGalleryUploadError(error),
                        )
                    "
                  >
                    <el-button type="primary" plain :icon="Upload"
                      >批量上传详情图</el-button
                    >
                  </el-upload>
                  <el-input
                    v-model="galleryUrlInput"
                    placeholder="也可以粘贴图片地址，例如 /uploads/example.jpg"
                    clearable
                    @keyup.enter="addGalleryUrl"
                  >
                    <template #append
                      ><el-button @click="addGalleryUrl"
                        >添加</el-button
                      ></template
                    >
                  </el-input>
                </div>
                <div class="gallery-toolbar">
                  <span
                    >已添加 {{ galleryPreview.length }} 张，支持拖拽排序。</span
                  >
                  <div>
                    <el-button
                      size="small"
                      :disabled="!pForm.imageUrl"
                      @click="addMainImageToGallery"
                      >加入主图</el-button
                    >
                    <el-button
                      size="small"
                      :disabled="!galleryPreview.length"
                      @click="clearGallery"
                      >清空图集</el-button
                    >
                  </div>
                </div>
                <p class="field-hint">
                  图片会按当前顺序展示在产品详情页。{{ imageUploadHint }}
                  日常运营可直接批量上传，也可拖动图片调整顺序。
                </p>
                <div v-if="galleryPreview.length" class="gallery-grid">
                  <div
                    v-for="(image, index) in galleryPreview"
                    :key="`${image}-${index}`"
                    class="gallery-card"
                    :class="{ dragging: galleryDragIndex === index }"
                    :draggable="!saving && !pendingUploads"
                    @dragstart="handleGalleryDragStart(index)"
                    @dragover.prevent
                    @dragenter.prevent
                    @drop.prevent="handleGalleryDrop(index)"
                    @dragend="handleGalleryDragEnd"
                  >
                    <el-image
                      :src="mediaSrc(image)"
                      :preview-src-list="[mediaSrc(image)]"
                      fit="cover"
                      preview-teleported
                    />
                    <span class="gallery-index">{{ index + 1 }}</span>
                    <span class="gallery-drag-handle">拖拽排序</span>
                    <div class="gallery-card-actions">
                      <el-button
                        size="small"
                        :disabled="pForm.imageUrl === image"
                        @click="setMainImageFromGallery(image)"
                        >设主图</el-button
                      >
                      <el-upload
                        :http-request="uploadRequest"
                        :action="`${BASE}/api/upload`"
                        :headers="adminUploadHeaders()"
                        accept="image/*"
                        :show-file-list="false"
                        :before-upload="beforeGalleryUpload"
                        :on-success="
                          (res, file) =>
                            uploads.complete(file, () =>
                              handleGalleryReplaceSuccess(res, index),
                            )
                        "
                        :on-error="
                          (error, file) =>
                            uploads.complete(file, () =>
                              handleGalleryUploadError(error),
                            )
                        "
                      >
                        <el-button size="small">替换</el-button>
                      </el-upload>
                      <el-button
                        size="small"
                        type="danger"
                        @click="removeGallery(index)"
                        >删除</el-button
                      >
                    </div>
                  </div>
                </div>
                <div v-else class="gallery-empty">
                  暂无详情图，保存后也可以稍后补充。
                </div>
              </div>
            </el-form-item>
          </section>
        </details>

        <details class="form-disclosure">
          <summary>产品详情</summary>
          <section class="form-section">
            <el-form-item label="参数" prop="specsText"
              ><el-input
                v-model="pForm.specsText"
                type="textarea"
                :rows="5"
                placeholder="每行一项，格式：参数名：参数值"
            /></el-form-item>
            <el-form-item label="核心特性" prop="featuresText"
              ><el-input
                v-model="pForm.featuresText"
                type="textarea"
                :rows="4"
                placeholder="每行一条卖点"
            /></el-form-item>
            <el-row :gutter="20">
              <el-col :span="12"
                ><el-form-item label="适用场景" prop="scenesText"
                  ><el-input
                    v-model="pForm.scenesText"
                    type="textarea"
                    :rows="3"
                    placeholder="每行一个场景" /></el-form-item
              ></el-col>
              <el-col :span="12"
                ><el-form-item label="保修说明" prop="warranty"
                  ><el-input
                    v-model="pForm.warranty"
                    type="textarea"
                    :rows="3" /></el-form-item
              ></el-col>
            </el-row>
          </section>
        </details>
        <ContentWorkflow
          v-if="isEdit"
          ref="productWorkflow"
          module="product"
          :record-id="curId"
          :payload="productPayload()"
          :preview-path="`/products/${pForm.slug || curId}`"
          :busy="saving || pendingUploads > 0"
          @busy="workflowBusy = $event"
          @saved="originalProductPayload = $event"
          @loaded="
            Object.assign(pForm, $event, {
              galleryText: safeParse($event.gallery).join('\n'),
              specsText: specsToText($event.specs),
              featuresText: safeParse($event.features).join('\n'),
              scenesText: safeParse($event.scenes).join('\n'),
            })
          "
          @published="handleWorkflowPublished"
        />
      </el-form>
      <template #footer>
        <p v-if="pendingUploads" class="upload-status" role="status">
          素材上传中，请完成后保存（{{ pendingUploads }}）
        </p>
        <div class="dialog-footer-actions">
          <span class="dialog-footer-hint"
            ><el-tag :type="publishStatusMeta(pForm.status).type">{{
              publishStatusMeta(pForm.status).label
            }}</el-tag>
            {{
              pForm.status === 'published'
                ? '建议先保存修改草稿，预览核对后再发布。'
                : '当前内容不会在官网公开。'
            }}
            {{ productChangeHint }}</span
          >
          <div class="dialog-footer-buttons">
            <el-button @click="requestCloseProductDialog()">取消</el-button>
            <el-button v-if="isEdit && pForm.status === 'published' && hasPermission('products:write')"
              :disabled="saving || workflowBusy || pendingUploads > 0" @click="submitProduct()">直接更新官网</el-button>
            <el-button
              v-if="hasPermission('products:write')"
              type="primary"
              :loading="saving || workflowBusy"
              :disabled="pendingUploads > 0 || workflowBusy"
              @click="saveProductSafely"
              >{{ isEdit && pForm.status === 'published' ? '保存修改草稿' : pForm.status === 'published' ? '发布到官网' : '保存产品' }}</el-button
            >
          </div>
        </div>
      </template>
    </el-dialog>

    <el-drawer
      v-model="versionDrawerOpen"
      title="产品版本历史"
      size="620px"
      class="dark-drawer"
      append-to-body
    >
      <template v-if="activeVersionProduct">
        <div class="version-current">
          <strong>{{
            activeVersionProduct.attributes?.title || '未命名产品'
          }}</strong>
          <span
            >/products/{{
              activeVersionProduct.attributes?.slug || activeVersionProduct.id
            }}</span
          >
        </div>

        <el-alert
          title="回滚会把当前产品内容恢复到所选历史快照，并自动保存当前版本作为可恢复记录。"
          type="warning"
          :closable="false"
          show-icon
          class="mb-16"
        />

        <div v-if="versionsLoading" class="empty-panel compact-empty">
          版本记录加载中...
        </div>
        <div
          v-else-if="productVersions.length === 0"
          class="empty-panel compact-empty"
        >
          暂无历史版本。产品创建或编辑后会自动生成版本记录。
        </div>
        <div v-else class="version-list">
          <article
            v-for="version in productVersions"
            :key="version.id"
            class="version-item"
          >
            <div class="version-item-main">
              <strong>{{
                version.title ||
                activeVersionProduct.attributes?.title ||
                '历史版本'
              }}</strong>
              <span
                >{{ formatTime(version.createdAt) }} /
                {{ version.operator || '系统' }}</span
              >
              <small>{{ versionSummary(version) }}</small>
            </div>
            <el-button
              v-if="hasPermission('products:write')"
              type="warning"
              plain
              :loading="restoringVersionId === version.id"
              @click="restoreProductVersion(version)"
              >回滚</el-button
            >
          </article>
        </div>
        <el-button v-if="historyHasMore" :disabled="versionsLoading" @click="openVersionDrawer(activeVersionProduct, true)">加载更早版本</el-button>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
const handleWorkflowPublished = () => { pDiag.value = false; fetchProducts() }
import { uploadRequest } from '../lib/uploadRequest'
import CatalogManager from '../components/CatalogManager.vue'
import ContentWorkflow from '../components/ContentWorkflow.vue'
const workflowBusy = ref(false)
const productWorkflow = ref(null)
import { useEditorUploads, useUnsavedChanges } from '../lib/editorLifecycle'
const uploads = useEditorUploads()
const pendingUploads = uploads.pending
import { useRoute } from 'vue-router'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Clock,
  Delete,
  DocumentCopy,
  Edit,
  Search,
  Upload,
} from '@element-plus/icons-vue'
import ImageUpload from '../components/ImageUpload.vue'
import {
  BASE,
  hasPermission,
  adminUploadHeaders,
  api,
  readList,
  isQueryCancelled,
  extractErrorMessage,
  isRecordConflict,
  listData,
  mediaSrc,
  openPreview,
  paginationMeta,
} from '../lib/api'
import { publishStatusMeta, publishStatusOptions } from '../lib/meta'
import {
  formatMoney,
  formatTime,
  linesToArray,
  qualityResult,
  safeParse,
  specsToText,
  textToSpecs,
  toSlug,
} from '../lib/format'
import { imageUploadHint, validateUploadFile } from '../lib/uploadPolicy'
import { changedFieldLabels, changedFieldSentence } from '../lib/changeSummary'

const route = useRoute()
const searchQuery = ref('')
const productStatusFilter = ref('all')
const products = ref([])
const productsLoading = ref(false)
const productError = ref('')
const productPage = ref(1)
const productPageSize = ref(20)
const productTotal = ref(0)

const pDiag = ref(false)
const saving = ref(false)

const versionDrawerOpen = ref(false)
const versionsLoading = ref(false)
const restoringVersionId = ref(null)
const activeVersionProduct = ref(null)
const productVersions = ref([])
const historyPage = ref(1), historyHasMore = ref(false)
const isEdit = ref(false)
const curId = ref(null)
const productRevision = ref(null)
const productFormRef = ref(null)
const galleryUrlInput = ref('')
const galleryDragIndex = ref(null)
const originalProductPayload = ref(null)
let productSearchTimer = null

const PRODUCT_TABLE_STATE_KEY = 'hushi-admin-products-table-state'

const baseProductForm = {
  title: '',
  slug: '',
  type: 'piano',
  categoryName: '原声钢琴',
  description: '',
  imageUrl: '',
  galleryText: '',
  specsText: '',
  featuresText: '',
  scenesText: '',
  warranty: '',
  series: '',
  quantity: 1,
  price: 0,
  isFeatured: false,
  status: 'draft',
}
const pForm = reactive({ ...baseProductForm })

const productRules = {
  title: [{ required: true, message: '请输入产品名称', trigger: 'blur' }],
  slug: [
    { required: true, message: '请输入 URL 后缀', trigger: 'blur' },
    {
      pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      message: '只能使用小写字母、数字和短横线',
      trigger: 'blur',
    },
  ],
  type: [{ required: true, message: '请选择系统归类', trigger: 'change' }],
  categoryName: [
    { required: true, message: '请输入中文分类', trigger: 'blur' },
  ],
  quantity: [
    { type: 'number', min: 0, message: '库存不能小于 0', trigger: 'change' },
  ],
  price: [
    {
      validator: (rule, value, callback) =>
        Number(value) >= 0 ? callback() : callback(new Error('价格不能小于 0')),
      trigger: 'blur',
    },
  ],
}

const galleryPreview = computed(() => linesToArray(pForm.galleryText))

const activeProductFilters = computed(
  () =>
    Boolean(searchQuery.value.trim()) || productStatusFilter.value !== 'all',
)

const productChangeHint = computed(() =>
  changedFieldSentence(
    originalProductPayload.value,
    productPayload(),
    productChangeLabels,
    isEdit.value
      ? '当前没有未保存修改。'
      : '新产品可先保存草稿，完善后再发布。',
  ),
)

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
    snapshot.price != null
      ? `价格：${formatMoney(snapshot.price || 0)}`
      : '',
    snapshot.quantity != null ? `库存：${snapshot.quantity}` : '',
    snapshot.series ? `系列：${snapshot.series}` : '',
  ].filter(Boolean)
  return parts.join(' / ') || '历史快照'
}

const saveProductTableState = () => {
  try {
    window.localStorage.setItem(
      PRODUCT_TABLE_STATE_KEY,
      JSON.stringify({
        search: searchQuery.value,
        status: productStatusFilter.value,
        page: productPage.value,
        pageSize: productPageSize.value,
      }),
    )
  } catch {}
}

const restoreProductTableState = () => {
  try {
    const state = JSON.parse(
      window.localStorage.getItem(PRODUCT_TABLE_STATE_KEY) || '{}',
    )
    if (typeof state.search === 'string') searchQuery.value = state.search
    if (typeof state.status === 'string')
      productStatusFilter.value = state.status
    if (Number.isFinite(Number(state.page)))
      productPage.value = Number(state.page)
    if (Number.isFinite(Number(state.pageSize)))
      productPageSize.value = Number(state.pageSize)
  } catch {}
}

let listRequestId = 0, listController, loadedProductQuery = ''
const fetchProducts = async () => {
  const request = ++listRequestId, previous = listController
  listController = new AbortController()
  const params = {
    admin: 1,
    search: searchQuery.value,
    status: productStatusFilter.value,
    page: productPage.value,
    pageSize: productPageSize.value,
  }
  const key = JSON.stringify(params)
  // Preserve the known total so ElPagination does not cancel a pending page.
  if (key !== loadedProductQuery) products.value = []
  productsLoading.value = true
  productError.value = ''
  saveProductTableState()
  const pending = readList('/api/products', { params, signal: listController.signal })
  previous?.abort()
  try {
    const res = await pending
    if (request !== listRequestId) return
    products.value = listData(res)
    loadedProductQuery = key
    handleRouteAction()
    const meta = paginationMeta(res)
    productTotal.value = meta.total || products.value.length
    const lastPage = Math.max(
      1,
      Math.ceil(productTotal.value / productPageSize.value),
    )
    if (productPage.value > lastPage) {
      productPage.value = lastPage
      return fetchProducts()
    }
    if (meta.page && meta.page !== productPage.value)
      productPage.value = meta.page
  } catch (error) {
    if (request !== listRequestId || isQueryCancelled(error)) return
    productError.value = extractErrorMessage(error, '产品列表加载失败')
  } finally {
    if (request === listRequestId) productsLoading.value = false
  }
}

watch(
  () => route.query,
  () => {
    searchQuery.value =
      typeof route.query.search === 'string' ? route.query.search : ''
    productStatusFilter.value = publishStatusOptions.some(
      (item) => item.value === route.query.status,
    )
      ? route.query.status
      : 'all'
    productPage.value = 1
    fetchProducts()
  },
)

let handledRouteAction = ''
function handleRouteAction() {
  const action =
    route.query.create === '1'
      ? 'create'
      : typeof route.query.edit === 'string'
        ? `edit:${route.query.edit}`
        : ''
  if (!action) {
    handledRouteAction = ''
    return
  }
  if (
    !action ||
    handledRouteAction === action ||
    !hasPermission('products:write')
  )
    return
  handledRouteAction = action
  if (action === 'create') openAddProduct()
  else {
    const row = products.value.find(
      (item) => String(item.id) === route.query.edit,
    )
    if (row) openEditProduct(row)
    else ElMessage.warning('未找到该产品，请在列表中重新选择。')
  }
}
const handleProductSearchInput = () => {
  listRequestId++
  listController?.abort()
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

const generateSlug = () => {
  if (isEdit.value) return
  pForm.slug = toSlug(pForm.title || pForm.series || pForm.categoryName)
}

const ensureSlug = () => {
  if (!isEdit.value && !pForm.slug && pForm.title) generateSlug()
}

const catalog = reactive({ categories: [], series: [] })
let catalogController
const loadCatalog = async () => {
  const previous = catalogController
  catalogController = new AbortController()
  const request = readList('/api/catalog', { signal: catalogController.signal })
  previous?.abort()
  try {
    Object.assign(catalog, (await request).data)
  } catch (e) {
    if (!isQueryCancelled(e)) ElMessage.error(extractErrorMessage(e))
  }
}
onMounted(loadCatalog)
const applyTypeTemplate = (type) => {
  const selected = catalog.categories.find((c) => c.slug === type)
  if (selected) {
    pForm.categoryName = selected.name
    if (!pForm.specsText)
      pForm.specsText = safeParse(selected.specTemplate)
        .map((label) => `${label}：`)
        .join('\n')
    return
  }
  const labels = { piano: '钢琴', guitar: '吉他与贝斯', synth: '电子键盘' }
  if (!isEdit.value) pForm.categoryName = labels[type] || ''
}

const openAddProduct = () => {
  if (
    !hasPermission('products:write') ||
    saving.value ||
    workflowBusy.value ||
    pendingUploads.value
  )
    return
  isEdit.value = false
  curId.value = null
  Object.assign(pForm, { ...baseProductForm })
  applyTypeTemplate(pForm.type)
  originalProductPayload.value = productPayload()
  pDiag.value = true
}

const openEditProduct = (row) => {
  if (
    !hasPermission('products:write') ||
    saving.value ||
    workflowBusy.value ||
    pendingUploads.value
  )
    return
  isEdit.value = true
  curId.value = row.id
  const attrs = row.attributes
  productRevision.value = attrs.updatedAt
  Object.assign(pForm, {
    ...baseProductForm,
    ...attrs,
    imageUrl: attrs.image?.data?.attributes?.url || attrs.imageUrl || '',
    galleryText: safeParse(attrs.gallery).join('\n'),
    specsText: specsToText(attrs.specs),
    featuresText: safeParse(attrs.features).join('\n'),
    scenesText: safeParse(attrs.scenes).join('\n'),
  })
  originalProductPayload.value = productPayload()
  pDiag.value = true
}

let versionRequestId = 0
watch(versionDrawerOpen, (open) => {
  if (!open) { versionRequestId++; versionsLoading.value = false }
})
const openVersionDrawer = async (row, append = false) => {
  if (versionsLoading.value) return
  const nextPage = append ? historyPage.value + 1 : 1
  if (!append) historyHasMore.value = false
  const request = ++versionRequestId
  activeVersionProduct.value = row
  versionDrawerOpen.value = true
  if (!append) productVersions.value = []
  versionsLoading.value = true
  try {
    const res = await api.get(`/api/products/${row.id}/versions`, { params: { page: nextPage, pageSize: 30 } })
    if (request !== versionRequestId) return
    productVersions.value = append ? [...productVersions.value, ...listData(res)] : listData(res)
    historyPage.value = nextPage
    historyHasMore.value = nextPage < (res.data.meta?.pagination?.pageCount || 1)
  } catch (error) {
    if (request !== versionRequestId) return
    ElMessage.error(extractErrorMessage(error, '版本记录加载失败'))
  } finally {
    if (request === versionRequestId) versionsLoading.value = false
  }
}

const restoreProductVersion = async (version) => {
  if (!hasPermission('products:write')) return
  if (!activeVersionProduct.value) return
  try {
    await ElMessageBox.confirm(
      `确定将“${activeVersionProduct.value.attributes?.title || '该产品'}”恢复到 ${formatTime(version.createdAt)} 的版本？当前内容会先保存为新的历史版本。`,
      '产品版本回滚确认',
      {
        type: 'warning',
        confirmButtonText: '确认回滚',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }
  restoringVersionId.value = version.id
  try {
    await api.post(
      `/api/products/${activeVersionProduct.value.id}/restore/${version.id}`,
    )
    ElMessage.success('产品已恢复到所选版本')
    versionDrawerOpen.value = false
    await fetchProducts()
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, '产品版本回滚失败'))
  } finally {
    restoringVersionId.value = null
  }
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
  return result.ok && uploads.begin(file)
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
    await ElMessageBox.confirm(
      `确定清空当前 ${galleryPreview.value.length} 张详情图？这不会删除资源库里的图片文件。`,
      '清空详情图集',
      { type: 'warning' },
    )
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
  if (saving.value || workflowBusy.value || pendingUploads.value) return
  galleryDragIndex.value = index
}

const handleGalleryDrop = (targetIndex) => {
  if (saving.value || workflowBusy.value || pendingUploads.value) return
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
  status: '发布状态',
}

const previewCurrentProduct = () => {
  openPreview(`/products/${pForm.slug || curId.value || ''}`)
}

const { confirmLeave } = useUnsavedChanges({
  dirty: () =>
    pDiag.value &&
    changedFieldLabels(
      originalProductPayload.value,
      productPayload(),
      productChangeLabels,
    ).length > 0,
  busy: () => saving.value || workflowBusy.value || pendingUploads.value > 0,
})
const requestCloseProductDialog = async (done) => {
  if (!(await confirmLeave())) return
  if (typeof done === 'function') done()
  else pDiag.value = false
}

const saveProductSafely = async () => {
  if (saving.value || workflowBusy.value || pendingUploads.value) return
  try { await productFormRef.value?.validate() } catch { return }
  if (isEdit.value && pForm.status === 'published') await productWorkflow.value?.saveDraft()
  else await submitProduct()
}
const submitProduct = async (targetStatus = '') => {
  if (!hasPermission('products:write')) return
  if (saving.value || workflowBusy.value) return
  if (pendingUploads.value)
    return ElMessage.info('请等待素材上传完成后再保存。')
  saving.value = true
  const previousStatus = pForm.status
  try {
    await productFormRef.value?.validate()
    if (targetStatus) pForm.status = targetStatus
    const payload = productPayload()
    if (payload.status === 'published') await ElMessageBox.confirm(
      '确认将当前表单直接发布到官网？如需先预览，请取消并保存修改草稿。',
      '确认更新官网', { confirmButtonText: '确认发布', cancelButtonText: '继续核对' },
    )
    const changedFields = changedFieldLabels(
      originalProductPayload.value,
      payload,
      productChangeLabels,
    )
    await api[isEdit.value ? 'put' : 'post'](
      isEdit.value ? `/api/products/${curId.value}` : '/api/products',
      payload,
      isEdit.value ? { headers: { 'If-Match': productRevision.value } } : {},
    )
    pDiag.value = false
    fetchProducts()
    ElMessage.success(
      targetStatus === 'draft'
        ? '草稿已保存'
        : targetStatus === 'published'
          ? '产品已保存并发布'
          : '产品内容已保存',
    )
  } catch (error) {
    if ((error === 'cancel' || error === 'close') && targetStatus)
      pForm.status = previousStatus
    if (error !== 'cancel' && error !== 'close')
      ElMessage.error(extractErrorMessage(error, '请检查产品表单'))
    // 列表里的旧数据会让“重新打开”仍拿到旧版本；刷新列表，弹窗与输入保持不动
    if (isRecordConflict(error)) fetchProducts()
  } finally {
    saving.value = false
  }
}

const handleDelete = async (id) => {
  if (!hasPermission('products:write') || saving.value) return
  saving.value = true
  try {
    await ElMessageBox.confirm(
      '将这个产品移入回收站？官网将不再展示，可在设置的回收站中恢复。',
      '敏感操作确认',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
      },
    )
    await api.delete(`/api/products/${id}`)
    ElMessage.success('已删除')
    fetchProducts()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close')
      ElMessage.error(extractErrorMessage(error, '删除失败，请重试'))
  } finally {
    saving.value = false
  }
}

const handlePageAction = (event) => {
  if (event.detail === 'product:add') openAddProduct()
}

onMounted(() => {
  window.addEventListener('admin-page-action', handlePageAction)
  restoreProductTableState()
  if (typeof route.query.search === 'string') {
    searchQuery.value = route.query.search
    productStatusFilter.value = 'all'
    productPage.value = 1
  }
  if (publishStatusOptions.some((item) => item.value === route.query.status)) {
    productStatusFilter.value = route.query.status
    searchQuery.value = ''
    productPage.value = 1
  }
  fetchProducts()
})

onBeforeUnmount(() => {
  listRequestId++
  listController?.abort()
  catalogController?.abort()
  window.removeEventListener('admin-page-action', handlePageAction)
  window.clearTimeout(productSearchTimer)
})
</script>
