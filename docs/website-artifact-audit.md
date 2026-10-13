# 官网构建产物审计

官网发布前必须对**本次构建的产物**运行 `audit:prod`。根目录 `npm run quality` 已串联构建与审计；`aural-api/scripts/safe-deploy.js` 在创建维护标记、停服务、备份和迁移之前审计新版本目录，失败立即中止。本文不授权执行生产部署。

## 本地运行

```bash
NUXT_PUBLIC_API_BASE=https://api.example.invalid NUXT_PUBLIC_SITE_URL=https://www.example.invalid npm --prefix aural-website run build
npm --prefix aural-website run audit:prod
```

独立预览可设置 `WEBSITE_OUTPUT_DIR` 为隔离构建输出的绝对路径；默认检查官网 `.output`。安全发布脚本显式固定为新版本的 `.output`，不会继承预览目录。旧构建没有清单时必须重建，不能手工补空清单或只重新签写文件哈希。

当前门禁对应项目的 Node 服务发布方式。既有 `npm run generate` 仍可生成静态预览；检测到 `_generate` 或 `nitro.static` 时会提示并跳过 Node 来源清单，不把 prerender 工具包当成静态站运行时。静态目录没有 Node 审计清单，不能通过本门禁或作为已经审计的 Node 发布包。

## 来源与校验

- `scripts/provenance-module.mjs` 在同一次 Nuxt 构建中采集 Vite 客户端、Vite SSR 和 Nitro 三段来源。客户端与 SSR 当前由 Rolldown 生成，Nitro 使用 Rollup；缺段、重复生成或无法读取模块图会失败。开发服务和安装期 `prepare` 不采集；生产构建关闭 Nuxt build cache，避免复用不含当次来源图的缓存。
- 每段同时保留输出 chunk 的 `modules` 与 bundler 实际加载的 `graphModules`。Rolldown 会把依赖包的常量折叠进其他模块，并从 chunk 模块表删除原包；因此审计使用两个集合的并集。加载图可能包含最终被 tree-shaking 删除的模块，SSR 也可能在 Nitro 阶段再次裁剪，判定有意保守。没有导入的工具包不会仅因安装在 `node_modules` 中就被列为产物来源。
- 物理依赖按实际 `package.json`、精确锁路径、包名及版本校验，保留 scoped/nested 的同名多版本；代码文件必须落在所属包内。项目、生成和虚拟模块分别记录，元数据不包含开发机绝对路径。包和产物的符号链接、隐藏外置依赖布局暂不支持，会明确拒绝，不能静默跳过。
- Nitro 原构建完成后，在 Nuxt `build:done` 的末尾生成 `.output/audit-manifest.json`，覆盖当前 preset 的公有文件复制、prerender、压缩和 compiled 回调。清单保存在输出根目录，未放入 `public`。未来添加更晚写输出的构建钩子必须调整封存顺序；后续改动会被审计的文件校验发现。
- 清单绑定 `package.json` 和 v3 `package-lock.json` 的 SHA-256，保存全部输出普通文件的路径、长度与 SHA-256（不对清单自身循环哈希），并独立记录外置包的版本。审计重新遍历产物，文件新增、缺失、内容变化、清单格式错误及锁文件变化均失败。
- npm 审计显式包含 dev、optional、peer 依赖，避免开发依赖被内联后漏查。高危/严重公告按直接公告的 semver 范围匹配实际版本，包含预发布版本；不用父依赖的聚合范围推断子包漏洞。受影响版本只要进入构建图或外置包，即使有工具链例外也会阻断。
- 其余 high/critical 公告仍必须具有已复核、字段完整、最长 90 天的有效例外；原到期日不延长。npm 网络错误、错误 JSON、超时、异常退出和不完整报告都不能当作通过。

## 保证边界

这是一份可重复核验的构建来源清单，不是签名供应链证明、逐函数可达性证明或完整 SBOM。虚拟模块/插件生成的任意代码不能只凭模块 ID 证明原始包所有权；复制进 `public` 的预编译脚本、WASM、远程脚本和运行时动态获取的代码也不能从模块图自动归因。所有本地产物文件都有完整性校验，但文件哈希不等于漏洞扫描。

哈希可检出清单与产物不一致，无法防止有权限的人同时重写两者，也不证明安装包字节与 npm tarball 完全一致。外部签名、可信构建隔离、独立锚点与生产发布验证需要另行设计和授权。本地通过不代表已部署或完成生产验收。

## 回归依据

`build-provenance.test.mjs` 使用真实 Vite/Rolldown 与 Rollup 构建，验证常量折叠、三阶段、同名嵌套版本、未导入包、虚拟路径及封存顺序。`artifact-inventory.test.mjs` 使用隔离文件夹验证清单/锁/输出篡改、缺段、非法路径、符号链接及开发依赖内联后的阻断；`audit-runtime.test.mjs` 验证公告与例外边界。API 的 operations 测试完全模拟发布命令，验证审计失败时不会停机、备份、迁移或切换版本。
