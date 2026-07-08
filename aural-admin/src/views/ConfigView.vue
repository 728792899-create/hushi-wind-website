<template>
  <div class="config-page">
    <section class="business-command-panel config-command-panel">
      <div class="business-command-main">
        <span class="business-kicker">站点配置发布</span>
        <h2>发布前先确认首屏、品牌文案和联系方式</h2>
        <p>这里影响官网首页、艺术家页、音响页、支持页和页脚联系信息。建议每次发布前先预览首页，再同步到官网。</p>
        <div class="business-command-actions">
          <el-button size="large" @click="openPreview('/')" color="#222" class="dark-btn">预览首页</el-button>
          <el-button type="primary" size="large" @click="saveConfig" color="#fff" class="light-btn publish-btn">发布并同步官网</el-button>
        </div>
      </div>
      <div class="business-task-grid">
        <article v-for="item in configOpsCards" :key="item.label" class="business-task-card" :class="item.tone">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
          <small>{{ item.desc }}</small>
        </article>
      </div>
    </section>

    <div class="config-header secondary-config-header">
      <h2>站点动态图文配置</h2>
      <p class="muted-text">按官网展示区域分组维护，保存后会同步到线上 API 配置。</p>
    </div>

    <el-card class="chart-card mb-20" shadow="never">
      <template #header>1. 首页：首屏巨幕海报区</template>
      <el-form :model="sysConfig" label-width="120px" label-position="left">
        <el-form-item label="官网首页海报"><image-upload v-model="sysConfig.heroImageUrl" height="200px" /></el-form-item>
        <el-form-item label="文案大标题"><el-input v-model="sysConfig.aboutTitle" /></el-form-item>
        <el-form-item label="品牌故事正文"><el-input v-model="sysConfig.aboutText" type="textarea" :rows="3" /></el-form-item>
      </el-form>
    </el-card>

    <el-card class="chart-card mb-20 accent-green" shadow="never">
      <template #header>2. 艺术家页：首屏巨幕海报区</template>
      <el-form :model="sysConfig" label-width="120px" label-position="left">
        <el-form-item label="艺术家巨幕图"><image-upload v-model="sysConfig.artistHeroImageUrl" height="150px" /></el-form-item>
      </el-form>
    </el-card>

    <el-card class="chart-card mb-20 accent-gold" shadow="never">
      <template #header>3. 专业音响页：首屏巨幕海报区</template>
      <el-form :model="sysConfig" label-width="120px" label-position="left">
        <el-form-item label="音响页巨幕图"><image-upload v-model="sysConfig.audioHeroImageUrl" height="150px" /></el-form-item>
      </el-form>
    </el-card>

    <el-card class="chart-card mb-20 accent-red" shadow="never">
      <template #header>4. 支持服务页：首屏巨幕海报区</template>
      <el-form :model="sysConfig" label-width="120px" label-position="left">
        <el-form-item label="支持页巨幕图"><image-upload v-model="sysConfig.supportHeroImageUrl" height="150px" /></el-form-item>
      </el-form>
    </el-card>

    <el-card class="chart-card mb-20" shadow="never">
      <template #header>5. 首页：Core Technology 展示区</template>
      <el-form :model="sysConfig" label-width="120px" label-position="left">
        <el-form-item label="展示区环境大图"><image-upload v-model="sysConfig.coreTechBgImageUrl" height="120px" /></el-form-item>
        <el-form-item label="背景叠底颜色"><el-color-picker v-model="sysConfig.coreTechBgColor" /></el-form-item>
        <el-divider border-style="dashed" />
        <el-form-item label="核心产品配图"><image-upload v-model="sysConfig.coreTechImageUrl" width="150px" height="150px" /></el-form-item>
        <el-form-item label="区域大标题"><el-input v-model="sysConfig.coreTechTitle" /></el-form-item>
        <el-form-item label="核心理念正文"><el-input v-model="sysConfig.coreTechDesc" type="textarea" :rows="4" /></el-form-item>
        <el-form-item label="按钮跳转文案"><el-input v-model="sysConfig.coreTechLinkText" /></el-form-item>
      </el-form>
    </el-card>

    <el-card class="chart-card mb-20" shadow="never">
      <template #header>6. 首页：品牌名言展示区</template>
      <el-form :model="sysConfig" label-width="120px" label-position="left">
        <el-form-item label="名言背景大图"><image-upload v-model="sysConfig.quoteBgImageUrl" height="200px" /></el-form-item>
        <el-form-item label="名言正文内容"><el-input v-model="sysConfig.quoteText" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="出处/辅助文案"><el-input v-model="sysConfig.quoteAuthor" /></el-form-item>
      </el-form>
    </el-card>

    <el-card class="chart-card" shadow="never">
      <template #header>7. 全局：页脚与联系信息</template>
      <el-form ref="configFormRef" :model="sysConfig" :rules="rules" label-width="120px" label-position="left">
        <el-form-item label="官方客服邮箱" prop="contactEmail"><el-input v-model="sysConfig.contactEmail" /></el-form-item>
        <el-form-item label="全球服务热线" prop="contactPhone"><el-input v-model="sysConfig.contactPhone" /></el-form-item>
        <el-form-item label="页脚版权信息"><el-input v-model="sysConfig.footerText" /></el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import ImageUpload from '../components/ImageUpload.vue'
