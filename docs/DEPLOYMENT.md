# Deployment Guide

InWoice runs as **one Node.js process** that serves both the API and the web app, plus a
PostgreSQL database. It was designed for old or small machines.

| Measured on the dev machine | Value |
|---|---|
| API process memory at idle | ~86 MB |
| First page load, gzipped JS | ~110 KB (other pages load on demand) |
| PDF generation | pure JavaScript, no headless browser |
| Background jobs | in-process (no cron, no queue, no Redis) |

**Minimum server:** 1 CPU core and 1 GB RAM (2 GB is comfortable), with any x86-64 or ARM64
Linux. A 10-year-old desktop is plenty. Local AI is the only heavy option (see
[AI_GUIDE.md](AI_GUIDE.md)); Claude via API key adds no load to your server.

---

## Option A: Ubuntu/Debian server (recommended)

### 1. Install Node.js and PostgreSQL

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs postgresql git
```

### 2. Create the database

```bash
sudo -u postgres psql -c "CREATE ROLE inwoice LOGIN PASSWORD 'LONG-RANDOM-PASSWORD';"
sudo -u postgres psql -c "CREATE DATABASE inwoice OWNER inwoice;"
```

**Low-RAM tuning.** For a 1–2 GB server, add this to `/etc/postgresql/*/main/postgresql.conf`,
then run `sudo systemctl restart postgresql`:

```ini
shared_buffers = 128MB
work_mem = 4MB
max_connections = 30
effective_cache_size = 512MB
```

### 3. Install the app

```bash
sudo useradd -r -m -d /opt/inwoice inwoice
sudo -u inwoice git clone <your-repo-url> /opt/inwoice/app
cd /opt/inwoice/app
sudo -u inwoice cp backend/.env.example backend/.env
sudo -u inwoice nano backend/.env
```

Set these values in `backend/.env`:

```ini
NODE_ENV=production
DATABASE_URL="postgresql://inwoice:LONG-RANDOM-PASSWORD@127.0.0.1:5432/inwoice?schema=public&connection_limit=5"
JWT_SECRET=<node -e "console.log(require('crypto').randomBytes(48).toString('hex'))">
CORS_ORIGIN=
```

Then install and build:

```bash
sudo -u inwoice npm run setup
sudo -u inwoice npm run build
```

Leave `TEST_DATABASE_URL` empty in production. Tests belong on a dev machine.

### 4. Run as a service (systemd)

Create `/etc/systemd/system/inwoice.service`:

```ini
[Unit]
Description=InWoice
After=network.target postgresql.service

[Service]
User=inwoice
WorkingDirectory=/opt/inwoice/app/backend
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
# Report months, reminder days and backup names follow this time zone
Environment=TZ=Asia/Kolkata
# Keep memory predictable on small machines
Environment=NODE_OPTIONS=--max-old-space-size=256

[Install]
WantedBy=multi-user.target
```

Enable and check it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now inwoice
curl http://localhost:5000/health    # {"status":"ok","database":"ok",...}
```

### 5. HTTPS with Caddy

Point your domain's DNS at the server, then:

```bash
sudo apt-get install -y caddy
echo 'invoice.yourbusiness.in {
  reverse_proxy 127.0.0.1:5000
}' | sudo tee /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Caddy obtains and renews certificates automatically. Close port 5000 to the outside:

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

**LAN-only use** (a shop or office network) needs no domain: open
`http://<server-ip>:5000`. The app works over plain HTTP on a LAN.

### 6. Backups

Your invoices are your business. InWoice backs itself up **automatically once a day** to
`backend/backups/` (one gzipped JSON file per day, the newest 14 kept; set `BACKUP_DIR`
and `BACKUP_KEEP` in `backend/.env` to change this). Admins can also back up now, download
a copy, or restore from Settings › Backups.

Backups on the same disk don't survive a dead disk or a lost server, so **copy them off the
server**. The simplest way is built in: Settings › Backups › **Off-site copy** uploads each
daily backup to any S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2, Wasabi,
MinIO). Use a key that can only write to that one bucket, press *Test*, and turn on the
bucket's lifecycle rule to expire old files. Alternatively, with [rclone](https://rclone.org) set up for Google Drive or S3 (`rclone config`):

```bash
sudo -u inwoice crontab -e
# add: 0 3 * * * rclone copy /opt/inwoice/app/backend/backups gdrive:inwoice-backups --max-age 48h
```

To restore on a new server: install the app (steps 1–3), then either upload the file in
Settings › Backups › Restore, or from the command line:

```bash
cd /opt/inwoice/app && npm run restore -- /path/to/inwoice-20261014-020000.json.gz
# into a database that already has data:  npm run restore -- <file> --replace
```

Restore a backup into a test database once, so you know it works before you need it.
`pg_dump` still works as an extra layer if you prefer it.

### 7. Updating

```bash
cd /opt/inwoice/app
sudo -u inwoice git pull
sudo -u inwoice npm run setup     # installs deps + applies new migrations
sudo -u inwoice npm run build
sudo systemctl restart inwoice
```

Always take a backup before updating.

---

## Online payments with YouPI-PG (optional)

[YouPI-PG](https://github.com/youpi-pg/YouPI-PG) is a self-hosted UPI gateway with no
per-transaction fee. With it, invoices get a **Pay now** link (email, WhatsApp, customer
portal, and an *Open checkout* button on the invoice for counter sales).

1. Install and run YouPI on a server you control (see its README). Note its payment API
   address (port 6100, or the public `https://pay.yourdomain.com`), your merchant ID and the
   webhook secret.
2. In InWoice, Settings › Payments › **Online payments (YouPI)**: tick *Offer online payment*,
   enter the address, merchant ID and secret, press *Test connection*, then *Save*.
3. Copy the **Webhook URL** shown there into YouPI's merchant admin. It must be reachable from
   the YouPI server, so set your public address (Settings › Business or `APP_URL`) first.
   In multi-business mode each business uses its own subdomain in this URL.

How it works: *Pay now* creates a YouPI checkout for what the invoice still owes and sends the
customer there. YouPI posts a webhook signed with HMAC-SHA256 (`X-Gateway-Signature`, or
`X-Gateway-Signature-V2` with a timestamp); InWoice checks the signature on the raw bytes and
records the payment once, with the UTR as the reference. Open checkouts are re-checked every
30 minutes in case a webhook was missed, and *Check status* on the invoice does it on demand.
A payment that arrives after the invoice was already settled, or for a different amount, is
recorded as far as is due and flagged in the customer's activity for you to refund or credit.

YouPI describes itself as experimental (it confirms payments by reading bank SMS/email
alerts), so keep reconciling online payments with Bank › import.

## Connect Gmail (send from your own Gmail, PDF attached)

Each user can connect their Gmail once (Settings › Email › Gmail › **Connect Gmail**). Then
*Email › My Gmail* sends the invoice or quote from their Gmail with the PDF attached, and it
appears in their Gmail Sent folder. No SMTP setup is needed. InWoice asks Google only for
the `gmail.send` permission: it can send as the user, never read their mail. An admin can
also choose one connected Gmail to send the automatic emails (reminders, statements, the
monthly summary) instead of SMTP.

One-time setup by an admin (free):

1. In [Google Cloud › Credentials](https://console.cloud.google.com/apis/credentials), create a
   project and enable the **Gmail API**.
2. OAuth consent screen: type *External*, add your Gmail address(es) as test users, then
   **Publish app**. (In "Testing" status Google expires the access after 7 days.)
3. Create credentials › OAuth client ID › *Web application*. Add the redirect URI shown in
   Settings › Email › Gmail (`https://<your address>/api/google/callback`; for a local install
   `http://localhost:5000/api/google/callback`).
4. Paste the client ID and secret into Settings › Email › Gmail, or set `GOOGLE_CLIENT_ID` /
   `GOOGLE_CLIENT_SECRET` in `backend/.env` for every business on the server.

Google shows "Google hasn't verified this app" the first time; it is your own app, so choose
*Advanced › Continue*. In multi-business mode each business's address must be added as a
redirect URI, or each business uses its own Google client.

## Opening Gmail in a chosen browser

When InWoice runs on the same computer you use (opened at `http://localhost:5000`),
Settings › Email › **Open Gmail in** lists the browsers installed there (Chrome, Edge, Brave,
Firefox, Safari) and their profiles with the Google account each uses. Pick one, and
*Email › Gmail/Outlook* opens the ready-written email in that browser and profile. For safety
this only works from localhost, never through a proxy or in multi-business mode, only starts
browsers found installed, and only opens Gmail/Outlook addresses. On a hosted install, Gmail
opens in the browser you are using.

## Monitoring

- `GET /health` returns `status`, the database check, `version`, `uptimeSeconds`,
  `memoryMb` and `alerts.lastError`. Point an uptime monitor (e.g. UptimeRobot) at it.
- Set `ALERT_WEBHOOK_URL` to a Slack or Discord incoming-webhook URL (or any endpoint that
  accepts a JSON POST). Server errors (HTTP 500), crashes, failed migrations and failed
  scheduled jobs (backup, reminders, recurring invoices…) are posted there with the business
  name. The same error is sent at most once every 15 minutes, and at most 30 alerts an hour.
- The activity log (menu › Activity log) shows who changed what. It is pruned after
  `AUDIT_RETENTION_DAYS` (default 1095).

## Hosting many businesses (SaaS mode)

One server can host many businesses, each with its own data (a separate PostgreSQL schema),
users, settings and backups.

1. **DNS and HTTPS.** Point `*.billing.example.com` (wildcard A record) and
   `billing.example.com` at the server. With Caddy, use a wildcard certificate (DNS challenge)
   or on-demand TLS, and proxy everything to `localhost:5000`.
2. **Configure** `backend/.env`:
   ```bash
   MULTI_TENANT=1
   BASE_DOMAIN=billing.example.com
   APP_URL=https://billing.example.com
   SIGNUP_ENABLED=1          # let visitors start a free trial at billing.example.com
   TRIAL_DAYS=14
   PLATFORM_NAME=YourBrand
   SUPPORT_EMAIL=support@example.com
   ```
3. **Create the platform admin and businesses** (after `npm run build`):
   ```bash
   npm run platform -- create-admin you@example.com 'a-long-password'
   npm run platform -- create acme "Acme Stickers" owner@acme.in 'their-password' GROWTH
   npm run platform -- adopt mybiz "My Business"   # move an existing single-business database in
   npm run platform -- list
   npm run platform -- migrate                     # also runs automatically at startup
   ```
4. Each business opens at `https://<slug>.billing.example.com`. A business can also use its
   own domain: set it on the `/platform` admin page and point that domain's DNS at the server.
5. Sign in at `https://billing.example.com/platform` as the platform admin to see every
   business, change plans, extend trials, suspend or reactivate.

**Plans** (Starter, Growth, Pro) limit users and invoices per month. When a trial ends or a
business is suspended, its users can still sign in and read or export everything, but
changes are refused until the account is active again. Collecting subscription payments is
not built in yet (Razorpay Subscriptions is on the roadmap); until then, change plans by hand
on the platform page.

**Sizing:** each active business keeps a small database pool (`TENANT_CONNECTIONS`, default
3). Up to `TENANT_CLIENTS` (default 20) stay open at once and the least recently used are
closed. Keep PostgreSQL's `max_connections` above `TENANT_CLIENTS × TENANT_CONNECTIONS + 10`.
The scheduler runs each business's jobs in turn every 30 minutes.

Backups in this mode are per business (each admin sees only their own in Settings ›
Backups). Also run a nightly `pg_dump` of the whole database for disaster recovery.

## Option B: Docker Compose

```bash
cp .env.docker.example .env        # set POSTGRES_PASSWORD and JWT_SECRET
docker compose up -d --build
docker compose logs -f app
```

The stack is PostgreSQL 16 (tuned small) plus the app at 512 MB max. Migrations run
automatically on start. Data lives in the `pgdata` volume, and the app's daily backups in
the `backups` volume. Copy them off the server regularly:

```bash
docker compose cp app:/app/backend/backups ./inwoice-backups
```

Restore with Settings › Backups, or
`docker compose exec app node dist/cli/backup.js restore /app/backend/backups/<file> --replace`.

To add local AI: `docker compose --profile ai up -d`, then
`docker compose exec ollama ollama pull qwen2.5:1.5b`, and set the Ollama URL in
Settings > AI to `http://ollama:11434`.

## Option C: Windows machine

1. Install PostgreSQL (the EDB installer) and Node.js LTS.
2. Follow the [Setup Guide](SETUP_GUIDE.md) steps 1–2 with `NODE_ENV=production`.
3. Run `npm run setup` and `npm run build`.
4. Run it as a service with [NSSM](https://nssm.cc/):
   `nssm install InWoice "C:\Program Files\nodejs\node.exe" "dist\index.js"`, with the start
   directory set to `...\InWoice\backend`.
5. Daily backups are written to `backend\backups` automatically. Put that folder inside a
   Google Drive or OneDrive synced folder (set `BACKUP_DIR` to it) so copies leave the machine.

---

## Production checklist

- [ ] `JWT_SECRET` is long and random. The API refuses to start in production without one.
- [ ] HTTPS is set up (Caddy/nginx), or access is LAN-only.
- [ ] Port 5000 is not exposed publicly when behind a proxy.
- [ ] Daily backups appear in Settings › Backups, are copied off the server, and a restore
      has been tested once.
- [ ] `TZ` is set to the business's time zone (default `Asia/Kolkata`).
- [ ] Demo data was **not** seeded, or the demo account is disabled.
- [ ] Business details, GSTIN, state, UPI and invoice prefix are filled in under Settings.
- [ ] SMTP works: use Settings > Email > Send test email. Then decide whether to switch on
      automatic payment reminders.
- [ ] `GET /health` is monitored (e.g. UptimeRobot via your domain), and
      `ALERT_WEBHOOK_URL` is set so errors reach you.
- [ ] `APP_URL` is set, so links in emails (portal, password reset) point to the right place.
- [ ] Admin accounts have two-factor sign-in turned on (Settings › Account).
- [ ] Staff have the narrowest role that fits (Sales, Stores, Accountant) rather than Admin.
- [ ] Off-site backup is configured and *Test* succeeds.
- [ ] After each GST filing, the period is locked (Settings › Invoicing › Period lock).
