<template>
  <div class="panel content-panel">
    <div class="table-tools enterprise-table-tools">
      <el-button
        v-if="hasPermission('cms:write')"
        type="primary"
        @click="openAddContent"
        >新增内容</el-button
      >
      <div class="filter-row">
        <el-input
          v-model="contentKeyword"
          placeholder="搜索当前栏目内容"
          :prefix-icon="Search"
          class="w-220"
          clearable
          @input="handleContentSearchInput"
        />
        <el-select
          v-model="contentStatusFilter"
          aria-label="发布状态"
          class="w-140"
          @change="handleContentFilterChange"
        >
          <el-option label="全部状态" value="all" />
          <el-option
            v-for="item in publishStatusOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </div>
    </div>

    <section
      v-if="contentTab === 'pageContent'"
      class="policy-page-quick-entry"
    >
      <div class="policy-page-quick-entry-head">
        <div>
          <strong>正式页面快捷入口</strong>
          <span
            >三个条款页都在这里统一维护，建议先选中对应条目再编辑或预览。</span
          >
        </div>
        <el-button text type="primary" @click="jumpToPolicyPage('privacy')"
          >隐私政策</el-button
        >
      </div>
      <div class="policy-page-quick-entry-grid">
        <article
          v-for="item in policyPageQuickItems"
          :key="item.slug"
          class="policy-page-quick-entry-card"
        >
          <div>
            <strong>{{ item.title }}</strong>
            <small>路由：/info/{{ item.slug }}</small>
            <p>{{ item.desc }}</p>
          </div>
          <div class="policy-page-quick-entry-actions">
            <el-button size="small" @click="selectPolicyPage(item.slug)"
              >定位记录</el-button
            >
            <el-button
              size="small"
              class="dark-btn"
              @click="previewPolicyPage(item.slug)"
              >预览前台</el-button
            >
          </div>
        </article>
      </div>
    </section>

    <el-alert
      v-if="contentError"
      :title="contentError"
      description="请检查网络或后台 API 状态后重试。"
      type="error"
      show-icon
      :closable="false"
      class="mb-16"
    />

    <div class="cms-collection-picker">
      <label>内容栏目</label
      ><el-select
        v-model="contentTab"
        aria-label="内容栏目"
        class="w-220"
        @change="handleContentTabChange"
        ><el-option-group label="服务支持"
          ><el-option label="常见问题" value="faq" /><el-option
            label="下载资料"
            value="download" /><el-option
            label="使用指南"
            value="quickGuide" /></el-option-group
        ><el-option-group label="首页与品牌"
          ><el-option label="首页入口" value="ecosystem" /><el-option
            label="品牌历程"
            value="timeline" /><el-option
            label="条款与独立页面"
            value="pageContent" /></el-option-group
        ><el-option-group label="专业音响"
          ><el-option label="音响解决方案" value="audioSol" /><el-option
            label="音响技术指标"
            value="audioStat" /></el-option-group></el-select
      ><el-button text @click="previewCurrentContentTab">预览栏目 ↗</el-button>
    </div>
    <div class="cms-collections">
      <section v-if="contentTab === 'faq'">
        <content-table
          :rows="contentData.faq"
          endpoint="support-faqs"
          :loading="contentLoading.faq"
          @edit="openEditContent"
          @delete="handleDelete"
          @preview="previewRow"
          @version="openContentVersionDrawer"
        >
          <el-table-column
            prop="question"
            label="问题摘要"
            min-width="250"
            show-overflow-tooltip
          />
          <el-table-column prop="category" label="分类" width="110"
            ><template #default="{ row }">{{
              faqCategoryLabel(row.category)
            }}</template></el-table-column
          >
          <el-table-column
            prop="answer"
            label="详细解答"
            min-width="300"
            show-overflow-tooltip
          />
        </content-table>
      </section>
      <section v-if="contentTab === 'download'">
        <content-table
          :rows="contentData.download"
          endpoint="support-downloads"
          :loading="contentLoading.download"
          @edit="openEditContent"
          @delete="handleDelete"
          @preview="previewRow"
          @version="openContentVersionDrawer"
        >
          <el-table-column prop="name" label="资源名称" min-width="240" />
          <el-table-column prop="type" label="文件类型" width="150" />
          <el-table-column prop="size" label="文件大小" width="120" />
        </content-table>
      </section>
      <section v-if="contentTab === 'audioSol'">
        <content-table
          :rows="contentData.audioSol"
          endpoint="audio-solutions"
          :loading="contentLoading.audioSol"
          @edit="openEditContent"
          @delete="handleDelete"
          @preview="previewRow"
          @version="openContentVersionDrawer"
        >
          <el-table-column label="背景预览" width="120" align="center"
            ><template #default="{ row }"
              ><img
                :src="mediaSrc(row.imageUrl)"
                v-if="row.imageUrl"
                class="mini-preview" /></template
          ></el-table-column>
          <el-table-column prop="title" label="中文大标题" width="200" />
          <el-table-column prop="en" label="英文副标" width="200" />
          <el-table-column
            prop="desc"
            label="核心描述"
            min-width="260"
            show-overflow-tooltip
          />
        </content-table>
      </section>
      <section v-if="contentTab === 'audioStat'">
        <content-table
          :rows="contentData.audioStat"
          endpoint="audio-stats"
          :loading="contentLoading.audioStat"
          @edit="openEditContent"
          @delete="handleDelete"
          @preview="previewRow"
          @version="openContentVersionDrawer"
        >
          <el-table-column prop="label" label="指标名称" width="200" />
          <el-table-column prop="value" label="技术数值" width="160" />
          <el-table-column
            prop="desc"
            label="补充描述"
            min-width="260"
            show-overflow-tooltip
          />
        </content-table>
      </section>
      <section v-if="contentTab === 'timeline'">
        <content-table
          :rows="contentData.timeline"
          endpoint="brand-timelines"
          :loading="contentLoading.timeline"
          @edit="openEditContent"
          @delete="handleDelete"
          @preview="previewRow"
          @version="openContentVersionDrawer"
        >
          <el-table-column label="纪实图" width="100" align="center"
            ><template #default="{ row }"
              ><img
                :src="mediaSrc(row.imageUrl)"
                v-if="row.imageUrl"
                class="mini-preview-portrait" /></template
          ></el-table-column>
          <el-table-column prop="year" label="时代/年份" width="140" />
          <el-table-column prop="title" label="标题" width="220" />
          <el-table-column
            prop="desc"
            label="故事"
            min-width="260"
            show-overflow-tooltip
          />
        </content-table>
      </section>
      <section v-if="contentTab === 'ecosystem'">
        <content-table
          :rows="contentData.ecosystem"
          endpoint="ecosystem-services"
          :loading="contentLoading.ecosystem"
          @edit="openEditContent"
          @delete="handleDelete"
          @preview="previewRow"
          @version="openContentVersionDrawer"
        >
          <el-table-column label="图片" width="120" align="center"
            ><template #default="{ row }"
              ><img
                :src="mediaSrc(row.imageUrl)"
                v-if="row.imageUrl"
                class="mini-preview" /></template
          ></el-table-column>
          <el-table-column prop="icon" label="图标短字" width="100" />
          <el-table-column prop="title" label="标题" width="180" />
          <el-table-column prop="link" label="跳转" width="150" />
          <el-table-column
            prop="desc"
            label="描述"
            min-width="260"
            show-overflow-tooltip
          />
        </content-table>
      </section>
      <section v-if="contentTab === 'quickGuide'">
        <content-table
          :rows="contentData.quickGuide"
          endpoint="quick-guides"
          :loading="contentLoading.quickGuide"
          @edit="openEditContent"
          @delete="handleDelete"
          @preview="previewRow"
          @version="openContentVersionDrawer"
        >
          <el-table-column label="封面" width="120" align="center"
            ><template #default="{ row }"
              ><img
                :src="mediaSrc(row.coverUrl)"
                v-if="row.coverUrl"
                class="mini-preview" /></template
          ></el-table-column>
          <el-table-column prop="title" label="标题" min-width="220" />
          <el-table-column prop="duration" label="时长" width="100" />
          <el-table-column prop="category" label="品类" width="140" />
        </content-table>
      </section>
      <section v-if="contentTab === 'pageContent'">
        <content-table
          ref="pageContentTableRef"
          :rows="contentData.pageContent"
          endpoint="page-contents"
          :loading="contentLoading.pageContent"
          @edit="openEditContent"
          @delete="handleDelete"
          @preview="previewRow"
          @version="openContentVersionDrawer"
        >
          <el-table-column prop="slug" label="路由后缀" width="180" />
          <el-table-column prop="title" label="页面标题" min-width="240" />
          <el-table-column
            prop="content"
            label="正文摘要"
            min-width="300"
            show-overflow-tooltip
          />
        </content-table>
      </section>
    </div>

    <div class="table-pagination">
      <span class="pagination-total"
        >当前栏目共 {{ currentContentTotal }} 条内容</span
      >
      <el-pagination
        v-model:current-page="contentPage"
        v-model:page-size="contentPageSize"
        :total="currentContentTotal"
        layout="slot, prev, pager, next"
        background
        @current-change="handleContentPageChange"
      >
        <span class="el-pagination__sizes">
          <el-select
            v-model="contentPageSize"
            aria-label="每页显示条数"
            @change="handleContentPageSizeChange"
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
      v-model="cDiag"
      :title="isEdit ? '编辑页面内容' : '新增页面内容'"
      width="720px"
      class="dark-dialog"
      append-to-body
      destroy-on-close
      :before-close="requestCloseContentDialog"
    >
      <el-form
        ref="contentFormRef"
        :disabled="saving || pendingUploads > 0"
        :model="cForm"
        :rules="contentRules"
        label-width="112px"
      >
        <section class="form-section is-emphasis">
          <div class="form-section-title">
            <strong>发布设置</strong>
            <span>草稿不会公开展示；隐藏适合临时下线；确认无误后再发布。</span>
          </div>
          <el-form-item label="发布状态"
            ><el-select v-model="cForm.status" class="full"
              ><el-option
                v-for="item in publishStatusOptions"
                :key="item.value"
                :label="item.label"
                :value="item.value" /></el-select
          ></el-form-item>
        </section>

        <section class="form-section">
          <div class="form-section-title">
            <strong>内容字段</strong>
            <span
              >当前栏目只显示需要维护的字段，带红色提示的内容建议优先补齐。</span
            >
          </div>
          <template v-if="contentTab === 'faq'">
            <el-form-item label="问题" prop="question"
              ><el-input v-model="cForm.question"
            /></el-form-item>
            <el-form-item label="分类" prop="category"
              ><el-select v-model="cForm.category" class="full"
                ><el-option
                  v-for="item in faqCategories"
                  :key="item.value"
                  :label="item.label"
                  :value="item.value" /></el-select
            ></el-form-item>
            <el-form-item label="解答"
              ><el-input
                type="textarea"
                :rows="4"
                v-model="cForm.answer"
                maxlength="800"
                show-word-limit
            /></el-form-item>
          </template>
          <template v-else-if="contentTab === 'download'">
            <el-form-item label="真实文件">
              <el-upload
                :http-request="uploadRequest"
                class="file-upload"
                :action="`${BASE}/api/upload`"
                :headers="adminUploadHeaders()"
                :accept="DOCUMENT_ACCEPT"
                :before-upload="beforeDocumentUpload"
                :show-file-list="false"
                :on-success="
                  (res, file) =>
                    uploads.complete(file, () => handleFileSuccess(res, file))
                "
                :on-error="
                  (error, file) =>
                    uploads.complete(file, () => handleUploadError(error))
                "
              >
                <el-button type="primary" plain class="dark-btn"
                  >上传资料 (PDF/ZIP/RAR)</el-button
                >
                <div v-if="cForm.fileUrl" class="ready-text">文件已就绪</div>
              </el-upload>
              <p class="field-hint">{{ documentUploadHint }}</p>
            </el-form-item>
            <el-form-item label="资源名称" prop="name"
              ><el-input v-model="cForm.name"
            /></el-form-item>
            <el-form-item label="文件类型" prop="type"
              ><el-input v-model="cForm.type"
            /></el-form-item>
            <el-form-item label="文件大小"
              ><el-input v-model="cForm.size"
            /></el-form-item>
          </template>
          <template v-else-if="contentTab === 'audioSol'">
            <el-form-item label="精美配图"
              ><image-upload
                v-model="cForm.imageUrl"
                width="220px"
                height="130px"
            /></el-form-item>
            <el-form-item label="英文副标" prop="en"
              ><el-input v-model="cForm.en"
            /></el-form-item>
            <el-form-item label="中文大标题" prop="title"
              ><el-input v-model="cForm.title"
            /></el-form-item>
            <el-form-item label="核心描述"
              ><el-input type="textarea" :rows="3" v-model="cForm.desc"
            /></el-form-item>
          </template>
          <template v-else-if="contentTab === 'audioStat'">
            <el-form-item label="指标短标" prop="label"
              ><el-input v-model="cForm.label"
            /></el-form-item>
            <el-form-item label="核心数值" prop="value"
              ><el-input v-model="cForm.value"
            /></el-form-item>
            <el-form-item label="通俗描述"
              ><el-input type="textarea" :rows="2" v-model="cForm.desc"
            /></el-form-item>
          </template>
          <template v-else-if="contentTab === 'timeline'">
            <el-form-item label="历史纪实图"
              ><image-upload
                v-model="cForm.imageUrl"
                width="140px"
                height="170px"
            /></el-form-item>
            <el-form-item label="时代/年份" prop="year"
              ><el-input v-model="cForm.year"
            /></el-form-item>
            <el-form-item label="纪元大标题" prop="title"
              ><el-input v-model="cForm.title"
            /></el-form-item>
            <el-form-item label="详细故事"
              ><el-input type="textarea" :rows="4" v-model="cForm.desc"
            /></el-form-item>
          </template>
          <template v-else-if="contentTab === 'ecosystem'">
            <el-form-item label="卡片图片"
              ><image-upload
                v-model="cForm.imageUrl"
                width="220px"
                height="130px"
            /></el-form-item>
            <el-form-item label="图标短字" prop="icon"
              ><el-input v-model="cForm.icon"
            /></el-form-item>
            <el-form-item label="卡片标题" prop="title"
              ><el-input v-model="cForm.title"
            /></el-form-item>
            <el-form-item label="服务描述"
              ><el-input type="textarea" :rows="3" v-model="cForm.desc"
            /></el-form-item>
            <el-form-item label="跳转路由" prop="link"
              ><el-input v-model="cForm.link"
            /></el-form-item>
          </template>
          <template v-else-if="contentTab === 'quickGuide'">
            <el-form-item label="视频封面"
              ><image-upload
                v-model="cForm.coverUrl"
                width="220px"
                height="120px"
            /></el-form-item>
            <el-form-item label="视频文件">
              <el-upload
                :http-request="uploadRequest"
                class="file-upload"
                :action="`${BASE}/api/upload`"
                :headers="adminUploadHeaders()"
                :accept="VIDEO_ACCEPT"
                :before-upload="beforeVideoUpload"
                :show-file-list="false"
                :on-success="
                  (res, file) =>
                    uploads.complete(file, () => handleVideoSuccess(res, file))
                "
                :on-error="
                  (error, file) =>
                    uploads.complete(file, () => handleUploadError(error))
                "
              >
                <el-button type="primary" plain class="dark-btn"
                  >上传 MP4 视频</el-button
                >
                <div v-if="cForm.videoUrl" class="ready-text">视频已就绪</div>
              </el-upload>
              <p class="field-hint">{{ videoUploadHint }}</p>
            </el-form-item>
            <el-form-item label="视频标题" prop="title"
              ><el-input v-model="cForm.title"
            /></el-form-item>
            <el-form-item label="视频总时长" prop="duration"
              ><el-input v-model="cForm.duration"
            /></el-form-item>
            <el-form-item label="所属品类" prop="category"
              ><el-input v-model="cForm.category"
            /></el-form-item>
          </template>
          <template v-else-if="contentTab === 'pageContent'">
            <el-form-item label="路由后缀" prop="slug"
              ><el-input v-model="cForm.slug" :disabled="isEdit"
            /></el-form-item>
            <el-form-item label="页面主标题" prop="title"
              ><el-input v-model="cForm.title"
            /></el-form-item>
            <el-form-item label="长篇富文本"
              ><el-input
                type="textarea"
                :rows="12"
                v-model="cForm.content"
                maxlength="5000"
                show-word-limit
            /></el-form-item>
          </template>
        </section>

        <section v-if="contentTab !== 'pageContent'" class="form-section">
          <div class="form-section-title">
            <strong>排序与预览</strong>
            <span>数值越小通常越靠前，保存后可通过前台预览确认展示位置。</span>
          </div>
          <el-form-item label="排序权重"
            ><el-input-number v-model="cForm.sortOrder" :min="0" class="full"
          /></el-form-item>
        </section>
        <section
          v-if="['faq', 'download', 'quickGuide'].includes(contentTab)"
          class="form-section"
        >
          <h3>适用乐器与资料版本</h3>
          <el-form-item label="关联产品"
            ><el-select
              :model-value="safeProductIds(cForm.productIds)"
              multiple
              filterable
              @update:model-value="cForm.productIds = JSON.stringify($event)"
              ><el-option
                v-for="p in supportProducts"
                :key="p.id"
                :label="p.attributes?.title || p.title"
                :value="p.id"
            /></el-select>
            <p class="field-hint">留空表示适用于所有产品。</p></el-form-item
          >
          <el-form-item label="适用系列"
            ><el-input v-model="cForm.series" placeholder="留空适用所有系列"
          /></el-form-item>
          <div v-if="contentTab === 'download'" class="form-two-columns">
            <el-form-item label="版本"
              ><el-input
                v-model="cForm.version"
                placeholder="例如 1.2" /></el-form-item
            ><el-form-item label="语言"
              ><el-select v-model="cForm.language"
                ><el-option label="简体中文" value="zh-CN" /><el-option
                  label="English"
                  value="en" /></el-select></el-form-item
            ><el-form-item label="资料发布日期"
              ><el-date-picker
                v-model="cForm.releasedAt"
                value-format="YYYY-MM-DDTHH:mm:ssZ"
            /></el-form-item>
          </div>
        </section>
        <ContentWorkflow
          v-if="isEdit"
          :module="contentModels[contentTab]"
          :record-id="curId"
          :payload="contentPayload()"
          :preview-path="
            contentTab === 'pageContent'
              ? `/info/${cForm.slug}`
              : contentPreviewRoutes[contentTab]
          "
          :busy="saving || pendingUploads > 0"
          @busy="workflowBusy = $event"
          @saved="originalContentPayload = $event"
          @loaded="Object.assign(cForm, $event)"
          @published="handleWorkflowPublished"
        />
      </el-form>
      <template #footer>
        <p v-if="pendingUploads" class="upload-status" role="status">
          素材上传中，请完成后保存（{{ pendingUploads }}）
        </p>
        <div class="dialog-footer-actions">
          <span class="dialog-footer-hint">{{ contentChangeHint }}</span>
          <div class="dialog-footer-buttons">
            <el-button @click="requestCloseContentDialog()">取消</el-button>
            <el-button
              class="dark-btn"
              :disabled="
                !isEdit || originalContentPayload?.status !== 'published'
              "
              @click="previewCurrentDraft"
              >查看已发布页面</el-button
            >
            <el-button
              v-if="hasPermission('cms:write')"
              type="primary"
              :loading="saving"
              :disabled="pendingUploads > 0"
              @click="submitContent()"
              >保存内容</el-button
            >
          </div>
        </div>
      </template>
    </el-dialog>

    <el-drawer
      v-model="contentVersionDrawerOpen"
      title="CMS 内容版本历史"
      size="620px"
      class="dark-drawer"
      append-to-body
    >
      <template v-if="activeVersionContent">
        <div class="version-current">
          <strong>{{ getContentTitle(activeVersionContent) }}</strong>
          <span
            >{{ activeVersionEndpoint }} / ID
            {{ activeVersionContent.id }}</span
          >
        </div>

        <el-alert
          title="回滚会把当前 CMS 内容恢复到所选历史快照，并自动保存当前内容作为可恢复记录。"
          type="warning"
          :closable="false"
          show-icon
          class="mb-16"
        />

        <div v-if="contentVersionsLoading" class="empty-panel compact-empty">
          版本记录加载中...
        </div>
        <div
          v-else-if="contentVersions.length === 0"
          class="empty-panel compact-empty"
        >
          暂无历史版本。内容创建或编辑后会自动生成版本记录。
        </div>
        <div v-else class="version-list">
          <article
            v-for="version in contentVersions"
            :key="version.id"
            class="version-item"
          >
            <div class="version-item-main">
              <strong>{{
                version.title || getContentTitle(activeVersionContent)
              }}</strong>
              <span
                >{{ formatTime(version.createdAt) }} /
                {{ version.operator || '系统' }}</span
              >
              <small>{{ contentVersionSummary(version) }}</small>
            </div>
            <el-button
              v-if="hasPermission('cms:write')"
              type="warning"
              plain
              :loading="restoringContentVersionId === version.id"
              @click="restoreContentVersion(version)"
              >回滚</el-button
            >
          </article>
        </div>
        <el-button v-if="historyHasMore" :disabled="contentVersionsLoading" @click="openContentVersionDrawer(activeVersionContent, activeVersionEndpoint, true)">加载更早版本</el-button>
      </template>
    </el-drawer>

    <el-drawer
      v-model="policyPageDrawerOpen"
      title="正式页面快捷管理"
      size="420px"
      class="dark-drawer"
      append-to-body
    >
      <div class="policy-page-drawer">
        <p class="policy-page-drawer-hint">
          隐私政策、使用条款、售后/保修说明属于正式公开页面，建议在这里统一检查状态和预览。
        </p>
        <div
          v-for="item in policyPageQuickItems"
          :key="item.slug"
          class="policy-page-drawer-item"
        >
          <div>
            <strong>{{ item.title }}</strong>
            <span>/info/{{ item.slug }}</span>
          </div>
          <div class="policy-page-drawer-actions">
            <el-button size="small" @click="selectPolicyPage(item.slug)"
              >选中</el-button
            >
            <el-button
              size="small"
              class="dark-btn"
              @click="previewPolicyPage(item.slug)"
              >预览</el-button
            >
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
const handleWorkflowPublished = () => { cDiag.value = false; fetchContent(contentTab.value) }
import { uploadRequest } from '../lib/uploadRequest'
import ContentWorkflow from '../components/ContentWorkflow.vue'
const workflowBusy = ref(false)
import { useEditorUploads, useUnsavedChanges } from '../lib/editorLifecycle'
const uploads = useEditorUploads()
const pendingUploads = uploads.pending
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import ContentTable from '../components/ContentTable.vue'
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
import {
  faqCategories,
  faqCategoryLabel,
  publishStatusOptions,
} from '../lib/meta'
import { formatTime, qualityResult } from '../lib/format'
import {
  DOCUMENT_ACCEPT,
  VIDEO_ACCEPT,
  documentUploadHint,
  formatBytes,
  validateUploadFile,
  videoUploadHint,
} from '../lib/uploadPolicy'
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
const saving = ref(false)
const isEdit = ref(false)
const curId = ref(null)
// 打开时的记录版本；保存时用 If-Match 提交，记录已被他人改过则返回 409，表单保持不动
const curRevision = ref(null)
const contentFormRef = ref(null)
const cForm = reactive({})
const contentVersionDrawerOpen = ref(false)
const contentVersionsLoading = ref(false)
const restoringContentVersionId = ref(null)
const activeVersionContent = ref(null)
const activeVersionEndpoint = ref('')
const contentVersions = ref([])
const historyPage = ref(1), historyHasMore = ref(false)
const pageContentTableRef = ref(null)
const policyPageDrawerOpen = ref(false)
const originalContentPayload = ref(null)
const policyPageQuickItems = [
  {
    slug: 'privacy',
    title: '隐私政策',
    desc: '说明个人信息收集、保存、使用、删除和第三方服务规则。',
  },
  {
    slug: 'terms',
    title: '使用条款',
    desc: '说明网站使用边界、知识产权、免责声明和争议处理方式。',
  },
  {
    slug: 'warranty',
    title: '售后/保修说明',
    desc: '说明保修范围、送修流程、费用规则和售后支持方式。',
  },
]
const contentModels = {
  faq: 'supportFaq',
  download: 'supportDownload',
  audioSol: 'audioSolution',
  audioStat: 'audioStat',
  timeline: 'brandTimeline',
  ecosystem: 'ecosystemService',
  quickGuide: 'quickGuide',
  pageContent: 'pageContent',
}
const supportProducts = ref([])
const safeProductIds = (value) => {
  try {
    return JSON.parse(value || '[]')
  } catch {
    return []
  }
}
onMounted(async () => {
  try {
    let page = 1,
      count = 1
    do {
      const r = await api.get('/api/products', {
        params: { admin: 1, page, pageSize: 100 },
      })
      supportProducts.value.push(...listData(r))
      count = paginationMeta(r).pageCount || 1
      page++
    } while (page <= count)
  } catch {}
})
const contentEndpoints = {
  faq: 'support-faqs',
  download: 'support-downloads',
  audioSol: 'audio-solutions',
  audioStat: 'audio-stats',
  timeline: 'brand-timelines',
  ecosystem: 'ecosystem-services',
  quickGuide: 'quick-guides',
  pageContent: 'page-contents',
}
const contentPreviewRoutes = {
  faq: '/support',
  download: '/support',
  audioSol: '/audio',
  audioStat: '/audio',
  timeline: '/info/brand-story',
  ecosystem: '/',
  quickGuide: '/support',
  pageContent: '/info/brand-story',
}
const contentData = reactive({
  faq: [],
  download: [],
  audioSol: [],
  audioStat: [],
  timeline: [],
  ecosystem: [],
  quickGuide: [],
  pageContent: [],
})
const defaultForms = {
  faq: {
    productIds: '[]',
    series: '',
    question: '',
    answer: '',
    category: 'general',
    sortOrder: 0,
    status: 'draft',
  },
  download: {
    productIds: '[]',
    series: '',
    version: '',
    language: 'zh-CN',
    releasedAt: null,
    name: '',
    type: 'Manual',
    size: '',
    fileUrl: '',
    sortOrder: 0,
    status: 'draft',
  },
  audioSol: {
    title: '',
    en: '',
    desc: '',
    imageUrl: '',
    sortOrder: 0,
    status: 'draft',
  },
  audioStat: { label: '', value: '', desc: '', sortOrder: 0, status: 'draft' },
  timeline: {
    year: '',
    title: '',
    desc: '',
    imageUrl: '',
    sortOrder: 0,
    status: 'draft',
  },
  ecosystem: {
    icon: '',
    title: '',
    desc: '',
    imageUrl: '',
    link: '',
    sortOrder: 0,
    status: 'draft',
  },
  quickGuide: {
    productIds: '[]',
    series: '',
    title: '',
    duration: '',
    category: '',
    coverUrl: '',
    videoUrl: '',
    sortOrder: 0,
    status: 'draft',
  },
  pageContent: { slug: '', title: '', content: '', status: 'draft' },
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
    {
      pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      message: '只能使用小写字母、数字和短横线',
      trigger: 'blur',
    },
  ],
  content: [],
}

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
  status: '发布状态',
}

