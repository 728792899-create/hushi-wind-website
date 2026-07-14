# CMS operations guide

[简体中文](../admin-guide.md) · **English**

This guide is for content editors, support, administrators and release owners. CMS operates on the same API data presented by the public website.

## Login and session

Local Demo: `http://127.0.0.1:5175`, `demo_admin / DemoPass_2026!`. Never use this shared account in production. CMS stores expiring session and CSRF values in `sessionStorage`; password or account-version changes invalidate previous sessions.

## Dashboard

![CMS operations dashboard](../screenshots/03-admin-dashboard.jpg)

Use the dashboard to prioritize new inquiries, urgent tickets, product content gaps, drafts, API/frontend errors, resource failures, backups, abnormal logins, unresolved alerts, and conversion changes. Operational readiness does not replace green CI.

## Roles

| Role | Primary use |
| --- | --- |
| `super_admin` | Accounts and system security |
| `operations` | Content, CRM, resources, logs and backups |
| `support` | Leads, private CRM fields and exports |
| `editor` | Articles, pages and artists; selected read access |
| `readonly` | Review and observation |

## Publish a product

![CMS product editor](../screenshots/13-cms-product-editor.png)

Create or edit the record, verify slug/category/series/status, upload authorized media, complete specifications/scenes/warranty/SEO, save a draft, preview, then publish. Verify catalog, detail, comparison, alt text and JSON-LD on the public website.

## Restore a version

![Product version history and restore action](../screenshots/14-cms-version-history.png)

Open versions, choose by timestamp/operator/summary, confirm the current state will be replaced, restore, verify the public result, and check that the restore appears in the operation log. Content restore is not database recovery.

## CRM and resources

| Inquiry queue | Resource library |
| --- | --- |
| ![CMS CRM inquiry queue](../screenshots/15-cms-crm-inquiries.png) | ![CMS resource library statistics and filters](../screenshots/16-cms-resource-library.png) |

Process urgent and unread leads first. Keep customer details inside authorized workflows; exports are purpose-limited and audited. Before uploading media, verify rights, right-size the file, use a safe name and prepare alt text. Referenced resources cannot be deleted.

## Security center

![CMS security and audit center](../screenshots/10-admin-security.png)

Verify a backup, create and test a named non-default super administrator, enroll high-privilege 2FA, then disable the default account. Review alerts, accounts, operations, logins, exports and backups daily/weekly as appropriate.

![Database backup marked as restore-tested](../screenshots/17-cms-backup-restore.png)

Never fabricate readiness evidence, expose contacts in issues/analytics, or use generated/unlicensed imagery as real product photography.
