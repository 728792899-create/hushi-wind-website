# 技术说明

## 一句话

这是一个小型商业官网交付样板，覆盖前台展示、后台 CMS、API、数据库、本地演示和生产配置校验。

## 核心设计

- 三端分离：Nuxt 前台负责展示，Vue 后台负责运营管理，Express API 负责数据和权限。
- 内容模型：产品、文章、FAQ、页面内容、咨询线索等按业务表拆分。
- 本地演示：通过虚构内容 seed 快速生成可登录、可浏览、可编辑的完整商品与运营数据。
- 安全校验：生产环境拒绝默认密码、弱 token 和 localhost 构建配置。
- 后台安全：管理员会话鉴权、权限点校验、可选 IP 白名单、登录锁定、2FA 和操作审计由 API 统一执行。
- 隐私边界：AnalyticsEvent、ApiRequestLog、LoginRecord 写库前截断 IP；限流与 IP 白名单始终使用原始 IP。

详细组件、内容流与部署边界见 [`architecture.md`](architecture.md)。

## 已落地的生产边界

- 本地素材与 S3-compatible/CDN 存储适配器。
- 进程内存与 Redis 共享限流适配器。
- JSON stdout 日志、三端 Sentry 与脱敏合同。
- staging/production 示例配置、Prisma PostgreSQL 迁移、备份/回滚文档和 GitHub Actions。
- 产品浏览、搜索、对比、下载和咨询的隐私保护型转化事件。

## 仍需在真实 staging 完成

- 使用真实 PostgreSQL、Redis、S3/CDN 与 Sentry 账号进行集成、故障注入和容量测试。
- 在隔离 PostgreSQL 实例执行 `pg_restore` 恢复演练并记录 RPO/RTO。
- 使用实际品牌授权产品素材重新验证 Core Web Vitals、对比度、alt 和 CDN 尺寸策略。
- 将平台告警路由到真实值班工具并完成一次演练。

完整剩余风险见 [`known-limitations.md`](known-limitations.md)。
