<template>
  <el-button
    v-if="can('products:write')"
    @click="() => {
      open = true
      load()
    }"
    >分类与系列</el-button
  >
  <el-dialog
    v-model="open"
    title="产品分类与系列"
    width="780px"
    :close-on-click-modal="false"
    :before-close="close"
  >
    <p class="field-hint">按乐器品类建立参数模板；在产品编辑中直接选用。</p>
    <el-radio-group
      :key="selectionVersion"
      ref="kindControl"
      :model-value="kind"
      :disabled="saving || switching"
      aria-label="目录类型"
      @update:model-value="changeKind"
      ><el-radio-button value="categories">乐器分类</el-radio-button
      ><el-radio-button value="series"
        >产品系列</el-radio-button
      ></el-radio-group
    >
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <el-table
      :data="kind === 'categories' ? catalog.categories : catalog.series"
      v-loading="loading"
      max-height="300"
    >
      <el-table-column prop="name" label="名称" /><el-table-column
        :prop="kind === 'categories' ? 'slug' : 'categorySlug'"
        label="分类标识"
      />
      <el-table-column
        prop="sortOrder"
        label="排序"
        width="75"
      /><el-table-column label="操作" width="140"
        ><template #default="{ row }"
          ><el-button text @click="edit(row)">编辑</el-button
          ><el-button
            text
            type="danger"
            :disabled="!row.id || saving"
            @click="remove(row)"
            >删除</el-button
          ></template
        ></el-table-column
      >
    </el-table>
    <el-divider>{{ form.id ? '编辑记录' : '新增记录' }}</el-divider>
    <el-form label-position="top" :disabled="saving">
      <div class="form-two-columns">
        <el-form-item label="名称"
          ><el-input v-model="form.name" maxlength="80"
        /></el-form-item>
        <el-form-item v-if="kind === 'categories'" label="英文标识"
          ><el-input
            v-model="form.slug"
            :disabled="!!form.id"
            placeholder="例如 woodwind"
        /></el-form-item>
        <el-form-item v-else label="所属分类"
          ><el-select v-model="form.categorySlug"
            ><el-option
              v-for="row in catalog.categories"
              :key="row.slug"
              :value="row.slug"
              :label="row.name" /></el-select
        ></el-form-item>
      </div>
      <el-form-item
        v-if="kind === 'categories'"
        label="参数模板（每行一个参数名称）"
        ><el-input
          v-model="form.template"
          type="textarea"
          :rows="4"
          placeholder="调性&#10;管体材质&#10;按键系统"
      /></el-form-item>
      <el-form-item label="显示顺序"
        ><el-input-number v-model="form.sortOrder" :min="0"
      /></el-form-item>
      <el-button type="primary" :loading="saving" @click="save">保存</el-button
      ><el-button @click="reset">新建另一条</el-button>
    </el-form>
  </el-dialog>
</template>
<script setup>
import { nextTick, reactive, ref } from 'vue'
import { useUnsavedChanges } from '../lib/editorLifecycle'
import { ElMessage, ElMessageBox, ElRadioGroup, ElRadioButton } from 'element-plus'
import { api, hasPermission as can, extractErrorMessage } from '../lib/api'
const emit = defineEmits(['changed'])
const open = ref(false),
  kind = ref('categories'),
  loading = ref(false),
  saving = ref(false),
  switching = ref(false),
  selectionVersion = ref(0),
  kindControl = ref(null),
  error = ref('')
const catalog = reactive({ categories: [], series: [] }),
  form = reactive({}),
  originalForm = ref('')
const { confirmLeave } = useUnsavedChanges({
  dirty: () => open.value && JSON.stringify(form) !== originalForm.value,
  busy: () => saving.value,
})
async function close(done) {
  if (await confirmLeave()) done()
}
function reset() {
  Object.assign(form, {
    id: null,
    editDefault: false,
    name: '',
    slug: '',
    categorySlug: '',
    template: '',
    sortOrder: 0,
  })
  originalForm.value = JSON.stringify(form)
  error.value = ''
}
async function changeKind(next) {
  if (next === kind.value || saving.value || switching.value) return
  if (next !== 'categories' && next !== 'series') return
  switching.value = true
  try {
    if (!(await confirmLeave())) {
      // Native radio selection changes before the asynchronous discard dialog.
      // Remount on cancellation so checked state and keyboard focus follow kind.
      selectionVersion.value++
      return
    }
    kind.value = next
    reset()
  } finally {
    switching.value = false
    await nextTick()
    kindControl.value?.$el.querySelector('input:checked')?.focus()
  }
}
function edit(row) {
  reset()
  Object.assign(form, row, {
    template: JSON.parse(row.specTemplate || '[]').join('\n'),
    editDefault: !row.id,
  })
  originalForm.value = JSON.stringify(form)
}
async function load() {
  loading.value = true
  error.value = ''
  try {
    Object.assign(catalog, (await api.get('/api/catalog')).data)
  } catch (e) {
    error.value = extractErrorMessage(e)
  } finally {
    loading.value = false
  }
}
async function save() {
  if (saving.value) return
  saving.value = true
  try {
    await api.post(`/api/admin/catalog/${kind.value}`, {
      ...form,
      specTemplate: JSON.stringify(
        form.template
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    })
    reset()
    await load()
    emit('changed')
    ElMessage.success('目录已保存')
  } catch (e) {
    error.value = extractErrorMessage(e)
  } finally {
    saving.value = false
  }
}
async function remove(row) {
  try {
    await ElMessageBox.confirm(
      `删除“${row.name}”？使用中的分类或系列会保留。`,
      '删除目录',
    )
    await api.delete(`/api/admin/catalog/${kind.value}/${row.id}`)
    await load()
    emit('changed')
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') error.value = extractErrorMessage(e)
  }
}
reset()
</script>
