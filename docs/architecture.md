# 架构说明

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
    SQLITE["SQLite"]
    UPLOADS["Local Uploads / Demo Assets"]
  end

  VISITOR --> WEBSITE
  OPERATOR --> ADMIN
  WEBSITE --> PUBLIC
  ADMIN --> AUTH
  AUTH --> CMS
  PUBLIC --> EXPRESS
  CMS --> EXPRESS
  EXPRESS --> OPS
  EXPRESS --> PRISMA --> SQLITE
  EXPRESS --> UPLOADS
```

前台只消费公开内容接口并提交公开表单；后台的写操作必须经过管理员会话和权限点校验。API 是唯一数据边界，前端不直接连接数据库或读写上传目录。

## 2. CMS 内容发布与版本恢复

```mermaid
sequenceDiagram
  participant O as 运营人员
  participant A as Vue CMS
  participant API as Express API
  participant DB as Prisma / SQLite
  participant W as Nuxt 官网

  O->>A: 登录并编辑产品、文章或页面内容
  A->>API: 携带管理员会话提交变更
  API->>API: IP 白名单、会话与 Permission 校验
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

公开表单不复用宽松的普通内容读取路径：它有独立的请求桶、字段守卫和持久化记录；线索的读取、修改与导出只允许具备 CRM 权限的后台用户执行。

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

IP 匿名化只发生在持久日志写库处。限流键与管理员 IP 白名单继续使用原始 IP，否则会降低防刷和访问控制的准确性。应用内 `Map` 限流是单实例兜底，多实例环境必须把网关限流作为第一道防线。

## 5. 生产部署与验收边界

```mermaid
flowchart LR
  INTERNET["Internet"] --> TLS["Nginx / HTTPS"]
  TLS --> LIMIT["Gateway Rate Limit"]
  LIMIT --> SITE["Nuxt Website"]
  LIMIT --> ADMIN["Admin Static App"]
  LIMIT --> API["Express on 127.0.0.1"]

  API --> DB["SQLite + Backup"]
  API --> FILES["Uploads"]

  CHECK["Full Acceptance Check"] --> SITE
  CHECK --> ADMIN
  CHECK --> API
  CHECK --> HEADERS["Security Headers / Health / CRUD Smoke"]
```

- 开发态默认只监听回环地址；弱默认凭据与非本地监听组合会直接拒绝启动。
- 生产启动会检查管理员账号、密码、Token 等关键配置，前后台生产构建会拒绝 localhost API 地址。
- 上线验收脚本同时探测官网、后台和 API，并检查后台安全响应头，而不是只验证构建目录存在。
- SQLite 与本地上传适合当前交付规模；扩展为多实例前应迁移数据库、对象存储、共享限流与集中日志。
