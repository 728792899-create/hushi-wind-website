export async function fetchSitemapCollection(url, fetcher) {
  const items=[],seen=new Set();
  for(let page=1;page<=10000;page++) {
    const result=await fetcher(url,{query:{page,pageSize:100}});
    if(!Array.isArray(result?.data)) throw new Error('Invalid sitemap collection response');
    for(const item of result.data) {const key=item.id ?? item.attributes?.id;if(key===undefined)throw new Error('Missing sitemap item id');if(!seen.has(key)){seen.add(key);items.push(item)}}
    const pagination=result.meta?.pagination;
    if(!pagination)return items;
    if(!Number.isFinite(pagination.pageCount)||pagination.pageCount<0)throw new Error('Invalid sitemap pagination');
    if(page>=pagination.pageCount)return items;
    if(!result.data.length)throw new Error('Incomplete sitemap collection');
  }
  throw new Error('Sitemap pagination exceeded safe limit');
}
