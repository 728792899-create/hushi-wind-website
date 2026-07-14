# 已知边界与剩余风险

**简体中文** · [English](en/known-limitations.md)

- PostgreSQL、Redis、S3/CDN、日志平台与 Sentry 已有配置/适配边界，但公开仓库不能代替真实云账号的 staging 集成和容量测试。
- PostgreSQL 自动备份能生成 custom dump；恢复验证需在隔离的真实 PostgreSQL 实例定期执行。CI 中自动验证的是 SQLite Demo 模式。
- API 产品与询价路径已分层为 route/controller/service/repository/validation，CMS 安全与 dashboard 已抽出纯模型，但原有 `server.js`、`SecurityView.vue` 和 `DashboardView.vue` 仍包含较多兼容代码。后续增功能时应继续向当前边界迁移，不再把新业务堆回视图或入口文件。
- 后台 RBAC 面向小型运营团队，不是多租户组织系统；2FA 恢复码、SSO/SCIM 和终端设备管理不在当前交付范围。
- axe 自动检查不能代替读屏软件与真实键盘用户验收；强动态页面和真实产品图片替换后必须重新检查对比度与 alt。
- 产品照片只能使用品牌授权或来源可验证的真实素材；仓库中的公开素材仅作 Demo，不构成任何第三方品牌产品背书。
