import crypto from 'crypto';
import type { BusinessSettings } from '@prisma/client';
import prisma from '../lib/prisma';
import { HttpError, badRequest, notFound } from '../lib/errors';
import { round2 } from '../lib/util';
import { addPayment, balanceOf } from './invoice.service';
import { ensurePortalToken } from './portal.service';
import { getSettings, publicBaseUrl } from './settings.service';

/**
 * YouPI-PG integration (https://github.com/youpi-pg/YouPI-PG), a self-hosted UPI payment
 * gateway. InWoice creates a payment session for an invoice's balance and sends the customer
 * to YouPI's checkout; YouPI posts a signed webhook when the payment is seen, and InWoice
 * records it on the invoice. Pending sessions are also re-checked by the scheduler in case a
 * webhook is missed.
 *
 * YouPI describes itself as experimental: it detects payments from bank SMS/email alerts.
 * Its result is recorded with the UTR so it can be checked against the bank statement
 * (Bank › import), and anything that doesn't add up is left for a person to decide.
 */

const FINAL = ['SUCCESS', 'FAILED', 'EXPIRED', 'CANCELLED'] as const;
type Final = (typeof FINAL)[number];
const REUSE_MS = 4 * 60_000; // YouPI gives the customer 5 minutes to pay

export interface YoupiConfig {
  apiUrl: string;
  merchantId: string;
  secret: string;
}

export function youpiConfig(s: BusinessSettings): YoupiConfig | null {
  if (!s.youpiEnabled || !s.youpiApiUrl || !s.youpiMerchantId) return null;
  return { apiUrl: s.youpiApiUrl.replace(/\/+$/, ''), merchantId: s.youpiMerchantId, secret: s.youpiWebhookSecret ?? '' };
}

async function requireConfig() {
  const c = youpiConfig(await getSettings());
  if (!c) throw badRequest('Online payments are not set up. Add your YouPI gateway in Settings › Payments.');
  return c;
}

