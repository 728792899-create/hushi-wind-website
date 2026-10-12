export const contentPages = [
  { path: '/config', label: '首页与品牌', permission: 'config:read' },
  { path: '/articles', label: '新闻动态', permission: 'articles:read' },
  { path: '/artists', label: '艺术家', permission: 'artists:read' },
  { path: '/cms', label: '服务与栏目', permission: 'cms:read' },
]
export const canAccess = (user, permission) =>
  !permission ||
  (user?.permissions || []).some((p) => p === '*' || p === permission)
export const visibleContentPages = (user) =>
  contentPages.filter((item) => canAccess(user, item.permission))
export const navigationFor = (user) =>
  [
    {
      path: '/dashboard',
      label: '工作台',
      icon: 'House',
      permission: 'dashboard:read',
    },
    {
      path: '/products',
      label: '产品',
      icon: 'Collection',
      permission: 'products:read',
    },
    ...(visibleContentPages(user).length
      ? [
          {
            path: visibleContentPages(user)[0].path,
            label: '官网内容',
            icon: 'Document',
            group: 'content',
          },
        ]
      : []),
    {
      path: '/crm',
      label: '客户咨询',
      icon: 'ChatDotRound',
      permission: 'crm:read',
    },
    {
      path: '/resources',
      label: '素材',
      icon: 'Picture',
      permission: 'resources:read',
    },
    { path: '/settings', label: '设置', icon: 'Setting' },
  ].filter((item) => canAccess(user, item.permission))
export const sessionExpired = (status, url = '') =>
  status === 401 && !url.includes('/api/auth/login')
