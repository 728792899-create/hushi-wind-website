<template>
  <div class="page-shell security-page">
    <section class="page-hero">
      <div>
        <h1>权限与审计中心</h1>
        <p>集中管理管理员账号、角色权限、登录记录、敏感操作、导出记录和数据库备份。</p>
      </div>
      <div class="hero-actions">
        <el-button v-if="canBackup" type="warning" plain @click="createBackup">立即备份</el-button>
        <el-button color="#222" class="dark-btn" :loading="loading" @click="fetchAll">刷新安全数据</el-button>
      </div>
    </section>

    <section v-if="productionReadiness" class="security-command-panel" :class="productionReadiness.status">
      <div class="security-score-card">
        <span>安全运营总览</span>
        <strong>{{ productionReadiness.score }}%</strong>
        <p>{{ productionReadiness.summary }}</p>
        <div class="security-score-breakdown">
          <div><b>{{ productionReadiness.criticalCount || 0 }}</b><small>严重问题</small></div>
          <div><b>{{ productionReadiness.warningCount || 0 }}</b><small>建议优化</small></div>
          <div><b>{{ readinessChecks.length }}</b><small>检查项目</small></div>
        </div>
      </div>
      <div class="security-task-board">
        <article v-for="step in hardeningSteps" :key="step.key" class="security-task-card" :class="{ done: step.done, danger: step.tone === 'danger', warning: step.tone === 'warning' }">
          <div class="security-task-index">{{ step.index }}</div>
          <div class="security-task-copy">
            <div class="security-task-title">
              <strong>{{ step.title }}</strong>
              <span>{{ step.done ? '已完成' : step.badge }}</span>
            </div>
            <p>{{ step.desc }}</p>
            <small>{{ step.note }}</small>
          </div>
          <el-button size="small" plain @click="goHardeningStep(step)">{{ step.action }}</el-button>
        </article>
      </div>
    </section>

    <section class="backup-health-strip">
      <article class="backup-health-card" :class="backupHealth.tone">
        <span>最近数据库备份</span>
        <strong>{{ backupHealth.title }}</strong>
        <small>{{ backupHealth.desc }}</small>
      </article>
      <article class="backup-health-card">
        <span>备份文件</span>
        <strong>{{ latestBackupRecord?.filename || '暂无记录' }}</strong>
        <small>{{ latestBackupRecord ? `${fileSize(latestBackupRecord.size)} · ${formatTime(latestBackupRecord.createdAt)} · ${backupVerificationLabel(latestBackupRecord)}` : '建议立即创建一次手动备份' }}</small>
      </article>
      <article class="backup-health-card">
        <span>重度运营提醒</span>
        <strong>改内容前先备份</strong>
        <small>批量改商品、文章、配置前，先点击右上角“立即备份”。</small>
      </article>
    </section>

    <section class="hardening-roadmap">
      <div class="roadmap-head">
        <div>
          <span>生产安全整改路线</span>
          <strong>按顺序完成，避免锁死账号或丢失回滚点</strong>
        </div>
        <el-tag :type="hardeningProgress.done === hardeningProgress.total ? 'success' : 'warning'" effect="dark">
          {{ hardeningProgress.done }}/{{ hardeningProgress.total }} 已完成
        </el-tag>
      </div>
      <div class="hardening-guard" :class="{ ready: canDisableDefaultAdminSafely }">
        <div>
          <span>停用默认 admin 前置条件</span>
          <strong>{{ canDisableDefaultAdminSafely ? '可以进入最后停用步骤' : '暂时不要停用默认 admin' }}</strong>
        </div>
        <ul>
          <li v-for="item in defaultAdminGuardChecks" :key="item.key" :class="{ ok: item.ok }">
            <el-tag :type="item.ok ? 'success' : 'warning'" size="small" effect="dark">{{ item.ok ? '已满足' : '待完成' }}</el-tag>
            <span>{{ item.label }}</span>
          </li>
        </ul>
      </div>
      <div class="roadmap-steps">
        <article v-for="step in hardeningSteps" :key="step.key" class="roadmap-step" :class="{ done: step.done, danger: step.tone === 'danger' }">
          <div class="step-index">{{ step.index }}</div>
          <div>
            <div class="step-title-row">
              <strong>{{ step.title }}</strong>
              <el-tag :type="step.done ? 'success' : step.tone" size="small" effect="dark">{{ step.done ? '已完成' : step.badge }}</el-tag>
            </div>
            <span>{{ step.desc }}</span>
            <small>{{ step.note }}</small>
          </div>
          <el-button size="small" plain @click="goHardeningStep(step)">{{ step.action }}</el-button>
        </article>
      </div>
    </section>

    <section class="security-metric-grid">
      <button class="kpi-card danger" type="button" @click="tab = 'alerts'">
        <span>未处理告警</span>
        <strong>{{ openAlertCount }}</strong>
        <small>API、登录、表单与备份异常</small>
      </button>
      <button class="kpi-card" type="button" @click="tab = 'operations'">
        <span>操作审计</span>
        <strong>{{ operationLogs.length }}</strong>
        <small>最近记录</small>
      </button>
      <button class="kpi-card danger" type="button" @click="tab = 'logins'">
        <span>登录失败</span>
        <strong>{{ failedLoginCount }}</strong>
        <small>当前列表内失败次数</small>
      </button>
      <button class="kpi-card success" type="button" @click="tab = 'users'">
        <span>启用账号</span>
        <strong>{{ activeUserCount }}</strong>
        <small>共 {{ users.length }} 个管理员</small>
      </button>
      <button class="kpi-card warning" type="button" @click="tab = 'exports'">
        <span>最近导出</span>
        <strong>{{ exportRecords.length }}</strong>
        <small>客户与运营数据导出</small>
      </button>
      <button class="kpi-card" type="button" @click="tab = 'backups'">
        <span>备份记录</span>
        <strong>{{ backups.length }}</strong>
        <small>数据库备份历史</small>
      </button>
    </section>

    <el-row :gutter="20">
      <el-col :span="8">
        <el-card class="chart-card account-card" shadow="never">
          <template #header>当前账号</template>
          <div class="account-identity">
            <div class="account-avatar">{{ accountInitial }}</div>
            <div>
              <strong>{{ currentUser?.displayName || currentUser?.username || '-' }}</strong>
              <span>{{ currentUser?.roleLabel || currentUser?.role || '-' }}</span>
            </div>
          </div>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="账号">{{ currentUser?.username || '-' }}</el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="statusType(currentUser?.status)" effect="dark">{{ statusLabel(currentUser?.status) }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="2FA">
              <el-tag :type="currentUser?.totpEnabled ? 'success' : 'warning'" effect="dark">{{ currentUser?.totpEnabled ? '已启用' : '未启用' }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="会话">12 小时令牌</el-descriptions-item>
          </el-descriptions>
          <el-alert
            title="生产环境请务必配置独立管理员账号、强密码和 ADMIN_TOKEN_SECRET。"
            type="warning"
            :closable="false"
            show-icon
            class="mt-20"
          />
          <div v-if="productionReadiness" class="readiness-panel" :class="productionReadiness.status">
            <div class="readiness-head">
              <span>正式上线就绪度</span>
              <strong>{{ productionReadiness.score }}%</strong>
            </div>
            <p>{{ productionReadiness.summary }}</p>
            <ul>
              <li v-for="item in readinessOpenChecks" :key="item.key" :class="item.level">
                <strong>{{ item.title }}</strong>
                <span>{{ item.detail }}</span>
                <small>{{ item.action }}</small>
              </li>
            </ul>
          </div>
          <div class="account-actions">
            <el-button color="#222" class="dark-btn full" @click="passwordDrawer = true">修改当前密码</el-button>
            <el-button v-if="!currentUser?.totpEnabled" type="success" plain class="full" :loading="twoFactorLoading" @click="setupTwoFactor">绑定 2FA</el-button>
            <el-button v-else type="warning" plain class="full" @click="twoFactorDrawer = true">管理 2FA</el-button>
          </div>
        </el-card>
      </el-col>

      <el-col :span="16">
        <el-card class="chart-card" shadow="never">
          <template #header>
            <div class="card-header-row">
              <span>角色权限</span>
              <span class="muted-text">菜单、按钮与接口权限均按角色控制</span>
            </div>
          </template>
          <div class="role-card-grid">
            <article
              v-for="role in roleEntries"
              :key="role.key"
              class="role-card"
              :class="{ active: role.key === currentUser?.role }"
            >
              <strong>{{ role.label }}</strong>
              <span>{{ role.key }}</span>
              <small>{{ role.permissionText }} 权限 · {{ role.userCount }} 个账号</small>
            </article>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="chart-card" shadow="never">
      <template #header>
        <div class="card-header-row">
          <span>安全工作台</span>
          <el-button v-if="canAdminWrite" size="small" color="#fff" class="light-btn" @click="openUserDrawer">新增账号</el-button>
        </div>
      </template>

      <el-tabs v-model="tab" class="dark-tabs">
        <el-tab-pane label="监控告警" name="alerts">
          <div class="table-tools">
            <div class="filter-row wrap">
              <el-select v-model="alertFilters.status" class="w-130" @change="fetchAlerts">
                <el-option label="未处理" value="new" />
                <el-option label="已处理" value="resolved" />
                <el-option label="全部状态" value="all" />
              </el-select>
              <el-select v-model="alertFilters.level" class="w-130" @change="fetchAlerts">
                <el-option label="全部级别" value="all" />
                <el-option label="严重" value="critical" />
                <el-option label="警告" value="warning" />
              </el-select>
              <el-select v-model="alertFilters.type" class="w-220" @change="fetchAlerts">
                <el-option label="全部类型" value="all" />
                <el-option label="API 500" value="api_5xx" />
                <el-option label="慢接口" value="slow_api" />
                <el-option label="登录失败" value="login_failed" />
                <el-option label="登录锁定" value="login_locked" />
                <el-option label="登录来源变化" value="login_location_changed" />
                <el-option label="表单失败" value="form_submit_failed" />
                <el-option label="备份失败" value="backup_failed" />
              </el-select>
            </div>
            <div class="filter-row wrap">
              <el-button type="success" plain :loading="resolvingAlerts" :disabled="!canBatchResolveAlerts" @click="resolveCurrentAlerts">批量标记当前筛选为已处理</el-button>
              <el-button plain @click="alertFilters.status = 'new'; alertFilters.level = 'all'; alertFilters.type = 'login_location_changed'; fetchAlerts()">只看登录来源变化</el-button>
              <el-button plain @click="alertFilters.status = 'new'; alertFilters.level = 'all'; alertFilters.type = 'resource_error'; fetchAlerts()">只看资源加载失败</el-button>
            </div>
            <span class="muted-text">告警来自后端落库记录，用于上线后的异常追踪。常规提醒可批量处理，严重故障需先完成排查。</span>
          </div>
          <div class="alert-guide-grid">
            <article v-for="item in alertGuideCards" :key="item.type" class="alert-guide-card" :class="item.level">
              <strong>{{ item.label }}</strong>
              <span>{{ item.description }}</span>
              <small>{{ item.action }}</small>
            </article>
          </div>
          <div class="mobile-admin-list security-mobile-list" v-loading="loading">
            <article v-for="row in alerts" :key="row.id" class="mobile-admin-card security-mobile-card">
              <div class="mobile-list-body">
                <div class="mobile-list-tags">
                  <el-tag :type="alertLevelType(row.level)" size="small" effect="dark">{{ alertLevelLabel(row.level) }}</el-tag>
                  <el-tag size="small" effect="dark">{{ row.status === 'resolved' ? '已处理' : '未处理' }}</el-tag>
                  <el-tag size="small" effect="dark">{{ row.type }}</el-tag>
                </div>
                <strong>{{ row.title }}</strong>
                <small>{{ row.message || '暂无说明' }}</small>
                <p>{{ formatTime(row.createdAt) }}</p>
                <div class="mobile-list-actions">
                  <el-button size="small" @click="openAlertDrawer(row)">详情</el-button>
                  <el-button v-if="row.status !== 'resolved'" size="small" type="success" plain @click="resolveAlert(row)">处理</el-button>
                </div>
              </div>
            </article>
          </div>
          <el-table :data="alerts" border class="wide-table mobile-hidden-table" max-height="460" empty-text="暂无监控告警">
            <el-table-column label="级别" width="100" align="center">
              <template #default="{ row }">
                <el-tag :type="alertLevelType(row.level)" effect="dark">{{ alertLevelLabel(row.level) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="type" label="类型" width="170" />
            <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip />
            <el-table-column prop="message" label="说明" min-width="240" show-overflow-tooltip />
            <el-table-column label="状态" width="100" align="center">
              <template #default="{ row }">
                <el-tag :type="row.status === 'resolved' ? 'success' : 'warning'" effect="dark">{{ row.status === 'resolved' ? '已处理' : '未处理' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="时间" width="170"><template #default="{ row }">{{ formatTime(row.createdAt) }}</template></el-table-column>
            <el-table-column label="操作" width="150" align="center" fixed="right">
              <template #default="{ row }">
                <el-button size="small" @click="openAlertDrawer(row)">详情</el-button>
                <el-button v-if="row.status !== 'resolved'" size="small" type="success" plain @click="resolveAlert(row)">处理</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="管理员账号" name="users">
          <div class="table-tools">
            <div class="filter-row wrap">
              <el-input v-model="userKeyword" placeholder="搜索账号、显示名、角色" class="w-320" clearable />
              <el-select v-model="userStatus" class="w-130">
                <el-option label="全部状态" value="all" />
                <el-option label="启用" value="active" />
                <el-option label="停用" value="disabled" />
              </el-select>
            </div>
            <span class="muted-text">共 {{ filteredUsers.length }} 个账号</span>
          </div>
          <div class="mobile-admin-list security-mobile-list" v-loading="loading">
            <article v-for="row in filteredUsers" :key="row.id" class="mobile-admin-card security-mobile-card">
              <div class="mobile-list-body">
                <div class="mobile-list-tags">
                  <el-tag size="small" effect="dark">{{ row.roleLabel || roleLabel(row.role) }}</el-tag>
                  <el-tag :type="statusType(row.status)" size="small" effect="dark">{{ statusLabel(row.status) }}</el-tag>
                </div>
                <strong>{{ row.username }}</strong>
                <small>{{ row.displayName }}</small>
                <p>{{ formatTime(row.lastLoginAt) }}</p>
                <div class="mobile-list-actions" v-if="canAdminWrite">
                  <el-button size="small" color="#222" class="dark-btn" @click="editUser(row)">编辑</el-button>
                  <el-button size="small" @click="resetUserPassword(row)">重置</el-button>
                  <el-button size="small" type="warning" plain @click="toggleUserStatus(row)">{{ row.status === 'active' ? '停用' : '启用' }}</el-button>
                </div>
              </div>
            </article>
          </div>
          <el-table :data="filteredUsers" border class="wide-table mobile-hidden-table" max-height="460" empty-text="暂无管理员账号">
            <el-table-column prop="username" label="账号" width="140" />
            <el-table-column prop="displayName" label="显示名" min-width="150" show-overflow-tooltip />
            <el-table-column label="角色" width="150">
              <template #default="{ row }">
                <el-tag effect="dark">{{ row.roleLabel || roleLabel(row.role) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100" align="center">
              <template #default="{ row }">
                <el-tag :type="statusType(row.status)" effect="dark">{{ statusLabel(row.status) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="上次登录" min-width="170">
              <template #default="{ row }">{{ formatTime(row.lastLoginAt) }}</template>
            </el-table-column>
            <el-table-column v-if="canAdminWrite" label="操作" width="190" align="center" fixed="right">
              <template #default="{ row }">
                <el-button size="small" color="#222" class="dark-btn" @click="editUser(row)">编辑</el-button>
                <el-dropdown trigger="click">
                  <el-button size="small">更多</el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item @click="resetUserPassword(row)">重置密码</el-dropdown-item>
                      <el-dropdown-item @click="toggleUserStatus(row)">{{ row.status === 'active' ? '停用账号' : '启用账号' }}</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="操作日志" name="operations">
          <div class="table-tools">
            <div class="filter-row wrap">
              <el-input v-model="logFilters.operator" placeholder="操作人" class="w-150" clearable @keyup.enter="fetchOperationLogs" />
              <el-select v-model="logFilters.module" class="w-150" @change="fetchOperationLogs">
                <el-option label="全部模块" value="all" />
                <el-option label="产品" value="products" />
                <el-option label="新闻" value="articles" />
                <el-option label="CMS" value="cms" />
                <el-option label="CRM" value="crm" />
                <el-option label="资源" value="resources" />
                <el-option label="安全" value="security" />
                <el-option label="系统" value="system" />
              </el-select>
              <el-select v-model="logFilters.action" class="w-150" @change="fetchOperationLogs">
                <el-option label="全部动作" value="all" />
                <el-option label="新增" value="CREATE" />
                <el-option label="更新" value="UPDATE" />
                <el-option label="删除" value="DELETE" />
                <el-option label="替换" value="REPLACE" />
                <el-option label="导出" value="EXPORT" />
                <el-option label="备份" value="BACKUP" />
                <el-option label="处理告警" value="RESOLVE_ALERT" />
                <el-option label="批量处理告警" value="RESOLVE_ALERT_BATCH" />
              </el-select>
              <el-date-picker v-model="logRange" type="daterange" start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD" class="date-range" />
              <el-button @click="fetchOperationLogs">筛选</el-button>
              <el-button type="warning" plain :loading="exportingAudit" @click="exportAuditLogs">导出审计 CSV</el-button>
            </div>
            <span class="muted-text">显示 {{ filteredOperationLogs.length }} 条</span>
          </div>
          <div class="mobile-admin-list security-mobile-list" v-loading="loading">
            <article v-for="row in filteredOperationLogs" :key="row.id" class="mobile-admin-card security-mobile-card">
              <div class="mobile-list-body">
                <div class="mobile-list-tags">
                  <el-tag size="small" effect="dark">{{ row.action }}</el-tag>
                  <el-tag size="small" effect="dark">{{ row.module }}</el-tag>
                </div>
                <strong>{{ row.target || row.operator }}</strong>
                <small>{{ row.summary || '暂无摘要' }}</small>
                <p>{{ row.operator }} · {{ formatTime(row.createdAt) }}</p>
                <div class="mobile-list-actions">
                  <el-button size="small" @click="openAuditDrawer(row)">查看</el-button>
                </div>
              </div>
            </article>
          </div>
          <el-table :data="filteredOperationLogs" border class="wide-table mobile-hidden-table" max-height="460" empty-text="暂无操作日志">
            <el-table-column prop="action" label="动作" width="110" />
            <el-table-column prop="module" label="模块" width="100" />
            <el-table-column prop="operator" label="账号" width="120" />
            <el-table-column prop="target" label="对象" min-width="180" show-overflow-tooltip />
            <el-table-column prop="summary" label="摘要" min-width="260" show-overflow-tooltip />
            <el-table-column label="时间" width="170"><template #default="{ row }">{{ formatTime(row.createdAt) }}</template></el-table-column>
            <el-table-column label="详情" width="90" align="center" fixed="right">
              <template #default="{ row }">
                <el-button size="small" @click="openAuditDrawer(row)">查看</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="登录记录" name="logins">
          <div class="table-tools">
            <div class="filter-row wrap">
              <el-input v-model="loginFilters.username" placeholder="账号" class="w-150" clearable @keyup.enter="fetchLoginRecords" />
              <el-select v-model="loginFilters.result" class="w-130">
                <el-option label="全部结果" value="all" />
                <el-option label="成功" value="success" />
                <el-option label="失败" value="failed" />
              </el-select>
              <el-date-picker v-model="loginRange" type="daterange" start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD" class="date-range" />
              <el-button @click="fetchLoginRecords">筛选</el-button>
            </div>
            <span class="muted-text">失败登录会进入锁定策略</span>
          </div>
          <div class="mobile-admin-list security-mobile-list" v-loading="loading">
            <article v-for="row in filteredLoginRecords" :key="row.id" class="mobile-admin-card security-mobile-card">
              <div class="mobile-list-body">
                <div class="mobile-list-tags">
                  <el-tag :type="row.success ? 'success' : 'danger'" size="small" effect="dark">{{ row.success ? '成功' : '失败' }}</el-tag>
                </div>
                <strong>{{ row.username }}</strong>
                <small>{{ row.message || '暂无说明' }}</small>
                <p>{{ row.ip || '-' }} · {{ formatTime(row.createdAt) }}</p>
              </div>
            </article>
          </div>
          <el-table :data="filteredLoginRecords" border class="wide-table mobile-hidden-table" max-height="460" empty-text="暂无登录记录">
            <el-table-column prop="username" label="账号" width="140" />
            <el-table-column label="结果" width="100" align="center">
              <template #default="{ row }">
                <el-tag :type="row.success ? 'success' : 'danger'" effect="dark">{{ row.success ? '成功' : '失败' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="message" label="说明" min-width="180" show-overflow-tooltip />
            <el-table-column prop="ip" label="IP" width="150" />
            <el-table-column label="时间" width="170"><template #default="{ row }">{{ formatTime(row.createdAt) }}</template></el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="导出记录" name="exports">
          <div class="table-tools">
            <div class="filter-row wrap">
              <el-input v-model="exportKeyword" placeholder="搜索模块、文件名、操作人" class="w-320" clearable />
              <el-date-picker v-model="exportRange" type="daterange" start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD" class="date-range" />
            </div>
            <span class="muted-text">敏感客户资料导出需保留审计记录</span>
          </div>
          <div class="mobile-admin-list security-mobile-list" v-loading="loading">
            <article v-for="row in filteredExportRecords" :key="row.id" class="mobile-admin-card security-mobile-card">
              <div class="mobile-list-body">
                <div class="mobile-list-tags">
                  <el-tag size="small" effect="dark">{{ row.module }}</el-tag>
                  <el-tag size="small" effect="dark">{{ row.rowCount }} 行</el-tag>
                </div>
                <strong>{{ row.filename }}</strong>
                <small>{{ row.operator }}</small>
                <p>{{ formatTime(row.createdAt) }}</p>
              </div>
            </article>
          </div>
          <el-table :data="filteredExportRecords" border class="wide-table mobile-hidden-table" max-height="460" empty-text="暂无导出记录">
            <el-table-column prop="operator" label="账号" width="130" />
            <el-table-column prop="module" label="模块" width="130" />
            <el-table-column prop="filename" label="文件名" min-width="260" show-overflow-tooltip />
            <el-table-column prop="rowCount" label="行数" width="90" />
            <el-table-column label="时间" width="170"><template #default="{ row }">{{ formatTime(row.createdAt) }}</template></el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="备份记录" name="backups">
          <div class="table-tools">
            <div class="filter-row wrap">
              <el-select v-model="backupStatus" class="w-130">
                <el-option label="全部状态" value="all" />
                <el-option label="成功" value="success" />
                <el-option label="失败" value="failed" />
              </el-select>
              <el-date-picker v-model="backupRange" type="daterange" start-placeholder="开始日期" end-placeholder="结束日期" value-format="YYYY-MM-DD" class="date-range" />
            </div>
            <span class="muted-text">建议上线后配置定时备份和异地备份</span>
          </div>
          <div class="mobile-admin-list security-mobile-list" v-loading="loading">
            <article v-for="row in backups" :key="row.id" class="mobile-admin-card security-mobile-card">
              <div class="mobile-list-body">
                <div class="mobile-list-tags">
                  <el-tag :type="row.status === 'success' ? 'success' : 'danger'" size="small" effect="dark">{{ row.status || '-' }}</el-tag>
                  <el-tag size="small" effect="dark">{{ fileSize(row.size) }}</el-tag>
                  <el-tag :type="backupVerified(row) ? 'success' : 'warning'" size="small" effect="dark">{{ backupVerificationLabel(row) }}</el-tag>
                </div>
                <strong>{{ row.filename }}</strong>
                <small>{{ row.operator }}</small>
                <p>{{ row.message || '暂无备注' }} · {{ formatTime(row.createdAt) }}</p>
                <div class="mobile-list-actions" v-if="canBackup && row.status === 'success'">
                  <el-button size="small" type="warning" plain @click="verifyBackupRestore(row)">恢复演练</el-button>
                </div>
              </div>
            </article>
          </div>
          <el-table :data="backups" border class="wide-table mobile-hidden-table" max-height="460" empty-text="暂无备份记录">
            <el-table-column prop="filename" label="文件名" min-width="280" show-overflow-tooltip />
            <el-table-column label="大小" width="120"><template #default="{ row }">{{ fileSize(row.size) }}</template></el-table-column>
            <el-table-column prop="operator" label="创建人" width="130" />
            <el-table-column label="状态" width="100" align="center">
              <template #default="{ row }">
                <el-tag :type="row.status === 'success' ? 'success' : 'danger'" effect="dark">{{ row.status || '-' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="恢复演练" width="120" align="center">
              <template #default="{ row }">
                <el-tag :type="backupVerified(row) ? 'success' : 'warning'" effect="dark">{{ backupVerificationLabel(row) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="message" label="备注" min-width="200" show-overflow-tooltip />
            <el-table-column label="时间" width="170"><template #default="{ row }">{{ formatTime(row.createdAt) }}</template></el-table-column>
            <el-table-column v-if="canBackup" label="操作" width="130" align="center" fixed="right">
              <template #default="{ row }">
                <el-button size="small" type="warning" plain :disabled="row.status !== 'success'" @click="verifyBackupRestore(row)">恢复演练</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <el-card class="chart-card" shadow="never">
      <template #header>敏感操作策略</template>
      <div class="policy-grid">
        <div><strong>数据库审计</strong><span>登录、导出、写操作与备份记录统一落库，便于上线后追溯。</span></div>
        <div><strong>登录锁定</strong><span>连续失败会触发临时锁定，降低后台撞库风险。</span></div>
        <div><strong>角色权限</strong><span>菜单、按钮和接口权限按角色收敛，减少误操作面。</span></div>
        <div><strong>强制下线</strong><span>改密或重置密码会提升 tokenVersion，让旧会话失效。</span></div>
      </div>
    </el-card>

    <el-drawer v-model="passwordDrawer" title="修改当前密码" size="420px" class="dark-dialog">
      <el-form ref="passwordFormRef" :model="passwordForm" :rules="passwordRules" label-width="90px">
        <el-form-item label="原密码" prop="oldPassword">
          <el-input v-model="passwordForm.oldPassword" type="password" show-password />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input v-model="passwordForm.newPassword" type="password" show-password placeholder="至少 8 位，包含字母和数字" />
        </el-form-item>
      </el-form>
      <div class="drawer-footer">
        <el-button @click="passwordDrawer = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="changePassword">确认修改</el-button>
      </div>
    </el-drawer>

    <el-drawer v-model="twoFactorDrawer" title="双因素认证 2FA" size="520px" class="dark-dialog">
      <div class="two-factor-panel">
        <el-alert
          title="请使用 Microsoft Authenticator、Google Authenticator 或 1Password 扫描/录入密钥。启用后，登录后台必须输入 6 位动态码。"
          type="info"
          :closable="false"
          show-icon
          class="mb-16"
        />
        <template v-if="!currentUser?.totpEnabled">
          <div v-if="twoFactorSetup.secret" class="secret-box">
            <span>绑定密钥</span>
            <strong>{{ twoFactorSetup.secret }}</strong>
            <el-button size="small" @click="copyTwoFactorSecret">复制密钥</el-button>
          </div>
          <el-input v-model="twoFactorSetup.otpauthUrl" type="textarea" :rows="3" readonly placeholder="生成后显示 otpauth 绑定地址" />
          <el-form label-width="96px" class="mt-20">
            <el-form-item label="动态码">
              <el-input v-model="twoFactorCode" maxlength="6" inputmode="numeric" placeholder="输入认证器中的 6 位数字" />
            </el-form-item>
          </el-form>
          <div class="drawer-footer">
            <el-button :loading="twoFactorLoading" @click="setupTwoFactor">重新生成</el-button>
            <el-button type="primary" :loading="twoFactorLoading" :disabled="!twoFactorSetup.secret" @click="enableTwoFactor">确认启用</el-button>
          </div>
        </template>
        <template v-else>
          <div class="risk-summary">
            <strong>当前账号已启用 2FA</strong>
            <span>关闭后账号只依赖密码登录，建议仅在更换认证器或紧急恢复时操作。</span>
          </div>
          <el-form label-width="96px" class="mt-20">
            <el-form-item label="动态码">
              <el-input v-model="twoFactorCode" maxlength="6" inputmode="numeric" placeholder="输入认证器中的 6 位数字" />
            </el-form-item>
          </el-form>
          <div class="drawer-footer">
            <el-button @click="twoFactorDrawer = false">取消</el-button>
            <el-button type="danger" plain :loading="twoFactorLoading" @click="disableTwoFactor">关闭 2FA</el-button>
          </div>
        </template>
      </div>
    </el-drawer>

    <el-drawer v-model="userDrawer" :title="editingUser ? '编辑管理员' : '新增管理员'" size="520px" class="dark-dialog">
      <el-form ref="userFormRef" :model="userForm" :rules="userRules" label-width="96px">
        <el-form-item label="账号" prop="username">
          <el-input v-model="userForm.username" :disabled="Boolean(editingUser)" placeholder="英文、数字、下划线或短横线" />
        </el-form-item>
        <el-form-item label="显示名" prop="displayName">
          <el-input v-model="userForm.displayName" />
        </el-form-item>
        <el-form-item label="角色" prop="role">
          <el-select v-model="userForm.role" class="full">
            <el-option v-for="role in roleEntries" :key="role.key" :label="role.label" :value="role.key" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-select v-model="userForm.status" class="full">
            <el-option label="启用" value="active" />
            <el-option label="停用" value="disabled" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="!editingUser" label="初始密码" prop="password">
          <el-input v-model="userForm.password" type="password" show-password placeholder="至少 8 位，包含字母和数字" />
        </el-form-item>
      </el-form>
      <div class="drawer-footer">
        <el-button @click="userDrawer = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitUser">保存账号</el-button>
      </div>
    </el-drawer>

    <el-drawer v-model="auditDrawer" title="审计详情" size="720px" class="dark-dialog">
      <template v-if="activeAudit">
        <el-descriptions :column="2" border size="small" class="mb-18">
          <el-descriptions-item label="动作">{{ activeAudit.action }}</el-descriptions-item>
          <el-descriptions-item label="模块">{{ activeAudit.module }}</el-descriptions-item>
          <el-descriptions-item label="操作人">{{ activeAudit.operator }}</el-descriptions-item>
          <el-descriptions-item label="时间">{{ formatTime(activeAudit.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="对象">{{ activeAudit.target || '-' }}</el-descriptions-item>
          <el-descriptions-item label="IP">{{ activeAudit.ip || '-' }}</el-descriptions-item>
        </el-descriptions>
        <div class="diff-grid">
          <div class="diff-panel">
            <strong>修改前</strong>
            <pre>{{ prettyJson(activeAudit.beforeData) }}</pre>
          </div>
          <div class="diff-panel">
            <strong>修改后</strong>
            <pre>{{ prettyJson(activeAudit.afterData) }}</pre>
          </div>
        </div>
      </template>
    </el-drawer>

    <el-drawer v-model="alertDrawer" title="告警详情" size="620px" class="dark-dialog">
      <template v-if="activeAlert">
        <el-descriptions :column="2" border size="small" class="mb-18">
          <el-descriptions-item label="级别">{{ alertLevelLabel(activeAlert.level) }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ activeAlert.status === 'resolved' ? '已处理' : '未处理' }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ activeAlert.type }}</el-descriptions-item>
          <el-descriptions-item label="时间">{{ formatTime(activeAlert.createdAt) }}</el-descriptions-item>
          <el-descriptions-item label="标题" :span="2">{{ activeAlert.title }}</el-descriptions-item>
          <el-descriptions-item label="说明" :span="2">{{ activeAlert.message || '-' }}</el-descriptions-item>
        </el-descriptions>
        <div class="diff-panel single">
          <strong>上下文</strong>
          <pre>{{ prettyJson(activeAlert.metadata) }}</pre>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { api, extractErrorMessage, getCurrentUser, hasPermission, sensitiveConfirmation, setCurrentUser, setToken } from '../lib/api'
import { formatTime } from '../lib/format'

const currentUser = ref(getCurrentUser())
const users = ref([])
const roles = ref({})
const operationLogs = ref([])
const loginRecords = ref([])
const exportRecords = ref([])
const backups = ref([])
const productionReadiness = ref(null)
const alerts = ref([])
const alertOpenTotal = ref(0)
const loading = ref(false)
const saving = ref(false)
const twoFactorLoading = ref(false)
const exportingAudit = ref(false)
const resolvingAlerts = ref(false)
const tab = ref('users')
const passwordDrawer = ref(false)
const twoFactorDrawer = ref(false)
const userDrawer = ref(false)
const auditDrawer = ref(false)
const alertDrawer = ref(false)
const editingUser = ref(null)
const activeAudit = ref(null)
const activeAlert = ref(null)
const passwordFormRef = ref(null)
const userFormRef = ref(null)
const passwordForm = reactive({ oldPassword: '', newPassword: '' })
const userForm = reactive({ username: '', displayName: '', role: 'readonly', status: 'active', password: '' })
const twoFactorSetup = reactive({ secret: '', otpauthUrl: '' })
const twoFactorCode = ref('')
const userKeyword = ref('')
const userStatus = ref('all')
const logFilters = reactive({ module: 'all', action: 'all', operator: '' })
const loginFilters = reactive({ username: '', result: 'all' })
const alertFilters = reactive({ status: 'new', level: 'all', type: 'all' })
const alertGuideCards = [
  {
    type: 'login_location_changed',
    label: '登录来源变化',
    level: 'warning',
    description: '通常表示管理员换网络或异地登录。',
    action: '确认是本人操作后可批量标记已处理。'
  },
  {
    type: 'resource_error',
    label: '前端资源加载失败',
    level: 'warning',
    description: '常见于刚更新网站后，浏览器缓存仍指向旧资源。',
    action: '确认页面可正常刷新后可标记已处理。'
  },
  {
    type: 'api_5xx',
    label: 'API 500',
    level: 'critical',
    description: '代表接口异常，可能影响表单、后台或前台数据。',
    action: '先检查 API 日志和健康检查，再处理告警。'
  },
  {
    type: 'backup_failed',
    label: '备份失败',
    level: 'critical',
    description: '数据库备份没有按预期生成。',
    action: '先补一次手动备份并确认文件存在。'
  }
]
const logRange = ref([])
const loginRange = ref([])
const exportRange = ref([])
const backupRange = ref([])
const exportKeyword = ref('')
const backupStatus = ref('all')
const stateReady = ref(false)
const stateKey = 'aural-security-view-state'

const canAdminWrite = computed(() => hasPermission('admin:write'))
const canBackup = computed(() => hasPermission('backups:create'))

const strongPasswordValidator = (rule, value, callback) => {
  const password = String(value || '')
  if (!password) return callback(new Error('请输入密码'))
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return callback(new Error('至少 8 位，并包含字母和数字'))
  }
  return callback()
}

const usernameValidator = (rule, value, callback) => {
  const username = String(value || '').trim()
  if (!username) return callback(new Error('请输入账号'))
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(username)) return callback(new Error('账号需为 3-32 位英文、数字、下划线或短横线'))
  return callback()
}

const passwordRules = {
  oldPassword: [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [{ validator: strongPasswordValidator, trigger: 'blur' }]
}

const userRules = {
  username: [{ validator: usernameValidator, trigger: 'blur' }],
  displayName: [{ required: true, message: '请输入显示名', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }],
  password: [{ validator: strongPasswordValidator, trigger: 'blur' }]
}

const roleEntries = computed(() => Object.entries(roles.value).map(([key, role]) => {
  const permissions = role.permissions || []
  return {
    key,
    label: role.label || key,
    permissionText: permissions.includes('*') ? '全部' : permissions.length,
    userCount: users.value.filter((user) => user.role === key).length
  }
}))

const accountInitial = computed(() => String(currentUser.value?.displayName || currentUser.value?.username || 'A').slice(0, 1).toUpperCase())
const activeUserCount = computed(() => users.value.filter((user) => user.status === 'active').length)
const failedLoginCount = computed(() => loginRecords.value.filter((record) => !record.success).length)
const openAlertCount = computed(() => alertOpenTotal.value)
const readinessOpenChecks = computed(() => (productionReadiness.value?.openChecks || []).slice(0, 4))
const readinessChecks = computed(() => productionReadiness.value?.checks || [])
const readinessPriorityChecks = computed(() => {
  const open = productionReadiness.value?.openChecks || []
  const ok = readinessChecks.value.filter((item) => item.ok).slice(0, 2)
  return [...open, ...ok].slice(0, 6)
})
const latestBackupRecord = computed(() => backups.value.find((item) => item.status === 'success') || backups.value[0] || null)
const backupVerified = (row) => /恢复演练通过/.test(String(row?.message || ''))

const backupVerificationLabel = (row) => {
  if (!row || row.status !== 'success') return '不可演练'
  return backupVerified(row) ? '已演练' : '待演练'
}

const backupHealth = computed(() => {
  const row = latestBackupRecord.value
  if (!row) return { tone: 'danger', title: '没有可用备份', desc: '上线后应立即创建一次数据库备份。' }
  if (row.status !== 'success') return { tone: 'danger', title: '最近备份失败', desc: row.message || '请检查服务器文件权限和数据库路径。' }
  const ageMs = Date.now() - new Date(row.createdAt).getTime()
  const ageDays = Math.max(0, Math.floor(ageMs / (24 * 60 * 60 * 1000)))
  if (ageMs > 7 * 24 * 60 * 60 * 1000) return { tone: 'warning', title: `已 ${ageDays} 天未备份`, desc: '建议本周补一次手动备份并做恢复演练。' }
  return { tone: 'success', title: '备份状态正常', desc: `最近 ${ageDays || '今天'} 已有成功备份。` }
})
const hasFreshBackup = computed(() => backupHealth.value.tone === 'success')
const activeSuperAdmins = computed(() => users.value.filter((user) => user.status === 'active' && user.role === 'super_admin'))
const enabledTwoFactorUsers = computed(() => users.value.filter((user) => user.status === 'active' && user.totpEnabled))
const hasDefaultAdmin = computed(() => users.value.some((user) => user.status === 'active' && user.username === 'admin'))
const hasNonDefaultSuperAdmin = computed(() => activeSuperAdmins.value.some((user) => user.username !== 'admin'))
const hasCurrentUserTwoFactor = computed(() => Boolean(currentUser.value?.totpEnabled))
const hasAllActiveAdminsTwoFactor = computed(() => activeUserCount.value > 0 && enabledTwoFactorUsers.value.length === activeUserCount.value)
const criticalReadinessOpenCount = computed(() => (productionReadiness.value?.openChecks || []).filter((item) => item.level === 'critical').length)
const hasOpenAlerts = computed(() => openAlertCount.value > 0)
const canDisableDefaultAdminSafely = computed(() => hasFreshBackup.value && hasNonDefaultSuperAdmin.value && hasCurrentUserTwoFactor.value)
const defaultAdminGuardChecks = computed(() => [
  { key: 'backup', label: '7 天内已有成功数据库备份，可回滚', ok: hasFreshBackup.value },
  { key: 'super_admin', label: '已有非 admin 的启用超级管理员账号', ok: hasNonDefaultSuperAdmin.value },
  { key: 'two_factor', label: '当前登录账号已启用 2FA，确认能正常登录', ok: hasCurrentUserTwoFactor.value }
])
const hardeningSteps = computed(() => [
  {
    key: 'backup',
    index: 1,
    title: '先创建一次数据库备份',
    badge: '先做这个',
    tone: hasFreshBackup.value ? 'success' : 'danger',
    done: hasFreshBackup.value,
    desc: hasFreshBackup.value ? backupHealth.value.title : '当前没有 7 天内成功备份，先保留回滚点。',
    note: latestBackupRecord.value ? `最近备份：${latestBackupRecord.value.filename}` : '点击右上角“立即备份”，成功后再继续账号整改。',
    action: '去备份记录'
  },
  {
    key: 'new_super_admin',
    index: 2,
    title: '新建非 admin 超级管理员',
    badge: '必须整改',
    tone: hasNonDefaultSuperAdmin.value ? 'success' : 'danger',
    done: hasNonDefaultSuperAdmin.value,
    desc: hasNonDefaultSuperAdmin.value ? '已存在非默认超级管理员。' : '不要直接停用 admin，先创建并验证新超级管理员能登录。',
    note: '账号建议使用个人化英文名，密码至少 12 位并包含大小写、数字和符号。',
    action: '去管理员账号'
  },
  {
    key: 'two_factor',
    index: 3,
    title: '给管理员启用 2FA',
    badge: '建议立即',
    tone: hasAllActiveAdminsTwoFactor.value ? 'success' : 'warning',
    done: hasAllActiveAdminsTwoFactor.value,
    desc: hasCurrentUserTwoFactor.value ? `当前账号已启用，启用账号 ${enabledTwoFactorUsers.value.length}/${activeUserCount.value}。` : '当前账号还没启用 2FA，后台登录仍只依赖密码。',
    note: '先给当前账号绑定认证器，再逐个处理其他启用管理员。',
    action: '去绑定 2FA'
  },
  {
    key: 'disable_default_admin',
    index: 4,
    title: '停用默认 admin 账号',
    badge: canDisableDefaultAdminSafely.value ? '最后执行' : '先别执行',
    tone: hasDefaultAdmin.value ? 'danger' : 'success',
    done: !hasDefaultAdmin.value,
    desc: hasDefaultAdmin.value ? '默认 admin 仍处于启用状态，属于生产高风险项。' : '默认 admin 已停用。',
    note: canDisableDefaultAdminSafely.value ? '前置条件已满足，可以进入管理员账号列表停用默认账号。' : '必须先完成备份、非默认超级管理员、当前账号 2FA，再停用默认账号。',
    action: canDisableDefaultAdminSafely.value ? '去停用 admin' : '查看前置条件'
  },
  {
    key: 'alerts',
    index: 5,
    title: '处理未完成告警',
    badge: '需要确认',
    tone: hasOpenAlerts.value ? 'warning' : 'success',
    done: !hasOpenAlerts.value,
    desc: hasOpenAlerts.value ? `还有 ${openAlertCount.value} 条未处理告警。` : '当前没有未处理告警。',
    note: '登录来源变化、资源加载失败可确认后处理；API 500/备份失败必须先排查。',
    action: '去监控告警'
  },
  {
    key: 'readiness',
    index: 6,
    title: '确认上线就绪度无严重项',
    badge: '验收项',
    tone: criticalReadinessOpenCount.value ? 'danger' : 'success',
    done: criticalReadinessOpenCount.value === 0,
    desc: criticalReadinessOpenCount.value ? `仍有 ${criticalReadinessOpenCount.value} 个严重项。` : '上线就绪度已无严重项。',
    note: productionReadiness.value?.summary || '刷新安全数据后查看最新检查结果。',
    action: '查看就绪度'
  }
])
const hardeningProgress = computed(() => ({
  done: hardeningSteps.value.filter((step) => step.done).length,
  total: hardeningSteps.value.length
}))
const canBatchResolveAlerts = computed(() => alerts.value.some((row) => row.status !== 'resolved') && !resolvingAlerts.value)

const filteredUsers = computed(() => {
  const keyword = userKeyword.value.trim().toLowerCase()
  return users.value.filter((user) => {
    const fields = [user.username, user.displayName, user.roleLabel, user.role].filter(Boolean)
    const matchKeyword = !keyword || fields.some((field) => String(field).toLowerCase().includes(keyword))
    const matchStatus = userStatus.value === 'all' || user.status === userStatus.value
    return matchKeyword && matchStatus
  })
})

const filteredOperationLogs = computed(() => operationLogs.value)

const filteredLoginRecords = computed(() => loginRecords.value.filter((item) => {
  const matchResult = loginFilters.result === 'all' || (loginFilters.result === 'success' ? item.success : !item.success)
  return matchResult && inDateRange(item.createdAt, loginRange.value)
}))

const filteredExportRecords = computed(() => {
  const keyword = exportKeyword.value.trim().toLowerCase()
  return exportRecords.value.filter((item) => {
    const fields = [item.operator, item.module, item.filename].filter(Boolean)
    const matchKeyword = !keyword || fields.some((field) => String(field).toLowerCase().includes(keyword))
    return matchKeyword && inDateRange(item.createdAt, exportRange.value)
  })
})

const inDateRange = (value, range) => {
  if (!range?.length || !value) return true
  const time = new Date(value).getTime()
  const start = new Date(range[0]).setHours(0, 0, 0, 0)
  const end = new Date(range[1]).setHours(23, 59, 59, 999)
  return time >= start && time <= end
}

const roleLabel = (role) => roles.value?.[role]?.label || role || '-'

const statusLabel = (status) => {
  if (status === 'active') return '启用'
  if (status === 'disabled') return '停用'
  return status || '-'
}

const statusType = (status) => {
  if (status === 'active') return 'success'
  if (status === 'disabled') return 'info'
  return 'warning'
}

const alertLevelLabel = (level) => {
  if (level === 'critical') return '严重'
  if (level === 'warning') return '警告'
  return level || '-'
}

const alertLevelType = (level) => {
  if (level === 'critical') return 'danger'
  if (level === 'warning') return 'warning'
  return 'info'
}

const readinessTagType = (item) => {
  if (item.ok) return 'success'
  if (item.level === 'critical') return 'danger'
  if (item.level === 'warning') return 'warning'
  return 'info'
}

const readinessStatusLabel = (item) => {
  if (item.ok) return '已通过'
  if (item.level === 'critical') return '必须处理'
  if (item.level === 'warning') return '建议整改'
  return '待确认'
}

const readinessActionLabel = (item) => {
  if (item.key === 'credentials') return '去改密码/账号'
  if (item.key === 'two_factor') return '去绑定 2FA'
  if (item.key === 'backup') return '去备份记录'
  if (item.key === 'open_alerts') return '去处理告警'
  if (item.key === 'api_errors' || item.key === 'login_failures') return '查看日志'
  return item.ok ? '查看状态' : '查看详情'
}

const goReadinessTarget = (item) => {
  if (item.key === 'credentials' || item.key === 'two_factor') tab.value = 'users'
  else if (item.key === 'backup') tab.value = 'backups'
  else if (item.key === 'open_alerts') tab.value = 'alerts'
  else if (item.key === 'api_errors') tab.value = 'alerts'
  else if (item.key === 'login_failures') tab.value = 'logins'
  else tab.value = 'operations'
}

const goHardeningStep = (step) => {
  if (step.key === 'backup') tab.value = 'backups'
  else if (step.key === 'new_super_admin' || step.key === 'disable_default_admin') tab.value = 'users'
  else if (step.key === 'two_factor') {
    tab.value = 'users'
    if (!currentUser.value?.totpEnabled) setupTwoFactor()
    else twoFactorDrawer.value = true
  } else if (step.key === 'alerts') tab.value = 'alerts'
  else tab.value = 'operations'
}

const fileSize = (value) => {
  const bytes = Number(value || 0)
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

const fetchUsers = async () => {
  const res = await api.get('/api/admin/users')
  users.value = res.data?.data || []
  roles.value = res.data?.roles || {}
}

const fetchOperationLogs = async () => {
  const [startDate, endDate] = rangeParams(logRange.value)
  const res = await api.get('/api/admin/operation-logs', { params: { ...logFilters, startDate, endDate } })
  operationLogs.value = res.data?.data || []
}

const fetchLoginRecords = async () => {
  const [startDate, endDate] = rangeParams(loginRange.value)
  const res = await api.get('/api/admin/login-records', { params: { username: loginFilters.username, result: loginFilters.result, startDate, endDate } })
  loginRecords.value = res.data?.data || []
}

const fetchExportRecords = async () => {
  const [startDate, endDate] = rangeParams(exportRange.value)
  const res = await api.get('/api/admin/export-records', { params: { startDate, endDate } })
  exportRecords.value = res.data?.data || []
}

const fetchBackups = async () => {
  const [startDate, endDate] = rangeParams(backupRange.value)
  const res = await api.get('/api/admin/backups', { params: { status: backupStatus.value, startDate, endDate } })
  backups.value = res.data?.data || []
}

const fetchOpsHealth = async () => {
  const res = await api.get('/api/admin/ops-health')
  productionReadiness.value = res.data?.data?.productionReadiness || null
}

const fetchAlerts = async () => {
  const [res, openRes] = await Promise.all([
    api.get('/api/admin/alerts', { params: alertFilters }),
    api.get('/api/admin/alerts', { params: { status: 'new', pageSize: 1 } })
  ])
  alerts.value = res.data?.data || []
  alertOpenTotal.value = openRes.data?.meta?.pagination?.total || 0
}

const fetchAll = async () => {
  loading.value = true
  const results = await Promise.allSettled([fetchAlerts(), fetchUsers(), fetchOperationLogs(), fetchLoginRecords(), fetchExportRecords(), fetchBackups(), fetchOpsHealth()])
  const failed = results.find((item) => item.status === 'rejected')
  if (failed) ElMessage.error(extractErrorMessage(failed.reason, '安全数据加载失败，请稍后重试'))
  loading.value = false
}

const rangeParams = (range) => {
  if (!range?.length) return ['', '']
  return range.map((item) => {
    if (!item) return ''
    const date = item instanceof Date ? item : new Date(item)
    if (Number.isNaN(date.getTime())) return ''
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${date.getFullYear()}-${month}-${day}`
  })
}

const parseJsonValue = (value) => {
  if (!value) return null
  if (typeof value !== 'string') return value
  try { return JSON.parse(value) } catch { return value }
}

const prettyJson = (value) => {
  const parsed = parseJsonValue(value)
  if (!parsed) return '无记录'
  if (typeof parsed === 'string') return parsed
  return JSON.stringify(parsed, null, 2)
}

const openAuditDrawer = (row) => {
  activeAudit.value = row
  auditDrawer.value = true
}

const openAlertDrawer = (row) => {
  activeAlert.value = row
  alertDrawer.value = true
}

const resolveAlert = async (row) => {
  await ElMessageBox.confirm(`确认将告警「${row.title}」标记为已处理？`, '告警处理确认', { type: 'warning' })
  await api.put(`/api/admin/alerts/${row.id}/resolve`)
  ElMessage.success('告警已标记为已处理')
  fetchAlerts()
}

const resolveCurrentAlerts = async () => {
  const targets = alerts.value.filter((row) => row.status !== 'resolved')
  if (!targets.length) {
    ElMessage.warning('当前筛选下没有未处理告警')
    return
  }
  const filterLabel = [
    alertFilters.status === 'all' ? '未处理' : alertFilters.status,
    alertFilters.level === 'all' ? '全部级别' : alertLevelLabel(alertFilters.level),
    alertFilters.type === 'all' ? '全部类型' : alertFilters.type
  ].join(' / ')
  await ElMessageBox.confirm(
    `确认将当前筛选「${filterLabel}」下的未处理告警批量标记为已处理？建议仅对已确认的常规提醒执行此操作。`,
    '批量处理告警',
    { type: 'warning', confirmButtonText: '确认批量处理', cancelButtonText: '取消' }
  )
  resolvingAlerts.value = true
  try {
    const res = await api.put('/api/admin/alerts/resolve-batch', {
      status: alertFilters.status,
      level: alertFilters.level,
      type: alertFilters.type
    })
    ElMessage.success(`已处理 ${res.data?.count || 0} 条告警`)
    fetchAlerts()
    fetchOperationLogs()
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, '批量处理告警失败'))
  } finally {
    resolvingAlerts.value = false
  }
}

const applyAuthResponse = (data) => {
  if (data?.token) setToken(data.token)
  if (data?.user) {
    setCurrentUser(data.user)
    currentUser.value = data.user
  }
}

const setupTwoFactor = async () => {
  twoFactorLoading.value = true
  try {
    const res = await api.post('/api/auth/2fa/setup')
    Object.assign(twoFactorSetup, { secret: res.data?.secret || '', otpauthUrl: res.data?.otpauthUrl || '' })
    twoFactorDrawer.value = true
    ElMessage.success('2FA 绑定密钥已生成')
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, '2FA 绑定密钥生成失败'))
  } finally {
    twoFactorLoading.value = false
  }
}

const enableTwoFactor = async () => {
  if (!/^\d{6}$/.test(twoFactorCode.value)) {
    ElMessage.warning('请输入 6 位动态验证码')
    return
  }
  twoFactorLoading.value = true
  try {
    const res = await api.post('/api/auth/2fa/enable', { code: twoFactorCode.value })
    applyAuthResponse(res.data)
    twoFactorDrawer.value = false
    Object.assign(twoFactorSetup, { secret: '', otpauthUrl: '' })
    twoFactorCode.value = ''
    ElMessage.success('2FA 已启用，当前会话已刷新')
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, '2FA 启用失败'))
  } finally {
    twoFactorLoading.value = false
  }
}

const disableTwoFactor = async () => {
  if (!/^\d{6}$/.test(twoFactorCode.value)) {
    ElMessage.warning('请输入 6 位动态验证码')
    return
  }
  await ElMessageBox.confirm('确认关闭当前账号的 2FA？关闭后登录后台将只验证密码。', '敏感操作确认', { type: 'warning' })
  twoFactorLoading.value = true
  try {
    const res = await api.post('/api/auth/2fa/disable', { code: twoFactorCode.value })
    applyAuthResponse(res.data)
    twoFactorDrawer.value = false
    twoFactorCode.value = ''
    ElMessage.success('2FA 已关闭，当前会话已刷新')
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, '2FA 关闭失败'))
  } finally {
    twoFactorLoading.value = false
  }
}

const copyTwoFactorSecret = async () => {
  await navigator.clipboard.writeText(twoFactorSetup.secret)
  ElMessage.success('2FA 密钥已复制')
}

const loadViewState = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(stateKey) || '{}')
    if (saved.tab) tab.value = saved.tab
    if (saved.userKeyword) userKeyword.value = saved.userKeyword
    if (saved.userStatus) userStatus.value = saved.userStatus
    if (saved.logFilters) Object.assign(logFilters, saved.logFilters)
    if (saved.loginFilters) Object.assign(loginFilters, saved.loginFilters)
    if (saved.alertFilters) Object.assign(alertFilters, saved.alertFilters)
    if (saved.exportKeyword) exportKeyword.value = saved.exportKeyword
    if (saved.backupStatus) backupStatus.value = saved.backupStatus
    if (saved.logRange?.length) logRange.value = saved.logRange
    if (saved.loginRange?.length) loginRange.value = saved.loginRange
    if (saved.exportRange?.length) exportRange.value = saved.exportRange
    if (saved.backupRange?.length) backupRange.value = saved.backupRange
  } catch {}
}

watch(
  [tab, userKeyword, userStatus, logRange, loginRange, exportRange, backupRange, exportKeyword, backupStatus, () => ({ ...logFilters }), () => ({ ...loginFilters }), () => ({ ...alertFilters })],
  () => {
    if (!stateReady.value) return
    window.localStorage.setItem(stateKey, JSON.stringify({
      tab: tab.value,
      userKeyword: userKeyword.value,
      userStatus: userStatus.value,
      logFilters: { ...logFilters },
      loginFilters: { ...loginFilters },
      alertFilters: { ...alertFilters },
      logRange: logRange.value,
      loginRange: loginRange.value,
      exportRange: exportRange.value,
      backupRange: backupRange.value,
      exportKeyword: exportKeyword.value,
      backupStatus: backupStatus.value
    }))
  },
  { deep: true }
)

const changePassword = async () => {
  try {
    await passwordFormRef.value?.validate()
    saving.value = true
    await api.post('/api/auth/change-password', passwordForm)
    passwordDrawer.value = false
    Object.assign(passwordForm, { oldPassword: '', newPassword: '' })
    ElMessage.success('密码已修改，请重新登录')
  } catch (error) {
    if (error) ElMessage.error(extractErrorMessage(error, '密码修改失败'))
  } finally {
    saving.value = false
  }
}

const openUserDrawer = () => {
  editingUser.value = null
  Object.assign(userForm, { username: '', displayName: '', role: 'readonly', status: 'active', password: '' })
  userDrawer.value = true
}

const editUser = (row) => {
  editingUser.value = row
  Object.assign(userForm, { username: row.username, displayName: row.displayName, role: row.role, status: row.status, password: '' })
  userDrawer.value = true
}

const submitUser = async () => {
  try {
    await userFormRef.value?.validate()
    if (editingUser.value && Number(editingUser.value.id) === Number(currentUser.value?.id) && (userForm.role !== editingUser.value.role || userForm.status !== editingUser.value.status)) {
      ElMessage.warning('不能修改当前登录账号的角色或状态，请使用其他超级管理员账号操作')
      return
    }
    if (editingUser.value?.role === 'super_admin' && editingUser.value?.status === 'active' && (userForm.role !== 'super_admin' || userForm.status !== 'active') && activeSuperAdminCount.value <= 1) {
      ElMessage.warning('不能停用或降权最后一个启用中的超级管理员')
      return
    }
    saving.value = true
    if (editingUser.value) {
      await api.put(`/api/admin/users/${editingUser.value.id}`, userForm)
    } else {
      await api.post('/api/admin/users', userForm)
    }
    userDrawer.value = false
    ElMessage.success('管理员账号已保存')
    fetchUsers()
  } catch (error) {
    if (error) ElMessage.error(extractErrorMessage(error, '管理员账号保存失败'))
  } finally {
    saving.value = false
  }
}

const resetUserPassword = async (row) => {
  const { value } = await ElMessageBox.prompt(`为 ${row.username} 设置新密码`, '重置密码', {
    inputType: 'password',
    inputPlaceholder: '至少 8 位，包含字母和数字',
    confirmButtonText: '确认重置',
    cancelButtonText: '取消',
    inputValidator: (value) => value?.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value),
    inputErrorMessage: '至少 8 位，并包含字母和数字'
  })
  await api.post(`/api/admin/users/${row.id}/reset-password`, { newPassword: value, ...sensitiveConfirmation() })
  ElMessage.success('密码已重置，旧会话已失效')
}

const toggleUserStatus = async (row) => {
  const nextStatus = row.status === 'active' ? 'disabled' : 'active'
  if (Number(row.id) === Number(currentUser.value?.id) && nextStatus === 'disabled') {
    ElMessage.warning('不能停用当前登录账号')
    return
  }
  if (row.role === 'super_admin' && row.status === 'active' && nextStatus === 'disabled' && activeSuperAdminCount.value <= 1) {
    ElMessage.warning('不能停用最后一个启用中的超级管理员')
    return
  }
  await ElMessageBox.confirm(`确认${nextStatus === 'active' ? '启用' : '停用'}账号 ${row.username}？该操作会影响该账号后台菜单、按钮权限和接口访问能力。`, '敏感操作确认', { type: 'warning' })
  await api.put(`/api/admin/users/${row.id}`, {
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    status: nextStatus
  })
  ElMessage.success('账号状态已更新')
  fetchUsers()
}

const createBackup = async () => {
  await ElMessageBox.confirm('确认立即创建数据库备份？本次操作会复制当前数据库文件，并写入备份与操作审计记录。', '敏感操作确认', { type: 'warning' })
  await api.post('/api/admin/backups', sensitiveConfirmation())
  ElMessage.success('数据库备份已创建')
  fetchBackups()
}

const verifyBackupRestore = async (row) => {
  await ElMessageBox.confirm(`确认对备份 ${row.filename} 执行恢复演练？系统会复制备份文件并校验完整性，不会覆盖当前数据库。`, '备份恢复演练确认', { type: 'warning' })
  await api.post(`/api/admin/backups/${row.id}/verify-restore`, sensitiveConfirmation())
  ElMessage.success('备份恢复演练通过：文件完整性和核心表已校验')
  fetchBackups()
  fetchOperationLogs()
}

const exportAuditLogs = async () => {
  await ElMessageBox.confirm('确认导出当前筛选条件下的操作审计日志？导出行为也会写入审计记录。', '审计导出确认', { type: 'warning' })
  exportingAudit.value = true
  try {
    const [startDate, endDate] = rangeParams(logRange.value)
    const res = await api.get('/api/admin/operation-logs/export', {
      params: { ...logFilters, startDate, endDate, ...sensitiveConfirmation() },
      responseType: 'blob'
    })
    const filename = `operation-logs-${new Date().toISOString().slice(0, 10)}.csv`
    const url = URL.createObjectURL(res.data)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    ElMessage.success('审计日志已导出')
    fetchOperationLogs()
  } catch (error) {
    ElMessage.error(extractErrorMessage(error, '审计日志导出失败'))
  } finally {
    exportingAudit.value = false
  }
}

const activeSuperAdminCount = computed(() => users.value.filter((user) => user.role === 'super_admin' && user.status === 'active').length)

onMounted(() => {
  loadViewState()
  stateReady.value = true
  fetchAll()
})
</script>

<style scoped>
.security-command-panel {
  display: grid;
  grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
  gap: 16px;
  margin-bottom: 20px;
  padding: 16px;
  border: 1px solid var(--admin-border);
  border-radius: 20px;
  background:
    radial-gradient(circle at top left, rgba(var(--admin-primary-rgb), 0.14), transparent 34%),
    var(--admin-surface);
  box-shadow: var(--admin-shadow);
}
.security-command-panel.critical { border-color: color-mix(in srgb, var(--admin-danger) 54%, var(--admin-border)); }
.security-command-panel.warning { border-color: color-mix(in srgb, var(--admin-warning) 54%, var(--admin-border)); }
.security-score-card { display: grid; gap: 14px; align-content: space-between; padding: 20px; border: 1px solid var(--admin-border-soft); border-radius: 16px; background: var(--admin-surface-2); }
.security-score-card > span { color: var(--admin-faint); font-size: 12px; font-weight: 900; letter-spacing: 0.14em; }
.security-score-card > strong { color: var(--admin-primary-strong); font-size: 54px; line-height: 1; }
.security-score-card > p { margin: 0; color: var(--admin-text); font-weight: 800; line-height: 1.55; }
.security-score-breakdown { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.security-score-breakdown div { display: grid; gap: 3px; padding: 10px; border-radius: 12px; background: var(--admin-surface-3); }
.security-score-breakdown b { color: var(--admin-text); font-size: 20px; }
.security-score-breakdown small { color: var(--admin-muted); font-size: 11px; }
.security-task-board { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.security-task-card { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 14px; border: 1px solid var(--admin-border-soft); border-left: 5px solid var(--admin-primary); border-radius: 16px; background: var(--admin-surface-2); transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease; }
.security-task-card:hover { transform: translateY(-1px); border-color: var(--admin-hover-border); background: var(--admin-surface-3); }
.security-task-card.danger { border-left-color: var(--admin-danger); }
.security-task-card.warning { border-left-color: var(--admin-warning); }
.security-task-card.done { border-left-color: var(--admin-success); opacity: 0.9; }
.security-task-index { width: 34px; height: 34px; border-radius: 12px; display: grid; place-items: center; color: var(--admin-button-text); background: linear-gradient(135deg, var(--admin-primary), var(--admin-gold)); font-weight: 900; }
.security-task-copy { display: grid; gap: 5px; min-width: 0; }
.security-task-title { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.security-task-title strong { color: var(--admin-text); font-size: 14px; }
.security-task-title span { color: var(--admin-primary-strong); font-size: 12px; font-weight: 900; white-space: nowrap; }
.security-task-copy p,
.security-task-copy small { margin: 0; color: var(--admin-muted); font-size: 12px; line-height: 1.5; }
.readiness-workbench {
  display: grid;
  grid-template-columns: minmax(240px, 320px) 1fr;
  gap: 16px;
  margin-bottom: 20px;
  padding: 16px;
  border: 1px solid var(--admin-border);
  border-radius: 18px;
  background:
    radial-gradient(circle at top left, rgba(var(--admin-primary-rgb), 0.12), transparent 34%),
    var(--admin-surface);
  box-shadow: var(--admin-shadow);
}

.readiness-workbench.critical {
  border-color: color-mix(in srgb, var(--admin-danger) 54%, var(--admin-border));
}

.readiness-workbench.warning {
  border-color: color-mix(in srgb, var(--admin-warning) 54%, var(--admin-border));
}

.readiness-score-card,
.backup-health-card,
.readiness-action-card {
  border: 1px solid var(--admin-border-soft);
  border-radius: 14px;
  background: var(--admin-surface-2);
}

.readiness-score-card {
  display: grid;
  gap: 10px;
  padding: 18px;
}

.readiness-score-card span,
.backup-health-card span {
  color: var(--admin-muted);
  font-size: 12px;
  font-weight: 800;
}

.readiness-score-card strong {
  color: var(--admin-primary-strong);
  font-size: 44px;
  line-height: 1;
}

.readiness-score-card p {
  margin: 0;
  color: var(--admin-text);
  font-size: 14px;
  font-weight: 800;
}

.readiness-score-meta,
.readiness-action-card div {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.readiness-action-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.readiness-action-card {
  display: grid;
  align-content: start;
  gap: 8px;
  padding: 14px;
  transition: border-color 0.18s ease, transform 0.18s ease, background 0.18s ease;
}

.readiness-action-card:hover {
  border-color: var(--admin-hover-border);
  background: var(--admin-surface-3);
  transform: translateY(-1px);
}

.readiness-action-card.critical {
  border-left: 4px solid var(--admin-danger);
}

.readiness-action-card.warning {
  border-left: 4px solid var(--admin-warning);
}

.readiness-action-card.ok {
  border-left: 4px solid var(--admin-success);
}

.readiness-action-card strong,
.backup-health-card strong {
  color: var(--admin-text);
  font-size: 14px;
}

.readiness-action-card span,
.readiness-action-card small,
.backup-health-card small {
  color: var(--admin-muted);
  font-size: 12px;
  line-height: 1.55;
}

.readiness-action-card .el-button {
  justify-self: start;
  border-color: var(--admin-border);
  color: var(--admin-text);
  background: transparent;
}

.backup-health-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-bottom: 20px;
}

.backup-health-card {
  display: grid;
  gap: 6px;
  padding: 14px 16px;
}

.backup-health-card.success {
  border-color: color-mix(in srgb, var(--admin-success) 44%, var(--admin-border));
  background: linear-gradient(135deg, color-mix(in srgb, var(--admin-success) 10%, var(--admin-surface-2)), var(--admin-surface-2));
}

.backup-health-card.warning {
  border-color: color-mix(in srgb, var(--admin-warning) 46%, var(--admin-border));
  background: linear-gradient(135deg, color-mix(in srgb, var(--admin-warning) 10%, var(--admin-surface-2)), var(--admin-surface-2));
}

.backup-health-card.danger {
  border-color: color-mix(in srgb, var(--admin-danger) 48%, var(--admin-border));
  background: linear-gradient(135deg, color-mix(in srgb, var(--admin-danger) 10%, var(--admin-surface-2)), var(--admin-surface-2));
}

.hardening-roadmap {
  display: grid;
  gap: 14px;
  margin-bottom: 20px;
  padding: 16px;
  border: 1px solid var(--admin-border);
  border-radius: 18px;
  background: var(--admin-surface);
  box-shadow: var(--admin-shadow);
}

.roadmap-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.hardening-guard {
  display: grid;
  grid-template-columns: minmax(220px, 300px) 1fr;
  gap: 14px;
  align-items: start;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--admin-warning) 42%, var(--admin-border));
  border-radius: 14px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--admin-warning) 9%, var(--admin-surface-2)), var(--admin-surface-2));
}

.hardening-guard.ready {
  border-color: color-mix(in srgb, var(--admin-success) 42%, var(--admin-border));
  background: linear-gradient(135deg, color-mix(in srgb, var(--admin-success) 9%, var(--admin-surface-2)), var(--admin-surface-2));
}

.hardening-guard > div {
  display: grid;
  gap: 6px;
}

.hardening-guard span,
.hardening-guard li span {
  color: var(--admin-muted);
  font-size: 12px;
  line-height: 1.55;
}

.hardening-guard strong {
  color: var(--admin-text);
  font-size: 15px;
}

.hardening-guard ul {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.hardening-guard li {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 8px 10px;
  border: 1px solid var(--admin-border-soft);
  border-radius: 12px;
  background: var(--admin-surface);
}

.hardening-guard li.ok {
  border-color: color-mix(in srgb, var(--admin-success) 34%, var(--admin-border));
}

.roadmap-head div,
.roadmap-step > div:nth-child(2) {
  display: grid;
  gap: 5px;
}

.roadmap-head span,
.roadmap-step span,
.roadmap-step small {
  color: var(--admin-muted);
  font-size: 12px;
  line-height: 1.55;
}

.roadmap-head strong {
  color: var(--admin-text);
  font-size: 16px;
}

.roadmap-steps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.roadmap-step {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 12px;
  align-items: start;
  padding: 14px;
  border: 1px solid var(--admin-border-soft);
  border-radius: 14px;
  background: var(--admin-surface-2);
}

.roadmap-step.done {
  border-color: color-mix(in srgb, var(--admin-success) 42%, var(--admin-border));
}

.roadmap-step.danger:not(.done) {
  border-color: color-mix(in srgb, var(--admin-danger) 46%, var(--admin-border));
}

.step-index {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 999px;
  color: var(--admin-text);
  font-size: 13px;
  font-weight: 900;
  background: var(--admin-surface-3);
  border: 1px solid var(--admin-border);
}

.roadmap-step.done .step-index {
  color: #fff;
  background: var(--admin-success);
  border-color: var(--admin-success);
}

.step-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.step-title-row strong {
  color: var(--admin-text);
  font-size: 14px;
}

.roadmap-step .el-button {
  grid-column: 2;
  justify-self: start;
  border-color: var(--admin-border);
  color: var(--admin-text);
  background: transparent;
}

@media (max-width: 1100px) {
  .security-command-panel,
  .security-task-board,
  .readiness-workbench,
  .backup-health-strip,
  .hardening-guard,
  .hardening-guard ul,
  .roadmap-steps {
    grid-template-columns: 1fr;
  }

  .security-task-card {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .security-task-card .el-button {
    grid-column: 2;
    justify-self: start;
  }

  .readiness-action-list {
    grid-template-columns: 1fr;
  }
}

.readiness-panel {
  margin-top: 16px;
  padding: 14px;
  border: 1px solid var(--admin-border-soft);
  border-radius: 14px;
  background: var(--admin-surface-2);
}

.readiness-panel.critical {
  border-color: color-mix(in srgb, var(--admin-danger) 48%, var(--admin-border));
  background: linear-gradient(135deg, color-mix(in srgb, var(--admin-danger) 9%, var(--admin-surface-2)), var(--admin-surface-2));
}

.readiness-panel.warning {
  border-color: color-mix(in srgb, var(--admin-warning) 48%, var(--admin-border));
  background: linear-gradient(135deg, color-mix(in srgb, var(--admin-warning) 9%, var(--admin-surface-2)), var(--admin-surface-2));
}

.readiness-panel.ready {
  border-color: color-mix(in srgb, var(--admin-success) 46%, var(--admin-border));
  background: linear-gradient(135deg, color-mix(in srgb, var(--admin-success) 9%, var(--admin-surface-2)), var(--admin-surface-2));
}

.readiness-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.readiness-head span {
  color: var(--admin-muted);
  font-size: 12px;
  font-weight: 800;
}

.readiness-head strong {
  color: var(--admin-primary-strong);
  font-size: 24px;
  line-height: 1;
}

.readiness-panel p {
  margin: 0 0 10px;
  color: var(--admin-text);
  font-size: 13px;
  font-weight: 700;
}

.readiness-panel ul {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.readiness-panel li {
  display: grid;
  gap: 4px;
  padding: 10px;
  border: 1px solid var(--admin-border-soft);
  border-radius: 12px;
  background: var(--admin-surface);
}

.readiness-panel li.critical {
  border-left: 3px solid var(--admin-danger);
}

.readiness-panel li.warning {
  border-left: 3px solid var(--admin-warning);
}

.readiness-panel li strong {
  color: var(--admin-text);
  font-size: 13px;
}

.readiness-panel li span,
.readiness-panel li small {
  color: var(--admin-muted);
  font-size: 12px;
  line-height: 1.5;
}
</style>
