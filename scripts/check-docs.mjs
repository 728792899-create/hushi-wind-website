import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const errors = []

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

const markdownFiles = [
  ...readdirSync(root)
    .filter((name) => /^(README|SECURITY|CONTRIBUTING).*\.md$/.test(name))
    .map((name) => join(root, name)),
  ...walk(join(root, 'docs')).filter((file) => file.endsWith('.md')),
  join(root, '.github', 'PULL_REQUEST_TEMPLATE.md')
].filter(existsSync)

function githubSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

function anchorsFor(file) {
  const counts = new Map()
  return new Set(readFileSync(file, 'utf8').split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^#{1,6}\s+(.+?)\s*#*$/)
    if (!match) return []
    const base = githubSlug(match[1])
    const count = counts.get(base) || 0
    counts.set(base, count + 1)
    return [count ? `${base}-${count}` : base]
  }))
}

const referencedImages = new Set()
const linkPattern = /(!?)\[([^\]]*)\]\(([^)]+)\)/g

for (const file of markdownFiles) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(linkPattern)) {
    const [, image, label, rawTarget] = match
    const target = rawTarget.trim().replace(/^<|>$/g, '').split(/\s+["']/)[0]
    if (/^(https?:|mailto:|tel:)/i.test(target)) continue
    if (image && !label.trim()) errors.push(`${relative(root, file)}: image alt text is empty (${target})`)

    const [rawPath, rawAnchor] = target.split('#', 2)
    const targetFile = rawPath ? resolve(file, '..', decodeURIComponent(rawPath)) : file
    if (!existsSync(targetFile)) {
      errors.push(`${relative(root, file)}: missing local target ${target}`)
      continue
    }
    if (rawAnchor && extname(targetFile).toLowerCase() === '.md') {
      const expected = decodeURIComponent(rawAnchor).toLowerCase()
      if (!anchorsFor(targetFile).has(expected)) errors.push(`${relative(root, file)}: missing anchor #${rawAnchor} in ${relative(root, targetFile)}`)
    }
    if (image) referencedImages.add(targetFile)
  }
}

const zhDocs = readdirSync(join(root, 'docs')).filter((name) => name.endsWith('.md')).sort()
const enDocs = readdirSync(join(root, 'docs', 'en')).filter((name) => name.endsWith('.md')).sort()

for (const name of zhDocs) {
  const zh = join(root, 'docs', name)
  const en = join(root, 'docs', 'en', name)
  if (!existsSync(en)) errors.push(`docs/${name}: missing English pair`)
  if (!readFileSync(zh, 'utf8').includes(`[English](en/${name})`)) errors.push(`docs/${name}: missing English language switch`)
}
for (const name of enDocs) {
  const en = join(root, 'docs', 'en', name)
  const zh = join(root, 'docs', name)
  if (!existsSync(zh)) errors.push(`docs/en/${name}: missing Chinese pair`)
  if (!readFileSync(en, 'utf8').includes(`[简体中文](../${name})`)) errors.push(`docs/en/${name}: missing Chinese language switch`)
}

const languagePairs = [
  ['README.md', 'README.en.md'],
  ['SECURITY.zh-CN.md', 'SECURITY.md'],
  ['CONTRIBUTING.zh-CN.md', 'CONTRIBUTING.md']
]
for (const [zh, en] of languagePairs) {
  if (!existsSync(join(root, zh)) || !existsSync(join(root, en))) errors.push(`missing language pair: ${zh} ↔ ${en}`)
}

const assetFiles = [...walk(join(root, 'docs', 'images')), ...walk(join(root, 'docs', 'screenshots'))]
  .filter((file) => /\.(png|jpe?g|svg|webp)$/i.test(file))

for (const file of assetFiles) {
  const bytes = readFileSync(file)
  const ext = extname(file).toLowerCase()
  const rel = relative(root, file)
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const isWebp = bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP'
  const text = ext === '.svg' ? bytes.toString('utf8') : ''
  const isSvg = /<svg\b/.test(text)

  if (ext === '.png' && !isPng) errors.push(`${rel}: .png extension does not match file signature`)
  if ((ext === '.jpg' || ext === '.jpeg') && !isJpeg) errors.push(`${rel}: JPEG extension does not match file signature`)
  if (ext === '.webp' && !isWebp) errors.push(`${rel}: .webp extension does not match file signature`)
  if (ext === '.svg') {
    if (!isSvg) errors.push(`${rel}: invalid SVG root`)
    if (!/<title(?:\s|>)/.test(text) || !/<desc(?:\s|>)/.test(text)) errors.push(`${rel}: SVG requires title and desc`)
    if (!/<svg[^>]+viewBox="[^"]+"/.test(text)) errors.push(`${rel}: SVG requires viewBox`)
  }
}

for (const image of referencedImages) {
  if (!assetFiles.includes(image)) errors.push(`${relative(root, image)}: referenced image is outside documented asset directories`)
}

if (errors.length) {
  console.error(`Documentation validation failed with ${errors.length} issue(s):`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(`Documentation validation passed: ${markdownFiles.length} Markdown files, ${assetFiles.length} visual assets, ${zhDocs.length} bilingual document pairs.`)
