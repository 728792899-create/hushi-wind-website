# 安全加固记录

按“企业级交付”标准逐步收口的安全与工程门禁。每一步独立提交、可单独回滚。已完成步骤在开发分支同步；本文不代表生产部署或生产验收。

## 第 0 步 · 依赖漏洞清零与构建门禁（2026-10-12）

基线：`codex/admin-core-redesign` 本地 9 月工作（98 项测试通过），但 `npm run quality` 因依赖审计失败：API 2 项（含 critical `proxy-addr`，信任代理时可伪造来源 IP，影响登录锁定与限流）、后台 3 项 high（含 Vue SSR XSS）、官网 25 项。

### 改动

- **API**：`npm audit fix`（`multer` 2.4、`proxy-addr` 2.0.8），生产审计 0。
- **API**：新增 `postinstall: prisma generate`。原 CI 用 `npm ci --prefix aural-api` 安装，Prisma 按调用目录找 schema 而跳过生成，`npm test` 会有 32 项因客户端未初始化失败。安全部署脚本本就 `--include=dev` 安装，不受影响。
- **后台**：`vue` ^3.5.43 及审计修复，生产审计 0。
- **官网**：`nuxt` ^4.6.1、`vue` ^3.5.43；`@nuxtjs/tailwindcss` 仅构建期使用，移入 devDependencies。
- **官网审计门禁**：剩余 6 项 high/critical（`simple-git`、`node-forge`、`braces`）只存在于 `nuxt dev`/构建工具链，上游无修复版本。`audit:prod` 改为 `scripts/audit-runtime.js`：每项都须在 `audit-exceptions.json` 登记评估理由与到期日（最长 90 天），到期即失败；任何漏洞包出现在 `.output/server/node_modules`（实际交付物）即失败，无论是否登记。
- **BOM**：去除 13 个源文件开头和 2 个 API 脚本第 2 行的 U+FEFF。新增 `npm run check:bom` 防止回归。Prisma 已应用迁移保留原样，改写会改变 `migrate deploy` 校验的 checksum。
- **`quality`**：顺序调整为 BOM → API 检查与审计 → 后台审计与构建 → 官网构建 → 官网运行时审计。

### 验证

- npm 10.9.2 下三端 `npm ci --prefix` 全新安装成功；`npm test`：API 56、后台 33、官网 9，共 98 项通过。
- `npm run quality` 通过：API/后台生产审计 0；官网 6 项已登记且未进入 `.output`（扫描 24 个运行时包）。
- 门禁反向验证：漏洞包放入 `.output`、例外过期、例外缺失三种情况均失败；带 BOM 的新文件被 `check:bom` 拦截。
- 浏览器：开发模式产品目录挂载、搜索实时过滤（4→1）；生产构建首页、产品目录、产品详情、服务支持、新闻、艺术家均挂载且无控制台错误；后台登录后工作台、产品、官网内容、客户咨询、素材、设置六页渲染正常、无错误。
- 开发模式控制台有一条 CSP 拦截 DevTools blob worker 的报错，生产构建不出现，未处理。

### 未覆盖

未运行生产 TLS/代理环境；未在 GitHub Actions 上实际执行；例外到期日 2027-01-09，需在此之前复核上游。

## 第 1 步（上）· 后台会话空闲超时与绝对时长（2026-10-12）

### 现场复核

- CSV 导出已有公式注入防护（`lib/security.js` 的 `csvCell`），生产密码策略已为 12–64 位含大小写、数字、符号：本步不改。
- **缺陷**：会话默认 12 小时且无空闲超时；后台 `App.vue` 按定时器无条件续期，每次签发全新 12 小时 token。只要标签页开着，会话永不过期，人离开电脑也一样。

### 改动

- **API**：token 增加 `auth`（登录时间）。有效期取 `min(当前 + ADMIN_IDLE_TIMEOUT_MS, auth + ADMIN_TOKEN_TTL_MS)`；续期与 2FA 开关沿用原 `auth`，绝对时长到后无法续期。旧 token 以 `iat` 作为登录时间，同样受绝对时长约束。登录、会话、续期、2FA 响应返回实际剩余秒数、`idleTimeout` 与 `sessionExpiresAt`。默认空闲 30 分钟、绝对 12 小时，`.env.production.example` 已说明。
- **后台**：新增 `lib/sessionIdle.js`。按键、点击、滚轮、触摸、滚动记为操作（5 秒节流），写入 localStorage，与 token 一样跨标签页共享。每秒判断一次：有操作则续期（至少间隔 1 分钟；进入提醒区间时立即续期）；无操作在到期前 2 分钟弹出倒计时，可“继续使用”或“退出登录”；到期后锁定为登录页并保留编辑内容（沿用原有“重新登录可继续”机制）；达到绝对时长前提示保存。

### 验证

- 新增 API 测试 4 项（真实计时：空闲 1.5 秒、绝对 4 秒），覆盖无操作过期、续期顺延且保留登录时间、持续续期仍在绝对时长被拒、过旧登录时间拒绝。改动前的 `server.js` 上 4 项全部失败。
- 新增后台单元测试 5 项，覆盖 token 解码（含中文用户名）、续期条件与频率、提醒与到期、绝对时长封顶、操作记录节流与解绑。
- 浏览器（API 空闲设为 140 秒）：登录后 token 寿命 140 秒；无操作 31 秒出现倒计时弹窗；点“继续使用”续期且登录时间不变；继续无操作至到期，自动回到登录页，提示“长时间未操作，已自动退出”，编辑页面保留在内存；持续操作 42 秒内自动续期、零提醒。浏览器测试发现短空闲配置下“先提醒后续期”的问题，已修正并补测试。
- `npm test`：API 60、后台 38、官网 9，共 107 项通过；`npm run quality` 通过。

## 第 1 步（下）· 客户联系方式逐条查看与留痕（2026-10-12）

### 现场复核

- 无 `crm:private` 的账号看到的联系方式与内部备注已隐藏；审计日志写入前对 CRM 数据脱敏。
- **缺陷**：有 `crm:private` 的账号打开咨询或艺术家申请列表时，所有客户的完整手机号、邮箱随列表一次性下发，更新咨询的响应也会回传完整联系方式，查看行为不留记录。原有测试未覆盖。

### 改动

- **API**：咨询、艺术家申请列表与咨询更新响应一律隐藏联系方式（`contactInfo`；`email`、`phone`）。内部备注、作品集链接对有权限的账号保持可见，不影响跟进。更新接口本就不接受修改联系方式，隐藏不会回写。
- **API**：新增 `POST /api/inquiries/:id/contact`、`POST /api/artist-applications/:id/contact`，需 `crm:private`。先写 `VIEW_CONTACT` 操作记录（操作人、角色、记录 ID、IP），再返回联系方式；审计写入失败则不返回。响应 `Cache-Control: no-store`。审计记录本身不含联系方式。
- **后台**：咨询详情默认显示“已隐藏 / 查看联系方式”，查看后提示“本次查看已记入操作记录”；切换记录或关闭抽屉后恢复隐藏，迟到的响应不会显示到其他记录上。

### 验证

- 新增 API 测试 5 项：有/无私密权限的列表隐藏、更新响应不回传且库内值不变、逐条查看与审计内容、无权限 403 且不留记录、审计失败不返回联系方式。改动前的 `server.js` 上 5 项全部失败。
- 浏览器：咨询列表页面不含手机号；详情点击后显示并提示已记录；关闭重开恢复隐藏；操作记录出现“查看咨询联系方式”；艺术家申请同样生效。此步验证在 `~/Projects` 副本的 `dev.db` 中写入了 3 条查看记录，不涉及原 iCloud 目录。
- `npm test`：API 65、后台 38、官网 9，共 112 项通过；`npm run quality`、`check:admin-ui` 通过。

### 后续可选

按账号限制单位时间查看次数并在异常时告警；导出含联系方式的数据走审批。当前未实现。

## 第 2 步 · 全部内容保存的版本冲突保护（2026-10-12）

### 现场复核

- 已有保护：产品直接保存、咨询跟进（`If-Match`，409/428）；修改草稿的保存、预览、发布（草稿版本 + 官网内容哈希）。
- **缺陷**：新闻、艺术家、全局配置、8 类服务栏目（FAQ、资料下载、音响方案、音响指标、品牌历程、生态服务、快速指南、页面内容）的直接保存不校验版本，后保存者无提示覆盖先保存者（交接文档历史风险 3）。其中 7 类栏目没有可作版本的字段，新闻的 `updatedAt` 可为空。
- 附带问题：版本检查通过后被并发写入抢先时返回 404“数据不存在”；保存冲突后列表不刷新，按提示“重新打开”仍拿到旧数据（产品页同样存在）。

### 改动

- **数据库**：迁移 `20261012090000_content_revision` 为 11 张内容表新增 `revision INTEGER NOT NULL DEFAULT 0`，仅新增列。
- **API**：Prisma 客户端扩展使这 11 张表的任何 `update/updateMany/upsert` 都递增 `revision`（覆盖直接保存、草稿发布、历史与回收站恢复、素材地址替换、系列改名联动），不依赖各接口自行记得。咨询不纳入（标记已读不应使跟进表单失效），仍显式递增。四个直接保存接口改用 `recordVersionWhere` + 条件更新；新增 `updateWithVersion` 把条件不匹配（P2025）转为 409 `RECORD_CHANGED`，产品、咨询与草稿发布同样改用它。
- **后台**：新闻、艺术家、栏目打开编辑时记录版本，保存带 `If-Match`；冲突时保留弹窗与输入，后台刷新列表，关闭后重新打开即为最新内容（产品页同样修复）。全局配置保存后同步新版本；冲突时询问“加载最新配置 / 保留当前输入”，不自动冲掉输入。

### 接口变更

`PUT /api/articles/:id`、`/api/artists/:id`、`/api/config`、`/api/<8 类栏目>/:id` 需携带 `If-Match: <revision>`（或请求体 `revision`）：缺失 428，过期 409。列表与详情返回的数据已包含 `revision`。仓库内运维与验收脚本只直接修改产品，已带版本，无需改动。上线须先执行 `prisma migrate deploy`，再启动新 API 与后台。

### 验证

- 新增 API 测试 5 项：10 类资源逐一验证正确版本 200 且 `revision+1`、过期 409、缺失 428、库内保留第一位编辑；全局配置；草稿发布与历史恢复后旧表单 409（快照中的旧 `revision` 不会回退版本）；同版本并发两次保存恰好一个 200、一个 409；条件更新映射。改动前代码上 5 项全部失败。原有测试辅助函数为普通 PUT 自动带当前版本，与后台行为一致。
- 浏览器：新闻编辑弹窗打开后，另一管理员先保存；本人保存提示冲突，弹窗与输入保留，列表已刷新为对方内容；放弃后重新打开显示最新内容，再保存成功。全局配置冲突弹出选择框，加载最新后保存成功，连续第二次保存不误报冲突。
- 副本 `dev.db` 迁移前已备份；迁移后 11 张表原有字段逐行一致。验证中修改的演示新闻标题已改回原值。
- `npm test`：API 70、后台 38、官网 9，共 117 项通过；`npm run quality`、`check:admin-ui` 通过。

