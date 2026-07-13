<template>
  <div class="page-shell">
    <section class="page-hero">
      <div>
        <h1>运营指挥台</h1>
        <p>集中查看工单、库存、内容缺口、资源风险与最近审计记录。</p>
      </div>
      <div class="hero-actions">
        <el-button color="#222" class="dark-btn" :loading="loading" @click="fetchData">刷新数据</el-button>
        <el-button v-if="canReadCrm" type="primary" color="#fff" class="light-btn" @click="go('/crm')">处理工单</el-button>
      </div>
    </section>

    <el-alert
      v-if="loadError"
      :title="loadError"
      type="warning"
      :closable="false"
      show-icon
    />

    <section class="command-center-panel">
      <div class="command-primary-card">
        <span>今日管理重点</span>
        <strong>{{ operationAdviceSummary.title }}</strong>
        <p>{{ operationAdviceSummary.desc }}</p>
        <div class="command-primary-actions">
          <el-button v-if="canReadCrm" type="primary" class="light-btn" @click="go('/crm')">处理客户线索</el-button>
          <el-button v-if="canReadLogs" plain @click="go('/security')">查看安全任务</el-button>
        </div>
      </div>
      <div class="command-task-list">
        <button
          v-for="item in commandTasks"
          :key="item.key"
          type="button"
          class="command-task-card"
          :class="item.tone"
          :disabled="item.disabled"
          @click="go(item.path, item.action)"
        >
          <div>
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </div>
          <p>{{ item.desc }}</p>
          <small>{{ item.button }}</small>
        </button>
      </div>
    </section>

    <section class="quick-start-panel enterprise-quick-panel">
      <div class="quick-start-copy">
        <span>常用入口</span>
        <strong>从这里开始日常运营</strong>
        <p>优先处理工单、上架产品、发布内容和检查异常；每个入口都会跳到对应管理页面。</p>
      </div>
      <div class="quick-action-grid">
        <button v-if="canReadCrm" type="button" class="quick-action-card urgent" @click="go('/crm')">
          <span>01</span>
          <strong>处理客户工单</strong>
          <small>{{ urgentInquiries }} 个紧急 / {{ todayInquiries }} 个今日新增</small>
        </button>
        <button v-if="canReadProducts" type="button" class="quick-action-card" @click="go('/products', 'product:add')">
          <span>02</span>
          <strong>上架或编辑产品</strong>
          <small>{{ incompleteProducts }} 个产品仍需补素材或参数</small>
        </button>
        <button v-if="canReadResources" type="button" class="quick-action-card" @click="go('/resources')">
          <span>03</span>
          <strong>检查资源库</strong>
          <small>查看未使用、重复或过大的上传素材</small>
        </button>
        <button v-if="canReadCms" type="button" class="quick-action-card" @click="go('/cms', 'cms:add')">
          <span>04</span>
          <strong>维护页面内容</strong>
          <small>{{ contentWarnings }} 条内容处于草稿、隐藏或待完善状态</small>
        </button>
        <button v-if="canReadLogs" type="button" class="quick-action-card" @click="go('/security')">
          <span>05</span>
          <strong>查看安全与审计</strong>
          <small>确认登录异常、备份状态和最近操作</small>
        </button>
      </div>
    </section>

    <section class="kpi-grid">
      <button class="kpi-card success" type="button" :disabled="!canReadProducts" @click="go('/products')">
        <span>库存总价值</span>
        <strong class="money-value">¥ {{ formatCompactMoney(stats.totalValue) }}</strong>
        <small>全部在库产品估值</small>
      </button>
      <button class="kpi-card" type="button" :disabled="!canReadProducts" @click="go('/products')">
        <span>在售乐器</span>
        <strong>{{ stats.products }}</strong>
        <small>产品记录数</small>
      </button>
      <button class="kpi-card danger" type="button" :disabled="!canReadCrm" @click="go('/crm')">
        <span>紧急工单</span>
        <strong>{{ urgentInquiries }}</strong>
        <small>需要优先响应</small>
      </button>
      <button class="kpi-card warning" type="button" :disabled="!canReadProducts" @click="go('/products')">
        <span>缺素材产品</span>
        <strong>{{ incompleteProducts }}</strong>
        <small>主图/参数/详情待补</small>
      </button>
      <button class="kpi-card" type="button" :disabled="!canReadCms" @click="go('/cms')">
        <span>待审内容</span>
        <strong>{{ contentWarnings }}</strong>
        <small>草稿、隐藏与缺口</small>
      </button>
      <button class="kpi-card" type="button" :disabled="!canReadLogs" @click="go('/security')">
        <span>最近审计</span>
        <strong>{{ auditLogs.length }}</strong>
        <small>近 8 条操作</small>
      </button>
      <button class="kpi-card danger" type="button" :disabled="!canReadDashboard" @click="fetchData">
        <span>API 异常</span>
        <strong>{{ monitoring.errorCount || 0 }}</strong>
        <small>{{ monitoring.errorRate || 0 }}% 错误率</small>
      </button>
      <button class="kpi-card warning" type="button" :disabled="!canReadDashboard" @click="fetchData">
        <span>慢接口</span>
        <strong>{{ monitoring.slowCount || 0 }}</strong>
        <small>{{ monitoring.slowRate || 0 }}% 超过 1s</small>
      </button>
      <button class="kpi-card danger" type="button" :disabled="!canReadDashboard" @click="fetchData">
        <span>前端异常</span>
        <strong>{{ frontendRiskTotal }}</strong>
        <small>JS / 资源 / API / 表单</small>
      </button>
    </section>

    <el-card v-if="opsHealth" class="chart-card ops-health-card" shadow="never">
      <template #header>
        <div class="card-header-row">
          <span>上线健康与异常中心</span>
          <small>近 24 小时</small>
        </div>
      </template>
      <div class="ops-health-grid">
        <button
          v-for="item in opsHealthCards"
          :key="item.key"
          type="button"
          class="ops-health-tile"
          :class="item.tone"
          :disabled="item.disabled"
          @click="item.path ? go(item.path) : fetchData()"
        >
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
          <small>{{ item.desc }}</small>
        </button>
      </div>
      <div v-if="opsRecentRisks.length" class="ops-risk-list">
        <div v-for="item in opsRecentRisks" :key="item.id" class="ops-risk-item" :class="riskTone(item.level)">
          <span>{{ riskLabel(item) }}</span>
          <strong>{{ item.title || '-' }}</strong>
          <small>{{ item.detail || item.type || '-' }} / {{ formatTime(item.createdAt) }}</small>
        </div>
      </div>
      <div v-else class="empty-panel compact-empty ops-health-empty">暂无待处理异常，当前线上状态平稳。</div>
    </el-card>

    <el-row :gutter="20">
      <el-col :span="15">
        <el-card class="chart-card" shadow="never">
          <template #header>库存价值趋势</template>
          <div class="chart-container">
            <svg v-if="chartPolyline" class="lightweight-chart" viewBox="0 0 320 160" role="img" aria-label="库存价值趋势">
              <polyline class="chart-area" :points="chartAreaPolyline" />
              <polyline class="chart-line" :points="chartPolyline" />
              <circle v-for="point in chartPoints" :key="point.key" class="chart-dot" :cx="point.x" :cy="point.y" r="3" />
            </svg>
            <div v-else class="empty-panel compact-empty">暂无趋势数据</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="9">
        <el-card class="chart-card ops-card" shadow="never">
          <template #header>待办事项</template>
          <div class="ops-list">
            <button class="ops-item urgent clickable" type="button" :disabled="!canReadCrm" @click="go('/crm')">
              <strong>{{ urgentInquiries }}</strong>
              <span>紧急工单</span>
            </button>
            <button class="ops-item clickable" type="button" :disabled="!canReadCrm" @click="go('/crm')">
              <strong>{{ todayInquiries }}</strong>
              <span>今日新工单</span>
            </button>
            <button class="ops-item warning clickable" type="button" :disabled="!canReadProducts" @click="go('/products')">
              <strong>{{ incompleteProducts }}</strong>
              <span>内容缺失产品</span>
            </button>
            <button class="ops-item clickable" type="button" :disabled="!canReadProducts" @click="go('/products')">
              <strong>{{ topProduct || '-' }}</strong>
              <span>当前热门库存</span>
            </button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :span="12">
        <el-card class="chart-card" shadow="never">
          <template #header>真实转化漏斗</template>
          <div class="funnel-row"><span>产品浏览</span><strong>{{ funnel.views }}</strong></div>
          <div class="funnel-bar"><i :style="{ width: '100%' }"></i></div>
          <div class="funnel-row"><span>表单打开</span><strong>{{ funnel.opens }}</strong></div>
          <div class="funnel-bar"><i :style="{ width: `${funnel.openRate}%` }"></i></div>
          <div class="funnel-row"><span>表单提交</span><strong>{{ funnel.submits }}</strong></div>
          <div class="funnel-bar"><i :style="{ width: `${funnel.submitRate}%` }"></i></div>
          <div class="funnel-micro-grid">
            <span>打开率 {{ funnel.openRate }}%</span>
            <span>浏览提交率 {{ funnel.submitRate }}%</span>
            <span>打开提交率 {{ funnel.formSubmitRate }}%</span>
          </div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card class="chart-card" shadow="never">
          <template #header>
            <div class="card-header-row">
              <span>最近操作记录</span>
              <el-button v-if="canReadLogs" size="small" text @click="go('/security')">查看全部</el-button>
            </div>
          </template>
          <div v-if="!canReadLogs" class="empty-panel compact-empty">当前角色暂无审计日志权限。</div>
          <div v-else-if="auditLogs.length" class="recent-ops-list">
            <button v-for="row in auditLogs" :key="row.id" type="button" class="recent-op-item" @click="go('/security')">
              <strong>{{ row.operator || '系统' }}</strong>
              <span>{{ operationLabel(row) }}</span>
              <small>{{ formatTime(row.createdAt) }}</small>
            </button>
          </div>
          <div v-else class="empty-panel compact-empty">暂无审计记录</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :span="12">
        <el-card class="chart-card growth-card" shadow="never">
          <template #header>核心路径转化</template>
          <div class="path-funnel-list">
            <div v-for="item in funnelCards" :key="item.key" class="path-funnel-item">
              <div>
                <strong>{{ item.title }}</strong>
                <span>{{ item.steps }}</span>
              </div>
              <em>{{ item.rate }}%</em>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card class="chart-card growth-card" shadow="never">
          <template #header>搜索质量</template>
          <div class="search-quality-grid">
            <div><strong>{{ searchQuality.searches || 0 }}</strong><span>搜索次数</span></div>
            <div><strong>{{ searchQuality.clickRate || 0 }}%</strong><span>搜索点击率</span></div>
            <div><strong>{{ searchQuality.zeroResultCount || 0 }}</strong><span>无结果搜索</span></div>
          </div>
          <div class="growth-subsection">
            <p>高意图搜索词</p>
            <div v-if="highIntentTerms.length === 0" class="empty-panel compact-empty">暂无可用搜索点击数据</div>
            <div v-else class="insight-list">
              <div v-for="item in highIntentTerms" :key="item.key" class="insight-item">
                <span>{{ item.label }}</span>
                <strong>{{ item.clicks }}</strong>
              </div>
            </div>
          </div>
          <div class="growth-subsection">
            <p>需补内容搜索词</p>
            <div v-if="searchGapTerms.length === 0" class="empty-panel compact-empty">暂无明显搜索缺口</div>
            <div v-else class="insight-list">
              <div v-for="item in searchGapTerms" :key="item.key" class="insight-item warning">
                <span>{{ item.label }}</span>
                <strong>{{ item.zeroResults || item.searches }}</strong>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :span="8">
        <el-card class="chart-card insight-card" shadow="never">
          <template #header>热门产品浏览</template>
          <div v-if="topProducts.length === 0" class="empty-panel compact-empty">暂无产品浏览数据</div>
          <div v-else class="insight-list">
            <div v-for="item in topProducts" :key="item.key" class="insight-item">
              <span>{{ item.label }}</span>
              <strong>{{ item.count }}</strong>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card class="chart-card insight-card" shadow="never">
          <template #header>热门搜索词</template>
          <div v-if="topSearchTerms.length === 0" class="empty-panel compact-empty">暂无搜索数据</div>
          <div v-else class="insight-list">
            <div v-for="item in topSearchTerms" :key="item.key" class="insight-item">
              <span>{{ item.label }}</span>
              <strong>{{ item.count }}</strong>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card class="chart-card insight-card" shadow="never">
          <template #header>热门 CTA 点击</template>
          <div v-if="topCtas.length === 0" class="empty-panel compact-empty">暂无 CTA 点击数据</div>
          <div v-else class="insight-list">
            <div v-for="item in topCtas" :key="item.key" class="insight-item">
              <span>{{ item.label }}</span>
              <strong>{{ item.count }}</strong>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :span="8">
        <el-card class="chart-card insight-card" shadow="never">
          <template #header>热门 FAQ</template>
          <div v-if="topFaqs.length === 0" class="empty-panel compact-empty">暂无 FAQ 点击数据</div>
          <div v-else class="insight-list">
            <div v-for="item in topFaqs" :key="item.key" class="insight-item">
              <span>{{ item.label }}</span>
              <strong>{{ item.count }}</strong>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card class="chart-card insight-card" shadow="never">
          <template #header>未解决 FAQ</template>
          <div v-if="unresolvedFaqs.length === 0" class="empty-panel compact-empty">暂无未解决反馈</div>
          <div v-else class="insight-list">
            <div v-for="item in unresolvedFaqs" :key="item.key" class="insight-item warning">
              <span>{{ item.label }}</span>
              <strong>{{ item.count }}</strong>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card class="chart-card insight-card" shadow="never">
          <template #header>低转化页面</template>
          <div v-if="lowConversionPages.length === 0" class="empty-panel compact-empty">暂无明显低转化页面</div>
          <div v-else class="insight-list">
            <div v-for="item in lowConversionPages" :key="item.path" class="insight-item warning">
              <span>{{ item.path }} / {{ item.openRate }}% 打开</span>
              <strong>{{ item.views }}</strong>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :span="12">
        <el-card class="chart-card insight-card" shadow="never">
          <template #header>热门页面</template>
          <div v-if="topPages.length === 0" class="empty-panel compact-empty">暂无页面访问数据</div>
          <div v-else class="page-insight-list">
            <div v-for="item in topPages" :key="item.path" class="page-insight-item">
              <div>
                <strong>{{ item.path }}</strong>
                <span>CTA {{ item.ctaClicks }} / 打开 {{ item.formOpens }} / 提交 {{ item.formSubmits }}</span>
              </div>
              <em>{{ item.submitRate }}%</em>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card class="chart-card insight-card" shadow="never">
          <template #header>设备来源转化</template>
          <div v-if="deviceStats.length === 0" class="empty-panel compact-empty">暂无设备来源数据</div>
          <div v-else class="device-list">
            <div v-for="item in deviceStats" :key="item.device" class="device-item">
              <div>
                <strong>{{ deviceLabel(item.device) }}</strong>
                <span>访问 {{ item.visits }} / 产品 {{ item.productViews }} / 表单 {{ item.formSubmits }}</span>
              </div>
              <em>{{ item.submitRate }}%</em>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="20">
      <el-col :span="12">
        <el-card class="chart-card insight-card" shadow="never">
          <template #header>监控摘要</template>
          <div class="monitor-grid">
            <div><strong>{{ monitoring.requestCount || 0 }}</strong><span>接口请求</span></div>
            <div><strong>{{ monitoring.frontendErrorCount || 0 }}</strong><span>JS 报错</span></div>
            <div><strong>{{ monitoring.resourceErrorCount || 0 }}</strong><span>资源失败</span></div>
            <div><strong>{{ monitoring.apiErrorCount || 0 }}</strong><span>前端 API 失败</span></div>
            <div><strong>{{ monitoring.formSubmitFailedCount || 0 }}</strong><span>表单失败</span></div>
            <div><strong>{{ monitoring.slowPageCount || 0 }}</strong><span>慢页面</span></div>
          </div>
          <div v-if="recentFrontendErrors.length" class="monitor-event-list">
            <div v-for="item in recentFrontendErrors" :key="`${item.type}-${item.createdAt}-${item.title}`" class="monitor-event-item">
              <span>{{ monitorTypeLabel(item.type) }}</span>
              <strong>{{ item.title || item.pagePath || '-' }}</strong>
              <small>{{ item.pagePath || '-' }} / {{ formatTime(item.createdAt) }}</small>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card class="chart-card insight-card" shadow="never">
          <template #header>搜索缺口明细</template>
          <div v-if="noClickTerms.length === 0" class="empty-panel compact-empty">暂无多次搜索但无点击的关键词</div>
          <div v-else class="insight-list">
            <div v-for="item in noClickTerms" :key="item.key" class="insight-item warning">
              <span>{{ item.label }}</span>
              <strong>{{ item.searches }}</strong>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api, extractErrorMessage, hasPermission, listData } from '../lib/api'
