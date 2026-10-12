const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractUploadUrls,
  collectContentReferences,
} = require('../lib/resource-references');
test('finds article image/video markdown with captions, absolute URLs and query strings', () => {
  assert.deepEqual(
    extractUploadUrls(
      '![图](/uploads/a.jpg "图说明")\n@[video](https://site.example/uploads/demo.mp4?rev=2 "视频")',
    ),
    ['/uploads/a.jpg', '/uploads/demo.mp4'],
  );
});
test('finds HTML, nested JSON gallery and SEO references, without duplicate URLs', () => {
  assert.deepEqual(
    extractUploadUrls({
      body: '<img src="/uploads/a.jpg">',
      gallery: JSON.stringify(['/uploads/a.jpg', '/uploads/b.png']),
      seo: { ogImage: '/uploads/c.webp' },
    }),
    ['/uploads/a.jpg', '/uploads/b.png', '/uploads/c.webp'],
  );
});
test('protects draft body references and includes each content location without repeating direct image entries', () => {
  const items = [
    { section: '新闻', title: '测试新闻', url: '/uploads/cover.jpg' },
  ];
  collectContentReferences(items, [
    [
      '新闻',
      [
        {
          title: '测试新闻',
          status: 'draft',
          imageUrl: '/uploads/cover.jpg',
          description: '![图](/uploads/body.jpg "说明")',
        },
      ],
    ],
    ['页面', [{ pageKey: 'about', body: '/uploads/body.jpg' }]],
  ]);
  assert.equal(items.filter((x) => x.url === '/uploads/cover.jpg').length, 1);
  assert.equal(items.filter((x) => x.url === '/uploads/body.jpg').length, 2);
});
test('ignores non-content values and unrelated remote files', () => {
  assert.deepEqual(
    extractUploadUrls({
      x: null,
      n: 123,
      blank: '',
      remote: 'https://example.com/image.jpg',
    }),
    [],
  );
});

test('normalizes URL-encoded filenames and dot segments to the actual uploaded file', () => {
  assert.deepEqual(
    extractUploadUrls(
      '![图](/uploads/%61.jpg) ![图](/uploads/sub/../a.jpg) ![图](/uploads/sub/%2E%2E/a.jpg)',
    ),
    ['/uploads/a.jpg'],
  );
  assert.deepEqual(extractUploadUrls('/uploads/bad%name.jpg'), [
    '/uploads/bad%name.jpg',
  ]);
});
