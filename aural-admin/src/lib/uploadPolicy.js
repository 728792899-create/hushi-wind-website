export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
export const RECOMMENDED_IMAGE_BYTES = 2 * 1024 * 1024

export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif']
export const DOCUMENT_EXTENSIONS = ['pdf', 'zip', 'rar']
export const VIDEO_EXTENSIONS = ['mp4', 'mov']
export const ALL_UPLOAD_EXTENSIONS = [...IMAGE_EXTENSIONS, ...DOCUMENT_EXTENSIONS, ...VIDEO_EXTENSIONS]

export const UPLOAD_ACCEPT = ALL_UPLOAD_EXTENSIONS.map((ext) => `.${ext}`).join(',')
export const IMAGE_ACCEPT = IMAGE_EXTENSIONS.map((ext) => `.${ext}`).join(',')
export const DOCUMENT_ACCEPT = DOCUMENT_EXTENSIONS.map((ext) => `.${ext}`).join(',')
export const VIDEO_ACCEPT = VIDEO_EXTENSIONS.map((ext) => `.${ext}`).join(',')

export const uploadPolicyText = '支持 JPG/PNG/WebP/GIF、PDF/ZIP/RAR、MP4/MOV，单个文件不超过 20MB。'
export const imageUploadHint = '支持 JPG、PNG、WebP、GIF；建议单图控制在 2MB 内，最大 20MB。'
export const videoUploadHint = '支持 MP4、MOV；建议先压缩后上传，单个文件最大 20MB。'
export const documentUploadHint = '支持 PDF、ZIP、RAR；单个文件最大 20MB。'

export const formatBytes = (bytes = 0) => {
  const value = Number(bytes || 0)
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)}MB`
  if (value >= 1024) return `${Math.round(value / 1024)}KB`
  return `${value}B`
}

export const fileExtension = (file = {}) => {
  const name = String(file.name || '')
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/)
  return match?.[1] || ''
}

const kindExtensions = {
  any: ALL_UPLOAD_EXTENSIONS,
  image: IMAGE_EXTENSIONS,
  document: DOCUMENT_EXTENSIONS,
  video: VIDEO_EXTENSIONS
}

const kindLabel = {
  any: '图片、资料或视频',
  image: '图片',
  document: '资料文件',
  video: '视频'
}

export const validateUploadFile = (file, options = {}) => {
  const kind = options.kind || 'any'
  const maxBytes = Number(options.maxBytes || MAX_UPLOAD_BYTES)
  const allowed = kindExtensions[kind] || ALL_UPLOAD_EXTENSIONS
  const ext = fileExtension(file)

  if (!ext || !allowed.includes(ext)) {
    return {
      ok: false,
      message: `${kindLabel[kind] || '文件'}仅支持 ${allowed.map((item) => item.toUpperCase()).join(' / ')} 格式`
    }
  }

  if (Number(file?.size || 0) > maxBytes) {
    return {
      ok: false,
      message: `文件过大，当前 ${formatBytes(file.size)}，最大允许 ${formatBytes(maxBytes)}`
    }
  }

  return { ok: true, message: '' }
}

export const uploadPolicyForKind = (kind = 'any') => {
  if (kind === 'image') return imageUploadHint
  if (kind === 'video') return videoUploadHint
  if (kind === 'document') return documentUploadHint
  return uploadPolicyText
}
