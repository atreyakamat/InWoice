# Architecture

## Runtime

```
Browser ── HTTPS ──> (Caddy/nginx, optional) ──> Node process :5000
                                                  ├─ /api/*   Express 5 JSON API
                                                  ├─ /health  liveness, DB, version, uptime, last error
                                                  ├─ /*       built React app (frontend/dist)
                                                  └─ scheduler (every 30 min, per business): backup (+ off-site),
                                                     stock snapshot, recurring invoices, reminders,
                                                     monthly statements, owner summary, audit pruning
                                                        │
                                                        └─ Prisma ──> PostgreSQL
Optional: Claude API (HTTPS)  or  Ollama (http://host:11434)
Optional: S3-compatible storage (off-site backups), alert webhook (Slack/Discord)
```

### Single business vs many businesses

With `MULTI_TENANT` off (the default) there is one business in the `public` schema, as before.
With it on, each business has its own PostgreSQL schema (`t_<slug>`) and a `control` schema
holds the list of businesses and platform admins:

1. `middlewares/tenant.ts` resolves the business from the host (`<slug>.BASE_DOMAIN` or a
   custom domain; `X-Tenant` in development), checks it is active, and blocks writes (402)
   when the trial has ended or the account is suspended.
2. `lib/tenancy.ts` runs the rest of the request inside an `AsyncLocalStorage` context with
   a Prisma client bound to that schema (an LRU of `TENANT_CLIENTS` clients).
3. `lib/prisma.ts` exports a proxy that forwards to the current business's client, so
   services use `prisma` exactly as in single-business mode. Isolation does not depend on
   remembering a `where tenantId` filter.
4. Sign-in tokens carry the business slug (`tn`) and are refused on any other business.
5. `lib/migrator.ts` applies the Prisma migration SQL to every business schema at startup,
   tracked in each schema's `_inwoice_migrations` table.

In development, Vite serves the app on :5173 and proxies `/api` to :5000, so the frontend
always calls same-origin `/api`. No URLs are hard-coded.

## Backend (`backend/src`)

| Path | Purpose |
|---|---|
| `index.ts` | Starts the server and the scheduler, and handles graceful shutdown |
| `app.ts` | Middleware (helmet CSP, CORS, JSON), route mounting, SPA hosting |
| `lib/` | `config` (env), `prisma` client, `errors` (HttpError + central handler), `util` (zod helpers, CSV, money rounding), `gst` (state codes, GSTIN checksum, place of supply), `accounting` (pure maths: GST split, document totals, ageing, GSTR-3B set-off) |
| `middlewares/auth.ts` | JWT verification (with a 5 s user cache and token versions, so role/password changes sign users out), `authorize(area)` by role, two-factor tickets |
| `middlewares/tenant.ts` | Business resolution and plan/read-only checks (multi-business mode) |
| `lib/permissions.ts` | What each role (Admin, Staff, Sales, Stores, Accountant) can read and write |
| `lib/tenancy.ts`, `lib/migrator.ts` | Per-business Prisma clients and schema migrations |
| `lib/totp.ts`, `lib/s3.ts` | Two-factor codes (RFC 6238) and dependency-free S3 SigV4 uploads |
| `lib/alerts.ts` | Operator alerts to `ALERT_WEBHOOK_URL`, throttled |
| `routes/*.routes.ts` | HTTP layer: zod validation, then a service or Prisma call |
| `services/invoice.service.ts` | Invoice maths (GST, discount), numbering, issue/cancel, payments |
| `services/stock.service.ts` | Stock movements, commit/release stock for invoices |
| `services/analytics.service.ts` | Dashboard SQL, snapshot, health score, insights, forecast, briefing |
| `services/ai.service.ts` | Provider abstraction: Claude (Anthropic SDK) / Ollama / none |
| `services/pdf.service.ts` | PDFKit invoice + UPI QR |
| `services/email.service.ts` | Nodemailer with an email log |
| `services/creditnote.service.ts` | Credit notes: GST reversal, restock, refund due, cancel |
| `services/gst.service.ts` | GSTR-1 sections, offline-tool CSV layouts, sales register |
| `services/reminder.service.ts` | Reminder schedule, reminder emails |
| `services/bill.service.ts` | Supplier bills: totals, GST/ITC, stock-in and its exact reversal, supplier payments |
| `services/expense.service.ts` | Expenses: GST-inclusive or exclusive amounts, ITC eligibility, categories |
| `services/accounts.service.ts` | Profit & loss, GSTR-3B, ageing, cash summary, purchase register |
| `services/backup.service.ts` | JSON export/restore of every table, backup files and pruning |
| `services/quote.service.ts`, `recurring.service.ts` | Quotes and conversion; recurring schedules with safe catch-up |
| `services/statement.service.ts`, `documents.service.ts`, `portal.service.ts` | Statements of account, emailing documents, customer portal links |
| `services/audit.service.ts` | Activity log middleware, period lock (`assertOpenPeriod`), pruning |
| `services/platform.service.ts` | Businesses, plans, trials, sign-up, adopting a single-business database |
| `services/debitnote.service.ts` | Supplier debit notes: GST reversal, stock out, refunds due |
| `services/bank.service.ts` | Bank CSV parsing, auto-matching and manual matching |
| `services/gstn.service.ts` | GSTR-1 JSON and GSTR-2B matching |
| `services/bill-reader.service.ts` | Reads a bill photo/PDF with AI into a draft bill, with total cross-checks |
| `services/actions.service.ts` | Suggested actions (reminders, reorders, quote follow-ups) and running approved ones |
| `services/digest.service.ts` | Monthly owner summary |
| `services/scheduler.ts` | 30-minute in-process timer that runs every job for each business |
| `cli/platform.ts`, `cli/reset-password.ts` | `npm run platform`, `npm run reset-password` |
| `cli/backup.ts` | `npm run backup` / `npm run restore` |