import { formatTime, qualityResult, safeParse } from '../lib/format'
import {
  backupAgeText, chartPointsFor, deviceLabel, diskSummaryText, formatBytes,
  formatCompactMoney, formatCompactNumber, monitorTypeLabel, operationLabel,
  pm2SummaryText, riskLabel, riskTone
} from '../lib/dashboardModel'

const emit = defineEmits(['stats-change'])
const router = useRouter()

const stats = reactive({ products: 0, articles: 0, totalValue: 0, unreadInquiries: 0, pendingArtists: 0, chartData: { dates: [], values: [] }, analytics: {} })
const inquiries = ref([])
const products = ref([])
const auditLogs = ref([])
const cmsItems = ref([])
const opsHealth = ref(null)
const loading = ref(false)
const loadError = ref('')
const canReadLogs = computed(() => hasPermission('logs:read'))
const canReadDashboard = computed(() => hasPermission('dashboard:read'))
const canReadCrm = computed(() => hasPermission('crm:read'))
const canReadProducts = computed(() => hasPermission('products:read'))
const canReadCms = computed(() => hasPermission('cms:read'))
const canReadResources = computed(() => hasPermission('resources:read'))

const chartValues = computed(() => (stats.chartData.values || []).map((value) => Number(value || 0)).filter((value) => Number.isFinite(value)))
const chartPoints = computed(() => chartPointsFor(chartValues.value))
const chartPolyline = computed(() => chartPoints.value.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' '))
const chartAreaPolyline = computed(() => {
  if (!chartPoints.value.length) return ''
  const first = chartPoints.value[0]
  const last = chartPoints.value[chartPoints.value.length - 1]
  return `${first.x.toFixed(1)},148 ${chartPolyline.value} ${last.x.toFixed(1)},148`
})

