# Folio

Folio is a private personal finance app with transactions, budgets, savings goals, bills, reports, CSV import and export, and the Folio assistant. The Docker app serves the same ledger and dashboard on your own host or Render.

## Docker Compose

1. Copy `.env.example` to `.env`. Set `FOLIO_PASSWORD` to a password of at least 20 characters. Generate one with `openssl rand -hex 24` or a password manager.
2. Run `docker compose up -d --build`.
3. Open `http://localhost:8080`. Sign in with `FOLIO_USERNAME` (default `folio`) and the password from `.env`.

The `folio-data` volume keeps the SQLite ledger across container replacements. Use `docker compose down` to stop the app and retain its database. `docker compose down -v` deletes that volume. Compose binds to loopback. For remote access, put the service behind an HTTPS reverse proxy that forwards the original hostname and set `FOLIO_ORIGIN` to the public HTTPS URL.

## Render

1. Give Render access to a Git repository containing these files.
2. In Render, create a Blueprint from that repository. Render reads `render.yaml` and previews the Docker service and managed PostgreSQL resources before it provisions them.
3. Review the prices in the preview. After the deployment succeeds, open the service’s **Environment** page to retrieve the generated `FOLIO_PASSWORD`. Open the deployed `onrender.com` URL and sign in as `folio` with that password.

The Blueprint selects paid plans to keep the ledger persistent and the web service available. The app uses Render’s `PORT`, `RENDER_EXTERNAL_URL`, and linked `DATABASE_URL`. If you already have PostgreSQL, you can create a Docker web service from the repository and set `DATABASE_URL` and `FOLIO_PASSWORD` in its environment.

## Move an existing ledger

In your current Folio, choose **Settings → Download full backup**. Sign in to your new Folio deployment and choose **Settings → Restore a backup**. The file contains your financial records and preferences, so keep it private.
