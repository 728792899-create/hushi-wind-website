import { articlePreviewText } from './articlePreviewText.js'
export const STARTER_HERO = '/launch-assets/music-studio.jpg'
export const STARTER_ARTICLE_IMAGE = '/launch-assets/clarinet.svg'
export const STARTER_TITLE = '让呼吸，成为音乐。'
export const STARTER_INTRO = '从认识乐器开始，探索管乐的声音、结构与日常照护。'
export function starterArticle(row) {
  const attrs = row?.attributes || row
  if (!attrs || !['published', 'active'].includes(attrs.status) || !Number.isSafeInteger(Number(row.id || attrs.id)) || Number(row.id || attrs.id) < 1) return null
  return { ...attrs, id: Number(row.id || attrs.id), title: String(attrs.title || '管乐知识'),
    summary: articlePreviewText(attrs.seoDescription || attrs.description).slice(0, 150),
    blocks: String(attrs.description || '').replace(/\r/g, '').split(/\n\s*\n/).map(text => {
      const heading = text.trim().match(/^#{1,6}\s+([^\n]+)$/)
      return { type: heading ? 'heading' : 'paragraph', text: heading ? heading[1] : articlePreviewText(text) }
    }).filter(block => block.text) }
}
// Local illustrations belong to this website. Uploaded CMS media belongs to the API.
export function starterImage(value, apiBase = '', fallback = STARTER_HERO) {
  if (typeof value !== 'string' || /[\u0000-\u0020\u007f\\]/.test(value)) return fallback
  if (value === STARTER_HERO) return value
  if (/^\/launch-assets\/(wind-ensemble|trumpet|clarinet|saxophone)\.svg$/.test(value)) return value
  if (/^\/uploads\/[\w./%-]+$/.test(value) && !value.includes('..')) return `${apiBase.replace(/\/$/, '')}${value}`
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : fallback } catch { return fallback }
}

export function publicStarterArticles(payload) {
  return { ...payload, data: (payload?.data || []).filter(row => starterArticle(row)) }
}
