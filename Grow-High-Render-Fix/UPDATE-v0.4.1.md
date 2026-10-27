# v0.4.1 assistant fixes

- Hey/Hi/Hello now receive a direct greeting, with no unrelated inventory link.
- Date questions answer using India time. Help, thanks and common workflow questions receive specific replies.
- Expired sessions redirect to a clear sign-in notice rather than silently appearing to drop the question. The unsent question is retained in this tab's session storage and is restored after sign-in; it is not automatically submitted. Successful replies clear the saved draft.
- Request failures remain visible beside the chat input. A sending indicator prevents duplicate submission. New replies scroll into view.
- The launcher identifies both the installed version and data folder, so it does not silently reuse an older server after an update.

36 automated checks passed, including greeting/date handling and unsent-question preservation after a 401 response. A real browser reproduction found an expired login session when sending Hey. The updated backend needs a restart; use Start-Grow-High-4181.cmd and the address it opens. Sign in with your existing account. The demo button creates a separate sample workspace; it does not recover a previous demo session.

The assistant remains a local, rule-based business helper. A generative AI provider has not been configured; these changes do not add unrestricted general conversation or forecasting.
