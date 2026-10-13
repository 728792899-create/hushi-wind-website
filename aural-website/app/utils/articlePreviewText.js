// A text-only preview of article content. Keep the stored body unchanged; media
// captions and link labels are useful in a preview, their source URLs are not.
export function articlePreviewText(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g, (_match, alt, _url, caption) => caption || alt)
    .replace(/@\[(?:video|视频)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/gi, (_match, _url, caption) => caption || '')
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]+")?\)/g, '$1')
    .replace(/(?:https?:\/\/|\/uploads\/)[^\s<>"'，。！？；、（）)]+/gi, '')
    .split('\n')
    .map(line => line.trim().replace(/^#{1,6}\s+/, '').replace(/^(?:>\s*)+/, ''))
    .join(' ')
    .replace(/\*\*(\S(?:[^*]*\S)?)\*\*/g, '$1')
    .replace(/\*(\S(?:[^*]*\S)?)\*/g, '$1')
    .replace(/(^|[\s，。！？；、（(])__([^_\n]+)__(?=$|[\s，。！？；、）).])/g, '$1$2')
    .replace(/(^|[\s，。！？；、（(])_([^_\n]+)_(?=$|[\s，。！？；、）).])/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}
