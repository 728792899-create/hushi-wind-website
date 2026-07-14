# 安全模型与权限参考

**简体中文** · [English](en/security-and-permissions.md)

后台安全建立在服务端强制边界上。菜单隐藏只是体验优化，不能代替 API 权限校验。

![管理员请求鉴权与授权时序](images/auth-sequence.svg)

## 请求保护层

1. 精确 CORS 来源允许请求进入。
2. Bearer token 验证会话、过期时间、账号状态和 `tokenVersion`。
3. 非 GET/HEAD 请求验证每会话 CSRF token。
4. permission 校验业务动作。
5. validation 校验字段、枚举、长度和文件内容。
6. 服务/仓储写入数据，并记录操作日志和安全诊断。

## 角色矩阵

| 角色 | 内容 | CRM | 资源/配置 | 日志/备份 | 账号管理 |
| --- | --- | --- | --- | --- | --- |
| `super_admin` | 读写 | 读写/私密 | 读写 | 读写 | 是 |
| `operations` | 读写 | 读写/私密 | 读写 | 日志、导出、备份 | 否 |
| `support` | 无内容写入 | 读写/私密 | 无 | 可导出 | 否 |
| `editor` | 文章/CMS/艺术家写，产品读 | 无 | 资源/配置读 | 无 | 否 |
| `readonly` | 只读 | 只读且私密字段受限 | 只读 | 日志只读 | 否 |

实际权限数组以 `aural-api/src/security/permissions.js` 为准。新增权限必须同时更新 API、CMS 可见性、测试和本页。

## 会话与 2FA

- 登录失败达到阈值后账号临时锁定。
- CMS 只在 `sessionStorage` 保存限时 token 与 CSRF token。
- 刷新、改密、重置密码或 `tokenVersion` 变化会使旧会话失效。
- 高权限账号应绑定 TOTP 2FA；TOTP secret 不进入日志、截图或分析。
- 生产应使用个人账号，禁止共享 Demo 管理员。

## 上传与外部边界

- 同时校验 MIME、magic bytes、大小、图片像素和安全文件名。
- 生产可通过 `CLAMAV_SCAN_COMMAND` 接入恶意文件扫描。
- 多实例生产使用 S3-compatible 对象存储；凭据只在 API 侧。
- Redis 承担共享限流，WAF/反向代理不能替代应用层表单校验。

## 审计与隐私

- 内容修改、恢复、导出、备份和账号管理进入审计记录。
- Sentry 和 JSON 日志默认删除 body、cookie、授权头、query 与客户 PII。
- CRM 私密字段通过 `crm:private` 单独控制，普通只读账号不能据此获得完整联系方式。
- 安全事件按 [Security Policy](../SECURITY.zh-CN.md) 私密报告，不在公开 Issue 附利用细节。

## 生产熔断

预检应拒绝弱密码、占位 token、示例域名、错误 CORS、本地上传、多实例内存限流和缺失必需可观测性。任何绕过都必须作为显式、可审计的发布例外处理。
