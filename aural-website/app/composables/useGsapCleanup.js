export const useGsapCleanup = (ctx, ScrollTrigger = null) => {
  if (ctx?.revert) ctx.revert()
  if (ScrollTrigger?.getAll) {
    ScrollTrigger.getAll().forEach((trigger) => trigger.kill())
  }
}
