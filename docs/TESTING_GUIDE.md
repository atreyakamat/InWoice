# Testing Guide

There are four layers. Run the automated ones before every release, and the manual checklist
before a major release or a customer go-live.

| Layer | Command | Covers | Time |
|---|---|---|---|
| Unit tests | `npm run test:unit` | 72 tests of pure rules, no database: GST split, document totals, ageing, GSTR-3B set-off, statuses, periods, GSTIN, CSV, recurring schedules, TOTP and S3 signing (official test vectors), role permissions, tenant host resolution, bank CSV parsing, GSTR-2B matching, alert throttling, and form previews matching the server | ~2 s |
| API integration tests | `npm --prefix backend test` | 276 tests (includes the unit tests): auth, settings, quotes, recurring invoices, portal, statements, password reset, roles, 2FA, audit log, period lock, off-site backup, multi-business isolation and plans, TDS, debit notes, bank import and matching, GSTR-1 JSON, GSTR-2B, stock valuation, bill reading, actions and owner summary, invoices and GST, payments, credit notes, GSTR-1, bills, supplier payments, expenses, P&L, GSTR-3B, ageing, cash, reminders (through a fake mail server), backups and restore, stock, BOM/production, purchase orders, events, fulfillment, dashboard, analytics, local-AI protocol | ~10–25 s |
| Type checks | `npm --prefix backend run typecheck` and `npm --prefix frontend run typecheck` | Contract drift between code and types | ~20 s |
| Browser smoke test | `npm --prefix frontend run e2e` | Real Chrome, 41 checks: login, 22 pages, quote → invoice, recurring invoice, customer portal signed out, forgot password, debit note, bank statement import, a Sales user's restricted menu, create→issue→pay an invoice, return credit note, GST report, record and pay a supplier bill, add an expense, P&L / GSTR-3B / cash screens, reminder and backup settings, PDF, phone layout on 13 screens | ~50 s |

`npm test` at the repo root runs the unit and API tests and the frontend type-check.

## 1. Unit tests

`backend/tests/unit/` holds tests that need no database or server, so they run in well under
a second (`npm run test:unit`). They cover the rules everything else is built on:

- `accounting.test.ts`: CGST/SGST split without losing a paisa, GST-inclusive amounts,
  document totals (discount before tax, untaxed shipping, fractional quantities), payment
  status, ageing buckets at every boundary, and the GSTR-3B set-off order (IGST credit
  first; CGST never against SGST; leftover credit carried forward).
- `rules.test.ts`: rounding, CSV quoting, partial-update safety, GSTIN validation, place of
  supply, invoice and bill statuses, supplier payment terms, report periods, reminder
  schedules.
- `frontend-parity.test.ts`: the live totals on the bill and expense forms
  (`frontend/src/lib/docmath.ts`) give exactly the server's figures, so what you see before
  saving is what gets saved.
- `recurring.test.ts`: schedule dates (month ends, leap years), catch-up limits.
- `security.test.ts`: TOTP against the RFC 6238/4226 vectors, recovery codes, S3 SigV4
  against AWS's published example, role permissions, activity-log descriptions.
- `tenancy.test.ts`: business slugs, host and custom-domain resolution, plan limits.
- `accounting-depth.test.ts`: bank CSV parsing (dates, amounts, column guessing), GSTR-1
  JSON shape, GSTR-2B matching rules, TDS rounding.
- `alerts.test.ts`: operator alert throttling.

## 2. API integration tests

- They run against **`TEST_DATABASE_URL`**, a separate database that is reset from the
  migrations at the start of every run. They refuse to run if it is unset or equals
  `DATABASE_URL`.
- They use Supertest against the real Express app and a real PostgreSQL. Nothing is mocked
  except the AI model: a tiny fake Ollama server stands in for it, so the full local-AI code
  path is tested without a model.
