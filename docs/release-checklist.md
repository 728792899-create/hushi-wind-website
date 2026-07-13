# Release Checklist

## 代码与证据

- [ ] PR 范围清晰，无 `.env`、数据库、备份、生产上传、私有图片或客户 PII。
- [ ] `npm run install:all` 在干净工作区成功。
- [ ] `npm run seed:demo` 成功，所有人名、联系方式和商品信息均为虚构数据。
- [ ] lint、三端测试、Prisma 双 schema、备份恢复、两个生产构建全部绿色。
- [ ] Playwright 桌面/手机主流程绿色，失败时的 trace/report 已审阅。
- [ ] Browser 完成桌面、平板、手机手工验收并更新截图。

## 产品与内容

- [ ] 产品查看、搜索、筛选、对比、资料下载、询价开始/提交事件不含 PII。
- [ ] 关键 CTA、空状态、loading、error/retry、404 和 500 已验证。
- [ ] 产品图片为可信的实际素材，alt 准确，来源/许可记录完整。
- [ ] title、description、canonical、Open Graph、robots、sitemap、Product/FAQ/breadcrumb 结构化数据正确。

## 安全与配置

- [ ] 三端 staging/production 域名、CORS 和 CDN 域名已替换。
- [ ] 管理员账号不是 `admin`/`demo_admin`，密码和 token 由密钥管理平台生成。
- [ ] `npm --prefix aural-api run preflight` 在实际 production 变量下通过。
- [ ] PostgreSQL、Redis、S3/CDN、TLS、反向代理和 `TRUST_PROXY` 已按拓扑验证。
- [ ] CMS 权限、2FA、CSRF、上传限制、审计日志、限流和告警 webhook 已在 staging 演练。

## 数据库与发布

- [ ] migration 在生产同版本 PostgreSQL 的 staging 副本上执行成功。
- [ ] 发布前备份已创建，隔离恢复演练在规定周期内成功。
- [ ] 当前 release、上一 release、Git SHA、Sentry release 和 DB migration 版本已记录。
- [ ] 回滚决策人、观察窗口、RPO/RTO 和当班联系人已明确。

## 发布后

- [ ] API health、官网、CMS 登录与构建 API 域名通过 post-deploy check。
- [ ] 使用测试线索完成产品→对比→询价→CMS 处理。
- [ ] 三端 Sentry 都收到对应 release，source maps 可解析，无 PII。
- [ ] 30 分钟观察窗口内 5xx、p95、Core Web Vitals、询价转化和新 Sentry issue 无异常。
