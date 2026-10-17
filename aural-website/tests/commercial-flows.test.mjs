import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchSitemapCollection} from '../server/utils/fetchSitemapCollection.js';
import {supportDestination,supportCopy} from '../app/utils/supportFlow.js';

test('sitemap enumerates every API page beyond the default page limit',async()=>{
  const calls=[];
  const result=await fetchSitemapCollection('/products',async(url,{query})=>{
    calls.push(query.page);assert.equal(query.pageSize,100);
    return {data:Array.from({length:query.page===3?5:100},(_,i)=>({id:(query.page-1)*100+i+1})),meta:{pagination:{page:query.page,pageCount:3}}};
  });
  assert.deepEqual(calls,[1,2,3]);assert.equal(result.length,205);assert.equal(result.at(-1).id,205);
});
test('sitemap fails incomplete collections instead of caching a partial map',async()=>{
  await assert.rejects(fetchSitemapCollection('/products',async(url,{query})=>{if(query.page===2)throw Error('offline');return {data:[{id:1}],meta:{pagination:{pageCount:2}}}}),/offline/);
  await assert.rejects(fetchSitemapCollection('/products',async()=>({data:[],meta:{pagination:{pageCount:2}}})));
  await assert.rejects(fetchSitemapCollection('/products',async()=>({error:'unavailable'})));
});
test('service links map to actionable flows and appointments use their own copy',()=>{
  assert.equal(supportDestination('dealer'),'experience');assert.equal(supportDestination('experience'),'experience');
  assert.equal(supportDestination('download'),'download');assert.equal(supportDestination('quickstart'),'quickstart');assert.equal(supportDestination('unknown'),null);
  const copy=supportCopy('experience');assert.match(copy.title,/试奏/);assert.match(copy.success,/预约/);assert.doesNotMatch(copy.message,/故障/);assert.equal(copy.error,'');
  assert.match(supportCopy('repair').message,/故障/);
});

// The observer's bounded reporting and lifecycle are exercised with actual
// plugin code in loading-resilience.test.mjs.
