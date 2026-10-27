# Grow High v0.4 — Excel, analytics and document sharing

## What changed

- Excel .xlsx replaces CSV throughout inventory import, templates and report downloads. Files contain real workbooks, not renamed text. Import supports one worksheet, up to 500 data rows and 100 columns, a 2 MB file limit and bounded expanded size. Use plain cell values; formulas, links, rich text and legacy .xls files are rejected. Exports preserve text identifiers and do not turn strings into formulas.
- Removed the decorative dot after Grow High in the login and workspace branding.
- Replaced broad assistant keyword fallbacks with separate calculations for stock, low stock, named products, sales, expenses, customers, supplier purchases, documents, unpaid invoices and tasks. Supports today, this month, last month and explicit ISO date ranges. Unsupported requests get an honest explanation. Generative AI is not connected.
- Analytics has Overview, Sales, Financial, Customers, Products, Operations, Reports and Pipeline tabs. Filters cover date, product/part, category, warehouse, customer, supplier, document type/status, purchase/order status, expense category, stock status and search. Filters apply only where records have real relationships; see Pipeline for the exact rules.
- Visuals include revenue/expense/profit trends, product bars, category and expense donuts, profit waterfall, cumulative area, scatter, invoice histogram, category/month heatmap and Pareto. Product, category, expense and customer chart selections filter related records. Charts use current saved records, not sample metric values. Trend charts show recorded periods only.
- Previous equal-length period comparisons, margin, average net invoice value and adjacent-period invoiced-customer retention. Targets, regions, salesperson metrics, lead funnels, acquisition channels and project dependencies cannot be calculated from the current schema and are not fabricated.
- Filtered multi-sheet Excel analytics reports include filters and calculation policy. All money in these exports is expressed in INR. Source-level Reports remain available.
- Every non-deleted billing document has Share controls: copy message, prepare an email draft, prepare a WhatsApp draft, download a standalone HTML document, and print/save PDF. Review recipients/messages and attach the file manually. Localhost links are never sent as customer-accessible links. Automatic delivery, public share URLs and server PDF generation remain unconfigured.

## Open the updated app

Use the existing extracted folder that contains your data directory. Close its running server window with Ctrl+C. Double-click Start-Grow-High-4181.cmd, leave the new window open, then visit http://127.0.0.1:4181 and press Ctrl+F5. If port 4181 is occupied, stop the earlier Grow High server before starting another copy. Your browser's existing login cookie and the existing database are retained.

## Data pipeline and limitations

The pipeline reads tenant-scoped SQLite records, filters eligible rows, aggregates integer minor-unit amounts, and returns calculated KPIs and chart series. It recomputes on Apply/Refresh. This is an in-app calculation pipeline, not an external ETL service or warehouse connection.

Revenue uses issued invoices less issued credit lines, net of discounts and excluding tax. Draft, cancelled and deleted documents contribute no revenue. Estimated operating profit subtracts saved line costs and recorded operating expenses; it is not audited net profit. Expenses have no product/customer allocation in the current schema. Inventory filters show current balances, not historical stock. Supplier filters affect purchases, not sales attributed to a supplier. Purchase and order date filters use creation dates. Customer retention compares invoiced customer sets in adjacent periods, not subscription churn.

Analytics reads follow the existing tenant-wide read model for signed-in roles; exports require export permission and sharing requires document permission. Date inputs, permissions and tenant references are checked server-side. Calculations and library round trips have automated tests. Browser, mobile and visual results are reported separately from source tests.

## Libraries

Self-hosted browser bundles: ExcelJS 4.4.0 (MIT) and Apache ECharts 5.6.0 (Apache-2.0). Licenses are in dist/vendor. No CDN calls or new runtime npm install are required. These bundles are included in the source archive. Dependency security review is still part of production readiness.

## Launcher and filter follow-up

Analytics filters start collapsed. Show filters and Hide filters preserve both current selections and applied calculations. Hiding does not reset filters; use Apply filters after editing.

Start-Grow-High-4181.cmd now checks the application version and data-folder identity and selects a free port if an older or different instance occupies 4181. Use the address opened by the launcher, which may be 4182 or higher. The last selected address is saved in data/server-url.txt. No unrelated process is stopped.