Conventions:

- Handlers just `throw`. Express 5 forwards async errors to `errorHandler`, which maps
  zod errors to 400, Prisma not-found to 404, unique/foreign-key violations to 409, and
  everything else to 500 without leaking internals.
- Responses are always `{ success, data }` or `{ success: false, error }`.
- Optional form fields: an **absent** field is left unchanged and `""` clears it (null).
  This makes partial saves safe.
- Every multi-step write runs inside `prisma.$transaction`.

## Data model (key entities)

`schema.prisma` is the source of truth. Highlights:

- **BusinessSettings**: a single row with business identity, GST state, invoice numbering,
  SMTP and AI config. Secrets (`smtpPassword`, `aiApiKey`) are never returned to the browser.
- **Customer → Invoice → InvoiceItem / Payment / Fulfillment / CreditNote → CreditNoteItem**.
  `Invoice.amountCredited` caches the total of active credit notes.
- **Product** (finished goods, `stock`), **Pack → PackItem → Product**
- **InventoryItem** (raw materials) with **StockMovement** as the audit trail.
  `currentStock` changes only through movements.
- **ProductBOM → BOMItem → InventoryItem**, **ProductionBatch → ProductionOutput / ProductionUsage**
- **Supplier → PurchaseOrder → PurchaseOrderItem**
- **Supplier → Bill → BillItem / BillPayment** (a bill may link to a purchase order).
  `Bill.amountPaid` caches the payments; `itcEligible` says whether its GST is claimable.
- **Expense**: paid on the spot, with its GST split and ITC flag.
- **Event → EventInventory**
- Insights: **BusinessHealthScore, BusinessRisk, BusinessOpportunity, Forecast, ExecutiveBriefing**

Money is stored as `Float` and rounded to 2 decimals at every calculation step
(`round2`). Moving to `Decimal` is on the roadmap.

## Business rules

**Invoice lifecycle:** `DRAFT → PENDING → PARTIAL → PAID`, or `CANCELLED`. `OVERDUE` is
derived when an unpaid invoice is past its due date, so it is never stale.

- Only drafts are editable or deletable. To change an issued invoice, cancel it and
  duplicate it, which preserves the audit trail.
