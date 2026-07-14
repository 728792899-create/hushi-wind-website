# 开发者指南

**简体中文** · [English](en/developer-guide.md)

这份指南帮助新贡献者从全新克隆进入可验证的三端开发循环。命令以仓库根目录为执行位置。

![仓库结构与开发循环](images/repository-map.svg)

## 前置要求

- Node.js 22+、npm 10+。
- `sqlite3` CLI，用于一致性备份与恢复演练。
- Chromium；首次运行 E2E 时执行 `npm --prefix aural-website exec playwright install chromium`。
- 不需要 PostgreSQL、Redis 或 S3 即可运行 Demo；这些只属于 staging/production 边界。

## 从零启动

```bash
npm run install:all
npm run seed:demo
npm run dev
```

| 服务 | 地址 | 入口 |
| --- | --- | --- |
| Nuxt 官网 | `http://127.0.0.1:3000` | `aural-website/` |
| Vue CMS | `http://127.0.0.1:5175` | `aural-admin/` |
| Express API | `http://127.0.0.1:1337` | `aural-api/` |

本地账号为 `demo_admin / DemoPass_2026!`。它只能用于本机或受控演示，生产预检会拒绝 Demo 或弱凭据。

## 代码边界

- 官网负责公开读取、SEO、响应式交互和公开表单，不直连数据库。
- CMS 负责内容、CRM、资源和安全运营；写请求同时需要会话、CSRF 和 permission。
- API 是数据、上传、审计、限流和可观测性的唯一边界。
- 产品与咨询域采用 route → controller → service → repository；新增业务优先沿用这一结构。

## 推荐开发循环

1. 执行 `npm run seed:demo` 获取一致的虚构数据。
2. 先写或更新相关单元/集成/E2E 测试。
3. 只启动需要的端：`npm run dev:api`、`dev:website` 或 `dev:admin`。
4. 运行最小相关测试，再运行 `npm run quality`。
5. 界面变化时，用 Browser 在桌面、平板和手机视口实际验收。
6. 同步更新 API、配置、权限、部署、监控和截图说明。

## 改动与证据映射

| 改动 | 至少需要 |
| --- | --- |
| 官网组件/SEO | Vitest、相关页面 Browser 验收 |
| API 鉴权/CRUD | 集成测试、错误码与审计验证 |
| CMS 权限/工作流 | CMS 单测、E2E、角色矩阵更新 |
| Prisma schema | SQLite/PostgreSQL 双 schema 校验、迁移与恢复验证 |
| 上传/对象存储 | 类型、签名、大小、文件名和失败路径测试 |
| 文档/配图 | `npm run docs:check`、GitHub 渲染检查 |

## 调试原则

- 先检查 `/health`，再区分 API、数据库或前端代理问题。
- 不把 token、请求 body、客户联系方式复制到日志或 Issue。
- 遇到状态污染时重新 seed，不手工修改 Demo 数据库来“修好”测试。
- 生产问题按 [运维 Runbook](operations-runbook.md) 保留 release、request id 和时间窗口。

提交规范与评审清单见 [贡献指南](../CONTRIBUTING.zh-CN.md)。
