# Release checklist

[简体中文](../release-checklist.md) · **English**

## Code and evidence

- [ ] `npm run docs:check`, lint, tests and production builds pass.
- [ ] Relevant Browser flows pass at desktop, tablet and mobile sizes.
- [ ] Prisma SQLite/PostgreSQL schemas validate and migrations are committed.
- [ ] Backup restore verification passes.
- [ ] Visible changes include current fictional screenshots.

## Product and content

- [ ] Product status, price/inquiry mode, inventory, warranty, SEO and media agree.
- [ ] Images have authorized sources, dimensions and accurate alt text.
- [ ] Loading, empty, error, retry, success and 404/500 states are present.
- [ ] Chinese and English documentation pairs are synchronized.

## Security and configuration

- [ ] No Demo credentials, placeholders, sample domains, secrets or local-only production state.
- [ ] CORS, CSRF, RBAC, 2FA, upload constraints and shared limits are verified.
- [ ] Sentry release/environment, redaction and alert destinations are correct.

## Data and deployment

- [ ] A fresh backup is verified and recovery/rollback owners are named.
- [ ] Migration compatibility and rollback criteria are documented.
- [ ] API deploys before clients; health and business smoke pass.

## After release

- [ ] Observe errors, latency, uploads, login and inquiry conversion for 30 minutes.
- [ ] Confirm critical alerts are resolved or owned.
- [ ] Record release evidence and any follow-up risk.
