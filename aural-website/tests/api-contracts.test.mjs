import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fetchCompleteList } from '../app/utils/fetchCompleteList.js'
const source=fs.readFileSync(new URL('../app/composables/useAuralApi.js',import.meta.url),'utf8').replace(/^import .*\n/, '').replaceAll('export const ','const ')
function harness(query={},fetcher=async()=>({data:[]}),config={public:{apiBase:'http://127.0.0.1:1337'}},server=false){
 const computed=fn=>({get value(){return fn()}}),unref=v=>v?.value??v
 return Function('fetchCompleteList','computed','unref','useRuntimeConfig','useRoute','useAsyncData','$fetch','process',source+';return {useApiUrl,useMediaUrl,useCompleteApiList}')(fetchCompleteList,computed,unref,()=>config,()=>({query}),async(key,fetch)=>({key:unref(key),data:await fetch()}),fetcher,{server})
}
test('preview applies only to content APIs and never to image URLs or public forms',()=>{
 const h=harness({previewToken:'preview-ticket'});assert.match(h.useApiUrl('/api/products').value,/previewToken=/);assert.doesNotMatch(h.useApiUrl('/api/inquiries').value,/previewToken=/);assert.equal(h.useMediaUrl()('/uploads/photo.jpg'),'http://127.0.0.1:1337/uploads/photo.jpg');assert.equal(h.useMediaUrl()('https://example.invalid/photo.jpg'),'https://example.invalid/photo.jpg')
})
test('catalog loader includes products beyond the first fifty and retains preview identity',async()=>{
 const visited=[];const h=harness({},async(url,{query})=>{visited.push(query.page);return {data:Array.from({length:query.page<3?50:7},(_,i)=>({id:(query.page-1)*50+i+1})),meta:{pagination:{pageCount:3}}}})
 const r=await h.useCompleteApiList({value:'https://example.invalid/api/products?previewToken=fixture'},{key:'products'});assert.equal(r.data.data.length,107);assert.deepEqual(visited,[1,2,3]);assert.match(r.key,/previewToken=fixture/)
})

const rejectedMediaUrls = [
 'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,fixture',
 'vbscript:fixture', 'file:///fixture.pdf', 'blob:https://example.invalid/fixture',
 '//example.invalid/file.pdf', '///example.invalid/file.pdf',
 '\\example.invalid/file.pdf', '/uploads\\file.pdf',
 '\nhttps://example.invalid/file.pdf', 'java\tscript:alert(1)',
 '/uploads/file\u0000.pdf', '/uploads/file\u007f.pdf', '/uploads/file\u0085.pdf',
 'https://', 'http:/example.invalid/file.pdf', 'https:example.invalid/file.pdf',
 'https:///example.invalid/file.pdf', 'https://example.invalid:bad/file.pdf',
 'https://bad host.invalid/file.pdf', 'https://[invalid/file.pdf',
 {}, ['https://example.invalid/file.pdf'], 12
]

test('media URLs preserve valid resources, public origin and caller fallbacks',()=>{
 const config={apiInternalBase:'http://api-internal.invalid:1337',public:{apiBase:'https://media.example.invalid/api/'}}
 const h=harness({},undefined,config,true),mediaUrl=h.useMediaUrl()
 assert.equal(h.useApiUrl('/api/products').value,'http://api-internal.invalid:1337/api/products')
 for(const path of ['/uploads/photo.jpg','uploads/photo.jpg','./uploads/photo.jpg','../uploads/photo.jpg','/uploads/说明 文档.pdf?version=2#page=3']) {
  assert.equal(mediaUrl(path),`https://media.example.invalid/api${path.startsWith('/')?'':'/'}${path}`)
 }
 for(const url of ['https://example.invalid/file.pdf?version=2#page=3','HTTP://example.invalid/file.pdf','https://[::1]:1337/uploads/file.pdf']) {
  assert.equal(mediaUrl(url),url)
 }
 assert.equal(mediaUrl('  /uploads/photo.jpg  '),'https://media.example.invalid/api/uploads/photo.jpg')
 for(const value of [undefined,null,'','   ']) {
  assert.equal(mediaUrl(value),'')
  assert.equal(mediaUrl(value,null),null)
  assert.equal(mediaUrl(value,'/brand-fallback.jpg'),'/brand-fallback.jpg')
 }
})

