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
  eyebrow: '使用条款',
  title: '使用条款',
  summary: '本页面说明胡氏管乐官方网站内容的使用边界、用户提交要求、知识产权归属和责任限制。',
  updatedAt: '2026-05-20',
  sections: [
    {
      title: '网站内容说明',
      body: [
        '本网站展示的产品图片、参数、价格、库存、服务说明和新闻内容用于品牌展示与咨询参考，具体成交条件以正式报价、合同或门店确认信息为准。',
        '我们会尽量保持页面内容准确，但不保证所有信息在任何时间都完全无误、实时更新或适用于所有地区。'
      ]
    },
    {
      title: '用户提交要求',
      body: [
        '您在提交预约、咨询、售后或合作申请时，应确保信息真实、合法、有效，不得冒用他人身份或提交恶意内容。',
        '系统会对公共表单进行频率限制和行为校验，异常提交可能被拒绝、延后处理或暂时限制。'
      ]
    },
    {
      title: '知识产权归属',
      body: [
        '网站中的品牌名称、页面设计、产品文案、图片素材、音视频内容和页面结构归胡氏管乐或相应权利人所有。',
        '未经授权，不得复制、改编、抓取、镜像或用于与胡氏管乐无关的商业用途。'
      ]
    },
    {
      title: '责任限制',
      body: [
        '因网络中断、浏览器兼容、第三方服务异常或不可抗力导致的网站访问问题，我们会尽力修复，但不承担超出法律规定范围的间接损失责任。',
        '如您发现页面信息错误、链接失效或安全风险，请通过支持页面联系我们。'
      ]
    },
    {
      title: '条款更新',
      body: [
        '我们可能根据业务调整、法律法规变化或服务升级更新本条款。更新后会在本页面同步展示最近更新时间。'
      ]
    }
  ]
}

const { title, summary, sections, updatedAt, eyebrow } = await usePolicyContent('terms', fallback)

useSiteSeo({
  title: () => `${title.value || fallback.title} | 胡氏管乐`,
  description: () => summary.value || fallback.summary,
  path: '/info/terms'
})

useBreadcrumbSchema(() => [
  { name: '首页', path: '/' },
  { name: title.value || '使用条款', path: '/info/terms' }
])
</script>
