import { computed, inject, onBeforeUnmount, provide, ref } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

const uploadKey = Symbol('editorUploads')
const pendingChecks = new Set()

export function createUploadTracker() {
  const files = new Set()
  let active = true
  return {
    begin(file) {
      if (!active) return false
      files.add(file.uid)
      return true
    },
    finish(file) {
      const current = active && files.has(file?.uid)
      files.delete(file?.uid)
      return current
    },
    dispose() {
      active = false
      files.clear()
    },
    get size() {
      return files.size
    },
  }
}

export function useEditorUploads() {
  const tracker = createUploadTracker()
  const pending = ref(0)
  const scope = {
    pending,
    begin(file) {
      const accepted = tracker.begin(file)
      pending.value = tracker.size
      return accepted
    },
    complete(file, action) {
      const current = tracker.finish(file)
      pending.value = tracker.size
      if (current) action?.()
    },
  }
  provide(uploadKey, scope)
  onBeforeUnmount(() => {
    tracker.dispose()
    pending.value = 0
  })
  return scope
}

export const useParentUploads = () => inject(uploadKey, null)

export function useUnsavedChanges({ dirty, busy = () => false }) {
  let confirmation
  async function confirmLeave() {
    if (busy()) {
      ElMessage.info('正在保存或上传，请完成后再离开。')
      return false
    }
    if (!dirty()) return true
    if (!confirmation) {
      confirmation = ElMessageBox.confirm(
        '当前修改尚未保存，离开后将丢失。',
        '未保存修改',
        {
          confirmButtonText: '放弃修改',
          cancelButtonText: '继续编辑',
          type: 'warning',
        },
      )
        .then(
          () => true,
          () => false,
        )
        .finally(() => {
          confirmation = null
        })
    }
    return confirmation
  }
  const beforeUnload = (event) => {
    if (!dirty() && !busy()) return
    event.preventDefault()
    event.returnValue = ''
  }
  pendingChecks.add(confirmLeave)
  window.addEventListener('beforeunload', beforeUnload)
  onBeforeRouteLeave(confirmLeave)
  onBeforeRouteUpdate(confirmLeave)
  onBeforeUnmount(() => {
    pendingChecks.delete(confirmLeave)
    window.removeEventListener('beforeunload', beforeUnload)
  })
  return { confirmLeave, isDirty: computed(dirty) }
}

export async function confirmPendingWork() {
  for (const check of pendingChecks) if (!(await check())) return false
  return true
}
