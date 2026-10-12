<template>
  <div class="config-page">
    <div class="config-toolbar">
      <el-select
        v-model="configSection"
        aria-label="配置区域"
        class="config-section-select"
        ><el-option label="首页与品牌介绍" value="home" /><el-option
          label="其他页面海报"
          value="pages" /><el-option label="联系方式与页脚" value="contact"
      /></el-select>
      <div class="filter-row">
        <el-button @click="openPreview('/')">预览首页</el-button
        ><el-button
          v-if="hasPermission('config:write')"
          type="primary"
          :loading="saving"
          :disabled="
            loading || !!loadError || workflowBusy || pendingUploads > 0
          "
          @click="saveConfig"
          >保存并发布</el-button
        >
      </div>
    </div>
    <el-alert
      v-if="loadError"
      :title="loadError"
      type="error"
      show-icon
      :closable="false"
      class="mb-16"
    />
    <el-button v-if="loadError" @click="fetchConfig">重新加载</el-button>
    <ContentWorkflow
      v-if="!loading && !loadError && sysConfig.id"
      module="config"
      :record-id="sysConfig.id"
      :payload="sysConfig"
      :can-write="hasPermission('config:write')"
      :busy="saving || pendingUploads > 0"
      @busy="workflowBusy = $event"
      @saved="originalConfig = JSON.stringify({ ...$event, id: sysConfig.id })"
      @loaded="Object.assign(sysConfig, $event)"
      @published="fetchConfig"
    />
    <div class="config-grid" v-loading="loading">
      <el-card
        v-show="configSection === 'home'"
        class="chart-card mb-20"
        shadow="never"
      >
        <template #header>首页与品牌介绍 </template>
        <el-form
          :disabled="
            !hasPermission('config:write') || loading || !!loadError || saving
          "
          :model="sysConfig"
          label-width="120px"
          label-position="left"
        >
          <el-form-item label="首页主视觉"
            ><image-upload
              :disabled="
                !hasPermission('config:write') ||
                loading ||
                !!loadError ||
                saving
              "
              v-model="sysConfig.heroImageUrl"
              height="200px"
          /></el-form-item>
          <el-form-item label="品牌标题"
            ><el-input v-model="sysConfig.aboutTitle"
          /></el-form-item>
          <el-form-item label="品牌故事正文"
            ><el-input v-model="sysConfig.aboutText" type="textarea" :rows="3"
          /></el-form-item>
        </el-form>
      </el-card>

      <el-card
        v-show="configSection === 'pages'"
        class="chart-card mb-20 accent-green"
        shadow="never"
      >
        <template #header>艺术家页海报</template>
        <el-form
          :disabled="
            !hasPermission('config:write') || loading || !!loadError || saving
          "
          :model="sysConfig"
          label-width="120px"
          label-position="left"
        >
          <el-form-item label="页面海报"
            ><image-upload
              :disabled="
                !hasPermission('config:write') ||
                loading ||
                !!loadError ||
                saving
              "
              v-model="sysConfig.artistHeroImageUrl"
              height="150px"
          /></el-form-item>
        </el-form>
      </el-card>

      <el-card
        v-show="configSection === 'pages'"
        class="chart-card mb-20 accent-gold"
        shadow="never"
      >
        <template #header>专业音响页海报</template>
        <el-form
          :disabled="
            !hasPermission('config:write') || loading || !!loadError || saving
          "
          :model="sysConfig"
          label-width="120px"
          label-position="left"
        >
          <el-form-item label="页面海报"
            ><image-upload
              :disabled="
                !hasPermission('config:write') ||
                loading ||
                !!loadError ||
                saving
              "
              v-model="sysConfig.audioHeroImageUrl"
              height="150px"
          /></el-form-item>
        </el-form>
      </el-card>

      <el-card
        v-show="configSection === 'pages'"
        class="chart-card mb-20 accent-red"
        shadow="never"
      >
        <template #header>支持服务页海报</template>
        <el-form
          :disabled="
            !hasPermission('config:write') || loading || !!loadError || saving
          "
          :model="sysConfig"
          label-width="120px"
          label-position="left"
        >
          <el-form-item label="页面海报"
            ><image-upload
              :disabled="
                !hasPermission('config:write') ||
                loading ||
                !!loadError ||
                saving
              "
              v-model="sysConfig.supportHeroImageUrl"
              height="150px"
          /></el-form-item>
        </el-form>
      </el-card>

      <el-card
        v-show="configSection === 'home'"
        class="chart-card mb-20"
        shadow="never"
      >
        <template #header>产品理念展示</template>
        <el-form
          :disabled="
            !hasPermission('config:write') || loading || !!loadError || saving
          "
          :model="sysConfig"
          label-width="120px"
          label-position="left"
        >
          <el-form-item label="展示区环境大图"
            ><image-upload
              :disabled="
                !hasPermission('config:write') ||
                loading ||
                !!loadError ||
                saving
              "
              v-model="sysConfig.coreTechBgImageUrl"
              height="120px"
          /></el-form-item>
          <el-form-item label="背景叠底颜色"
            ><el-color-picker v-model="sysConfig.coreTechBgColor"
          /></el-form-item>
          <el-divider border-style="dashed" />
          <el-form-item label="核心产品配图"
            ><image-upload
              :disabled="
                !hasPermission('config:write') ||
                loading ||
                !!loadError ||
                saving
              "
              v-model="sysConfig.coreTechImageUrl"
              width="150px"
              height="150px"
          /></el-form-item>
          <el-form-item label="区域大标题"
            ><el-input v-model="sysConfig.coreTechTitle"
          /></el-form-item>
          <el-form-item label="核心理念正文"
            ><el-input
              v-model="sysConfig.coreTechDesc"
              type="textarea"
              :rows="4"
          /></el-form-item>
          <el-form-item label="按钮跳转文案"
            ><el-input v-model="sysConfig.coreTechLinkText"
          /></el-form-item>
        </el-form>
      </el-card>

      <el-card
        v-show="configSection === 'home'"
        class="chart-card mb-20"
        shadow="never"
      >
        <template #header>品牌寄语</template>
        <el-form
          :disabled="
            !hasPermission('config:write') || loading || !!loadError || saving
          "
          :model="sysConfig"
          label-width="120px"
          label-position="left"
        >
          <el-form-item label="名言背景大图"
            ><image-upload
              :disabled="
                !hasPermission('config:write') ||
                loading ||
                !!loadError ||
                saving
              "
              v-model="sysConfig.quoteBgImageUrl"
              height="200px"
          /></el-form-item>
          <el-form-item label="名言正文内容"
            ><el-input v-model="sysConfig.quoteText" type="textarea" :rows="3"
          /></el-form-item>
          <el-form-item label="出处/辅助文案"
            ><el-input v-model="sysConfig.quoteAuthor"
          /></el-form-item>
        </el-form>
      </el-card>

      <el-card
        v-show="configSection === 'contact'"
        class="chart-card"
        shadow="never"
      >
        <template #header>联系方式与页脚</template>
        <el-form
          :disabled="
            !hasPermission('config:write') || loading || !!loadError || saving
          "
          ref="configFormRef"
          :model="sysConfig"
          :rules="rules"
          label-width="120px"
          label-position="left"
        >
          <el-form-item label="官方客服邮箱" prop="contactEmail"
            ><el-input v-model="sysConfig.contactEmail"
          /></el-form-item>
          <el-form-item label="客服电话" prop="contactPhone"
            ><el-input v-model="sysConfig.contactPhone"
          /></el-form-item>
          <el-form-item label="页脚版权信息"
            ><el-input v-model="sysConfig.footerText"
          /></el-form-item>
        </el-form>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import ContentWorkflow from '../components/ContentWorkflow.vue'
