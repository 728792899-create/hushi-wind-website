import { computed, onBeforeUnmount, watch } from 'vue'

const applyOverlayState = (locks, classMap) => {
  if (process.server) return

  const activeKeys = Object.keys(locks).filter((key) => locks[key])
  const hasOverlay = activeKeys.length > 0

  document.body.style.overflow = hasOverlay ? 'hidden' : ''
  document.body.classList.toggle('overlay-open', hasOverlay)
  document.documentElement.classList.toggle('overlay-open', hasOverlay)

  Object.entries(classMap).forEach(([key, className]) => {
    if (!className) return
    document.body.classList.toggle(className, Boolean(locks[key]))
  })
}

export const useOverlayLock = (key, source = null, options = {}) => {
  const lockKey = String(key || 'overlay')
  const locks = useState('hushi-overlay-locks', () => ({}))
  const lockClasses = useState('hushi-overlay-lock-classes', () => ({}))
  const className = options.className || ''

  if (className && lockClasses.value[lockKey] !== className) {
    lockClasses.value = { ...lockClasses.value, [lockKey]: className }
  }

  const setLocked = (value) => {
    if (process.server) return
    const nextLocks = { ...locks.value, [lockKey]: Boolean(value) }
    if (!nextLocks[lockKey]) delete nextLocks[lockKey]
    locks.value = nextLocks
    applyOverlayState(locks.value, lockClasses.value)
  }

  if (source) {
    watch(source, (value) => setLocked(value), { immediate: true })
  }

  onBeforeUnmount(() => setLocked(false))

  return {
    setLocked,
    isLocked: computed(() => Boolean(locks.value[lockKey])),
    hasAnyOverlay: computed(() => Object.values(locks.value).some(Boolean))
  }
}
