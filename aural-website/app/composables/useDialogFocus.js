import { nextTick, onBeforeUnmount, onMounted } from 'vue'

const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export const useDialogFocus = (containerRef) => {
  let previouslyFocused = null

  const focusables = () => Array.from(containerRef.value?.querySelectorAll(focusableSelector) || [])
    .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true')

  const handleKeydown = (event) => {
    if (event.key !== 'Tab') return
    const elements = focusables()
    if (!elements.length) return
    const first = elements[0]
    const last = elements[elements.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  onMounted(async () => {
    previouslyFocused = document.activeElement
    await nextTick()
    ;(containerRef.value?.querySelector('[data-autofocus]') || focusables()[0] || containerRef.value)?.focus()
  })

  onBeforeUnmount(() => previouslyFocused?.focus?.())
  return { handleKeydown }
}
