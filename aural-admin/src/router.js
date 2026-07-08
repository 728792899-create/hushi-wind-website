import { createRouter, createWebHistory } from 'vue-router'

export const adminRoutes = [
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', name: 'dashboard', meta: { label: '工作台', desc: '查看待处理事项、运营数据、异常提醒和最近操作。' }, component: () => import('./views/DashboardView.vue') },
  { path: '/products', name: 'products', meta: { label: '产品管理', desc: '上架、编辑、发布和维护官网产品信息。' }, component: () => import('./views/ProductsView.vue') },
  { path: '/artists', name: 'artists', meta: { label: '艺术家管理', desc: '维护艺术家资料、合作案例和展示排序。' }, component: () => import('./views/ArtistsView.vue') },
  { path: '/config', name: 'config', meta: { label: '全局配置', desc: '维护首页、联系方式、品牌素材和全站基础图文。' }, component: () => import('./views/ConfigView.vue') },
  { path: '/articles', name: 'articles', meta: { label: '新闻管理', desc: '发布品牌动态、新闻内容和历史版本。' }, component: () => import('./views/ArticlesView.vue') },
  { path: '/cms', name: 'cms', meta: { label: '页面内容', desc: '维护 FAQ、下载资料、品牌故事、音频方案等内容。' }, component: () => import('./views/CmsView.vue') },
  { path: '/resources', name: 'resources', meta: { label: '资源库', desc: '管理上传素材、引用关系、重复资源和未使用图片。' }, component: () => import('./views/ResourcesView.vue') },
  { path: '/crm', name: 'crm', meta: { label: '客户工单', desc: '处理预约、咨询、售后和艺术家申请。' }, component: () => import('./views/CrmView.vue') },
  { path: '/security', name: 'security', meta: { label: '安全与审计', desc: '管理账号权限、登录记录、操作日志、备份和异常告警。' }, component: () => import('./views/SecurityView.vue') },
  { path: '/help', name: 'help', meta: { label: '后台帮助', desc: '查看常见操作流程、注意事项和上线后巡检建议。' }, component: () => import('./views/HelpView.vue') }
]

export const router = createRouter({
  history: createWebHistory(),
  routes: adminRoutes
})
