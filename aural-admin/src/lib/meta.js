export const publishStatusOptions = [
  { label: '已发布', value: 'published', type: 'success' },
  { label: '草稿', value: 'draft', type: 'warning' },
  { label: '隐藏', value: 'hidden', type: 'info' }
]

export const publishStatusMeta = (value) => publishStatusOptions.find((item) => item.value === value || (value === 'active' && item.value === 'published')) || publishStatusOptions[0]

export const faqCategories = [
  { label: '保修', value: 'warranty' },
  { label: '维护', value: 'maintenance' },
  { label: '固件', value: 'software' },
  { label: '试奏', value: 'experience' },
  { label: '运输', value: 'delivery' },
  { label: '报修', value: 'repair' },
  { label: '通用', value: 'general' }
]

export const faqCategoryLabel = (value) => faqCategories.find((item) => item.value === value)?.label || '通用'

export const inquiryTypeOptions = [
  { label: '预约试奏', value: 'appointment' },
  { label: '咨询报价', value: 'quote' },
  { label: '维修工单', value: 'repair' },
  { label: '普通咨询', value: 'general' }
]

export const inquiryStatusOptions = [
  { label: '新工单', value: 'new', type: 'danger' },
  { label: '已联系', value: 'contacted', type: 'warning' },
  { label: '已报价', value: 'quoted', type: 'primary' },
  { label: '处理中', value: 'processing', type: 'primary' },
  { label: '已完成', value: 'done', type: 'success' },
  { label: '已关闭', value: 'closed', type: 'info' }
]

export const inquiryPriorityOptions = [
  { label: '普通', value: 'normal', type: 'info' },
  { label: '高', value: 'high', type: 'warning' },
  { label: '紧急', value: 'urgent', type: 'danger' }
]

export const inquiryTypeLabel = (value) => ({ appointment: '预约试奏', quote: '咨询报价', repair: '维修工单' }[value] || '普通咨询')
export const inquiryStatusMeta = (value) => inquiryStatusOptions.find((item) => item.value === value) || inquiryStatusOptions[0]
export const inquiryPriorityMeta = (value) => inquiryPriorityOptions.find((item) => item.value === value) || inquiryPriorityOptions[0]

export const productTypeTemplates = {
  piano: {
    categoryName: '原声钢琴',
    series: 'Acoustic Piano',
    specsText: '键盘：88 键渐进式配重\n音板：精选云杉实木音板\n踏板：三踏板系统\n适用空间：家庭 / 教学 / 演奏厅',
    featuresText: '高等级云杉音板带来自然共鸣\n精密机械联动提供细腻触键\n出厂多轮调律与整音校准\n适合练习、教学与专业演奏',
    scenesText: '家庭练习\n音乐教室\n小型演奏厅',
    warranty: '整琴享受 3 年有限保修，核心结构件享受品牌延保服务。'
  },
  guitar: {
    categoryName: '吉他与贝斯',
    series: 'Stage Guitar',
    specsText: '琴体：精选稳定木材\n拾音器：双线圈拾音系统\n琴颈：舒适 C 型轮廓\n适用场景：舞台 / 录音室',
    featuresText: '琴体曲线兼顾共鸣与长时间演奏\n高灵敏拾音系统捕捉细节\n人体工学琴颈便于复杂把位转换\n硬件配置适合舞台和录音室',
    scenesText: '现场演出\n录音室\n乐队排练',
    warranty: '整琴享受 2 年有限保修，电子部件享受 1 年保修服务。'
  },
  synth: {
    categoryName: '电子键盘',
    series: 'Digital Stage',
    specsText: '键盘：88 键配重键盘\n音源：多层采样音色引擎\n接口：MIDI / USB / 音频输出\n适用场景：舞台 / 编曲 / 教学',
    featuresText: '现代音色引擎兼顾舞台与制作\n丰富可编辑参数便于快速塑形\n高表现力键盘响应提升演奏控制\n支持外部扩展与多通道联动',
    scenesText: '现场演出\n编曲制作\n教学排练',
    warranty: '主机享受 2 年有限保修，键盘组件和接口按品牌服务政策检测维护。'
  }
}
