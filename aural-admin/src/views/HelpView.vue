<template>
  <div class="help-page page-shell">
    <section class="business-command-panel help-command-panel">
      <div class="business-command-main">
        <span class="business-kicker">后台使用手册</span>
        <h2>新管理员先按这条路线完成日常运营</h2>
        <p>帮助页用于交付、培训和日常自查。先从产品、内容、资源和客户四个高频任务进入，再按下方流程检查风险动作。</p>
        <div class="business-command-actions">
          <el-button color="#222" class="dark-btn" @click="openFrontend">打开官网</el-button>
          <el-button type="primary" color="#fff" class="light-btn" @click="go('/dashboard')">返回工作台</el-button>
        </div>
      </div>
      <div class="business-task-grid">
        <article v-for="item in helpOpsCards" :key="item.label" class="business-task-card" :class="item.tone">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
          <small>{{ item.desc }}</small>
        </article>
      </div>
    </section>

    <section class="help-quick-grid">
      <button v-for="item in quickLinks" :key="item.path" type="button" class="help-quick-card" @click="go(item.path)">
        <strong>{{ item.title }}</strong>
        <span>{{ item.desc }}</span>
      </button>
    </section>

    <section class="help-section">
      <div class="help-section-title">
        <strong>常见操作流程</strong>
        <span>建议按顺序操作，保存后再打开前台确认展示效果。</span>
      </div>
      <div class="help-guide-grid">
        <article v-for="guide in guides" :key="guide.title" class="help-guide-card">
          <div class="help-guide-head">
            <strong>{{ guide.title }}</strong>
            <span>{{ guide.module }}</span>
          </div>
          <ol>
            <li v-for="step in guide.steps" :key="step">{{ step }}</li>
          </ol>
          <div class="help-guide-actions">
            <el-button size="small" color="#222" class="dark-btn" @click="go(guide.path)">进入模块</el-button>
            <el-button v-if="guide.preview" size="small" @click="openPreview(guide.preview)">前台查看</el-button>
          </div>
        </article>
      </div>
    </section>

    <section class="help-section">
      <div class="help-section-title">
        <strong>容易误操作的地方</strong>
        <span>这些动作会影响官网展示或线上素材，操作前建议多确认一次。</span>
      </div>
      <div class="help-warning-list">
        <article v-for="item in warnings" :key="item.title" class="help-warning-card">
          <strong>{{ item.title }}</strong>
          <p>{{ item.desc }}</p>
        </article>
      </div>
    </section>

    <section class="help-section">
      <div class="help-section-title">
        <strong>每次更新后的检查</strong>
        <span>后台内容调整后，做一次简单巡检可以提前发现隐藏问题。</span>
      </div>
      <div class="help-checklist">
        <label v-for="item in checklist" :key="item">
          <input type="checkbox" />
          <span>{{ item }}</span>
        </label>
      </div>
    </section>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { SITE, openPreview } from '../lib/api'

const router = useRouter()

const helpOpsCards = [
  { label: '快速入口', value: '4 个', desc: '产品、新闻、资源、客户', tone: 'primary' },
  { label: '操作流程', value: '5 条', desc: '覆盖发布、替换和回滚', tone: 'success' },
  { label: '风险提醒', value: '5 项', desc: '删除、替换、隐藏前先确认', tone: 'warning' },
  { label: '上线检查', value: '5 步', desc: '每次更新后都能自查', tone: 'success' }
]

const quickLinks = [
  { title: '上架产品', desc: '新增乐器、补主图、详情图、价格库存。', path: '/products' },
  { title: '发布新闻', desc: '维护品牌动态、活动和新闻摘要。', path: '/articles' },
  { title: '管理素材', desc: '上传图片、复制 URL、替换引用和清理未使用资源。', path: '/resources' },
  { title: '处理工单', desc: '查看预约、咨询、售后和艺术家申请。', path: '/crm' }
]

const guides = [
  {
    title: '新增一款产品',
    module: '产品管理',
    path: '/products',
    preview: '/products',
    steps: [
      '进入产品管理，点击上架乐器。',
      '先填写基础信息、主图、分类和 URL 后缀。',
      '补充价格库存、发布状态和详情图集。',
      '保存草稿后预览，确认无误再保存并发布。'
    ]
  },
  {
    title: '发布一条新闻',
    module: '新闻管理',
    path: '/articles',
    preview: '/news',
    steps: [
      '进入新闻管理，点击发布新闻。',
      '填写标题、栏目分类、发布日期和封面。',
      '正文可以直接写段落，也可以用格式助手插入小标题、引用、图片或视频。',
      '确认标题、封面和摘要无误后发布。'
    ]
  },
  {
    title: '新闻正文插入图片或视频',
    module: '新闻管理',
    path: '/articles',
    preview: '/news',
    steps: [
      '编辑新闻时，在“正文详情”下方使用“上传图片插入”或“上传视频插入”。',
      '上传成功后，系统会自动把图片或视频标记插入正文，不需要手动复制地址。',
      '每个小标题、引用、图片或视频建议单独占一行，前台会自动排版。',
      '保存草稿后先点击预览，确认图片、视频、标题层级正常再发布。'
    ]
  },
  {
    title: '替换官网图片',
    module: '资源库',
    path: '/resources',
    preview: '/',
    steps: [
      '先在资源库上传新图片，复制新图片 URL。',
      '点击替换引用，填入旧 URL 和新 URL。',
      '查看命中位置和影响范围。',
      '确认后执行替换，再打开前台检查图片显示。'
    ]
  },
  {
    title: '恢复历史版本',
    module: '版本历史',
    path: '/products',
    preview: '/',
    steps: [
      '在产品、新闻或页面内容列表中点击更多/版本。',
      '查看版本时间、操作人和摘要。',
      '确认要恢复的历史记录后点击回滚。',
      '回滚后重新打开前台页面确认内容。'
    ]
  }
]

const warnings = [
  { title: '清理未使用资源', desc: '只清理确认未被官网内容引用的上传文件。清理前务必查看筛选条件、数量和清理列表。' },
  { title: '替换资源引用', desc: '批量替换会影响产品、新闻、CMS、艺术家和全局配置中匹配到的图片或文件地址。' },
  { title: '隐藏或删除内容', desc: '隐藏会让前台不再公开展示，删除则会移除内容。重要内容建议优先隐藏或保存草稿。' },
  { title: '修改 URL 后缀', desc: '产品和页面的 URL 后缀会影响前台访问地址。已有页面不要随意变更，避免旧链接失效。' },
  { title: '新闻正文媒体', desc: '新闻正文中的图片和视频来自上传资源。删除或替换资源前，需要先确认它是否被新闻详情页引用。' }
]

const checklist = [
  '前台首页能正常打开，首屏图片和核心入口显示正常。',
  '产品目录、产品详情、新闻列表、支持页可以正常访问。',
  '新发布或修改的内容在前台展示正确。',
  '表单提交、资源预览、图片加载没有明显错误。',
  '后台工作台、资源库、安全与审计页面没有红色错误提示。'
]

const go = (path) => router.push(path)

const openFrontend = () => {
  window.open(SITE || '/', '_blank', 'noopener,noreferrer')
}
</script>
