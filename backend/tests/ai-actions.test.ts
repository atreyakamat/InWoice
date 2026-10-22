import http from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, prisma, resetDb, setupOwner } from './helpers';
import { startFakeSmtp } from './fake-smtp';
import { runOwnerDigest } from '../src/services/digest.service';

/**
 * v3.9: reading bills from photos/PDFs, the actions centre (approve-then-act), and the
 * owners' monthly summary. AI runs through a fake Ollama server, so no model is needed.
 */

let auth: Record<string, string>;
let smtp: Awaited<ReturnType<typeof startFakeSmtp>>;
let fake: http.Server;
let ollamaUrl = '';
let supplierId = '';
let reply: unknown = {};
const received: { model: string; format?: unknown; messages: { role: string; content: string; images?: string[] }[] }[] = [];

const bill = (over: Record<string, unknown> = {}) => ({
  supplierName: 'PrintPro Goa',
  supplierGstin: '30AAACP1234Q1ZL',
  billNumber: 'PP/26/118',
  billDate: '2026-10-05',
  dueDate: '',
  lines: [
    { description: 'Vinyl roll', hsn: '3919', quantity: 10, unitPrice: 200, taxRate: 18 },
    { description: 'Cutting blades', hsn: '8208', quantity: 2, unitPrice: 150, taxRate: 18 },
  ],
  discount: 0,
  shipping: 100,
  cgst: 207,
  sgst: 207,
  igst: 0,
  total: 2814,
  ...over,
});

beforeAll(async () => {
  await resetDb();
  auth = await setupOwner();
  smtp = await startFakeSmtp();
  fake = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const parsed = JSON.parse(body || '{}');
      received.push(parsed);
      const content = typeof reply === 'function' ? (reply as (p: unknown) => unknown)(parsed) : reply;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: { role: 'assistant', content: typeof content === 'string' ? content : JSON.stringify(content) } }));
    });
  });
  await new Promise<void>((r) => fake.listen(0, '127.0.0.1', r));
  ollamaUrl = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
  await api.put('/api/settings').set(auth).send({
    state: 'Goa',
    gstNumber: '30ABCDE1234F1ZD',
    upiId: 'shop@upi',
    smtpHost: '127.0.0.1',
    smtpPort: String(smtp.port),
    smtpUsername: 'u',
    smtpPassword: 'p',
    smtpFrom: 'shop@test.local',
  });
  supplierId = (await api.post('/api/suppliers').set(auth).send({ name: 'PrintPro Goa', gst: '30AAACP1234Q1ZL', state: 'Goa' })).body.data.id;
});
afterAll(async () => {
  await new Promise<void>((r) => fake.close(() => r()));
  await smtp.close();
  await prisma.$disconnect();
});

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

