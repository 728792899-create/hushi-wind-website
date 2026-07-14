# Documentation index

[简体中文](../documentation-index.md) · **English**

Choose the shortest path for your role; you do not need to read every document in order.

![Hushi Wind repository overview](../images/project-cover.svg)

## Run the Demo

1. Follow the root [README](../../README.en.md#run-locally).
2. Run `npm run install:all`, `npm run seed:demo`, and `npm run dev`.
3. Follow the [three-minute demo script](demo-script.md).
4. Seed again after the demo to restore the fictional baseline.

## Product and business

- [Product journey](product-tour.md)
- [Conversion events](analytics.md)
- [Known limitations](known-limitations.md)

## CMS operations

- [CMS operations guide](admin-guide.md)
- [Security and permissions](security-and-permissions.md)
- [Release checklist](release-checklist.md)

## Development and integration

- [Developer guide](developer-guide.md)
- [Architecture](architecture.md)
- [API guide](api-reference.md)
- [Configuration reference](configuration-reference.md)
- [Data model](data-model.md)
- [Design system and accessibility](design-system-and-accessibility.md)
- [Testing and acceptance](testing-and-acceptance.md)

## Deployment and operations

- [Deployment, migration and rollback](deployment.md)
- [Operations runbook](operations-runbook.md)
- [Observability and alerts](observability.md)
- [Troubleshooting](troubleshooting.md)

## Command quick reference

| Goal | Command |
| --- | --- |
| Install all apps | `npm run install:all` |
| Reset Demo | `npm run seed:demo` |
| Start all apps | `npm run dev` |
| Validate docs | `npm run docs:check` |
| Run tests | `npm run test` |
| Run E2E | `npm run test:e2e` |
| Verify restore | `npm run backup:verify` |
| Full gate | `npm run quality` |

Feature changes must update user instructions, API/configuration/permission contracts, tests, deployment/monitoring/rollback notes, and real screenshots when visible behavior changes.
