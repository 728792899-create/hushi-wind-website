<template>
  <div>
    <section class="business-command-panel artists-command-panel">
      <div class="business-command-main">
        <span class="business-kicker">艺术家内容运营</span>
        <h2>先保证艺术家资料可信、可展示、可排序</h2>
        <p>这里维护前台艺术家页面。新增或编辑前先检查照片、头衔、简介、使用设备和排序，避免前台出现空头像、空简介或展示顺序混乱。</p>
        <div class="business-command-actions">
          <el-button color="#222" class="dark-btn" @click="openPreview('/artists')">预览艺术家页</el-button>
          <el-button type="primary" color="#fff" class="light-btn" @click="openAddArtist">新增艺术家</el-button>
        </div>
      </div>
      <div class="business-task-grid">
        <article v-for="item in artistOpsCards" :key="item.label" class="business-task-card" :class="item.tone">
          <span>{{ item.label }}</span>
          <strong>{{ item.value }}</strong>
          <small>{{ item.desc }}</small>
        </article>
      </div>
    </section>

    <div class="table-tools enterprise-table-tools">
      <span class="muted-text">艺术家页面内容由此处直接同步到前台展示；建议新增后立即预览前台艺术家页。</span>
    </div>

    <section v-if="artistQualityIssues.length" class="data-quality-panel artist-quality-panel">
      <div class="data-quality-heading">
        <span class="business-kicker">发布前数据体检</span>
        <h3>发现 {{ artistQualityIssues.length }} 条艺术家资料需要复核</h3>
        <p>这些提示只做运营提醒，不会自动修改数据库；建议先编辑完善，再打开前台艺术家页确认展示效果。</p>
      </div>
      <div class="data-quality-list">
        <article v-for="item in artistQualityIssues" :key="item.key" class="data-quality-card" :class="item.tone">
          <div>
            <strong>{{ item.name }}</strong>
            <small>{{ item.path }}</small>
          </div>
          <p>{{ item.reason }}</p>
          <el-button size="small" color="#222" class="dark-btn" @click="openEditArtist(item.row)">去完善</el-button>
        </article>
      </div>
    </section>

    <el-alert v-if="artistError" :title="artistError" description="请检查网络或后台 API 状态后重试。" type="error" show-icon :closable="false" class="mb-16" />

    <div class="mobile-admin-list artist-mobile-list" v-loading="artistsLoading">
      <article v-for="row in artists" :key="row.id" class="mobile-admin-card artist-mobile-card">
        <div class="mobile-list-media portrait">
          <el-image
            v-if="row.attributes.image || row.attributes.imageUrl"
            :src="mediaSrc(row.attributes.image?.data?.attributes?.url || row.attributes.imageUrl)"
            fit="cover"
          />
          <span v-else>无图</span>
        </div>
        <div class="mobile-list-body">
          <strong>{{ row.attributes.name }}</strong>
          <small>{{ row.attributes.role || '未设置头衔' }}</small>
          <p>{{ row.attributes.bio || '暂无简介' }}</p>
          <div class="mobile-list-meta">
            <span>{{ row.attributes.equipment || '未设置设备' }}</span>
            <span>排序 {{ row.attributes.sortOrder || 0 }}</span>
          </div>
          <div class="mobile-list-actions">
            <el-button :icon="DocumentCopy" size="small" @click="openPreview('/artists')" color="#111" class="dark-btn">预览</el-button>
            <el-button :icon="Edit" size="small" @click="openEditArtist(row)" color="#222" class="dark-btn">编辑</el-button>
            <el-button :icon="Delete" size="small" type="danger" @click="handleDelete(row.id)">删除</el-button>
          </div>
        </div>
      </article>
      <div v-if="!artistsLoading && !artists.length" class="empty-panel compact-empty">暂无艺术家内容</div>
    </div>

    <el-table :data="artists" border class="wide-table mobile-hidden-table" v-loading="artistsLoading" empty-text="暂无艺术家内容">
      <el-table-column label="照片" width="80" align="center">
        <template #default="{ row }"><el-image :src="mediaSrc(row.attributes.image?.data?.attributes?.url)" v-if="row.attributes.image" class="t-img" /></template>
      </el-table-column>
      <el-table-column prop="attributes.name" label="艺术家姓名" width="150" />
      <el-table-column prop="attributes.role" label="头衔 / 乐器" width="150" />
      <el-table-column prop="attributes.bio" label="个人简介" min-width="260" show-overflow-tooltip />
      <el-table-column prop="attributes.equipment" label="使用设备" width="180" show-overflow-tooltip />
      <el-table-column prop="attributes.sortOrder" label="排序" width="70" align="center" />
      <el-table-column label="管理" width="180" align="center">
        <template #default="{ row }">
          <el-button-group>
            <el-button :icon="DocumentCopy" size="small" @click="openPreview('/artists')" color="#111" class="dark-btn" />
            <el-button :icon="Edit" size="small" @click="openEditArtist(row)" color="#222" class="dark-btn" />
            <el-button :icon="Delete" size="small" type="danger" @click="handleDelete(row.id)" />
          </el-button-group>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="artistDiag" :title="isEdit ? '编辑艺术家' : '新增艺术家'" width="620px" class="dark-dialog" append-to-body destroy-on-close>
      <el-form ref="artistFormRef" :model="artistForm" :rules="rules" label-width="90px">
        <el-form-item label="精美大图"><image-upload v-model="artistForm.imageUrl" width="150px" height="200px" /></el-form-item>
        <el-row :gutter="20">
          <el-col :span="12"><el-form-item label="姓名/艺名" prop="name"><el-input v-model="artistForm.name" /></el-form-item></el-col>
          <el-col :span="12"><el-form-item label="头衔/乐器" prop="role"><el-input v-model="artistForm.role" /></el-form-item></el-col>
        </el-row>
        <el-form-item label="个人简介"><el-input v-model="artistForm.bio" type="textarea" :rows="4" maxlength="500" show-word-limit placeholder="输入艺术家的音乐经历、代表作品、合作案例等。" /></el-form-item>
        <el-form-item label="使用设备"><el-input v-model="artistForm.equipment" placeholder="例如：胡氏管乐定制单簧管 / 萨克斯" /></el-form-item>
        <el-form-item label="排序权重"><el-input-number v-model="artistForm.sortOrder" :min="0" class="full" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="artistDiag = false">取消</el-button>
        <el-button color="#222" class="dark-btn" @click="openPreview('/artists')">前台预览</el-button>
        <el-button type="primary" @click="submitArtist">确认保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, DocumentCopy, Edit } from '@element-plus/icons-vue'
