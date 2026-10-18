<template>
  <section class="panel media-panel">
    <nav class="media-categories" aria-label="素材用途分类">
      <button :class="{active:category==='all'}" :aria-pressed="category==='all'" @click="category='all'">全部素材 <span>{{ categoryTotal }}</span></button>
      <button v-for="item in categories" :key="item.value" :class="{active:category===item.value}" :aria-pressed="category===item.value" @click="category=item.value">{{ item.label }} <span>{{ item.count || 0 }}</span></button>
    </nav>
    <div class="table-tools">
      <div class="filter-row wrap">
        <el-input v-model="keyword" placeholder="搜索名称、产品或引用位置" clearable class="w-320" :prefix-icon="Search" />
        <el-select v-model="kind" class="w-140" aria-label="素材类型"><el-option label="全部类型" value="all"/><el-option label="图片" value="image"/><el-option label="视频" value="video"/><el-option label="文档" value="document"/></el-select>
        <el-select v-model="usage" class="w-140" aria-label="素材使用状态"><el-option label="全部状态" value="all"/><el-option label="已引用" value="used"/><el-option label="未引用" value="unused"/></el-select>
      </div>
      <div class="filter-row"><el-button :loading="loading" @click="load({force:true})">刷新</el-button><el-button v-if="can('resources:upload')" type="primary" :icon="Upload" @click="openUpload">上传素材</el-button></div>
    </div>
    <p class="field-hint">名称与分类可跟随引用自动更新；自定义名称会优先保留，文件链接不变。</p>
    <div v-if="can('resources:write') && uploads.length" class="media-batch-bar">
      <el-checkbox :model-value="allSelected" :indeterminate="selectedUrls.length>0 && !allSelected" :disabled="loading || busy" @change="toggleAll">选择本页</el-checkbox>
      <span role="status">已选 {{ selectedUrls.length }} 项</span>
      <el-select v-model="batchCategory" aria-label="批量移动到分类" placeholder="移动到分类" :disabled="!selectedUrls.length || busy" class="w-180"><el-option label="跟随引用自动分类" value="auto"/><el-option v-for="item in mediaCategories" :key="item.value" :label="item.label" :value="item.value"/></el-select>
      <el-button :disabled="!selectedUrls.length || !batchCategory || busy" :loading="batchSaving" @click="moveSelected">移动</el-button>
      <el-button v-if="selectedUrls.length" text :disabled="busy" @click="selectedUrls=[]">取消选择</el-button>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon/>
    <p v-if="loading && uploads.length" class="field-hint" role="status">正在更新素材列表…</p>
    <div class="media-grid" v-loading="loading && !uploads.length" :aria-busy="loading">
      <article v-for="row in uploads" :key="row.url" class="media-card" :class="{'media-card-selected':selectedUrls.includes(row.url)}">
        <el-checkbox v-if="can('resources:write')" class="media-select" :model-value="selectedUrls.includes(row.url)" :disabled="busy" @change="toggleSelection(row.url,$event)"><span class="visually-hidden">选择 {{ row.name }}</span></el-checkbox>
        <button class="media-image" :class="{ 'media-image-transparent': row.type === 'image' }" @click="preview=row" :aria-label="`预览素材 ${row.name}`"><img v-if="row.type==='image'" :src="mediaSrc(row.url)" :alt="row.altText || row.name" loading="lazy"/><el-icon v-else><Document/></el-icon></button>
        <div class="media-caption">
          <strong :title="row.name">{{ row.name }}</strong>
          <small class="media-category-label">{{ row.categoryLabel }}</small>
          <span>{{ row.size }}<el-tag size="small" :type="row.inUse?'success':'info'">{{ usageLabel(row) }}</el-tag></span>
          <div class="media-actions"><el-button text size="small" @click="openDetails(row)">{{ can('resources:write')?'管理':'详情' }}</el-button><el-dropdown trigger="click" @command="copy(row.url)"><el-button text size="small" :aria-label="`${row.name} 更多操作`">更多</el-button><template #dropdown><el-dropdown-menu><el-dropdown-item command="copy">复制地址</el-dropdown-item></el-dropdown-menu></template></el-dropdown></div>
        </div>
      </article>
    </div>
    <div v-if="!loading && !total" class="empty-panel"><el-icon :size="36"><Picture/></el-icon><h3>没有匹配的素材</h3><p>调整分类或筛选条件，或上传新的产品图片与资料。</p></div>
    <div class="table-pagination"><span>共 {{ total }} 个素材</span><el-pagination v-model:current-page="page" :page-size="24" :total="total" layout="prev, pager, next" :pager-count="5"/></div>

    <el-drawer :model-value="!!selected" @close="selected=null" :before-close="closeDetails" title="素材管理" size="520px">
      <template v-if="selected">
        <img v-if="selected.type==='image'" class="asset-detail-image" :src="mediaSrc(selected.url)" :alt="selected.altText || selected.name"/>
        <el-form label-position="top" :disabled="!can('resources:write') || busy">
          <el-form-item label="命名方式"><el-radio-group v-model="selected.nameMode"><el-radio-button value="auto">跟随引用</el-radio-button><el-radio-button value="manual">自定义名称</el-radio-button></el-radio-group></el-form-item>
          <el-form-item v-if="selected.nameMode==='manual'" label="素材名称"><el-input v-model="selected.name" maxlength="160"/></el-form-item>
          <p v-else class="media-auto-name">{{ selected.autoName }}<small>按当前引用位置生成，引用内容改名后同步更新。</small></p>
          <el-form-item label="用途分类"><el-select v-model="selected.categoryMode" aria-label="用途分类"><el-option label="跟随引用自动分类" value="auto"/><el-option v-for="item in mediaCategories" :key="item.value" :label="item.label" :value="item.value"/></el-select></el-form-item>
          <el-form-item label="替代文字"><el-input v-model="selected.altText" type="textarea" maxlength="500" placeholder="描述图片内容，便于编辑时辨认"/></el-form-item>
          <el-button v-if="can('resources:write')" type="primary" :loading="saving" @click="saveMetadata">保存设置</el-button>
        </el-form>
        <p class="field-hint">原文件：{{ selected.originalName }}</p><p class="field-hint">{{ selected.size }} · {{ selected.dimensions?.width || '—' }} × {{ selected.dimensions?.height || '—' }}</p>
        <h3>引用位置 <small>{{ selected.referenceCount }} 处</small></h3>
        <ul class="media-reference-list"><li v-for="(use,i) in selected.references.filter(r=>!r.archived)" :key="i">{{ use.title }}<small>{{ use.section }}</small></li></ul>
        <p v-if="!selected.referenceCount" class="field-hint">尚未被当前内容引用。</p>
        <details v-if="selected.retainedReferenceCount" class="media-retained"><summary>草稿、历史或回收站仍保留 {{ selected.retainedReferenceCount }} 处引用</summary><p v-for="(use,i) in selected.references.filter(r=>r.archived)" :key="i">{{ use.title }}</p></details>
        <details class="media-link-details"><summary>文件地址与原文件</summary><el-input :model-value="mediaSrc(selected.url)" readonly aria-label="素材地址"/><div class="filter-row mt-16"><el-button @click="copy(selected.url)">复制地址</el-button><a :href="mediaSrc(selected.url)" target="_blank" rel="noopener noreferrer">打开原文件 ↗</a></div></details>
        <div v-if="can('resources:write')" class="danger-zone"><p>已有引用（含历史与草稿）的文件不能删除。</p><el-button type="danger" plain :disabled="selected.inUse || busy" @click="remove">删除素材</el-button></div>
      </template>
    </el-drawer>
    <el-dialog :model-value="!!preview" @close="preview=null" title="素材预览" width="860px" append-to-body>
      <template v-if="preview"><img v-if="preview.type==='image'" class="media-full-preview" :src="mediaSrc(preview.url)" :alt="preview.altText || preview.name"/><video v-else-if="/\.(mp4|mov)$/i.test(preview.url)" :src="mediaSrc(preview.url)" controls class="media-full-preview"/><div v-else class="empty-panel"><el-icon :size="48"><Document/></el-icon><p>{{ preview.name }}</p><a :href="mediaSrc(preview.url)" target="_blank" rel="noopener noreferrer">打开文档 ↗</a></div><p>{{ preview.name }}</p></template>
    </el-dialog>
    <el-dialog v-model="uploadOpen" title="上传素材" width="520px" :before-close="closeUpload" :close-on-click-modal="false">
      <el-form label-position="top"><el-form-item label="上传到分类"><el-select v-model="uploadCategory" aria-label="上传到分类" :disabled="pending>0"><el-option label="跟随引用自动分类" value="auto"/><el-option v-for="item in mediaCategories" :key="item.value" :label="item.label" :value="item.value"/></el-select></el-form-item></el-form>
      <p class="field-hint">{{ uploadPolicyText }}</p>
      <el-upload ref="uploadRef" :http-request="uploadRequest" :action="`${BASE}/api/upload`" :data="{category:uploadCategory}" :headers="adminUploadHeaders()" :accept="UPLOAD_ACCEPT" multiple :show-file-list="true" :before-upload="beforeUpload" :on-success="uploadSuccess" :on-error="uploadError" :on-remove="removeUpload" :disabled="!can('resources:upload')"><el-button type="primary" :icon="Upload">选择文件上传</el-button></el-upload>
      <p v-if="pending" role="status">正在上传 {{ pending }} 个文件<el-button text @click="cancelUploads">取消待完成上传</el-button></p>
      <template #footer><el-button :disabled="pending>0" @click="uploadOpen=false">完成</el-button></template>
    </el-dialog>
  </section>
