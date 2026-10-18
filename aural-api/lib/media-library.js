const { canonicalUploadUrl } = require('./security');
const { extractUploadUrls } = require('./resource-references');
const categories = [
  { value: 'product', label: '产品素材' }, { value: 'brand', label: '品牌与首页' },
  { value: 'artist', label: '艺术家' }, { value: 'news', label: '新闻活动' },
  { value: 'support', label: '服务资料' }, { value: 'uncategorized', label: '未分类' },
];
const configFields = {
  heroImageUrl: ['品牌首页', '主视觉', 'brand'], coreTechBgImageUrl: ['品牌首页', '工艺背景', 'brand'],
  coreTechImageUrl: ['品牌首页', '工艺配图', 'brand'], quoteBgImageUrl: ['品牌首页', '品牌寄语背景', 'brand'],
  artistHeroImageUrl: ['艺术家页面', '主视觉', 'artist'], audioHeroImageUrl: ['专业音响页面', '主视觉', 'brand'],
  supportHeroImageUrl: ['服务支持页面', '主视觉', 'support'],
};
const roles = { imageUrl:'配图', ogImageUrl:'分享封面', gallery:'详情图', coverUrl:'封面', videoUrl:'视频', fileUrl:'下载资料', content:'正文配图', description:'介绍配图', answer:'解答配图' };
function readMetadata(row) { try { const value=JSON.parse(row?.metadata || '{}'); return value && typeof value==='object' && !Array.isArray(value) ? value : {}; } catch { return {}; } }
function buildMediaReferences(groups, archives=[]) {
  const result=[];
  for (const [module, section, category, records] of groups) {
    for (const record of [...records].filter(Boolean).sort((a,b)=>a.id-b.id)) {
      const title = record.title || record.name || record.question || record.label || '独立页面';
      for (const [field,value] of Object.entries(record)) {
        if (['createdAt','updatedAt','id'].includes(field)) continue;
        const direct = /Url$/.test(field) && typeof value==='string' && /^(?:https?:\/\/|\/uploads\/)/.test(value) ? canonicalUploadUrl(value) : null;
        const urls=direct ? [direct] : extractUploadUrls(value);
        urls.forEach((url,index)=>{
          let name=title, role=roles[field] || '内容素材', group=category;
          if (module==='config') { [name,role,group]=configFields[field] || ['官网设置', roles[field] || '内容素材', 'brand']; }
          if (field==='imageUrl' && module==='product') role='产品主图';
          if (field==='imageUrl' && module==='artist') role='艺术家照片';
          if (field==='gallery') role=`详情图 ${String(index+1).padStart(2,'0')}`;
          result.push({url,module,recordId:record.id,field,section,title:`${name} · ${role}`.slice(0,160),category:group,archived:false});
        });
      }
    }
  }
  const archiveKeys=new Set();
  for(const [section,records] of archives) for(const record of records){
    let payload;try{payload=JSON.parse(record.payload || record.snapshot || '{}')}catch{payload={}}
    for(const url of extractUploadUrls(payload)){
      const key=`${section}:${record.module}:${record.recordId}:${url}`;if(archiveKeys.has(key))continue;archiveKeys.add(key);
      result.push({url,module:record.module,recordId:record.recordId,section,title:`${section} · ${payload.title || payload.name || record.title || '内容'}`.slice(0,160),archived:true});
    }
  }
  return result;
}
function describeMedia(file, stored, references) {
  const meta=readMetadata(stored), current=references.filter(r=>!r.archived);
  const primary=[...current].sort((a,b)=>{
    const rank=r=> (r.field==='imageUrl' && r.module==='product'?0:r.module==='config'?1:r.field==='ogImageUrl'?4:2);
    return rank(a)-rank(b) || `${a.module}:${String(a.recordId).padStart(12,'0')}:${a.field}`.localeCompare(`${b.module}:${String(b.recordId).padStart(12,'0')}:${b.field}`);
  })[0];
  const autoName=primary?.title || meta.originalName || file.name;
  const nameMode=stored && meta.nameMode!=='auto' ? 'manual' : 'auto';
  const categoryMode=categories.some(c=>c.value===meta.category) ? meta.category : 'auto';
  const category=categoryMode==='auto' ? primary?.category || 'uncategorized' : categoryMode;
  return {...file,originalName:file.name,name:nameMode==='manual' ? stored.name : autoName, autoName,nameMode,
    category,categoryMode,categoryLabel:categories.find(c=>c.value===category)?.label || '未分类',altText:stored?.altText || '',
    inUse:references.length>0,referenceCount:current.length,retainedReferenceCount:references.length-current.length,references};
}
module.exports={categories,readMetadata,buildMediaReferences,describeMedia};