import ImageUpload from '../components/ImageUpload.vue'
import { api, extractErrorMessage, listData, mediaSrc, openPreview } from '../lib/api'

const artists = ref([])
const artistsLoading = ref(false)
const artistError = ref('')
const artistDiag = ref(false)
const isEdit = ref(false)
const curId = ref(null)
const artistFormRef = ref(null)
const artistForm = reactive({ name: '', role: '', imageUrl: '', bio: '', equipment: '', sortOrder: 0 })

const artistRows = computed(() => artists.value.map((row) => row.attributes || {}))
const artistsWithPhoto = computed(() => artistRows.value.filter((row) => row.imageUrl || row.image?.data?.attributes?.url).length)
const artistsWithBio = computed(() => artistRows.value.filter((row) => String(row.bio || '').trim().length >= 20).length)
const suspiciousArtistWords = ['测试', 'test', 'demo', '样例', '占位', '王氏', '张三', '李四', '111111']
const getArtistImageUrl = (attrs) => attrs.imageUrl || attrs.image?.data?.attributes?.url || ''
const hasSuspiciousArtistText = (attrs) => {
  const text = [attrs.name, attrs.role, attrs.bio, attrs.equipment, getArtistImageUrl(attrs)].filter(Boolean).join(' ').toLowerCase()
  return suspiciousArtistWords.some((word) => text.includes(word.toLowerCase()))
}
const artistQualityReason = (attrs) => {
  const missing = []
  const imageUrl = getArtistImageUrl(attrs)
  if (!attrs.name) missing.push('姓名')
  if (!attrs.role) missing.push('头衔/乐器')
  if (!imageUrl) missing.push('展示照片')
  if (String(attrs.bio || '').trim().length < 20) missing.push('不少于 20 字的个人简介')
  if (missing.length) return `资料不完整：缺少${missing.join('、')}。`
  if (hasSuspiciousArtistText(attrs)) return '疑似测试或占位数据：姓名、简介、设备或图片路径包含测试特征，可能已经展示到官网。'
  if (/\/uploads\/\d+-/.test(imageUrl) && !String(attrs.bio || '').includes('胡氏管乐')) return '图片为临时上传路径，且简介缺少品牌/合作背景，建议复核是否为正式公开素材。'
  return ''
}
const artistQualityIssues = computed(() => artists.value.map((row) => {
  const attrs = row.attributes || {}
  const reason = artistQualityReason(attrs)
  return reason ? {
    key: row.id,
    row,
    name: attrs.name || '未命名艺术家',
    path: getArtistImageUrl(attrs) || '未设置图片',
    reason,
    tone: hasSuspiciousArtistText(attrs) ? 'danger' : 'warning'
  } : null
}).filter(Boolean))
const artistOpsCards = computed(() => [
  { label: '艺术家总数', value: artists.value.length, desc: '前台艺术家页展示内容', tone: 'primary' },
  { label: '照片完整', value: `${artistsWithPhoto.value}/${artists.value.length}`, desc: '避免前台空头像', tone: artistsWithPhoto.value === artists.value.length ? 'success' : 'warning' },
  { label: '简介合格', value: `${artistsWithBio.value}/${artists.value.length}`, desc: '建议不少于 20 字', tone: artistsWithBio.value === artists.value.length ? 'success' : 'warning' },
  { label: '待复核', value: artistQualityIssues.value.length, desc: '测试数据或资料缺口', tone: artistQualityIssues.value.length ? 'warning' : 'success' }
])

