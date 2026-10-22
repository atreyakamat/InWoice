import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, prisma, resetDb, setupOwner } from './helpers';
import { startFakeSmtp } from './fake-smtp';
import { runRecurringInvoices } from '../src/services/recurring.service';
import { runMonthlyStatements } from '../src/services/documents.service';

/**
 * v3.5: forgot-password, quotations, recurring invoices, customer statements and the
 * customer portal, end to end through the API and a fake mail server.
 */

let auth: Record<string, string>;
let smtp: Awaited<ReturnType<typeof startFakeSmtp>>;
let asha: string; // customer with email
let bose: string; // second customer, for isolation checks
let sticker: string;
const DAY = 86_400_000;
const isoDay = (offset: number) => {
  const d = new Date(Date.now() + offset * DAY);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** Mail bodies are quoted-printable: undo soft line breaks and =XX escapes. */
const decode = (raw: string) => raw.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
const lastMail = () => decode(smtp.messages[smtp.messages.length - 1]!.data);

beforeAll(async () => {
  await resetDb();
  auth = await setupOwner();
  smtp = await startFakeSmtp();
  await api.put('/api/settings').set(auth).send({
    state: 'Goa',
    gstNumber: '30ABCDE1234F1ZD',
    upiId: 'shop@upi',
    appUrl: 'https://billing.example.in/',
    smtpHost: '127.0.0.1',
    smtpPort: String(smtp.port),
    smtpUsername: 'u',
    smtpPassword: 'p',
    smtpFrom: 'shop@test.local',
  });
  asha = (await api.post('/api/customers').set(auth).send({ name: 'Asha Rao', email: 'asha@test.local', state: 'Goa', phone: '919800000001' })).body.data.id;
  bose = (await api.post('/api/customers').set(auth).send({ name: 'Bose & Co', email: 'bose@test.local', state: 'Kerala' })).body.data.id;
  sticker = (await api.post('/api/products').set(auth).send({ name: 'Sticker', price: 100, stock: 1000, hsnCode: '4911' })).body.data.id;
});
afterAll(async () => {
  await smtp.close();
  await prisma.$disconnect();
});

describe('forgot password', () => {
  let token = '';

  it('answers the same for unknown addresses and sends nothing', async () => {
    const before = smtp.messages.length;
    const res = await api.post('/api/auth/forgot-password').send({ email: 'nobody@test.local' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/If that email address has an account/);
    expect(smtp.messages.length).toBe(before);
  });

  it('emails a one-time link to the owner', async () => {
    const res = await api.post('/api/auth/forgot-password').send({ email: 'OWNER@test.local' });
    expect(res.body).toMatchObject({ success: true, emailConfigured: true });
    const mail = lastMail();
    expect(smtp.messages.at(-1)!.to).toContain('owner@test.local');
    const m = mail.match(/https:\/\/billing\.example\.in\/reset-password\?token=([A-Za-z0-9_-]+)/);
    expect(m).not.toBeNull();
    token = m![1]!;
    // Only the hash is stored.
    expect(await prisma.passwordReset.count({ where: { tokenHash: token } })).toBe(0);
  });

  it('shows a masked email for a valid link', async () => {
    const res = await api.get(`/api/auth/reset-password/${token}`);
    expect(res.body.data.email).toBe('ow***@test.local');
    expect((await api.get('/api/auth/reset-password/not-a-real-token-at-all')).status).toBe(400);
  });

  it('changes the password once, then the link is dead', async () => {
    expect((await api.post('/api/auth/reset-password').send({ token, password: 'short' })).status).toBe(400);
    const ok = await api.post('/api/auth/reset-password').send({ token, password: 'brand-new-pass' });
    expect(ok.status).toBe(200);
    expect((await api.post('/api/auth/login').send({ email: 'owner@test.local', password: 'password123' })).status).toBe(401);
    const fresh = await api.post('/api/auth/login').send({ email: 'owner@test.local', password: 'brand-new-pass' });
    expect(fresh.status).toBe(200);
    // Resetting the password signed out the old session.
    expect((await api.get('/api/auth/me').set(auth)).status).toBe(401);
    auth = { Authorization: `Bearer ${fresh.body.token}` };
    const again = await api.post('/api/auth/reset-password').send({ token, password: 'another-pass-1' });
    expect(again.status).toBe(400);
  });

  it('refuses an expired link', async () => {
    await api.post('/api/auth/forgot-password').send({ email: 'owner@test.local' });
    const t = lastMail().match(/token=([A-Za-z0-9_-]+)/)![1]!;
    await prisma.passwordReset.updateMany({ where: { usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await api.post('/api/auth/reset-password').send({ token: t, password: 'expired-pass-1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/expired/);
  });
});

describe('quotations', () => {
  const q: Record<string, { id: string; quoteNumber: string }> = {};

  it('creates a quote with GST totals and a default validity', async () => {
    const res = await api
      .post('/api/quotes')
      .set(auth)
      .send({ customerId: asha, discount: 100, items: [{ type: 'PRODUCT', itemId: sticker, quantity: 10 }, { type: 'CUSTOM', name: 'Design', unitPrice: 500, taxRate: 18, quantity: 1 }] });
    expect(res.status).toBe(201);
    const d = res.body.data;
    expect(d).toMatchObject({ quoteNumber: 'QT-0001', status: 'DRAFT', displayStatus: 'DRAFT', subtotal: 1500, discount: 100, cgst: 126, sgst: 126, grandTotal: 1652 });
    expect(Math.round((new Date(d.validUntil).getTime() - new Date(d.date).getTime()) / DAY)).toBe(15);
    q.main = d;
  });

  it('edits an open quote and renders a PDF', async () => {
    const res = await api.put(`/api/quotes/${q.main!.id}`).set(auth).send({ customerId: asha, items: [{ type: 'PRODUCT', itemId: sticker, quantity: 20 }] });
    expect(res.body.data).toMatchObject({ subtotal: 2000, grandTotal: 2360 });
    const pdf = await api.get(`/api/quotes/${q.main!.id}/pdf`).set(auth).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
  });

  it('emails the quote, marks it sent and links to the portal', async () => {
    const res = await api.post(`/api/quotes/${q.main!.id}/send`).set(auth).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SENT');
    const mail = lastMail();
    expect(mail).toMatch(/quotation QT-0001/);
    expect(mail).toMatch(/https:\/\/billing\.example\.in\/portal\/[A-Za-z0-9_-]{20,}/);
    expect(mail).toMatch(/QT-0001\.pdf/);
  });

  it('converts an accepted quote into an invoice exactly once', async () => {
    await api.patch(`/api/quotes/${q.main!.id}/status`).set(auth).send({ status: 'ACCEPTED' });
    const conv = await api.post(`/api/quotes/${q.main!.id}/convert`).set(auth).send({ issue: true });
    expect(conv.status).toBe(201);
    expect(conv.body.data).toMatchObject({ status: 'PENDING', subtotal: 2000, grandTotal: 2360 });
    expect(conv.body.data.notes).toMatch(/From quote QT-0001/);
    const after = (await api.get(`/api/quotes/${q.main!.id}`).set(auth)).body.data;
    expect(after).toMatchObject({ status: 'CONVERTED', invoice: { invoiceNumber: conv.body.data.invoiceNumber } });
    expect((await api.post(`/api/quotes/${q.main!.id}/convert`).set(auth).send({})).status).toBe(400);
    expect((await api.put(`/api/quotes/${q.main!.id}`).set(auth).send({ customerId: asha, items: [{ type: 'CUSTOM', name: 'x', unitPrice: 1, quantity: 1 }] })).status).toBe(400);
    expect((await api.delete(`/api/quotes/${q.main!.id}`).set(auth)).status).toBe(400);
  });

  it('derives expiry, refuses converting a declined quote, and duplicates', async () => {
    const old = await api
      .post('/api/quotes')
      .set(auth)
      .send({ customerId: bose, date: isoDay(-30), validUntil: isoDay(-1), items: [{ type: 'CUSTOM', name: 'Mural', unitPrice: 1000, taxRate: 18, quantity: 1 }] });
    expect(old.body.data.displayStatus).toBe('EXPIRED');
    expect(old.body.data.igst).toBe(180); // Kerala customer: inter-state
    expect((await api.get('/api/quotes?status=EXPIRED').set(auth)).body.total).toBe(1);
    await api.patch(`/api/quotes/${old.body.data.id}/status`).set(auth).send({ status: 'DECLINED' });
    expect((await api.post(`/api/quotes/${old.body.data.id}/convert`).set(auth).send({})).status).toBe(400);
    const dup = await api.post(`/api/quotes/${old.body.data.id}/duplicate`).set(auth);
    expect(dup.body.data).toMatchObject({ quoteNumber: 'QT-0003', status: 'DRAFT', displayStatus: 'DRAFT', grandTotal: 1180 });
    q.bose = dup.body.data;
  });
});

describe('recurring invoices', () => {
  let monthly: { id: string };

  it('refuses a schedule whose lines do not resolve', async () => {
    const res = await api
      .post('/api/recurring')
      .set(auth)
      .send({ name: 'Broken', customerId: asha, frequency: 'MONTHLY', startDate: isoDay(0), items: [{ type: 'PRODUCT', itemId: '00000000-0000-0000-0000-000000000000', quantity: 1 }] });
    expect(res.status).toBe(404);
  });

  it('creates missed periods once, dated on their own period, then waits for the next one', async () => {
    const start = new Date();
    start.setMonth(start.getMonth() - 2);
    const res = await api
      .post('/api/recurring')
      .set(auth)
      .send({ name: 'Retainer', customerId: asha, frequency: 'MONTHLY', startDate: isoDay(Math.round((start.getTime() - Date.now()) / DAY)), paymentTermsDays: 7, items: [{ type: 'CUSTOM', name: 'Monthly retainer', unitPrice: 5000, taxRate: 18, quantity: 1 }] });
    expect(res.status).toBe(201);
    monthly = res.body.data;

    const [a, b] = await Promise.all([runRecurringInvoices(), runRecurringInvoices()]); // two ticks racing
    expect(a.created.length + b.created.length).toBe(3);
    const invs = await prisma.invoice.findMany({ where: { recurringId: monthly.id }, orderBy: { date: 'asc' } });
    expect(invs).toHaveLength(3);
    expect(invs.every((i) => i.status === 'PENDING' && i.grandTotal === 5900)).toBe(true);
    expect(new Set(invs.map((i) => i.date.getMonth())).size).toBe(3);
    expect(Math.round((invs[2]!.dueDate!.getTime() - invs[2]!.date.getTime()) / DAY)).toBe(7);

    const again = await runRecurringInvoices();
    expect(again.created).toHaveLength(0);
    const r = (await api.get(`/api/recurring/${monthly.id}`).set(auth)).body.data;
    expect(r).toMatchObject({ runCount: 3, nextIndex: 3, status: 'ACTIVE' });
    expect(new Date(r.nextRunDate).getTime()).toBeGreaterThan(Date.now());
    expect(r.invoices).toHaveLength(3);
  });

  it('can create the next invoice early, and pausing skips periods instead of billing them later', async () => {
    const early = await api.post(`/api/recurring/${monthly.id}/run`).set(auth);
    expect(early.status).toBe(201);
    expect((await prisma.recurringInvoice.findUniqueOrThrow({ where: { id: monthly.id } })).nextIndex).toBe(4);

    await api.post(`/api/recurring/${monthly.id}/pause`).set(auth);
    // Pretend we were paused for a long time: the schedule is now well behind.
    await prisma.recurringInvoice.update({ where: { id: monthly.id }, data: { nextIndex: 1, nextRunDate: new Date(Date.now() - 60 * DAY) } });
    const resumed = (await api.post(`/api/recurring/${monthly.id}/resume`).set(auth)).body.data;
    expect(new Date(resumed.nextRunDate).getTime()).toBeGreaterThanOrEqual(new Date(isoDay(0)).getTime() - DAY);
    expect((await runRecurringInvoices()).created.filter(Boolean).length).toBeLessThanOrEqual(1);
  });

  it('emails each invoice when asked, and ends after the end date', async () => {
    const before = smtp.messages.length;
    const res = await api
      .post('/api/recurring')
      .set(auth)
      .send({ name: 'Weekly cleaning', customerId: asha, frequency: 'WEEKLY', startDate: isoDay(-7), endDate: isoDay(-1), autoEmail: true, items: [{ type: 'PRODUCT', itemId: sticker, quantity: 2 }] });
    const r = await runRecurringInvoices();
    expect(r.created).toHaveLength(1);
    expect(smtp.messages.length).toBe(before + 1);
    expect(lastMail()).toMatch(/View all your invoices and pay online: https:\/\/billing\.example\.in\/portal\//);
    const s = (await api.get(`/api/recurring/${res.body.data.id}`).set(auth)).body.data;
    expect(s.status).toBe('ENDED');
    expect((await api.post(`/api/recurring/${res.body.data.id}/run`).set(auth)).status).toBe(400);
  });

  it('keeps created invoices when a schedule is deleted', async () => {
    const del = await api.delete(`/api/recurring/${monthly.id}`).set(auth);
    expect(del.status).toBe(200);
    expect(await prisma.invoice.count({ where: { notes: null, customerId: asha, grandTotal: 5900 } })).toBeGreaterThanOrEqual(4);
  });
});

describe('customer statements', () => {
  let carol: string;

  it('shows opening balance, every transaction and a running balance', async () => {
    carol = (await api.post('/api/customers').set(auth).send({ name: 'Carol', email: 'carol@test.local', state: 'Goa' })).body.data.id;
    const mk = (date: string, amount: number) =>
      api.post('/api/invoices').set(auth).send({ customerId: carol, issue: true, date, dueDate: date, items: [{ type: 'CUSTOM', name: 'Work', unitPrice: amount, taxRate: 0, quantity: 1 }] });
    const old = (await mk('2026-01-10', 1000)).body.data; // before the period
    await api.post(`/api/invoices/${old.id}/payments`).set(auth).send({ amount: 400, paymentDate: '2026-01-20' });
    const feb = (await mk('2026-02-05', 2000)).body.data;
    await api.post(`/api/invoices/${feb.id}/payments`).set(auth).send({ amount: 500, paymentDate: '2026-02-15', paymentMethod: 'UPI', referenceId: 'UTR9' });
    await api.post(`/api/invoices/${feb.id}/credit-notes`).set(auth).send({ reason: 'DISCOUNT', date: '2026-02-20', items: [{ invoiceItemId: feb.items[0].id, amount: 300 }] });
    await mk('2026-03-01', 999); // after the period

    const st = (await api.get(`/api/customers/${carol}/statement?month=2026-02`).set(auth)).body.data;
    expect(st.opening).toBe(600);
    // 5 Feb invoice, 15 Feb payment, 20 Feb credit note (0% tax, so it credits exactly 300).
    expect(st.lines.map((l: { kind: string; balance: number }) => [l.kind, l.balance])).toEqual([
      ['INVOICE', 2600],
      ['PAYMENT', 2100],
      ['CREDIT_NOTE', 1800],
    ]);
    expect(st.closing).toBe(1800);
    expect(st.totals).toEqual({ invoiced: 2000, received: 500, credited: 300 });
    expect(st.amountDue).toBe(600 + 1200 + 999);
  });

  it('renders the statement PDF and emails it', async () => {
    const pdf = await api.get(`/api/customers/${carol}/statement/pdf?month=2026-02`).set(auth);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    const res = await api.post(`/api/customers/${carol}/statement/send?month=2026-02`).set(auth).send({});
    expect(res.body.message).toMatch(/carol@test\.local/);
    expect(lastMail()).toMatch(/statement of account for 2026-02/);
  });

  it('sends monthly statements once per customer per month, only to customers who owe money', async () => {
    const off = await runMonthlyStatements();
    expect(off.skipped).toMatch(/switched off/);
    await api.put('/api/settings').set(auth).send({ statementsEnabled: true });
    const first = await runMonthlyStatements();
    expect(first.sent).toEqual(expect.arrayContaining([asha, carol]));
    expect(first.sent).not.toContain(bose); // owes nothing
    expect((await runMonthlyStatements()).sent).toHaveLength(0);
  });
});

describe('customer portal', () => {
  let token = '';

  it('is created by emailing and can be read without logging in', async () => {
    const link = (await api.get(`/api/customers/${asha}/portal`).set(auth)).body.data;
    expect(link.enabled).toBe(true);
    token = link.url.split('/portal/')[1];
    const draft = await api.post('/api/invoices').set(auth).send({ customerId: asha, items: [{ type: 'CUSTOM', name: 'Secret draft', unitPrice: 1, quantity: 1 }] });
    const res = await api.get(`/api/portal/${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    const d = res.body.data;
    expect(d.customer.name).toBe('Asha Rao');
    expect(d.business).toMatchObject({ name: 'Test Biz', upiId: 'shop@upi' });
    expect(d.business.smtpPassword).toBeUndefined();
    expect(d.invoices.some((i: { invoiceNumber: string }) => i.invoiceNumber === draft.body.data.invoiceNumber)).toBe(false);
    expect(d.outstanding).toBeGreaterThan(0);
    expect(d.payAllLink).toMatch(/^upi:\/\/pay\?pa=shop%40upi/);
    expect(d.quotes.map((q: { quoteNumber: string; status: string }) => [q.quoteNumber, q.status])).toEqual([['QT-0001', 'CONVERTED']]);
  });

  it('serves only this customer\'s PDFs', async () => {
    const mine = (await api.get(`/api/portal/${token}`)).body.data.invoices[0];
    expect((await api.get(`/api/portal/${token}/invoices/${mine.id}/pdf`)).headers['content-type']).toBe('application/pdf');
    const other = await api.post('/api/invoices').set(auth).send({ customerId: bose, issue: true, items: [{ type: 'CUSTOM', name: 'Other', unitPrice: 10, quantity: 1 }] });
    expect((await api.get(`/api/portal/${token}/invoices/${other.body.data.id}/pdf`)).status).toBe(404);
    expect((await api.get(`/api/portal/${token}/statement/pdf`)).headers['content-type']).toBe('application/pdf');
  });

  it('lets the customer accept a sent quote, but not an expired one', async () => {
    const sent = await api.post('/api/quotes').set(auth).send({ customerId: asha, items: [{ type: 'CUSTOM', name: 'Banner', unitPrice: 800, quantity: 1 }] });
    await api.patch(`/api/quotes/${sent.body.data.id}/status`).set(auth).send({ status: 'SENT' });
    const ok = await api.post(`/api/portal/${token}/quotes/${sent.body.data.id}/accept`);
    expect(ok.status).toBe(200);
    expect((await api.get(`/api/quotes/${sent.body.data.id}`).set(auth)).body.data.status).toBe('ACCEPTED');
    expect((await api.post(`/api/portal/${token}/quotes/${sent.body.data.id}/decline`)).status).toBe(400); // no longer open

    const stale = await api.post('/api/quotes').set(auth).send({ customerId: asha, date: isoDay(-20), validUntil: isoDay(-2), items: [{ type: 'CUSTOM', name: 'Old', unitPrice: 1, quantity: 1 }] });
    await api.patch(`/api/quotes/${stale.body.data.id}/status`).set(auth).send({ status: 'SENT' });
    const late = await api.post(`/api/portal/${token}/quotes/${stale.body.data.id}/accept`);
    expect(late.status).toBe(400);
    expect(late.body.error).toMatch(/expired/);
  });

  it('puts the portal link in WhatsApp messages', async () => {
    const inv = (await api.get(`/api/portal/${token}`)).body.data.invoices[0];
    const wa = await api.get(`/api/invoices/${inv.id}/whatsapp`).set(auth);
    expect(wa.body.data.message).toContain(`https://billing.example.in/portal/${token}`);
  });

  it('stops working the moment the link is replaced or turned off', async () => {
    const next = (await api.post(`/api/customers/${asha}/portal/regenerate`).set(auth)).body.data.url as string;
    expect((await api.get(`/api/portal/${token}`)).status).toBe(404);
    const newToken = next.split('/portal/')[1]!;
    expect((await api.get(`/api/portal/${newToken}`)).status).toBe(200);
    await api.delete(`/api/customers/${asha}/portal`).set(auth);
    expect((await api.get(`/api/portal/${newToken}`)).status).toBe(404);
    expect((await api.get('/api/portal/short')).status).toBe(404);
  });
});