const todayInquiries = computed(() => {
  const today = new Date().toDateString()
  return inquiries.value.filter((item) => item.createdAt && new Date(item.createdAt).toDateString() === today).length
})

const urgentInquiries = computed(() => inquiries.value.filter((item) => item.priority === 'urgent').length)

const incompleteProducts = computed(() => products.value.filter((row) => {
  const attrs = row.attributes || {}
  const result = qualityResult([
    { label: '主图', ok: Boolean(attrs.imageUrl || attrs.image?.data?.attributes?.url) },
    { label: '参数', ok: safeParse(attrs.specs).length >= 3 },
    { label: '详情图', ok: safeParse(attrs.gallery).length >= 1 },
    { label: '保修', ok: String(attrs.warranty || '').trim().length >= 10 }
  ])
  return result.score < 100
}).length)

const contentWarnings = computed(() => cmsItems.value.filter((item) => ['draft', 'hidden'].includes(item.status)).length)
const commandTasks = computed(() => [
  {
    key: 'crm',
    label: '客户线索',
    value: urgentInquiries.value || todayInquiries.value,
    desc: urgentInquiries.value ? `${urgentInquiries.value} 个紧急工单需要优先响应` : `${todayInquiries.value} 个今日新增咨询或工单`,
    button: '进入客户与工单',
    tone: urgentInquiries.value ? 'danger' : 'primary',
    path: '/crm',
    disabled: !canReadCrm.value
  },
  {
    key: 'products',
    label: '产品完整度',
    value: incompleteProducts.value,
    desc: incompleteProducts.value ? '仍有产品缺少主图、参数或详情素材' : '产品资料完整度良好',
    button: '检查产品资料',
    tone: incompleteProducts.value ? 'warning' : 'success',
    path: '/products',
    action: incompleteProducts.value ? '' : 'product:add',
    disabled: !canReadProducts.value
  },
  {
    key: 'content',
    label: '内容发布',
    value: contentWarnings.value,
    desc: contentWarnings.value ? '存在草稿、隐藏或待完善的官网内容' : '官网内容状态稳定',
    button: '维护页面内容',
    tone: contentWarnings.value ? 'warning' : 'success',
    path: '/cms',
    disabled: !canReadCms.value
  },
  {
    key: 'ops',
    label: '系统风险',
    value: Number(monitoring.value.errorCount || 0) + frontendRiskTotal.value,
    desc: frontendRiskTotal.value ? '前端/API/资源异常需要巡检' : '当前未发现明显前端异常',
    button: '查看安全巡检',
    tone: frontendRiskTotal.value || Number(monitoring.value.errorCount || 0) ? 'danger' : 'success',
    path: '/security',
    disabled: !canReadLogs.value
  }
])