const rules = {
  name: [{ required: true, message: '请输入姓名或艺名', trigger: 'blur' }],
  role: [{ required: true, message: '请输入头衔或乐器', trigger: 'blur' }]
}

const fetchArtists = async () => {
  artistsLoading.value = true
  artistError.value = ''
  try {
    const res = await api.get('/api/artists', { params: { admin: 1 } })
    artists.value = listData(res)
  } catch (error) {
    artistError.value = extractErrorMessage(error, '艺术家列表加载失败')
    artists.value = []
  } finally {
    artistsLoading.value = false
  }
}

const openAddArtist = () => {
  isEdit.value = false
  curId.value = null
  Object.assign(artistForm, { name: '', role: '', bio: '', equipment: '', imageUrl: '', sortOrder: 0 })
  artistDiag.value = true
}

const openEditArtist = (row) => {
  isEdit.value = true
  curId.value = row.id
  Object.assign(artistForm, {
    name: row.attributes.name,
    role: row.attributes.role,
    bio: row.attributes.bio || '',
    equipment: row.attributes.equipment || '',
    sortOrder: row.attributes.sortOrder || 0,
    imageUrl: row.attributes.image?.data?.attributes?.url || ''
  })
  artistDiag.value = true
}

const submitArtist = async () => {
  try {
    await artistFormRef.value?.validate()
    await api[isEdit.value ? 'put' : 'post'](isEdit.value ? `/api/artists/${curId.value}` : '/api/artists', artistForm)
    artistDiag.value = false
    ElMessage.success('艺术家内容已保存')
    fetchArtists()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(extractErrorMessage(error, '请检查艺术家表单'))
  }
}

const handleDelete = async (id) => {
  try {
    await ElMessageBox.confirm('确定删除该艺术家？', '敏感操作确认', { type: 'warning' })
    await api.delete(`/api/artists/${id}`)
    ElMessage.success('已删除')
    fetchArtists()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(extractErrorMessage(error, '艺术家删除失败'))
  }
}

const handlePageAction = (event) => {
  if (event.detail === 'artist:add') openAddArtist()
}

onMounted(() => {
  window.addEventListener('admin-page-action', handlePageAction)
  fetchArtists()
})

onBeforeUnmount(() => window.removeEventListener('admin-page-action', handlePageAction))
</script>
