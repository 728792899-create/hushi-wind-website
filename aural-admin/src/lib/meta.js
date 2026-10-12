export const publishStatusOptions = [
  { label: '已发布', value: 'published', type: 'success' },
  { label: '草稿', value: 'draft', type: 'warning' },
  { label: '隐藏', value: 'hidden', type: 'info' },
]

export const publishStatusMeta = (value) =>
  publishStatusOptions.find(
    (item) =>
      item.value === value ||
      (value === 'active' && item.value === 'published'),
  ) || publishStatusOptions[0]

export const faqCategories = [
  { label: '保修', value: 'warranty' },
  { label: '维护', value: 'maintenance' },
  { label: '固件', value: 'software' },
  { label: '试奏', value: 'experience' },
  { label: '运输', value: 'delivery' },
  { label: '报修', value: 'repair' },
  { label: '通用', value: 'general' },
]

export const faqCategoryLabel = (value) =>
  faqCategories.find((item) => item.value === value)?.label || '通用'

export const inquiryTypeOptions = [
  { label: '预约试奏', value: 'appointment' },
  { label: '咨询报价', value: 'quote' },
  { label: '售后维修', value: 'repair' },
  { label: '普通咨询', value: 'general' },
]

export const inquiryStatusOptions = [
  { label: '待联系', value: 'new', type: 'danger' },
  { label: '已联系', value: 'contacted', type: 'warning' },
  { label: '已报价', value: 'quoted', type: 'primary' },
  { label: '处理中', value: 'processing', type: 'primary' },
  { label: '已完成', value: 'done', type: 'success' },
  { label: '已关闭', value: 'closed', type: 'info' },
]

export const inquiryPriorityOptions = [
  { label: '普通', value: 'normal', type: 'info' },
  { label: '高', value: 'high', type: 'warning' },
  { label: '紧急', value: 'urgent', type: 'danger' },
]

export const inquiryTypeLabel = (value) =>
  ({ appointment: '预约试奏', quote: '咨询报价', repair: '售后维修' })[value] ||
  '普通咨询'
export const inquiryStatusMeta = (value) =>
  inquiryStatusOptions.find((item) => item.value === value) ||
  inquiryStatusOptions[0]
export const inquiryPriorityMeta = (value) =>
  inquiryPriorityOptions.find((item) => item.value === value) ||
  inquiryPriorityOptions[0]