const topProduct = computed(() => {
  const sorted = [...products.value].sort((a, b) => Number(b.attributes?.isFeatured) - Number(a.attributes?.isFeatured) || Number(b.attributes?.quantity || 0) - Number(a.attributes?.quantity || 0))
  return sorted[0]?.attributes?.title || ''
})

const analytics = computed(() => stats.analytics || {})
const monitoring = computed(() => analytics.value.monitoring || {})
const frontendRiskTotal = computed(() => Number(monitoring.value.frontendErrorCount || 0)
  + Number(monitoring.value.resourceErrorCount || 0)
  + Number(monitoring.value.apiErrorCount || 0)
  + Number(monitoring.value.formSubmitFailedCount || 0))
const recentFrontendErrors = computed(() => monitoring.value.recentFrontendErrors || [])
const topProducts = computed(() => analytics.value.topProducts || [])
const topSearchTerms = computed(() => analytics.value.topSearchTerms || [])
const topCtas = computed(() => analytics.value.topCtas || [])
const topFaqs = computed(() => analytics.value.topFaqs || [])
const unresolvedFaqs = computed(() => analytics.value.faq?.unresolvedItems || [])
const topPages = computed(() => analytics.value.topPages || [])
const lowConversionPages = computed(() => analytics.value.lowConversionPages || [])
const funnelGroups = computed(() => analytics.value.funnels || {})
const searchQuality = computed(() => analytics.value.searchQuality || {})
const highIntentTerms = computed(() => searchQuality.value.highIntentTerms || [])
const zeroResultTerms = computed(() => searchQuality.value.zeroResultTerms || [])
const noClickTerms = computed(() => searchQuality.value.noClickTerms || [])
const searchGapTerms = computed(() => [...zeroResultTerms.value, ...noClickTerms.value]
  .filter((item, index, list) => list.findIndex((row) => row.key === item.key) === index)
  .slice(0, 6))
