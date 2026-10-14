# 安全加固记录

按“企业级交付”标准逐步收口的安全与工程门禁。每一步独立提交、可单独回滚。历史本地加固记录不等于生产部署或验收；最新临时完整站的实际部署、DNS/HTTPS 接入及尚未完成的浏览器验收见本文末节。

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

## 第 11 步：构建内联来源与产物审计覆盖（2026-10-13）

### 目标与现场复核

- 在唯一授权目录、指定分支复读交接与全部修复记录，起点工作区干净。现场确认第 10 步完整 SHA `7e9b8b45a2822f3ecc86e36295ad8556704e20d5` 的 [Quality 38374534319](https://github.com/728792899-create/hushi-wind-website/actions/runs/38374534319) 为 completed/success，未把历史记录代替实时核对。
- 原门禁只有 24 个外置包名称。实际 Nitro 已内联 h3，外置清单没有它；对该包注入合成 high 公告和有效例外，旧核心返回 errors 空数组。此用例证明覆盖缺口，不声称 h3 存在该合成漏洞。
- 实装 Vite 8.3.4 使用 Rolldown 1.2.13，Nitro 2.13.4 使用 Rollup 4.64.5。客户端无 sourcemap；Nitro 看到部分已预捆绑的 SSR chunk，仅扫描 Nitro 或 sourcemap 不能恢复三段来源。真实微型构建还证明 Rolldown 跨模块折叠常量后，原包从 chunk.modules 消失，但仍在本次已加载模块图中。
- npm audit 显式 include dev 时有 20 个依赖风险节点（14 high、2 critical、4 moderate），直接 high/critical 仍为原 6 条。开发依赖不能仅因其 dev 标记被排除；公告必须按自身 via.range 匹配版本，而非父依赖聚合范围。现有安全发布脚本构建后直接进入维护，未调用官网审计。

### 改动文件与行为变化

- 新增官网 `scripts/provenance-module.mjs`、`scripts/artifact-inventory.mjs`，在 `nuxt.config.ts` 注册。以当次客户端、SSR、Nitro 的输出模块与实际加载图并集记录包名/版本/精确锁路径，保守保留零长度和后续摇除模块；未导入包不会因已安装就列为产物来源。生成/虚拟/项目模块显式分类，不把开发机绝对路径写进清单。
- 按最内层 node_modules 解析 scoped/nested 包；物理包与锁身份相符、文件不能逃出包目录。消费端再次校验 kind、ID 前缀、非空包身份与精确最内层归属。生产关闭 Nuxt build cache，缺段、重复生成、图 API 异常即失败。Nitro 原构建全部回调结束后封存；三处实际双斜线 chunk 路径作安全规范化，仍拒绝绝对路径及原始 `..`。
- `.output/audit-manifest.json` 放在输出根目录，绑定 package/lock 字节 SHA-256，记录所有输出文件路径/长度/哈希以及外置包的精确版本。消费端重扫，清单缺失/格式错误/锁变化/文件增删改/符号链接/隐藏外置布局均拒绝。清单自身不循环哈希；不支持的布局明确失败。
- `audit-runtime.js` / `audit-runtime-core.mjs` 显式 include dev/optional/peer，保留原报告和例外严格校验，使用直接公告的 semver 范围匹配（含 prerelease）。已例外的受影响版本进入任一来源图或外置清单仍阻断。`package.json` / lock 只将已安装的 semver 7.8.5 声明为显式开发依赖，没有升级依赖树。
- `aural-api/scripts/safe-deploy.js` 在维护标记、停服、备份、迁移之前调用官网审计，固定新 release 的 `.output`，不接受继承的预览目录。operations 新测试完全模拟所有子进程、PM2 和备份，不执行真实部署。
- 静态 `generate` 保留并提示跳过 Node 专用清单；不能用静态输出通过 Node 发布审计。更新 `audit-exceptions.json` 的覆盖说明与本步来源证据，6 条例外仍保持 **2027-01-09**，未更改权限、审批、品牌内容或状态颜色。新增/更新三个官网测试文件和 operations 测试；运行、限制和故障处理见新增 `docs/website-artifact-audit.md`，同步本记录与交接。

### 测试、反向验证与审查

- 双线程全量 **360/360**（API 174、后台 51、官网 135），0 失败/跳过；最终 `npm run quality` 通过，API/后台生产依赖 0 漏洞，官网构建无 `NUXT_B7027`。最终 admin-ui（distChecked=yes）、admin-colors、暂存后 BOM 和 diff 门禁全部通过并保存日志。
- 真实 Vite 客户端/SSR 与 Rollup 测试验证常量折叠包仍进入审计、同名嵌套多版本分别归属、未导入包不误列、生成/虚拟路径不泄漏宿主路径、Nuxt 真实配置注册、三阶段及封存顺序。静态路径通过 Nuxt 程序式 generate 模式的实际隔离构建完成首页/payload，未生成清单，Node 审计拒绝；build/close 已返回但测试进程事件循环未自然结束，精确核对本次 PID 无监听/连接后仅对其 SIGTERM 清理（143），不记作自然退出 0，未扩展修复上游 Nuxt CLI 的退出策略。
- 文件清单定向 **96/96**：真实隔离文件夹的缺失/损坏/过期元数据、各阶段缺失/空图、精确版本/锁路径、空包名/非字符串版本、输入/产物增删改、重复/穿越路径、非法哈希/长度、外置清单伪造、隐藏目录、符号链接，以及 npm 错误 JSON。仅在 client 加载图中保留的高危 dev 包，有有效例外也阻断；损坏产物在调用 npm 前失败。
- 独立首轮审查发现 package:null 可漏记以及嵌套包可错归外层。先补负例再修复：前一组 10 子用例、后一组 4 子用例在旧实现全部漏拒；修复后 96/96，无断言放宽。来源种类、ID 与精确包目录必须一致。第 2 轮冻结 diff 完成门审查返回 `NO_ACTIONABLE_FINDINGS`，无剩余 P1/P2，并独立复验标准/预览清单与测试、浏览器证据。
- 发布门禁旧实现新增 2 用例均失败，修复后 operations **7/7**。审计失败不写维护标记、不停服务、不备份迁移、不切换版本，原数据库/素材字节与指针不变，记录失败并释放部署锁；成功保持既有顺序。
- 独立完整构建首次因 Nitro 的 `chunks/routes//...` 路径在封存处被拒；生产方规范化并新增实际路径回归后完成，未放宽文件清单路径校验。首轮完整日志未保留，明确保存的是工具输出错误摘录，不冒充完整原始证据。

### 产物与浏览器证据

- 标准构建 **255 个文件**全部哈希通过；client 31 chunks / 182 输出模块引用 / 232 已加载模块，SSR 42/141/152，Nitro 48/175/191。并集 **50 个锁路径包身份 + 24 个外置包实例**，六项例外涉及的四个直接包在三段输出/加载图及外置清单均为 0。不能把 npm 父包传递风险节点重复当作直接公告。
- 本地独立预览 API `18344` / 后台 `15181` / 官网 `13103`，合成数据与通知空配置。独立产物 256 文件，比标准多一个 Nuxt 缓存的 build meta JSON，全部纳入哈希；build() 与 close() 后再次验证通过。`/audit-manifest.json` 返回 404，未放入 public。旧/新 14 个 CSS 共 89,905 字节按逻辑文件名与 SHA-256 完全相同。
- 浏览器 390×844 coarse pointer 与 1440×1000：产品页、搜索面板、后台工作台均无整页横溢出；两种宽度搜索“本地”显示 4 个合成结果，可键盘导航并关闭搜索，手机菜单开关正常，返回 44×44。下载链接仍指向隔离 API。官网及后台控制台无 error/warn，临时视口/触控模拟已恢复。范围是构建变动回归，不是全站对比度或真机触摸验收。
- 证据在 `logs/step11-20261013/`：`coverage-before.json`、`rolldown-constant-graph-probe.json`、`provenance-{before,after,build,verification,static-*}`、`nitro-chunk-files.json`、`artifact-{inventory-tests,attribution-before,attribution-after,nested-attribution-before,nested-attribution-after}.log`、`deployment-audit-{before,after}.log`、`test-final.log`、`quality-final.log`、门禁日志、`css-comparison.json`、`browser-evidence.json`、手机搜索/桌面产品截图。日志、产物、夹具及凭据全部忽略，不提交。

### 提交、生产状态、未决风险与下一步

- 本步独立提交、普通推送既有分支，随后核对新完整 SHA 的 Quality completed/success、annotations 和本地/远端一致性，最终 commit/run 在交付回复及 `ci-result.json` 提供；不能用本地通过替代 CI。
- **未部署、无生产数据操作、真实通知、新外部服务或费用支出。** 原演示库和既有服务未重启、未迁移。
- 来源清单不是签名 SBOM，不能防止有权限者同时重写清单与产物；虚拟/插件生成代码、复制的预编译脚本/WASM、运行时动态外部代码仍有归因边界，完整性哈希不等于漏洞扫描。已加载图有意保守，不作函数级可达性承诺。工具链例外待兼容上游修复，原到期日不延长。
- 下一步建议第 12 步完整公开站可用性复核，再单独进行周期审计及大数据量备份/停机预算验证。品牌资料、外部可信锚点/异地不可变留存、生产预算和真实 RPO/RTO 仍待相应决策与授权，本步不自动扩大范围。

## 第 12 步：完整公开站可用性（2026-10-13）

### 目标与现场复核

- 在唯一授权的 Projects 工作树和 `codex/admin-core-redesign` 分支完整阅读交接、修复记录及 Git 状态/日志，起点干净。现场核对第 11 步完整 SHA `a973ca07a77ca4b443a40d45f6f526975e2c2a92` 对应 [Quality 38378331509](https://github.com/728792899-create/hushi-wind-website/actions/runs/38378331509) 为 completed/success。
- 用独立合成 API `18345`、官网生产构建预览 `13104` 复核首页、产品目录/详情、音频方案、艺术家、资讯列表/详情、支持、品牌故事、隐私/条款/保修、动态内容页及 404。先截图和实测，再修改；两种视口为 390×844 粗指针与 1440×1000。
- 确认的问题包括：9–11px 文字和浅灰对比不足、表单/筛选名称不完整、部分点击区不足；菜单/搜索/延迟挂载的产品对比缺焦点约束；FAQ 反馈键盘事件冒泡收起答案；产品详情折叠问答仅 20px；目录的比较按钮嵌套于详情链接，原生 AX 树合并其语义；慢请求旧响应会清空或关闭重开的新表单；多页 GSAP 未尊重实时减少动态效果偏好；资讯摘要直接显示正文 Markdown/媒体 URL。视频原生控件获得焦点后又被 Tab 守卫拉回关闭按钮，亦在真实浏览器复现。
- 用户明确批准连接异常提示仅提高橙色文字/浅底对比度，不改变警示类别、含义或触发规则。没有改品牌正文、产品分类、报价/库存/权限或审批规则。

### 改动文件与行为变化

- 官网 `app.vue`、`layouts/default.vue`、Header/Search/Footer、FrontState/Policy/NewsItem/ProductCard/Compare 组件、公开页模板与错误页：中性文字和输入提示增强对比度，小字下限 12px；主按钮、关闭、返回与详情 FAQ 提供 44px 点击区。新增跳到主要内容与明显键盘焦点轮廓；所有本步新增标签为控件名称，不改品牌宣传内容。离线提示实测文字对比度 6.88。
- `useDialogFocus.js` 观察打开状态及实际模板 ref，覆盖懒加载已打开弹窗；支持页视频子视图变化重新聚焦。菜单、搜索、比较、艺术家资料/申请、产品咨询/成功引导各有名称、焦点约束、Escape 与关闭后焦点恢复。搜索提交后焦点留在结果区域；筛选遮罩继续可点击，背景 inert 状态精确恢复。
- 产品目录以非交互卡片容器包住独立的详情链接与比较按钮，整个卡片仍可进入详情，比较只改变选择；页面追踪及筛选排序不变。支持 FAQ 标题按钮独立于反馈按钮，Enter/Space 反馈不再收起答案。
- 新增 `submissionAttempt.js`，艺术家/产品提交捕获字段、实体、类型和埋点快照，同步防止重复执行，并用会话号拒绝旧响应覆盖新窗口。未知结果的同内容请求继续用原 submissionId，不同内容/产品/类型采用新 ID，成功后退役该尝试；原 1.8 秒最短填写、12 秒冷却、API 幂等契约不变。不新增含个人信息导出或真实通知。
- 新增 `pageMotion.js`，首页、艺术家、新闻列表、产品详情、品牌故事共五页改为本页作用域的 GSAP matchMedia；减少动态效果时不隐藏内容，实时切换会回退/恢复动画，卸载只清理自己的动画。首页晚到的异步 import 不会在卸载后创建动画。
- 新增 `articlePreviewText.js`，统一新闻列表、详情摘要和全站新闻搜索的纯文本预览；保留正文、图注、链接文字及原 SEO 优先级、96/160 字截断和搜索原始字段。CMS 原文和详情富文本块渲染不变。新增四组回归测试；`dialogFocus.js` 将受控音视频加入可聚焦集合，并放行媒体内部原生 Tab。当前支持弹窗媒体前后均有普通按钮，保持两端循环；不声称覆盖未来将媒体作为唯一/边缘控件的任意弹窗布局。同步本记录与交接。
- 没有 API、数据库迁移、后台、依赖/锁文件、CI 或生产配置改动。换行恢复只减少混合 CRLF 文件的无关差异，逐文件规范化内容断言一致。

### 测试、反向验证与独立审查

- 双线程最终全量 **395/395**（API 174、后台 51、官网 170），0 失败/跳过；`npm run quality`、admin-ui（distChecked=yes）、admin-colors、暂存后 BOM 与 diff 检查通过，以本步最终日志为证。标准构建核验 **263 个输出文件、50 个内联包身份和 24 个外置包实例**；三个加载图为 235/155/196 模块。API/后台生产依赖审计为 0，官网六条工具链例外仍保留原 **2027-01-09** 到期日，没有延长或降低门禁。
- 定向反向证据：原提交处理 12 项中 8 失败；重开未知结果的真实 guard 重试 16 项中 4 失败；动画 7 项中 6 失败；资讯三处实际映射 6 项中 3 失败；懒加载弹窗 2 项中 1 失败。修复后表单 17、动画 7、摘要 6、弹窗生命周期/媒体 5 项均通过，测试执行真实提交/生命周期函数和实际 Vue/GSAP 行为，不只匹配源码字符串。
- 中途全量曾在摘要负例已加入、映射尚未接入时出现唯一失败，保留 `test-during-summary-negative.log`；最终运行覆盖该失败，未删除负例或放宽断言。浏览器又补出产品 FAQ 点击区与媒体 Tab 问题，分别修复再复验。
- 独立首轮审查指出筛选遮罩被 inert、重开表单重置幂等键的两项回归；均修复并加反向证据。第二轮确认两项关闭，并提示媒体原生控件 Tab 边界，实际复现后追加最小修复。媒体追加回归修前 5 项中 2 项失败、修后结合原 helper 契约 8/8，通过实际 activateDialog 验证，不猜测原生 shadow 控件个数。完成门最终结论在本节末段记录。

### 浏览器、合成数据与证据

- **14 页 × 2 宽度 = 28 组最终完整扫描**，逐页真实滚动使懒加载图片进入视口，减少动态效果模式下稳定采样：**1,486 个普通文字样本、848 个控件**，整页溢出/小于 12px 文字/低于 24px 启用目标/无名称控件/可计算文字对比度失败均为 0，最低 4.63。主按钮另按 44px 复核；不能将 24px 全站下限误称所有控件均 44px。
- **73 个图片、渐变和 mix-blend 文字样本**单列人工；独立复核 12 张代表整页截图，未见新的可确认遮挡或排列缺陷。首轮新闻卡片/首页图像空白由动画或未滚动加载造成，最终均出现，不记作布局修复。合成图片上的可辨性不能外推为真实品牌照片、任意裁切逐像素 AA 验收，也不等于真机/屏幕阅读器认证。
- 实际完成目录价格/库存/排序与清除、独立比较选择及两产品表、手机遮罩关闭、菜单转搜索、六类搜索结果与 FAQ 深链、FAQ Enter/Space 反馈、艺术家资料和申请、产品报价/试奏与成功引导、资讯分类/空搜索/清除/详情导航。弹窗分别复核名称、点击区、字体、可计算对比度及主要键盘顺序。
- 慢请求演练中，艺术家申请与产品报价在请求未完成时关闭重开并填写新草稿，放行旧请求后新内容与窗口保持；随后新申请/试奏正常提交。合成库最终有两条艺术家申请和三条咨询（报价、试奏、维修），与浏览器操作对应。服务工单 500 后显示错误并保留输入，恢复接口后正常重试；没有向外部发送资料。
- 产品/艺术家/新闻/下载/指南/动态页六类错误及有效空集合均显示可理解的状态；产品重新加载恢复 6 条结果。初始空夹具误用 pageCount=0 被完整集合校验拒绝，保留为无效响应反向证据，之后以有效空集合复验，不把夹具错误当产品缺陷。夹具 productIds 原 pretty JSON 未匹配产品关联，压紧仅本步合成库和生成器后，详情下载及 FAQ 实际显示并补扫。
- 下载按钮真实打开本地合成说明书文本；四秒本地指南视频已播放完毕，缺视频条目不导航外部。最终 after5 原生媒体控件 10 次 Tab 实际经过内部按钮/滑块/菜单、进度条、返回指南、关闭并循环；空格播放后 paused=false、readyState=4、时间推进，关闭按钮 Shift+Tab 回到返回指南，Escape 释放背景。深链首次打开的原焦点在 BODY，该次关闭恢复 BODY，未冒充恢复某个不存在的入口。故障控制文件最终清空；最后一次页面扫描使用 after4；after5 只补媒体 helper，14 个 CSS 文件按内容哈希完全相同，随后单独验证媒体、动态偏好、桌面申请与最终预览。正常最终 28 页扫描窗口控制台 error/warn 为 0，故障注入期间的预期 500 单独保留。
- 证据均在忽略目录 `logs/step12-20261013/`：before/after 页面与弹窗 PNG、`before-routes-still.json`、`after-routes-final.json`、`browser-final-summary.json`、`interaction-evidence.json`、`browser-normal-logs.json`、合成库回执、逐项负例/正例日志、构建/测试/门禁日志。`after-routes-all-passes.json` 保留修复前后全部扫描，final 按每个路由/宽度的最后一次真实运行取值，未将旧问题隐藏成最终通过。日志、素材、产物、凭据和合成库均不提交。

### 提交、生产状态、未决风险与下一步

- 本步独立提交并普通推送既有分支，再按新完整 SHA 确认 GitHub Quality completed/success，并核对本地/远端/CI 三者一致。最终 commit/run 链接在交付回复及忽略目录 `ci-result.json` 提供；本地通过不代替 CI。
- **未部署、无生产数据操作、真实通知、新外部服务或费用支出。** 原 1337/3100/5175 服务 PID/启动时间保持，原演示库未迁移或写入；本步只启动独立合成 API/预览。没有停止无关服务。
- 本地合成内容覆盖全部公开模板与主要流程，不等于真实品牌内容/真实渠道、支付/邮件分享/系统分享、真机触摸、辅助技术或任意 CMS 长文素材的完整验收。品牌仍存在演示钢琴/吉他与管乐定位不符的问题，按用户边界不自行改文案或资料。
- 下一步建议单独开展周期审计与大数据量备份/正常停机预算演练。工具链例外、生产宽限期、真实 RPO/RTO、外部可信锚点和异地不可变留存仍为独立事项；涉及品牌、业务规则、外部服务或费用先询问，不自动进入第 13 步或生产。

第 12 步完成门结果：独立第二轮冻结审查返回 **NO_ACTIONABLE_FINDINGS**，无剩余 P1/P2；筛选遮罩、未知结果重试键与原生媒体 Tab 均关闭。最终全量 395/395、quality、admin-ui、admin-colors、暂存后 BOM 及 diff 检查通过。两个浏览器视口/触控/动态偏好临时覆盖均恢复，合成故障控制清空；独立 API 与最终预览保留，所有原服务不动。此记录用于提交前验收，随后仍须按该提交完整 SHA 完成普通推送和 GitHub CI 核验。

## 第 13 步：周期审计、大数据量备份与停机预算（2026-10-13）

### 目标、现场复核与已确认规则

- 只在 Projects 工作树与指定分支工作，完整阅读交接和修复记录，起点干净。现场核对第 12 步完整 SHA `5329f58f1540aae216903bf68f70c94bfab1297e` 与远端一致，[Quality 38383512338](https://github.com/728792899-create/hushi-wind-website/actions/runs/38383512338) completed/success。
- 原实现没有周期全量核验；手动和备份副本核验共用进程级写 FIFO 与 30 秒交互事务。门闩复核证明副本扫描会等待无关主库任务，排在长扫描后的业务写入可触发既有 10 秒队列超时。素材引用核验整表 `SELECT *`，历史正文增大时会一次性保留全部行。备份 size 为 Prisma Int，现场合成元数据在 2^31−1 字节通过，2^31 与 4 GiB 均出现 Int32 转换错误。
- 用户明确批准：默认每 24 小时自动全量核验；损坏或执行失败记录后台告警，不自动重签、不改变业务写入权限；默认沿用 10 分钟告警去重。仅隔离本地服务启用与演练，不调整生产配置。

### 改动文件与行为变化

- `aural-api/lib/scheduled-audit.js`、`server.js`、两个环境示例：新增严格校验的 `AUDIT_VERIFY_INTERVAL_MS`（默认 86400000，1000–604800000 整数），就绪后检查并最多每分钟检查到期。`MaintenanceRun` 记录 running/success/failed；已完成尝试的开始时间保留跨重启间隔，旧 running 保留为未完成并允许重试。同进程不重叠，部署暂停/停止后不接受新轮次。
- 失败写固定脱敏说明及 `audit_integrity_failed` 严重告警，复用原去重/通知路径，无新增通知渠道。记录或告警持久化失败不掩盖原错误，也不会报告成功。没有自动重签、修复数据或新增业务限制。
- `lib/audit-snapshot.js`、`audit-integrity.js`、`sqlite-transaction.js`：在既有备份目录创建唯一 0700 临时目录，用原 FIFO 在事务外 `VACUUM INTO` 得到 0600 私有副本；复制后离开队列，以独立单连接、`query_only`、500 条分页复用基线/哈希链/触发器验证。扫描前后比较常规文件身份与流式 SHA-256，拒绝符号链接和 sidecar，最后清理本次目录。副本扫描不再占用主写队列或长交互事务；**复制仍占主写队列**，没有声称全程无阻塞。原初始化/追加/CLI 规则不变，私有文件入口不能用于并发修改的活动库。
- `lib/database-backup.js`、`restore-drill.js`：备份与恢复副本核验采用新只读入口，先关闭写连接避免 WAL sidecar；素材引用改为按 id 每 500 行遍历，覆盖负数、不连续 ID 及无引用的中间批次，继续检查缺失素材。单条大正文、素材总数仍可能占用内存，非恒定内存保证。
- `prisma/schema.prisma` 与新迁移 `20261013020000_backup_size_safe_integer`：size 改 REAL / Float，保留 JSON number，SQL CHECK 限制 0..2^53−1 的整数；事务复制全部字段、保留 sqlite_sequence 高水位，非法旧值失败回滚。原演示库未迁移，不可直接让新版服务连接它。
- `scripts/drill-capacity.js`、API package script 与测试：新增 empty/medium/large 固定档位，本仓库 logs 下显式绝对 scratch、拒绝符号链接，不加载 `.env`、不接收已有数据库路径。真正追加签名审计并分块写入素材；各阶段独立子进程记录耗时/RSS/事件循环/CPU/磁盘，并用真实服务入口演练在途 SIGTERM。仅终止本次子进程，正常收尾清除合成库、素材和包，保留报告日志；强杀不保证清理。20 分钟、2 GiB RSS 和 8 GiB 目录检查只是工具观测边界，不是 OS 硬隔离。
- 后台 `SettingsView.vue`：现场手机维护表格截断详情，改为复用既有移动卡片；桌面保留表格，任务/结果采用中文并增加刷新及快照说明。沿用权限与颜色，不改品牌、业务规则。新增/更新审计、调度、容量和停机测试，更新 `docs/periodic-audit-capacity.md`、备份/生命周期文档与交接。

### 测试、反向验证与迁移证据

- 双线程最终 **434/434**（API 213、后台 51、官网 170），0 失败/跳过。`npm run quality`、admin-ui（distChecked=yes）、admin-colors、BOM 与 diff 门禁通过。标准官网构建 **263 文件、50 内联包身份、24 外置实例**通过，API/后台生产依赖审计 0；六项官网工具链例外保持原 2027-01-09 到期日，未升级依赖、延长期限或降低门禁。
- 审计与队列定向组合 **34/34**：1001 条历史及 1001 条链记录跨页篡改、query_only 拒写、同长度文件修改摘要检出、WAL 前序提交捕获、扫描时源库后续追加独立完成、失败清理与相邻文件保留、队列超时不重播、idle 等待。一次性 preload 将副本核验重新接回旧 FIFO，负例确定失败 `snapshot waited for live FIFO`；没有修改共享生产代码制造通过。
- 调度单元与备份恢复组合 **22/22**：默认/非法配置、暂停、防重、跨重启间隔、旧 running、失败脱敏与下轮重试、持久化/告警失败。真实调度 API **2/2**：成功→损坏→去重告警/手动 409→修复→成功，链状态保持、0 通知，另验证 4 GiB 备份元数据列表仍为数字。
- 容量边界 **4/4**：迁移前后所有字段和高水位（删至 501 后 next=502）、0/2^31−1/2^31/4 GiB/MAX_SAFE 精确数字往返，负数/小数/超范围拒绝；非法旧值迁移回滚。1201 条负数/断号内容历史跨三批，首/中/末批缺素材均拒绝且清理完整。CLI 参数/隔离及最终中断测试 **10/10**。
- 从第 12 步**合成库**制作独立迁移副本，`prisma migrate deploy` 后 **34 张原业务表、1587 行原字段完全一致**（不含 migration/SQLite 内部表），size 类型 REAL，后续只读审计通过。未迁移原 `aural-api/prisma/dev.db`。Prisma generate 首次 schema 路径用错失败，按仓库正确路径重跑成功，失败日志保留。
- 真实 main 停机集成 **14/14**：在途周期成功/损坏失败 SIGTERM 均先停止未来 tick，再持久化结果/告警、清理、断开、exit 0；源库启动损坏 exit 1，不 ready、不启动后台、不重签。旧停机断言仍按四个 timer 统计的中途运行有 8 个失败，更新为新增后的五个并精确验证创建/清理 ID 后通过，失败日志保留，未放宽时序断言。

- 独立完成门发现本地容量 CLI 在最后一个子进程退出后收到信号可能仍报告 passed。新增真实父进程 source/cleanup/report 三阶段 × SIGINT/SIGTERM，加清理时期限到期共 7 项：旧实现全部失败；修复延迟成功结论至清理完成，并持续捕获信号至最终异步落盘后再核对预算，10/10 通过。失败优先，不被源码变化状态覆盖；未修改服务实现或容量计算。最终全量重新运行，保留修前 427/427 与修后日志。

### 三档本地容量与正常停机实测

本机 Node 22.23.1、16 GiB RAM / 10 核，固定 `TOKIO_WORKER_THREADS=2`。每档单次观测，文件缓存与宿主竞争未控制，不作为生产 SLA。三份报告均 passed、各轮核心源码前后哈希一致且三档共用同一服务实现，源库保持不变。三档测量早于 CLI 最终信号收尾修复，原报告不改写；服务端生产核心哈希仍与最终代码一致，只有测量 CLI 的收尾结论修复。修复后另重跑 empty 正常路径，不声称用新版 CLI 重跑中/大档。

| 档位 | 签名审计 / 内容历史 / 实写素材 | 一致快照审计 | 备份 / 完整包校验 / 恢复 | SIGTERM 排空：备份 / 恢复 / 周期审计 |
|---|---|---:|---:|---:|
| 空 | 0 / 0 / 0 | 0.026s | 0.051 / 0.032 / 0.074s | 0.025 / 0.045 / 0.008s |
| 中 | 1 万 / 1 万 / 16 MiB | 0.249s | 1.031 / 0.477 / 1.515s | 0.755 / 1.093 / 0.176s |
| 大 | 10 万 / 10 万 / 128 MiB | 3.251s | 16.539 / 12.498 / 49.347s | 17.773 / 17.102 / 2.231s |

- 大档数据库 300,683,264 字节，素材 134,217,728 字节且磁盘实际分配相同（非稀疏）。快照排队/复制/准备约 976ms，副本扫描 2247ms。旧 CLI 形式 live 核验另测 2.386s，与新快照阶段分开计数。
- 大档各单独阶段峰值 RSS 最大约 192.2 MiB；真实服务阶段（含启动和排空）约 212.2 MiB。最大阶段结束目录观测约 3.27 GiB，不称瞬时磁盘峰值。独立恢复阶段事件循环延迟最大 158.5ms；服务阶段最大 64.2ms，完整数据见报告。
- 备份/恢复/周期审计三个真实 SIGTERM 均 exit 0、拒绝新入口、结果分别 success/verified/success，源审计有效且临时目录/锁清理通过。人工门闩等待分别约 8.5/5.1/9.2ms 单列。恢复完整执行 49.35s、门闩处剩余排空 17.10s，**不能推断任意信号时刻或生产负载必定满足预算**。原默认停机 60000ms、业务 maxWait/事务超时与引擎线程数均未提高。
- 对同一大档合成副本，在独立子进程仅把素材引用函数替换为 HEAD 旧整表实现：旧峰值 RSS 677.1 MiB、事件循环最大 2573.2ms、耗时 2.951s；新分页 102.3 MiB、19.1ms、2.469s。RSS 下降约 84.9%；这是单次函数对照，不外推为整个服务提升比例。临时 300 MB 对照副本已清除。

### 浏览器、隔离数据与证据

- 隔离 API `18346` / 后台 `15183`，只有本步合成账号和数据、通知为空。390×844 粗指针及 1440×1000 复核维护记录、手动审计、备份恢复、告警；另以只读账号复核三项手机视图，没有创建备份/恢复/处理告警入口。11 个稳定状态 **782 个文字、207 个控件**，整页溢出、小于 12px 字体、低于 24px 启用目标及可计算文字对比度失败为 0，最低 4.70；可读名称另由原生 AX 复核。范围仅为本步受影响后台页面，不是重复全站认证。
- 实际 UI 创建手动备份并点击恢复演练，结果为“演练通过”；源审计从 2001 正常追加至 2005，续写测试本身只在临时恢复副本。手机维护详情完整换行、刷新可用；桌面表格保留。
- 只在本步合成库临时移除审计保护触发器，真实周期产生 **7 条 failed / 1 条去重严重告警**；手动核验显示 409 提示，审计链状态完全不变。恢复原触发器后重新成功，不重签；告警通过浏览器标记已处理。最终 62 条 success、7 条 failed、0 通知，手动备份 verified。
- 故障已撤销。仅正常停止并重启本次 API，从 5 秒演练周期恢复默认 24 小时；浏览器刷新仍显示已持久化的最后成功记录，没有因重启立刻增加已完成尝试。临时视口/触控覆盖恢复，最终正常窗口 console error/warn 为 0；故障注入时预期 409 单列。两次动画未稳定的标签对比度采样保留在全部扫描记录，稳定复验均通过，没有为消除瞬时结果改变状态颜色。
- 原 1337/3100/5175 的 PID 38296/38321/38344 及 10 月 12 日 23:03:37–39 启动时间不变；原演示库和旧预览不迁移、不重启。
- 证据在忽略目录 `logs/step13-20261013/`：`backup-size-before.json`、`audit-shared-fifo-negative.log`、各专项测试日志、`migration-{before,comparison}.json`/`migration-deploy.log`/`migration-audit.log`、`capacity-summary.json` 和三档 `capacity-current/*/report.json`、分页对照 probe/log、`browser-fault-evidence.json`、`browser-final-{db,summary}.json`、全部 `browser-audits.json` 与 PNG、最终测试/quality/各门禁日志。合成库、凭据、日志及产物均不提交公开仓库。

### 提交、生产状态、未决风险与下一步

- 本步单独提交并普通推送既有分支，再核对新完整 SHA 的 Quality completed/success、annotations 与本地/远端一致性。最终 commit/run 在交付回复和忽略目录 `ci-result.json` 提供；本记录的本地通过不代替 GitHub CI。
- **未部署、无生产数据操作、真实通知、新外部服务或费用。** 仅更新环境示例，未改生产配置；用户原数据、原服务保留。
- 单次合成数据、约 287 MiB 数据库不能代替真实 2 GiB 以上文件恢复、生产并发/磁盘/外部锁或任意正文素材验收。复制期仍可能超过业务等待预算；保留原启动/CLI 长事务边界，强杀、断电、多实例调度、生产 PM2 宽限期及真实 RPO/RTO 均未验收。周期成功只说明副本时点，特权全链重写、整库回滚、基线前历史、外部可信锚点与异地不可变留存仍在保证边界外。
- 下一步建议汇总生产准入清单及未决决策：真实品牌资料、真实数据规模/目标恢复时间、生产管理器预算、可信锚点和异地留存，以及原期内工具链例外复核。涉及业务规则、外部服务、费用或生产继续先取得相应授权，不自动部署或无限扩展本步范围。

第 13 步完成门：独立最终只读复核返回 **NO_ACTIONABLE_FINDINGS**，无剩余 P1/P2；容量 CLI 收尾中断误报已关闭。最终 `*-final-after-signal.log` 记录 434/434、quality、admin-ui（distChecked=yes）、colors、暂存后 BOM 和 diff 门禁通过；`capacity-finalization-core-comparison.json` 明确九个已记录服务/结构文件哈希一致，早期未记录的 CLI/preload 哈希保留 null，不推断补填。最终 empty 通过，中/大档原报告不改写。随后仍须按本次完整提交 SHA 核对推送和 GitHub CI，不能把本地完成门当作已上线。

## 第 14 步：剩余风险、生产准入与发布保护（2026-10-13）

### 目标与现场复核

- 严格限定 Projects 工作树和 `codex/admin-core-redesign`，完整阅读交接/修复记录及 Git 状态与历史；起点工作区干净。第 13 步完整 SHA `b08268b6d295ecce5c0e299329622e193b0fd680` 与远端一致，[Quality 38387765843](https://github.com/728792899-create/hushi-wind-website/actions/runs/38387765843) completed/success。直接 Git 连接首次 Empty reply，使用既有本机代理 10808 只读复核成功，未修改全局 Git 配置。
- 生产 URL 原正则仅排字面 localhost/127.0.0.1，现场反例 `https://`、`https://127.1`、`https://[::1]` 均能通过相应入口；CORS 路径会被当作 origin。安全发布少跑 API/admin 生产依赖审计及官网测试。发布后单次健康请求会把初始化 503 当作失败；回滚仅重启就记录 restored 并移除门禁，尚未确认实际恢复。
- 旧官网部署文档仍推荐 Node 18/20、直接覆盖/重启与破坏历史操作，与现有锁文件、发布保护及用户约束冲突。交接同时保留旧库启动命令与未迁移警告，存在误用风险。备份文档“每日检查”与实际每小时检查、24 小时成功间隔不符。以上均属本地可核实技术修复，不新增业务规则。

### 改动文件与行为变化

- 新 `docs/production-readiness.md`：G01–G11 覆盖版本/CI、运行时、域名/TLS/代理、账号权限、迁移、恢复、周期审计与通知、停机/回滚、真实内容/终端、工具链例外和正式授权；D01–D07 列出品牌资料、RPO/RTO/维护窗口、异地留存/可信锚点、单机或扩展架构、通知责任、待联系状态颜色与发布职责。所有真实环境项均保留待验收，不擅自指定人员、供应商、费用或审批规则。
- `README.md`、`docs/known-limitations.md`、官网 `DEPLOY_README.md` / `docs/DEPLOYMENT.md` 统一指向准入入口；旧指南明确历史停用，Git 历史保留。`CODEX_HANDOFF.md` 移除误接旧库启动命令；`docs/backup-recovery.md` 更正检查频率，留存规则不变。清单明确 `full-acceptance-check` 即使关闭 CRUD 仍登录、check:disk/alert:test 可能写库或真实发通知，不能当只读检查或完整恢复证明。
- `aural-api/lib/production-url.js`、`server.js`、`scripts/preflight.js`：共享 WHATWG URL 解析，拒绝空主机、非 HTTPS、凭证、反斜杠/控制字符、规范化后的 IPv4 127/8、IPv6/映射回环及 localhost；仅对真实 IPv4 作127/8判断，合法 `127.hushi.test` 保留。CORS 显式来源不能有路径/查询/片段，生产来源规范化为 origin；公共站点与上传子路径保留。拒绝日志不回显凭证。没有 DNS 解析、全私网过滤或真实链路保证，不改变开发/公开素材 URL 规则。
- `scripts/safe-deploy.js`：三个遗漏检查补在维护门禁/停机/备份/迁移之前；新发布固定核验本次 admin dist。回滚从已准备的新 release 运行核验脚本，检查旧 release 的 dist，不要求旧版本已有新 helper；实际核验成功后才写 restored 并解除门禁，失败写 failed/rollbackError 并保留门禁。
- `scripts/post-deploy-check.js`、预算共享模块及 `.env.production.example` / `docs/service-lifecycle.md`：所有 HTTP 验收共用就绪截止时间，单请求计时覆盖正文，初始化503、临时连接失败及网关502/504有界重试，明确数据库故障立即失败。就绪默认60000ms、范围1–300000；单请求默认10000、范围1–60000；间隔默认1000、范围1–10000。同步 dist 文件扫描不承诺硬截止。这些是检查参数，不是业务 RTO，不提高应用停机或事务预算。
- 独立审查发现新增参数原本只在发布后校验，会令配置笔误在停机后才失败；已纳入修复范围，共享无副作用 `lib/deployment-readiness-config.js` 在 safe-deploy 主函数第一步、preflight 和独立检查入口分别调用，非法值不得触发维护停机。

### 测试、反向验证与审查

- 新增 `tests/production-url.test.js` 与 `tests/deployment-readiness.test.js`。真实 preflight/server require 入口禁止 `.env` 加载、监听、后台任务，数据库前后均未创建；URL测试28/28。旧两个入口18个非法配置全部被接受，对应18个子测试及2个父测试失败，证据 `production-url-before.log`，新实现 `production-url-after.log`。
- 发布夹具使用独立临时目录，PM2/npm/npx/备份均被模拟；各新增质量门禁逐项失败时旧链接、数据、素材保持，未发生停机/备份/迁移。真实HTTP只在回环随机端口；另以确定性时钟与AbortSignal夹具验证截止和正文挂起，降低CI宿主调度误差。覆盖启动503后成功、连接失败后成功、永久未就绪、数据库明确故障、正文挂起、非法预算和回滚成功/失败保留门禁。修前12项均失败，`deployment-readiness-before-bounded.log`；首轮挂起测试发现旧响应正文不受超时后，只终止本次测试子进程，并加测试自身故障回收以留存完整负例。没有运行真实部署。
- 最终全量 **481/481**（API260、后台51、官网170），固定 `TOKIO_WORKER_THREADS=2`，0失败/跳过；`quality`、admin-ui、admin-colors通过，官网263文件/50内联包身份/24外置实例审计通过，API/admin生产依赖0漏洞。预算前置6个负例修前全失败，修后与URL/运维/生命周期组合60/60。最终日志为 `test-final-config.log`、`quality-final.log`、`deployment-config-{before,final}.log`；完成门及CI核对见本节末。保留中途474/474、随后475/475日志，后者新增认证请求共享截止时间用例。admin-ui首次缺少期望API环境参数拒绝执行；补齐与构建相同的 example.invalid 参数后通过（distChecked=yes），并非跳过检查。

### 浏览器与证据边界

- 本步无前端代码变更。沿用合成后台 `15183` / API `18346` 与官网 `13104` / API `18345` 做新一轮浏览器读取复核，未重启这些服务，不能称其运行了本步新的生产配置分支。新分支的证据来自上述真实入口/回环HTTP/发布模拟测试。
- 在实际 CSS 390×844 和1440×1000下，后台备份/维护与官网产品共六个状态的 scrollWidth 等于视口宽度。只读账号没有创建备份/恢复入口；备份“已创建”“演练通过”“尚未演练”分别显示，维护记录保留快照与不自动重签说明，键盘切换栏目成功。合成只读登录会留下本地登录记录，未改业务内容或触发新备份/通知。
- 保存六张新截图与 `browser-smoke.json`；初次桌面浏览器67%缩放使测量偏离目标，已按实际 innerWidth 校准并覆盖错误尺寸截图，使用完整CSS视口clip避免截图裁切。临时视口覆盖已清除。该步骤是运行回归抽查，未声称重跑第12步全站对比度/真机认证。
- 原1337/3100/5175的PID38296/38321/38344及10月12日23:03:37–39启动时间仍一致，原演示库未连接新版、未迁移。所有日志、合成夹具与截图在忽略目录 `logs/step14-20261013/`，不上传数据库、凭据或本地证据文件。

### 提交、生产状态、未决风险与下一步

- 本步独立提交、普通推送后，核对完整SHA对应的Quality状态与annotations，记录本地/远端一致性；最终commit/run见交付回复及本步`ci-result.json`。本地测试不代替CI成功。
- **未部署、无生产数据或配置操作、无真实通知、新外部服务或费用。** 无新增迁移、依赖升级、业务权限/品牌内容/状态颜色改动；六项工具链例外未延期。
- 剩余边界收敛到准入清单：真实数据量/磁盘/正文素材、超过2GiB文件恢复、强杀/断电、管理器/代理/TLS与通知、真实账号/MFA、真实品牌/终端、RPO/RTO、可信锚点和异地不可变留存。新保护只有本地模拟/回环证据，未验真实PM2及生产回滚；URL校验不证明DNS/证书/链路可用，产物来源清单仍未签名。
- 下一步先由用户补D01–D07中的资料与决策、指定责任与授权范围，再安排对应真实环境或获准副本验收；不自动部署，也不将未决业务问题改写为无限本地加固任务。

第 14 步完成门：第二轮独立只读复核返回 **NO_ACTIONABLE_FINDINGS**，无剩余 P1/P2；预算校验过晚已修复并由6个反向用例证明，文档职责/规则/副作用复核无新增问题。最终481/481、quality、admin-ui（distChecked=yes）、colors、暂存后BOM253文件与diff门禁均通过。浏览器四条后台测量曾仅留在会话工具结果，完成门已重新现场测量并补存，`browser-smoke.json`最终包含六条390/1440记录，与六张PNG对应。生产仍未操作；提交后继续核对完整SHA的远端与CI，不以完成门代替上线验收。

## 上线准备：单机技术方案与统一资料表（2026-10-13）

### 目标与范围确认

- 用户要求结束范围扩展，开始上线前验收；技术方案由 Codex 准备，沿用现有单机，不接新服务、不增加费用。服务器、域名及正式资料后补，资料未齐栏目首发不公开；正式部署前再次确认。本次为文档准备，不新增编号加固阶段。
- 在既有 Projects 工作树及 `codex/admin-core-redesign` 核对起点干净；第 14 步完整 SHA `4e3c95de059094548b14386fb5dedc02c2ae6809` 对应 [Quality 38393475737](https://github.com/728792899-create/hushi-wind-website/actions/runs/38393475737) completed/success。481 项测试为该基线的既有证据，本轮本地未重跑。

### 现场复核、文件与行为变化

- 新增 `docs/single-host-launch-plan.md`：单机目录/网络/配置草案、一次性资料表、公开矩阵、首次初始化与已有站点升级两条路线、恢复边界、验收条件、最终部署确认单。更新 `docs/production-readiness.md` 的已确认/待补状态，修正“上传目录不得公开”为仅批准的素材可以公开；更新 `CODEX_HANDOFF.md`，明确从加固转入上线准备。本记录为第四个改动文件。
- 独立只读复核部署与内容源码：safe-deploy 必须已有 current 旧 release 和 PM2 两个进程，不能空机首发；默认 load-env 不会加载 shared 配置；空库健康依赖管理员与 SystemConfig 的按需初始化；部署写门禁不阻止所有 GET/登录；自动回滚不恢复 uploads 和旧进程环境。方案逐项说明，不绕过保护，不把生产初始化当本轮验收先行执行。
- 匿名 API 的 `published/active` 过滤与修改草稿是不同机制；固定导航/搜索/sitemap/页面回退和公开 uploads 不随记录隐藏完全关闭。本轮只盘点，实际栏目隐藏待用户补首发清单后在本地落地。没有改任何应用源码、依赖、配置示例、数据库、品牌文字或业务规则。

### 验证、提交与生产边界

- 本轮只对四份文档做源码契约、相对链接、BOM 与 diff 核验，再由独立审查复核冻结后的方案。具体检查结果及提交后 CI 记录在本节完成门和忽略目录 `logs/launch-preparation-20261013/`。不新增镜像文档实现的测试。
- 浏览器验证：本轮无运行行为变更，未启动/重启服务、未登录或操作页面，不声称重跑浏览器验收。收到正式内容和目标配置后，对实际候选做 390/1440 及未公开入口反向验证，不能复用旧演示服务结果。
- 独立普通提交、推送既有分支，按本次完整 SHA 核对 Quality 结果与远端一致性；提交/run 在交付回复及本地 `ci-result.json` 记录。本轮本地文档核验不代替该次 CI。
- **未部署、未访问生产、未读真实 .env 或数据库、无真实通知、新服务或费用。** 缺项收敛为目标服务器/域名、首发正式资料及数据来源、恢复目标/维护窗口/责任、单机剩余风险接受；架构和既有权限无需再问。下一步仅按统一资料表补齐并准备具体候选及最终确认单，用户确认之前不执行生产写入或公开入口切换。

本轮文档完成门：部署契约与栏目公开范围两路独立只读复核均返回 **NO_ACTIONABLE_FINDINGS**，无 P1/P2；13 处相对链接全部存在，暂存后 BOM 254 文件及 diff 检查通过，暂存范围仅上述四份 Markdown。详细检查存于 `documentation-checks.json`。本地未重跑自动测试或浏览器；普通推送后由根 Quality 对该文档提交重新运行全量测试和质量检查，并在交付回复附实际结果，不把历史 481 项直接当作新提交的 CI 结论。

## 首发候选：保留原设计、批准素材与公开范围（2026-10-13）

### 目标与授权

- 用户已明确授权部署至迅猫云 `154.222.19.51`，官网使用 `dayouyusd.com`，允许替换旧 A 记录 `38.76.203.179`。沿用单机、不接新服务、不增加费用；不扩展加固轮次。用户随后明确选择保留原官网设计与交互、复用已核实可商用旧素材，仅替换未核实图片，资料不齐栏目首发不公开。
- 在 Projects 工作树与 `codex/admin-core-redesign` 继续，起点 `6ae4d9efc987317f0d0352a47e168567ae38fc59` 的 Quality `38396329490` 已成功；本轮证据另存，不把历史测试当新候选验收。

### 现场复核与最小改动

- 原记录发布状态不足以关闭导航、静态回退、搜索、详情直达与 sitemap。API 新 `lib/public-site-mode.js`、server/preflight 及部署入口增加显式 full/starter；默认 full 保留原行为。starter 匿名仅允许配置投影、公开资讯及既有认证入口，关闭产品/人物等未齐资料接口与个人信息表单/埋点；有效管理员仍走原 RBAC，权限规则未改变。
- 旧令牌访问隐藏资源必须仍返回 401/TOKEN_REVOKED 等会话错误，不能吞成404妨碍后台退出；该独立审查 P2 已修复。safe-deploy 同时显式传入 API/官网模式，测试使用 full、实际构建使用所选模式，避免旧 PM2 环境残留。非法或矛盾模式在维护、停机及迁移之前拒绝；无新增迁移、依赖升级或锁文件改动。
- 官网保留原 NuxtLayout/NuxtPage、Header/Footer、首页、资讯列表/详情、排版与动画，仅按 starter 收起未齐栏目并跳过对应数据请求。原生路由同步、完成事件与滚动流程保留。服务器边界先于静态文件服务，客户端路由同步白名单；SEO、robots、sitemap 与匿名范围一致，不转发预览票据；埋点及浏览器访客标识创建停用。
- 公开内容为三篇原创管乐通用知识及手写 SVG，首页复用旧音乐场景照片 `audio-hero-recording-studio.jpg`，原样保存为 `public/launch-assets/music-studio.jpg`。实际作品 Pexels 36269938 / Lucas Porras 与许可页已核实，来源、用途、许可地址和 SHA-256 写入 `starter-content.json` / `docs/starter-content.md`；不恢复演示型号、虚构艺术家、场地归属和服务承诺。其他来源尚未核实不等于被认定侵权，未纳入本次首发。
- 更新单机方案、准入清单及交接，记录指定部署授权与当前连接阻塞，取消对同一授权的重复询问；目标、费用、业务或数据范围实质变化才另询。

### 测试与反向验证

- 最终 `TOKIO_WORKER_THREADS=2 npm test` **504/504**（API268、后台51、官网185）通过。API 六项真实回环 HTTP 覆盖公开投影、草稿拒绝、匿名未公开入口、无个人信息入库、真实管理员内容编辑、令牌撤销/原 RBAC；部署模拟覆盖模式非法时无副作用和两进程环境一致。官网覆盖真实 Router 跨页/详情/后退、SSR 原设计、静态白名单、预览票据、full兼容、埋点/SEO等。
- 早期导航壳曾出现 URL 已变但仍渲染首页；修前负例及真实浏览器证据保留。最终方案恢复原 NuxtPage 页面结构，导航回归通过；独立最终复核 **NO_ACTIONABLE_FINDINGS**，两个 API/部署 P2 和导航问题均关闭。
- `npm run quality` 通过：API/admin 生产依赖审计无漏洞；官网 **266 个产物文件、50 个内联包身份、24 个外置实例**审计通过。六项工具链例外维持原 2027-01-09 期限，受影响版本未被放入本次来源/产物清单。`check:admin-ui`（distChecked=yes）、`check:admin-colors` 通过；BOM 在暂存新增文件后再核对。
- 以新构建与独立 API 完成22项 HTTP 状态核验及5页 sitemap 白名单：首页、列表、3篇详情/许可图片正常；未公开栏目/静态路径404；咨询/申请/事件POST404。该核验没有连接生产或原演示库。
- 使用独立 Linux x64 容器、Node22.23.3、2CPU/2GiB 限额重新 npm ci 与 Prisma OpenSSL3 生成，未复制本机 macOS node_modules。后台和官网目标域名构建通过；官网50.521秒、采样峰值991.7MiB，未发生OOM。三端生产审计通过；全新合成库35表迁移、真实API/Nuxt Node入口17项路径状态及两个进程SIGTERM exit0通过。初始空库健康因缺管理员/配置而503的负例保留，受控合成初始化后通过；没有绕过健康规则。产物清点无环境文件、数据库或凭据，Linux原生文件仅x64/OpenSSL3；最终部署包还须绑定本次提交，容器证据不等于目标机验收。

### 浏览器、数据与运行证据

- 隔离 API18400、官网13110、后台15190，独立合成库、素材和备份，通知为空。原设计候选采用 `site-original-design` 输出，未复用早期页面壳产物。390×844 与1440×1000 共11个页面/菜单/导航/隐藏页状态，实测 scrollWidth 等于实际 CSS 视口宽度，无空名称控件、低于24px的启用目标或坏图；采样最小字号12px。没有将本轮抽查声称为全站重新逐像素对比度审计。
- 通过键盘完成菜单、首页→资讯→详情、详情切换及浏览器后退；后台实测编辑、保存、刷新仍保留、恢复候选文案。浏览器67%宿主缩放影响 CDP 模拟下鼠标坐标与截图，先核对 innerWidth；双尺寸键盘/DOM证据及完整CSS视口截图保留，清除模拟后重新用正常浏览器鼠标验证菜单与导航。临时视口覆盖撤销，未触发邮件/系统分享或真实通知。
- 浏览器网络实际仅发配置/资讯接口；没有未齐栏目请求或事件上报。后台创建的新完整备份，经UI恢复演练通过：35张表、4个合成素材、10条快照审计，审计续写通过，耗时1248ms；演练副本不覆盖源库。网站内置批准素材随代码版本保留；该小型合成测量不代表生产容量/RTO。
- 证据目录 `logs/launch-dayouyusd-20261013/`：`tests-original-design-final.log`、`quality-original-design-final.log`、两项专项门禁、`http-final.json`、`browser-final.json`、双尺寸PNG、后台编辑/恢复PNG、隔离夹具与Linux候选报告。凭据、数据库、日志、完整构建产物均不提交公开仓库。

### 生产状态与下一步

- **尚未部署、未改 DNS、无生产写入。** 公网 SSH22 超时；用户 VNC 已验证 Ubuntu、内网路由、ssh active、UFW inactive、INPUT ACCEPT 和内网 IPv4 SSH握手，尚未建立经认证的远端会话。下一步只核对云端安全组、公网IP/NAT与路由；无需重装系统或重置SSH。
- 本轮单独提交并普通推送，随后按新完整SHA核对 Quality 与远端一致性；最终 SHA/CI 存于忽略目录 `ci-result.json` 并在交付回复报告。本地候选/构建成功不代表生产验收。
- 提交前暂存后 BOM **267** 个源码文件和 diff 检查通过；暂存44个文件，仅源码、测试、批准素材及文档，无夹具、凭据、数据库、日志或构建包。
- 剩余事项限于恢复公网入口、目标机盘点、按已批准范围安装/初始化/配置TLS与代理、正式账号及上线复验。同机备份不覆盖整机损失、无外部通知和既有工具链例外仍如实保留，不增加新的采购或加固阶段。


## 临时完整站：同机隔离安装与内部验收（2026-10-14）

本节保留 DNS/HTTPS 接入前的阶段记录。以下当时尚未完成的解析、代理接入和开机启动状态，由下一节实际完成结果更新，不再代表当前状态。

### 目标与授权变化

- 用户明确不要精简预览，要求完整项目；最新授权将临时站部署到既有 KingAI 主机 `64.83.10.90`，供客户上传资源，后续可迁移。批准两个独立子域名，不能影响 KingAI、原根域解析，不接收费服务。此为首发交付阶段，未扩展加固编号。
- 起点 `02326674868a9bf3a6daf90d83fd833ea0912de9`，Quality 38407137350 completed/success；工作树干净。本次应用源码未改，跟踪文件仅交接、本文与 `docs/temporary-preview-handoff.md`。

### 已执行的部署与验证

- 在本地 Linux x64 容器重建 full 官网和后台，三端生产审计通过；Node22.23.3 从固定官方镜像提取，不复制 macOS 依赖。部署包 SHA256 `9c257b767bac04c2659773192b1d8d4eda3ab7ea6aa3888d51148ae20fe2a5a2`，运行时包 `2bbe456e7d1d383df2ebf28a18455de6fa85aa5c1bd32976deef45fb59f0ac0e`，远端复核一致。隔离包执行、8项API和17项官网路径、后台资产、迁移及正常停机通过。
- 远端新增 `/srv/hushi-preview`、独立无登录用户、两个systemd服务及slice；无宿主构建、无全局Node替换。API/官网仅监听回环19337/19310。新slice实测1GiB内存上限、CPU50%单核、读写各10MB/s、swap0、TasksMax128；该限额约束胡氏进程，不意味着现有共享Caddy的流量也有独立限额。
- 新数据库执行7个迁移、导入49条14模型展示内容和23个资源。过滤本地账号、咨询、申请、会话、审计/告警及测试草稿；生成独立管理员和editor客户账号。客户editor同时有文章/CMS编辑能力，不误称纯上传角色。产品、人物与品牌材料仍是原演示，待确认，必须处于门禁后；没有认定全部旧素材商业授权已核实。
- 独立Caddy2.6.2代理经SSH回环转发完成38项真实请求：匿名网页/API/uploads拒绝、错误口令不能签发Cookie、畸形Cookie拒绝、正确门禁签发、Bearer保留、两账号登录、客户上传PNG/下载字节一致、产品写和删除403、管理员只清理验收图片、六个完整页面200及no-store/noindex。清理了两次验收生成的图片，无真实客户资源操作。
- 目标Caddy语义复核发现并修正候选路由排序、`redir * / 303`与显式回环bind；独立测试服务最终只绑定127.0.0.1。审查中注释意外包含门禁Cookie，开放前已轮换并删除敏感注释，38项重新通过。测试代理和19480/19481转发结束后关闭。静态Cookie的浏览器Max-Age为7天，不等于服务器自动撤销；彻底撤销须轮换Cookie/门禁口令或撤站。
- 同机小库备份调用1.062s、隔离恢复调用1.309s：35张表、23资源、审计校验和追加通过，源库不变、临时副本清理成功；不是生产大数据量或整机故障RTO。没有新增异地留存和真实通知。
- 合并Caddy候选在目标2.6.2 adapt/validate通过，原三个Host规范化路由保持一致；比较仅忽略自动group标识与验证文件自身hide路径。原配置字节保持、SHA256仍为 `f77e9ec01e3a454c71dc7572d57651a22195f68e45c8f507228ad94701a99300`。未将候选加载到现有代理。

### 浏览器、生产状态与未完成门

- 阿里云已登录并进入添加解析流程；首条曾到变更确认框，但控制工具多次timeout/noWindowsAvailable，随后列表与权威DNS仍确认两新域名不存在。没有成功DNS保存证据，不声称正在等待传播。原 `@` 仍为38.76.203.179，未修改KingAI解析。
- 远端胡氏服务内部已运行；现有KingAI四容器ID/启动状态、Caddy PID376641保持，KingAI本机及外部health均200。未重启KingAI/宿主机或reload现有Caddy；独立服务尚未enable。公网TLS、真实域名浏览器两层登录和客户可用入口均未完成，因此不能称已上线。
- 下一步仅恢复可用浏览器控制完成两条A记录，核验权威DNS后，获取KingAI升级操作锁并检查无在途升级，备份当时完整配置，只追加胡氏import并验证全配置后平滑reload。不得用预览片段整体替换现有代理。验证TLS、门禁、浏览器上传与KingAI状态，再启用胡氏开机启动并交付独立凭据。
- 本轮证据位于忽略目录 `logs/temporary-server-20261013/`，包含产物/运行报告、38项结果、备份恢复、候选检查和阶段状态。凭据/env/代理秘密/数据库/构建包不提交。此次文档检查与CI另记，不把旧504项测试声称本轮本地重跑。

## 临时完整站：DNS、HTTPS 接入与受保护访问验收（2026-10-14）

### 目标、范围与文件

- 按用户已批准的临时完整站范围完成两个子域名接入、门禁和客户上传路径验证；不恢复 starter 精简版，不扩展加固阶段、外部服务或费用。运行应用仍为 `02326674868a9bf3a6daf90d83fd833ea0912de9`，原 full 设计与权限规则保持。
- 本轮跟踪文件仅 `CODEX_HANDOFF.md`、本文、`docs/temporary-preview-handoff.md`，用于纠正最新状态并保留历史阶段证据；未修改应用源码。远端实际变更限于两条新 DNS、胡氏 Caddy 片段及主配置 import、两个胡氏服务开机启动和已授权验收数据。

### DNS、代理激活与同机保护

- 阿里云保存 `preview → 64.83.10.90`、`admin.preview → 64.83.10.90` 两条 A 记录，原 `@ → 38.76.203.179` 保持。分别向 `dns13.hichina.com`、`dns14.hichina.com` 核验；UI 三条记录截图 `dns-records-confirmed.jpg` 已保存，不再将早期 NXDOMAIN 或点击失败作为当前状态。
- 激活前取得 `/var/lib/kingai-upgrader/operation.lock` 的非阻塞文件锁，在整个配置事务、探针与失败回滚范围内持有。按现场执行器状态检查无活动升级，核对原主配置 SHA256 `f77e9ec01e3a454c71dc7572d57651a22195f68e45c8f507228ad94701a99300` 与原三个 Host 规范化路由；完整主配置备份权限 0600。安装 `/etc/caddy/hushi-preview.Caddyfile` 为 root:caddy 0640，仅向主配置追加 import，验证完整配置后 `systemctl reload caddy`，没有 restart。激活脚本已通过 13 项本地事务模拟；失败回滚仅恢复自身精确匹配的变更，避免覆盖并发修改。
- `activation-result.json` 记录 activated=true、lockHeld=true、rollback=not_needed；主配置安装后 SHA256 为 `81153b46462b0812e4556cfb17b26c560bfef5c1b79ba12892cc2309fa219cd7`。原 `kingai.top`、`www.kingai.top`、`canvas.kingai.top` 路由保持，Caddy PID 376641 及四容器 ID/启动时间前后一致。
- KingAI 本机/外部健康及 Canvas 本机/外部页面四个探针前后均 200。收尾只读复核 `kingai-final-readonly.json` 再次确认快照与激活前一致、四个探针均 200。Canvas 没有 Docker Health 状态，其页面 200 仅作为可访问性证据，不冒充业务 API 健康验证。没有重启 KingAI、宿主机或改写 KingAI 业务数据。
- 激活事务自身未启用开机启动；后续仅启用 `hushi-preview-api.service`、`hushi-preview-web.service`，现场均确认 enabled/active。没有以重启宿主机方式演练开机启动，也没有改变现有 KingAI 服务的启用状态。

### 可信 HTTPS 与 38 项真实请求证据

- 两个真实域名均通过正常 CA 信任链及主机名验证，TLS1.3，证书签发者为 Let's Encrypt YE1。官网证书有效期为北京时间 2026-10-14 00:01:46 至 2027-01-12 00:01:45；后台为 2026-10-14 00:01:28 至 2027-01-12 00:01:27。未关闭证书验证，未将签发成功称为续期演练通过。
- 在真实 HTTPS 下重新执行 **38/38** 项检查：两域匿名网页/API/uploads 拒绝、错误门禁口令与畸形 Cookie 拒绝、正确门禁会话、独立 owner/editor 登录、原 Bearer 认证保留、editor 产品写入/账号列表/删除资源 403、客户通过 API 上传 PNG 并下载验证、六个完整页面 200、no-store/noindex 及初始化后应用健康通过。管理员只清理本次合成 PNG，未触碰其他资源；验证阶段没有再次 reload 或 restart。
- 证据位于忽略目录 `logs/temporary-server-20261013/`：`activation-result.json`、`https-preview-checks.json`、`https-acceptance-summary.json`、`https-certificates-local.json` 与 DNS 截图。此前 `backup-restore-check.json` 的 35 表、23 资源、审计核验及源库不变仍为小库同机演练，不代表大数据量或整机故障 RTO。

### 浏览器、资料与验收边界

- 阿里云 DNS 管理 UI 的三条记录已目视确认并截图。临时官网/后台的最终浏览器验收另计：两域根路径及 robots 导航均返回 `net::ERR_BLOCKED_BY_CLIENT`，打开面板显示无法访问此站点，读取错误页时工具明确返回 browser URL policy blocks。已停止尝试，不通过其他浏览器、代理或替代入口绕过工具策略；不能据此认定服务器 HTTPS 故障。
- **最终页面目视、手机/桌面显示和浏览器 UI 上传未完成。** 上述 38 项中的上传是 API 请求，六页 200 也不证明页面视觉与交互正确，均不得写成浏览器通过。
- `客户访问资料.txt`、`站主专用资料.txt` 已生成到本地忽略目录，权限均为 0600，需分别私下交付；没有输出或提交门禁口令、Cookie、账号密码、私钥和环境配置。原产品、人物、品牌承诺及素材仍待客户核实，仅在门禁后保留，不称全部素材已获商业授权。门禁 Cookie 的浏览器 7 天期限不等于服务端自动撤销。

### 提交、线上状态、未决事项与下一步

- 应用原完整 SHA 对应 [Quality 38407137350](https://github.com/728792899-create/hushi-wind-website/actions/runs/38407137350) 已成功；本次没有重跑应用测试。本轮三份文档检查 BOM、diff 与引用后，独立普通提交/推送并核对新完整 SHA 的 CI，结果由交付回复及本地 CI 证据记录，不能沿用应用历史 CI 作为新文档提交的结果。
- **受保护临时完整站已完成部署、DNS/HTTPS 与 API 访问验收，可使用独立凭据访问；匿名正式品牌上线和最终浏览器界面验收未完成。** 原根域解析保持，不新增收费服务，不回到旧主机排障或扩展新阶段。
- 剩余事项为可获准的浏览器页面/上传验收、私有资料交付与客户正式资料替换确认，以及本轮文档提交/推送/CI。共享 Caddy、同机备份、未做整机重启/故障演练和素材/品牌真实性的既有边界保留。后续迁移取临时站最新一致性数据库与成套 uploads，不以初始展示包覆盖客户新写入。


## 官网取消首次访问验证（2026-10-14）

### 目标与变更

- 用户明确要求去掉第一次打开官网的验证，范围仅 `preview.dayouyusd.com`。后台 `admin.preview.dayouyusd.com` 的外层门禁、应用账号和既有 RBAC 保持；KingAI、原根域解析、内容数据库和素材内容未改。官网展示内容与资源现在匿名可访问，保留 noindex/no-store；这不是素材许可或品牌宣称已核实的证明。
- 现场核对起点 `fe2e506dc3dd8e606be4c1f474e1e42a9daab057`、工作树干净。线上仅替换 `/etc/caddy/hushi-preview.Caddyfile` 中官网 Host：公开页面及其实际使用的 GET/HEAD API、events/inquiries/artist-applications 三类既有公开 POST 与 uploads 读取；其余管理、认证、上传及内容写入 API 在官网 Host 拒绝。
- 公开请求清除 Authorization/Cookie，避免公开读取因后台凭据变为管理视图。保留后台原门禁与 Bearer 传递。白名单按精确路径层级匹配，未使用会同时匹配 versions/restore 的宽泛文章或页面通配符。
- 跟踪文件仅本记录、`CODEX_HANDOFF.md`、`docs/temporary-preview-handoff.md`；私有客户/站主资料同步注明官网免口令、后台仍使用原有凭据。代理配置、事务脚本和证据在忽略目录，不包含在公开提交中。

### 现场执行与验证

- 目标相同 Caddy 2.6.2 在本地离线适配通过，后台及 KingAI 三域的适配后路由结构完全一致，无须忽略自动 group 标识；11 项本地事务/失败回滚模拟通过。独立复核无待修问题。
- 持既有升级操作锁，确认无活动升级，校验原主配置与片段 SHA，备份旧片段，再验证完整配置并平滑 reload。主配置 SHA 仍为 `81153b46462b0812e4556cfb17b26c560bfef5c1b79ba12892cc2309fa219cd7`；新片段 SHA 为 `3e310aed25293c37cc2ebf65cce171ae76fd40d736e878368a199e15c2434edd`。`public-preview-activation.json` 记录 opened=true、mainFileModified=false、serviceRestartPerformed=false、无需回滚。
- Caddy PID 和四个 KingAI 容器 ID/启动时间前后一致，KingAI 内外健康、Canvas 内外页面四个探针均 200；没有重启现有服务或宿主机。Canvas 页面可访问不等于完整业务 API 验收。
- 本机正常 CA/主机名验证的真实 HTTPS 回归 **50/50 通过**：六个官网栏目匿名 200，无 WWW-Authenticate；12 个公开集合 API、展示图片和 robots 正常；缓存/索引响应头保留；官网管理 API 即使带门禁 Cookie/应用令牌也拒绝；后台无门禁仍 401，通过门禁后仍须应用账号，客户登录/Bearer会话及账号管理 403 正常。早期检查遇到连接重置，最终采用限定次数传输重试，只有完整执行后才标记通过；详见 `public-preview-checks.json` 的 completed 和 transportRetries。
- 本次没有浏览器操作，仍保留此前工具访问策略阻塞的限制，不绕过、不声称页面目视或 UI 上传验收通过；用户可刷新官网直接查看。本轮不新增资料、表单规则、权限、付费服务或功能。

### 记录、提交与剩余边界

- 文档执行 BOM 和 diff 检查；普通独立提交推送，随后按新完整 SHA 核对 Quality 的 npm test / npm run quality，CI 结果存于本地并在交付回复报告，不复用之前的 CI 结论。
- 已执行的是用户授权的官网免口令访问变更。后台保护保持、原设计和内容保持；当前演示资料仍待客户核实或替换，搜索引擎 noindex 不是访问限制。下一步仅继续用户页面验收和客户资源替换，不扩展加固范围。


## 后台取消首次验证与客户账号替换（2026-10-14）

### 目标、现场复核与变更

- 用户要求取消后台首次浏览器验证、登录名改为 `admin`。原指定密码不符合生产 12–64 位且包含大小写字母、数字和符号的规则；用户随后授权采用方便输入的密码。采用符合规则的 12 位密码，凭据仅私下交付，没有降低密码规则、修改生产初始化环境或绕过 API 直接写库。
- 起点为已推送的 `84b8dd621a90af8551c2d74a8f50d7e5c6bd8471`，工作树干净。现场账号只有独立 super_admin 站主和 editor 客户，均 active；目标用户名未占用。现有账号更新接口不支持改名，因此通过已有审计 API 先创建 disabled 的 `admin`，显式指定 editor，核对权限与原客户一致，再启用并验证登录，最后停用旧客户账号。旧账号及其历史保留，站主 ID/角色/状态/权限/2FA 保持。
- 仅替换 `/etc/caddy/hushi-preview.Caddyfile` 中后台 Host：移除外层门禁，显式重建 API/uploads 匹配器，保留正常应用 Bearer 鉴权、静态 SPA、noindex/no-store 和 robots；剥离浏览器残留 Basic Authorization 与 Cookie。官网 Host 字节保持，官网 API 白名单不变。旧门禁 snippet 仍存在但不再被任一 Host 引用，不再参与请求处理。
- 跟踪文件仅 `CODEX_HANDOFF.md`、本记录、`docs/temporary-preview-handoff.md`；私有客户/站主资料已同步为单层登录。密码、代理片段、脚本与证据位于忽略目录 `logs/temporary-server-20261013/`，不进入 Git。

### 执行、反向验证与 KingAI 边界

- 目标相同 Caddy 2.6.2 本地离线适配通过，官网与 KingAI 三个 Host 的适配结构完全不变，11 项本地事务/回滚模拟通过，独立复核无待修问题。
- 持既有升级操作锁，确认 74 个历史升级任务均已终结、无活动升级；核对主配置、片段、候选及事务 helper 固定 SHA，备份旧片段，验证完整配置并平滑 reload。`password-only-admin-activation.json` 记录 opened=true、mainFileModified=false、serviceRestartPerformed=false、无需回滚。
- 主 Caddy SHA 保持 `81153b46462b0812e4556cfb17b26c560bfef5c1b79ba12892cc2309fa219cd7`，新片段 SHA 为 `8f5464adbab2f1e78c478fc6737ba2a3b07ea44a91bd26aaded03b724857d228`。Caddy PID 376641、四个 KingAI 容器 ID/启动时间均前后一致；KingAI 内外健康与 Canvas 内外页面四探针均 200。没有重启 KingAI、宿主机或胡氏应用服务。
- `client-account-change.json` 记录新客户登录/权限核对、旧客户登录与旧 Bearer 会话均被 401 拒绝、站主保持、CREATE/UPDATE 审计可查。`password-only-audit-integrity.json` 返回 ok=true，15 条审计记录及链验证通过。账号替换是顺序执行，不宣称是原子改名。

- 真实 HTTPS 最终 **64/64** 通过，`password-only-admin-checks.json` 的 completed/passed 均为 true：后台匿名 SPA/static 无 WWW-Authenticate；残留 Basic 不挑战；生产密码策略 12–64 位复杂度不变；新 editor 客户登录、Bearer 和 30 分钟空闲/12 小时绝对会话策略保持；匿名会话/账号/上传 401，客户账号管理/产品写入/删除 403；官网六页、12 个公开集合 API、图片及 robots 正常，官网管理路径带 Bearer 仍拒绝。首次执行 62 项断言通过后末尾传输中断，未标通过，保留 first-attempt 证据；有界复跑完整通过。

### 记录与剩余边界

- 用户指定用户名 `admin` 会触发现有就绪报告 credentials 的 critical 提示：代码只要存在启用的该用户名即告警，不区分 editor/super_admin 或密码强度。该提示不阻断登录；角色仍为 editor。以后停用该名称还需满足已有默认账号保护（7 天备份、另一超管、操作者 2FA 和敏感确认），本步不修改或隐藏这些规则。
- 未进行浏览器操作；此前工具明确的 URL policy 拦截仍作为验收限制，不绕过、不声称浏览器页面目视或 UI 上传已通过。当前为完整临时站，正式品牌/素材验收、同机备份和迁移边界保持，没有扩展功能或增加费用。
- 文档执行 BOM、diff 及秘密泄露检查，独立普通提交推送，按新完整 SHA 确认 Quality 的 npm test / npm run quality；对应 CI 结果存本地并在交付回复报告。本轮无应用源码改动，不把历史测试冒充本轮测试。
- 下一步仅由用户/客户使用新账号验证页面并替换资料，不继续扩展加固范围。


## 按用户授权开放客户 admin 全部后台权限（2026-10-14）

- **目标与授权**：用户先要求自行替换产品、艺术家、首页素材，随后明确扩大为“给 admin 开放所有后台权限”。以最新指令为准，采用现有超级管理员角色，不新增角色/权限规则、不扩展功能。
- **现场与改动**：起点 `dbcdc8ecea66f31b45b947ff1208e09492ca2d8b` 已推送且工作树干净。由独立站主调用 `PUT /api/admin/users/3`，仅提交 `role: super_admin`；服务端同一事务更新账号并追加审计。目标账号 ID 3、用户名、密码、状态、显示名和 2FA 保持；站主不变，旧 `hushi_client` 仍 disabled。没有直接写库或修改初始化环境。
- **行为**：`admin` 获得既有 `permissions: ["*"]` 的全部后台权限，包括产品、艺术家、首页配置与系统维护/账号管理。API 每次按账号 ID 读取当前角色，原未过期会话立即按新权限授权；新登录同样通过，密码未改。后台保存未提交内容后刷新即可加载完整菜单。敏感确认、版本冲突、默认账号停用保护等原规则不变。
- **验证**：`admin-full-permissions-result.json` 完整 **51/51** 通过，completed/passed 均 true。覆盖原会话与原密码新登录、全权限返回、账号/日志/备份记录/维护/告警/资源/CRM 读取 200；产品与艺术家写入权限检查通过后，不存在 ID 返回 404；首页配置缺版本返回 428；资源替换、删除、备份及密码重置缺确认均 400，未执行真实敏感操作。匿名会话/账号仍 401，官网 Host 的管理 API 带令牌仍 404。产品、艺术家和配置前后数据一致；角色 UPDATE 审计记录及全部 **16 条**审计链核验通过。
- **KingAI 与线上状态**：此次只有胡氏账号授权数据变更，未部署应用、改 Caddy 或重启任何服务。`admin-full-permissions-before.json` / `after.json` 的 Caddy、四容器身份和 KingAI 内外健康/Canvas 内外页面四探针完全相同，均 200；原代理 SHA 不变。
- **文件与交付**：跟踪文件为本记录、`CODEX_HANDOFF.md`、`docs/temporary-preview-handoff.md`；私有客户/站主说明同步新角色，凭据未改且不进入 Git。BOM、diff 与凭据检查后独立普通提交推送，并按该完整 SHA 确认 CI 的 npm test / npm run quality；证据另存忽略目录，最终结果在交付回复报告。
- **浏览器和剩余边界**：此前浏览器 URL policy 拦截仍保留，不绕过、不声称 UI 点击编辑已验收。用户明确授权的全后台权限包含账号、删除、备份和系统维护，不再把本账号称为受限客户编辑账号。用户名 admin 的既有就绪提示仍存在，未修改或隐藏。下一步由客户刷新后台自行替换内容；不扩展加固范围。


## 客户正式后台操作手册交付（2026-10-14）

- **目标与范围**：按用户要求制作可直接交给客户的正式教程，覆盖后台功能、资料上传与替换以及完整日常操作。本轮仅文档交付，不扩展加固或应用功能，不改变账号、权限、业务规则、线上配置和数据。
- **现场复核**：起点 `ea34c39cfc65aa6932cae884fcadd11d04412a6e` 已推送且工作树干净。逐项核对实际后台组件、路由和 API；两路独立复核分别覆盖内容编辑/发布与账号/素材/CRM/维护。修正未由界面支持的字段、筛选项及日志入口描述，不将内部 API 能力写作客户可点击的按钮。
- **文件与内容**：新增 `docs/client-guides/胡氏管乐官网后台操作手册.docx` 及同名 Markdown 源稿，并更新本记录和 `CODEX_HANDOFF.md`。手册版本 1.0，共 26 页、20 章、12 张表，具有可跳转目录与页码；涵盖登录、素材准备/上传/引用/替换、产品/首页/资讯/艺术家/服务栏目、下载与视频、草稿预览发布、咨询合作申请、团队账号/两步验证、设置维护、审计备份、历史版本与回收站、FAQ 及交接检查清单。明确区分上传与发布、历史内容恢复与备份恢复演练，不收录密码或服务器凭据。
- **文档验证**：最终 DOCX 26 页、20 个目录锚点与 20 个对应书签一致、12 张表；SHA-256 为 `998683ed72e646947966e9fd031ebcc18bd3316065fcc8146cc7ea5ed07ef804`。完成所有页面渲染及逐页目视，中文字体、页码、表格和分页可读，无截断、重叠或溢出；最后修正第 12 页正文标记示例后再次渲染，该页重新检查，其余 25 页像素不变。结构报告、事实核对、渲染与截图位于忽略目录 `logs/admin-manual-20261014/`，仅交付 Word 正文及可维护源稿。
- **浏览器与生产边界**：此前访问工具明确返回线上域名 URL policy 拦截，本轮不绕过、不声称已做线上逐按钮或上传验收；本次验收对象为正式文档及其渲染。没有远端写入、部署、服务重启或 KingAI 变更。线上应用仍为原版本，客户 admin 的已授权全权限保持。
- **提交与测试口径**：文档执行 BOM、diff、凭据/链接及 DOCX 结构检查；本轮没有应用源码变更，不额外声称已重跑本地应用测试。独立普通提交推送后，按新完整 SHA 核对 Quality 的测试和构建，CI 结果在交付回复及本地 `ci-result.json` 记录，不复用历史成功结论。
- **剩余边界与下一步**：手册描述当前实现，不代表演示品牌事实、素材许可或实际恢复生产已验收；未来后台字段、按钮或域名变化时应同步文档。下一步由客户按手册维护正式资料，应用改动或线上操作仍按后续明确任务执行。


## 客户图文详解版 PDF 手册交付（2026-10-14）

- **目标与范围**：用户要求另提供可直接发给客户的 PDF，并增加大量配套图片。保留原教程全部 20 章，制作横向 A4 图文版 1.1；本次只交付文档，没有新增应用功能、权限规则或生产操作。起点 `2b8bbef24295ae21f18ec1771a3c4529b8ebaee5`，分支 `codex/admin-core-redesign`，工作树干净。
- **文件与内容变化**：新增 `docs/client-guides/胡氏管乐官网后台操作手册-图文详解版.pdf` 及同名 Markdown 正文源稿，更新本记录与 `CODEX_HANDOFF.md`。成品 81 页、52 张真实界面截图、5 张矢量流程图，涵盖上传成功与素材引用、产品主图/图集/参数、首页/品牌、新闻/艺术家/栏目、附件与视频、草稿/预览/发布、咨询/合作申请、团队/两步验证、运行信息、审计/备份/恢复及常见问题。操作图附菜单路径和说明，重点按钮配编号框；长表单分段展示。旧 Word 1.0 及旧源稿保留，新版纠正现场发现的不一致。
- **本地浏览器证据**：新建已迁移的独立合成数据库及素材目录，API18414/后台15194/官网13194 只监听 127.0.0.1；不接触原演示库或线上库。教学账号、产品、人物、咨询及文件均为虚构，配图采用自制教学示意素材。通过真实后台拍摄操作界面并完成一次 PNG 上传；历史版本、修改草稿、回收记录及备份演练结果来自真实本地操作。恢复结果核对 35 表、9 资源、11 条快照审计及临时副本续写，源库不变、临时目录清理通过；不将该小型教学结果外推为生产恢复能力。拍摄完成后仅停止本次教学浏览器和三个教学服务，原有本地及线上服务保持。
- **现场限制的如实记录**：分类目录组件未注册 Radio 控件，实际“产品系列”切换不响应。未为截图伪造已修复界面，未改应用源码；第 6 章和 FAQ 明确此限制，展示可用的产品表单系列选择，系列目录操作交由维护人员处理。只有乐器分类具有参数模板，系列没有该字段。页脚固定显示、按钮目标固定等既有边界同样写明。
- **PDF 验证**：完整渲染并分段逐页目视复核，修正标注与说明错配、分类窗口下缘截断及过窄长表单；修订页重新查看，未变页使用像素比对承接已完成的目视检查。20 个章节、52 个独立配图页和 5 个流程完整，目录显示页码与点击目标一致，77 个内部链接有效；中文字体子集嵌入。PDF SHA-256 为 `f97979ce026b056135a472f792e7093864c3540281f633e692d9d21448314bea`，7,803,458 字节。文档不含登录密码、服务器凭据、2FA 密钥或真实客户私人资料，明确截图中的教学账号与正式 admin 的区别。
- **证据归档与提交口径**：构建报告、源截图、配图清单、生成器、文档渲染、逐页复核与内部跳转报告保留在忽略目录 `logs/admin-pdf-20261014/`。仅提交两份文档产物、两份交付记录及 `.gitattributes` 的 PDF binary 声明，不提交教学数据库、凭据、原图或运行日志。生成的 PDF 使用 ASCII85 流，Git 初次将其当文本检查空白；添加正确的二进制属性后保持成品字节不变，不修改 PDF 内部格式来迎合源码空白规则。执行 BOM、diff、结构/链接/敏感信息检查；本次未改应用代码，不额外声称重跑本地全量应用测试。普通独立提交推送后按新完整 SHA 核对 Quality 的 npm test / npm run quality，实际结果在交付回复及本地 `ci-result.json` 记录。
- **线上状态、风险与下一步**：没有远端写入、部署、反向代理调整、服务重启或 KingAI 变更；正式客户账号和既有权限保持。线上浏览器工具策略阻塞的历史限制未绕过，本次截图和上传验收仅属于独立本地教学环境。文档可直接交付客户，后续界面、域名或流程变更须同步；系列目录切换问题仍待独立应用修复。下一步按手册完成客户正式资料替换，不扩大本轮范围。


## 产品系列切换修复与后台静态发布准备（2026-10-14）

- **目标与授权**：用户要求修复“产品系列”点击无响应，测试通过后同步上线并更新图文 PDF，保持 KingAI 不受影响。工作区起点 `1d7057d1b0792210266cfe5994f658f845e6c0f5`；已有 PDF 从长名改为短名的未提交变化予以保留，本应用提交不包含该重命名。
- **现场复核与最小修改**：真实本地后台确认 `CatalogManager.vue` 渲染了未解析的 `el-radio-group` / `el-radio-button`，点击不切换。显式引入两个 Element Plus 组件；分类/系列切换增加未保存确认，保存中和确认中禁止切换；取消后恢复原选中状态与键盘焦点，确认后清空旧表单。分类仍有参数模板、系列仍按已有 API 关联分类，不新增权限或业务规则。应用文件仅该组件与 `aural-admin/tests/catalog-manager.test.mjs`。
- **测试与反向证据**：新增 4 项测试覆盖实际编译模板与 Radio 注册/禁用、未保存取消和确认、无修改不提示/重复切换锁定、系列保存 endpoint 与保存中锁定。旧 HEAD 源码夹具真实触发未注册警告并使回归断言失败。最终 `TOKIO_WORKER_THREADS=2 npm test` **508/508**（API268/后台55/官网185）；`npm run quality`、`check:admin-ui`、颜色和 BOM 门禁通过，六项原工具链例外保持。独立代码复核及完成门均无待修问题。
- **浏览器证据**：独立合成 API18414 与生产式后台预览15194，14 项真实浏览器断言通过：分类/系列切换、新增、修改、刷新持久化、未保存取消/丢弃、保存中双控件禁用、左右方向键和本地测试记录清理。1440与390宽度无整页横向溢出，Radio目标86×30、字号14px，最终控制台无警告/错误。未触碰原演示库或线上资料，PDF新配图由该环境真实界面取得。线上浏览器此前明确URL policy阻塞未绕过，不将本地点击验证称作线上UI验收。
- **发布准备与保护**：仅发布 `aural-admin/dist`：增量追加散列资源、原入口最后原子替换、完整备份原dist并保留旧资源。同名不同内容/非散列新增文件/候选或current漂移拒绝；持既有KingAI升级操作锁，核对无活动升级、四容器及Caddy/胡氏进程身份、配置SHA和健康；失败校验本次入口后回退，遇并发修改保留。脚本19项本地成功/故障/回退演练通过并独立复核；脚本及证据只在忽略目录 `logs/catalog-series-fix-20261014/`。
- **当前状态与下一步**：本记录截至应用提交前尚未远端发布。先普通提交推送并确认本次完整SHA的CI，再绑定该SHA上传静态候选、只读预检、执行授权发布、核验真实HTTPS每个产物的字节及KingAI前后状态，最后补充发布证据和PDF1.2交付记录。不改API/web版本、数据库、账号、权限、DNS或Caddy，不重启任何服务。


## 产品系列上线验收与 PDF 1.2 更新（2026-10-14）

- **提交与发布基线**：应用修复提交 `c5f9cfe41b1dfb38f62e161463694321e429fd0f` 已普通推送，精确SHA对应 [Quality 38518653397](https://github.com/728792899-create/hushi-wind-website/actions/runs/38518653397) completed/success 后执行发布。发布前19项模拟及独立完成门通过，线上只读预检成功，候选27文件/1,683,811字节绑定同一SHA；manifest SHA `36f649dd95faae121c8f502ba98178f4007e01e555279f760b4cdfb3fbad2697`，发布脚本SHA `4aab9135c2aae194ba394e826085cfdd5b6a951052bdca45d516a457423cd310` 上传后再次核对。
- **线上行为与回退**：持既有协作锁，确认无活动升级，完整备份原后台dist至私有 `incoming/admin-backup-9644b891c94a403c8fc9891ee27995a2`，仅追加13个新散列资源、保留13个一致资源及旧版资源，最后原子替换index。`deploy-result.json` success/activated=true、rollback=not_needed；真实HTTPS27个候选文件与入口逐字节核验通过，本机独立HTTPS再次27/27通过。无需用户迁移或重新配置，已打开的后台先保存编辑再刷新即可使用。
- **KingAI与数据边界**：主Caddy配置SHA仍 `81153b46462b0812e4556cfb17b26c560bfef5c1b79ba12892cc2309fa219cd7`，胡氏片段仍 `8f5464adbab2f1e78c478fc6737ba2a3b07ea44a91bd26aaded03b724857d228`。前后Caddy PID376641、四个KingAI容器ID/启动时间、胡氏API429970/web429971进程均一致；KingAI内外健康及Canvas内外页面四探针全部200，官网首页200、后台匿名session401保持。serviceOperations=false、databaseWrites=false；未reload/restart、未碰KingAI业务数据、未改账号权限或代理。API/官网仍运行原 `0232667`，只更新后台静态文件。Canvas页面探针不代表其完整业务API验收。
- **浏览器与证据口径**：修复后真实交互、保存/刷新与390/1440验证均在本地合成环境完成，14/14通过；线上以产物散列和HTTPS进行验收。此前线上浏览器URL policy限制未绕过，不把本地截图或文件一致性称为线上UI逐按钮验收。合成API18414/后台15194及本次浏览器在完成新配图后停止，原本地服务保持。
- **PDF与改动文件**：更新图文正文MD并保留用户短名 `docs/client-guides/胡氏管乐官网后台操作手册.pdf`，旧长名PDF随重命名移除；旧Word1.0和源稿未改。版本1.2仍为81页/20章/52张真实截图/5张流程图/77个有效内部跳转；6.3节、FAQ及图13/14改为可用的系列切换、归属选择、新增编辑、保存后核对，补充未保存保护说明。两张新图为最终本地生产式构建实拍，截图源不变，仅PDF排版裁取弹窗并添加编号；不含密码或真实客户资料。
- **文档验收**：81页全部渲染，正文变更的1/19/24/25/77页逐页目视通过，其余76页正文与旧版像素一致（统一页眉1.2除外）。最终文件与已验草稿全部81页文本和渲染一致；SHA `c7c586bab8733e328566b5dbe39e32bf55f7845e742056275dcb33f4b3742bee`，8,354,356字节。旧短名原字节备份至忽略目录。结构、内部跳转、渲染、像素及发布证据均位于 `logs/catalog-series-fix-20261014/`。
- **记录与剩余事项**：更新本记录、CODEX_HANDOFF与临时站交付记录；文档执行BOM/diff及内容检查后普通提交推送，并核对新完整SHA的CI，结果在交付回复和本地 `ci-docs-result.json` 记录。无新增业务规则/外部服务/费用，品牌资料与同机备份既有边界保持。下一步由客户保存后刷新后台、按新版第19/24–25页操作系列目录，无需扩大加固范围。