- Files are in `backend/tests/`:
  - `auth-settings.test.ts`: first-run setup, login, roles, password change, secrets never
    returned, saving one settings tab never wipes another.
  - `invoices.test.ts`: numbering, intra-/inter-state GST, discount before tax, draft
    editing, issue (stock and fulfillment), partial and full payments, overpayment rejection,
    cancel and restore stock, pack expansion, overdue, duplicate, PDF, WhatsApp link, CSV.
  - `operations.test.ts`: inventory movements, BOM, production (including shortages),
    made-to-order consumption and its exact reversal, purchase-order receiving, events,
    fulfillment updates.
  - `insights-ai.test.ts`: dashboard, rule-based analysis with AI off, local-AI briefing and
    Q&A, error messages, fallback to rules when AI fails.
  - `creditnotes-gst.test.ts`: GSTIN checksum and state codes, IGST detected from a GSTIN,
    returns with restock and refund due, value-only credits, over-credit refusal, cancelling a
    credit note, balances net of credits everywhere, and every GSTR-1 section (B2B, B2CL,
    B2CS, CDNR, CDNUR, HSN, documents) with exact figures, CSV exports and the sales register.
  - `money-out.test.ts`: one business scenario with hand-checked numbers. Supplier GSTIN
    checks; bills with CGST+SGST and IGST (state from the GSTIN), discount before tax,
    blocked input credit, unregistered suppliers, duplicate numbers; stock added by a bill,
    re-applied exactly on edit and reversed on cancel; purchase-order bills never adding
    stock twice; part and full payments, overpayment refusal, edit/cancel locks; expenses
    with and without GST; then the P&L, GSTR-3B (output, ITC, ineligible ITC, cash payable),
    ageing, cash summary, purchase register, dashboard, insights and backups, all to the paisa.
  - `reminders-backups.test.ts`: reminder schedule (before/after due, catch-up without
    spamming, once per day, later steps), real emails through a fake SMTP server
    (`fake-smtp.ts`), manual reminders, WhatsApp wording; backup files, pruning, path
    safety, and an export → change → restore round trip.

No real email is sent: the tests start a tiny SMTP server that accepts and records messages.

**Claude itself is not called in automated tests** (that would cost money and need a key).
Test it manually with Settings › AI › *Test connection*.

## 3. Browser smoke test

Start an instance, then run the test:

```bash
npm run build && npm start              # or: npm run dev and BASE_URL=http://localhost:5173
npm --prefix frontend run e2e
```

It uses your installed Chrome or Edge through `playwright-core`, so no browser download is
needed. Environment variables: `BASE_URL` (default `http://localhost:5000`), `E2E_EMAIL`,
`E2E_PASSWORD` (default: the demo account). It **creates an invoice, a supplier bill and an
expense**, so run it against
demo data (`npm run seed`) or staging, never production. Screenshots are saved to
`frontend/e2e/screenshots/`.

It fails on any JavaScript error, any HTTP 5xx, any page showing an error box, or
horizontal overflow on a phone-sized screen (it checks the scrolling content area as well
as the page, so a table pushing a card off-screen is caught).

## 4. Manual QA checklist

Use a fresh database (run `npm run seed` for demo data, or start empty to test first-run setup).

### Setup & access

- [ ] With an empty database, `/login` shows **Set up InWoice**. Creating the owner logs you in.
- [ ] Sign out, then sign in again. A wrong password shows a clear error.
- [ ] Settings › Team: add a STAFF user. They can use the app but Settings fields are read-only.
- [ ] Disable that user. They can no longer sign in.

### Settings

- [ ] Business tab: set name, state, GSTIN and a logo, then Save. Invoicing tab: change the
      prefix, then Save. The **Business values are still there**.
- [ ] Email: enter SMTP details. *Send test email* arrives. (Gmail: use an App Password,
      `smtp.gmail.com`, port 587.)
- [ ] AI: *Test connection* with Claude (needs a key) and/or Ollama. Bad key or URL → clear error.

### Sales flow (core)

- [ ] Create a customer in the same state as the business. New invoice → add a product line;
      the live totals show CGST+SGST. Save draft.
