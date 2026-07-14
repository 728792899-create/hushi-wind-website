# 贡献指南

[English](CONTRIBUTING.md) · **简体中文**

感谢改进胡氏管乐全栈网站。每次改动都应可复现、可评审，并且不包含生产数据。

## 开发流程

```bash
npm run install:all
npm run seed:demo
npm run dev
```

使用聚焦的分支；行为变化应先写或同步补充测试。提交 PR 前执行：

```bash
npm run docs:check
npm run quality
```

## PR 要求

- 说明使用者/运营问题与选择的实现边界。
- 提供测试和准确的验证命令。
- 可见界面变化附上相关视口的真实 Demo 截图。
- API、配置、权限、部署、监控或回滚受影响时同步更新说明。
- 中文和英文文档必须成对同步。
- 不提交密钥、生产数据库、客户数据、私有上传或无授权素材。

## 架构规则

- 官网与 CMS 不直连数据库。
- 受保护写请求必须通过会话、CSRF、CORS、permission 和 validation。
- 业务域优先采用 route → controller → service → repository。
- SQLite Demo 与 PostgreSQL production schema 保持业务语义一致。
- 分析和监控不得接收咨询正文或不必要的 PII。

## 视觉证据

使用 Browser 对重新 seed 的 Demo 取图。UI 截图使用真实 PNG、约定视口和虚构数据，并提供准确 alt。生成图不得冒充真实产品照片。

安全问题按 [安全策略](SECURITY.zh-CN.md) 私密报告，不创建公开 Issue。
