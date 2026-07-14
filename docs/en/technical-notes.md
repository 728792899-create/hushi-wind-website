# Technical notes

[简体中文](../technical-notes.md) · **English**

## One sentence

One repository delivers a Nuxt public website, Vue operations CMS and Express/Prisma API with a reproducible SQLite Demo and explicit PostgreSQL/Redis/S3 production adapters.

## Core choices

- SSR supports crawlable product/content pages, canonical metadata and structured data.
- API centralizes auth, RBAC, CSRF, validation, uploads, audit and privacy boundaries.
- Prisma keeps a lightweight Demo while preserving a production migration path.
- Stable event names and release identity join business conversion with technical signals without copying PII.

## Implemented production boundaries

Tests cover public/CMS journeys, API authorization and recovery. Production guards reject weak defaults. S3-compatible storage, Redis limits, PostgreSQL schema, Sentry hooks, structured logs, backups and rollback scripts have explicit adapters.

## Still requires real staging

Infrastructure credentials, networking, proxy trust, database capacity/PITR, object storage/CDN policy, alert delivery, source-map upload, synthetic traffic and recovery objectives must be proven in the target environment.