- Recording a payment on a draft issues it first.
- Cancelling requires removing payments first.

**GST:** tax is charged on the post-discount value, apportioned per line. If the business
state equals the place of supply (or either is unknown), tax splits into CGST and SGST.
Otherwise it is IGST. The place of supply defaults to the customer's state.

States are compared by GST state code (`lib/gst.ts`), so "Tamil Nadu", "TN", "33-Tamil Nadu"
and a GSTIN starting `33` all match. When a customer has no state, the GSTIN's state is used.

**Numbering:** `invoicePrefix` + a zero-padded counter, incremented atomically in the
same transaction, so there are no duplicates under concurrency. Numbers already used (e.g.
after the counter was set back) are skipped. Credit notes have their own prefix and counter.

**Credit notes:**

- Only for issued, non-cancelled invoices. Each line can be credited by quantity (a return)
  or by an amount (a price reduction), never beyond what is left on that line. Shipping can
  be refunded up to what was charged.
- Tax is reversed at each line's original rate, with the invoice discount applied and the
  invoice's CGST/SGST vs IGST split. Crediting the rest of a line reverses exactly its
  remaining tax, so there is no paisa drift.
- Balance due = total − paid − credited (never below zero). If the customer had already
  paid, the excess is recorded as `refundAmount`. An invoice settled only by credits shows
  as **Credited**.
- Returns can restock finished goods (packs expand into components). Cancelling a credit
  note reverses its restock and restores the balance.
- An invoice with active credit notes can't be cancelled, and payments that a credit note
  partly refunded can't be deleted.
- Revenue, outstanding, customer lifetime value and the dashboard are all net of credit notes.

**GST reports (GSTR-1):** built from issued invoices and credit notes dated in the period
(server time zone, `TZ`). Registered buyers (with a GSTIN) → B2B and CDNR. Unregistered
inter-state invoices over ₹1,00,000 → B2CL (and their credit notes → CDNUR). Everything else
→ B2CS, grouped by place of supply and rate, with its credit notes netted in. The HSN
summary is split B2B/B2C and net of credit notes. Shipping is part of the invoice value but
is not taxed.

**Reminders:** `reminderDays` (e.g. `-1,3,7,15`) are offsets from the due date. Each open
invoice with a customer email walks through the steps once (`remindersSent`). If several
steps have passed it gets one email and skips ahead. At most one email per invoice per day
(`lastReminderAt`); a failed send is retried the next day and shows in the email log.

**Backups:** every table is exported in one repeatable-read snapshot to gzipped JSON, with
the latest migration name. Restore runs in one transaction: truncate, then insert in
foreign-key order via `jsonb_populate_recordset`, so types round-trip exactly and columns
added later get their defaults. Backups from a newer schema are refused. The scheduler
writes one automatic backup per day and keeps the newest `BACKUP_KEEP`; manual backups are
never pruned.

**Bills (money out):**

- A bill is the supplier's invoice. Totals use the same rule as invoices: discount before
  tax, apportioned per line; freight is not taxed. IGST vs CGST+SGST comes from the
  supplier's GSTIN/state against your business state, and can be overridden.
- GST is claimable (input tax credit) only if the supplier has a GSTIN and the bill isn't
  marked otherwise. Unclaimable GST becomes part of the cost in the P&L.
- Due date defaults to the bill date plus the number in the supplier's payment terms.
- Bill numbers are unique per supplier. Status: `PENDING → PARTIAL → PAID`, or
  `CANCELLED`; `OVERDUE` is derived.
- A standalone bill can add its material lines to stock (PURCHASE movements referencing
  the bill). Editing re-applies stock from the net of those movements, and cancelling
  reverses it, so stock is exact. A bill linked to a purchase order never adds stock,
  because receiving the order already did.
- Bills with payments can't be edited or cancelled until the payments are deleted.

**Expenses:** entered as the amount paid (GST included) or before GST. The GST split
follows the vendor GSTIN's state. Input credit needs the vendor's GSTIN.