const deviceStats = computed(() => analytics.value.deviceStats || [])
const funnelCards = computed(() => {
  const home = funnelGroups.value.homeToLead || {}
  const quote = funnelGroups.value.productQuote || {}
  const support = funnelGroups.value.supportTicket || {}
  return [
    {
      key: 'home',
      title: '首页到留资',
      steps: `首页 ${home.homeVisits || 0} / 产品 ${home.productViews || 0} / 提交 ${home.formSubmits || 0}`,
      rate: Number(home.conversionRate || 0)
    },
    {
      key: 'quote',
      title: '产品咨询报价',
      steps: `目录 ${quote.catalogViews || 0} / 详情 ${quote.detailViews || 0} / 报价 ${quote.quoteSubmits || 0}`,
      rate: Number(quote.conversionRate || 0)
    },
    {
      key: 'support',
      title: '支持页到工单',
      steps: `支持页 ${support.supportViews || 0} / FAQ ${support.faqClicks || 0} / 工单 ${support.ticketSubmits || 0}`,
      rate: Number(support.conversionRate || 0)
    }
  ]
})
const funnel = computed(() => {
  const raw = analytics.value.funnel || {}
  const views = Number(raw.productViews || 0)
  const opens = Number(raw.formOpens || 0)
  const submits = Number(raw.formSubmits || 0)
  return {
    views,
    opens,
    submits,
    openRate: Number(raw.openRate || 0),
    submitRate: Number(raw.submitRate || 0),
    formSubmitRate: Number(raw.formSubmitRate || 0)
  }
})

const opsHealthCards = computed(() => {
  const data = opsHealth.value || {}
  const database = data.database || {}
  const apiState = data.api || {}
  const login = data.login || {}
  const alerts = data.alerts || {}
  const resources = data.resources || {}
  const disk = data.disk || {}
  const pm2 = data.pm2 || {}
  const readiness = data.productionReadiness || {}
  const fileSize = formatBytes(database.file?.size)
  const missingTables = (database.coreTables || []).filter((item) => item.status !== 'ok').map((item) => item.name)
  return [
    {
      key: 'production-readiness',
      label: '上线就绪度',
      value: readiness.score != null ? `${readiness.score}%` : '待检查',
      desc: readiness.summary || '检查账号、2FA、备份、告警和接口状态',
      tone: readiness.status === 'critical' ? 'danger' : readiness.status === 'warning' ? 'warning' : 'success',
      path: canReadLogs.value ? '/security' : ''
    },
    {
      key: 'database',
      label: '数据库',
      value: database.status === 'ok' ? '正常' : '异常',
      desc: database.status === 'ok' ? `核心表正常 / ${fileSize}` : `需检查：${missingTables.join('、') || '连接或文件'}`,
      tone: database.status === 'ok' ? 'success' : 'danger'
    },
    {
      key: 'api',
      label: 'API 500',
      value: formatCompactNumber(apiState.errorCount),
      desc: `${formatCompactNumber(apiState.requestCount)} 次请求 / 慢接口 ${formatCompactNumber(apiState.slowCount)}`,
      tone: apiState.errorCount ? 'danger' : apiState.slowCount ? 'warning' : 'success'
    },
    {
      key: 'login',
      label: '登录失败',
      value: formatCompactNumber(login.failedCount),
      desc: `锁定账号 ${formatCompactNumber(login.lockedAdminCount)}`,
      tone: login.lockedAdminCount ? 'danger' : login.failedCount ? 'warning' : 'success',
      path: canReadLogs.value ? '/security' : ''
    },
    {
      key: 'alerts',
      label: '待处理报警',
      value: formatCompactNumber(alerts.openCount),
      desc: `严重 ${formatCompactNumber(alerts.levels?.critical)} / 警告 ${formatCompactNumber(alerts.levels?.warning)}`,
      tone: alerts.levels?.critical ? 'danger' : alerts.openCount ? 'warning' : 'success',
      path: canReadLogs.value ? '/security' : ''
    },
    {
      key: 'resources',
      label: '资源大图风险',
      value: formatCompactNumber(resources.heavyImageCount),
      desc: `需优化 ${formatCompactNumber(resources.riskyImageCount)} / 总素材 ${formatCompactNumber(resources.uploadCount)}`,
      tone: resources.heavyImageCount ? 'warning' : 'success',
      path: canReadResources.value ? '/resources' : '',
      disabled: !canReadResources.value
    },
    {
      key: 'backup',
      label: '最近备份',
      value: data.backup?.status === 'failed' ? '失败' : data.backup ? '已记录' : '暂无',
      desc: backupAgeText(data.backup),
      tone: data.backup?.status === 'failed' || !data.backup ? 'warning' : 'success',
      path: canReadLogs.value ? '/security' : ''
    },
    {
      key: 'disk',
      label: '磁盘空间',
      value: disk.status === 'ok' ? '充足' : disk.status === 'warning' ? '预警' : '未知',
      desc: diskSummaryText(disk),
      tone: disk.status === 'ok' ? 'success' : 'warning'
    },
    {
      key: 'pm2',
      label: '服务进程',
      value: pm2.status === 'ok' ? '在线' : pm2.status === 'warning' ? '异常' : '未知',
      desc: pm2SummaryText(pm2),
      tone: pm2.status === 'ok' ? 'success' : 'warning'
    }
  ]
})

const opsRecentRisks = computed(() => opsHealth.value?.recentRisks || [])

