<template>
  <div class="workbench">
    <div class="page-title-row dashboard-title">
      <div>
        <span class="eyebrow">DASHBOARD</span>
        <div class="title-with-date">
          <h1>工作台</h1>
          <span class="date-label">{{ today }}</span>
        </div>
        <p>从这里开始，维护产品与跟进客户。</p>
      </div>
      <RouterLink
        v-if="can('products:write')"
        to="/products?create=1"
        class="primary-link"
        >新建产品 <el-icon><Plus /></el-icon
      ></RouterLink>
    </div>
    <div v-if="errors.length" class="notice-error" role="alert">
      {{ errors.join('；') }}
      <el-button text :disabled="loading" @click="load">重新加载</el-button>
    </div>
    <section class="metric-grid" aria-label="官网概况" :aria-busy="loading">
      <RouterLink
        v-for="card in cards"
        :key="card.key"
        :to="card.path"
        class="metric-card"
      >
        <span>{{ card.label }}</span
        ><strong>{{ loading ? '—' : (counts[card.key] ?? '—') }}</strong
        ><small>{{ card.hint }}</small>
      </RouterLink>
    </section>
    <section
      v-if="can('products:read')"
      class="dashboard-section"
      v-loading="loading"
      aria-label="最近更新的产品"
    >
      <div class="panel-heading">
        <h2>最近更新的产品</h2>
        <RouterLink to="/products" class="arrow-link"
          >管理产品 <el-icon><ArrowRight /></el-icon
        ></RouterLink>
      </div>
      <div class="catalog-table">
        <div class="catalog-table-head" aria-hidden="true">
          <span>产品</span><span>系列</span><span>类型</span><span>状态</span
          ><span>操作</span>
        </div>
        <article v-for="row in products" :key="row.id" class="catalog-row">
          <RouterLink :to="productPath(row)" class="catalog-product">
            <el-image
              v-if="
                row.attributes.imageUrl ||
                row.attributes.image?.data?.attributes?.url
              "
              :src="
                mediaSrc(
                  row.attributes.imageUrl ||
                    row.attributes.image?.data?.attributes?.url,
                )
              "
              :alt="row.attributes.title"
              fit="cover"
              ><template #error
                ><el-icon><Picture /></el-icon></template
            ></el-image>
            <el-icon v-else class="catalog-no-image"><Picture /></el-icon
            ><strong>{{ row.attributes.title }}</strong>
          </RouterLink>
          <span class="catalog-series">{{ row.attributes.series || '—' }}</span
          ><span class="catalog-category">{{
            row.attributes.categoryName || '未分类'
          }}</span>
          <span class="catalog-status"
            ><span class="status-label" :data-status="row.attributes.status">{{
              publishStatusMeta(row.attributes.status).label
            }}</span></span
          >
          <RouterLink
            :to="productPath(row)"
            class="catalog-edit"
            :aria-label="
              (can('products:write') ? '编辑 ' : '查看 ') + row.attributes.title
            "
            >{{ can('products:write') ? '编辑' : '查看' }}</RouterLink
          >
        </article>
        <div
          v-if="!loading && !products.length"
          class="empty-panel compact-empty"
        >
          {{
            errors.some((e) => e.includes('产品'))
              ? '产品暂时无法加载，请重试。'
              : '尚未添加产品，从新建产品开始建立目录。'
          }}
        </div>
      </div>
    </section>
    <section
      v-if="can('crm:read')"
      class="dashboard-section dashboard-inquiries"
      v-loading="loading"
    >
      <div class="panel-heading">
        <h2>待联系的客户</h2>
        <RouterLink to="/crm?status=new" class="arrow-link"
          >查看咨询 <el-icon><ArrowRight /></el-icon
        ></RouterLink>
      </div>
      <RouterLink
        v-for="row in inquiries"
        :key="row.id"
        :to="`/crm?status=new&inquiry=${row.id}`"
        class="dashboard-inquiry-row"
      >
        <strong>{{ row.customerName || '访客' }}</strong
        ><span class="inquiry-subject"
          >{{ inquiryTypeLabel(row.inquiryType) }} ·
          {{ row.productTitle || '未指定产品' }}</span
        ><span class="status-label waiting">待联系</span
        ><time>{{ formatTime(row.createdAt).slice(0, 10) }}</time>
      </RouterLink>
      <div
        v-if="!loading && !inquiries.length"
        class="empty-panel compact-empty"
      >
        {{
          errors.some((e) => e.includes('咨询'))
            ? '咨询暂时无法加载，请重试。'
            : '暂无待联系咨询。新的客户需求会出现在这里。'
        }}
      </div>
    </section>
  </div>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { ArrowRight, Plus, Picture } from '@element-plus/icons-vue'
import {
  api,
  hasPermission as can,
  listData,
  paginationMeta,
  mediaSrc,
  extractErrorMessage,
} from '../lib/api'
import { publishStatusMeta, inquiryTypeLabel } from '../lib/meta'
import { formatTime } from '../lib/format'
const today = new Date().toLocaleDateString('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long',
})
const loading = ref(false),
  errors = ref([]),
  counts = ref({}),
  products = ref([]),
  inquiries = ref([])
const cards = computed(() =>
  [
    {
      key: 'products',
      label: '产品总数',
      hint: '官网乐器目录',
      path: '/products',
      permission: 'products:read',
      endpoint: '/api/products',
      params: { admin: 1, pageSize: 4 },
    },
    {
      key: 'drafts',
      label: '产品草稿',
      hint: '完善资料后即可发布',
      path: '/products?status=draft',
      permission: 'products:read',
      endpoint: '/api/products',
      params: { admin: 1, status: 'draft', pageSize: 1 },
    },
    {
      key: 'inquiries',
      label: '待联系咨询',
      hint: '尚未开始跟进',
      path: '/crm?status=new',
      permission: 'crm:read',
      endpoint: '/api/inquiries',
      params: { status: 'new', pageSize: 4 },
    },
    {
      key: 'due',
      label: '到期回访',
      hint: '按已安排时间跟进',
      path: '/crm?due=1',
      permission: 'crm:read',
      endpoint: '/api/inquiries',
      params: { due: 1, pageSize: 1 },
    },
    {
      key: 'applications',
      label: '待审合作',
      hint: '审阅艺术家合作资料',
      path: '/crm?tab=artistApps',
      permission: 'crm:read',
      endpoint: '/api/artist-applications',
      params: { status: 'pending', pageSize: 1 },
    },
    {
      key: 'articles',
      label: '品牌动态',
      hint: '新闻与活动内容',
      path: '/articles',
      permission: 'articles:read',
      endpoint: '/api/articles',
      params: { admin: 1, pageSize: 1 },
    },
  ].filter((card) => can(card.permission)),
)
const productPath = (row) =>
  can('products:write')
    ? `/products?search=${encodeURIComponent(row.attributes.title)}&edit=${row.id}`
    : `/products?search=${encodeURIComponent(row.attributes.title)}`
async function load() {
  if (loading.value) return
  products.value = []
  inquiries.value = []
  loading.value = true
  errors.value = []
  await Promise.all(
    cards.value.map(async (card) => {
      try {
        const res = await api.get(card.endpoint, { params: card.params })
        counts.value[card.key] = paginationMeta(res).total
        if (card.key === 'products') products.value = listData(res)
        if (card.key === 'inquiries') inquiries.value = listData(res)
      } catch (error) {
        counts.value[card.key] = null
        errors.value.push(
          card.label + '：' + extractErrorMessage(error, '加载失败'),
        )
      }
    }),
  )
  loading.value = false
}
onMounted(load)
</script>