describe('reading a bill from a photo', () => {
  it('needs AI switched on', async () => {
    const res = await api.post('/api/bills/read').set(auth).set('Content-Type', 'image/png').send(PNG);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/needs AI/);
    await api.put('/api/settings').set(auth).send({ aiProvider: 'OLLAMA', ollamaUrl, aiModel: 'qwen2.5vl' });
  });

  it('fills a draft bill, matching the supplier by GSTIN and checking the totals', async () => {
    reply = bill();
    const res = await api.post('/api/bills/read').set(auth).set('Content-Type', 'image/png').send(PNG);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.supplier).toEqual({ id: supplierId, name: 'PrintPro Goa' });
    expect(d.draft).toMatchObject({ supplierId, billNumber: 'PP/26/118', date: '2026-10-05', dueDate: null, shippingCost: 100, interState: false });
    expect(d.draft.items).toEqual([
      { description: 'Vinyl roll', hsnCode: '3919', quantity: 10, unitPrice: 200, taxRate: 18 },
      { description: 'Cutting blades', hsnCode: '8208', quantity: 2, unitPrice: 150, taxRate: 18 },
    ]);
    expect(d).toMatchObject({ printedTotal: 2814, computedTotal: 2814, warnings: [] });
    // The photo went to the model, held to the bill schema.
    const call = received.at(-1)!;
    expect(call.messages[1]!.images![0]).toBe(PNG.toString('base64'));
    expect((call.format as { required: string[] }).required).toContain('lines');
    // Nothing was saved.
    expect(await prisma.bill.count()).toBe(0);
  });

  it('flags a bad GSTIN, an unknown supplier and totals that do not add up', async () => {
    reply = bill({ supplierName: 'New Vendor', supplierGstin: '30AAACP1234Q1ZX', total: 3000 });
    const d = (await api.post('/api/bills/read').set(auth).set('Content-Type', 'image/jpeg').send(PNG)).body.data;
    expect(d.supplier).toBeNull();
    expect(d.suggestedSupplier).toEqual({ name: 'New Vendor', gstin: null });
    expect(d.warnings.join(' ')).toMatch(/not valid/);
    expect(d.warnings.join(' ')).toMatch(/isn't in your suppliers/);
    expect(d.warnings.join(' ')).toMatch(/add up to 2814\.00 but the bill says 3000\.00/);
  });

  it('copes with a model that wraps or mangles its answer', async () => {
    reply = 'Here you go:\n```json\n' + JSON.stringify(bill({ lines: 'n/a', discount: 'none' })) + '\n```';
    const d = (await api.post('/api/bills/read').set(auth).set('Content-Type', 'image/png').send(PNG)).body.data;
    expect(d.draft.items).toEqual([]);
    expect(d.draft.discount).toBe(0);
    expect(d.warnings.join(' ')).toMatch(/No line items/);
    reply = 'I cannot read this';
    expect((await api.post('/api/bills/read').set(auth).set('Content-Type', 'image/png').send(PNG)).status).toBe(502);
  });

  it('refuses PDFs on local AI and files that are not documents', async () => {
    const pdf = await api.post('/api/bills/read').set(auth).set('Content-Type', 'application/pdf').send(Buffer.from('%PDF-1.4'));
    expect(pdf.status).toBe(400);
    expect(pdf.body.error).toMatch(/not PDFs/);
    expect((await api.post('/api/bills/read').set(auth).set('Content-Type', 'text/plain').send(Buffer.from('hi'))).status).toBe(400);
  });
});