- [ ] Edit the draft and change the quantity. Totals update.
- [ ] Issue it. Product stock drops by that quantity, and the order appears in Fulfillment
      as Pending.
- [ ] View PDF: logo, GSTIN, HSN, tax split and UPI QR. Scanning the QR with a UPI app
      pre-fills the balance.
- [ ] Record a partial payment → **Partial**. Pay the rest → **Paid**. Overpaying is refused.
- [ ] Create an invoice for an out-of-state customer → **IGST** only.
- [ ] Cancel an unpaid issued invoice. Stock returns, and fulfillment shows Cancelled.
- [ ] Email the invoice (SMTP set). The PDF is attached. The WhatsApp button opens a prefilled message.
- [ ] An invoice with a past due date shows **Overdue**, and the dashboard counts it.
- [ ] Export CSV from Invoices. It opens in Excel with correct columns and ₹ amounts.

### Credit notes & GST reports

- [ ] On a paid invoice: *Credit note* → Goods returned, quantity 1, keep *Put back into stock*.
      The preview says a refund is due. After issuing, stock goes up by 1 and the invoice
      shows the credit note; its PDF opens.
- [ ] On an unpaid invoice: *Credit note* → Reduce the price by an amount. Balance due drops
      by that amount plus its tax. Crediting the rest marks the invoice **Credited**.
- [ ] Cancel a credit note: the balance and stock come back.
- [ ] Customers: entering a mistyped GSTIN shows "check digit does not match".
- [ ] GST Reports for this month: a registered customer's invoice is under B2B, small B2C
      sales are grouped by state and rate, and the HSN summary is net of credit notes.
      Download each CSV and open it in Excel; have your accountant check one month against
      their own figures before relying on it.

### Bills, expenses & accounts

- [ ] Suppliers: add one with a GSTIN from another state and *Net 15* terms. A mistyped GSTIN
      is refused.
- [ ] Bills › New bill for that supplier: the GST type shows IGST and the due date defaults to
      15 days. Save. The bill shows **Pending** and appears under *You owe* on Suppliers.
- [ ] New bill with a material line and *Add the material lines to stock*: the material's stock
      goes up. Edit the quantity: stock follows. Cancel the bill: stock goes back.
- [ ] Purchase orders: receive an order, then *Add bill*. The lines are pre-filled and stock
      does not go up a second time.
- [ ] Record a part payment, then the rest: **Partial** then **Paid**. A payment larger than
      the balance is refused. A part-paid bill can't be edited or cancelled.
- [ ] Expenses: add rent (no GST) and an electricity bill of ₹1,180 incl. 18% GST with the
      vendor's GSTIN. The preview shows ₹1,000 + ₹180 and it is marked claimable.
- [ ] Accounts › Profit & loss for this month: sales, purchases by category and expenses match
      what you entered, and claimable GST is not counted as cost.
- [ ] Accounts › GSTR-3B: output tax matches the GST report; input credit lists bills and
      expenses; tax payable in cash = output − credit (in the legal order). Check one month
      against your accountant's figures and your GSTR-2B before relying on it.
- [ ] Accounts › Cash & dues: money in/out for the month, ageing for customers and suppliers,
      and what falls due in the next 30 days.
- [ ] Dashboard: *Profit this month*, *You owe suppliers* and *Bills overdue* appear once
      bills or expenses exist.

### Reminders & backups

- [ ] Settings › Email › Automatic payment reminders: switch on with `-1,3,7,15`. The preview
      lists overdue invoices. *Send due reminders now* emails them (check the inbox); running
      it again the same day sends nothing.
- [ ] Invoice detail: *Send reminder* emails the customer and shows "Last reminder emailed".
- [ ] Settings › Backups: *Back up now* adds a file; *Download a copy* downloads a `.json.gz`.
- [ ] Restore that file into a fresh test install (Settings › Backups › Restore, or
      `npm run restore -- file.json.gz` into an empty migrated database). All data is present.

### Operations

