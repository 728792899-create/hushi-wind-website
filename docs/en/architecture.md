# Architecture

[简体中文](../architecture.md) · **English**

![Three-application architecture](../images/system-overview.svg)

## Website, CMS and API

Nuxt SSR reads published content and submits public forms. Vue CMS performs authenticated operational work. Express/Prisma is the only data, upload, permission, audit, limit and monitoring boundary. Local Demo uses SQLite/files; production adapters target PostgreSQL, Redis and S3-compatible storage.

![Products, content, versions, inquiries and administrators](../images/domain-model.svg)

## Publishing and restore

CMS write → CORS/session/CSRF/permission → validation → version snapshot → persistence → operation audit → public Nuxt read. Restore selects a historical snapshot, writes current state, and records a new restore action.

![Content draft, publish, version and restore lifecycle](../images/content-lifecycle.svg)

## Inquiry flow

The website sends validated fields to the independently rate-limited public endpoint. API applies honeypot and elapsed-time guards, stores the lead, emits only privacy-safe conversion metadata, and exposes the record to authorized CRM roles.

## Authentication and logs

Administrator sessions are expiring and versioned. Protected writes require per-session CSRF and permission. Request/error pipelines remove bodies, cookies, authorization headers, query strings and customer PII before logs or Sentry.

![Administrator session, CSRF, 2FA and RBAC sequence](../images/auth-sequence.svg)

## Production boundary

Staging verifies migrations, restore, storage, shared limits and smoke flows. Production uses immutable releases, verified backups, post-deploy observation and rollback criteria. See the [configuration reference](configuration-reference.md) and [API guide](api-reference.md).