const contentPayload = () => {
  const payload = { ...cForm }
  delete payload.id
  return payload
}

const contentChangeHint = computed(() =>
  changedFieldSentence(
    originalContentPayload.value,
    contentPayload(),
    contentChangeLabels,
    isEdit.value
      ? '当前没有未保存修改。'
      : '新内容可先保存草稿，确认后再发布。',
  ),
)

const currentContentTotal = computed(() =>
  Number(contentTotal[contentTab.value] || 0),
)

const getContentTitle = (row = {}) =>
  row.title ||
  row.question ||
  row.name ||
  row.label ||
  row.slug ||
  row.year ||
  row.icon ||
  '未命名内容'

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
    snapshot.content ? `正文：${String(snapshot.content).slice(0, 42)}` : '',
  ].filter(Boolean)
  return parts.join(' / ') || '历史快照'
}

const saveContentState = () => {
  try {
    window.localStorage.setItem(
      contentStateKey,
      JSON.stringify({
        tab: contentTab.value,
        keyword: contentKeyword.value,
        status: contentStatusFilter.value,
        page: contentPage.value,
        pageSize: contentPageSize.value,
      }),
    )
  } catch {}
}

const restoreContentState = () => {
  try {
    const state = JSON.parse(
      window.localStorage.getItem(contentStateKey) || '{}',
    )
    if (state.tab && contentEndpoints[state.tab]) contentTab.value = state.tab
    if (typeof state.keyword === 'string') contentKeyword.value = state.keyword
    if (typeof state.status === 'string')
      contentStatusFilter.value = state.status
    if (Number.isFinite(Number(state.page)))
      contentPage.value = Number(state.page)
    if (Number.isFinite(Number(state.pageSize)))
      contentPageSize.value = Number(state.pageSize)
  } catch {}
}

