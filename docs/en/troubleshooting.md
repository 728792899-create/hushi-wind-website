# Troubleshooting

[简体中文](../troubleshooting.md) · **English**

Reproduce, isolate the boundary, then fix. Do not bypass security checks or edit the Demo database merely to make a page appear healthy.

## Startup

Verify Node 22/npm 10, run `install:all`, check ports with the API script, seed again, then start each application separately to identify the failing boundary.

## Website/API

- Check `/health` first.
- Verify public and internal Nuxt API bases.
- Seed again when Demo state is inconsistent.
- Fix exact CORS origins; never use `*` as a production workaround.

## CMS auth and writes

- 401: clear and renew the session.
- 403: inspect the role permission, not only control visibility.
- `CSRF_INVALID`: refresh the session and verify token plus Origin.
- 423: stop retrying and wait for lock expiry or another administrator.

## Uploads, builds and recovery

Declared type must match magic bytes; filename, size and pixels must pass. Production S3 configuration must agree on endpoint, bucket, region and public base. For build/test issues, seed first, validate both Prisma schemas, install Playwright Chromium, and check build-time URLs.

For backup failures, preserve the last verified recovery point, run `npm run backup:verify`, and confirm integrity plus row counts. Production restoration is rehearsed in isolation before traffic switches.

Never paste `.env`, tokens, databases, full requests, customer contacts or unredacted logs into public issues.