</template>
<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox, ElCheckbox, ElRadioGroup, ElRadioButton } from 'element-plus'
import { Search, Upload, Document, Picture } from '@element-plus/icons-vue'
import { BASE,api,readList,isQueryCancelled,adminUploadHeaders,mediaSrc,hasPermission as can,sensitiveConfirmation,extractErrorMessage } from '../lib/api'
import { useUnsavedChanges } from '../lib/editorLifecycle'
import { UPLOAD_ACCEPT,uploadPolicyText,validateUploadFile } from '../lib/uploadPolicy'
import { uploadRequest } from '../lib/uploadRequest'
import { mediaCategories } from '../lib/mediaCategories'
const uploads=ref([]),categories=ref(mediaCategories),category=ref('all'),keyword=ref(''),kind=ref('all'),usage=ref('all'),page=ref(1),total=ref(0),loading=ref(false),error=ref(''),selected=ref(null),preview=ref(null)
const saving=ref(false),deleting=ref(false),batchSaving=ref(false),selectedUrls=ref([]),batchCategory=ref(''),uploadOpen=ref(false),uploadCategory=ref('auto'),uploadRef=ref(null),pending=ref(0)
const busy=computed(()=>saving.value||deleting.value||batchSaving.value)
const categoryTotal=computed(()=>categories.value.reduce((sum,c)=>sum+(c.count||0),0))
const allSelected=computed(()=>uploads.value.length>0&&selectedUrls.value.length===uploads.value.length)
const usageLabel=row=>row.referenceCount ? `已引用 ${row.referenceCount} 处` : row.retainedReferenceCount ? '历史 / 草稿保留' : '未引用'
const metadataSnapshot=ref('')
const selectedMetadata=()=>JSON.stringify(selected.value && {nameMode:selected.value.nameMode,name:selected.value.nameMode==='manual'?selected.value.name:'',category:selected.value.categoryMode,altText:selected.value.altText||''})
const {confirmLeave}=useUnsavedChanges({dirty:()=>!!selected.value&&selectedMetadata()!==metadataSnapshot.value,busy:()=>busy.value||pending.value>0})
async function openDetails(row){if(!(await confirmLeave()))return;selected.value={...row};metadataSnapshot.value=selectedMetadata()}
async function closeDetails(done){if(await confirmLeave())done()}
function toggleSelection(url,checked){selectedUrls.value=checked?[...new Set([...selectedUrls.value,url])]:selectedUrls.value.filter(u=>u!==url)}
function toggleAll(checked){selectedUrls.value=checked?uploads.value.map(r=>r.url):[]}
let requestId=0,active=true,searchTimer,requestController,loadedQueryKey=''
watch([keyword,kind,usage,category],()=>{clearTimeout(searchTimer);requestId++;requestController?.abort();selectedUrls.value=[];if(page.value!==1)page.value=1;else searchTimer=setTimeout(load,200)})
watch(page,()=>{clearTimeout(searchTimer);selectedUrls.value=[];load()})
async function load({force=false}={}) {
  const id=++requestId, previous=requestController
  requestController=new AbortController()
  const params={compact:1,page:page.value,pageSize:24,search:keyword.value,kind:kind.value,usage:usage.value,category:category.value}
  const key=JSON.stringify(params)
  if(key!==loadedQueryKey) { uploads.value=[]; total.value=0 }
  loading.value=true;error.value=''
  const request=readList('/api/admin/resources',{params,signal:requestController.signal,force})
  previous?.abort()
  try {
    const r=await request
    if(id!==requestId)return
    uploads.value=r.data.uploads||[];loadedQueryKey=key
    categories.value=r.data.categories||mediaCategories
    total.value=r.data.meta.pagination.total
    selectedUrls.value=selectedUrls.value.filter(u=>uploads.value.some(r=>r.url===u))
    const last=Math.max(1,Math.ceil(total.value/24))
    if(page.value>last)page.value=last
    return uploads.value
  } catch(e) {
    if(id===requestId && !isQueryCancelled(e))error.value=extractErrorMessage(e,'素材加载失败')
  } finally {if(id===requestId)loading.value=false}
}
async function saveMetadata(){if(busy.value||!selected.value)return;const row={...selected.value};saving.value=true;try{await api.put('/api/admin/resources/metadata',{url:row.url,nameMode:row.nameMode,name:row.nameMode==='manual'?row.name:undefined,category:row.categoryMode,altText:row.altText||''});if(row.nameMode==='auto')selected.value.name=row.autoName;metadataSnapshot.value=selectedMetadata();ElMessage.success('素材设置已保存');await load()}catch(e){ElMessage.error(extractErrorMessage(e))}finally{saving.value=false}}
async function moveSelected(){if(busy.value||!selectedUrls.value.length||!batchCategory.value)return;const urls=[...selectedUrls.value],target=batchCategory.value;batchSaving.value=true;try{await api.put('/api/admin/resources/categories',{urls,category:target});selectedUrls.value=[];batchCategory.value='';await load();ElMessage.success(`已整理 ${urls.length} 个素材`)}catch(e){ElMessage.error(extractErrorMessage(e))}finally{batchSaving.value=false}}
async function copy(url){try{await navigator.clipboard.writeText(mediaSrc(url));ElMessage.success('已复制素材地址')}catch{ElMessage.error('复制失败，请在管理面板中手动复制地址')}}
async function remove(){const row=selected.value;if(!row||row.inUse||busy.value)return;deleting.value=true;try{await ElMessageBox.confirm(`永久删除「${row.name}」？文件无法恢复。`,'删除素材',{type:'warning',confirmButtonText:'删除',cancelButtonText:'取消'});await api.delete('/api/admin/resources',{data:{url:row.url,...sensitiveConfirmation()}});selected.value=null;ElMessage.success('素材已删除');await load()}catch(e){if(!['cancel','close'].includes(e))ElMessage.error(extractErrorMessage(e))}finally{deleting.value=false}}
const pendingFiles=new Set()
function openUpload(){uploadCategory.value=category.value==='all'?'auto':category.value;uploadOpen.value=true;uploadRef.value?.clearFiles()}
function beforeUpload(file){const result=validateUploadFile(file);if(!result.ok){ElMessage.warning(result.message);return false}pendingFiles.add(file.uid);pending.value=pendingFiles.size;return true}
function finishUpload(file){if(!active||!pendingFiles.delete(file?.uid))return false;pending.value=pendingFiles.size;return true}
function uploadSuccess(res,file){if(!finishUpload(file))return;res?.url?ElMessage.success('素材上传成功'):ElMessage.error('上传未返回地址');if(!pending.value)load()}
function uploadError(e,file){if(!finishUpload(file))return;ElMessage.error(extractErrorMessage(e,'上传失败'));if(!pending.value)load()}
function removeUpload(file){uploadRef.value?.abort(file);pendingFiles.delete(file.uid);pending.value=pendingFiles.size}
function cancelUploads(){uploadRef.value?.abort();pendingFiles.clear();pending.value=0;uploadRef.value?.clearFiles();load();ElMessage.info('已取消待完成上传；已完成的文件仍保留在素材库')}
function closeUpload(done){if(pending.value)return ElMessage.info('请等待上传完成，或先取消待完成上传');done()}
onMounted(load)
onBeforeUnmount(()=>{active=false;requestId++;requestController?.abort();clearTimeout(searchTimer);uploadRef.value?.abort()})
</script>
<style scoped>
.media-categories{display:flex;gap:8px;flex-wrap:wrap;padding-bottom:22px;margin-bottom:22px;border-bottom:1px solid var(--el-border-color-lighter)}
.media-categories button{border:1px solid transparent;background:transparent;color:var(--el-text-color-regular);padding:10px 14px;border-radius:7px;font:inherit;cursor:pointer}.media-categories button.active{background:var(--el-color-primary-light-9);color:var(--el-color-primary);border-color:var(--el-color-primary-light-7)}.media-categories button span{margin-left:7px;font-size:12px}.media-categories button:focus-visible{outline:2px solid var(--el-color-primary)}
.media-batch-bar{display:flex;align-items:center;flex-wrap:wrap;gap:14px;padding:12px 0 20px;color:var(--el-text-color-secondary);font-size:13px}.media-card{position:relative}.media-card-selected{outline:2px solid var(--el-color-primary)}.media-select{position:absolute;top:10px;left:10px;z-index:1;padding:0 7px;border-radius:5px;background:var(--el-bg-color)}.media-caption strong{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;min-height:44px;line-height:22px;overflow:hidden}.media-category-label{color:var(--el-text-color-secondary);font-size:12px}.media-auto-name{padding:14px;background:var(--el-fill-color-light);border-radius:6px}.media-auto-name small,.media-reference-list small{display:block;font-size:12px;color:var(--el-text-color-secondary);margin-top:6px}.media-reference-list{padding:0;list-style:none}.media-reference-list li{padding:12px 0;border-bottom:1px solid var(--el-border-color-lighter)}.media-link-details,.media-retained{margin:20px 0}.media-link-details summary,.media-retained summary{cursor:pointer;margin-bottom:12px;color:var(--el-text-color-secondary)}.media-full-preview{display:block;width:100%;max-height:65vh;object-fit:contain}.w-180{width:180px}
@media(max-width:600px){.media-categories{gap:4px}.media-categories button{padding:8px 9px;font-size:13px}.media-batch-bar{gap:10px}}

.media-grid{grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr))}
.media-image-transparent{background-color:var(--admin-bg-soft);background-image:conic-gradient(var(--admin-border-soft) 25%,transparent 0 50%,var(--admin-border-soft) 0 75%,transparent 0);background-size:16px 16px}
.media-image img{height:100%;max-height:none;min-height:0;object-fit:contain}
@media(max-width:600px){.media-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style>
