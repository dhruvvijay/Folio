# Folio

Folio is a personal finance app with transactions, budgets, savings goals, bills, reports, CSV import and export, and the Folio assistant. Run it on your own computer or deploy it to Render. Each person has a separate ledger tied to their account.

## Accounts

Open Folio and create an account with your email address and a password. New accounts start with a blank ledger. Folio uses the signed-in account to select which ledger to load from the database.

Sign-in lasts up to seven days through an HTTP-only session cookie. Save the private recovery code Folio gives you at sign-up. If you forget your password, use your account email and that code to set a new one. Password changes and recovery issue a new code and invalidate the previous code. In Settings, you can update your display name, change your password, replace your recovery code, sign out of all sessions, or delete your account and its ledger.

Email addresses identify accounts; this version does not send verification or password-reset emails. Recovery uses the saved code. Google sign-in and other external identity providers are not configured.

Accounts share one database, with separate ledger records selected by the authenticated user's server-generated identity. Passwords and recovery codes are stored as salted scrypt hashes, and session tokens are stored as hashes. Customer ledger data stays out of browser local storage. Unsaved offline edits remain in the open tab, so wait for the **Synced** indicator or download a backup before leaving.

A public GitHub repository makes the code available to readers. People create and sign in to their own accounts on the running Folio site.

## Docker Compose

1. Run `docker compose up -d --build`.
2. Open `http://localhost:8080` and create your account.

The `folio-data` volume keeps your SQLite database across container replacements. Use `docker compose down` to stop Folio and retain its database. `docker compose down -v` deletes the volume and its accounts and ledgers.

Compose binds to loopback. Copy `.env.example` to `.env` to change the host port or public origin. Folio accepts HTTP for local loopback development. For remote access, use an HTTPS reverse proxy that forwards the original hostname and set `FOLIO_ORIGIN` to the exact public HTTPS origin without a path.

## Render

1. Give Render access to a Git repository containing these files.
2. In Render, create a Blueprint from that repository. Render reads `render.yaml` and previews the Docker service and managed PostgreSQL resources before it provisions them.
3. Review the prices in the preview. After the deployment succeeds, open the deployed `onrender.com` URL and create your account.

The Blueprint uses paid plans for the Docker web service and managed PostgreSQL. Render supplies `PORT`, `RENDER_EXTERNAL_URL`, and the linked `DATABASE_URL`. Set `FOLIO_ORIGIN` to your exact HTTPS origin if you use a custom domain. If you provision the Docker service and PostgreSQL separately, set `DATABASE_URL` in the service environment.

On Render, Folio uses the client IP header supplied by Render's public ingress for login rate limiting. Other hosts use the connection's socket address and ignore forwarded IP headers. Configure an additional per-client rate limit at your own reverse proxy when self-hosting behind one.

After upgrading an existing Render service, remove any old `FOLIO_USERNAME` and `FOLIO_PASSWORD` variables from its Environment settings.

## Move an existing ledger

Before upgrading from the previous single-owner version, open **Settings → Download full backup** and keep the file somewhere private. The old ledger stays separate from new accounts. After upgrading, create your account and open **Settings → Restore a backup** to import it into your ledger. Use the same backup and restore steps when moving between deployments.

## Development checks

Use Node.js 24 or later. Run `npm ci` and `npm test` to build the client and run the account, database, HTTP access-control, and sync regression tests. `npm run build:portable` creates the runtime bundle used by the Docker image. The portable server initializes its schema on startup and uses PostgreSQL when `DATABASE_URL` is set, or SQLite at `FOLIO_SQLITE_PATH` otherwise.
