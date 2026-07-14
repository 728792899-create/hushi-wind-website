# 环境变量参考

**简体中文** · [English](en/configuration-reference.md)

环境模板是配置事实源。本页解释变量用途和边界，不提供真实密钥或可直接用于生产的示例值。

![本地、预发布与生产环境拓扑](images/environment-topology.svg)

## 通用规则

- 浏览器可见变量只能包含公开 URL、环境名、release 和公开功能开关。
- 数据库、Redis、S3、Sentry 上传和管理员凭据只注入服务端或构建平台。
- staging 与 production 使用不同数据库、bucket、Redis、Sentry environment 和管理员账号。
- URL 使用完整 `https://` 来源，不使用尾部通配符代替精确 CORS 白名单。

## API

| 分组 | 变量 | 说明 |
| --- | --- | --- |
| 运行 | `NODE_ENV`, `DEPLOYMENT_MODE`, `PORT` | 环境、部署模式和监听端口 |
| 数据 | `DATABASE_URL` | Demo 为 SQLite；生产为 PostgreSQL |
| 公开地址 | `PUBLIC_SITE_URL`, `PUBLIC_ADMIN_URL`, `API_PUBLIC_URL`, `UPLOAD_PUBLIC_BASE` | canonical、CORS 与素材公开基址 |
| 管理员 | `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_TOKEN_SECRET`, `ADMIN_TOKEN_TTL_MS` | 启动账号与限时会话；生产禁止弱值 |
| 边界 | `ALLOWED_ORIGINS`, `ADMIN_IP_ALLOWLIST`, `SENSITIVE_CONFIRMATION_TEXT` | 来源、后台 IP 和敏感操作确认 |
| 限流 | `PUBLIC_FORM_RATE_WINDOW_MS`, `PUBLIC_FORM_RATE_LIMIT`, `PUBLIC_FORM_MIN_ELAPSED_MS`, `PUBLIC_FORM_MAX_AGE_MS`, `API_RATE_WINDOW_MS`, `API_RATE_LIMIT` | 公开表单与 API 频率/时间守卫 |
| 共享状态 | `RATE_LIMIT_STORE`, `REDIS_URL` | 多实例生产必须使用 Redis |
| 上传 | `MAX_UPLOAD_BYTES`, `MAX_IMAGE_PIXELS`, `CLAMAV_SCAN_COMMAND`, `UPLOAD_STORAGE` | 大小、像素、恶意文件扫描与存储后端 |
| 对象存储 | `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_PUBLIC_BASE`, `S3_PREFIX`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | S3-compatible 适配边界 |
| 告警 | `ALERT_WEBHOOK_URL`, `ALERT_EMAIL_TO` | 外部告警出口 |
| 保留期 | `ANALYTICS_RETENTION_DAYS`, `API_LOG_RETENTION_DAYS`, `ALERT_RETENTION_DAYS`, `BACKUP_RETENTION_DAYS` | 事件、请求、告警和备份清理窗口 |
| Sentry | `OBSERVABILITY_REQUIRED`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE` | 服务端错误与追踪 |
| 进程 | `API_PM2_NAME`, `WEB_PM2_NAME` | 部署脚本中的进程标识 |

## CMS

| 变量 | 可公开 | 说明 |
| --- | --- | --- |
| `VITE_API_BASE` | 是 | CMS API 基址 |
| `VITE_SITE_URL` | 是 | 跳转官网和预览基址 |
| `VITE_SENSITIVE_CONFIRMATION_TEXT` | 是 | 敏感操作界面确认短语，不是密钥 |
| `VITE_SENTRY_DSN` | 是 | 浏览器端 DSN |
| `VITE_SENTRY_ENVIRONMENT`, `VITE_SENTRY_RELEASE` | 是 | 环境与不可变 release |
| `VITE_SENTRY_TRACES_SAMPLE_RATE` | 是 | 前端采样率 |

## Nuxt 官网

| 分组 | 变量 | 说明 |
| --- | --- | --- |
| API | `NUXT_PUBLIC_API_BASE`, `NUXT_API_INTERNAL_BASE` | 浏览器公开地址与 SSR 内网地址 |
| 站点 | `NUXT_PUBLIC_SITE_URL`, `NUXT_PUBLIC_BRAND_IMAGE_BASE`, `NUXT_PUBLIC_CDN_URL` | canonical、品牌素材和 CDN |
| 分析 | `NUXT_PUBLIC_MIXPANEL_ENABLED` | 仅打开隐私安全事件转发开关，不包含 token |
| 客户端 Sentry | `NUXT_PUBLIC_SENTRY_DSN`, `NUXT_PUBLIC_SENTRY_ENVIRONMENT`, `NUXT_PUBLIC_SENTRY_RELEASE`, `NUXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | 浏览器监控 |
| 服务端 Sentry | `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE` | Nuxt SSR 监控 |
| Source maps | `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | 只在 CI 构建阶段注入，不能进入产物 |

## 启动前校验

```bash
npm --prefix aural-api run preflight
npm --prefix aural-api run deploy:guard
npm run check:api
```

生产必须拒绝 Demo 账号、示例域名、占位 secret、SQLite 多实例、本地持久上传和内存限流。实际模板见三个应用目录下的 `.env.*.example`。
