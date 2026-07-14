# Three-minute local Demo script

[简体中文](../demo-script.md) · **English**

This script demonstrates the public website, CMS and API as one operational system using fictional local data.

## Prepare

```bash
npm run seed:demo
npm run dev
```

Open the website on 3000, CMS on 5175, and API health on 1337. Use `demo_admin / DemoPass_2026!` locally. Close unrelated tabs and never record real credentials or customer data.

## Timeline

### 00:00–00:20 — Scope

Explain the Nuxt website, Vue CMS, Express/Prisma API, SQLite Demo and production adapter boundaries.

### 00:20–00:50 — Customer path

Show catalog search/filter, select two products, open comparison, visit detail, and open the inquiry form. Mention keyboard focus and privacy-safe conversion events.

### 00:50–01:35 — CMS content

Log in, show dashboard priorities, edit or publish seeded content, inspect versions, and restore a previous value. Confirm the operation audit.

### 01:35–01:55 — Closed loop

Submit a fictional inquiry on the website and show it entering the CMS CRM queue with permission-controlled private fields.

### 01:55–02:25 — API and health

Show `/health`, explain session/CSRF/RBAC, upload checks, shared production limits and structured logs.

### 02:25–02:50 — Delivery

Show CI, tests, backup restore, environment topology, Sentry release identity and production guards.

### 02:50–03:00 — Close

Restate that the repository is reproducible with Demo data and that real deployment still requires authorized product media and staging verification.

## Recording checklist

- Desktop text and focus are legible.
- No token, `.env`, TOTP secret, private upload or contact appears.
- Success states follow real API responses.
- Seed again after recording.

![Public homepage](../screenshots/01-homepage.jpg)

![Product comparison](../screenshots/07-product-compare.png)

![CMS security center](../screenshots/10-admin-security.png)
