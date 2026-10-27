# v0.4 update

Excel import/export, expanded analytics, a documented calculation pipeline, improved local assistant queries and email/WhatsApp draft sharing are implemented. See UPDATE-v0.4.md for current behavior and limitations; the older coverage table below provides broader SaaS context.

# Grow High feature coverage

The supplied master brief describes a large production SaaS. The current deliverable is a local functional edition, not a claim that every requested feature is complete.

| Area | Implemented | Remaining |
|---|---|---|
| Accounts | Registration, password login, recovery codes, session expiry/logout, separate tenants, roles, team account administration | Managed authentication, Google OAuth, MFA, verified email, secure emailed invitations, account lifecycle and retention |
| Home / Activity | Pending/completed tasks, priority, assignee, due dates, search, upcoming work, audit feed, operational summary, due/priority/department/assignee filters | Richer daily KPI comparisons and external notifications |
| Inventory | Products/parts, CRUD with archiving/restoring, integer quantities, warehouses, stock receipts/issues/transfers, transaction history, SKU uniqueness, reorder alerts | Fractional quantities, reservations, variants, camera scanning, per-lot/serial ledgers, additional inventory types, saved filter presets, grid view |
| Assembly | Persistent BOMs, validated atomic consumption and output | Production scheduling, multistage assembly, work orders and costing |
| Custom columns | Persistent definitions and values, rename, hide/show, drag/arrow ordering, defaults, required values, types, search/sort/export | Multi-select/reference/datetime fields, advanced validation rules, team-shared layouts |
| Import/export | Atomic Excel imports, selected-column inventory exports, Excel reports, business JSON export | background bulk jobs, restore UI |
| Billing | Quotations/invoices/proformas/credits, multi-line drafts, edit/duplicate, status transitions, quotation conversion, stock deduction on issue, cancellation safeguards, tax rounding, payments, company snapshots, recurring drafts, draft deletion, version history, independent approval | Multi-stage approval chains, secure share links, automated document email/WhatsApp delivery, standalone server-generated PDFs |
| Credits and returns | Invoice-linked credits bounded by outstanding balance, cancellation reversal, supplier physical stock returns | Paid-invoice refunds, physical returns, partial item return costing, supplier credit/refund accounting |
| Branding | Multiple company profiles, logo and contact/tax/payment/signatory details, company document header, small Grow High footer | Custom document numbering schemes and template builder |
| Orders/delivery | Sales orders from accepted quotations, confirmed/packed/dispatched/delivered workflow, tracking reference and timeline | Standalone orders, partial fulfilment, courier integrations, delivery documents |
| Purchases | Supplier profiles, purchase orders, expected dates, multi-line orders, partial/full goods receipts, receipt ledger, supplier invoices/payables and payments | Requisitions, purchase approval chains, supplier scoring |
| Expenses | Categorized expense records, corrections with revision history and reports | Receipt attachments, approvals, recurring expenses |
| Analytics | Date-filtered revenue/cash/expense/profit estimates, six-month sales chart, product revenue, receivables, inventory value, recorded cash movements | Full BI report builder, drill-downs, cash-flow statement, turnover, customer segmentation, targets, forecasting, scheduled reports, FIFO/weighted-average valuation |
| Assistant | Authorized local data queries and saved conversations with explicit rule-based labeling | Generative provider integration, charts, deeper language understanding, forecasts and proposed-action confirmations |
| Automation | Low-stock, overdue-payment and accepted-quote activities; deduplication and resolution; server-side minute timer, activity-rule toggles, persisted recurring schedules and completed generation ledger | General rule engine, durable worker queue, retries dashboard, integrations and scheduled reports |
| Security | Tenant-scoped queries, server role checks, origin checks, CSP, bounded input, scrypt, opaque sessions, request limits, audit events | Independent penetration review, production monitoring, encrypted storage/backups, robust distributed rate limiting, incident procedures |
| Architecture | Local Node.js 24, SQLite WAL, parameterized operations, atomic transactions, integer minor-unit money | Production relational domain schema/migrations, PostgreSQL deployment, indexed pagination, worker queues, cloud object storage, scale/load testing |
| SaaS operations | Local account/workspace administration | Online hosting, subscriptions, payment gateway, entitlements/limits, churn/MRR metrics, custom domains and multi-currency |

The original Sites registration remains an unpublished artifact from the initial login-page attempt. The Node/SQLite application cannot be deployed by uploading only its `dist` directory; that would omit the entire backend. A hosted deployment needs an appropriate server/database environment or a deliberate migration to a supported hosted stack.

To finish the production scope, select the hosting/database environment and authentication, email, AI, and payment providers, then implement and test their integrations. Secrets must be supplied through the deployment secret store, not frontend files or chat-visible source.
