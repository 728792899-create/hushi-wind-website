export const mediaCategories = [
  {value:'product',label:'产品素材'}, {value:'brand',label:'品牌与首页'},
  {value:'artist',label:'艺术家'}, {value:'news',label:'新闻活动'},
  {value:'support',label:'服务资料'}, {value:'uncategorized',label:'未分类'},
]
export const categoryLabel = value => mediaCategories.find(c=>c.value===value)?.label || '跟随引用自动分类'
