# API guide

[简体中文](../api-reference.md) · **English**

Default local base URL: `http://127.0.0.1:1337`. Code validation remains the field-level source of truth.

![Website, CMS, API and persistence](../images/system-overview.svg)

## Public reads and writes

`GET /health` and `/api/health` expose process, Prisma core-table and SQLite-file health. Public reads include config, published products/articles/artists, FAQ, downloads, audio solutions and page content. Draft or hidden data must not become public because an ID is known.

Public writes are `POST /api/inquiries`, `/api/artist-applications`, and `/api/events`; they remain subject to validation, request limits, bot/time guards, metadata allowlists and privacy filtering.

## Administrator session

```bash
curl -sS http://127.0.0.1:1337/api/auth/login \
  -H 'Content-Type: application/json' \
  -H 'Origin: http://127.0.0.1:5175' \
  --data '{"username":"demo_admin","password":"DemoPass_2026!"}'
```

Protected reads use `Authorization: Bearer <token>`. Protected writes additionally use `X-CSRF-Token: <per-session-token>` and an allowed `Origin`. Session endpoints cover session inspection, refresh, password change and TOTP setup/enable/disable.

## Resource groups

| Group | Paths and permission |
| --- | --- |
| Products | `/api/products*` with `products:read/write` |
| Inquiries | `/api/inquiries*` with `crm:read/write` |
| Articles | `/api/articles*` with `articles:read/write` |
| Generic CMS | FAQ/download/audio/brand/page routes with `cms:read/write` |
| Users/logs | `/api/admin/users*`, login/operation logs |
| Export/backup/alerts | `/api/admin/export-records*`, backups, alerts, ops health |

## Uploads

`POST /api/upload` accepts multipart field `file` with administrator session and CSRF. The server validates allowlisted MIME, magic signature, size, pixels, safe filename and storage-boundary safety. Multi-instance production does not persist uploads only inside a container.

## Errors

Clients branch on HTTP status and stable `code`, never localized message text. Typical actions: fix validation on 400, renew session on 401, do not escalate on 403, show not-found on 404, resolve conflict on 409, stop retrying on 423, respect delay on 429, and preserve release/request evidence on 500.

Never put tokens, passwords, TOTP secrets, cookies, S3/database credentials, or inquiry content in URLs, logs or analytics.
