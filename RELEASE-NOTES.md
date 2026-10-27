# v0.3.0 workflow update

Restart with Stop-Grow-High.cmd followed by Start-Grow-High.cmd, then refresh the browser. Existing local data is retained. First upgrade creates a pre-migration database snapshot in data/backups for an existing workspace.

- Purchases: multi-line purchase editor, partial receipts with quantities, receipt ledger, bounded supplier stock returns, supplier invoices and partial payment recording.
- Billing: version history, retained draft deletion, optional independent approval of the exact invoice version, weekly/monthly recurring draft schedules with pause/resume and manual due generation.
- Expenses: corrections with required reasons, stale-edit protection and prior versions.
- Activity: due date, priority, department and assignee filters; configurable low-stock and overdue activity generation.
- Analytics: all-time recorded receipts, supplier payments, expenses and net cash movement.
- Setup: local preflight command and online integration/deployment handoff without requiring external accounts.

Approval setup: add a second owner/administrator/manager account before enabling mandatory approval. A requester cannot approve their own invoice. Editing a draft invalidates its previous version's approval. Review the invoice through Open invoice in the approval inbox.

Recurring schedules snapshot the template when created. Changing the original later does not update that schedule. Generated invoices stay as drafts; review and issue them manually. No automatic email, stock deduction or payment collection occurs during generation.

Version history begins with the records present at upgrade, plus subsequent changes; older revisions cannot be reconstructed. Deleted drafts remain stored for audit and their numbers are not reused. Pausing activity rules does not remove existing tasks.

This release remains a local application. Online identity, subscriptions, cloud database/storage, email and hosting integrations are not yet implemented. See IMPLEMENTATION-STATUS.md and DEPLOYMENT-SETUP.md.