const listRequestIds = {}
const fetchContent = async (type) => {
  const request = (listRequestIds[type] = (listRequestIds[type] || 0) + 1)
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
        pageSize: contentPageSize.value,
      },
    })
    if (request !== listRequestIds[type]) return
    contentData[type] = listData(res)
    contentTotal[type] = paginationMeta(res).total
    const last = Math.max(
      1,
      Math.ceil(contentTotal[type] / contentPageSize.value),
    )
    if (type === contentTab.value && contentPage.value > last) {
      contentPage.value = last
      return fetchContent(type)
    }
  } catch (error) {
    if (request !== listRequestIds[type]) return
    if (type === contentTab.value)
      contentError.value = extractErrorMessage(error, '内容列表加载失败')
    contentData[type] = []
    contentTotal[type] = 0
  } finally {
    if (request === listRequestIds[type]) contentLoading[type] = false
  }
}

const fetchAllContent = () =>
  Object.keys(contentEndpoints).forEach(fetchContent)

const handleContentTabChange = () => {
  contentPage.value = 1
  fetchContent(contentTab.value)
}

const handleContentSearchInput = () => {
  contentPage.value = 1
  window.clearTimeout(contentSearchTimer)
  contentSearchTimer = window.setTimeout(
    () => fetchContent(contentTab.value),
    260,
  )
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
  if (!hasPermission('cms:write')) return
  isEdit.value = false
  curId.value = null
  curRevision.value = null
  Object.keys(cForm).forEach((key) => delete cForm[key])
  Object.assign(cForm, { ...defaultForms[contentTab.value] })
  originalContentPayload.value = contentPayload()
  cDiag.value = true
}