**Profit & loss** (management view, purchases basis): net sales = invoice taxable value
+ shipping charged − credit notes (taxable + shipping). Purchases = bill lines after the
bill discount, plus unclaimable GST, plus freight, grouped by line category. Expenses =
amount plus unclaimable GST, by category. Purchases count in the bill's month; the
accountant adjusts for opening/closing stock in the final books.

**GSTR-3B:** output tax is built from the GSTR-1 data (HSN rows, net of credit notes);
rate 0 lines go to nil-rated. ITC = eligible bills + expenses in the period; ineligible GST
is listed separately. Cash payable follows the set-off order in `lib/accounting.ts`
(Rule 88A): IGST credit against IGST, then CGST, then SGST; CGST credit against CGST, then
IGST; SGST credit against SGST, then IGST. Leftover credit is carried forward.

**Ageing and cash:** open invoices and bills are bucketed by days past due (not due,
1–30, 31–60, 61–90, 90+). The cash summary covers customer payments in, supplier payments
and expenses out, and balances falling due in the next 7 and 30 days.

All money reports bucket by month in the server's time zone. They read narrow columns and
sum in JS, which keeps month boundaries consistent with the GST reports.

**Stock on issue:**

- Packs expand into their component products.
- For each product, finished stock is used first. For a product with a BOM, any shortfall is
  made to order: its raw materials are consumed.
- A product without a BOM can go negative, which shows up as an "out of stock" alert.
- What was taken is recorded in `Invoice.stockLog`, so cancellation reverses it exactly.

**Production:** completing a batch checks that all materials are available first, then
consumes them through PRODUCTION movements and adds finished stock.

**Analytics:**

- All aggregation runs in PostgreSQL (`groupBy` and SQL with `date_trunc`), never by loading
  whole tables into memory.
- The forecast is a least-squares trend over 6 months of collections, with a confidence
  based on data coverage and fit.

## Frontend (`frontend/src`)

| Path | Purpose |
|---|---|
| `App.tsx` | Routes. Pages are lazy-loaded |
| `context/AuthContext.tsx` | Session, first-run setup, cached settings |
| `lib/api.ts` | Axios client (token header, 401 → login), typed helpers, blob downloads |
| `lib/useLoad.ts` | Loading/error/reload hook, debounce |
| `lib/format.ts` | Currency, number and date formatting (uses the business currency) |
| `components/ui.tsx` | Design system: Button, Field, Modal, Table, Badge, useConfirm, … |
| `components/BarChart.tsx` | Dependency-free SVG chart (replaces a 400 KB chart library) |
| `components/CreditNotes.tsx` | Credit note dialog (live GST preview) and list |
| `components/PeriodPicker.tsx` | Month / date-range picker shared by the report pages |
| `lib/docmath.ts` | Live totals for the bill and expense forms (unit-tested against the server's maths) |
| `pages/*` | One file per screen |

## Security

- Passwords use bcrypt (bcryptjs, pure JS). JWTs last 7 days by default
  (`JWT_EXPIRES_IN`). The secret is required in production.
- Five roles with per-area read/write permissions, enforced on the API (the menu only
  mirrors them). Changing a user's role or password, or disabling them, invalidates their
  existing sessions within 5 seconds.
- Optional two-factor sign-in (TOTP) with hashed one-time recovery codes.
- Every change through the API is written to the activity log (who, what, when, from where).
- A period lock refuses changes to documents dated on or before the lock date.
- In multi-business mode each business is a separate schema, and tokens are bound to their
  business.
- Login and setup are rate-limited (20 per 15 min per IP), and so are AI endpoints (10 per min).
- First-run setup only works while there are zero users. After that, only admins can add users.
- Helmet sets security headers and a strict CSP (`script-src 'self'`).
- All input is validated with zod. Prisma parameterises every query, including the raw SQL
  tagged templates.
- The logo is limited to a PNG/JPEG data URL of 500 KB or less. The only other upload is a
  backup restore: admin-only, needs `?confirm=REPLACE`, is parsed as JSON and never stored,
  and a safety backup is written first. Backup downloads only accept generated file names,
  so paths outside the backup folder can't be requested.
