<template>
  <div :style="{ width }">
    <el-upload
      class="up-box"
      :style="{ width: '100%', height }"
      :action="`${BASE}/api/upload`"
      :headers="adminUploadHeaders()"
      :accept="IMAGE_ACCEPT"
      :show-file-list="false"
      :before-upload="beforeUpload"
      :on-success="handleSuccess"
      :on-error="handleError"
    >
      <img v-if="modelValue" :src="mediaSrc(modelValue)" class="up-img" :style="{ height }" />
      <div v-else class="up-icon" :style="{ height, lineHeight: height }">
        <el-icon><Plus /></el-icon>
      </div>
    </el-upload>
    <p v-if="showHint" class="upload-field-hint">{{ hint }}</p>
  </div>
</template>

<script setup>
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { BASE, adminUploadHeaders, extractErrorMessage, mediaSrc } from '../lib/api'
import { IMAGE_ACCEPT, imageUploadHint, validateUploadFile } from '../lib/uploadPolicy'

defineProps({
  modelValue: { type: String, default: '' },
  width: { type: String, default: '100%' },
  height: { type: String, default: '150px' },
  hint: { type: String, default: imageUploadHint },
  showHint: { type: Boolean, default: true }
})

const emit = defineEmits(['update:modelValue'])

const beforeUpload = (file) => {
  const result = validateUploadFile(file, { kind: 'image' })
  if (!result.ok) ElMessage.warning(result.message)
  return result.ok
}

const handleSuccess = (res) => {
  emit('update:modelValue', res.url)
  ElMessage.success('素材已上传')
}

const handleError = (error) => {
  let parsed = null
  try { parsed = JSON.parse(error?.message || '{}') } catch {}
  ElMessage.error(parsed?.error?.message || extractErrorMessage(error, '上传失败'))
}
</script>
