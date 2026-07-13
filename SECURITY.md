# Security Policy

## Supported versions

Security fixes are applied to the latest commit on the default branch. Demo credentials, fixture data and local SQLite files are not production credentials or production data.

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials or customer data. Contact the repository owner through the private security-advisory channel on GitHub and include:

- affected route, component and commit;
- impact and minimum reproduction;
- whether authentication or a specific permission is required;
- redacted request/response evidence;
- suggested mitigation, if known.

Expected acknowledgement is within three business days. Critical authentication bypass, arbitrary file upload, remote code execution, secret exposure and customer-data disclosure are handled first. Public disclosure should wait until a fix and deployment window are agreed.

## Security assumptions

- Production runs behind HTTPS and a trusted reverse proxy. Set `TRUST_PROXY` only when the proxy chain is controlled.
- Secrets are injected by the deployment platform; `.env`, database files, backups and runtime uploads are not committed.
- Multi-instance production uses PostgreSQL, Redis-backed rate limits and object storage. Local SQLite/filesystem mode is for demo or a controlled single instance.
- Sentry and product analytics run without default PII. Never add inquiry bodies, contact details, access tokens or cookies to telemetry.
- Rotate the administrator password, token secret, S3 credentials, Redis password and Sentry auth token after suspected exposure.

## Operator response

1. Disable or rotate the affected credential/session.
2. Preserve structured logs and audit records without copying customer PII into tickets.
3. Roll back the affected release when containment is safer than a hotfix.
4. Restore only from a verified backup and run post-deploy smoke checks.
5. Record root cause, affected window and corrective tests.
