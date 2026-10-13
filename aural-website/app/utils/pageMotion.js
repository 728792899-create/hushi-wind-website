// MatchMedia owns only this page's tweens and ScrollTriggers, including live preference changes.
export function createPageMotion(gsap, root, animate) {
  if (!root) return null
  const media = gsap.matchMedia(root)
  media.add('(prefers-reduced-motion: no-preference)', animate)
  return media
}
