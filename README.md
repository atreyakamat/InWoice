# InWoice

Invoicing, CRM and operations for small product businesses. Built for Indian GST,
self-hosting, and modest hardware.

**Stack:** PostgreSQL · Node.js 20+ (Express 5, Prisma) · React 19 (Vite, Tailwind 4) · optional AI (Claude API or local Ollama)

## What it does

| Area | Features |
|---|---|
| **Invoicing** | Drafts → issue → partial/full payments → paid. Automatic numbering, GST split (CGST+SGST within your state, IGST across states, detected from state names or GSTINs), discounts, shipping, HSN codes. PDF with a UPI QR code that pre-fills the balance. Email with the PDF attached, WhatsApp share link, duplicate, cancel (stock restored). Overdue is computed live. |
| **Credit notes** | Returns, post-sale discounts and corrections against issued invoices. GST is reversed at the original rates, returned goods can go back into stock, and refunds due are worked out automatically. Credit note PDFs. |
| **GST reports** | GSTR-1 data for any month or quarter: B2B, B2C large/small, credit notes (CDNR/CDNUR), HSN summary (B2B/B2C), documents issued. CSV in the GST offline tool layout, plus a line-level sales register. GSTINs are checksum-validated. |
| **Bills & expenses** | Supplier bills (from a purchase order or standalone) with GST split, claimable vs blocked input credit, optional stock-in, due dates from supplier terms, part payments and what you owe each supplier. Expenses (rent, salaries, utilities…) entered with or without GST. |
| **Accounts** | Profit & loss by category and month, GSTR-3B summary (output tax, input tax credit, legal set-off order, cash payable), receivables and payables ageing, cash in/out with what falls due in the next 7/30 days, purchase register CSV. Dashboard shows profit this month and bills overdue. |
| **Payment reminders** | Automatic emails before and after the due date on a schedule you choose (e.g. -1, 3, 7, 15 days), with the PDF and UPI QR attached. One-click manual reminders; WhatsApp messages switch to reminder wording when an invoice is overdue. |
| **Quotes & recurring** | Quotations with PDF and email, converted to invoices in one click. Recurring invoices (weekly to yearly) created, issued and emailed by the scheduler. |
| **Customer portal** | A private link per customer to see invoices, balance and statement and download PDFs. Statements of account by PDF/email, optionally every month. |
| **Bank & tax depth** | Bank statement CSV import with automatic matching. TDS on receipts and supplier payments. Supplier debit notes. GSTR-1 JSON for the offline tool, a GSTR-2B check against your bills, stock valuation in the P&L. |
| **Actions (approve, then run)** | Chase overdue invoices with editable (AI-written or template) emails, create draft purchase orders for low materials, re-send expiring quotes. A monthly summary email for owners. With AI on, a bill photo or PDF fills in the bill form. |
| **Online shop sync** | Pulls orders from your shop (e.g. the Stix N Vibes shop) every 30 minutes: once you confirm an order there, the customer is matched or added by mobile number and an invoice is issued; paid/cancelled in the shop settle or cancel it. Unconfirmed (possibly spam) orders are ignored. Catches up after the server has been off. Settings › Shop. |
| **Customers** | Contact details, GSTIN, lifetime value, outstanding balance, invoice history, activity timeline, notes. |
| **Catalog** | Products (price, cost, margin, tax, stock, low-stock alerts) and packs (bundles that draw down component stock). |
| **Operations** | Raw-material inventory with a full movement audit trail, suppliers, purchase orders with partial receiving, bills of materials, production batches, made-to-order consumption, fulfillment/shipping tracking, pop-up event stock. |
| **Insights** | Dashboard (12-month chart, KPIs, alerts), business health score, risks and opportunities, 30-day forecast. These are rule-based and work **without any AI**. |
| **AI (optional)** | Written daily briefing and "Ask about your business" Q&A, using **Claude** (API key) or a **local model via Ollama**. |
| **Admin & security** | Owner setup on first run. Roles: Admin, Staff, Sales, Stores, Accountant. Two-factor sign-in, activity log, period lock after GST filing, password reset by email. CSV exports for your accountant. Automatic daily backups (kept 14 days) with optional off-site copies to S3-compatible storage; download or restore any time. |
| **Hosting** | One business per install, or **many businesses on one server** (SaaS mode): a separate schema per business, subdomains or custom domains, sign-up with a free trial, plans and a platform admin page. Error alerts to Slack/Discord. |

## Quick start (development)

Needs Node.js 20+ and PostgreSQL 14+.

```bash
# 1. Create a database and user (adjust the password)
psql -U postgres -c "CREATE ROLE inwoice LOGIN PASSWORD 'change-me' CREATEDB;"
psql -U postgres -c "CREATE DATABASE inwoice OWNER inwoice;"
psql -U postgres -c "CREATE DATABASE inwoice_test OWNER inwoice;"

# 2. Configure the backend
cp backend/.env.example backend/.env    # then edit DATABASE_URL, TEST_DATABASE_URL, JWT_SECRET

# 3. Install, migrate, and (optionally) load demo data
npm run setup
npm run seed        # demo login: demo@inwoice.local / demo12345

# 4. Run API + web app with hot reload
npm run dev         # open http://localhost:5173
```

Skip `npm run seed` for a real install. On first visit you create the owner account.
Locked out? `npm --prefix backend run reset-password -- <email> <new password>`.

Backups from the command line (after `npm run build`): `npm run backup` writes one to
`backend/backups/`; `npm run restore -- <file> [--replace]` loads one into a migrated database.

## Production (one process, one port)

```bash
npm run build       # builds the React app and compiles the API
npm start           # serves API + app on http://localhost:5000
```

Docker alternative: `cp .env.docker.example .env`, fill in the values, then run `docker compose up -d --build`.
See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for servers, HTTPS, backups, monitoring, hosting many
businesses, and low-resource tuning.

## Tests

```bash
npm test                         # 276 tests: API integration + unit (uses TEST_DATABASE_URL) + frontend type-check
npm run test:unit                # 72 unit tests only: pure rules, no database, a couple of seconds
npm --prefix frontend run e2e    # real-browser smoke test against a running instance (41 checks)
```

See [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md), including the manual QA checklist.

## Documentation

- [docs/SETUP_GUIDE.md](docs/SETUP_GUIDE.md): local setup on Windows, macOS and Linux, plus troubleshooting
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md): production deployment, HTTPS, backups, updates
- [docs/AI_GUIDE.md](docs/AI_GUIDE.md): Claude vs local AI vs off; costs, privacy, hardware
- [docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md): automated tests and the release checklist
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): code layout, data model, business rules
- [docs/ROADMAP.md](docs/ROADMAP.md): what changed in each version (v4.0 is the latest), known gaps, what to build next
- `docs/legacy/` holds documentation for earlier versions (SQLite/Firebase era), kept for reference only

## Project layout

```
backend/    Express API, Prisma schema + migrations, tests
frontend/   React app (Vite), e2e smoke test
scripts/    dev runner
docs/       guides (current) and legacy/ (old versions)
_old_v3_backup/, _old_v4_backup/   previous code, kept for reference; not used
```
