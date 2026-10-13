import { watch, nextTick, onBeforeUnmount, toValue } from 'vue'
import { activateDialog } from '../utils/dialogFocus'

export function useDialogFocus(open, dialog, close) {
  let release, generation = 0
  const stop = watch([() => toValue(open), dialog], async ([shown, element]) => {
    const current = ++generation
    release?.()
    release = undefined
    if (!shown || !element || !import.meta.client) return
    await nextTick()
    if (current === generation && dialog.value === element) release = activateDialog(element, close)
  }, { flush: 'post', immediate: true })
  onBeforeUnmount(() => { generation++; stop(); release?.() })
}
