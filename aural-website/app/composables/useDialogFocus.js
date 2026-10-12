import { watch, nextTick, onBeforeUnmount } from 'vue'
import { activateDialog } from '../utils/dialogFocus'

export function useDialogFocus(open, dialog, close) {
  let release, generation = 0
  const stop = watch(open, async shown => {
    const current = ++generation
    release?.()
    release = undefined
    if (!shown || !import.meta.client) return
    await nextTick()
    if (current === generation && dialog.value) release = activateDialog(dialog.value, close)
  }, { flush: 'post' })
  onBeforeUnmount(() => { generation++; stop(); release?.() })
}
