import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

for (const [view, fn, drawer, rows, busy, active, restore] of [
  ['ProductsView', 'openVersionDrawer', 'versionDrawerOpen', 'productVersions', 'versionsLoading', 'activeVersionProduct', 'restoreProductVersion'],
  ['ArticlesView', 'openArticleVersionDrawer', 'articleVersionDrawerOpen', 'articleVersions', 'articleVersionsLoading', 'activeVersionArticle', 'restoreArticleVersion'],
  ['CmsView', 'openContentVersionDrawer', 'contentVersionDrawerOpen', 'contentVersions', 'contentVersionsLoading', 'activeVersionContent', 'restoreContentVersion'],
]) test(`${view}: closing during history fetch does not strand loading; next page appends`, async () => {
  const source = await fs.readFile(new URL(`../src/views/${view}.vue`, import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('let versionRequestId = 0'), source.indexOf(`const ${restore} =`));
  const refs = { [drawer]: { value: false }, [rows]: { value: [] }, [busy]: { value: false }, [active]: { value: null }, historyPage: { value: 1 }, historyHasMore: { value: false }, activeVersionEndpoint: { value: '' } };
  const requests = [], watchers = [];
  const scope = { ...refs, watch: (source, fn) => watchers.push(fn),
    api: { get: (url, config) => new Promise(resolve => requests.push({ url, config, resolve })) },
    listData: response => response.data.data, ElMessage: { error: text => assert.fail(text) }, extractErrorMessage: e => e.message };
  const open = Function(...Object.keys(scope), code + `\nreturn ${fn};`)(...Object.values(scope));
  const call = (row, append = false) => view === 'CmsView' ? open(row, 'support-downloads', append) : open(row, append);
  const old = call({ id: 1 }); assert.equal(refs[busy].value, true);
  watchers[0](false); assert.equal(refs[busy].value, false);
  const current = call({ id: 2 }); assert.equal(requests.length, 2);
  requests[0].resolve({ data: { data: [{ id: 'stale' }], meta: { pagination: { pageCount: 1 } } } }); await old;
  assert.equal(refs[busy].value, true); assert.deepEqual(refs[rows].value, []);
  requests[1].resolve({ data: { data: [{ id: 'current' }], meta: { pagination: { pageCount: 2 } } } }); await current;
  assert.equal(refs[busy].value, false); assert.equal(refs.historyHasMore.value, true);
  const more = call({ id: 2 }, true); assert.equal(requests[2].config.params.page, 2);
  requests[2].resolve({ data: { data: [{ id: 'older' }], meta: { pagination: { pageCount: 2 } } } }); await more;
  assert.deepEqual(refs[rows].value.map(row => row.id), ['current', 'older']); assert.equal(refs.historyHasMore.value, false);
});
