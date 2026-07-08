import { onBeforeUnmount, onMounted, watch } from 'vue'

const readSource = (source) => {
  if (typeof source === 'function') return Boolean(source())
  if (source && typeof source === 'object' && 'value' in source) return Boolean(source.value)
  return Boolean(source)
}

const writeClosed = (source) => {
  if (source && typeof source === 'object' && 'value' in source) source.value = false
}

const cleanState = (state, marker) => {
  if (!state || state.hushiOverlay !== marker) return state
  const nextState = { ...state }
  delete nextState.hushiOverlay
  return nextState
}

export const useOverlayHistory = (key, source, closeHandler = null) => {
  const marker = `hushi-overlay:${String(key || 'overlay')}`
  let isInternalPop = false

  const closeSource = () => {
    if (typeof closeHandler === 'function') closeHandler()
    else writeClosed(source)
  }

  const currentStateHasMarker = () => process.client && window.history.state?.hushiOverlay === marker

  const clearCurrentMarker = () => {
    if (!process.client || !currentStateHasMarker()) return
    window.history.replaceState(cleanState(window.history.state, marker), '', window.location.href)
  }

  const pushMarker = () => {
    if (!process.client || currentStateHasMarker()) return
    window.history.pushState({ ...(window.history.state || {}), hushiOverlay: marker }, '', window.location.href)
  }

  const closeDirect = () => {
    clearCurrentMarker()
    closeSource()
  }

  const closeViaHistory = () => {
    if (process.client && currentStateHasMarker()) {
      isInternalPop = true
      window.history.back()
      return
    }
    closeDirect()
  }

  const handlePopState = () => {
    if (!readSource(source)) {
      isInternalPop = false
      return
    }
    closeSource()
    isInternalPop = false
  }

  watch(source, (active) => {
    if (!process.client) return
    if (active) {
      pushMarker()
      return
    }
    if (!isInternalPop) clearCurrentMarker()
  }, { immediate: true })

  onMounted(() => {
    window.addEventListener('popstate', handlePopState)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('popstate', handlePopState)
    if (readSource(source)) clearCurrentMarker()
  })

  return {
    closeDirect,
    closeViaHistory
  }
}
