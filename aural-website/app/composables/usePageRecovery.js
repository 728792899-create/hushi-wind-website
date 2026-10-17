import { computed, onMounted, onScopeDispose, ref, watch } from 'vue'
import { createRequestRecovery } from '../utils/requestRecovery.js'

export const usePageRecovery = (requests) => {
  const retrying = ref(false)
  const failed = usePageConnection(requests.map(request => request.error))
  const pending = computed(() => retrying.value || requests.some(request => request.pending?.value))
  const controllers = []
  let mounted = false
  let disposed = false
  const sync = () => { if (mounted && !disposed) controllers.forEach(controller => controller.sync()) }
  if (process.client) {
    for (const request of requests) controllers.push(createRequestRecovery({
      getError: () => request.error.value,
      isPending: () => Boolean(request.pending?.value),
      refresh: request.refresh,
      enabled: () => mounted && !disposed && document.visibilityState !== 'hidden' && navigator.onLine !== false
    }))
    watch(() => requests.map(request => [request.error.value, request.pending?.value]), sync)
    onMounted(() => {
      mounted = true
      window.addEventListener('online', sync)
      document.addEventListener('visibilitychange', sync)
      sync()
    })
  }
  onScopeDispose(() => {
    disposed = true
    controllers.forEach(controller => controller.stop())
    if (process.client) {
      window.removeEventListener('online', sync)
      document.removeEventListener('visibilitychange', sync)
    }
  })
  const retry = async () => {
    if (pending.value || disposed) return
    retrying.value = true
    try { await Promise.all(controllers.map((controller, index) => requests[index].error.value ? controller.retry() : undefined)) }
    finally { retrying.value = false }
  }
  return { failed, pending, retry }
}