- [ ] Inventory: add a material with opening stock. *Adjust* −2 (Damage). History shows both movements.
- [ ] Products › Materials (BOM): add materials. "Can produce N" is correct.
- [ ] Production: plan a batch bigger than materials allow → *Complete* shows "Not enough
      materials". A smaller batch completes; materials go down and product stock goes up.
- [ ] Sell more of a BOM product than is in stock. The shortfall consumes raw materials.
- [ ] Purchase order: place an order, receive part → **Partial**, receive the rest → **Received**; stock rises.
- [ ] Packs: create a pack and invoice it. Component product stock goes down.
- [ ] Events: allocate stock, then record sales and returns. Returns go back to inventory.
- [ ] Fulfillment: advance an order to Shipped with a courier and tracking number, then to Delivered.

### Insights

- [ ] With AI off: *Run analysis* gives a health score, risks, opportunities, forecast and a briefing labelled "Built-in".
- [ ] With AI on: the briefing is labelled Claude/Local AI, and Q&A answers questions about real numbers.
- [ ] Mark an opportunity "Do it", then re-run the analysis. It does not come back as pending.

### Quotes, recurring, portal

- [ ] Create a quote, send it, convert it. The invoice has the same lines and the quote shows "Converted".
- [ ] Set up a monthly recurring invoice starting today. The next scheduler run creates it once (not twice).
- [ ] Create a portal link on a customer, open it in a private window, download a PDF, then revoke the link.
- [ ] *Forgot password* sends a reset email. The link works once.

### Staff and safety

- [ ] Sign in as a Sales user: no bills, expenses, accounts or settings in the menu, and the API refuses them.
- [ ] Turn on two-factor sign-in, sign out, and sign in with the app's code. A recovery code works once.
- [ ] Lock the period to last month's end. Editing an invoice dated before then is refused.
- [ ] The activity log shows those actions with the right user.
- [ ] Off-site backup: fill in the S3 details and press *Test*. *Back up now* uploads a file to the bucket.

### Accounts depth

- [ ] Record a customer payment with TDS. The invoice is paid in full and TDS appears on the TDS tab.
- [ ] Issue a debit note against a bill. The bill balance and GSTR-3B input credit drop.
- [ ] Import a bank CSV. Known payments match automatically; turn an unmatched debit into an expense.
- [ ] Download GSTR-1 JSON and open it in the GST offline tool. Upload the portal's 2B JSON and review the matches.

### AI actions (with AI on)

- [ ] New bill › *Read from photo or PDF* with a real supplier bill. The fields are filled and any total mismatch is flagged.
- [ ] Actions: draft reminders, edit one, send. The customer gets your edited text with the PDF.
- [ ] Actions: create draft purchase orders for low materials. They appear as drafts.
- [ ] Settings › Email › Monthly summary: *Preview* shows last month's numbers. *Send now* emails the admins.

### Hosting many businesses (if used)

- [ ] `npm run platform -- create ...` makes a business reachable at its subdomain, with its own data.
- [ ] Sign-up (if enabled) creates a business on trial. After the trial it becomes read-only.
- [ ] Data from one business never appears in another (search, reports, exports).

### Non-functional

- [ ] Phone-width browser: navigation menu works, tables scroll, forms usable.
- [ ] With `ALERT_WEBHOOK_URL` set, a server error posts one message to the channel (repeats are held back for 15 minutes).
- [ ] Stop PostgreSQL. `/health` reports degraded and the app shows errors, not a blank screen. Restart and it recovers.
- [ ] Restore a backup into a new database and point a test instance at it. All data is present.

## Release gate

Do not deploy unless:

1. `npm test` passes.
2. `npm --prefix frontend run e2e` passes against a seeded build.
3. `npm audit --omit=dev` in `backend/` and `frontend/` shows no high/critical issues, or each one has been reviewed.
4. New schema changes come with a migration (`prisma migrate dev`), and `db:deploy` works on a copy of production data.
5. A backup has been taken right before deployment.