async function call<T>(c: YoupiConfig, path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  let res: Response;
  try {
    res = await fetch(`${c.apiUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'X-Merchant-Id': c.merchantId, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new HttpError(502, `Could not reach the payment gateway at ${c.apiUrl} (${err instanceof Error ? err.message : err})`);
  }
  const text = await res.text();
  let body: T;
  try {
    body = (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new HttpError(502, `The payment gateway replied with something that isn't JSON (HTTP ${res.status})`);
  }
  return { status: res.status, body };
}

const gatewayError = (body: unknown) => {
  const b = (body ?? {}) as { message?: string; error?: string };
  return b.message || b.error || 'unknown error';
};

/** "Test connection" in Settings: the API answers (a made-up payment id gives a clean 404). */
export async function testYoupi(override?: Partial<YoupiConfig>) {
  const s = await getSettings();
  const base = youpiConfig({ ...s, youpiEnabled: true }) ?? { apiUrl: '', merchantId: '', secret: '' };
  const c = { ...base, ...Object.fromEntries(Object.entries(override ?? {}).filter(([, v]) => v)) } as YoupiConfig;
  if (!c.apiUrl || !c.merchantId) throw badRequest('Enter the gateway address and your merchant ID');
  c.apiUrl = c.apiUrl.replace(/\/+$/, '');
  const started = Date.now();
  const r = await call(c, `/api/v1/payments/${crypto.randomUUID()}`);
  if (r.status !== 404 && r.status !== 200) throw new HttpError(502, `The gateway answered HTTP ${r.status}: ${gatewayError(r.body)}`);
  return { ok: true, ms: Date.now() - started, webhookSecretSet: Boolean(c.secret) };
}

/** Our order id for the gateway: readable, unique, and safe in URLs. */
const orderIdFor = (invoiceNumber: string) => `IW-${invoiceNumber.replace(/[^A-Za-z0-9-]+/g, '-')}-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

/**
 * A checkout session for what the invoice still owes. A session for the same amount opened in
 * the last few minutes is reused, so a customer who taps "Pay now" twice gets one checkout.
 */
export async function createCheckout(invoiceId: string, opts: { returnUrl?: string | null } = {}) {
  const c = await requireConfig();
  const inv = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { customer: true } });
  if (!inv) throw notFound('Invoice');
  if (!['PENDING', 'PARTIAL'].includes(inv.status)) throw badRequest(inv.status === 'PAID' ? 'This invoice is already paid' : 'Only issued, unpaid invoices can be paid online');
  const amount = balanceOf(inv);
  if (amount <= 0) throw badRequest('Nothing is due on this invoice');

  const recent = await prisma.onlinePayment.findFirst({
    where: { invoiceId, status: 'ACTIVE', amount, createdAt: { gte: new Date(Date.now() - REUSE_MS) }, checkoutUrl: { not: null } },
    orderBy: { createdAt: 'desc' },
  });
  if (recent) return recent;

  const settings = await getSettings();
  const orderId = orderIdFor(inv.invoiceNumber);
  const r = await call<{ paymentId?: string; checkoutUrl?: string; status?: string; code?: string; message?: string; error?: string }>(c, '/api/v1/payments', {
    method: 'POST',
    headers: { 'Idempotency-Key': orderId },
    body: JSON.stringify({
      orderId,
      amount: amount.toFixed(2),
      currency: 'INR',
      customer: { name: inv.customer.name, email: inv.customer.email ?? undefined, phoneNumber: inv.customer.phone ?? undefined },
      description: `Invoice ${inv.invoiceNumber} from ${settings.businessName}`,
      returnUrl: opts.returnUrl ?? undefined,
      metadata: { source: 'inwoice', invoiceId: inv.id, invoiceNumber: inv.invoiceNumber },
    }),
  });
  if (r.status === 409) throw new HttpError(409, 'A payment for this is already open on another device. Finish or cancel it there, or try again in 5 minutes.');
  if (r.status === 403) throw new HttpError(403, `The payment gateway refused this payment: ${gatewayError(r.body)}`);
  if (r.status >= 400 || !r.body.checkoutUrl) throw new HttpError(502, `The payment gateway could not start the payment: ${gatewayError(r.body)}`);
  const checkoutUrl = new URL(r.body.checkoutUrl, `${c.apiUrl}/`).toString();
  return prisma.onlinePayment.create({
    data: { invoiceId, orderId, gatewayPaymentId: r.body.paymentId ?? null, amount, status: 'ACTIVE', checkoutUrl },
  });
}

/** The link to put in emails/WhatsApp: opens a fresh checkout for the current balance. */
export async function payNowLink(customerId: string, invoiceId: string, requestOrigin?: string | null) {
  const s = await getSettings();
  if (!youpiConfig(s)) return null;
  const base = await publicBaseUrl(requestOrigin);
  if (!base) return null;
  return `${base}/api/portal/${await ensurePortalToken(customerId)}/invoices/${invoiceId}/pay`;
}

// --- Webhooks ---------------------------------------------------------------------------

const safeEqualHex = (a: string, b: string) => {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

/**
 * YouPI signs the raw body: `X-Gateway-Signature: sha256=HMAC(body)`, and newer versions
 * also `X-Gateway-Signature-V2: sha256=HMAC("<timestamp>.<body>")`. Either one must match.
 */
export function verifyWebhookSignature(raw: Buffer, headers: Record<string, string | string[] | undefined>, secret: string) {
  if (!secret) return false;
  const h = (name: string) => {
    const v = headers[name.toLowerCase()];
    return (Array.isArray(v) ? v[0] : v)?.replace(/^sha256=/i, '').trim() ?? '';
  };
  const v1 = h('X-Gateway-Signature');
  if (v1 && safeEqualHex(crypto.createHmac('sha256', secret).update(raw).digest('hex'), v1)) return true;
  const v2 = h('X-Gateway-Signature-V2');
  const ts = h('X-Gateway-Timestamp');
  if (v2 && ts) {
    const expected = crypto.createHmac('sha256', secret).update(`${ts}.`).update(raw).digest('hex');
    if (safeEqualHex(expected, v2)) return true;
  }
  return false;
}

interface GatewayResult {
  event?: string;
  status?: string;
  orderId?: string;
  paymentId?: string;
  amount?: string | number;
  amountPaise?: number;
  utr?: string;
  verificationLevel?: number;
}

const paiseOf = (r: GatewayResult) => (typeof r.amountPaise === 'number' ? r.amountPaise : r.amount !== undefined ? Math.round(Number(r.amount) * 100) : NaN);

/** Apply a gateway result (webhook or status check) to our record and the invoice. Safe to repeat. */
async function applyResult(row: { id: string; invoiceId: string; amount: number; status: string }, result: GatewayResult) {
  const outcome = (result.event ?? result.status ?? '').toUpperCase() as Final;
  if (!FINAL.includes(outcome)) return { changed: false, status: row.status };
  if (outcome !== 'SUCCESS') {
    const n = await prisma.onlinePayment.updateMany({ where: { id: row.id, status: 'ACTIVE' }, data: { status: outcome, utr: result.utr ?? undefined } });
    return { changed: n.count > 0, status: n.count ? outcome : row.status };
  }

  const paid = round2(paiseOf(result) / 100);
  if (!(paid > 0)) return { changed: false, status: row.status, note: 'Success without an amount: ignored' };
  // Claim it once: a repeated webhook or a later status check finds it already done.
  const claimed = await prisma.onlinePayment.updateMany({ where: { id: row.id, status: { not: 'SUCCESS' } }, data: { status: 'SUCCESS', utr: result.utr ?? null } });
  if (!claimed.count) return { changed: false, status: 'SUCCESS' };

  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: row.invoiceId } });
  const balance = balanceOf(inv);
  const record = round2(Math.min(paid, balance));
  const notes: string[] = [];
  if (Math.abs(paid - row.amount) > 0.005) notes.push(`Paid ${paid.toFixed(2)} against a request for ${row.amount.toFixed(2)}`);
  if (paid > balance + 0.005) notes.push(`${round2(paid - balance).toFixed(2)} more than was due: refund it or keep it as an advance`);
  let paymentId: string | null = null;
  if (record > 0 && ['PENDING', 'PARTIAL'].includes(inv.status)) {
    const updated = await addPayment(row.invoiceId, {
      amount: record,
      tdsAmount: 0,
      paymentMethod: 'UPI',
      paymentDate: new Date(),
      referenceId: result.utr ?? result.paymentId ?? undefined,
      notes: `Paid online (YouPI ${result.paymentId ?? row.id}${typeof result.verificationLevel === 'number' ? `, verification level ${result.verificationLevel}` : ''})${notes.length ? `. ${notes.join('. ')}` : ''}`,
    });
    paymentId = updated.payments.reduce<(typeof updated.payments)[number] | null>((last, p) => (!last || p.createdAt > last.createdAt ? p : last), null)?.id ?? null;
  } else {
    notes.push('The invoice was already settled when this payment arrived: refund it or credit the customer');
  }
  await prisma.onlinePayment.update({ where: { id: row.id }, data: { paymentId, note: notes.join('. ') || null } });
  if (notes.length) {
    await prisma.activity.create({
      data: { customerId: inv.customerId, eventType: 'PAYMENT_REVIEW', title: `Check online payment for ${inv.invoiceNumber}`, description: notes.join('. '), referenceType: 'INVOICE', referenceId: inv.id },
    });
  }
  return { changed: true, status: 'SUCCESS' };
}

/** Handle a webhook from YouPI. Throws 401 on a bad signature; unknown orders are ignored. */
export async function handleWebhook(raw: Buffer, headers: Record<string, string | string[] | undefined>) {
  const s = await getSettings();
  const c = youpiConfig(s);
  if (!c?.secret) throw new HttpError(503, 'Online payments are not set up');
  if (!verifyWebhookSignature(raw, headers, c.secret)) throw new HttpError(401, 'Invalid webhook signature');
  let body: GatewayResult;
  try {
    body = JSON.parse(raw.toString('utf8'));
  } catch {
    throw badRequest('Webhook body is not JSON');
  }
  if (!body.orderId) return { received: true, ignored: 'no orderId' };
  const row = await prisma.onlinePayment.findUnique({ where: { orderId: body.orderId } });
  if (!row) return { received: true, ignored: 'unknown order' };
  if (body.paymentId && row.gatewayPaymentId && body.paymentId !== row.gatewayPaymentId) return { received: true, ignored: 'payment id does not match' };
  return { received: true, ...(await applyResult(row, body)) };
}

/** Ask the gateway about sessions still open (missed webhooks). Invoice-scoped or all recent. */
export async function syncPending(invoiceId?: string) {
  const c = youpiConfig(await getSettings());
  if (!c) return { checked: 0, updated: 0 };
  const rows = await prisma.onlinePayment.findMany({
    where: { status: 'ACTIVE', gatewayPaymentId: { not: null }, ...(invoiceId ? { invoiceId } : { createdAt: { gte: new Date(Date.now() - 2 * 86_400_000) } }) },
    take: 50,
  });
  let updated = 0;
  for (const row of rows) {
    const r = await call<GatewayResult>(c, `/api/v1/payments/${encodeURIComponent(row.gatewayPaymentId!)}`);
    if (r.status === 404) {
      await prisma.onlinePayment.updateMany({ where: { id: row.id, status: 'ACTIVE' }, data: { status: 'EXPIRED', note: 'Not found at the gateway' } });
      updated++;
      continue;
    }
    if (r.status >= 400) continue;
    if (r.body.orderId && r.body.orderId !== row.orderId) continue;
    if ((await applyResult(row, r.body)).changed) updated++;
  }
  // Sessions that never got a gateway id and are long gone.
  await prisma.onlinePayment.updateMany({ where: { status: 'ACTIVE', createdAt: { lt: new Date(Date.now() - 2 * 86_400_000) } }, data: { status: 'EXPIRED' } });
  return { checked: rows.length, updated };
}

export const listOnlinePayments = (invoiceId: string) => prisma.onlinePayment.findMany({ where: { invoiceId }, orderBy: { createdAt: 'desc' }, take: 20 });