const openEditContent = (row) => {
  if (!hasPermission('cms:write')) return
  isEdit.value = true
  curId.value = row.id
  curRevision.value = row.revision ?? null
  Object.keys(cForm).forEach((key) => delete cForm[key])
  Object.assign(cForm, { ...defaultForms[contentTab.value], ...row })
  originalContentPayload.value = contentPayload()
  cDiag.value = true
}

const { confirmLeave } = useUnsavedChanges({
  dirty: () =>
    cDiag.value &&
    changedFieldLabels(
      originalContentPayload.value,
      contentPayload(),
      contentChangeLabels,
    ).length > 0,
  busy: () => saving.value || workflowBusy.value || pendingUploads.value > 0,
})
const requestCloseContentDialog = async (done) => {
  if (!(await confirmLeave())) return
  if (typeof done === 'function') done()
  else cDiag.value = false
}

const submitContent = async (targetStatus = '') => {
  if (!hasPermission('cms:write')) return
  if (saving.value) return
  if (pendingUploads.value)
    return ElMessage.info('请等待素材上传完成后再保存。')
  saving.value = true
  const previousStatus = cForm.status
  try {
    await contentFormRef.value?.validate()
    const ep = contentEndpoints[contentTab.value]
    if (targetStatus) cForm.status = targetStatus
    const payload = contentPayload()
    const changedFields = changedFieldLabels(
      originalContentPayload.value,
      payload,
      contentChangeLabels,
    )

    if (targetStatus === 'published') {
      await ElMessageBox.confirm(
        '确认发布当前内容？发布后将进入对应前台页面。',
        '发布前确认',
        {
          type: 'info',
        },
      )
    }
    await api[isEdit.value ? 'put' : 'post'](
      isEdit.value ? `/api/${ep}/${curId.value}` : `/api/${ep}`,
      payload,
      isEdit.value
        ? { headers: { 'If-Match': String(curRevision.value ?? '') } }
        : {},
    )
    cDiag.value = false
    fetchContent(contentTab.value)
    ElMessage.success(
      targetStatus === 'draft'
        ? '草稿已保存'
        : targetStatus === 'hidden'
          ? '内容已隐藏'
          : targetStatus === 'published'
            ? '内容已发布'
            : payload.status === 'draft'
              ? '草稿已保存'
              : '内容已保存',
    )
  } catch (error) {
    if ((error === 'cancel' || error === 'close') && targetStatus)
      cForm.status = previousStatus
    if (error !== 'cancel' && error !== 'close')
      ElMessage.error(extractErrorMessage(error, '请检查内容表单'))
    // 列表里的旧数据会让“重新打开”仍拿到旧版本；刷新列表，弹窗与输入保持不动
    if (isRecordConflict(error)) fetchContent(contentTab.value)
  } finally {
    saving.value = false
  }
}