import { api, extractErrorMessage, openPreview } from '../lib/api'

const configFormRef = ref(null)
const sysConfig = ref({
  heroImageUrl: '', aboutTitle: '', aboutText: '', contactEmail: '', contactPhone: '', footerText: '',
  coreTechImageUrl: '', coreTechTitle: '', coreTechDesc: '', coreTechLinkText: '',
  coreTechBgColor: '#0a0a0a', coreTechBgImageUrl: '',
  quoteText: '', quoteAuthor: '', quoteBgImageUrl: '',
  artistHeroImageUrl: '', audioHeroImageUrl: '', supportHeroImageUrl: ''
})

const rules = {
  contactEmail: [{ type: 'email', message: '请输入有效邮箱', trigger: 'blur' }],
  contactPhone: [{ pattern: /^[0-9\-+\s()]{6,30}$/, message: '请输入有效电话', trigger: 'blur' }]
}

const filledConfigFields = computed(() => Object.values(sysConfig.value).filter((value) => String(value || '').trim()).length)
const heroImageCount = computed(() => [
  sysConfig.value.heroImageUrl,
  sysConfig.value.artistHeroImageUrl,
  sysConfig.value.audioHeroImageUrl,
  sysConfig.value.supportHeroImageUrl
].filter(Boolean).length)
const contactReady = computed(() => Boolean(sysConfig.value.contactEmail && sysConfig.value.contactPhone))
const homepageReady = computed(() => Boolean(sysConfig.value.heroImageUrl && sysConfig.value.aboutTitle && sysConfig.value.aboutText))
const configOpsCards = computed(() => [
  { label: '已填字段', value: filledConfigFields.value, desc: '当前站点配置完成度', tone: filledConfigFields.value >= 10 ? 'success' : 'warning' },
  { label: '首屏海报', value: `${heroImageCount.value}/4`, desc: '首页/艺术家/音响/支持页', tone: heroImageCount.value >= 4 ? 'success' : 'warning' },
  { label: '首页文案', value: homepageReady.value ? '就绪' : '待补', desc: '海报、标题和品牌故事', tone: homepageReady.value ? 'success' : 'warning' },
  { label: '联系方式', value: contactReady.value ? '就绪' : '待补', desc: '邮箱与服务热线', tone: contactReady.value ? 'success' : 'danger' }
])

const fetchConfig = async () => {
  const res = await api.get('/api/config')
  sysConfig.value = res.data
}

const saveConfig = async () => {
  try {
    await configFormRef.value?.validate()
    await api.put('/api/config', sysConfig.value)
    ElMessage.success('已全局同步至官网')
  } catch (error) {
    if (error) ElMessage.error(extractErrorMessage(error, '请检查配置内容'))
  }
}

onMounted(fetchConfig)
</script>
