# Hushi Wind Full-stack Website

[简体中文](README.md) · **English**

![Hushi Wind full-stack website cover](docs/images/project-cover.svg)

[![CI](https://github.com/728792899-create/hushi-wind-website/actions/workflows/ci.yml/badge.svg)](https://github.com/728792899-create/hushi-wind-website/actions/workflows/ci.yml)
![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-3c8c5a?logo=node.js&logoColor=white)
![Nuxt 4](https://img.shields.io/badge/Nuxt-4-00dc82?logo=nuxt&logoColor=white)
![Vue 3](https://img.shields.io/badge/Vue-3-42b883?logo=vuedotjs&logoColor=white)
[![MIT License](https://img.shields.io/badge/License-MIT-9ed7b3.svg)](LICENSE)

A deployment-ready instrument brand platform consisting of a **Nuxt 4 public website, Vue 3 operations CMS, and Express/Prisma API**. It retains a premium monochrome visual language while adding tests, responsive behavior, SEO, RBAC, audit history, backup verification, observability, and explicit production boundaries.

> The repository contains fictional Demo data and assets with recorded sources. It does not contain customer data, production databases, secrets, or private uploads.

## Capabilities

| Area | Capabilities | Delivery boundary |
| --- | --- | --- |
| Website | Home, catalog, detail, search, filters, comparison, news, artists, audio, support | Nuxt SSR, responsive UI, focus management |
| Conversion | Comparison, downloads, trial booking, inquiries | Dedicated limits, bot/time guards, non-PII events |
| CMS | Products, articles, pages, FAQ, resources, leads, dashboard | Vue 3, Element Plus, lazy routes, dense operations UI |
| Content safety | Publish, versions, restore, audit | Before/after evidence; restores are audited |
| Account security | Expiring sessions, RBAC, 2FA, CSRF, lockout, IP allowlist | CMS visibility and API permissions share one source |
| Uploads | Local Demo and S3-compatible object storage | MIME, magic bytes, size, pixels, safe filenames |
| Data | SQLite Demo / PostgreSQL production | Dual Prisma schemas, migrations, restore drills |
| Signals | Three-tier Sentry, JSON logs, health, alerts | Release/environment identity, PII removed by default |
| Delivery | Staging/production configuration, CI, rollback | GitHub Actions, preflight, post-deploy smoke |

## Product tour

| Brand home | Product catalog |
| --- | --- |
| ![Public brand homepage](docs/screenshots/01-homepage.jpg) | ![Searchable product catalog](docs/screenshots/02-products.jpg) |

| Product comparison | Inquiry form |
| --- | --- |
| ![Accessible product comparison dialog](docs/screenshots/07-product-compare.png) | ![Product inquiry form](docs/screenshots/08-inquiry-form.png) |

| Desktop product detail | Mobile detail with persistent CTA |
| --- | --- |
| ![Desktop product detail with hero image, model and inquiry action](docs/screenshots/11-product-detail-desktop.png) | ![Mobile product detail with responsive media and bottom inquiry action](docs/screenshots/12-product-detail-mobile.png) |

| CMS dashboard | Security and audit center |
| --- | --- |
| ![CMS operations dashboard](docs/screenshots/03-admin-dashboard.jpg) | ![CMS security and audit center](docs/screenshots/10-admin-security.png) |

| Product editor | Version history and restore |
| --- | --- |
| ![CMS product editor with content and publication fields](docs/screenshots/13-cms-product-editor.png) | ![CMS version history with a restore action](docs/screenshots/14-cms-version-history.png) |

| CRM inquiry queue | Resource library |
| --- | --- |
| ![CMS CRM inquiry queue summary](docs/screenshots/15-cms-crm-inquiries.png) | ![CMS resource library statistics and filters](docs/screenshots/16-cms-resource-library.png) |

| Verified backup drill | Public 404 state |
| --- | --- |
| ![CMS backup record marked as restore-tested](docs/screenshots/17-cms-backup-restore.png) | ![Public dark-theme 404 page with home and support actions](docs/screenshots/18-website-404.png) |

All captures use freshly seeded fictional Demo data. Temporary inquiries, edits and backup records are removed by seeding again after capture.

See the [complete product journey](docs/en/product-tour.md) and [CMS operations guide](docs/en/admin-guide.md).

## Architecture

![Public website, CMS, API and infrastructure boundaries](docs/images/system-overview.svg)

- The public website reads published content and submits protected public forms.
- CMS writes require an administrator session, per-session CSRF token, and permission.
- API is the only data and asset boundary; clients never access the database directly.
- Product and inquiry domains follow route → controller → service → repository.

![Repository map and development loop](docs/images/repository-map.svg)

## Run locally

Requirements: Node.js 22+, npm 10+, `sqlite3` CLI, and Chromium for E2E.

```bash
git clone https://github.com/728792899-create/hushi-wind-website.git
cd hushi-wind-website
npm run install:all
npm run seed:demo
npm run dev
```

| Service | URL |
| --- | --- |
| Website | `http://127.0.0.1:3000` |
| CMS | `http://127.0.0.1:5175` |
| API | `http://127.0.0.1:1337` |
| Health | `http://127.0.0.1:1337/health` |

Local Demo credentials: `demo_admin / DemoPass_2026!`. Production startup rejects Demo credentials, weak secrets, placeholder domains, and unsafe multi-instance settings.

## Quality gates

| Layer | Command | Coverage |
| --- | --- | --- |
| Documentation | `npm run docs:check` | Links, anchors, alt, MIME, SVG metadata, language pairs |
| Lint | `npm run lint` | JS/Vue syntax and high-risk semantics |
| API | `npm run test:api` | Auth, RBAC, CSRF, CRUD, uploads, inquiry, restore, production guards |
| Website | `npm run test:website` | Components, filters, SEO, JSON-LD, analytics privacy |
| CMS | `npm run test:admin` | Sessions, CSRF, dashboard and security view models |
| Browser E2E | `npm run test:e2e` | Browse, compare, inquiry, publish/rollback, responsive, axe |
| Recovery | `npm run backup:verify` | Consistent SQLite backup and verified restore |
| Complete | `npm run quality` | Tests, Prisma, audit, recovery and production builds |

## Security, data and observability

![Defense in depth](docs/images/security-layers.svg)

Protected writes pass CORS, session, CSRF, permission and validation checks. Uploads validate declared and actual type, size, pixels and filename. Logs, Sentry and analytics remove request bodies, credentials, cookies and customer PII by default.

![Core domain model](docs/images/domain-model.svg)

![Conversion and operations journey](docs/images/customer-journey.svg)

The stable conversion vocabulary is `product_view`, `product_search`, `product_compare`, `resource_download`, `inquiry_start`, and `inquiry_submit`. Inquiry contents are never copied into product analytics.

## Production delivery

![Local, staging and production topology](docs/images/environment-topology.svg)

![Release pipeline](docs/images/release-pipeline.svg)

Recommended order: quality gate → immutable build → verified backup → migration → API health → website/CMS release → business smoke → 30-minute observation window.

## Documentation

Start with the [English documentation index](docs/en/documentation-index.md). It includes product, CMS, developer, API, configuration, data, security, design/accessibility, testing, deployment, observability, troubleshooting, and operations guides.

- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Known limitations](docs/en/known-limitations.md)
- [MIT License](LICENSE)

Website images are Demo assets. Production must replace them with authorized, source-verifiable product photography; the code license does not automatically grant image rights.
