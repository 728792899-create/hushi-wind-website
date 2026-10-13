import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { articlePreviewText } from '../app/utils/articlePreviewText.js'

const articleBody = `## 本地合成阅读体验

这段正文必须保留，供读者判断内容。
> 合成引用：此处只用于版式验收。

![本地合成插图](/uploads/step12.svg "合成图注")
@[video](/uploads/step12.mp4 "本地合成视频")

### 后续说明
第二部分用于检查长文滚动。`
const expectedPreview = '本地合成阅读体验 这段正文必须保留，供读者判断内容。 合成引用：此处只用于版式验收。 合成图注 本地合成视频 后续说明 第二部分用于检查长文滚动。'

test('article preview retains prose, headings, quotes and media captions without their syntax or URLs', () => {
  assert.equal(articlePreviewText(articleBody), expectedPreview)
  assert.equal(articlePreviewText('![替代文本](/uploads/image.svg)\n@[视频](https://media.example.invalid/demo.mp4)\n保留末段。'), '替代文本 保留末段。')
})

test('article preview removes legacy media URLs and preserves ordinary link labels and formatting text', () => {
  const body = '/uploads/photo.jpg 本地图注\nhttps://media.example.invalid/clip.mp4 视频注释\n阅读[完整说明](https://example.invalid/manual "说明")，查看 **重要信息**、_维护方法_ 和 `型号 A`。\n资料地址：https://example.invalid/file.pdf。后续正文。'
  assert.equal(articlePreviewText(body), '本地图注 视频注释 阅读完整说明，查看 重要信息、维护方法 和 型号 A。 资料地址：。后续正文。')
})

test('article preview preserves plain product notation and body length while normalizing paragraph whitespace', () => {
  const plain = '型号 C# / AB_CD EF_GH；条件 1 > 0；规格 3.5 mm；计算 2 * 3 * 4。'
  assert.equal(articlePreviewText(plain), plain)
  assert.equal(articlePreviewText(`\r\n ${plain}\r\n\r\n 第二段。 `), `${plain} 第二段。`)
  const longText = '保留中文正文。'.repeat(100)
  assert.equal(articlePreviewText(longText), longText)
  for (const value of [null, undefined, '', ' \n ']) assert.equal(articlePreviewText(value), '')
})

function actualNewsMapping(rows) {
  const source = fs.readFileSync(new URL('../app/pages/news/index.vue', import.meta.url), 'utf8')
  const start = source.indexOf('const allData = computed(')
  const end = source.indexOf('\nconst normalizedSearchKeyword', start)
  assert.ok(start >= 0 && end > start, 'the test must execute the actual news list computed mapping')
  return Function('computed', 'strapiNews', 'mediaUrl', 'brandAssets', 'articlePreviewText', `${source.slice(start, end)}\nreturn allData.value;`)(
    fn => ({ get value() { return fn() } }), { value: { data: rows } }, value => `https://media.example.invalid${value}`, { brandCraft: '/fallback.jpg' }, articlePreviewText
  )
}

test('the actual news list mapping cleans body previews and keeps original content and SEO precedence', () => {
  const rows = [
    { id: 42, attributes: { title: '合成资讯', slug: 'fixture-news', description: articleBody, category: '合成知识', date: '2026-10-13', image: { data: { attributes: { url: '/uploads/photo.jpg' } } } } },
    { id: 7, attributes: { title: '另一资讯', description: articleBody, seoDescription: '优先采用这条正式摘要。', category: '合成动态' } },
    { id: 19, attributes: { title: '富格式摘要', description: '正文保持原样', seoDescription: '## 精选摘要\n@[video](/uploads/demo.mp4 "合成演示")' } }
  ]
  const original = structuredClone(rows)
  const result = actualNewsMapping(rows)
  assert.deepEqual(result.map(item => item.id), [42, 7, 19])
  assert.equal(result[0].desc, expectedPreview)
  assert.equal(result[0].title, '合成资讯')
  assert.equal(result[0].slug, 'fixture-news')
  assert.equal(result[0].category, '合成知识')
  assert.equal(result[0].date, '2026-10-13')
  assert.equal(result[0].image, 'https://media.example.invalid/uploads/photo.jpg')
  assert.equal(result[1].desc, '优先采用这条正式摘要。')
  assert.equal(result[2].desc, '精选摘要 合成演示')
  assert.deepEqual(rows, original, 'display normalization must not mutate API records or the stored article body')
  assert.deepEqual(actualNewsMapping([]), [])
})

test('actual article detail summaries preserve truncation, SEO priority and rich body rendering', () => {
  const source = fs.readFileSync(new URL('../app/pages/news/[id].vue', import.meta.url), 'utf8')
  const start = source.indexOf('const splitParagraphs =')
  const end = source.indexOf('\nconst allData = computed(', start)
  assert.ok(start >= 0 && end > start)
  const { normalizeArticle, shortSummary } = Function('mediaUrl', 'brandAssets', 'articlePreviewText', `${source.slice(start, end)}\nreturn {normalizeArticle,shortSummary};`)(value => `https://media.example.invalid${value}`, { brandCraft: '/fallback.jpg' }, articlePreviewText)
  const row = { id: 1, attributes: { title: '资讯正文', description: articleBody } }
  const original = structuredClone(row)
  const result = normalizeArticle(row)
  assert.equal(result.seoDescription, expectedPreview)
  assert.equal(result.summary, expectedPreview)
  assert.equal(result.body, articleBody)
  assert.equal(result.contentBlocks.some(block => block.type === 'heading' && block.text === '本地合成阅读体验'), true)
  assert.equal(result.contentBlocks.some(block => block.type === 'image' && block.src === 'https://media.example.invalid/uploads/step12.svg'), true)
  assert.equal(result.contentBlocks.some(block => block.type === 'video' && block.src === 'https://media.example.invalid/uploads/step12.mp4'), true)
  assert.deepEqual(row, original)
  const longText = '正文不会改变。'.repeat(100)
  assert.equal(shortSummary(`## ${longText}`), `${longText.slice(0, 96)}...`)
  assert.equal(normalizeArticle({ id: 2, attributes: { description: `## ${longText}` } }).seoDescription, `${longText.slice(0, 160)}...`)
  assert.equal(normalizeArticle({ id: 3, attributes: { description: articleBody, seoDescription: '## 编辑摘要\n保留优先级。' } }).seoDescription, '编辑摘要 保留优先级。')
})

test('actual global search article preview is plain text while its search source and navigation stay intact', () => {
  const source = fs.readFileSync(new URL('../app/components/AppSearchPanel.vue', import.meta.url), 'utf8')
  const start = source.indexOf('const articleResultsSource = computed(')
  const end = source.indexOf('\nconst faqResultsSource', start)
  assert.ok(start >= 0 && end > start)
  const rows = [{ id: 9, title: '搜索资讯', category: '合成知识', description: articleBody, slug: 'article-fixture' }]
  const original = structuredClone(rows)
  const result = Function('computed', 'normalizeRows', 'articleResponse', 'mediaUrl', 'articlePreviewText', `${source.slice(start, end)}\nreturn articleResultsSource.value;`)(fn => ({ get value() { return fn() } }), response => response.value.data, { value: { data: rows } }, () => '', articlePreviewText)
  assert.equal(result[0].description, expectedPreview)
  assert.deepEqual(result[0].searchable, ['搜索资讯', '合成知识', articleBody])
  assert.equal(result[0].to, '/news/9')
  assert.deepEqual(rows, original)
})
