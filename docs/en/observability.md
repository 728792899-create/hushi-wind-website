# Observability and alerts

[简体中文](../observability.md) · **English**

![Error, performance, logs and conversion feedback loop](../images/observability-loop.svg)

## Three-tier Sentry

Website client/SSR, CMS and API use the same immutable release and distinct environments. SDKs initialize only when a DSN exists; source maps upload only when build credentials are complete. Request bodies, cookies, authorization, query strings and PII are removed by default.

## Logs and health

API emits structured request/application logs with method, normalized path, status, duration, error code, release and request correlation. `/health` checks process and database readiness without exposing secrets.

## Alerts

Recommended signals include sustained 5xx, latency, inquiry-submit drop, client error spikes, failed uploads/storage, abnormal admin logins, stale/failed backups and unresolved critical alerts. Thresholds are calibrated in staging before paging production operators.

## Release observation

Observe health, error rate, latency, client errors and conversion for at least 30 minutes after release. Roll back when impact is material and a previous artifact is safer than a hotfix. Preserve redacted evidence for the postmortem.
