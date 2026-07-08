<template>
  <PolicyPage
    :eyebrow="eyebrow"
    :title="title"
    :summary="summary"
    :sections="sections"
    :updated-at="updatedAt"
  />
</template>

<script setup>

const fallback = {
  eyebrow: '隐私政策',
  title: '隐私政策',
  summary: '说明我们在预约试奏、咨询报价、维修工单与艺术家申请等场景中如何收集、使用、保存和保护您的信息。',
  updatedAt: '2026-05-20',
  sections: [
    {
      title: '我们会收集哪些信息',
      body: [
        '当您提交预约试奏、咨询报价、维修工单、资料下载申请或艺术家合作申请时，我们可能收集姓名、联系方式、所在城市、产品型号、服务需求和您主动填写的补充说明。',
        '网站会记录基础访问日志、页面来源、设备类型、停留时长、表单提交时间和异常访问行为，用于安全风控、服务质量分析和运营统计。'
      ]
    },
    {
      title: '我们为什么收集这些信息',
      body: [
        '我们仅将信息用于响应咨询、安排体验、处理售后、审核合作申请、改进产品内容、优化服务流程和保障系统安全。',
        '未经您的明确同意，我们不会将个人联系方式出售、出租或用于与胡氏管乐服务无关的第三方营销。'
      ]
    },
    {
      title: '信息保存与保护',
      body: [
        '工单、申请和操作日志会保存在内部业务系统中，并通过权限控制、登录记录、操作审计和备份机制限制访问范围。',
        '当业务目的已经完成且不再需要继续保留时，您可以通过支持页面申请更正、删除或限制继续使用相关信息。'
      ]
    },
    {
      title: '第三方服务与外部链接',
      body: [
        '网站可能链接到经销商、作品集、视频平台或资料下载地址。外部网站的信息处理规则不由胡氏管乐控制，请您访问前自行查看其政策。',
        '如后续接入验证码、统计分析或错误监控服务，我们会优先选择具备合规能力的服务商，并在必要时更新本政策。'
      ]
    },
    {
      title: '联系我们',
      body: [
        '如您对个人信息处理、数据删除、账号资料或投诉建议有疑问，请前往支持页面提交工单，或通过网站公布的联系方式与我们联系。'
      ]
    }
  ]
}

const { title, summary, sections, updatedAt, eyebrow } = await usePolicyContent('privacy', fallback)

useSiteSeo({
  title: () => `${title.value || fallback.title} | 胡氏管乐`,
  description: () => summary.value || fallback.summary,
  path: '/info/privacy'
})

useBreadcrumbSchema(() => [
  { name: '首页', path: '/' },
  { name: title.value || '隐私政策', path: '/info/privacy' }
])
</script>
