# 测试、基线与验收

**简体中文** · [English](en/testing-and-acceptance.md)

![从文档校验到生产构建的测试策略](images/testing-strategy.svg)

## 本次基线

2026-07-14 在 macOS / Node.js 22 环境执行了全新依赖安装、Demo seed、三端启动、现有检查和生产构建。改造前基线：

- `npm run install:all`、`npm run seed:demo`、`npm run dev` 可启动三端。
- 原有 check 和两个生产构建可通过，但没有正式单元/集成/E2E 测试门禁。
- CMS 主 Element Plus 包约 881KB raw / 284KB gzip；官网最大 JS chunk 约 209KB raw / 78KB gzip。
- Nuxt 开发服务首次冷请求约 6.1s，预热后约 130ms；这是 dev compiler 数据，不当作生产 Core Web Vitals。

该数据用于回归对比，不代表真实网络与用户设备上的性能承诺。

## 自动化层级

| 层级 | 命令 | 覆盖 |
| --- | --- | --- |
| documentation | `npm run docs:check` | 本地链接与锚点、图片 alt/MIME、SVG 可访问元数据、中英文文档配对 |
| lint | `npm run lint` | JS/Vue 解析与高风险语义规则 |
| API integration | `npm run test:api` | health、公开状态、鉴权、RBAC、CSRF、CRUD、版本恢复、上传签名、询价、production fuse |
| website unit | `npm run test:website` | SEO、canonical、Product/FAQ/breadcrumb schema、产品筛选、价格格式、ProductCard、分析 PII 过滤 |
| admin unit | `npm run test:admin` | API 会话/CSRF、dashboard 映射、security 状态模型 |
| browser E2E | `npm run test:e2e` | 产品搜索、对比、询价、CMS 登录/发布/回滚、手机导航/筛选、axe |
| backup drill | `npm run backup:verify` | SQLite 一致备份、恢复库完整性与行数对比 |
| production build | `npm run quality` | 以上门禁 + Prisma 双 schema + API audit + Nuxt/CMS 构建 |

Playwright 使用独立端口 `1437/3300/5335` 启动三端，不复用开发者正在运行的服务。Nuxt 页面是 SSR；测试等待 `data-hydrated=true` 后再进行交互，避免把开发编译器冷启动误报为交互缺陷。

## 手工 Browser 验收

每次 release candidate 至少验证：

1. 桌面 1440×900：首页、产品目录、对比对话框、详情 CTA、询价提交。
2. 平板 834×1112：导航、筛选换行、卡片网格、表单键盘顺序。
3. 手机 393×852：全屏导航、安全区、底部对比条、筛选 drawer、无水平溢出。
4. CMS：登录、会话刷新、新建/发布产品、查看版本、恢复、查看审计记录。
5. 键盘：跳转主内容、明显 focus ring、Escape 关闭对话框、焦点不逃出 modal、关闭后返回触发元素。
6. 设备设为 reduced motion：无强制大幅滚动/缩放动画，内容和操作仍完整。

## 性能与可访问性口径

- CI 中 axe 阻断 critical/serious 级别问题。色彩对比由设计令牌与手工检查双重确认；动态图片背景上的文字需在真实素材上复核。
- 生产 RUM 以 p75 LCP ≤ 2.5s、INP ≤ 200ms、CLS ≤ 0.1 为目标。本地 Lighthouse 只是趋势信号，最终以同地区真实用户数据为准。
- 首屏两张图片 eager/high priority，其余 lazy/async；图片必须保留固定比例并由 CDN 输出符合视口的尺寸。
