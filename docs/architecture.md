# 架构说明

**简体中文** · [English](en/architecture.md)

![胡氏管乐三端系统架构](images/system-overview.svg)

下文从系统、发布、公开线索、安全与生产五个视角说明边界。如果只需了解用户如何完成浏览到咨询，先阅读 [产品与用户旅程](product-tour.md)；如果需要调用 API，阅读 [API 使用指南](api-reference.md)。

## 1. 官网、CMS 与 API 三端架构

```mermaid
flowchart TB
  subgraph CLIENTS["访问端"]
    VISITOR["官网访客"]
    OPERATOR["内容运营人员"]
  end

  subgraph FRONTENDS["展示与管理端"]
    WEBSITE["Nuxt 4 / Vue 3 官网"]
    ADMIN["Vue 3 / Element Plus CMS"]
  end

  subgraph BACKEND["业务与安全端"]
    EXPRESS["Express API"]
    PUBLIC["Public Content / Forms"]
    AUTH["Admin Session / RBAC / 2FA"]
    CMS["Content / Version / Restore"]
    OPS["Analytics / Audit / Alerts / Health"]
  end

  subgraph DATA["数据与素材"]
    PRISMA["Prisma Client"]
    DATABASE["SQLite Demo / PostgreSQL Production"]
    UPLOADS["Local Uploads / S3-compatible + CDN"]
    REDIS["Memory / Redis Rate Limits"]
  end

  subgraph OBS["可观测性"]
    LOGS["Structured JSON Logs"]
    SENTRY["Sentry Website / CMS / API"]
    FUNNEL["Consent-gated Mixpanel / First-party Events"]
  end

  VISITOR --> WEBSITE
  OPERATOR --> ADMIN
  WEBSITE --> PUBLIC
  ADMIN --> AUTH
  AUTH --> CMS
  PUBLIC --> EXPRESS
  CMS --> EXPRESS
  EXPRESS --> OPS
  EXPRESS --> PRISMA --> DATABASE
  EXPRESS --> UPLOADS
  EXPRESS --> REDIS
  EXPRESS --> LOGS
  EXPRESS --> SENTRY
  WEBSITE --> SENTRY
  ADMIN --> SENTRY
  WEBSITE --> FUNNEL
```

前台只消费公开内容接口并提交公开表单；后台的写操作必须经过管理员会话、每会话 CSRF token 和权限点校验。API 是唯一数据边界，前端不直接连接数据库或读写上传目录。产品和询价域已分成 route → controller → service → repository，校验和 permission 为独立边界。

![产品、内容、版本、咨询与管理员的核心领域关系](images/domain-model.svg)

## 2. CMS 内容发布与版本恢复

```mermaid
sequenceDiagram
  participant O as 运营人员
  participant A as Vue CMS
  participant API as Express API
  participant DB as Prisma / SQLite
  participant W as Nuxt 官网

  O->>A: 登录并编辑产品、文章或页面内容
  A->>API: 携带管理员会话 + CSRF 提交变更
  API->>API: CORS、IP 白名单、会话、2FA 与 Permission 校验
  API->>DB: 保存旧版本与新内容
  API->>DB: 写入操作日志
  API-->>A: 返回更新结果
  W->>API: 请求已发布内容
  API->>DB: 查询公开状态记录
  DB-->>W: 返回内容与素材路径
  opt 需要回滚
    O->>A: 选择历史版本
    A->>API: Restore Version
    API->>DB: 恢复内容并记录审计
  end
```

演示 seed 生成的是完整虚构品牌数据；产品、文章、FAQ 和页面内容不依赖历史线上服务器，便于本地复现三端闭环。

![内容从草稿、发布、版本到恢复的生命周期](images/content-lifecycle.svg)

## 3. 公开咨询线索流

```mermaid
flowchart LR
  FORM["官网咨询表单"] --> GUARD["字段校验 / 表单频率限制"]
  GUARD --> API["POST /api/inquiries"]
  API --> DB["Inquiry Record"]
  API --> EVENT["Analytics Event"]
  DB --> CRM["CMS 线索列表"]
  CRM --> AUTH["requireAdmin + crm:read/write"]
  AUTH --> ACTION["查看 / 标记 / 更新 / 删除"]
  ACTION --> AUDIT["Operation / Export Audit"]
```

公开表单不复用宽松的普通内容读取路径：它有独立的请求桶、honeypot/时间守卫、字段校验和持久化记录；线索的读取、修改与导出只允许具备 CRM 权限的后台用户执行。分析仅记录 `inquiry_submit` 与非 PII 上下文，不复制姓名、电话、城市或留言。

## 4. 鉴权、限流与日志隐私边界

```mermaid
flowchart TB
  REQ["HTTP Request + Raw IP"] --> TRUST["Trust Proxy 配置"]
  TRUST --> SPLIT{用途}

  SPLIT -->|"后台安全"| ALLOW["Admin IP Allowlist"]
  SPLIT -->|"防刷"| RATE["API / Public Form Rate Buckets"]
  SPLIT -->|"持久日志"| ANON["IPv4 /24 或 IPv6 /48 截断"]

  ALLOW --> SESSION["Admin Session"]
  SESSION --> PERM["Permission Check"]
  PERM --> HANDLER["Protected Handler"]

  RATE --> HANDLER
  ANON --> LOGS["Analytics / API / Login Records"]
  HANDLER --> AUDIT["Operation Logs / Alerts"]
```

IP 匿名化只发生在持久日志写库处。限流键与管理员 IP 白名单继续使用原始 IP，否则会降低防刷和访问控制的准确性。应用内存限流是单实例兜底，`RATE_LIMIT_STORE=redis` 通过共享适配器支持多实例，边缘/WAF 仍应作为第一道防线。

![管理员请求经过会话、CSRF、2FA 与 RBAC 的时序](images/auth-sequence.svg)

## 5. 生产部署与验收边界

```mermaid
flowchart LR
  INTERNET["Internet"] --> TLS["Nginx / HTTPS"]
  TLS --> LIMIT["Gateway Rate Limit"]
  LIMIT --> SITE["Nuxt Website"]
  LIMIT --> ADMIN["Admin Static App"]
  LIMIT --> API["Express on 127.0.0.1"]

  API --> DB["PostgreSQL + Verified Backups"]
  API --> FILES["S3-compatible Storage + CDN"]
  API --> SHARED["Redis + JSON Logs + Sentry"]

  CHECK["Full Acceptance Check"] --> SITE
  CHECK --> ADMIN
  CHECK --> API
  CHECK --> HEADERS["Security Headers / Health / CRUD Smoke"]
```

- 开发态默认只监听回环地址；弱默认凭据与非本地监听组合会直接拒绝启动。
- 生产启动会检查管理员账号、密码、Token 等关键配置，前后台生产构建会拒绝 localhost API 地址。
- 上线验收脚本同时探测官网、后台和 API，并检查后台安全响应头，而不是只验证构建目录存在。
- SQLite 与本地上传保留为可复现 Demo 模式；多实例 production 使用已提供的 PostgreSQL、S3-compatible、Redis 和集中日志适配边界。
