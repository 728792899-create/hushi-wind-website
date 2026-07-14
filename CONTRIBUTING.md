# Contributing

**English** · [简体中文](CONTRIBUTING.zh-CN.md)

Thank you for improving the Hushi Wind full-stack website. Keep every change reproducible, reviewable, and free of production data.

## Development workflow

```bash
npm run install:all
npm run seed:demo
npm run dev
```

Create a focused branch, add tests before or with behavior changes, and run the smallest relevant checks during development. Before opening a pull request, run:

```bash
npm run docs:check
npm run quality
```

## Pull request expectations

- Explain the user or operational problem and the chosen boundary.
- Include tests and exact verification commands.
- Attach real seeded screenshots for visible changes at relevant viewports.
- Update API, configuration, permissions, deployment, monitoring, and rollback documentation when affected.
- Keep Chinese and English documentation pairs synchronized.
- Never commit secrets, production databases, customer data, private uploads, or unlicensed media.

## Architecture rules

- Public website and CMS clients do not access the database directly.
- Protected writes require session, CSRF, CORS, permission, and validation checks.
- Prefer route → controller → service → repository for business domains.
- Keep SQLite Demo and PostgreSQL production schemas semantically aligned.
- Analytics and monitoring must not receive inquiry bodies or unnecessary PII.

## Visual evidence

Use Browser against a fresh Demo seed. UI screenshots should be true PNG files, use the documented viewports, contain only fictional data, and have accurate alt text. Generated images must never impersonate real products.

Report security issues through the private process in [SECURITY.md](SECURITY.md), not a public issue.
