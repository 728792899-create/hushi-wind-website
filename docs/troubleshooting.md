# 故障排查

**简体中文** · [English](en/troubleshooting.md)

先复现、再缩小边界、最后修复。不要为了让页面“看起来正常”而关闭安全校验或直接篡改 Demo 数据库。

## 三端无法启动

1. 确认 Node.js 22+ 与 npm 10+。
2. 执行 `npm run install:all`，不要混用多个包管理器。
3. 检查 3000、5175、1337 是否被占用：`npm --prefix aural-api run check:ports`。
4. 重新执行 `npm run seed:demo` 后再 `npm run dev`。
5. 单独启动 `dev:api`、`dev:website`、`dev:admin` 定位失败端。

## 官网没有内容或请求失败

- 先访问 `http://127.0.0.1:1337/health`。
- 检查 `NUXT_PUBLIC_API_BASE` 与 SSR 的 `NUXT_API_INTERNAL_BASE`。
- 若 API 正常但数据为空，重新 seed；不要手工新增“临时生产数据”。
- 浏览器报 CORS 时核对完整 Origin 与 `ALLOWED_ORIGINS`，不要改为 `*`。

## CMS 无法登录或写入

- 本地 Demo 凭据是 `demo_admin / DemoPass_2026!`，只适用于本机。
- 401：清理当前会话并重新登录；检查账号状态和 token 过期。
- 403：核对角色 permission，不要只检查按钮是否显示。
- `CSRF_INVALID`：重新获取 session；核对写请求的 `X-CSRF-Token` 和 Origin。
- 423：停止重复尝试，等待锁定窗口结束或由另一超级管理员处理。

## 上传失败

- 核对 MIME、文件 magic bytes、大小和像素；改扩展名不能改变文件类型。
- 文件名不得包含路径、控制字符或客户信息。
- S3 模式核对 endpoint、bucket、region、public base 和凭据权限。
- 多实例生产不能回退到容器本地持久目录。

## 测试或构建失败

| 症状 | 首选动作 |
| --- | --- |
| Demo 状态不一致 | `npm run seed:demo` |
| Prisma validate 失败 | 同步检查 SQLite/PostgreSQL schema 和迁移 |
| E2E 找不到 Chromium | 安装 Playwright Chromium |
| 官网公共地址错误 | 核对构建期 Nuxt 公开变量 |
| CMS 指向 localhost | 使用 `build:prod` 并运行 dist 验证 |
| 文档图片/链接失败 | `npm run docs:check` |

## 备份或恢复失败

- 确认 `sqlite3` CLI 可用且备份目录可写。
- 先保留失败产物和日志，不覆盖最后一个已验证备份。
- 执行 `npm run backup:verify`；验证 `integrity_check` 和关键表行数。
- PostgreSQL 生产恢复必须在隔离环境演练，恢复成功后再切换流量。

## 生产故障

1. 记录环境、release、开始时间、影响范围和匿名 request 线索。
2. 检查健康、5xx、慢请求、前端错误、数据库和对象存储。
3. 在热修和回滚之间选择风险更低的路径。
4. 只从已验证备份恢复，并执行部署后冒烟。
5. 按 [运维 Runbook](operations-runbook.md) 完成复盘与纠正测试。

不要在公开 Issue 中粘贴 `.env`、token、数据库、完整请求、客户联系方式或未脱敏日志。
