export const helpTopics = [
  { id: 'all', label: '全部指南' },
  { id: 'products', label: '产品维护' },
  { id: 'content', label: '官网内容' },
  { id: 'crm', label: '客户咨询' },
  { id: 'media', label: '素材管理' },
  { id: 'account', label: '账号与恢复' },
]
export const helpGuides = [
  { id: 'new-product', keywords: '上架产品 新增产品 添加乐器 发布产品', topic: 'products', title: '上架一件新乐器', description: '从产品资料到官网展示，完成一次完整上架。', link: '/products', action: '打开产品', permission: 'products:read', steps: [
    '进入「产品」，点击「新增产品」，填写名称、页面地址、品类和系列。分类与系列可在编辑面板中维护。',
    '上传主图，或点击「从素材库选择」复用产品图片，再补充详情图、简介和产品参数。',
    '在「价格与发布设置」中选择状态。资料未完成时保存为草稿；确认后选择已发布并保存。',
    '打开前台产品页，核对图片、参数与展示状态。',
  ], note: '新建产品需要先保存，才会出现修改草稿、历史版本等工作流入口。' },
  { id: 'edit-product', topic: 'products', title: '修改已发布产品，先预览再更新', description: '用修改草稿暂存调整，核对后再同步官网。', link: '/products', action: '打开产品', permission: 'products:read', steps: [
    '打开已有产品的编辑面板，调整图片、文案或参数。',
    '点击「保存修改草稿」，将这次修改单独暂存。',
    '打开预览核对已保存的修改草稿；如有调整，重新保存草稿后再预览。',
    '确认无误后点击「发布修改草稿」，按提示完成发布。',
  ], note: '已发布产品默认保存修改草稿；「直接更新官网」需确认后才发布。遇到其他管理员已更新的提示时，保留输入并重新打开最新记录核对。' },
  { id: 'home', topic: 'content', title: '更新首页与品牌展示', description: '维护主视觉、品牌介绍与首页展示内容。', link: '/config', action: '打开首页与品牌', permission: 'config:read', steps: [
    '进入「官网内容 → 首页与品牌」，找到需要更新的内容区域。',
    '替换图片或修改文字，保存修改草稿后预览。',
    '核对首页排版、图片清晰度与链接，确认后发布修改草稿。',
  ], note: '直接保存官网设置会更新网站。预览链接最长有效 15 分钟；内容变化后旧链接会失效，需要重新预览。' },
  { id: 'news', topic: 'content', title: '发布新闻与艺术家资料', description: '让新闻动态与艺术家档案保持完整、准确。', links: [
    {link:'/articles',action:'打开新闻动态',permission:'articles:read'},
    {link:'/artists',action:'打开艺术家',permission:'artists:read'},
  ], steps: [
    '进入「官网内容」，选择「新闻动态」或「艺术家」，新增或编辑内容。',
    '填写标题或姓名、封面图片与正文资料，检查分类和展示顺序。',
    '新内容按需要保存为草稿或已发布；修改已有内容时可先保存修改草稿，预览后再发布。',
  ] },
  { id: 'downloads', topic: 'content', title: '维护服务栏目与下载资料', description: '整理常见问题、使用指南和乐器说明资料。', link: '/cms', action: '打开服务与栏目', permission: 'cms:read', steps: [
    '进入「官网内容 → 服务与栏目」，选择需要维护的栏目。',
    '编辑问题与回答、指南或下载资料；下载资料可填写关联产品、系列、版本与语言。',
    '核对附件地址与资料内容，按发布状态保存；已有内容可使用修改草稿与预览。',
  ] },
  { id: 'inquiry', topic: 'crm', title: '跟进咨询与安排回访', description: '记录负责人、沟通进展与下一次联系时间。', link: '/crm', action: '打开客户咨询', permission: 'crm:read', steps: [
    '打开一条客户咨询，查看需求并分派负责人。',
    '根据咨询内容填写产品序列号、处理状态和下次回访时间。',
    '保存沟通记录；在工作台查看待联系及到期回访，继续跟进。',
  ], note: '查看客户联系方式和执行编辑操作需要对应权限；没有权限时请联系超级管理员。' },
  { id: 'media', topic: 'media', title: '上传、分类与复用素材', description: '按用途整理图片、视频和文档，减少重复上传。', link: '/resources', action: '打开素材库', permission: 'resources:read', steps: [
    '先选择产品素材、品牌与首页、艺术家、新闻活动、服务资料或未分类，再点击「上传素材」。上传面板可调整目标分类。',
    '勾选需要整理的素材，选择目标分类并点击「移动」。切换筛选或翻页会清空勾选。',
    '使用名称、产品或引用位置搜索，也可按图片、视频、文档和引用状态筛选。',
    '编辑产品时点击「从素材库选择」复用图片；素材卡片点击图片可预览，「更多」中可复制地址。',
  ], note: '支持 JPG、PNG、WebP、GIF、PDF、ZIP、RAR、MP4、MOV，单个文件不超过 20MB。' },
  { id: 'media-name', keywords: '素材命名 自动改名 重命名 图片名称', topic: 'media', title: '让素材跟随引用自动命名', description: '显示“产品名称 · 产品主图”，同时保留原文件链接。', link: '/resources', action: '打开素材库', permission: 'resources:read', steps: [
    '在素材卡片点击「管理」，将命名方式设为「跟随引用」。',
    '当前内容的引用位置会生成展示名称；内容改名后，自动名称随之更新。多处使用会显示引用数量。',
    '需要固定名称时切换「自定义名称」，填写名称并保存设置；用途分类可以独立指定。',
    '查看「引用位置」确认素材用在哪里。草稿、历史版本和回收站引用会单独保留。',
  ], note: '只调整展示名称，不改文件名和 URL。自定义名称优先保留；仅有历史引用的文件不会按旧内容自动命名。' },
  { id: 'restore', topic: 'account', title: '找回误删内容或恢复历史版本', description: '根据删除或编辑的情况，选择对应恢复入口。', link: '/settings', action: '打开设置', steps: [
    '误删产品或内容：进入「设置 → 回收站」，找到对应记录并点击「恢复」。',
    '需要撤回编辑：在对应内容的编辑面板打开「历史版本」，可加载更早版本，选择并恢复目标版本；已失效的目录关联会沿用当前关联。',
    '恢复后重新核对内容状态和官网展示。缺少操作入口时，请联系有权限的管理员。',
  ], note: '素材文件不进入内容回收站，永久删除后不能通过该入口找回。已有引用（含历史与草稿）的素材禁止删除。' },
  { id: 'account', topic: 'account', title: '管理账号、团队与备份', description: '找到账号安全设置与管理员维护入口。', link: '/settings', action: '打开设置', steps: [
    '在「设置 → 账号安全」维护自己的账号安全信息。',
    '超级管理员可在「团队与权限」维护成员、角色与状态。',
    '服务运行时每日自动备份数据库与素材，校验通过后才清理过期副本，并保留至少两个有效完整恢复点。有权限的账号可查看备份、通知投递和维护记录；备份校验不会覆盖当前数据库。',
  ], note: '完整的异地备份与数据库恢复由维护人员负责。帮助页中的入口按当前账号可访问范围显示。' },
]
export const helpFaqs = [
  {id:'draft-live',topic:'products',title:'保存了修改草稿，为什么官网没有变化？',answer:'修改草稿用于暂存调整，不会直接更新官网。请先打开预览，再点击「发布修改草稿」。直接保存已发布内容则会更新官网。'},
  {id:'draft-conflict',topic:'products',title:'提示修改草稿已变化，怎么办？',answer:'另一位管理员已更新这份草稿。请先保留当前未保存的文字，再点击「重新获取最新草稿」。此操作只刷新服务器草稿信息；点击「加载修改草稿」才会替换当前表单。核对并合并修改后，重新保存、预览和发布。'},
  {id:'preview',topic:'content',title:'预览链接失效了怎么办？',answer:'预览链接最长有效 15 分钟，内容变化也会使旧链接失效。回到编辑面板，点击「重新获取最新草稿」，核对后重新预览。预览只展示已经保存的内容或修改草稿。'},
  {id:'delete-media',topic:'media',title:'图片已从页面移除，为什么仍然不能删除？',answer:'该文件可能仍被其他内容、修改草稿、历史版本或回收站引用。在素材「管理」中查看引用位置。保留的引用用于保障草稿和内容恢复，不应仅为删除文件而清除。'},
  {id:'rename-url',topic:'media',title:'自动命名或调整分类会让图片链接失效吗？',answer:'不会。调整的是素材库中的展示名称和用途分类，底层文件名与 URL 保持不变。手动命名的素材也不会被自动名称覆盖。'},
  {id:'permissions',topic:'account',title:'为什么我看不到某个栏目或编辑按钮？',answer:'栏目、客户隐私和操作按钮由账号权限控制。可以先在设置中确认当前账号，再联系超级管理员核对角色与权限。帮助说明不代表账号已获得相应操作权限。'},
  {id:'callback',topic:'crm',title:'怎样避免漏掉需要回访的客户？',answer:'在咨询详情中填写负责人和下次回访时间，并保存沟通记录。工作台会显示待联系和到期回访，处理后及时更新进展。'},
]
export function filterHelp(items, topic, query) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return items.filter(item => (topic === 'all' || item.topic === topic) && words.every(word =>
    [item.title, item.keywords, item.description, item.note, item.answer, ...(item.steps || [])].filter(Boolean).join(' ').toLocaleLowerCase().includes(word)))
}
export const guideLinks = item => item.links || (item.link ? [{link:item.link,action:item.action,permission:item.permission}] : [])