// Read immutable snapshots in bounded batches, retaining only distinct references.
async function historicalMediaReferences(prisma, batchSize = 250) {
  const boundary = (await prisma.contentVersion.aggregate({ _max: { id: true } }))._max.id;
  if (!boundary) return [];
  let cursor = 0;
  const unique = new Map();
  while (cursor < boundary) {
    const rows = await prisma.contentVersion.findMany({
      where: { id: { gt: cursor, lte: boundary } }, orderBy: { id: 'asc' }, take: batchSize,
      select: { id: true, module: true, recordId: true, title: true, snapshot: true },
    });
    if (!rows.length) break;
    for (const ref of buildMediaReferences([], [['历史版本', rows]])) {
      const key = `${ref.module}:${ref.recordId}:${ref.url}`;
      if (!unique.has(key)) unique.set(key, ref);
    }
    cursor = rows.at(-1).id;
  }
  return [...unique.values()];
}
module.exports.historicalMediaReferences = historicalMediaReferences;

// Content versions are append-only through the application. Keep their extracted
// URLs in memory, not their potentially large snapshots. Reconcile on count/range
// changes, database replacement, and periodically for out-of-process maintenance.
// This index is only for the read-only inventory; deletion still checks live data.
function createHistoricalMediaIndex({ db, identity = async () => '', now = Date.now,
  reconcileAfter = 300000, batchSize = 250 }) {
  let cached = null;
  const bounds = async () => {
    const value = await db.contentVersion.aggregate({
      _min: { id: true }, _max: { id: true }, _count: { _all: true },
    });
    return { min: value._min.id || 0, max: value._max.id || 0, count: value._count._all };
  };
  return async () => {
    const source = await identity();
    const before = await bounds();
    const reusable = cached && cached.source === source && cached.reconcileAt > now();
    if (reusable && before.min === cached.min && before.max === cached.max && before.count === cached.count)
      return [...cached.references.values()];
    const append = reusable && before.min === cached.min && before.max > cached.max && before.count > cached.count;
    const references = append ? new Map(cached.references) : new Map();
    let cursor = append ? cached.max : 0, count = append ? cached.count : 0;
    while (cursor < before.max) {
      const rows = await db.contentVersion.findMany({
        where: { id: { gt: cursor, lte: before.max } }, orderBy: { id: 'asc' }, take: batchSize,
        select: { id: true, module: true, recordId: true, title: true, snapshot: true },
      });
      if (!rows.length) break;
      count += rows.length;
      for (const ref of buildMediaReferences([], [['历史版本', rows]])) {
        const key = `${ref.module}:${ref.recordId}:${ref.url}`;
        if (!references.has(key)) references.set(key, ref);
      }
      cursor = rows.at(-1).id;
    }
    const after = await bounds();
    if (count !== before.count || JSON.stringify(after) !== JSON.stringify(before) || source !== await identity()) {
      // A deletion can race an append without changing the minimum ID. Drop the
      // incremental base so the next bounded inventory attempt does a full scan.
      cached = null;
      throw Object.assign(new Error('素材历史正在更新，请稍后刷新'), { status: 503, code: 'RESOURCE_INVENTORY_CHANGED' });
    }
    cached = { ...before, source, references, reconcileAt: append ? cached.reconcileAt : now() + reconcileAfter };
    return [...references.values()];
  };
}
module.exports.createHistoricalMediaIndex = createHistoricalMediaIndex;
