# Known limitations and residual risks

[简体中文](../known-limitations.md) · **English**

- PostgreSQL, Redis, S3/CDN and multi-instance behavior require validation in a real staging environment.
- External Sentry, Mixpanel, webhook/email and source-map uploads remain disabled without deployment credentials.
- Demo product media is not a substitute for authorized production photography and rights records.
- Performance and accessibility evidence is environment- and release-specific; repeat it for the target infrastructure and real content.
- Backup scripts verify local SQLite automatically; production recovery objectives and PITR drills belong to the operator.
- The current modularization covers high-risk product and inquiry domains; additional legacy API routes can continue moving behind the same boundaries.
