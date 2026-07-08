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
  eyebrow: '售后与保修说明',
  title: '售后与保修说明',
  summary: '说明胡氏管乐产品的保修范围、维修流程、调律保养建议以及资料支持方式。',
  updatedAt: '2026-05-20',
  sections: [
    {
      title: '适用范围',
      body: [
        '本说明适用于通过胡氏管乐官方渠道或授权渠道购买的乐器、键盘与专业音频产品。不同型号、套装和工程项目的保修期限可能存在差异，以购买凭证、保修卡或正式合同为准。',
        '耗材、外观自然损耗、非授权改装、错误安装、进液、跌落、运输损坏和超出正常使用条件造成的问题，不属于标准保修范围。'
      ]
    },
    {
      title: '服务流程',
      body: [
        '用户可在支持页面提交维修工单，建议提供产品型号、序列号、购买渠道、所在城市、问题现象和期望服务时间。',
        '客服确认信息后，会根据问题类型安排远程排查、到店检测、上门服务或返厂维修。涉及费用的项目会在执行前进行确认。'
      ]
    },
    {
      title: '调律与保养',
      body: [
        '原声钢琴建议根据使用频率、温湿度和搬运情况定期调律与保养。舞台与录音设备建议定期检查接口、线材、供电和固件版本。',
        '学校、剧场、录音棚等高频使用场景可提交维护计划咨询，获得周期性巡检与设备状态记录建议。'
      ]
    },
    {
      title: '资料与支持',
      body: [
        '产品说明书、固件、驱动和快速上手资料会在支持页面逐步发布。若页面暂未提供对应资料，可提交工单由客服协助发送。',
        '为保护用户权益，涉及客户资料和维修记录的导出、查看与处理均受权限管理机制控制。'
      ]
    },
    {
      title: '服务提示',
      body: [
        '如您的设备需要到店、上门或返厂处理，请在送修前先备份相关数据，并确认是否保留原配件和包装。'
      ]
    }
  ]
}

const { title, summary, sections, updatedAt, eyebrow } = await usePolicyContent('warranty', fallback)

useSiteSeo({
  title: () => `${title.value || fallback.title} | 胡氏管乐`,
  description: () => summary.value || fallback.summary,
  path: '/info/warranty'
})

useBreadcrumbSchema(() => [
  { name: '首页', path: '/' },
  { name: title.value || '售后与保修说明', path: '/info/warranty' }
])
</script>