### 后续可选

冲突时展示双方差异并逐字段合并；当前为保留输入 + 重新打开核对。

## 第 3 步 · 后台设计令牌、对比度与显示格式（2026-10-12）

### 现场复核

9 月版本已是单一浅色主题，变量体系基本成形（23 个 `--admin-*`，211 处 `var()`）。剩余问题：

- Element Plus 只覆盖了状态色基础值，标签、提示框的浅底与边框仍用框架默认色梯度（如危险标签粉底 `#fef0f0`），与后台色板混用；`info` 与 `error` 未覆盖：信息标签对比度 2.80、错误提示框文字 2.61，低于 WCAG AA 4.5。
- 警告色文字 4.05（标签上 3.78），次要文字在侧栏底色上 4.46；头像字母 4.46、设置导航选中项 4.21。
- `:root` 外约 40 处颜色字面量（含 8 位十六进制、rgba），多为已有令牌的重复值；Element Plus 变量重复书写同一色值；`--admin-gold-rgb` 与 `--admin-gold` 不一致；登录品牌区一条未生效的 `color: #fff`。
- 时间用 `toLocaleString()`，随浏览器语言变化；金额 `¥ 12800.00` 无千分位。

### 改动

- **令牌**：`:root` 成为唯一颜色来源。Element Plus 变量引用 `--admin-*`；为 primary/success/warning/danger/info 补齐 light-3/5/7/8/9 与 dark-2（按 Element Plus 算法生成），`--el-color-error` 指向 danger。警告色 `#a5752c→#8c6224`、次要文字 `#607181→#556677`、信息色 `#5c6b79`；新增选中底、强边框、遮罩、阴影、装饰色等令牌。主色、成功、危险不变。
- **替换**：`style.css` 与素材页棋盘格背景的全部字面量改为令牌；头像字母与设置导航选中项改用深主色；面包屑分隔符标为 `aria-hidden` 并使用装饰色。
- **格式**：`formatTime` 固定为 `YYYY-MM-DD HH:mm`（本地时区），`formatMoney` 输出 `¥12,800.00`，空值统一 `—`；产品列表、表格与版本摘要使用 `formatMoney`。
- **守卫**：`npm run check:admin-colors` 检查 `style.css`（除 `:root`）、`.vue` 的 `<style>` 与内联 `style`，禁止十六进制、`rgb()/hsl()` 字面量（允许 `rgba(var(--…-rgb), α)`），已接入 `quality`。`<script>` 中的业务数据色值（如首页背景色配置）不在检查范围。

### 验证

- 色板测算：五类状态色在白底、页面底、各自 light-9 浅底上均 ≥ 4.65；次要文字在全部 6 种底色上 ≥ 4.71。
- 浏览器逐元素对比度扫描（按文字实际颜色与叠加后的背景计算，大字号阈值 3:1）：工作台、产品、官网内容、新闻、客户咨询、素材、设置、使用帮助 8 页共 638 处文字，以及产品编辑弹窗 66 处、咨询详情抽屉 30 处，全部达标，最低 4.65。第一次扫描发现本步把 `--admin-faint` 改成装饰色导致侧栏标题与表单提示降到 2.1–2.4，已恢复为文字色并单独新增 `--admin-decor`。
- 渲染核对：危险、警告、信息标签与错误、警告提示框均使用后台色板；产品价格显示 `¥12,800.00` 等；咨询时间显示 `2026-09-13 18:04`，无旧格式残留。
- 守卫反向验证：在视图 `<style>`、模板内联样式和 `style.css` 中加入十六进制、`rgba()`、`hsl()` 均被拦截。
- `npm test`：API 70、后台 40、官网 9，共 119 项通过；`npm run quality`、`check:admin-ui` 通过。

### 未改动（需产品决定）

咨询状态“待联系”与优先级“紧急”同用危险色；是否将“待联系”改为警告或主色，属于业务语义选择，本步未改。


## 第 4 步 · 布局与可用性（2026-10-12）

### 现场复核

- 从 `8a3c5f6` 接手并保留 6 个未提交源码文件；重新核对远端分支与该提交的成功 CI。仅使用 `~/Projects/hushi-wind-website`，未访问 iCloud 原目录或其他项目。
- 三个本地服务：API `1337`、官网 `3100`、后台 `5175`。后台覆盖 10 页、5 类编辑/上传弹窗、素材管理和咨询详情抽屉。桌面 1440×1000，手机 390×844 并启用 coarse pointer；检查实际 `clientWidth`，避免浏览器缩放和手机自动缩小掩盖溢出。
- 交接中的上传按钮名称、发布状态筛选、素材复选框名称与帮助链接尺寸改动有效。进一步发现：三处分页条数 combobox 无可读名称；素材分类计数 `opacity:.7` 导致 2.70–3.15:1；手机品牌配置操作栏撑宽到约 447px；素材抽屉两类 `small` 实际为 11.67px；抽屉关闭按钮高 22px、文件链接与折叠摘要高约 22.4px。

### 改动

- `aural-admin/src/style.css`：将原 9/10/11px 文本提高到 12px；增加读屏专用 `.visually-hidden`；帮助/工作台独立链接、素材地址链接和摘要最小高 24px，粗指针为 44px；抽屉关闭按钮至少 32×32px、粗指针为 44×44px；窄屏配置工具栏允许换行。
- `components/ImageUpload.vue`：可读名称放在真正可聚焦的 `.el-upload[role=button]`，包含所在表单项名称，支持显式 `label`，挂载与组件更新后同步。
- `views/ProductsView.vue`、`ArticlesView.vue`、`CmsView.vue`：状态筛选增加“发布状态”名称；分页的 `sizes` 换成默认插槽中带“每页显示条数”名称的选择框。保留 10/20/50/100、原分页状态、原重置首页与加载函数，以及手机隐藏页大小选择的规则。框架内置 sizes 没有名称透传接口，现有中文 locale 无法解决。
- `views/ResourcesView.vue`：复选框用关联 label 中的隐藏文本命名；删除分类计数透明度，保留原色板；命名提示与引用说明显式使用 12px。
- `CODEX_HANDOFF.md`：纳入交接文档，更新第 4 步完成内容与下一步入口。未修改业务状态含义、品牌资料、API、数据库结构或生产配置。

### 测试和反向验证

- 最终源码 `npm test`：API 70、后台 40、官网 9，共 **119 项通过，0 跳过**。
- `npm run quality`、`npm --prefix aural-admin run check:admin-ui`、`npm run check:admin-colors`、`npm run check:bom` 全部退出 0；UI 守卫检查了真实构建产物。API/后台生产依赖审计 0；官网 6 项已登记的工具链例外未进入 24 个运行时包。该轮 BOM 检查覆盖 194 个已跟踪文件；当时尚未纳入版本管理的交接文档未被扫描，首次 CI 的补充发现与修复见下文。
- 在本地浏览器临时恢复旧缺陷：配置工具栏禁用换行，检测到 `scrollWidth=447 > clientWidth=390`；素材计数恢复 `.7` 透明度，检测到 7 项对比度失败；去掉分页 aria-label，AX 树检测到无名称 combobox。每次均重新加载清除临时覆盖，复测归零；未把反向验证改动写入源码。
- 键盘将产品、新闻、栏目每页条数改为 10，实际 GET 请求分别包含 `page=1&pageSize=10`，随后恢复 20。素材复选框空格键 `0→1→0`，标签保持 36×32px、卡片左上角位置不变。素材抽屉折叠摘要已用 Enter 展开，关闭按钮已用 Enter 关闭。
- 两轮独立只读代码审查均完成，最终无可执行发现；`git diff --check` 通过。

### 浏览器证据

- 20 个页面状态累计 **1,277 处文字、732 个交互目标**；整页宽度分别为 1440/390，无非滚动容器溢出；可见文字不小于 12px；启用控件目标不小于 24px；可用表单/按钮/链接在 AX 树中均有名称。按真实文字颜色、祖先背景与透明度叠加计算，并包含输入提示文字，最低 **4.61:1**。
- 5 类弹窗（产品、新闻、艺术家、栏目、素材上传）及 2 类抽屉在双视口复核，包含展开产品各编辑区和素材地址/保留引用区；无溢出、名称、字号或文字对比度失败。手机弹窗宽 358px，左右各 16px；抽屉限制为屏幕宽度。关闭按钮扩大后未与标题重叠。
- 手机 `.help-back`、`.help-shortcuts a`、`.help-actions a` 和工作台独立链接实测高 44px；素材卡片隐藏标签未改变选择框位置，移动操作按钮与侧栏字标未溢出。设置导航保留容器内部横向滚动，不计作整页溢出。
- 后台扫描期间未见控制台 error；官网首页完成加载冒烟检查，API 健康检查与官网首页 HTTP 200。官网未纳入本步后台全页无障碍扫描。咨询抽屉未查看隐藏联系方式、未保存，前后 Inquiry 全行哈希一致；没有编辑演示业务数据。

| 页面 | 桌面文字 / 控件 | 手机文字 / 控件 | 两端最低文字对比度 |
|---|---:|---:|---:|
| 工作台 | 66 / 30 | 46 / 23 | 5.18:1 |
| 产品 | 63 / 28 | 44 / 24 | 5.06:1 |
| 首页与品牌 | 61 / 39 | 50 / 32 | 5.18:1 |
| 新闻动态 | 61 / 31 | 56 / 27 | 4.65:1 |
| 艺术家 | 51 / 29 | 42 / 22 | 5.18:1 |
| 服务与栏目 | 61 / 31 | 43 / 26 | 5.06:1 |
| 客户咨询 | 49 / 21 | 24 / 14 | 4.70:1 |
| 素材 | 187 / 122 | 176 / 115 | 4.65:1 |
| 设置 | 38 / 25 | 27 / 18 | 4.80:1 |
| 使用帮助 | 72 / 41 | 60 / 34 | 4.61:1 |

本地证据（`logs/` 已忽略，不推送截图中的演示数据）：`logs/step4-20261012/final-matrix.json`、`rollup.json`、`audit-results.json`、`dom-audit.js`、`interaction-evidence.json`、`final-*.png`、`accepted-mobile-resource-drawer.png`、`accepted-*-overview.jpg`、`final-{npm-test,npm-quality,check-admin-ui,check-admin-colors,check-bom}.log`。全页截图中的固定抽屉会随滚动位置出现在文档中部，抽屉验收使用页面顶部重新采集的当前视口截图。