const handleDelete = async (id, endpoint) => {
  if (!hasPermission('cms:write') || saving.value) return
  saving.value = true
  try {
    await ElMessageBox.confirm(
      '将这条内容移入回收站？对应官网区块将不再展示，可在设置的回收站中恢复。',
      '敏感操作确认',
      {
        type: 'warning',
        confirmButtonText: '确认删除',
        cancelButtonText: '取消',
      },
    )
    await api.delete(`/api/${endpoint}/${id}`)
    fetchContent(contentTab.value)
    ElMessage.success('已删除')
  } catch (error) {
    if (error !== 'cancel' && error !== 'close')
      ElMessage.error(extractErrorMessage(error, '删除失败，请重试'))
  } finally {
    saving.value = false
  }
}

const previewCurrentContentTab = () => {
  const firstPage =
    contentTab.value === 'pageContent'
      ? contentData.pageContent.find((item) => item.slug)
      : null
  openPreview(
    firstPage
      ? `/info/${firstPage.slug}`
      : contentPreviewRoutes[contentTab.value],
  )
}

const previewCurrentDraft = () => {
  if (contentTab.value === 'pageContent' && cForm.slug)
    openPreview(`/info/${cForm.slug}`)
  else previewCurrentContentTab()
}

const previewRow = (row) => {
  if (contentTab.value === 'pageContent' && row.slug)
    openPreview(`/info/${row.slug}`)
  else openPreview(contentPreviewRoutes[contentTab.value])
}

