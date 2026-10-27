# Grow High — local application

This is a working local business-management application with a server and persistent database. It is not yet the complete production SaaS described in the master brief. The feature coverage and remaining work are recorded in `IMPLEMENTATION-STATUS.md`.

## v0.4 Excel and analytics update

See `UPDATE-v0.4.md` for the six requested changes, supported filters and sharing steps. Use Start-Grow-High-4181.cmd in your existing app folder after stopping the old server, then refresh the browser with Ctrl+F5.

## v0.3 workflow update

See `RELEASE-NOTES.md` for the new workflow controls and `DEPLOYMENT-SETUP.md` for account-free online setup preparation. Run `npm run setup:check` to check the local package. If the software is already running, stop and restart it to load this update.

## Open your software

1. In File Explorer, open this folder and double-click **Start-Grow-High.cmd**.
2. Your browser opens **http://127.0.0.1:4180** after the server is ready.
3. Choose **Explore a working demo** to inspect an isolated workspace containing sample records, or **Create an account** to start your own empty business workspace.
4. If you create an account, save the recovery code shown once after registration. You can use it with **Forgot password**.

Node.js 24 or later is required and is already present on the development computer. No package installation is needed. Keep this folder in place. Open the HTTP address, not `dist/index.html`, to use the working application.

The launcher keeps a server window open. Keep that window open while using Grow High; closing it stops the server. **Stop-Grow-High.cmd** stops the launcher-owned server. The stop script verifies the process name and application path before stopping it. Restarting preserves accounts and business data.

If startup fails, inspect `data/server.log`. Port 4180 must be available. Alternatively, open a terminal in this folder and run `node server.mjs`.

## Try the connected workflows

- **Inventory:** add a product or part, open it, and use **Adjust stock** to record its opening balance. Use **Transfer** for warehouse moves. Configure a bill of materials and assemble finished products atomically.
- **Custom columns:** add a field, fill it on products, search or sort by it, and save a column layout. The field definitions and values are saved in the database.
- **Import:** download the Excel (.xlsx) template, fill it, and import up to 500 rows. Any invalid row rolls back the whole import. Exported reports can be opened in Excel.
- **Billing:** add a customer, create a quotation, mark it sent, accept it, and convert it into an invoice. Issuing an inventory invoice deducts stock. Draft creation and quotation acceptance do not deduct stock.
- **Payments:** open an issued invoice and record a payment with a unique reference. Overpayments and duplicate payment references are rejected. Network retries with the same request key do not double-record a payment.
- **Credits:** create a credit note linked to an issued invoice for the same customer and company. Credits cannot exceed its unpaid balance. Credits adjust the invoice balance; they do not refund money or return inventory.
- **Orders:** accepting a quotation creates a sales order. Track packing, dispatch, and delivery from Home. Delivery tracking is an operational record; invoice issuance controls inventory deduction.
- **Purchases:** create a supplier and a purchase order. Receiving goods updates stock exactly once.
- **Company branding:** configure company details and a PNG/JPEG logo in Settings. Select the relevant company when preparing documents. Issued documents preserve snapshots of those details.
- **Print/PDF:** open a document and choose **Print / Save PDF**, then use the browser print dialog. The business owns the header; Grow High appears as a small footer.
- **Analytics and reports:** figures are calculated from saved records. Excel (.xlsx) exports and a business-data JSON export are available to permitted roles.
- **Team:** owners and administrators can create local team accounts, assign roles, or revoke access. This is direct account creation, not an emailed invitation flow.
- **Assistant:** local rule-based queries answer stock, invoice, activity, and financial-summary questions. No generative AI provider is connected.

## Data and security

Business data and account records are stored in `data/grow-high.sqlite` with SQLite WAL files. Passwords use salted scrypt hashes. Cookies are HttpOnly and SameSite=Strict. The application listens only on loopback, validates request origins, enforces tenant ownership and role permissions on the server, and uses parameterized queries and atomic transactions.

This local database is **not encrypted at rest**. The local HTTP cookie does not use the Secure flag because the server uses HTTP on loopback. Do not expose this server publicly. Hosted use requires managed authentication, HTTPS, secret management, durable backups, monitoring, and further security review.

For a manual backup, stop Grow High first and copy the entire `data` directory to a secure backup location. Restore only while the server is stopped. The JSON business export is useful for inspection and migration; no JSON import/restore workflow is implemented.

Demo workspaces are separate tenants and contain clearly fictional sample records. Demo access lasts for the current session; create a real local account for a workspace you can sign back into.

## Development and verification

Run `npm test` or `node --test tests/*.test.mjs`. The tests use separate temporary databases, never your workspace data.

Tests cover account creation, login, recovery and session revocation; tenant boundaries; role enforcement; custom fields; optimistic concurrency; monetary rounding; invoice conversion and stock deduction; bounded, idempotent payments; transfers; assembly; purchase receipt deduplication; credit limits; order transitions; import rollback; concurrent stock issues; activity automation; server restart persistence; page rendering; escaping; Excel (.xlsx) parsing; and launcher readiness.

Automated browser layout and click-through checks remain unverified because this environment could not reach the sandboxed local server and its browser policy rejects file navigation. Source rendering tests do not replace browser accessibility or responsive-layout testing.

