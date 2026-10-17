import { computed, onScopeDispose, watch } from 'vue'

// An outgoing page can finish after the next page starts. Only the current
// owner may update or clear the shared badge.
export const usePageConnection = (errors) => {
  const offline = useState('global-offline', () => false)
  const owner = useState('connection-page-owner', () => 0)
  const id = owner.value + 1
  owner.value = id
  const failed = computed(() => errors.some(error => Boolean(error.value)))
  watch(failed, value => { if (owner.value === id) offline.value = value }, { immediate: true })
  onScopeDispose(() => { if (owner.value === id) { offline.value = false; owner.value++ } })
  return failed
}