const selectPolicyPage = async (slug) => {
  try {
    const res = await api.get('/api/page-contents', {
      params: { admin: 1, slug, pageSize: 1 },
    })
    const target = listData(res)[0]
    if (!target) return ElMessage.warning(`未找到 ${slug} 对应的页面`)
    contentTab.value = 'pageContent'
    openEditContent({ ...target })
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, '定位页面失败'))
  }
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

let versionRequestId = 0
watch(contentVersionDrawerOpen, (open) => {
  if (!open) { versionRequestId++; contentVersionsLoading.value = false }
})
const openContentVersionDrawer = async (row, endpoint, append = false) => {
  if (contentVersionsLoading.value) return
  const nextPage = append ? historyPage.value + 1 : 1
  if (!append) historyHasMore.value = false
  const request = ++versionRequestId
  activeVersionContent.value = row
  activeVersionEndpoint.value = endpoint
  contentVersionDrawerOpen.value = true
  if (!append) contentVersions.value = []
  contentVersionsLoading.value = true
  try {
    const res = await api.get(`/api/${endpoint}/${row.id}/versions`, { params: { page: nextPage, pageSize: 30 } })
    if (request !== versionRequestId) return
    contentVersions.value = append ? [...contentVersions.value, ...listData(res)] : listData(res)
    historyPage.value = nextPage
    historyHasMore.value = nextPage < (res.data.meta?.pagination?.pageCount || 1)
  } catch (error) {
    if (request !== versionRequestId) return
    ElMessage.error(extractErrorMessage(error, 'CMS 版本记录加载失败'))
  } finally {
    if (request === versionRequestId) contentVersionsLoading.value = false
  }
}

const restoreContentVersion = async (version) => {
  if (!hasPermission('cms:write')) return
  if (!activeVersionContent.value || !activeVersionEndpoint.value) return
  try {
    await ElMessageBox.confirm(
      `确定将“${getContentTitle(activeVersionContent.value)}”恢复到 ${formatTime(version.createdAt)} 的版本？当前内容会先保存为新的历史版本。`,
      'CMS 内容版本回滚确认',
      {
        type: 'warning',
        confirmButtonText: '确认回滚',
        cancelButtonText: '取消',
      },
    )
  } catch {
    return
  }
  restoringContentVersionId.value = version.id
  try {
    await api.post(
      `/api/${activeVersionEndpoint.value}/${activeVersionContent.value.id}/restore/${version.id}`,
    )
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
  return result.ok && uploads.begin(file)
}

const beforeVideoUpload = (file) => {
  const result = validateUploadFile(file, { kind: 'video' })
  if (!result.ok) ElMessage.warning(result.message)
  return result.ok && uploads.begin(file)
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
