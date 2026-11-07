# Enable Google sign-in

The demo button is removed from the login page. Google sign-in uses Google's Identity Services button and server-verified ID tokens. Existing email/password login remains available.

1. In Google Cloud / Google Auth Platform, create or select your project and configure Branding, Audience and the consent screen. Add test users while the app is in testing.
2. Create an OAuth client of type Web application.
3. Add your exact site origin to Authorized JavaScript origins: https://grow-high.onrender.com. For local testing, add http://localhost and the exact localhost origin with the chosen port. Open the local app using that registered localhost address.
4. Set GOOGLE_CLIENT_ID in the server environment to that web client ID. This ID is public; this GIS flow does not require a client secret or redirect URI.
5. After separate deployment approval, deploy/restart with these settings. Without the client ID, the button explains setup is pending; email login still works.
6. Test Google login with a test account. First-time linking of an existing account requires its Grow High password. New users supply a business name and backup password and receive a recovery code. Later sign-ins use the linked Google subject ID, never email alone.

Links are stored as internal authGoogle records with globally unique hashed Google subject IDs and tenant/user references. Existing schema and SQLite-to-PostgreSQL imports retain these records. No existing account is moved between companies. Google tokens are verified for signature, issuer, audience and expiry by Google's official library; the app additionally checks verified email and a browser-bound nonce. Tokens are not persisted. Nonce expires after ten minutes: refresh the login page if login verification expires.

Production was not modified. Real Google account end-to-end testing requires your configured client ID and authorized origin.

Official setup: https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
Token verification: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