const operationAdviceCards = computed(() => {
  const data = opsHealth.value || {}
  const database = data.database || {}
  const apiState = data.api || {}
  const login = data.login || {}
  const alerts = data.alerts || {}
  const resources = data.resources || {}
  const disk = data.disk || {}
  const backup = data.backup || null
  const readiness = data.productionReadiness || {}
  const cards = []

  const addCard = (card) => {
    cards.push({
      disabled: card.path ? routeDisabled(card.path) : false,
      actionLabel: card.actionLabel || (card.path ? '点击处理' : '刷新检查'),
      ...card
    })
  }

  const criticalReadiness = (readiness.openChecks || []).find((item) => item.level === 'critical')
  const warningReadiness = (readiness.openChecks || []).find((item) => item.level === 'warning')
  const readinessTarget = criticalReadiness || warningReadiness
  if (readinessTarget) {
    addCard({
      key: `readiness-${readinessTarget.key}`,
      tone: readinessTarget.level === 'critical' ? 'danger' : 'warning',
      badge: readinessTarget.level === 'critical' ? '上线' : '规范',
      title: readinessTarget.title,
      desc: `${readinessTarget.detail} ${readinessTarget.action}`,
      path: '/security',
      actionLabel: '查看整改清单'
    })
  }

  if (database.status && database.status !== 'ok') {
    addCard({
      key: 'database',
      tone: 'danger',
      badge: '阻断',
      title: '先检查数据库状态',
      desc: '核心表或连接状态异常，可能影响登录、内容发布和前台展示。',
      path: '/security',
      actionLabel: '查看安全与系统'
    })
  }

  if (Number(alerts.levels?.critical || 0) > 0 || Number(alerts.openCount || 0) > 0) {
    addCard({
      key: 'alerts',
      tone: Number(alerts.levels?.critical || 0) > 0 ? 'danger' : 'warning',
      badge: Number(alerts.levels?.critical || 0) > 0 ? '严重' : '待处理',
      title: '处理待确认报警',
      desc: `当前还有 ${formatCompactNumber(alerts.openCount)} 条未处理报警，建议先清掉真正影响线上使用的异常。`,
      path: '/security',
      actionLabel: '进入异常中心'
    })
  }

  if (Number(apiState.errorCount || 0) > 0) {
    addCard({
      key: 'api-errors',
      tone: 'danger',
      badge: '接口',
      title: '排查 API 500',
      desc: `近 24 小时出现 ${formatCompactNumber(apiState.errorCount)} 次 API 异常，需要结合日志确认是否影响表单或后台操作。`,
      path: '/security',
      actionLabel: '查看接口异常'
    })
  }

  if (Number(monitoring.value.formSubmitFailedCount || 0) > 0) {
    addCard({
      key: 'form-submit',
      tone: 'danger',
      badge: '转化',
      title: '检查表单提交失败',
      desc: `发现 ${formatCompactNumber(monitoring.value.formSubmitFailedCount)} 次表单失败，可能直接影响预约、咨询和售后线索。`,
      path: '/security',
      actionLabel: '查看失败记录'
    })
  }

  if (Number(login.lockedAdminCount || 0) > 0 || Number(login.failedCount || 0) >= 3) {
    addCard({
      key: 'login',
      tone: 'warning',
      badge: '登录',
      title: '复核后台登录异常',
      desc: `近 24 小时有 ${formatCompactNumber(login.failedCount)} 次失败登录，锁定账号 ${formatCompactNumber(login.lockedAdminCount)} 个。`,
      path: '/security',
      actionLabel: '查看登录记录'
    })
  }

  if (!backup || backup.status === 'failed') {
    addCard({
      key: 'backup',
      tone: 'warning',
      badge: '备份',
      title: backup?.status === 'failed' ? '最近备份失败' : '需要确认最近备份',
      desc: backupAgeText(backup),
      path: '/security',
      actionLabel: '查看备份记录'
    })
  }

  if (disk.status && disk.status !== 'ok') {
    addCard({
      key: 'disk',
      tone: 'warning',
      badge: '容量',
      title: '服务器磁盘需要关注',
      desc: diskSummaryText(disk),
      actionLabel: '刷新磁盘状态'
    })
  }

  if (Number(resources.heavyImageCount || 0) > 0 || Number(resources.riskyImageCount || 0) > 0) {
    addCard({
      key: 'resources',
      tone: 'warning',
      badge: '资源',
      title: '优化过大的图片资源',
      desc: `当前有 ${formatCompactNumber(resources.heavyImageCount)} 张大图、${formatCompactNumber(resources.riskyImageCount)} 张风险图，建议压缩或替换。`,
      path: '/resources',
      actionLabel: '进入资源库'
    })
  }

  if (Number(frontendRiskTotal.value || 0) > 0) {
    addCard({
      key: 'frontend-risk',
      tone: 'warning',
      badge: '前端',
      title: '复查前端资源与脚本异常',
      desc: `近 24 小时累计 ${formatCompactNumber(frontendRiskTotal.value)} 条前端风险，重点看 JS、资源加载和前端 API 失败。`,
      path: '/security',
      actionLabel: '查看监控摘要'
    })
  }

  if (Number(searchQuality.value.zeroResultCount || 0) > 0 || searchGapTerms.value.length > 0) {
    addCard({
      key: 'search-gap',
      tone: 'info',
      badge: '内容',
      title: '补齐搜索无结果内容',
      desc: `有 ${formatCompactNumber(searchQuality.value.zeroResultCount)} 次无结果搜索，可据此补产品、FAQ 或支持内容。`,
      path: '/cms',
      actionLabel: '维护内容'
    })
  }

  if (incompleteProducts.value > 0) {
    addCard({
      key: 'products',
      tone: 'info',
      badge: '产品',
      title: '完善产品素材和参数',
      desc: `${formatCompactNumber(incompleteProducts.value)} 个产品仍缺少主图、详情图、参数或保修信息。`,
      path: '/products',
      actionLabel: '进入产品管理'
    })
  }

  if (!cards.length) {
    addCard({
      key: 'stable',
      tone: 'success',
      badge: '平稳',
      title: '今日暂无明显阻断项',
      desc: '健康检查、接口异常、资源风险和内容缺口没有发现高优先级问题。',
      actionLabel: '刷新复查'
    })
  }

  return cards
    .sort((a, b) => ({ danger: 0, warning: 1, info: 2, success: 3 }[a.tone] - { danger: 0, warning: 1, info: 2, success: 3 }[b.tone]))
    .slice(0, 5)
})

const operationAdviceSummary = computed(() => {
  const dangerCount = operationAdviceCards.value.filter((item) => item.tone === 'danger').length
  const warningCount = operationAdviceCards.value.filter((item) => item.tone === 'warning').length
  if (dangerCount) {
    return {
      title: `有 ${dangerCount} 项需要优先处理`,
      desc: '建议先处理红色项目，再看资源、备份和内容运营问题。'
    }
  }
  if (warningCount) {
    return {
      title: `有 ${warningCount} 项建议今天跟进`,
      desc: '当前没有明显阻断项，但仍有可能影响体验或运营效率的事项。'
    }
  }
  return {
    title: '线上状态平稳',
    desc: '可以继续关注产品内容、搜索缺口和日常运营动作。'
  }
})

