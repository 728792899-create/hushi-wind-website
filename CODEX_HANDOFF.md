# Codex 交接：胡氏管乐官网企业级加固（2026-10-12）

你接手的是 `hushi-wind-website`（GitHub：728792899-create/hushi-wind-website）的逐步加固工作。项目最终按**企业级成熟项目**交付：每一步都要现场复核、最小修改、测试与浏览器验证、更新修复记录、独立提交、推送并确认 CI。用中文汇报。

## 1. 工作位置（务必遵守）

- **只在 `~/Projects/hushi-wind-website` 工作**，分支 `codex/admin-core-redesign`，已跟踪 `origin/codex/admin-core-redesign`。
- `~/Documents/GitHub开源项目剖析/hushi-wind-website` 是用户原始目录，位于 iCloud 同步盘，文件常为 dataless，`git`/`cat` 会无限挂起。**不要在那里工作或写入**。它的 9 月未提交工作已原样快照为提交 `aeead5d`。
- `~/Projects/dujiao-next` 与本项目无关，不要触碰。
- 不得 `git reset --hard`、`git clean`、强制推送、改写已推送历史；不做任何生产部署、生产数据库操作或真实通知发送。

## 2. 当前状态

第 0–4 步已推送且 GitHub Actions（`.github/workflows/quality.yml`）通过；第 5 步随本交接更新独立提交。继续前以实际 `git log`、远端 SHA 与对应 CI 为准：

| 提交 | 内容 |
|---|---|
| `aeead5d` | 原样快照用户 9 月本地工作（基于 main `cef13ef`） |
| `ae53e34` | 依赖漏洞清零；官网运行时审计门禁 `audit-runtime.js` + `audit-exceptions.json`（例外 2027-01-09 到期）；去 BOM + `check:bom`；API `postinstall: prisma generate` |
| `ce07d5e` | 后台会话：空闲 30 分钟、绝对 12 小时，服务端强制；前端 `lib/sessionIdle.js` 倒计时提醒 |
| `4f48ded` | 客户联系方式列表默认隐藏，`POST /api/{inquiries,artist-applications}/:id/contact` 逐条查看并先写审计 |
| `e481530` | 11 张内容表加 `revision`（迁移 `20261012090000_content_revision`），Prisma 扩展自动递增；全部内容保存 `If-Match` 409/428 |
| `8a3c5f6` | 后台设计令牌、WCAG AA 对比度、时间/金额格式；`check:admin-colors` |
| `9d843dd`、`dd4e728` | 第 4 步布局与可用性；追加修复交接文档不可见字符，最终 Quality run `38270992275` 成功 |
| `3862a6d` + 本交接更新所在追加提交 | 第 5 步权限与审计增强；首次 Linux CI 发现 SQLite 并发线程争用，追加统一事务队列修复，见修复记录 |

每一步的复核、改动、证据都在仓库根目录 **`SECURITY_HARDENING.md`**，先通读它。测试基线：`npm test` 共 155 项（API 101、后台 45、官网 9）全部通过。

## 3. 第 4 步「布局与可用性」已完成本地验收

- 接手的 6 个源码文件已完整复核；补齐分页选择名称、手机配置栏换行、素材计数对比度、抽屉小字与点击区域，保留原业务语义。
- 1440 桌面 / 390 粗指针手机，10 页 × 2：1,277 处文字、732 个控件，最低文字对比度 4.61，无整页溢出、小于 12px 的可见文字、低于 24px 的启用目标、无名称控件。另核查 5 类弹窗和 2 类抽屉，手机弹窗左右 16px。
- 帮助返回/快捷/操作链接为 44px；素材复选框 AX 名称正确，空格选中再取消后位置不变；分页通过键盘切换且 API 参数正确。
- 119 项测试以及 quality、check:admin-ui、check:admin-colors、check:bom 全通过；三类浏览器反向验证成功检出旧缺陷，临时覆盖已刷新移除。
- 详细记录、证据路径、限制与提交 CI 验收方式见 `SECURITY_HARDENING.md` 第 4 步。推送之后必须核对该步实际 SHA 对应的成功 CI，不能把本地通过当作线上完成。
- 新记录的遗留告警：官网构建 `NUXT_B7027`，`tailwindcss/nesting` 入口不可加载，构建成功。本步没有扩大到官网构建链修复。

## 4. 本地运行与验证方法

3000 端口被 OrbStack 容器占用，官网改用 3100。三个服务分别后台启动：

```bash
cd ~/Projects/hushi-wind-website/aural-api && NODE_ENV=development DATABASE_URL=file:./dev.db PORT=1337 ADMIN_USERNAME=demo_admin ADMIN_PASSWORD='DemoPass_2026!' ADMIN_TOKEN_SECRET=hushi-demo-local-token-secret-2026-change-me PUBLIC_SITE_URL=http://127.0.0.1:3100 PUBLIC_ADMIN_URL=http://127.0.0.1:5175 API_PUBLIC_URL=http://127.0.0.1:1337 UPLOAD_PUBLIC_BASE=http://127.0.0.1:1337 ALLOWED_ORIGINS=http://127.0.0.1:3100,http://localhost:3100,http://127.0.0.1:5175,http://localhost:5175 npm start
cd ~/Projects/hushi-wind-website/aural-website && NUXT_PUBLIC_API_BASE=http://127.0.0.1:1337 NUXT_API_INTERNAL_BASE=http://127.0.0.1:1337 NUXT_PUBLIC_SITE_URL=http://127.0.0.1:3100 NUXT_PUBLIC_BRAND_IMAGE_BASE=http://127.0.0.1:1337/uploads/real-assets npm run dev -- --host 127.0.0.1 --port 3100
cd ~/Projects/hushi-wind-website/aural-admin && VITE_API_BASE=http://127.0.0.1:1337 VITE_SITE_URL=http://127.0.0.1:3100 npm run dev -- --host 127.0.0.1 --port 5175
```

