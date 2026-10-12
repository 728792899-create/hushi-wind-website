const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildMediaReferences,describeMedia}=require('../lib/media-library');
const file={url:'/uploads/piano.jpg',name:'piano.jpg',size:12};
const refs=(title='C3 三角钢琴')=>buildMediaReferences([['product','产品','product',[{id:3,title,imageUrl:file.url,gallery:JSON.stringify([file.url])}]]]);
test('same asset in distinct fields and same-title records keeps every current location',()=>{
 const references=buildMediaReferences([['product','产品','product',[{id:3,title:'钢琴',imageUrl:file.url,gallery:JSON.stringify([file.url])},{id:4,title:'钢琴',imageUrl:file.url}]]]);
 const result=describeMedia(file,null,references);assert.equal(result.referenceCount,3);assert.equal(result.name,'钢琴 · 产品主图');assert.equal(result.category,'product');assert.equal(result.url,file.url);
});
test('automatic display name follows business titles and manual names survive category changes',()=>{
 assert.equal(describeMedia(file,null,refs('新品钢琴')).name,'新品钢琴 · 产品主图');
 const stored={name:'手动展示名称',altText:'键盘细节',metadata:JSON.stringify({category:'brand'})};
 const manual=describeMedia(file,stored,refs());assert.equal(manual.name,stored.name);assert.equal(manual.nameMode,'manual');assert.equal(manual.category,'brand');
 const auto=describeMedia(file,{...stored,metadata:JSON.stringify({nameMode:'auto',category:'auto'})},refs());assert.equal(auto.name,'C3 三角钢琴 · 产品主图');assert.equal(auto.category,'product');
});
test('history protects files without assigning a current name or category',()=>{
 const references=buildMediaReferences([], [['历史版本',[{module:'product',recordId:3,snapshot:JSON.stringify({title:'旧钢琴',imageUrl:file.url})},{module:'product',recordId:3,snapshot:JSON.stringify({title:'更旧钢琴',imageUrl:file.url})}]]]);
 const result=describeMedia(file,null,references);assert.equal(result.inUse,true);assert.equal(result.referenceCount,0);assert.equal(result.retainedReferenceCount,1);assert.equal(result.name,file.name);assert.equal(result.category,'uncategorized');
});
test('uploaded original name is retained until a current reference supplies a title',()=>{
 const stored={name:'钢琴说明.pdf',metadata:JSON.stringify({nameMode:'auto',originalName:'钢琴说明.pdf'})};
 assert.equal(describeMedia(file,stored,[]).name,'钢琴说明.pdf');assert.equal(describeMedia(file,stored,refs()).name,'C3 三角钢琴 · 产品主图');
});
test('direct encoded paths and names containing spaces identify the same asset',()=>{
 const references=buildMediaReferences([['product','产品','product',[{id:1,title:'测试',imageUrl:'/uploads/a b.jpg',ogImageUrl:'/uploads/a%20b.jpg'}]]]);
 assert.equal(references.length,2);assert.equal(references[0].url,references[1].url);
});
test('body beginning with a bare URL still includes subsequent Markdown references',()=>{
 const references=buildMediaReferences([['article','新闻','news',[{id:1,title:'演奏会',content:'https://example.invalid/uploads/a.jpg ![图片](/uploads/b.jpg)'}]]]);
 assert.deepEqual(references.map(r=>r.url),['/uploads/a.jpg','/uploads/b.jpg']);
});

test('historical inventory scans bounded batches and deduplicates references across batches', async () => {
  const { historicalMediaReferences } = require('../lib/media-library');
  const rows = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, module: 'product', recordId: 3, snapshot: JSON.stringify({ title: '钢琴', imageUrl: i === 6 ? '/uploads/old-only.jpg' : '/uploads/piano.jpg' }) }));
  const visited = [];
  const db = { contentVersion: { aggregate: async () => ({ _max: { id: 7 } }), findMany: async ({ where, take, select }) => {
    visited.push(take); assert.equal(where.id.lte, 7); assert.equal(select.snapshot, true);
    return rows.filter(row => row.id > where.id.gt && row.id <= where.id.lte).slice(0, take);
  } } };
  const refs = await historicalMediaReferences(db, 3);
  assert.deepEqual(visited, [3, 3, 3]); assert.deepEqual(refs.map(row => row.url), ['/uploads/piano.jpg', '/uploads/old-only.jpg']);
  assert.ok(refs.every(row => row.archived));
});
