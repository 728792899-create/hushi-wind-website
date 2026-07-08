const FORM_GUARD_MIN_ELAPSED_MS = 1800
const FORM_GUARD_COOLDOWN_MS = 12000

export const useFormGuard = (key = 'default-form') => {
  const startedAt = ref(Date.now())
  const honeypot = ref('')
  const lastSubmitAt = useState(`form-guard:last:${key}`, () => 0)

  const resetGuard = () => {
    startedAt.value = Date.now()
    honeypot.value = ''
  }

  const getGuardPayload = () => ({
    website: honeypot.value,
    formStartedAt: startedAt.value
  })

  const canSubmit = () => {
    const now = Date.now()
    if (honeypot.value) return { ok: false, message: '提交校验未通过，请刷新页面后重试。' }
    if (now - startedAt.value < FORM_GUARD_MIN_ELAPSED_MS) return { ok: false, message: '提交过快，请确认信息后再提交。' }
    if (now - lastSubmitAt.value < FORM_GUARD_COOLDOWN_MS) return { ok: false, message: '提交过于频繁，请稍后再试。' }
    lastSubmitAt.value = now
    return { ok: true }
  }

  return {
    honeypot,
    resetGuard,
    getGuardPayload,
    canSubmit
  }
}
