<template>
  <div :style="{ width }">
    <el-upload
      :http-request="uploadRequest"
      ref="uploadRef"
      class="up-box"
      :disabled="disabled || uploading"
      :aria-label="disabled ? '图片预览' : '上传或替换图片'"
      :style="{ width: '100%', height }"
      :action="`${BASE}/api/upload`"
      :headers="adminUploadHeaders()"
      :accept="IMAGE_ACCEPT"
      :show-file-list="false"
      :before-upload="beforeUpload"
      :on-success="handleSuccess"
      :on-error="handleError"
    >
      <img
        v-if="modelValue"
        :src="mediaSrc(modelValue)"
        class="up-img"
        alt="当前图片"
        :style="{ height }"
      />
      <div v-else class="up-icon" :style="{ height, lineHeight: height }">
        <el-icon><Plus /></el-icon>
      </div>
    </el-upload>
    <p v-if="uploading" class="upload-status" role="status">正在上传…</p>
    <MediaPicker
      v-if="!disabled"
      :disabled="uploading"
      @select="emit('update:modelValue', $event.url)"
    />
    <p v-if="showHint" class="upload-field-hint">{{ hint }}</p>
  </div>
</template>

<script setup>
import { uploadRequest } from '../lib/uploadRequest'
import MediaPicker from './MediaPicker.vue'
import { ref, onBeforeUnmount } from 'vue'
import { useParentUploads } from '../lib/editorLifecycle'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import {
  BASE,
  adminUploadHeaders,
  extractErrorMessage,
  mediaSrc,
} from '../lib/api'
import {
  IMAGE_ACCEPT,
  imageUploadHint,
  validateUploadFile,
} from '../lib/uploadPolicy'

defineProps({
  disabled: { type: Boolean, default: false },
  modelValue: { type: String, default: '' },
  width: { type: String, default: '100%' },
  height: { type: String, default: '150px' },
  hint: { type: String, default: imageUploadHint },
  showHint: { type: Boolean, default: true },
})

const emit = defineEmits(['update:modelValue'])
const scope = useParentUploads()
const uploadRef = ref(null),
  uploading = ref(false)
let active = true
const pendingFiles = new Map()
const finish = (file) => {
  const valid = active && pendingFiles.has(file?.uid)
  pendingFiles.delete(file?.uid)
  uploading.value = pendingFiles.size > 0
  scope?.complete(file)
  return valid
}
onBeforeUnmount(() => {
  active = false
  uploadRef.value?.abort()
  for (const file of pendingFiles.values()) scope?.complete(file)
  pendingFiles.clear()
})

const beforeUpload = (file) => {
  const result = validateUploadFile(file, { kind: 'image' })
  if (!result.ok) ElMessage.warning(result.message)
  if (!result.ok || uploading.value || !active) return false
  pendingFiles.set(file.uid, file)
  uploading.value = true
  scope?.begin(file)
  return true
}

const handleSuccess = (res, file) => {
  if (!finish(file)) return
  if (!res?.url) return ElMessage.error('上传响应缺少文件地址，请重试。')
  emit('update:modelValue', res.url)
  ElMessage.success('素材已上传')
}

const handleError = (error, file) => {
  if (!finish(file)) return
  let parsed = null
  try {
    parsed = JSON.parse(error?.message || '{}')
  } catch {}
  ElMessage.error(
    parsed?.error?.message || extractErrorMessage(error, '上传失败'),
  )
}
</script>
