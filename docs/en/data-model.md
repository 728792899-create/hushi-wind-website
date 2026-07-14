# Data model and content lifecycle

[简体中文](../data-model.md) · **English**

Prisma maintains a SQLite Demo schema and a PostgreSQL production schema. Clients depend on API contracts, never persistence fields directly.

![Core domain model](../images/domain-model.svg)

| Domain | Models |
| --- | --- |
| Content | `Product`, `Article`, `Artist`, `PageContent`, support and brand models |
| Leads | `Inquiry`, `ArtistApplication` |
| Identity/audit | `AdminUser`, `LoginRecord`, `OperationLog`, `ExportRecord` |
| Recovery | `ContentVersion`, `BackupRecord` |
| Signals | `AnalyticsEvent`, `ApiRequestLog`, `AlertRecord` |
| Global | `SystemConfig` |

![Content publishing, version and restore lifecycle](../images/content-lifecycle.svg)

Edits pass CSRF, permission and validation; the API saves a previous snapshot before persisting. Only published records enter public reads. Restore creates a new auditable action and is distinct from a database restore.

SQLite supports reproducible local/test use. PostgreSQL, Redis and object storage carry multi-instance production state. Both Prisma schemas must remain semantically aligned and validate in CI.

Lead contacts are restricted by CRM permissions. Analytics, request logs and error monitoring must not copy names, phones, emails, messages, tokens or cookies.