`quality` 用法：

```bash
cd ~/Projects/hushi-wind-website && DATABASE_URL=file:./dev.db VITE_API_BASE=https://api.example.invalid VITE_SITE_URL=https://www.example.invalid NUXT_PUBLIC_API_BASE=https://api.example.invalid NUXT_PUBLIC_SITE_URL=https://www.example.invalid npm run quality
```

后台演示账号见 `scripts/dev.mjs`（仅本机）。`aural-api/prisma/dev.db` 是用户演示数据的副本：任何迁移前先 `sqlite3 dev.db ".backup '<路径>'"`，迁移后逐表比对原字段。验证中改动的演示数据要改回。

**第 5 步迁移注意**：上面的 `dev.db` 与三个既有服务本次未迁移/重启；新版代码不能直接使用未迁移库。第 5 步已用数据库备份副本演练，32 张原表原字段逐行一致、44 条历史日志封存成功。以后迁移任何环境，先停止旧 API 写入并备份，再 `prisma migrate deploy`、`prisma generate`、启动新版 API；启动会一次性封存历史基线并校验，此后只验证、不自动重签。不要在迁移后继续运行旧写日志程序。只读核验命令：`cd aural-api && DATABASE_URL=file:/绝对路径/副本.db npm run check:audit`，失败非零退出；此命令不会初始化未封存基线。

本步浏览器另用合成数据的独立 API `18337` / 后台 `15175`，库与脚本在忽略目录 `logs/step5-20261012/`。通知渠道均为空；不能把这个本地测试库当作演示数据或生产。验收页面可用于查看结果，下一次重启需先检查端口进程归属。

## 5. 已踩过的坑

- 浏览器面板/窗口不可见时 `requestAnimationFrame` 不触发，Element Plus 弹窗、抽屉停在动画起点（如 `translateX(390px)`），关闭的弹窗也残留在 DOM。判断真实状态请读组件状态（`modelValue` / `visible`）或计算最终 CSS，不要凭位置下结论。
- SQLite/Prisma 少线程主机不能让多个交互事务同时在引擎中等写锁，否则持锁者也无法推进。API 统一通过 `lib/unit-of-work.js` 与 `lib/sqlite-transaction.js` 排队，独立写/维护/后台任务也必须走该入口；已有事务复用、不重播业务回调。CI 的 `TOKIO_WORKER_THREADS=2` 为回归约束，勿提高线程数绕过测试。WAL 等连接模式在测试夹具开始时设置，不能在活动请求间切换。
- 改了 `schema.prisma` 必须 `npx prisma generate`，否则报 `Unknown argument`。
- 新增内容表的任何更新路径都会自动递增 `revision`（`lib/record-version.js` 的 `withContentRevision`）。如需新增“非编辑类”写入（如浏览计数），不要写在这 11 张表上，否则会让编辑表单误报冲突。`Inquiry` 不在自动递增范围。
- API 集成测试辅助函数会为普通 PUT 自动带当前版本；新增受保护资源要同步 `versionedTables`。
- 改设计令牌前先 `grep` 用法：曾因把 `--admin-faint` 改为装饰色导致正文对比度跌到 2.1。
- 写 shell 脚本注意 macOS：无 `timeout`，`sed -i ''`，BSD sed 不支持 `0,/re/`；Write 工具会把 `"\uFEFF"` 存成真实字符，用 `String.fromCharCode(0xfeff)`。

## 6. 后续计划（每步先现场复核再动手）

1. **先核对第 5 步提交与对应完整 SHA 的 CI**（本地两个引擎线程下 155 项及全部门禁通过，推送后核对结果见该步交付回复）。
2. **第 5 步已落实的用户确认规则**：
   - 客服只能处理分配给自己的咨询；未分配和重新分配由超级管理员负责。服务端覆盖列表、详情相关操作、统计及回收恢复。艺术家申请保持共享；只读角色原有脱敏读取权限保持。
   - 联系方式查看按账号合并咨询/艺术家申请计数，包含超级管理员，重复查看也计数。默认 10 分钟达到 30 次只告警、不阻断；`CONTACT_VIEW_WINDOW_MS` / `CONTACT_VIEW_ALERT_THRESHOLD` 可配置，同窗口告警去重。
   - 保持不开启含个人信息的咨询导出；没有新增审批/水印流程。既有操作日志列表与 CSV 共用脱敏规则，CRM 回收恢复响应也隐藏联系方式。
   - 日志只增触发器、历史基线与新日志 SHA-256 链已接入；后台设置可处理安全告警、校验记录完整性。启动及手动/CLI 做全量验证，追加仅核对链尾；尚无周期自动全量核验或外部可信锚点。
   - 后续阶段范围待用户确认。数据库特权者全链重写、整库回滚与基线前历史真实性不在本地哈希链保证范围；外部留存/可信锚点需另行设计，不可声称绝对防篡改。
3. **待用户决定**（不要擅自改）：咨询状态“待联系”与优先级“紧急”同用危险色，是否改为警告色或主色。
4. **已知但未处理**：产品模板与演示产品为钢琴、吉他、合成器，与管乐品牌不符，涉及业务内容，需用户提供真实资料。7 月远端分支 `codex/commercial-readiness` 的 S3/Redis/Sentry/PostgreSQL/src 分层未合入当前基线，是否合并由用户决定。

## 7. 每步汇报格式

目标、改动文件、行为变化、测试证据、浏览器证据、commit/push/CI 状态、线上/生产状态（目前均未部署）、未决风险、下一步。源码完成、测试通过、页面验收、推送、生产验收分开写，不把本地通过写成已上线。
