# Render deployment repair

This fixes the v0.4.1 port timeout, public host/origin checks, and missing frontend files. It is a staging build, not completed production SaaS. PostgreSQL is not implemented; DATABASE_URL alone will not migrate SQLite.

1. Upload this package's contents to the repository root, preserving the dist and tests folders. Never upload data, .env, database files, or backups.
2. In Render use a Node Web Service with repository root containing package.json. Build command: npm install. Start command: npm start. Set NODE_VERSION to 24.11.0. Do not use launch.mjs or a Windows .cmd file.
3. Render automatically provides RENDER=true, RENDER_EXTERNAL_URL, and PORT. The server uses these to listen on 0.0.0.0 and accept its HTTPS domain. For a custom domain set GH_PUBLIC_URL to its exact HTTPS origin, for example https://app.example.com, without a path. Only that configured hostname is accepted.
4. Set the health-check path to /healthz. Deploy the updated commit, then verify login and record creation.
5. For disposable testing, the default local database can be used, but records on Render's ephemeral filesystem can disappear on deploy/restart. Do not enter real business records there. To retain SQLite temporarily, attach a persistent disk, mount it at /var/data, and set GH_DATA_DIR=/var/data/grow-high. This may require a paid plan. Use one instance only.
6. Before customer use, complete PostgreSQL migration, verified account recovery, production access controls, backups and restore testing, and security review. Current registration/demo and recovery-code workflows remain in this staging build.

Local launchers still bind to 127.0.0.1 when cloud environment variables are absent.
