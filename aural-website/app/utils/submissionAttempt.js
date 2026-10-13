// Keep uncertain retries tied to their original request, even after a dialog is reopened.
export function createSubmissionAttempt(getGuardPayload) {
  const pending = new Map()
  let usedInitialId = false
  const keyFor = identity => JSON.stringify(identity)
  return {
    getPayload(identity) {
      const guard = getGuardPayload(), key = keyFor(identity)
      if (!pending.has(key)) {
        pending.set(key, usedInitialId ? crypto.randomUUID() : guard.submissionId)
        usedInitialId = true
      }
      return { ...guard, submissionId: pending.get(key) }
    },
    complete(identity) { pending.delete(keyFor(identity)) }
  }
}
