# Security model and permissions

[简体中文](../security-and-permissions.md) · **English**

Server-side enforcement is the security boundary; hiding a CMS control is only a usability feature.

![Authentication and authorization request sequence](../images/auth-sequence.svg)

Protected writes pass exact CORS origin, active session, per-session CSRF, permission, validation, service/repository persistence, and audit logging.

| Role | Content | CRM | Resources/config | Logs/backups | Users |
| --- | --- | --- | --- | --- | --- |
| `super_admin` | write | private/write | write | write | yes |
| `operations` | write | private/write | write | export/backup | no |
| `support` | none | private/write | none | export | no |
| `editor` | scoped write | none | read | none | no |
| `readonly` | read | restricted read | read | read | no |

The canonical arrays live in `aural-api/src/security/permissions.js`. Accounts are expiring, lock after repeated failures, support TOTP 2FA, and invalidate old sessions after password or token-version changes.

Uploads validate MIME, magic bytes, size, pixels and safe names. Multi-instance production uses S3-compatible storage and Redis limits. Audit, logs, Sentry and analytics remove sensitive request content by default.
