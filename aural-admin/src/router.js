import { createRouter, createWebHistory } from 'vue-router'

export const adminRoutes = [
  { path: '/', redirect: '/dashboard' },
  {
    path: '/dashboard',
    name: 'dashboard',
    meta: { label: '工作台', desc: '从这里开始，维护产品与跟进客户。', permission: 'dashboard:read' },
    component: () => import('./views/DashboardView.vue'),
  },
  {
    path: '/products',
    name: 'products',
    meta: { label: '产品', desc: '维护乐器目录、产品资料与发布状态。', permission: 'products:read' },
    component: () => import('./views/ProductsView.vue'),
  },
  {
    path: '/artists',
    name: 'artists',
    meta: {
      label: '艺术家',
      desc: '展示合作艺术家与他们的音乐故事。',
      permission: 'artists:read',
      group: 'content',
    },
    component: () => import('./views/ArtistsView.vue'),
  },
  {
    path: '/config',
    name: 'config',
    meta: {
      label: '首页与品牌',
      desc: '维护品牌形象、首页图文与联系信息。',
      permission: 'config:read',
      group: 'content',
    },
    component: () => import('./views/ConfigView.vue'),
  },
  {
    path: '/articles',
    name: 'articles',
    meta: {
      label: '新闻动态',
      desc: '发布品牌新闻、活动与音乐故事。',
      permission: 'articles:read',
      group: 'content',
    },
    component: () => import('./views/ArticlesView.vue'),
  },
  {
    path: '/cms',
    name: 'cms',
    meta: {
      label: '服务与栏目',
      desc: '维护使用指南、下载资料与官网栏目。',
      permission: 'cms:read',
      group: 'content',
    },
    component: () => import('./views/CmsView.vue'),
  },
  {
    path: '/resources',
    name: 'resources',
    meta: { label: '素材', desc: '集中管理官网图片、视频与下载文件。', permission: 'resources:read' },
    component: () => import('./views/ResourcesView.vue'),
  },
  {
    path: '/crm',
    name: 'crm',
    meta: { label: '客户咨询', desc: '跟进产品咨询、试奏预约、售后与合作申请。', permission: 'crm:read' },
    component: () => import('./views/CrmView.vue'),
  },
  {
    path: '/settings',
    alias: '/security',
    name: 'settings',
    meta: { label: '设置', desc: '管理账号安全、团队权限与数据备份。' },
    component: () => import('./views/SettingsView.vue'),
  },
  {
    path: '/help',
    name: 'help',
    meta: { label: '使用帮助', desc: '了解官网日常维护的基本流程。' },
    component: () => import('./views/HelpView.vue'),
  },
]

adminRoutes.push({ path: '/:pathMatch(.*)*', redirect: '/dashboard' })

export const router = createRouter({
  history: createWebHistory(),
  routes: adminRoutes,
})