const routeDisabled = (path) => ({
  '/crm': !canReadCrm.value,
  '/products': !canReadProducts.value,
  '/cms': !canReadCms.value,
  '/security': !canReadLogs.value,
  '/resources': !canReadResources.value
}[path] || false)

const handleAdvice = (item) => {
  if (item.disabled) return
  if (item.path) {
    go(item.path)
    return
  }
  fetchData()
}

const go = async (path, action = '') => {
  const permissionMap = {
    '/crm': canReadCrm.value,
    '/products': canReadProducts.value,
    '/cms': canReadCms.value,
    '/security': canReadLogs.value,
    '/resources': canReadResources.value
  }
  if (permissionMap[path] === false) return
  await router.push(path)
  if (action) {
    const emitAction = () => window.dispatchEvent(new CustomEvent('admin-page-action', { detail: action }))
    window.setTimeout(emitAction, 160)
    window.setTimeout(emitAction, 520)
  }
}

const optionalRequest = (enabled, request) => enabled ? request().catch(() => null) : Promise.resolve(null)
const runWhenIdle = (callback) => {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(callback, { timeout: 1200 })
    return
  }
  window.setTimeout(callback, 160)
}

const fetchSecondaryData = async () => {
  const [opsHealthRes, faqRes, pageRes, auditRes] = await Promise.all([
    optionalRequest(canReadDashboard.value, () => api.get('/api/admin/ops-health')),
    optionalRequest(canReadCms.value, () => api.get('/api/support-faqs', { params: { admin: 1, pageSize: 60 } })),
    optionalRequest(canReadCms.value, () => api.get('/api/page-contents', { params: { admin: 1, pageSize: 60 } })),
    optionalRequest(canReadLogs.value, () => api.get('/api/admin/operation-logs', { params: { pageSize: 8 } }))
  ])
  opsHealth.value = opsHealthRes?.data?.data || null
  auditLogs.value = auditRes ? listData(auditRes) : []
  cmsItems.value = [...(faqRes ? listData(faqRes) : []), ...(pageRes ? listData(pageRes) : [])]
}

