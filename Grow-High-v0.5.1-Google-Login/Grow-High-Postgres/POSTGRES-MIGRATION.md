# Grow High PostgreSQL migration

This is a separate upgrade package. No existing SQLite database or production settings were changed. Do not upload to the live branch or redeploy before securing a current online database snapshot. A project ZIP is not a complete business backup.

## How the database is selected

DATABASE_URL selects PostgreSQL. Configuration/connectivity failures stop startup without falling back to SQLite. Set GH_REQUIRE_POSTGRES=1 on Render so a missing URL also stops startup. Without those settings, SQLite remains supported locally. The tenant/workspace security boundary is preserved; multiple company profiles inside one tenant remain shared.

Queries are asynchronous and parameterized. Transactions use one connection. Per-tenant transaction locks serialize same-workspace operations, including stock, invoice numbering, payments and recurring invoices. Different tenants can run concurrently. Existing version checks and role restrictions remain.

## Verify the package locally

Use Node 24 and run these commands sequentially from this folder:

```powershell
npm ci
npm test
npm run test:postgres
```

Tests create disposable fixtures. The PostgreSQL runner starts its own loopback-only cluster with generated credentials; it does not use a supplied production DATABASE_URL. Test clusters remain under work/ for diagnosis. Do not upload work/ or node_modules/. Runtime-only installation is `npm ci --omit=dev`.

## Preserve both sources before migration

Identify the authoritative local installation. Keep every existing database and backup. A running SQLite database can contain committed records in its WAL file, so copying just grow-high.sqlite is unsafe.

Create a separate consistent snapshot; the destination parent must exist and the destination file must not already exist:

```powershell
npm run db:backup-sqlite -- "C:\path\to\existing\data\grow-high.sqlite" "C:\private-backups\local.sqlite"
```

Obtaining and downloading a consistent snapshot from the existing Render service is a separate production operation requiring approval. Do not redeploy that service to install this utility before retrieving its data. Do not upload databases, logs, business exports or credentials to GitHub.

## Rehearse importing local and online records

Use a new, empty staging PostgreSQL database. Set DATABASE_URL privately for the command process. Keep the destination application stopped throughout import and verification. Set GH_DB_SSL appropriately; verified TLS is the default for non-loopback hosts. A trusted CA can be supplied with GH_DB_CA_FILE. Never disable TLS to bypass an external certificate error. SSL URL parameters are rejected to prevent overriding certificate settings.

```powershell
npm run db:migrate
npm run db:import -- --confirm-empty-target "C:\private-backups\local.sqlite" "C:\private-backups\online.sqlite"
npm run db:verify -- "C:\private-backups\local.sqlite" "C:\private-backups\online.sqlite"
```

Supply all approved snapshots together. The importer reads sources without modifying them, validates schema/references, and imports atomically. Conflicting emails or different versions of the same record stop the import for explicit reconciliation. It refuses a nonempty destination. Identical shared rows can be deduplicated. Password/recovery hashes, sessions, IDs, versions, counters and histories are retained. Independent SQLite audit IDs are mapped to new IDs while preserving source mappings and every audit entry.

Verification compares complete rows and source fingerprints before opening the destination to writes. After new application writes, exact source reconciliation should fail. Rehearse login, reports, inventory, invoices and payments with the migrated data before approving cutover.

## Render staging settings

Use a separate branch, web service and database. Do not change the production service yet. If uploading the whole Grow-High-Postgres folder, set Root Directory to Grow-High-Postgres; if uploading its contents at the repository root, leave Root Directory blank. It must contain package.json, db/, scripts/ and dist/.

| Setting | Value |
|---|---|
| Build command | npm ci --omit=dev |
| Pre-deploy command, if available | npm run db:migrate |
| Start command | npm start |
| Health check | /healthz |
| NODE_VERSION | 24.11.0 |
| GH_REQUIRE_POSTGRES | 1 |
| DATABASE_URL | Staging connection set privately in Render |
| GH_DB_POOL_SIZE | 5 |

If there is no pre-deploy command, use `npm run db:migrate && npm start` as the start command. Schema migrations are locked and checksummed; business imports are never automatic. Use the same region for the Render service and database. GH_PUBLIC_URL is optional on Render; set it to the exact HTTPS origin if using a custom domain.

## Production cutover: separate approval required

After a successful staging rehearsal, freeze writes on both sources, capture fresh snapshots, import into the approved empty production database, reconcile, and then switch the application connection. Do not permit local and online copies to accept divergent writes during cutover. Keep the original databases and snapshots until restoration is verified.

Before new PostgreSQL writes, a failed cutover can leave the old sources authoritative. After new PostgreSQL writes, reverting to old SQLite would lose new changes: freeze writes and reconcile instead. PostgreSQL backups and restore testing are separate operational steps. Email, subscriptions, AI integration and automated delivery are outside this database conversion.

Reference: https://render.com/docs/postgresql-creating-connecting and https://render.com/docs/deploys
