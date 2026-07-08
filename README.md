# 胡氏管乐官网

> GitHub 作品定位：真实业务网站交付样板，展示前台官网、后台 CMS、API、Prisma、SQLite、本地部署与基础安全校验能力。公开仓库只使用脱敏演示数据，不提交真实客户数据、生产密钥、真实数据库或上传资源。

## 面试官 10 分钟运行路径

```bash
npm run install:all
npm run seed:demo
npm run dev
```

访问入口：

- 前台官网：`http://127.0.0.1:3000`
- 后台管理：`http://127.0.0.1:5175`
- API 健康检查：`http://127.0.0.1:1337/health`

后台演示账号：

```text
demo_admin / DemoPass_2026!
```

## 技术栈

- 前台：Nuxt 4 / Vue 3 / Tailwind CSS
- 后台：Vue 3 / Vite / Element Plus
- API：Node.js / Express / Prisma / SQLite
- 工程：本地 seed、健康检查、生产构建保护、部署前检查脚本

## 可以展示的能力

- 前台浏览产品、文章、支持内容和品牌页面。
- 后台登录后管理产品、文章、FAQ、页面内容和线索。
- API 统一提供内容接口、后台鉴权、健康检查、安全响应头和生产配置校验。
- Prisma schema 管理业务表结构，SQLite 支持本地演示与交付。

## 公开仓库说明

- `aural-api/prisma/dev.db`、`backups/`、`uploads/`、`.env` 不进入公开仓库。
- `npm run seed:demo` 会生成脱敏演示数据和 demo 管理员。
- 生产构建必须显式传入正式域名，避免把 localhost 打进产物。

## 边界

该项目不是大型通用 CMS。权限模型、审计日志、运营分析、对象存储、自动化发布和多环境 CI/CD 仍是后续升级方向。

