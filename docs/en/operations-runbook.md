# Operations runbook

[简体中文](../operations-runbook.md) · **English**

Use this runbook for staging/production incidents. Preserve redacted evidence and never paste customer PII into public tickets.

![Observability loop](../images/observability-loop.svg)

## Severity

- SEV-1: broad outage, security/data exposure, destructive corruption.
- SEV-2: major workflow unavailable or sustained high error rate.
- SEV-3: degraded noncritical feature with workaround.

## Initial response

Record environment, release, start time, impact and anonymous request clues. Check health, 5xx, latency, client errors, database, Redis, storage/CDN and recent deployment changes. Assign an incident owner and communication channel.

## Common incidents

### API or website 5xx

Compare the error start with releases/config/migrations, inspect normalized routes and dependency health, then roll back the artifact when safer than hotfixing. Do not expose request bodies during diagnosis.

### CMS login failure

Verify API health, allowed Origin, account status/lock, session signing configuration and time synchronization for TOTP. Keep security controls enabled and use a separate authorized administrator for recovery.

### Inquiry submission drop

Compare form opens to successful API `201`, inspect validation/rate limits/bot guards and CRM persistence, and verify analytics delivery is not mistaken for business success.

### Storage/CDN failure

Check endpoint, region, bucket, credentials, object permissions and public base. Do not fall back to ephemeral container storage in multi-instance production.

## Backup and restore

Create a backup before risky migrations, verify it in isolation, compare integrity and key row counts, and record operator/release/checksum. Restore production only from a verified point and run health plus business smoke before traffic resumes.

![Release and rollback pipeline](../images/release-pipeline.svg)

## Postmortem

Capture impact window, detection, root cause, containment, recovery, data/security assessment, missing signals, corrective owner/date and the automated test or guard that prevents recurrence.
