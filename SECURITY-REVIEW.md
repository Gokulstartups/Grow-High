# Grow High local edition — security review

Reviewed against the supplied seven-check audit brief. This is a source-level review plus targeted automated tests, not a penetration-test certificate or production approval.

## Evidence and limitations

| Check | Evidence | Result and remaining risk |
|---|---|---|
| Secrets in client code | `server.mjs` generates session tokens and hashes them before storage; `dist/app.js` receives only a one-time account recovery code; no external provider credentials are configured | No provider secrets are required or embedded in this implementation. Source history for the original project was not audited. |
| Data leaks through logging | `server.mjs` error handler logs only error code/name; startup logs the local URL; the assistant performs no external calls | No password/body logging in the implemented handlers. SQLite business data, audit entries and local backups remain sensitive and unencrypted. |
| Client-controlled financial logic | `documentBody`, invoice status handler, payment handler, and purchase handler in `server.mjs` | Server computes totals with integer minor units and BigInt rounding, checks permissions, validates stock, limits credits/payments and protects finalized records. Authorized staff may choose unit prices and discounts as part of document editing. This is not a tax compliance certification. |
| Authentication and access | `passwordHash`, `session`, `user`, `authorize`, `get`, `list` and tenant-scoped SQL in `server.mjs` | Salted scrypt, hashed opaque session tokens, expiry and revocation, role checks, tenant ownership checks. Tests attempt cross-tenant record use, unauthenticated access and read-only-role mutations. No MFA, verified email or managed identity provider yet. |
| Injection and unsafe uploads | Parameterized SQLite calls; `esc` and `csvDownload` in `dist/workspace.js`; CSP and origin checks in `server.mjs`; `logo` validation | HTML output escapes record text, Excel exports use typed values and preserve formula-like strings as text, writes require the same origin, static paths stay inside `dist`. Logos allow bounded PNG/JPEG data only and verify signatures; SVG/forged types are rejected. No arbitrary file storage exists. Full image decoding/dimension validation is not implemented. |
| Rate limiting and AI | `limit` and `/api/assistant` in `server.mjs` | Authentication, registration/recovery, mutations and assistant requests have process-local limits. Assistant uses bounded rule-based reads, never model-generated SQL or arbitrary tool execution. Limits reset with the process and are not suitable for distributed hosting. Generative AI is not connected. |
| Dependency and deployment surface | `package.json`, loopback binding in `server.mjs`, `launch.mjs`, `.gitignore` | No third-party runtime npm packages. Node/OS vulnerability scanning was not performed. The app is local HTTP only; database encryption, cloud backups, restore drills, external monitoring, HTTPS and production hosting are absent. |

## Priority before public deployment

1. **High — local authentication and transport are not a public SaaS deployment.** The session cookie is intentionally not Secure on loopback HTTP. Do not expose this listener through public forwarding. Move to an established identity service, HTTPS, Secure cookies, email verification, MFA, reviewed recovery and invitation flows.
2. **High — local database and backup confidentiality.** Anyone with filesystem access to the data directory can access business data and password hashes. Add appropriate OS/database storage protection, encrypted off-device backups, access controls and tested restoration.
3. **Medium — prototype data model and process limits.** Business records use tenant-scoped JSON rows with server-side reference validation. Production requires normalized domain tables, stronger database-level relationships, migration discipline, indexed pagination, durable jobs and distributed rate limits.
4. **Medium — availability and operational coverage.** Background automation stops when the local server stops. Add durable queues, error visibility, health checks and operational alerting before relying on unattended workflows.
5. **Verification gap — browser and deployment testing.** Automated source render checks passed, but real browser accessibility, mobile layout, printing, image decoding and click-through testing remain incomplete because of environment restrictions. Load tests and independent penetration testing are not complete.

No finding here authorizes or requires changing system firewall rules, weakening sandbox protections, or exposing the local server to the internet.


## v0.4 analytics and sharing

Analytics aggregates tenant-scoped records on the server and checks export permissions. Sharing payloads check document permissions and tenant ownership; client controls prepare drafts only. Excel imports reject formula/link/rich-text cells and enforce compressed/expanded-size, row and column limits. Browser libraries are vendored with licenses. The new calculations, empty states, Excel round trips, tenant boundaries and sharing URL construction are covered by automated tests. Production dependency scanning and a complete independent security review remain outstanding.
