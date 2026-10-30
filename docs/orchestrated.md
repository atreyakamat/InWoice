# Stix N Vibes ecosystem: orchestrated plan

Status and next work for InWoice + the Stix N Vibes shop (`atreyakamat/stixnvibes-nv`).
Written 30 Oct 2026. Each phase below is sized to be handed to one agent or one session,
with the files to touch and what "done" means.

## Where things stand

| Piece | Where | State |
| --- | --- | --- |
| Online shop | `stixnvibes-nv` (Next.js on Netlify + Supabase) | Live. Serves `GET /api/integrations/orders` when `INWOICE_SYNC_TOKEN` is set. |
| Shop → InWoice order sync | `backend/src/services/shop-sync.service.ts`, Settings › Shop | Done and merged. Confirmed orders become customers + issued invoices; paid records a UPI payment; cancelled cancels; paid-then-cancelled is flagged for refund; GST can be worked back out of shop prices (exact to the paisa). Runs every 30 min and on "Sync now". |
| Counter sales (POS) | `backend/src/services/pos.service.ts`, `/pos` | Done (InWoice side). |
| Online payments | YouPI-PG (`youpi.service.ts`) | Done. Razorpay still waiting on account details. |
| Docker | `Dockerfile`, `docker-compose.yml` | Ready, not yet built on the server (no Docker on the dev machine). Build stage and start-up were replayed by hand: migrations, `/health`, the web app and PDFs all work. |

Tests at the time of writing: backend 398/398, unit 104/104, shop 102/102, both typechecks clean.

## Open items (owner)

- [ ] Build and run on the home server: `cp .env.docker.example .env`, set `POSTGRES_PASSWORD` and `JWT_SECRET`, `docker compose up -d --build`. Send the output if the first build fails.
- [ ] Netlify: set `INWOICE_SYNC_TOKEN` on the shop (32+ random chars), then put the same value in InWoice Settings › Shop with the address `https://shop.stixnvibes.com`.
- [ ] If GST-registered: Settings › Shop › GST included in shop prices + HSN code (e.g. 4911).
- [ ] Off-site backups in Settings › Backups (the Docker volume is on the same disk).
- [ ] Uptime Kuma (shop `homelab/`): monitor `http://<server>:5000/health`, not just the home page.
- [ ] Razorpay: share account details when ready.

### Running in Docker: things to know

1. **Connect Gmail** needs `http://localhost:5000` (a browser on the server itself) or an https domain. Google refuses `http://<LAN IP>` callback addresses.
2. **Open mail in my browser** is off in Docker by design (no browser in the container); the web compose flow still works.
3. **YouPI webhook**: from another container, `localhost` is that container. Use the server's LAN address or a shared Docker network.
4. **Don't expose InWoice publicly** (plain http on :5000). The shop sync only calls out, so it needs no inbound access.
5. Later hardening: run the app as a non-root user; pin the Ollama image tag. Do this where the image can be test-built.

## Phase 1: Link shop products to InWoice products (do first)

**Why:** shop orders arrive as free-text lines (`type: 'CUSTOM'`, `itemId: null`), so stock,
product profit and material reports don't see online sales. Everything later builds on this.

**Already available:** each line in the shop's order feed carries `productId` and `slug`
(see `OrderLine` in the shop's `src/lib/types.ts`); the sync's zod schema currently drops them.
InWoice `Product.sku` is unique.

Tasks:
1. `shop-sync.service.ts`: add `productId` and `slug` (optional) to the `line` schema.
2. Match each line to an InWoice product by `sku === slug` (fallback: an explicit mapping
   table if slugs and SKUs can't be kept equal). Matched lines become `type: 'PRODUCT'`
   with `itemId`, so `createInvoice` handles stock, HSN and tax rate from the product.
   Keep the shop's price on the line (shop price wins).
3. Unmatched lines stay `CUSTOM` and are listed in Settings › Shop ("not linked: …") with
   a one-click "create product from this" (name, price, sku = slug).
4. Optional: a "Import shop catalogue" button reading the shop's catalogue feed
   (`/api/feeds/catalog`) to create/update InWoice products with sku = slug.
5. Keep the GST behaviour from `invoiceAmounts` (prices include GST; totals exact to the paisa).

Done when: a confirmed shop order for a linked product reduces InWoice stock once (not again
on re-sync or status changes), shows on the product's profit, and unlinked lines are listed.
Tests in `backend/tests/shop-sync.test.ts` cover linked, unlinked, re-sync and cancel
(stock returned when an unpaid order is cancelled).

## Phase 2: Custom requests → quotes at area pricing

**Why:** custom sticker jobs are billed by area (₹80/sq ft is the normal rate) and today
they live only in the shop's admin.

Shop side (`stixnvibes-nv`): add a read-only feed like the orders one:
`GET /api/integrations/custom-requests?since=&limit=` with the same bearer token, returning
`CustomRequest` (number, customer, kind, size, qty, note, file links, status, updatedAt).

InWoice side:
1. New sync step next to orders (same cursor pattern, own cursor column, plain-DDL migration).
2. Each new request becomes a **draft quote** for the matched/created customer, one line per
   request using the area product (unit `sqft`, its `minCharge`), size parsed into sq ft
   with `backend/src/lib/units.ts` when possible, otherwise left for the owner to fill in.
   Design file links go in the quote notes.
3. The owner edits and sends the quote as today; accepting it converts to an invoice.

Done when: a request in the shop appears as a draft quote within one sync, is never
duplicated, and its sq ft price matches what `SizeCalculator` would give.

## Phase 3: One system for stall sales

**Why:** the shop has its own stall mode (`/api/admin/stall-sales`, `StallSale` with lines,
discount, payment), and InWoice now has `/pos`. Stall sales made in the shop don't reach
InWoice accounts or GST reports.

1. Decide (owner): bill at stalls in the shop's stall mode, or in InWoice POS.
2. If the shop: add a stall-sales feed (same pattern) and record each sale as a POS invoice
   with payment (`source: 'POS'`, linked products per Phase 1).
3. If InWoice: retire the shop's stall billing, keep its stall QR/marketing pages.

Done when: every stall sale shows once in InWoice's daily POS summary and GST reports.

## Phase 4: Vinyl and material usage

**Why:** the shop's Cricut sheet maker knows how much sheet each job uses; InWoice has
materials (`InventoryItem`, category RAW_MATERIAL) but nothing consumes them from shop jobs.

1. Per product, record material use per unit (e.g. sq ft of vinyl per sheet) in InWoice.
2. When a shop order invoice is issued (Phase 1), consume the materials; show low-stock
   alerts in Actions (reorder suggestions already exist there).
3. Optional: send actual usage from the sheet maker when it differs from the default.

Done when: issuing a linked shop order lowers material stock by the expected amount and the
cost per order shows on the invoice's profit.

## Conventions for whoever picks this up

- Migrations: create with `prisma migrate diff` + `migrate deploy` (non-interactive), and keep
  them plain DDL so the multi-tenant migrator can apply them per business.
- Area billing (sq ft) is first-class: never assume whole-number quantities for area products.
- Feeds are pulled by InWoice (the home server may be off); every sync is idempotent and keeps
  a cursor with a 5-minute look-back. Never push from the shop to InWoice.
- Tokens are bearer secrets stored like other secrets (`SECRET_FIELDS`), never returned by the API.
- Run `npm test` and `npm run test:unit` in `backend/`, and the shop's `npm run check`, before merging.