const workflowBusy = ref(false)
import { useEditorUploads, useUnsavedChanges } from '../lib/editorLifecycle'
const uploads = useEditorUploads()
const pendingUploads = uploads.pending
const originalConfig = ref('')
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import ImageUpload from '../components/ImageUpload.vue'
import {
  api,
  hasPermission,
  extractErrorMessage,
  isRecordConflict,
  openPreview,
} from '../lib/api'

const configSection = ref('home')
const saving = ref(false)
const loading = ref(false)
const loadError = ref('')
const configFormRef = ref(null)
const sysConfig = ref({
  heroImageUrl: '',
  aboutTitle: '',
  aboutText: '',
  contactEmail: '',
  contactPhone: '',
  footerText: '',
  coreTechImageUrl: '',
  coreTechTitle: '',
  coreTechDesc: '',
  coreTechLinkText: '',
  coreTechBgColor: '#0a0a0a',
  coreTechBgImageUrl: '',
  quoteText: '',
  quoteAuthor: '',
  quoteBgImageUrl: '',
  artistHeroImageUrl: '',
  audioHeroImageUrl: '',
  supportHeroImageUrl: '',
})

const rules = {
  contactEmail: [{ type: 'email', message: '请输入有效邮箱', trigger: 'blur' }],
  contactPhone: [
    {
      pattern: /^[0-9\-+\s()]{6,30}$/,
      message: '请输入有效电话',
      trigger: 'blur',
    },
  ],
}

const fetchConfig = async () => {
  loading.value = true
  loadError.value = ''
  try {
    const res = await api.get('/api/config')
    sysConfig.value = res.data
    originalConfig.value = JSON.stringify(sysConfig.value)
  } catch (error) {
    loadError.value = extractErrorMessage(error, '首页配置加载失败')
  } finally {
    loading.value = false
  }
}

const saveConfig = async () => {
  if (
    saving.value ||
    loading.value ||
    pendingUploads.value ||
    loadError.value ||
    !hasPermission('config:write')
  )
    return
  saving.value = true
  try {
    await configFormRef.value?.validate()
    const payload = JSON.parse(JSON.stringify(sysConfig.value))
    const res = await api.put('/api/config', payload, {
      headers: { 'If-Match': String(payload.revision ?? '') },
    })
    // 后续再次保存要用新版本；只同步版本号，不覆盖保存期间的新输入
    sysConfig.value.revision = res.data.revision
    payload.revision = res.data.revision
    originalConfig.value = JSON.stringify(payload)
    ElMessage.success('已全局同步至官网')
  } catch (error) {
    if (isRecordConflict(error)) offerLatestConfig()
    else if (error) ElMessage.error(extractErrorMessage(error, '请检查配置内容'))
  } finally {
    saving.value = false
  }
}

// 全局配置只有一份表单：不自动刷新以免冲掉输入，由使用者决定是否加载最新内容
const offerLatestConfig = async () => {
  try {
    await ElMessageBox.confirm(
      '全局配置已被其他管理员更新，当前修改未保存。加载最新配置后需要重新填写本次修改；也可以先保留当前输入，记下要改的内容后再加载。',
      '配置已被更新',
      { confirmButtonText: '加载最新配置', cancelButtonText: '保留当前输入', type: 'warning' },
    )
    await fetchConfig()
  } catch {}
}

useUnsavedChanges({
  dirty: () =>
    !!originalConfig.value &&
    JSON.stringify(sysConfig.value) !== originalConfig.value,
  busy: () => saving.value || workflowBusy.value || pendingUploads.value > 0,
})
onMounted(fetchConfig)
</script>