const fetchData = async () => {
  loading.value = true
  loadError.value = ''
  try {
    const [statsRes, inquiriesRes, productsRes] = await Promise.all([
      api.get('/api/dashboard/stats'),
      optionalRequest(canReadCrm.value, () => api.get('/api/inquiries', { params: { pageSize: 60 } })),
      optionalRequest(canReadProducts.value, () => api.get('/api/products', { params: { admin: 1, status: 'all', pageSize: 60 } }))
    ])
    Object.assign(stats, statsRes.data)
    inquiries.value = inquiriesRes ? listData(inquiriesRes) : []
    products.value = productsRes ? listData(productsRes) : []
    emit('stats-change', Number(stats.unreadInquiries || 0) + Number(stats.pendingArtists || 0))
    runWhenIdle(() => {
      fetchSecondaryData().catch(() => {})
    })
  } catch (error) {
    loadError.value = extractErrorMessage(error, '运营看板数据加载失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

onMounted(fetchData)
</script>

<style scoped>
.lightweight-chart {
  width: 100%;
  height: 260px;
  display: block;
}
.chart-area {
  fill: rgba(var(--admin-primary-rgb), 0.12);
  stroke: none;
}
.chart-line {
  fill: none;
  stroke: var(--admin-primary);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.chart-dot {
  fill: var(--admin-surface);
  stroke: var(--admin-primary-strong);
  stroke-width: 2;
}
.command-center-panel {
  display: grid;
  grid-template-columns: minmax(280px, 0.9fr) minmax(0, 1.6fr);
  gap: 16px;
}
.command-primary-card,
.command-task-card {
  border: 1px solid var(--admin-border);
  background: linear-gradient(135deg, var(--admin-surface), var(--admin-surface-2));
  border-radius: 18px;
  box-shadow: var(--admin-shadow);
}
.command-primary-card { padding: 24px; display: grid; align-content: space-between; gap: 18px; min-height: 230px; }
.command-primary-card > span,
.command-task-card span { color: var(--admin-faint); font-size: 12px; font-weight: 800; letter-spacing: 0.14em; }
.command-primary-card strong { color: var(--admin-text); font-size: clamp(22px, 3vw, 34px); line-height: 1.15; }
.command-primary-card p,
.command-task-card p { margin: 0; color: var(--admin-muted); line-height: 1.65; }
.command-primary-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.command-task-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.command-task-card { text-align: left; padding: 18px; cursor: pointer; display: grid; gap: 12px; transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease; }
.command-task-card:hover:not(:disabled) { transform: translateY(-2px); border-color: var(--admin-hover-border); }
.command-task-card:disabled { opacity: 0.58; cursor: not-allowed; }
.command-task-card div { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.command-task-card strong { color: var(--admin-text); font-size: 32px; line-height: 1; }
.command-task-card small { color: var(--admin-primary-strong); font-weight: 800; }
.command-task-card.danger { border-color: color-mix(in srgb, var(--admin-danger) 45%, var(--admin-border)); }
.command-task-card.warning { border-color: color-mix(in srgb, var(--admin-warning) 45%, var(--admin-border)); }
.command-task-card.success { border-color: color-mix(in srgb, var(--admin-success) 36%, var(--admin-border)); }
.ops-advice-panel {
  display: grid;
  grid-template-columns: minmax(220px, 0.8fr) minmax(0, 2.2fr);
  gap: 16px;
  margin-bottom: 18px;
  border: 1px solid var(--admin-border);
  border-radius: 18px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.02)),
    var(--admin-surface);
  padding: 18px;
}

.ops-advice-heading {
  min-width: 0;
  display: grid;
  align-content: center;
  gap: 8px;
}

.ops-advice-heading span {
  color: var(--admin-muted);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0;
}

.ops-advice-heading strong {
  color: var(--admin-text);
  font-size: 24px;
  line-height: 1.2;
}

.ops-advice-heading p {
  margin: 0;
  color: var(--admin-muted);
  line-height: 1.7;
}

.ops-advice-list {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.ops-advice-card {
  min-width: 0;
  min-height: 150px;
  border: 1px solid var(--admin-border);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.035);
  padding: 13px;
  display: grid;
  align-content: start;
  gap: 8px;
  text-align: left;
  cursor: pointer;
  transition: transform 0.16s ease, border-color 0.16s ease, background-color 0.16s ease;
}

.ops-advice-card:hover {
  transform: translateY(-1px);
  border-color: var(--admin-hover-border);
  background: rgba(255, 255, 255, 0.055);
}

.ops-advice-card:disabled {
  cursor: default;
  opacity: 0.72;
}

.ops-advice-card:disabled:hover {
  transform: none;
  border-color: var(--admin-border);
  background: rgba(255, 255, 255, 0.035);
}

.ops-advice-card span {
  width: fit-content;
  max-width: 100%;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--admin-muted);
  padding: 3px 8px;
  font-size: 12px;
  font-weight: 800;
}

.ops-advice-card strong,
.ops-advice-card p,
.ops-advice-card small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ops-advice-card strong {
  color: var(--admin-text);
  font-size: 15px;
  line-height: 1.35;
}

.ops-advice-card p {
  display: -webkit-box;
  min-height: 42px;
  margin: 0;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: var(--admin-muted);
  font-size: 12px;
  line-height: 1.7;
}

.ops-advice-card small {
  align-self: end;
  color: var(--admin-text);
  font-size: 12px;
  font-weight: 800;
}

.ops-advice-card.danger span,
.ops-advice-card.danger small {
  color: var(--admin-danger);
}

.ops-advice-card.warning span,
.ops-advice-card.warning small {
  color: var(--admin-warning);
}

.ops-advice-card.info span,
.ops-advice-card.info small {
  color: var(--admin-info, #7fb4ff);
}

.ops-advice-card.success span,
.ops-advice-card.success small {
  color: var(--admin-success);
}

.ops-health-card :deep(.el-card__header) {
  border-bottom-color: var(--admin-border);
}

.ops-health-card small {
  color: var(--admin-muted);
}

.ops-health-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
}

.ops-health-tile {
  min-width: 0;
  min-height: 112px;
  border: 1px solid var(--admin-border);
  border-radius: 12px;
  background: var(--admin-bg-soft);
  padding: 13px 14px;
  display: grid;
  align-content: space-between;
  gap: 8px;
  text-align: left;
  cursor: pointer;
  transition: transform 0.16s ease, border-color 0.16s ease, background-color 0.16s ease;
}

.ops-health-tile:hover {
  transform: translateY(-1px);
  border-color: var(--admin-hover-border);
  background: var(--admin-surface-2);
}

.ops-health-tile:disabled {
  cursor: default;
}

.ops-health-tile:disabled:hover {
  transform: none;
  border-color: var(--admin-border);
  background: var(--admin-bg-soft);
}

.ops-health-tile span,
.ops-health-tile small,
.ops-health-tile strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ops-health-tile span {
  color: var(--admin-muted);
  font-size: 12px;
}

.ops-health-tile strong {
  color: var(--admin-text);
  font-size: clamp(20px, 2.2vw, 27px);
  line-height: 1.1;
  white-space: nowrap;
}

.ops-health-tile small {
  display: -webkit-box;
  min-height: 34px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.45;
}

.ops-health-tile.success strong {
  color: var(--admin-success);
}

.ops-health-tile.warning strong {
  color: var(--admin-warning);
}

.ops-health-tile.danger strong {
  color: var(--admin-danger);
}

.ops-risk-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.ops-risk-item {
  min-width: 0;
  display: grid;
  grid-template-columns: 58px minmax(0, 1fr);
  gap: 4px 10px;
  align-items: center;
  border: 1px solid var(--admin-border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
  padding: 10px 12px;
}

.ops-risk-item span {
  grid-row: span 2;
  min-height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(var(--admin-gold-rgb), 0.12);
  color: var(--admin-warning);
  font-size: 12px;
  font-weight: 800;
}

.ops-risk-item.danger span {
  background: rgba(255, 125, 125, 0.12);
  color: var(--admin-danger);
}

.ops-risk-item strong,
.ops-risk-item small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ops-risk-item strong {
  color: var(--admin-text);
  font-size: 13px;
}

.ops-risk-item small {
  color: var(--admin-muted);
  font-size: 12px;
}

.ops-health-empty {
  margin-top: 14px;
}

.monitor-event-list {
  display: grid;
  gap: 10px;
  margin-top: 16px;
}

.monitor-event-item {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: 6px 10px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid var(--admin-border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
}

.monitor-event-item span {
  grid-row: span 2;
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(255, 125, 125, 0.12);
  color: var(--admin-danger);
  font-size: 12px;
  font-weight: 800;
}

.monitor-event-item strong {
  min-width: 0;
  overflow: hidden;
  color: var(--admin-text);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.monitor-event-item small {
  min-width: 0;
  overflow: hidden;
  color: var(--admin-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 1100px) {
  .ops-advice-panel {
    grid-template-columns: minmax(0, 1fr);
  }

  .ops-advice-list {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .ops-health-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .ops-advice-panel {
    padding: 14px;
    border-radius: 14px;
  }

  .ops-advice-heading strong {
    font-size: 20px;
  }

  .ops-advice-list {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }

  .ops-advice-card {
    min-height: 112px;
    padding: 11px;
  }

  .ops-advice-card p {
    min-height: auto;
  }

  .ops-health-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .ops-health-tile {
    min-height: 96px;
    padding: 11px;
  }

  .ops-health-tile strong {
    font-size: clamp(18px, 6vw, 24px);
  }

  .ops-risk-list {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }

  .ops-risk-item {
    grid-template-columns: 50px minmax(0, 1fr);
    padding: 9px 10px;
  }
}
</style>
