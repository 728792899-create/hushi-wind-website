import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fetchCompleteList } from '../app/utils/fetchCompleteList.js'
const source=fs.readFileSync(new URL('../app/composables/useAuralApi.js',import.meta.url),'utf8').replace(/^import .*\n/, '').replaceAll('export const ','const ')
function harness(query={},fetcher=async()=>({data:[]})){
 const computed=fn=>({get value(){return fn()}}),unref=v=>v?.value??v
 return Function('fetchCompleteList','computed','unref','useRuntimeConfig','useRoute','useAsyncData','$fetch',source+';return {useApiUrl,useMediaUrl,useCompleteApiList}')(fetchCompleteList,computed,unref,()=>({public:{apiBase:'http://127.0.0.1:1337'}}),()=>({query}),async(key,fetch)=>({key:unref(key),data:await fetch()}),fetcher)
}
test('preview applies only to content APIs and never to image URLs or public forms',()=>{
 const h=harness({previewToken:'preview-ticket'});assert.match(h.useApiUrl('/api/products').value,/previewToken=/);assert.doesNotMatch(h.useApiUrl('/api/inquiries').value,/previewToken=/);assert.equal(h.useMediaUrl()('/uploads/photo.jpg'),'http://127.0.0.1:1337/uploads/photo.jpg');assert.equal(h.useMediaUrl()('https://example.invalid/photo.jpg'),'https://example.invalid/photo.jpg')
})
test('catalog loader includes products beyond the first fifty and retains preview identity',async()=>{
 const visited=[];const h=harness({},async(url,{query})=>{visited.push(query.page);return {data:Array.from({length:query.page<3?50:7},(_,i)=>({id:(query.page-1)*50+i+1})),meta:{pagination:{pageCount:3}}}})
 const r=await h.useCompleteApiList({value:'https://example.invalid/api/products?previewToken=fixture'},{key:'products'});assert.equal(r.data.data.length,107);assert.deepEqual(visited,[1,2,3]);assert.match(r.key,/previewToken=fixture/)
})
