# Grow High — online SaaS setup preparation

Status: local application v0.3.0. No external accounts or paid services have been created. The current server is intentionally restricted to the local computer. This document is a staged implementation handoff, not a claim that adding credentials enables hosted SaaS.

## 1. Check the current package

From this folder run `npm run setup:check`, then `npm test`. Open with Start-Grow-High.cmd. Stop and restart an older running server to load v0.3.0. Existing accounts remain in data/grow-high.sqlite. The first v0.3 startup makes a consistent pre-migration SQLite snapshot under data/backups when existing records are present. Keep that backup private.

## 2. Finish the application foundation before choosing services

The existing repository and transaction helpers in server.mjs use SQLite and JSON records. Move business entities into a versioned relational schema, preserving tenant ownership, record IDs, monetary minor units, document snapshots and histories. Implement PostgreSQL repository and transaction adapters and migration checks against copies of local data. Do not point the current server at a PostgreSQL URL: that adapter is not implemented.

Implement tenant memberships and onboarding, verified account recovery, invitation expiry, account disablement and retention. Preserve independent invoice approval and tenant isolation. Add pagination and indexed queries before loading large datasets.

Move recurring work into a durable worker with a persisted queue, retry/backoff, failure visibility and tenant quotas. Current recurrence runs only while the local process is running, catches up at most 12 dates per schedule per tick, and creates drafts only.

## 3. External account slots — leave these unconfigured for now

| Service | Needed later | Integration work still required |
|---|---|---|
| Domain and DNS | A domain you control | DNS records, domain verification, HTTPS |
| App hosting | Server runtime and a separate staging environment | Deployment pipeline, trusted origins, secure cookies, health/readiness checks, graceful shutdown |
| Managed PostgreSQL | Private connection and backup policy | Repository adapter, schema migrations, restore verification, connection limits |
| Identity provider | Application/client registration | Server-side token validation, tenant membership, invitations, verified recovery, optional Google login/MFA |
| Transactional email | Verified sender domain | Queue, templates, delivery retries, bounce handling, verification and invitation links |
| Object storage | Private bucket and service role | Validated uploads, tenant-scoped object keys, short-lived download links, retention |
| Subscription payments | Merchant account and test mode | Plans, signed webhook verification, deduplication, subscription state, server-side entitlements, cancellation and reconciliation |
| Monitoring | Error/log destination | Redaction, alerts, queue failures, uptime and incident procedures |
| Optional generative AI | Restricted server API access | Tenant-scoped data retrieval, spend limits, action confirmations and evaluation |

Use deployment secret storage for credentials when those accounts exist. Never place secrets in dist/, source archives, chat messages or browser local storage. Provider selection and prices remain undecided. No placeholder integrations are presented as working.

## 4. Integration acceptance criteria

- Identity: registration/verification/recovery/invitation and logout work end to end; disabled users lose access; another tenant's IDs never reveal data.
- Billing: duplicate and out-of-order sandbox webhooks do not grant extra access; rejected signatures change nothing; failed payments and cancellation update entitlements correctly.
- Email: links expire and are single-use where appropriate; retrying a job does not send duplicate business documents.
- Storage: uploads are size/type checked; one tenant cannot list or download another tenant's files.
- Data: migrate a copy, compare counts and money/stock balances, restore a backup, and rehearse rollback before moving real data.
- Operations: restart and worker interruption recover safely; logs omit credentials; restore and incident owners are assigned.

## 5. Remaining business work

Supplier credits/refunds, customer stock returns, partial sales fulfilment, inventory reservations/lot tracking, fractional quantities, expense attachments and approvals, document sharing/email/PDF generation, XLSX import/export, and full accounting/valuation remain separate implementation tasks. Current supplier returns move physical stock only. Supplier payment records do not transfer funds. Net recorded cash movement is not a bank balance or formal cash-flow statement.

## 6. Staging, then launch

Once the adapters and accounts are ready: provision staging, inject secrets, migrate a test copy, run integration and security checks, test backup restoration, and review the actual staging application. Only then configure production DNS, migrate approved data and enable live payments. Uploading only dist/ cannot deploy this application because it excludes its backend and database.
