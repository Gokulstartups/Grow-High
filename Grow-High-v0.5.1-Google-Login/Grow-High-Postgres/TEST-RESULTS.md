# PostgreSQL upgrade validation — 7 November 2026

- Node.js 24.11.0 on Windows.
- SQLite regression suite: 43 tests, 41 passed, 2 PostgreSQL-only tests skipped, 0 failed.
- Real isolated PostgreSQL 18.4 suite: 25 tests passed, 0 failed. Includes authenticated workflows, cross-tenant access rejection, roles, invoice/stock/payment atomicity, concurrent stock changes, persistence, import rollback and complete-row reconciliation, lock isolation and migration checksum checks.
- SQLite backup check: snapshot includes committed WAL data; source remains readable and unchanged by the tool; existing destination is refused.
- Setup configuration check passed.
- npm ci completed; dependency audit reported zero vulnerabilities at installation time. This is not a comprehensive production security audit.

Only synthetic test records were used. No local business database was migrated and no production connection, data change, deployment or settings change was performed. Actual local/online snapshot conflict resolution and staging restoration remain required before production cutover.

## v0.5.1 Google login update
- Removed the login demo option; retained email/password login.
- Added Google Identity Services, server token verification, nonce checking, and password-confirmed existing-account linking.
- Existing regression suite: 41 passed, 2 PostgreSQL-only skips. Focused Google verification, rendering, cloud startup and launcher checks: 7 passed.
- Real Google account end-to-end verification is pending GOOGLE_CLIENT_ID configuration. Production remains unchanged.
