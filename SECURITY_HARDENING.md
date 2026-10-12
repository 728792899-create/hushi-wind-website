# 安全加固记录

按“企业级交付”标准逐步收口的安全与工程门禁。每一步独立提交、可单独回滚。未推送、未部署生产。

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
