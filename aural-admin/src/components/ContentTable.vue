<template>
  <div class="content-table-wrap">
    <div class="mobile-admin-list content-mobile-list">
      <article v-for="row in rows" :key="row.id" class="mobile-admin-card content-mobile-card">
        <div class="mobile-list-body content-mobile-body">
          <div class="mobile-list-tags">
            <el-tag size="small" :type="publishStatusMeta(row.status).type" effect="dark">
              {{ publishStatusMeta(row.status).label }}
            </el-tag>
            <el-tag v-if="row.category" size="small" effect="dark">{{ row.category }}</el-tag>
          </div>
          <strong :title="getRowTitle(row)">{{ getRowTitle(row) }}</strong>
          <small v-if="getRowSubtitle(row)">{{ getRowSubtitle(row) }}</small>
          <p v-if="getRowSummary(row)">{{ getRowSummary(row) }}</p>
          <div v-if="getRowMeta(row).length" class="mobile-list-meta">
            <span v-for="item in getRowMeta(row)" :key="item">{{ item }}</span>
          </div>
          <div class="mobile-list-actions">
            <el-button :icon="View" size="small" color="#111" class="dark-btn" @click="$emit('preview', row)">预览</el-button>
            <el-button :icon="Edit" size="small" color="#222" class="dark-btn" @click="$emit('edit', row)">编辑</el-button>
            <el-button :icon="Clock" size="small" @click="$emit('version', row, endpoint)">版本</el-button>
            <el-button :icon="Delete" size="small" type="danger" @click="$emit('delete', row.id, endpoint)">删除</el-button>
          </div>
        </div>
      </article>
      <div v-if="!rows.length && !loading" class="empty-panel compact-empty">{{ emptyText }}</div>
    </div>

    <el-table
      :data="rows"
      border
      class="wide-table mobile-hidden-table"
      v-loading="loading"
      :empty-text="emptyText"
    >
      <slot />
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="publishStatusMeta(row.status).type" effect="dark">{{ publishStatusMeta(row.status).label }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="sortOrder" label="排序" width="80" align="center" />
      <el-table-column label="操作" width="210" align="center">
        <template #default="{ row }">
          <div class="row-action-group">
            <el-button :icon="View" size="small" title="预览前台页面" aria-label="预览前台页面" color="#111" class="dark-btn" @click="$emit('preview', row)">预览</el-button>
            <el-button :icon="Edit" size="small" title="编辑内容" aria-label="编辑内容" color="#222" class="dark-btn" @click="$emit('edit', row)">编辑</el-button>
            <el-dropdown trigger="click">
              <el-button size="small" title="更多内容操作" aria-label="更多内容操作">更多</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="$emit('version', row, endpoint)">查看版本历史</el-dropdown-item>
                  <el-dropdown-item class="danger-dropdown-item" @click="$emit('delete', row.id, endpoint)">删除内容</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { Clock, Delete, Edit, View } from '@element-plus/icons-vue'
import { publishStatusMeta } from '../lib/meta'

defineProps({
  rows: { type: Array, default: () => [] },
  endpoint: { type: String, required: true },
  loading: { type: Boolean, default: false },
  emptyText: { type: String, default: '暂无内容' }
})

defineEmits(['edit', 'delete', 'preview', 'version'])

const getRowTitle = (row) => row.title || row.question || row.name || row.label || row.slug || row.year || row.icon || '未命名内容'
const getRowSubtitle = (row) => row.category || row.type || row.en || row.link || row.duration || row.fileUrl || ''
const getRowSummary = (row) => row.answer || row.desc || row.content || row.message || ''
const getRowMeta = (row) => {
  const meta = []
  if (row.type) meta.push(row.type)
  if (row.duration) meta.push(row.duration)
  if (row.size) meta.push(row.size)
  if (row.link) meta.push(row.link)
  if (row.sortOrder !== undefined && row.sortOrder !== null) meta.push(`排序 ${row.sortOrder}`)
  return meta
}
</script>