describe('actions centre', () => {
  let invoice: { id: string; invoiceNumber: string };
  let vinyl = '';
  let ink = '';

  beforeAll(async () => {
    const c = (await api.post('/api/customers').set(auth).send({ name: 'Late Payer', email: 'late@test.local', state: 'Goa' })).body.data.id;
    const d = new Date(Date.now() - 20 * 86_400_000).toISOString().slice(0, 10);
    invoice = (await api.post('/api/invoices').set(auth).send({ customerId: c, issue: true, date: d, dueDate: d, items: [{ type: 'CUSTOM', name: 'Work', unitPrice: 1000, taxRate: 0, quantity: 1 }] })).body.data;
    vinyl = (await api.post('/api/inventory').set(auth).send({ name: 'Vinyl roll', unit: 'm', currentStock: 3, reorderLevel: 10, costPerUnit: 200, supplierId })).body.data.id;
    ink = (await api.post('/api/inventory').set(auth).send({ name: 'Ink', unit: 'L', currentStock: 0, reorderLevel: 2, costPerUnit: 900 })).body.data.id;
  });

  it('suggests chasing overdue invoices and reordering low materials', async () => {
    const s = (await api.get('/api/actions').set(auth)).body.data;
    expect(s.reminders.items).toEqual([expect.objectContaining({ id: invoice.id, customer: 'Late Payer', balance: 1000, daysOverdue: 20 })]);
    expect(s.reorder.items.find((i: { id: string }) => i.id === vinyl)).toMatchObject({ quantity: 17, supplierName: 'PrintPro Goa' });
    expect(s.reorder.items.find((i: { id: string }) => i.id === ink)).toMatchObject({ supplierId: null });
  });

  it('drafts reminder emails with AI for you to approve, and sends exactly what you approve', async () => {
    reply = (p: { messages: { content: string }[] }) => {
      const facts = JSON.parse(p.messages[1]!.content) as { invoiceId: string; customer: string }[];
      return JSON.stringify(facts.map((f) => ({ invoiceId: f.invoiceId, message: `Dear ${f.customer}, kindly clear the balance. Thanks!` })));
    };
    const drafts = (await api.post('/api/actions/reminders/draft').set(auth).send({ ids: [invoice.id] })).body.data;
    expect(drafts[0]).toMatchObject({ invoiceId: invoice.id, source: 'AI', message: 'Dear Late Payer, kindly clear the balance. Thanks!' });
    const edited = 'Hi! Just a nudge about the pending payment. Thanks, Test Biz';
    const before = smtp.messages.length;
    const run = await api.post('/api/actions/run').set(auth).send({ kind: 'reminders', items: [{ id: invoice.id, message: edited }] });
    expect(run.body.data.done).toEqual(['Reminder emailed to late@test.local']);
    expect(smtp.messages.length).toBe(before + 1);
    expect(smtp.messages.at(-1)!.data.replace(/=\r?\n/g, '')).toContain('Just a nudge');
    // Reminded just now, so it drops off the suggestions.
    expect((await api.get('/api/actions').set(auth)).body.data.reminders.items).toHaveLength(0);
  });

  it('falls back to a template when AI is off', async () => {
    await api.put('/api/settings').set(auth).send({ aiProvider: 'NONE', aiModel: '' });
    const drafts = (await api.post('/api/actions/reminders/draft').set(auth).send({ ids: [invoice.id] })).body.data;
    expect(drafts[0]).toMatchObject({ source: 'TEMPLATE' });
    expect(drafts[0].message).toMatch(/20 days past its due date/);
    expect(drafts[0].message).toMatch(/UPI to shop@upi/);
  });

  it('creates draft purchase orders for approved materials only', async () => {
    const run = await api.post('/api/actions/run').set(auth).send({ kind: 'reorder', items: [{ id: vinyl, quantity: 20 }, { id: ink, quantity: 5 }] });
    expect(run.body.data.done).toHaveLength(1);
    expect(run.body.data.failed[0].error).toMatch(/no supplier/);
    const po = await prisma.purchaseOrder.findFirstOrThrow({ include: { items: true } });
    expect(po).toMatchObject({ status: 'DRAFT', supplierId, totalAmount: 4000 });
    expect(po.items[0]).toMatchObject({ inventoryItemId: vinyl, quantityOrdered: 20, unitPrice: 200 });
    // On order now, so not suggested again.
    expect((await api.get('/api/actions').set(auth)).body.data.reorder.items.map((i: { id: string }) => i.id)).toEqual([ink]);
  });

  it('is for admins only', async () => {
    await api.post('/api/auth/users').set(auth).send({ name: 'Staff Two', email: 'staff2@test.local', password: 'password123', role: 'STAFF' });
    const t = (await api.post('/api/auth/login').send({ email: 'staff2@test.local', password: 'password123' })).body.token;
    expect((await api.get('/api/actions').set('Authorization', `Bearer ${t}`)).status).toBe(403);
  });
});

describe("owners' monthly summary", () => {
  it('previews last month in plain numbers', async () => {
    const d = (await api.get('/api/actions/digest/preview').set(auth)).body.data;
    expect(d.text).toMatch(/Net profit:/);
    expect(d.text).toMatch(/GST to pay in cash:/);
    expect(d.subject).toMatch(/your \d{4}-\d{2} summary/);
  });

  it('emails every active admin once a month, only when switched on', async () => {
    expect((await runOwnerDigest()).skipped).toMatch(/switched off/);
    await api.put('/api/settings').set(auth).send({ ownerDigestEnabled: true });
    const before = smtp.messages.length;
    const r = await runOwnerDigest();
    expect(r.sent).toEqual(['owner@test.local']);
    expect(smtp.messages.length).toBe(before + 1);
    expect((await runOwnerDigest()).skipped).toMatch(/Already sent/);
  });
});