test('media URLs reject unsafe or malformed input for absolute, relative and empty API bases',()=>{
 for(const apiBase of ['https://media.example.invalid','/api','']) {
  const mediaUrl=harness({},undefined,{public:{apiBase}}).useMediaUrl()
  for(const input of rejectedMediaUrls) {
   assert.equal(mediaUrl(input,null),null,`base=${apiBase}; input=${JSON.stringify(input)}`)
   assert.equal(mediaUrl(input,'/brand-fallback.jpg'),'/brand-fallback.jpg')
  }
  assert.equal(mediaUrl('/uploads/file.pdf'),`${apiBase}/uploads/file.pdf`)
 }
})

const productSource=fs.readFileSync(new URL('../app/pages/products/[id].vue',import.meta.url),'utf8')
const supportSource=fs.readFileSync(new URL('../app/pages/support.vue',import.meta.url),'utf8')
function actualDownloadLists(rows,mediaUrl){
 const computed=fn=>({get value(){return fn()}})
 const downloadResponse={value:{data:rows}}
 const productBody=productSource.slice(productSource.indexOf('const supportDownloads ='),productSource.indexOf('\n\nwatch(product'))
 const supportBody=supportSource.slice(supportSource.indexOf('const displayDownloads ='),supportSource.indexOf('\n\nconst { data: rawGuides'))
 const product=Function('computed','downloadResponse','mediaUrl',`${productBody}\nreturn supportDownloads.value;`)(computed,downloadResponse,mediaUrl)
 const support=Function('computed','rawDownloads','mediaUrl',`${supportBody}\nreturn displayDownloads.value;`)(computed,downloadResponse,mediaUrl)
 const hrefExpression=productSource.match(/:href="([^"]*file\.fileUrl[^"]*)"/)[1]
 const productHref=Function('file',`return ${hrefExpression}`)
 return {product,support,productHref}
}

test('actual download page computations resolve the same API resource and preserve the product top three',()=>{
 const rows=[
  {id:42,name:'Local manual',fileUrl:'/uploads/manual.pdf',type:'PDF',size:'2 MB'},
  {id:7,name:'External driver',fileUrl:'https://downloads.example.invalid/driver.zip?version=2#release'},
  {id:31,name:'Pending file',fileUrl:null},
  {id:2,name:'Fourth file',fileUrl:'/uploads/fourth.pdf'}
 ]
 const before=structuredClone(rows),mediaUrl=harness().useMediaUrl()
 const {product,support,productHref}=actualDownloadLists(rows,mediaUrl)
 assert.deepEqual(product.map(file=>file.id),[42,7,31])
 assert.equal(support.length,4)
 assert.deepEqual(product,support.slice(0,3))
 assert.equal(productHref(product[0]),'http://127.0.0.1:1337/uploads/manual.pdf')
 assert.equal(productHref(product[1]),rows[1].fileUrl)
 assert.equal(productHref(product[2]),'/support?type=download')
 assert.equal(support[2].fileUrl,null)
 assert.deepEqual(rows,before)
 for(const empty of [[],null,undefined]) {
  const result=actualDownloadLists(empty,mediaUrl)
  assert.deepEqual(result.product,[])
  assert.deepEqual(result.support,[])
 }
})

test('actual download page computations never expose rejected URLs as download links',()=>{
 for(const fileUrl of rejectedMediaUrls) {
  const {product,support,productHref}=actualDownloadLists([{id:1,name:'Fixture',fileUrl}],harness().useMediaUrl())
  assert.equal(product[0].fileUrl,null,JSON.stringify(fileUrl))
  assert.equal(support[0].fileUrl,null,JSON.stringify(fileUrl))
  assert.equal(productHref(product[0]),'/support?type=download')
 }
})
