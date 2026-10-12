<template>
  <el-button
    :disabled="disabled"
    @click="() => {
      openPicker()
    }"
    >从素材库选择</el-button
  ><el-dialog
    v-model="open"
    title="选择现有图片"
    width="760px"
    append-to-body
    :close-on-click-modal="false"
    @closed="invalidate"
    ><div class="filter-row">
      <el-select v-model="category" aria-label="选择图片用途分类" @change="search"><el-option label="全部分类" value="all"/><el-option v-for="item in mediaCategories" :key="item.value" :label="item.label" :value="item.value"/></el-select>
      <el-input
        v-model="keyword"
        placeholder="搜索图片名称"
        clearable
        @keyup.enter="() => {
          page = 1
          load()
        }"
        @clear="() => {
          page = 1
          load()
        }"
      /><el-button
        @click="() => {
          page = 1
          load()
        }"
        >搜索</el-button
      >
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <div class="media-picker-grid" v-loading="loading">
      <button
        v-for="item in rows"
        :key="item.url"
        type="button"
        @click="choose(item)"
      >
        <img
          :src="mediaSrc(item.url)"
          :alt="item.altText || item.name"
          loading="lazy"
        /><span>{{ item.name }}</span>
      </button>
    </div>
    <p v-if="!rows.length && !loading" class="field-hint">
      没有匹配的图片，可先上传素材。
    </p>
    <el-pagination
      v-model:current-page="page"
      :page-size="12"
      :total="total"
      layout="prev, pager, next"
      @current-change="load"
  /></el-dialog>
</template>
<script setup>
import { ref, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { mediaCategories } from '../lib/mediaCategories'
import { api, mediaSrc, extractErrorMessage } from '../lib/api'
defineProps({ disabled: Boolean })
const route = useRoute()
const category = ref('all')
function openPicker(){ category.value = ({'/products':'product','/articles':'news','/artists':'artist','/config':'brand','/cms':'support'})[route.path] || 'all'; page.value=1;keyword.value='';open.value=true;load() }
function search(){page.value=1;load()}
function invalidate(){requestId++;loading.value=false}
const emit = defineEmits(['select'])
const open = ref(false),
  loading = ref(false),
  error = ref(''),
  keyword = ref(''),
  rows = ref([]),
  page = ref(1),
  total = ref(0)
let requestId = 0
onBeforeUnmount(() => requestId++)
async function load() {
  const id = ++requestId
  loading.value = true
  error.value = ''
  try {
    const r = await api.get('/api/admin/resources', {
      params: {
        kind: 'image',
        category: category.value,
        search: keyword.value,
        page: page.value,
        pageSize: 12,
      },
    })
    if (id !== requestId) return
    rows.value = r.data.uploads
    total.value = r.data.meta.pagination.total
  } catch (e) {
    if (id === requestId) error.value = extractErrorMessage(e)
  } finally {
    if (id === requestId) loading.value = false
  }
}
function choose(row) {
  emit('select', row)
  open.value = false
}
</script>
<style scoped>
.media-picker-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 18px 0;
}
.media-picker-grid button {
  border: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  text-align: left;
}
.media-picker-grid img {
  display: block;
  width: 100%;
  height: 125px;
  object-fit: contain;
}
.media-picker-grid span {
  display: block;
  padding: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.media-picker-grid button:hover,
.media-picker-grid button:focus-visible {
  border-color: var(--el-color-primary);
  outline: 2px solid var(--el-color-primary-light-7);
}
@media (max-width: 600px) {
  .media-picker-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