### 提交验收与未覆盖

- 本步单独提交并推送到 `codex/admin-core-redesign`；推送后用本步完整 commit SHA 查询 GitHub Actions `Quality`，只有该 SHA 的运行成功才完成交付，结果在本次交付回复提供。
- 无生产部署、生产数据操作或真实通知发送；浏览器结果属于本地 Chromium 模拟，未声称完成真机触屏、VoiceOver 或完整 WCAG 认证。
- 官网构建仍有不阻断的 `NUXT_B7027`（`tailwindcss/nesting` 入口不可加载）警告；官网工具链例外到期日仍为 2027-01-09。咨询状态颜色与管乐品牌真实资料继续待用户决定，均未改动。
- 下一步为第 5 步「权限与审计增强」：先复核 RBAC 与审计实现，数据范围与审批规则涉及业务含义时先确认，再按同样门禁逐步交付。

### 首次 CI 发现与追加修复

- 主提交 `9d843dddc447f3de675317b9d75d123194aa9940` 已普通推送。[首次 Quality 运行](https://github.com/728792899-create/hushi-wind-website/actions/runs/38270373746) 在 `check:bom` 失败：新纳入版本管理的 `CODEX_HANDOFF.md` 第 62 行引用示例含一个真实 `U+FEFF` 字符，并非文件头 BOM。
- 现场复现：`npm run check:bom` 返回 1，唯一违规文件同上。守卫用 `git ls-files` 枚举文件，因此之前 194 个已跟踪文件检查通过不能证明新增交接文档通过。
- 最小修复：仅将交接文档示例中的不可见字符改成可见的 `\uFEFF` 字面文本，保留原意；补充本记录，不修改守卫范围、应用源码、数据或配置。采用追加提交，不改写已推送历史。
- 应用源码与浏览器验收对象未变，复用上面的 390/1440 浏览器证据；追加修复后 `npm test` 再次 119 项通过、0 跳过，`quality`、`check:admin-ui`（含构建产物）、`check:admin-colors` 和 `check:bom` 全部退出 0，BOM 明确覆盖 195 个已跟踪文件。独立只读复核无可执行发现。日志为 `logs/step4-20261012/ci-fix-*.log`，首次 CI 失败日志为同目录 `ci-initial-failure.log`；最终仍须核对追加提交完整 SHA 的 CI 成功结果。


## 第 5 步 · 权限与审计增强（2026-10-12）

### 目标、现场复核与业务确认

- 在 `~/Projects/hushi-wind-website`、`codex/admin-core-redesign` 复核交接、完整修复记录、工作区与远端；接手基线 `dd4e7285e479fd8e146ac3c1c83784b5cfe06025`，其 Quality run `38270992275` 成功。无既有未提交改动。
- 现有 RBAC 限制了操作类型，但客服可读写全部咨询，负责人仅作筛选；回收列表/恢复同样缺少本人范围。逐条联系方式已有先审计再返回，但没有账号级异常频率告警。`OperationLog` 可更新/删除，没有完整性校验。
- 独立复核还发现：无 `crm:private` 的操作日志 CSV 中 `target` 与列表脱敏不一致；CRM 回收恢复响应直接返回联系方式。新版设置没有告警处理和完整性校验入口。
- 用户明确确认：**客服只处理分配给自己的咨询；未分配、重新分配由超级管理员负责；艺术家申请保持现状**。只读角色继续读取全部已脱敏咨询，运营角色仍无 CRM 权限。
- 用户明确确认：**每账号 10 分钟达到 30 次联系方式查看只告警、不阻断**，咨询与艺术家申请合并、重复查看也计数，超级管理员适用相同规则；窗口和阈值可配置。
- 用户明确确认：**保持不开启含个人信息的咨询导出，本步只修复既有日志导出的脱敏一致性**。因此未新增审批或水印流程，不把该能力记作完成。

### 改动文件与行为

- `aural-api/lib/crm-scope.js`（新增）、`server.js`、`lib/content-workflows.js`：统一按服务端账号生成咨询范围，通过 AND 合并客户端筛选；列表/总数、联系方式、已读、跟进时间线、保存、删除、工作台待办、回收列表/总数和恢复均覆盖。恢复再次检查快照归属。客服只能取得自己的负责人选项；分配/清空负责人仅超管可做，已有客服表单保存相同负责人仍可用。
- `aural-admin/src/views/CrmView.vue`：客服显示本人范围提示，负责人控件禁用；为现场发现无名称的艺术家申请状态选择框增加可读名称。不改申请的共享权限或状态含义。
- `aural-api/lib/contact-monitor.js`（新增）、`server.js`、`.env.production.example`：基于持久化 `VIEW_CONTACT` 审计记录按账号计数，不按 IP/session 拆分。默认 `CONTACT_VIEW_WINDOW_MS=600000`、`CONTACT_VIEW_ALERT_THRESHOLD=30`，非法配置回落默认。审计追加持有事务写锁，告警在同事务查询/去重；同一账号窗口内已有告警（含已处理）不会重复创建。告警仅含账号、次数、阈值、时间窗，无客户联系方式。告警写入失败不阻断查看（本地故障注入可见诊断，生产沿用现有静默返回策略）；审计写入失败仍不返回联系方式，响应仍 `no-store`。
- `aural-api/lib/audit-integrity.js`（新增）、`prisma/schema.prisma`、迁移 `20261012170000_audit_integrity_and_inquiry_scope`：新增历史基线状态和新日志 SHA-256 链表；迁移固定原日志边界，新版启动首次计算并封存历史摘要，保留所有原日志字段。OperationLog/AuditLogEntry 禁止 UPDATE、DELETE、REPLACE；状态不可删除/替换，已封存基线不可修改。日志行、链节点、链头同事务追加，使用数据库写锁串行化，沿用已有业务事务。新增咨询归属索引并从合法回收快照回填。
- `aural-api/scripts/verify-audit-integrity.js`（新增）、`package.json`、`server.js`：新增只读 `npm run check:audit` 与 `GET /api/admin/audit-integrity`（沿用 `logs:read`）；启动及手动/CLI 全量校验历史摘要、链、条数和触发器，损坏非零退出/API 409；追加只核对链尾，避免每次重扫历史。不会自动重签损坏数据。
- `aural-api/scripts/brand-cleanup.js`：旧直接写操作日志的维护路径改为同事务追加审计，失败不吞掉；**本步没有运行这个脚本，没有修改品牌内容**。
- `server.js`：操作日志列表与 CSV 共用同一可见字段转换，无 `crm:private` 时 CRM `target` 为通用客户记录、before/after 不下发；`content-workflows.js` 的 CRM 恢复响应隐藏联系方式，库内原值保留。
- `aural-admin/src/views/SettingsView.vue`：新增安全告警分页、桌面表格/手机卡片，沿用 `logs:read` 查看、`alerts:write` 处理；按钮防重复、失败保留状态。操作记录新增完整性校验和中文结果；重新校验先清旧成功，切栏目后迟到响应失效；补齐“操作记录栏目”选择框名称。不展示内部摘要值、不声称证明历史真实性。
- 回归测试文件：`aural-api/tests/{crm-scope,audit-integrity}.test.js`（新增）、`crm-contact-privacy.test.js`、`backend-integration.test.js`、`aural-admin/tests/editor-interactions.test.mjs`。同步本记录与 `CODEX_HANDOFF.md`；未改业务颜色、品牌材料、生产环境配置值。

### 测试、反向验证与迁移演练

- 最终源码 `npm test`：**148 项通过，0 失败、0 跳过**（API 94、后台 45、官网 9）。`npm run quality`、`check:admin-ui`（`distChecked=yes`，25 个真实构建静态文件）、`check:admin-colors`、`check:bom` 全部退出 0。BOM 原已跟踪范围 195 文件通过，另扫 207 个已跟踪/新增源码、配置、文档（含新迁移）均无不可见字符；提交前暂存后再次运行 BOM 门禁，201 个已跟踪源文件通过，证据为 `final-staged-bom.log`。
- API 范围回归覆盖两客服/未分配、伪造负责人筛选、按 ID 绕过、分配/撤销、回收筛选/分页/恢复、艺术家申请保持共享；拒绝越权后数据/审计无非法变化。隐私两项新增回归在旧实现真实失败，修复后全部通过，恢复响应脱敏但数据库原值不变。
- 真实 SQLite 完整性测试 11 项：历史迁移、8 次跨连接并发追加、业务事务回滚、UPDATE/DELETE/REPLACE 拦截；故意破坏历史、中段、尾部、插入无链日志、移除保护触发器或状态均被检出；CLI 损坏非零退出，原登录记录清理不受影响。
- 告警边界测试以阈值 3 提高效率：预热 2 次后 6 个并发请求全部 200，仅一条告警，8 条查看审计且链通过；同进程两个 API 实例、两个独立 Prisma 连接共享 SQLite 重测通过（未声称真实双进程压测）。用触发器强制告警插入失败，查看仍 200、审计和链各增加 1；超管达到阈值同样告警，继续查看成功、不重复。测试后配置/故障触发器恢复。
- 数据迁移仅在 `dev.db` 的 SQLite 备份副本 `logs/step5-20261012/migration-rehearsal.db` 执行。逐表比对 **32 张原表的全部原字段/逐行内容一致**；44 条原操作日志建立基线后 CLI 校验通过（新增链条目 0）。原 `aural-api/prisma/dev.db` 和原三个服务未迁移、未重启，未写原演示业务数据。
- 两轮独立只读审查与最终验证证据复核完成，无未决 P1/P2；`git diff --check` 通过。

### 浏览器证据

本步使用独立合成数据 API `18337` / 后台 `15175`，通知渠道为空，避免改变原演示数据。实际视口 1440×1000 / 390×844，手机启用 coarse pointer。

- 客服甲只看本人咨询，负责人不能修改。默认配置下先通过本地接口预热 29 次，第 30 次由真实浏览器点击查看，联系方式仍成功显示且提示已审计；管理员安全告警显示“最近 10 分钟查看 30 次，仅告警，未阻断”。点击处理后状态持久显示“已处理”。
- 超管通过 UI 将未分配咨询分给甲，甲刷新后出现；甲保留原咨询抽屉期间将原咨询改派乙，甲再次查看联系方式被拒、没有出现手机号，保存也被拒。刷新后原咨询消失；乙重新登录能看到原有咨询与接手咨询共 2 条，无甲现有咨询。艺术家申请仍可见。
- 只读账号继续看到 3 条已脱敏咨询，详情显示“当前账号无查看权限”、编辑控件禁用；安全告警只有查看入口，无处理按钮。管理员和只读账号均能沿用日志读取权限校验完整性；最后显示 33 条记录通过（本地合成库）。
- 完整性反向验证仅在合成库移除一个保护触发器：浏览器收到 409 中文校验失败，旧“校验通过”消失；恢复原触发器后再次校验通过，未改任何日志内容。
- 最终受影响状态（咨询列表/抽屉、告警、完整性校验、申请列表）未见整页溢出、小于 12px 可见文字、小于 24px 启用目标、无名称控件或文字对比度失败；稳定最终扫描最低 4.70:1。首次扫描出现导航颜色过渡态 4.46，等待动画结束后复测通过；初次操作记录和申请筛选的名称缺陷已修复并复测。没有覆盖官网全站或真机/VoiceOver认证。
- 原 API `/health`、官网首页只读冒烟均 HTTP 200。收口浏览器控制台 warn/error 查询为空；预期的越权/完整性失败属于负向测试结果。验收后已恢复浏览器正常视口，保留只读告警演示页。

本地证据在忽略目录 `logs/step5-20261012/`，不提交数据库、凭据或截图：`final-{npm-test,npm-quality,check-admin-ui,check-admin-colors,check-bom}.log`、`final-bom-all-files.log`、`privacy-{baseline,fixed,integrated}.log`、`contact-monitor-api.log`、`contact-two-instances.log`、`migration-{before,after}.json`、`migration-deploy.log`、`migration-audit-check.json`、`browser-audits.json`、`browser-console.json`、`browser-workflows.json`；截图包括 `support-drawer-mobile.png`、`alerts-{mobile,desktop}.png`、`integrity-{mobile,desktop}.png`、`integrity-negative-mobile.png`、`revoked-stale-drawer.png`、`recipient-support-desktop.png`、`readonly-alerts-mobile.png`。

### 提交、生产状态与限制

- 本步独立提交并普通推送到 `codex/admin-core-redesign`。推送后以本步完整 SHA 核对 GitHub Actions `Quality`，结果在交付回复提供，并保留 `ci-result.json`。不能把此前基线 CI 或本地门禁当作本提交 CI。
- **无生产部署、生产数据库操作、真实通知发送**。原本地演示服务保留；当前验收库仅为合成数据。以后另行获准上线时，必须先停止旧 API 写入、备份，再迁移/生成 Prisma 客户端/启动新版封存，不能让旧代码在新迁移后继续追加无链日志。
- SHA-256 基线/链用于检测接手后的记录一致性；不能证明接手前历史真实，不能抵御拥有完整数据库特权的攻击者重写整链或整库回滚。尚无外部可信锚点/不可变外部留存、周期全量自动校验；未宣称绝对防篡改。
- 告警失败按用户规则不阻断联系方式；审计失败仍拒绝返回。并发验证覆盖当前 SQLite 下的多请求/多连接，未覆盖分布式数据库或真实多进程负载。
- API/后台生产依赖审计 0；官网 6 项既有工具链例外仍未进入 24 个运行时包，到期 2027-01-09。构建仍有已知 `NUXT_B7027`（`tailwindcss/nesting` 入口），构建成功。本步没有更改工具链或业务状态色。
- 下一步：先核对本步实际提交与 CI，再与用户确定后续加固范围；可信外部日志留存和发布前迁移演练可作为候选，不默认执行生产操作。


### 首次 CI 发现与追加修复（2026-10-13）

- 主提交 `3862a6d4ab090bf14809cd6ee636514bd5b8945d` 已普通推送。[首次 Quality](https://github.com/728792899-create/hushi-wind-website/actions/runs/38274575342) 的 API 测试失败 4 项，质量构建未执行：跨连接并发追加、校验与追加并发均出现 `Socket timeout`；两组联系方式并发均仅 1 个 200，其余 409。这是首次 CI 的真实发现，未用重跑掩盖。
- 现场复现：本机设置 `TOKIO_WORKER_THREADS=2` 后重现；另建本任务独立 Linux/Node 22.23.3 arm64 容器（CPU 限为 2），在原提交上复现相同 4 项失败。并发 SQLite 交互事务的同步锁等待占住数据库引擎线程，使持锁事务无法继续；仅提高超时不能消除此调度问题。旧的后台请求日志独立写入也会争用，因此修复不能只限审计入口。
- 新增 `aural-api/lib/sqlite-transaction.js`，以进程内共享 FIFO 限制同时进入引擎的交互事务；数据库锁仍负责跨进程互斥。最多 256 个等待任务，等待超时即移除且不再执行；失败后释放队列，不重放已经进入的业务回调、不放宽原事务超时。队满或排队超时返回 503，适用于资源繁忙，不是按联系方式查看次数阻断。
- `lib/unit-of-work.js` 的业务事务及独立模型写入、`$executeRaw` 使用同一队列；已有事务直接复用，外部保存的方法在执行时也重新识别当前事务，避免自排队。普通读取保持原行为。`lib/audit-integrity.js`、`lib/maintenance.js`、`lib/content-workflows.js` 的事务入口统一接入；`server.js` 的通知、备份记录和维护任务改用该代理，避免后台写入绕过队列。数据库备份的 `VACUUM INTO` 保留独立连接，不放入交互事务。
- 新增 `tests/sqlite-transaction.test.js` 7 项：跨客户端 FIFO、超时取消、256 容量、异常释放且不重放、嵌套复用、成功提交后通知/回滚丢弃及暂存响应；真实 SQLite 同时覆盖后台写入、捕获函数调用、版本号扩展与回滚。原有 4 项并发断言保留，仍要求所有联系方式请求成功且仅一条告警。
- 完整回归还发现 WAL 备份测试在前一条 API 请求的后台日志未结束时切换 `journal_mode`，触发独占锁竞争。仅修改测试夹具：将 WAL/自动 checkpoint 配置移到 before 钩子、服务接收请求之前；备份测试改为只读确认 `journal_mode=wal`，原新数据/表完整性/坏库拒绝断言不变。生产数据库模式未改变。
- `.github/workflows/quality.yml` 对 `npm test` 显式设置两个引擎线程，使今后 runner 核数变化也不会掩盖这类问题。Linux 修复后完整 API **101/101** 通过、0 跳过；本机同样两个引擎线程下完整测试 **155/155** 通过（API 101、后台 45、官网 9）。quality、真实构建 admin-ui、colors、BOM 均通过。新增文件也纳入补充 BOM 扫描；追加提交前暂存后再次检查，203 个已跟踪源文件通过（`ci-fix-final-staged-bom.log`）。
- 浏览器用原合成验收库、两个引擎线程重启本步独立 API，未重启原 `1337/3100/5175` 服务。客服仍只看到本人 1 条咨询、负责人禁用，手机查看联系方式成功并留痕；完整性校验显示 **34 条记录通过**，旧告警仍为已处理。390 咨询抽屉/告警及 1440 完整性页面复测全部归零，最低对比度 4.73。恢复正常视口，保留管理员告警演示页。
- 专项独立复核无未决 P1/P2。额外证据：`ci-initial-failure.log`、`ci-low-thread-contact-baseline.log`、`linux-baseline.log`、`linux-runtime.json`、`linux-fixed-api.log`、`ci-fix-two-worker-targeted.log`、`ci-fix-wal-fixture-failure.log`、`linux-wal-fixture-failure.log`、`ci-fix-final-*.log`、`ci-fix-{support-mobile,integrity-desktop,alerts-mobile}.png`。Linux 容器仅用于此轮合成测试，已停止并移除；日志留在本地忽略目录。
- 采用追加提交并普通推送，不改写 `3862a6d`；以追加提交完整 SHA 对应的成功 CI 才完成第 5 步交付。仍无生产操作，原文的哈希链可信边界、未开放个人信息导出及遗留构建警告保持。


## 第 6 步：审计留存与恢复演练（2026-10-13）

### 目标与现场复核

在现有权限、审批和留存规则下，证明备份中的数据库、素材、历史审计可在本地独立副本恢复，恢复后仍能继续追加有效审计，并让后台准确展示最近一次演练结果。本步仅使用本地合成数据，不接外部服务、不产生费用、不操作生产。

- 起点为 `b70081390741588b2064f6ed1de02aeb94f1058a`，工作区干净；已现场核对该 SHA 的 [Quality](https://github.com/728792899-create/hushi-wind-website/actions/runs/38276188870) 为成功。开始前通读交接、修复记录及 Git 状态/日志。
- 旧备份校验仅覆盖 SQLite、表列、外键和文件摘要，未校验审计链/基线/保护触发器；坏审计可能被当作有效恢复点，并替代清理中应保留的正常副本。
- `manifest.assets` 缺失或为空值会跳过素材校验；恢复入口仍可报成功。旧演练只复制数据库，素材在原备份目录校验，未证明素材能完整复制恢复，也未验证副本审计续写。
- 成功状态写在自由文本 `message` 中，之后校验失败不更新记录，页面仍可能显示旧“已校验”。启动还存在后台备份早于审计初始化的时序。
- 自动维护已经不删除 `OperationLog`、`AuditLogEntry`、`AuditIntegrityState`。本步保持操作审计全量保留、默认 14 天备份和至少两个有效完整恢复点，不新增外部留存/审批/业务权限规则。

### 最小修改与行为变化

- `aural-api/lib/database-backup.js`：新包使用版本 2 清单，记录快照文件大小/摘要、所有表计数、素材及审计 checkpoint。备份发布前与验证时只读核验审计基线、链和保护触发器；部分审计结构、未封存或坏链均失败，不自动封存或重签旧历史。校验清单类型、安全相对路径、重复项、文件大小、精确素材集合、引用、符号链接和 SQLite sidecar。摘要采用流式读取。
- `lib/scheduled-backup.js` 和留存：完整恢复点要求素材清单及目录；只有审计 verified 的完整包能计入两个有效点。少于两个时全部保留；有两个后其余过期包（包含 legacy）仍按原 14 天策略清理，没有增加永久保留例外。旧清单无 checkpoint 但数据库链有效可只读校验；真正无链历史库显式 legacy，不能替代可验证恢复点。
- 新增 `lib/restore-drill.js`、`scripts/restore-drill.js` 与 `drill:restore` 命令：两个路径必须显式且绝对，不加载 `.env`、不访问网络。复制数据库/清单/素材到唯一临时子目录，比较全部表计数、素材及审计；仅在副本追加虚构 `RESTORE_DRILL` 日志再验链，并重新核对源包不变。成功和失败都清理唯一目录含临时 SQLite 文件，不替换业务库。报告包含快照时点、耗时、数量、续写/源不变/清理结果，不含客户正文和本地绝对路径。
- `schema.prisma` 与迁移 `20261013010000_backup_verification_state`：`BackupRecord` 增加最近演练状态/时间/JSON 报告，原创建结果保持原含义。历史记录默认 never，不由旧成功文本推定通过。
- `server.js`：演练先原子记录 running 与开始审计，结束再原子记录 verified/failed 与相应审计；失败也持久化，进程中断不会遗留旧通过状态。同一进程对同一备份阻止重复演练；原超管权限及敏感确认保持。初始化审计成功后才启用备份、维护与通知任务。
- `aural-admin/src/views/SettingsView.vue`：分开显示创建与最近演练结果；点击后立即清除旧成功，失败也刷新列表，迟到响应不污染新栏目。展示快照时间、表/素材/审计数量及续写结果；手机使用完整卡片，报告不截断，桌面报告及操作完整可见。颜色语义、品牌、业务规则未改。
- 测试涉及新增 `backup-recovery.test.js`、`backup-api.test.js`、`settings-backup.test.mjs`；既有 `backend-integration.test.js`、`commercial-readiness.test.js` 的完整备份夹具显式迁移/初始化审计。运行说明见 `docs/backup-recovery.md`，交接同步本步状态及迁移边界。

### 测试、反向验证与迁移证据

- `TOKIO_WORKER_THREADS=2 npm test` 最终 **182/182**（API 122、后台 51、官网 9），0 失败、0 跳过。quality、真实构建 check:admin-ui（distChecked=yes）、check:admin-colors、check:bom 与差异格式检查通过；新文件在暂存后再次纳入 BOM 门禁，209 个已跟踪源文件通过；额外对本步 17 个改动文件（含新 SQL/Prisma）扫描均无 BOM。
- 新增 16 项真实 SQLite 恢复测试：快照 checkpoint、审计损坏、重算 checksum 仍拒绝坏链、未封存/部分结构、legacy 兼容、缺素材清单、恶意路径/重复或额外文件/尺寸、符号链接与 sidecar、全副本恢复续写/失败清理、scratch 位于源素材内拒绝、坏链不能替代保留点、mixed legacy/current 留存等。真实 WAL 历史快照演练前后源文件 SHA 一致，源无遗留 WAL/SHM/journal，本次临时子目录清空。
- 真实维护回归：2000 年旧登录记录按原规则删除，旧操作审计、历史基线和新增链条逐字保持不变，完整性验证仍通过。
- 独立审查发现并修复仅由素材库 `MediaAsset.url` 引用的文件缺失会漏检：旧实现新增反向测试真实失败；补齐引用表后，缺文件创建拒绝，删除备份素材并重写合法素材清单也无法绕过数据库引用验证。修复后核心 16/16 通过，最终专项复核无剩余 P1/P2。
- 新增 5 项 API 回归：只读读取可用、创建/演练越权 403、缺确认 400；成功报告持久化；已通过包后来坏素材、坏审计、缺文件分别 500，最近结果变 failed 且旧成功证据消失。坏审计测试恢复原触发器、重算文件摘要并保证尺寸匹配，确保真正检出链损坏。业务字段/原素材保持不变，虚构续写未进入业务库。
- 新增 6 项界面行为测试：旧文本不能当通过、创建失败/只读不能演练、防重复、旧成功立即清除、失败刷新且保留错误、成功解锁，以及跨栏目/刷新期间迟到响应不污染当前页。
- 最终全套首次发现一项旧留存夹具不满足新“有效点”定义：它仅三张表、没有审计链，却称 two verified。升级该夹具到完整迁移与显式初始化，原保留/删除断言原样保留；另一 legacy URL 夹具未改。失败证据留为 `final-before-verified-fixture.log`，随后完整 182 项通过，未放宽实现或删断言。
- 迁移仅在第 5 步合成库的 SQLite 副本执行，增加一条虚构旧成功记录后逐表比较：**34 张原表、185 行的原字段值全部一致**，旧备份记录的新状态为 never、时间/报告为空，原审计链仍验证通过。原演示 `dev.db` 和原服务未迁移、未重启。
- CLI 独立执行正常退出 0（35 表、1 素材、审计续写通过）；源 DB/清单/素材逐个 SHA 前后一致，scratch 为空。缺显式参数退出 1，返回 `RESTORE_DRILL_PATH_REQUIRED`，不会采用环境中的数据库默认值。

- 真实 `server.js` 主入口另建未封存的新库及最小虚构管理员/配置：启动前 sealedAt 为空、备份数 0；启动后健康检查 200，先封存审计再生成首个自动备份（35 表/1 素材，审计 verified），通知任务数 0。仅停止本次独立进程并释放 18339。首次纯空库因健康检查要求管理员/配置行而返回 503，保留证据后改用另一新库补最小夹具复验，未修改健康规则。

### 浏览器验收

仅使用合成数据库的独立 API `18338` / 后台 `15176`，通知地址为空。真实视口 1440×1000 与 390×844、手机 coarse pointer。

- 通过 UI 创建两份完整备份，创建后先显示尚未演练。演练第二份显示 **35 张表、1 个素材、7 条原审计、审计续写通过**，记录快照与最近演练时间；虚构新增审计只在副本。
- 将第一份备份中的合成素材改坏后再点演练，收到中文失败并持久显示演练失败，旧通过标签及成功报告不再保留。刷新后仍失败；恢复原素材后重新通过。本次故障注入已恢复，未修改真实客户资料。
- 只读角色可查看两份报告，没有创建或演练按钮；API 越权拒绝由真实接口测试补证。
- 受影响成功/失败/只读页面全页扫描：无整页溢出、低于 12px 可见文字、低于 24px 启用目标、无名称控件或文字对比度失败，最低 4.70:1。手机报告完整可读；桌面表格调整列宽以避免操作截断。验收后恢复普通浏览器视口。

证据保存在忽略目录 `logs/step6-20261013/`，不提交数据库、凭据、素材包或截图。包含 `final-npm-test.log`、`final-quality.log`、`final-check-admin-ui.log`、`final-check-admin-colors.log`、`final-check-bom.log`、`final-cli-*`、`migration-{deploy,audit}.log`、`migration-evidence.json`、`browser-audits.json`、`startup-ready-smoke.json`、`media-asset-reference-before-fix.log`、`backup-recovery-media-reference-after-fix.log`，以及 `backup-verified-{mobile,desktop}.png`、`backup-failed-mobile.png`、`backup-failed-persisted-mobile.png`、`backup-readonly-mobile.png`。

### 提交、生产状态、限制与下一步

- 本步单独提交并普通推送至 `codex/admin-core-redesign`，不改写已推送历史。提交后按本步实际完整 SHA 核对 GitHub Actions Quality，CI 链接及最终状态在交付回复提供，本地保存 `ci-result.json`；此前 CI 和本地通过均不代替本提交 CI。
- **没有生产部署、生产数据操作、外部服务接入或真实通知发送**。新迁移只在本地合成副本；原 `1337/3100/5175` 服务保留。正式迁移/恢复仍须另行授权和验收。
- 本地哈希链不能抵御特权者重写整链/整包或整库回滚；没有外部不可变留存或可信锚点。同盘备份不能抵御整机丢失；本次小型合成演练耗时不是生产 RTO/RPO 承诺。旧无链备份不会被自动重签为可信。尚未启动恢复后的完整业务应用或执行真实停机灾备；大体积数据/素材、真实多进程压力和真机辅助技术不在本次验收范围。
- API/后台生产依赖漏洞为 0；官网 6 项既有工具链例外未进入 24 个运行时包，到期 2027-01-09；`NUXT_B7027` 构建警告保持，构建成功。
- 下一步：先核对本提交 CI，然后按用户确认的下一阶段继续。外部审计留存、异地副本或 RPO/RTO 规则涉及外部服务、费用或业务含义，必须先确认，不自动执行。

## 第 7 步：访问边界与备份失败可见性（2026-10-13）

### 目标与现场复核

- 只在 `~/Projects/hushi-wind-website`、`codex/admin-core-redesign` 操作。先完整复读交接、修复记录与实际 Git 状态；起点工作区干净。第 6 步完整 SHA `bb5cb402a550175468c46c5b3172798932b5ece5` 对应 [Quality 38286115477](https://github.com/728792899-create/hushi-wind-website/actions/runs/38286115477) 已实时核对 completed/success。
- 定向安全复核与独立只读审查确认四个可本地闭环的问题：登录/续期/2FA 请求可在并发撤销后签出新版本会话；艺术家 `preview=1` 漏掉既有读取权限；有效草稿预览票据随 fullPath 进入统计与监控告警；自动备份失败只写维护日志，使旧成功掩盖新失败。
- 不改变用户已确认的客服分配、艺术家申请共享、联系方式只告警不阻断、个人信息导出关闭等规则；不引入外部服务、收费组件、通知渠道、权限角色或审批流程。

### 最小改动与行为变化

- `aural-api/server.js`：登录成功更新和成功日志放在统一 SQLite 事务内，重读并绑定原认证版本、密码及 2FA 状态，同时复核停用/锁定。续期及个人密码/2FA 设置在执行点复核令牌版本、状态、锁定与有效期，避免排队期间撤销被绕过。保持空闲/绝对会话时长；正常 2FA 换签不延长原始登录时间。
- 同文件艺术家列表对 `admin=1`、`preview=1` 统一执行登录与 `artists:read` 门禁；公开列表仍只显示发布内容，授权编辑者预览可用。
- `aural-api/lib/telemetry-privacy.js`、`lib/security.js` 与官网 `app/utils/telemetryPrivacy.js`、`app/composables/useAuralTrack.js`：在最终 payload 合并后、截断及入库前过滤明确凭证参数/对象键，覆盖重复、编码、嵌套 URL、片段和错误消息中的查询参数。保留正常 UTM/source/search；metadata 原白名单和类型规则保持。前后端由共同契约测试约束一致性，真实预览 URL 本身不被改写。
- `aural-api/lib/scheduled-backup.js` 与 server 工厂接入：创建/校验失败依次尝试写失败 BackupRecord、MaintenanceRun 和告警；固定中文消息不携带内部路径或原始异常。任何报告失败都不覆盖原异常，busy 总会解除。稳定键复用现有 `backup_failed` 冷却规则；留存清理失败有独立 phase/说明，不将已校验完整包改成创建失败。保留原每日计划、14 天规则与至少两个有效点要求。
- 新增 `auth-races.test.js`、`scheduled-backup.test.js`、`scheduled-backup-api.test.js`、`telemetry-privacy.test.js` 和官网 `telemetry-privacy.test.mjs`；既有 `commercial-readiness.test.js` 仅补新增失败记录事件断言。交接说明同步本步与剩余风险；无数据库迁移、无后台 UI 源码变更。

### 测试与反向验证

- 冻结源码后 `TOKIO_WORKER_THREADS=2 npm test` **208/208**：API 145、后台 51、官网 12，0 失败、0 跳过。`npm run quality`、`check:admin-ui`（真实 distChecked=yes）、`check:admin-colors`、暂存后 `check:bom`、全改动文件 BOM 检查及 `git diff --check` 通过。
- 认证负例用真实 HTTP/SQLite，在捕获账号读取后提交并发安全变更，不依赖抢时间或生产测试后门。旧实现原 11 项中 **10 项真实失败**（9 个安全竞态、1 个艺术家权限旁路）；修复后及追加边界共 **14/14**。覆盖密码重置、启用 2FA、停用、锁定、过期、个人安全设置排队撤销、正常登录/续期/换签、公开列表与授权预览。被拒请求无令牌、无成功登录或安全设置审计，锁定不被清除。
- 调度器新增 **4 项负例旧实现全部失败**；修复后与既有商业回归共 **14/14**。覆盖真实 SQLite 素材缺失、后置校验失败、三种报告环节失败仍保留原异常/允许重试，以及留存失败保留成功状态。
- 新增实际 server 调度工厂集成 **1/1**：先成功、旧化合成时间、移走引用素材、连续失败两次，GET 备份最新失败、告警只有一条且无内部路径；恢复素材后再成功。旧 DB/清单/素材 SHA 不变且完整验证通过，失败历史保留，通知入队/非本机请求均 0。
- 脱敏新增 API **4/4**、官网新增 **3/3**（官网全 12/12）。旧实现确实将真实签发且可使用的预览票据写入 AnalyticsEvent、AlertRecord；API 日志本来不含查询票据，作为回归保持。修复后包括截断片段、编码 URL、重复参数和直接 API 调用均不泄漏，正常来源统计保留；输入对象和预览链接不被修改。
- 独立只读完成门审查返回 `NO_ACTIONABLE_FINDINGS`，无本次范围内未解决 P1/P2；补齐了首轮指出的中间件后停用/锁定/过期，以及真实 server 去重告警测试缺口。

### 浏览器与本地数据证据

- 独立合成 API `18340`、后台 `15177`、官网 `13100`；通知 URL/邮箱为空。原 `1337/3100/5175` 与原演示 `dev.db` 未迁移、未重启。新增服务启动前核对端口空闲；后续只重启本步已核对 PID/cwd 的独立进程。
- 1440×1000 桌面与 390×844 手机：备份页显示两条创建失败，原成功点仍在；安全告警只有一条固定中文失败说明。恢复合成素材并重跑调度后，最新成功与两条失败历史并存，旧包哈希不变且仍验证通过。只读账号能看四条记录，没有创建/演练按钮。
- 只撤销合成管理员 tokenVersion 后，浏览器下一次读取返回重新登录界面；同账号重新登录、刷新后正常加载。并发请求本身由确定性接口测试验证，没有用浏览器成功登录代替竞态证据。
- 六个后台状态的全页扫描共 254 处文字/111 个控件，最低对比度 **4.70:1**；没有整页溢出、小于 12px 可见文字、小于 24px 启用目标或文字对比度失败。相关操作的可读名称由 AX/DOM 核对，未修改 UI；手机失败卡片完整可读。结束时恢复普通视口。
- 官网草稿在 1440/390 宽度正常显示预览提示和合成正文；浏览器实际发出的 page_view、product_view、performance_metric 等请求已将 previewToken 替换为 `[redacted]`，UTM/source 保留，手机 viewport 为 390x844。随后查询本地 AnalyticsEvent、AlertRecord、ApiRequestLog，均无完整或截断票据，通知数 0。
- 官网首次隔离 dev 因原 Nuxt 进程锁拒绝启动；未停止原服务。quality 构建的占位 HTTPS 域名与本机 HTTP 运行时覆盖不匹配 CSP，初次预览未计入埋点验收。改用同源码、本机域名构建产物重开独立预览后复验成功；没有禁用或放宽 CSP。

证据在忽略目录 `logs/step7-20261013/`：`auth-{before,after}.log`、`scheduled-backup-{before,after}-fix.log`、`scheduled-backup-api.log`、`telemetry-*-before.log`、`telemetry-api-after.log`、`telemetry-website-after.log`、`final-npm-test.log`、`final-quality.log`、`final-check-admin-ui.log`、`final-check-admin-colors.log`、`final-staged-bom.log`、`final-bom-changed-files.json`、`browser-audits.json`、`browser-recovery.json`、`browser-telemetry-{requests,mobile,storage}.json`、`backup-failures-{desktop,mobile}.png`、`backup-alert-{desktop,mobile}.png`、`backup-recovered-mobile.png`、`backup-readonly-mobile.png`、`session-revoked-mobile.png`、`preview-{desktop,mobile}.png`。不提交数据库、合成凭据、票据、备份包、截图或运行日志。

### 提交、生产状态、剩余风险与下一步

- 本步单独提交并普通推送至 `codex/admin-core-redesign`。提交后按实际完整 SHA 核对 GitHub Actions Quality，成功链接及状态在交付回复提供，结果另存 `ci-result.json`；此前 CI、本地测试不能替代本提交 CI。
- **未部署、未执行生产数据操作、未接入外部服务或发送真实通知**。所有破坏性故障注入只作用于合成素材/账号，素材已还原；本步无生产迁移事项。
- 本次是定向加固，不能视为整个项目已达生产成熟度。下一优先项：主入口监听成功前已启动后台任务，仍缺少 SIGINT/SIGTERM 停接请求、停止计时器及排空事务/备份/演练的统一收尾；需本地子进程故障演练后再修复。强杀、整机丢失及外部通知可靠性未验收。
- 公开产品详情的相对下载链接域名与手机返回按钮名称仍待后续可用性复核；未改变品牌内容或状态色语义。官网 `NUXT_B7027` 构建警告、6 项未进入 24 个运行时包的工具链审计例外（2027-01-09 到期）保持；API/后台生产依赖审计 0 漏洞。
- 脱敏覆盖明确凭证参数和对象键，不等于任意裸秘密/全部 PII 过滤，未追溯修改历史日志或审计。周期全量审计、外部可信锚点、不可变留存、异地备份与真实 RPO/RTO 仍未验收；涉及服务、费用和业务规则先确认。


## 第 8 步：服务启动保护与停机排空（2026-10-13）

### 目标与现场复核

- 在唯一授权目录 `~/Projects/hushi-wind-website`、分支 `codex/admin-core-redesign` 完整阅读交接、修复记录及 Git 状态；起点干净。第 7 步完整 SHA `d7c50e134f38a2a47841189f750e1af6cdd57dcd` 的 [Quality 38353412835](https://github.com/728792899-create/hushi-wind-website/actions/runs/38353412835) 已实时确认 completed/success。
- 现场确认：原入口先启动自动备份/维护再 `listen`，未保留 server 或处理异步监听错误；没有 SIGINT/SIGTERM 排空。后台 timer、响应后的 API 日志、告警与 afterCommit 均可能游离于 HTTP 连接之外，客户端断连不能证明处理已完成。备份及恢复演练虽已有 finally，但直接终止进程会绕过清理。
- 仅修复启动、任务生命周期及进程管理预算约束；没有调整业务权限、审批、留存天数、通知渠道、品牌内容或状态色。没有引入服务、费用、迁移或依赖。

### 改动文件与行为变化

- `aural-api/lib/service-lifecycle.js`（新增）、`server.js`：先绑定端口，再验证审计及初始化目录，最后开放请求并启动后台任务；初始化期间返回 503，监听/初始化失败清理资源并非零退出。保留导入 `app` 的测试用法，新增 `startServer`，本地支持随机端口 0。
- SIGINT/SIGTERM 立即停接并关闭空闲连接，停止备份、维护、通知和限流清理四类 timer；重复信号复用排空。已接受 HTTP 处理器、健康检查、预览及上传（含 Multer 回调）独立追踪。通知停止新领取，已发送请求完成持久化，后续 outbox 保留。
- `lib/work-tracker.js`（新增）、`lib/unit-of-work.js`、`lib/sqlite-transaction.js`：同步登记父子工作，动态等待排空；跟踪响应后的 API 日志、告警、事务、独立写入和 afterCommit。事务成功后先登记提交任务再回应客户端，回应异常不会丢失已提交任务。保留 SQLite FIFO、队列上限和事务等待/执行预算，最后等待队列空再断开主库。
- 备份与恢复演练沿用已有完整校验与 finally；上层处理器/调度任务被完整等待，所以结果写回、独立 Prisma 断连和临时目录/锁文件清理包含在正常停机内。
- `.env.local-example`、`.env.production.example`、`scripts/safe-deploy.js`：`SHUTDOWN_TIMEOUT_MS` 默认 60000（整数 1–300000）；超时报告 `SHUTDOWN_TIMEOUT`、未排空任务类别/数量并以 1 退出，不能记作成功。现有部署门禁要求 PM2 `kill_timeout` 覆盖旧/新较大预算再加 5000ms；旧进程预算必须在 PM2 元数据中显式记录，避免把 `.env` 中未知旧值误当默认值；只做模拟配置检查，未访问生产 PM2。
- 新增 `service-lifecycle.test.js`、`service-shutdown.test.js`、`work-tracker.test.js`、`unit-of-work.test.js`、测试专用 `fixtures/shutdown-preload.cjs`；既有 SQLite 与部署模拟测试补齐排空/预算契约。新增 `docs/service-lifecycle.md`，同步交接说明。

### 测试与反向验证

- 冻结实现后 `TOKIO_WORKER_THREADS=2 npm test` **234/234**（API 171、后台 51、官网 12），0 失败、0 跳过。两个引擎线程与原事务预算保持不变。`npm run quality`、`check:admin-ui`（distChecked=yes）、`check:admin-colors`、暂存后的 `check:bom`、18 个改动文件的额外 BOM 检查与 `git diff --check` 全部通过。API/后台生产依赖审计仍为 0 漏洞；官网原有 6 项未进入运行包的工具链例外和 `NUXT_B7027` 警告保持，未扩大本步范围。

- tracker/UOW/SQLite 定向 **16/16**：同步登记、幂等释放、动态子任务、原错误保留、无未处理拒绝、回应抛错后仍执行提交任务、回滚不执行任务，以及真实 SQLite 在途事务与六个独立写入完成后队列/追踪器均空。
- 生命周期与现有部署模拟合跑 **11/11**：端口冲突无初始化/后台副作用，初始化期间 503/停止后不开放，断连后的处理器及子任务排空，超时与清理失败明确失败；PM2 过短预算被拒，足够预算通过并覆盖旧配置更长的情形。
- 真实主入口子进程 **11/11**：监听冲突、初始化期间停止、SIGTERM/SIGINT 下事务与排队请求、断连、手动备份成功/失败、断连恢复演练成功/失败、自动备份在途及超时退出。通过 IPC 门闩暂停真实事务/复制工作，不靠扩大引擎线程或事务超时绕过争用。断连、备份/演练成功与注入失败、已排队写入均核对实际数据库、审计链和临时文件；重复停止复用同一 Promise 由生命周期单元测试验证，未声称真实子进程发送过重复信号；故障注入仅在测试 preload，业务 API 不包含测试接口。

- 独立审查发现旧 API 可从 `.env` 读取预算而 PM2 列表缺失该字段的盲区；已改为未知运行预算拒绝放行，并补反向测试，避免 PM2 在旧任务排空前强杀。

- 独立只读第 2 轮完成门返回 `NO_ACTIONABLE_FINDINGS`，无本步剩余 P1/P2。

### 浏览器与本地证据

- 新建合成 API `18341` / 后台 `15178`，库、素材和随机测试密钥只在忽略目录；通知地址/邮箱为空。原演示库、原服务及其他项目未修改或停止。
- 1440×1000 桌面先执行真实完整恢复演练。再以本地测试门闩停在隔离素材已复制后，发送 SIGTERM：新连接被拒，进程仍存活且临时工作区仍在；放行后正常退出 0。数据库记录为 `verified`，35 张表、1 个素材和审计续写验证完成，临时目录为空，源数据库/清单哈希不变，完整包内部校验也确认素材未变；业务审计 4/4 完整。
- 停机期间前端自动刷新可能显示 Network Error；重启并刷新后桌面及 390×844 手机均显示最近“演练通过”，结果没有遗失。19,241ms 包含人为门闩等待，不作为业务恢复时间承诺。
- 两种视口全页扫描共 78 处文字、41 个控件，最低对比度 **5.06:1**；没有整页溢出、小于 12px 可见文字、小于 24px 启用目标或文字对比度失败。相关按钮名称由 AX/DOM 核对。结束时清除故障门闩并恢复普通视口；前端源码未改动。

证据目录 `logs/step8-20261013/`（Git 忽略）：`worker-tracker-unit-sqlite.log`、`lifecycle-unit.log`、`shutdown-integration-*.log`、`browser-drain-evidence.json`、`browser-bundle-before.json`、`browser-layout-audit.json`、`desktop-draining.png`、`desktop-after-restart.png`、`mobile-after-restart.png` 与测试/构建/门禁日志。子进程夹具仅保留本地过程日志并清理其合成库；浏览器库留作验收。数据库、凭据、备份及截图均不提交。

### 提交、生产状态、剩余风险与下一步

- 本步独立提交并普通推送到既有分支；完成后按实际完整 SHA 核对 Quality。成功链接在交付回复提供，另存 `ci-result.json`，不得使用前一步 CI 代替。
- **没有生产部署、生产数据操作、真实通知或费用支出**。进程级故障全部作用于新建的本地合成夹具；没有执行真实 PM2 或其他环境的停机。
- 正常排空不覆盖 SIGKILL、断电、进程崩溃、同步事件循环长时间阻塞或超出截止预算的强制退出；这些情况不能保证 finally 执行，需重启后核查运行中记录/备份锁和包完整性。实际生产管理器的终止宽限期、大数据量耗时及业务 RPO/RTO 未验收，不能称为整个项目生产成熟度验收完成。
- 下一步可先现场复核公开产品下载链接与手机返回控件名称，再处理官网构建警告/工具链审计例外；周期全量审计、外部可信锚点、不可变留存、异地备份仍待另行设计。外部服务、费用或业务规则继续先确认。

## 第 9 步：公开下载链接、手机返回与 CI 环境固定（2026-10-13）

### 目标与现场复核

- 在唯一授权目录与既有分支完整复读交接、修复记录和 Git 状态，起点干净；第 8 步完整 SHA `0356f0f84643201d90b86d700bbecbb45063dd29` 的 [Quality 38367612013](https://github.com/728792899-create/hushi-wind-website/actions/runs/38367612013) 已实时核对 completed/success。
- 产品详情直接绑定 API 返回的 `fileUrl`，相对 `/uploads/...` 会落到官网域名；支持页已经通过 `mediaUrl` 指向 API。同一资源在两个入口不一致。现有 CMS 写入限制 HTTP(S) 或 `/uploads/`；异常协议防御针对历史/异常输入，不能声称正常后台可任意写入脚本协议。
- 8 页返回控件在手机隐藏唯一文字后没有名称；390 宽度浏览器基线实际为无名称的 36×36 按钮。上一轮 CI 成功，但存在旧 Action 的 Node 20 强制升级提示，以及 `ubuntu-latest` 即将迁移 Ubuntu 26 的提示。

### 改动文件与行为变化

- `aural-website/app/composables/useAuralApi.js`：媒体 URL 保留合法相对路径、绝对 HTTP(S)、public API base 和调用方 fallback；拒绝非字符串、控制字符、反斜杠、网络路径、非 HTTP(S) 协议和畸形 HTTP(S) 地址。不使用 SSR 内部 API 地址生成公开链接。
- `app/pages/products/[id].vue`：前三条下载先保留原数量/顺序，再统一归一文件地址；空值仍跳原支持入口。`tests/api-contracts.test.mjs` 执行两个页面的实际 computed 和产品 href 表达式，覆盖同一资源、顺序、查询参数/片段、空值、输入不变、内部地址隔离及异常输入。
- `app/pages/{products/index,products/[id],news/index,news/[id],audio,artists,support,info/brand-story}.vue`：返回按钮补 `type="button"`、中文名称，装饰 SVG 从辅助技术隐藏；品牌页原显示条件不变。`app/app.vue` 将按钮命中区至少设为 44×44，保留原圆形图标及返回逻辑。
- `.github/workflows/quality.yml`：固定 `ubuntu-24.04`；checkout 固定官方 [v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1) 的完整 SHA，setup-node 固定官方 [v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0) 的完整 SHA，二者声明 Node 24；显式 `contents: read`。项目 Node 22、TOKIO 2、缓存及原测试/构建步骤不变。上一轮 runner 2.337.0 满足 Action 最低 2.327.1；没有引入新的外部服务、权限用途或费用。
- 同步本交接记录和 `CODEX_HANDOFF.md`；无依赖锁文件、数据库迁移、业务权限、审批规则、品牌文案或状态颜色变更。

### 测试与反向验证

- `TOKIO_WORKER_THREADS=2 npm test` **238/238**（API 171、后台 51、官网 16），0 失败、0 跳过；`npm run quality`、`check:admin-ui`（distChecked=yes）、`check:admin-colors`、`check:bom`、改动文件 BOM 扫描及 `git diff --check` 通过。
- 下载定向测试旧实现 2/6 通过、4 项失败；修复后 **6/6**。覆盖危险协议、网络路径、C0/C1/DEL、反斜杠、错误类型及无有效主机/非法端口等输入；合法 HTTP(S)、普通相对文件、查询参数/片段和调用方 fallback 保持。
- 使用仓库已有 YAML 解析器核对 workflow，与 HEAD 结构比较仅允许 runner、两个 Action 引用及显式读取权限变化。Action 发布信息和声明从官方仓库实读；最终兼容性以本提交实际 CI 为准。
- 独立只读 diff 审查与第 2 轮完成门均返回 `NO_ACTIONABLE_FINDINGS`，无本步剩余 P1/P2；已复核实际改动与浏览器/测试证据，不将配置静态通过等同于 GitHub CI 通过。

### 浏览器与本地证据

- 隔离合成 API `18342` / 官网生产构建预览 `13101`；仅虚构产品、资讯和下载文件，通知渠道为空。没有迁移、重启或修改原演示数据库及原服务。
- 390×844 粗指针与 1440×1000 桌面，8 页 × 2：全部 AX/DOM 名称为“返回”，手机实际命中区 44×44，桌面约 84.8×44；文档宽度等于视口，无整页横向溢出。验证范围是本步返回控件和下载链路，不代表全站完整可用性或全页对比度验收。
- 桌面从产品目录进入详情，键盘返回恢复目录；手机新标签无 history.back、无 referrer 时从详情回退目录；再从目录进入支持页，返回使用实际站内历史回到目录。原 `useSmartBack` 未修改。
- 产品页相对与绝对本地文件指向相同 API URL，保留 `?version=9#readme`；实际点击打开 48 字节的虚构说明文本，HTTP 200。手机支持弹窗同样解析两个合法地址，空地址和 `javascript:void(0)` 历史夹具显示 NO FILE、没有链接；支持页键盘激活也打开相同文本。文本资源在新页打开，未声称强制附件保存或验收外部供应商文件。
- 首次隔离 buildDir 放在 logs 导致 Tailwind config-ctx 模块解析失败，未计作成功构建；改用官网 node_modules 下独立缓存目录后同源码构建成功，产物仍独立保存 logs。未安装依赖、未放宽 CSP。验收结束清除临时视口覆盖。

证据目录 `logs/step9-20261013/`（Git 忽略）：`download-url-{before,after}.log`、`test.log`、`quality.log`、`admin-ui.log`、`admin-colors.log`、`bom.log`、`return-controls-audit.json`、`browser-behavior.json`、`mobile-back-before.{json,png}`、`mobile-return-after.png`、`product-mobile.png`、`support-download-{desktop,mobile}.png`、`download-response.png`、隔离构建及 API 日志。合成库、脚本、素材、截图、日志和测试凭据不提交。

### 提交、生产状态、剩余风险与下一步

- 本步单独提交并普通推送到 `codex/admin-core-redesign`；按实际完整 SHA 核对 Quality 全部成功，并检查旧 Node 20 与 Ubuntu 26 迁移 annotation 是否消失。结果链接在交付回复提供，保存 `ci-result.json` 与本地/远端/CI SHA 一致性证据；上一轮 CI 不能代替本轮。
- **未部署、无生产数据操作、真实通知或费用支出**。合法外部 HTTP(S) 地址继续允许，本步只用本地资源验证，不保证第三方可用性。
- 官网既有 `NUXT_B7027` 与 6 项未进入 24 个运行包的工具链审计例外（2027-01-09 到期）仍在；API/后台生产依赖审计 0 漏洞。建议下一步先复核官网构建警告与工具链例外，不直接扩大依赖升级范围。
- 未改变不匹配管乐品牌的演示内容；全站可用性、生产终止预算、大数据量恢复、周期审计/可信锚点/异地不可变留存与真实 RPO/RTO 仍需分别验收。涉及外部服务、费用或业务规则继续先问用户。

### 第 9 步首次 CI 失败复核与追加修复

- 主提交 `451483a97f0bd3dfadd8cfdc4f8ecaac8a2cfb3e` 已普通推送。[首次 Quality 38369879548](https://github.com/728792899-create/hushi-wind-website/actions/runs/38369879548) 的新 Action 和依赖安装均通过，但原审计测试 `missing or replaced guards and missing state fail verification without recreating state` 在测试 helper 的 finally 恢复触发器处报 `AuditIntegrityState_no_delete already exists`；quality 因前置失败跳过，不能记作 CI 通过。该 run 的 annotation 只剩退出码失败，原 Node 20/Ubuntu 26 两条提示已消失。
- 原审计测试文件在本机连续 30 轮全部通过，故没有将 Linux 的底层 schema-cache 原因记作已复现。现场可确认原 helper 的查询、移除、回调和恢复各自通过池化根客户端执行，缺少同一连接/事务边界；生产审计实现只校验触发器，不会创建或恢复它。
- 追加修改仅 `aural-api/tests/audit-integrity.test.js`：`bypassGuard` 全生命周期通过已有 `runSqliteTransaction` 固定同一事务客户端，全部回调显式使用 `tx`；无 `IF NOT EXISTS`、吞错、重试放宽或生产实现变更。新增错误路径确认原错误对象、触发器 SQL 保持、非法写仍拒绝、篡改与审计链回滚。新测试在旧非事务 helper 上确定性失败（留下篡改），修后审计测试 **12/12**；这证明夹具回滚缺口修复，不等于复现了 Linux 底层缓存故障。
- 最终双线程全量 **239/239**（API 172、后台 51、官网 16），0 失败/跳过；quality、admin-ui（distChecked=yes）、admin-colors、暂存后 BOM、改动文件 BOM 与 diff 检查通过。独立追加范围审查返回 `NO_ACTIONABLE_FINDINGS`；公开页面源码/运行实现未变，浏览器刷新后名称与两个实际下载 URL 仍正确，沿用前述 16 组完整验收。
- 证据追加 `audit-focused-initial.log`、`audit-repeat-before.json`、`audit-helper-{before,after}.log`、`ci-failed.log`、`ci-first-annotations.json`、`test-final.log`、`quality-final.log` 和最终门禁日志。保留首个已推送提交，另行普通追加提交，再按新完整 SHA 验证 CI；不改写历史，不把首次失败掩盖成通过。

## 第 10 步：官网构建警告与工具链审计门禁（2026-10-13）

### 目标与现场复核

- 在唯一授权目录和 `codex/admin-core-redesign` 分支完整复读交接、修复记录和 Git 状态/日志，起点干净；现场核对第 9 步 `466e967173732c7c84f9525aececb6e5429213d2` 的 [Quality 38370477638](https://github.com/728792899-create/hushi-wind-website/actions/runs/38370477638) 为 completed/success。
- Nuxt 4.6.1、Tailwind module 6.14.0、Tailwind 3.4.19、PostCSS 8.5.29 实装和锁一致。模块自动注入 `tailwindcss/nesting`；Vite-builder 的真实 `@nuxt/kit` ESM 解析器返回 undefined，但 `tailwindcss/nesting/index.js` 返回插件函数。不是缺包；仅禁用 nesting 会掩盖功能丢失。[Nuxt loader](https://github.com/nuxt/nuxt/blob/v4.6.1/packages/vite/src/css.ts)、[模块源码](https://github.com/nuxt-modules/tailwindcss/blob/v6.14.0/src/module.ts)、[Tailwind wrapper 文档](https://v3.tailwindcss.com/docs/using-with-preprocessors#nesting)。
- 原门禁接受任何非零退出的 npm stdout，并将缺失 vulnerabilities 默认为空。用忽略目录中的假 npm 返回错误 JSON、退出 1，实际 CLI 仍退出 0 并报告零漏洞。例外只有到期字符串比较，缺字段、错包名和任意长的有效期都可能放行。
- 实时 `npm audit --omit=dev --json`：14 个受影响依赖节点（12 high、2 critical），对应 4 个直接包的 6 条公告，其他是传递风险节点，不重复计作公告。Nuxt 4.6.1 / Nitro 2.13.4 / listhen 1.10.1 已是最新；[simple-git v4](https://github.com/steveukx/git-js/releases) 修复版 4.0.2 移除默认导出，而 DevTools 3.4.2 仍使用默认导入及 ^3.36.0；[argv-parser 2.0.1](https://github.com/advisories/GHSA-v5rq-49vh-5v5c) 同属跨大版本路径。DevTools 新版为 4.0.0-beta.5，不作为兼容小升级。[node-forge 公告](https://github.com/advisories/GHSA-86w9-cpqp-85rv)、[braces 公告](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) 仍无修复版；这也纠正第 1 步“全部无修复版本”的笼统表述。

### 改动文件与行为变化

- `aural-website/nuxt.config.ts`：旧 nesting key 设 false，启用明确 index.js 入口；真实 wrapper 保持在 Tailwind 之前，Autoprefixer / CSSNano 仍在之后。没有改依赖、锁文件或页面业务文案。
- `scripts/audit-runtime.js` / 新增 `scripts/audit-runtime-core.mjs`：只接受完整 npm v2 报告，拒绝 error、无效 JSON、非 0/1 状态、signal/启动失败、缺字段、计数矛盾、悬空或无直接公告的循环依赖；给 npm 进程 120 秒上限，失败非零退出。
- 例外必填 package/advisory/path/reason/reviewed/expires，校验 HTTPS 公告 URL、真实日期、非未来复核日期、期限顺序、最多 90 天、到期及重复；与当前公告包名绑定。沿用到期日当天有效的原行为，次日失败；陈旧条目提示移除，陈旧但无效/过期的配置也拒绝。
- 外置清单扫描 scoped、nested 与符号链接并防环，损坏/缺失 manifest、空清单失败；即使有有效例外，漏洞包进入外置清单仍阻断。输出明确这不是完整内联模块清单，不夸大为全产物安全证明。
- `audit-exceptions.json` 更新 6 项技术复核依据和 reviewed 日期，**全部保留 2027-01-09 原到期日**。新增 `tests/audit-runtime.test.mjs` / `tests/postcss-pipeline.test.mjs`；同步本记录与 `CODEX_HANDOFF.md`。

### 测试与反向验证

- `TOKIO_WORKER_THREADS=2 npm test` **254/254**（API 172、后台 51、官网 31），0 失败/跳过。`npm run quality`、`check:admin-ui`（distChecked=yes）、`check:admin-colors`、暂存后 `check:bom` 和 `git diff --check` 全部通过。标准构建及独立浏览器构建均无 `NUXT_B7027`，API/后台生产依赖审计仍 0 漏洞。
- PostCSS 真实加载 Nuxt 配置、Tailwind 模块及 Vite-builder 使用的解析器；只渲染独立测试 config，不 build/listen 或改共享 .nuxt。旧配置负例无法编译嵌套 `@screen` + `@apply`，修后 3/3：验证 `&:hover`、子选择器、768px 响应式、1rem/2rem padding、无未处理指令及真实加载/插件顺序。
- 审计 12/12：错误响应/截断/缺字段/计数不一致、合法零漏洞、直接与传递公告去重、依赖循环、缺字段/错误日历/闰日/未来/倒序/90 与 91 天/过期/到期日/重复/错包/未登记、真实临时目录的 scoped/nested/symlink 环及损坏 manifest、已例外仍拒绝外置漏洞包。临时夹具只在仓库忽略目录创建并清理。
- 同一 CLI 假 npm 错误响应修前退出 0、修后退出 1；真实网络审计修后退出 0，仍需 6 条有效例外。不存在强制 audit fix、跨大版本 override、修改审计严重级别或延长例外。
- 独立只读实现/测试审查返回 `NO_ACTIONABLE_FINDINGS`；交付前再复核冻结 diff 和实际证据。没有用静态检查替代最终 GitHub CI。

### 浏览器与本地证据

- 隔离合成 API `18343` / 官网构建预览 `13102`；独立构建目录和输出位于本步 cache/logs，通知为空。没有迁移、重启或修改原演示库及原服务。
- 390×844 coarse pointer / 1440×1000 桌面：新旧构建产品页与搜索面板四状态采集的 header/back/h1/search 控件几何与字体、颜色、背景、padding、display 数据完全一致，四状态均无整页横向溢出。手机返回 44×44。范围为本次 CSS 修复的定向回归，不代表全站可用性/对比度验收。
- 搜索“本地”两种宽度均显示 4 条合成结果；手机结果可键盘进入详情并关闭搜索，手机菜单打开/关闭正常。控制台无 error/warn。浏览器缩放下定位点击存在偏移，交互验证改用实际语义控件的键盘激活；不声称真机触摸验收。截图使用 CDP 实际视口裁切，避免面板截图缩放造成空白区域。
- 本步审计自动扫描 24 个外置包；两套新产物各 48 个服务端 sourcemap、179 条来源引用、177 个唯一路径、19 个依赖包来源，当前四个直接漏洞包的来源路径和 map 文本均 0 命中。map 不含 sourcesContent，只作为本次归因复核，不代表未映射代码的完整证明。旧预览/新预览/标准产物均为 14 个 CSS、89,905 字节，按逻辑文件名 + SHA-256 对比逐字节相同。完整构建来源/内联模块清单尚未建立。

证据在忽略目录 `logs/step10-20261013/`：`postcss-{before,after}.log`、`audit-error-{before,after}.log`、`audit-live-after.log`、`npm-audit-before.json`、`audit-runtime-tests.log`、`test.log`、`quality.log`、`check-admin-ui.log`、最终 BOM/颜色检查、`sourcemap-css-inspection.json`、浏览器 before/after/comparison JSON、手机搜索及菜单截图、隔离构建与服务日志。合成库、测试凭据和证据产物不提交。

### 提交、生产状态、未决风险与下一步

- 本步单独提交、普通推送既有分支，随后按实际完整 SHA 确认 Quality completed/success，并保存本地/远端/CI SHA 与 annotations。最终提交与 run 链接在交付回复及忽略目录 `ci-result.json` 提供；本地通过不代替最终 CI。
- **未部署、无生产数据操作、真实通知、新外部服务或费用支出；业务权限、审批规则、品牌内容与状态颜色不变。**
- 六项工具链例外仍在，2027-01-09 到期；等待兼容修复，不能声明依赖漏洞全部清零。下一步建议先复核并补齐可本地验证的构建内联来源清单及审计覆盖；完整官网可用性、周期审计/可信锚点/异地不可变留存、生产停机预算与真实 RPO/RTO 仍为独立验收项。涉及外部服务、费用或业务规则继续先问用户。
