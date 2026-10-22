import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, prisma, resetDb, setupOwner } from './helpers';
import { startFakeSmtp } from './fake-smtp';
import { config } from '../src/lib/config';
import { runReminders } from '../src/services/reminder.service';
import { listBackups, parseBackup, restoreData, exportData } from '../src/services/backup.service';
import { tick } from '../src/services/scheduler';

let auth: Record<string, string>;
let smtp: Awaited<ReturnType<typeof startFakeSmtp>>;
const inv: Record<string, string> = {};
const DAY = 86_400_000;
const isoDay = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inwoice-backups-'));

beforeAll(async () => {
  await resetDb();
  auth = await setupOwner();
  smtp = await startFakeSmtp();
  await api
    .put('/api/settings')
    .set(auth)
    .send({ state: 'Goa', upiId: 'shop@upi', smtpHost: '127.0.0.1', smtpPort: String(smtp.port), smtpUsername: 'u', smtpPassword: 'p', smtpFrom: 'shop@test.local' });
  const withEmail = (await api.post('/api/customers').set(auth).send({ name: 'Asha', email: 'asha@test.local', state: 'Goa', phone: '919800000009' })).body.data.id;
  const noEmail = (await api.post('/api/customers').set(auth).send({ name: 'No Mail', state: 'Goa' })).body.data.id;
  const make = async (customerId: string, dueOffset: number) =>
    (
      await api
        .post('/api/invoices')
        .set(auth)
        .send({ customerId, issue: true, date: isoDay(dueOffset - 15), dueDate: isoDay(dueOffset), items: [{ type: 'CUSTOM', name: 'Work', unitPrice: 1000, quantity: 1 }] })
    ).body.data.id as string;
  inv.longOverdue = await make(withEmail, -20);
  inv.overdue = await make(withEmail, -4);
  inv.dueTomorrow = await make(withEmail, 1);
  inv.later = await make(withEmail, 5);
  inv.noEmail = await make(noEmail, -10);
  inv.paid = await make(withEmail, -10);
  await api.post(`/api/invoices/${inv.paid}/payments`).set(auth).send({ amount: 1180 });
});

afterAll(async () => {
  config.backupDir = '';
  await smtp.close();
  fs.rmSync(backupDir, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe('payment reminder settings', () => {
  it('validates and normalises reminder days', async () => {
    expect((await api.put('/api/settings').set(auth).send({ reminderDays: 'soon' })).status).toBe(400);
    expect((await api.put('/api/settings').set(auth).send({ reminderDays: '400' })).status).toBe(400);
    const ok = await api.put('/api/settings').set(auth).send({ reminderDays: ' 7, -1 ,3,15,3' });
    expect(ok.body.data.reminderDays).toBe('-1,3,7,15');
  });
});

describe('automatic reminders', () => {
  it('does nothing while switched off', async () => {
    const r = await runReminders();
    expect(r.skipped).toMatch(/switched off/);
    expect(smtp.messages).toHaveLength(0);
  });

  it('previews exactly the invoices that are due a reminder', async () => {
    const res = await api.get('/api/settings/reminders/preview').set(auth);
    const ids = res.body.data.due.map((d: { id: string }) => d.id).sort();
    expect(ids).toEqual([inv.longOverdue, inv.overdue, inv.dueTomorrow].sort());
    const long = res.body.data.due.find((d: { id: string }) => d.id === inv.longOverdue);
    expect(long).toMatchObject({ daysFromDue: 20, step: 4, balance: 1180 }); // all four steps passed: one email, then done
  });

  it('emails reminders with the invoice attached, once per day', async () => {
    await api.put('/api/settings').set(auth).send({ remindersEnabled: true });
    const run = await api.post('/api/settings/reminders/run').set(auth);
    expect(run.body.data.sent).toHaveLength(3);
    expect(run.body.data.failed).toEqual([]);
    expect(smtp.messages).toHaveLength(3);
    const all = smtp.messages.map((m) => m.data).join('\n');
    // Subjects contain ₹, so they are MIME-encoded on the wire; the email log keeps them readable.
    const subjects = (await prisma.emailLog.findMany({ where: { referenceType: 'INVOICE_REMINDER' } })).map((l) => l.subject);
    expect(subjects.filter((s) => s.startsWith('Payment reminder: invoice'))).toHaveLength(2);
    expect(subjects.filter((s) => s.startsWith('Upcoming payment: invoice'))).toHaveLength(1);
    expect(all).toMatch(/application\/pdf/);
    expect(all).toMatch(/shop@upi/);
    expect(smtp.messages.every((m) => m.to.includes('asha@test.local'))).toBe(true);

    // Running again the same day sends nothing new.
    expect((await runReminders()).sent).toEqual([]);
    expect(await prisma.emailLog.count({ where: { referenceType: 'INVOICE_REMINDER', status: 'SENT' } })).toBe(3);
  });

  it('walks each invoice through the remaining steps on later days', async () => {
    const r = await runReminders(new Date(Date.now() + 5 * DAY));
    // overdue (now 9 days: step 7), dueTomorrow (now 4 days: step 3), later (due day: step -1); longOverdue is finished.
    expect(r.sent.length).toBe(3);
    const long = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.longOverdue } });
    expect(long.remindersSent).toBe(4);
  });

  it('sends a manual reminder on request, but not for paid invoices', async () => {
    const before = smtp.messages.length;
    const res = await api.post(`/api/invoices/${inv.overdue}/remind`).set(auth).send({ to: 'accounts@asha.test' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/accounts@asha.test/);
    expect(smtp.messages).toHaveLength(before + 1);
    expect((await api.post(`/api/invoices/${inv.paid}/remind`).set(auth)).status).toBe(400);
    expect((await api.post(`/api/invoices/${inv.noEmail}/remind`).set(auth)).status).toBe(400);
  });

  it('WhatsApp messages for overdue invoices read as a reminder', async () => {
    const res = await api.get(`/api/invoices/${inv.overdue}/whatsapp`).set(auth);
    expect(res.body.data.message).toMatch(/friendly reminder/i);
    const notDue = await api.get(`/api/invoices/${inv.later}/whatsapp`).set(auth);
    expect(notDue.body.data.message).not.toMatch(/reminder/i);
  });
});

describe('backups', () => {
  it('reports disk backups as off when BACKUP_DIR is off', async () => {
    const res = await api.get('/api/backups').set(auth);
    expect(res.body.data.enabled).toBe(false);
    expect((await api.post('/api/backups').set(auth)).status).toBe(400);
  });

  it('writes, lists and downloads backup files', async () => {
    config.backupDir = backupDir;
    const made = await api.post('/api/backups').set(auth);
    expect(made.status).toBe(201);
    expect(made.body.data.name).toMatch(/^inwoice-\d{8}-\d{6}-manual\.json\.gz$/);
    const list = await api.get('/api/backups').set(auth);
    expect(list.body.data.files.map((f: { name: string }) => f.name)).toContain(made.body.data.name);

    const file = await api
      .get(`/api/backups/files/${made.body.data.name}`)
      .set(auth)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    const backup = parseBackup(file.body as Buffer);
    expect(backup.tables.Invoice).toHaveLength(6);
    const newest = fs.readdirSync('prisma/migrations').filter((d) => /^\d{14}_/.test(d)).sort().pop();
    expect(backup.migration).toBe(newest);
  });

  it('refuses paths outside the backup folder', async () => {
    expect((await api.get('/api/backups/files/..%2F..%2Fpackage.json').set(auth)).status).toBe(404);
    expect((await api.get('/api/backups/files/inwoice-20990101-000000.json.gz').set(auth)).status).toBe(404);
  });

  it('the scheduler writes one automatic backup a day and prunes old ones', async () => {
    fs.writeFileSync(path.join(backupDir, 'inwoice-20000101-000000.json.gz'), zlib.gzipSync('{}'));
    const keep = config.backupKeep;
    config.backupKeep = 1;
    await tick();
    await tick();
    config.backupKeep = keep;
    const autos = listBackups().filter((b) => !b.name.includes('manual'));
    expect(autos).toHaveLength(1);
    expect(autos[0]!.name).not.toBe('inwoice-20000101-000000.json.gz');
  });

  it('restores a backup exactly, replacing newer changes', async () => {
    const snapshot = await exportData();
    const invoicesBefore = await prisma.invoice.count();
    const paymentsBefore = await prisma.payment.count();
    await api.post('/api/customers').set(auth).send({ name: 'Added after backup' });
    await api.put('/api/settings').set(auth).send({ businessName: 'Renamed Biz' });

    // Refused without confirmation, and refused into a non-empty database without replace.
    const gz = zlib.gzipSync(JSON.stringify(snapshot));
    expect((await api.post('/api/backups/restore').set(auth).set('Content-Type', 'application/octet-stream').send(gz)).status).toBe(400);
    await expect(restoreData(snapshot)).rejects.toThrow(/already has data/);

    const res = await api.post('/api/backups/restore?confirm=REPLACE').set(auth).set('Content-Type', 'application/octet-stream').send(gz);
    expect(res.status).toBe(200);
    expect(res.body.data.safetyBackup).toMatch(/-manual\.json\.gz$/);

    expect(await prisma.customer.count({ where: { name: 'Added after backup' } })).toBe(0);
    expect(await prisma.invoice.count()).toBe(invoicesBefore);
    expect(await prisma.payment.count()).toBe(paymentsBefore);
    expect((await prisma.businessSettings.findFirstOrThrow()).businessName).toBe('Test Biz');
    // Dates, numbers and booleans survive the round trip.
    const restored = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.paid }, include: { payments: true } });
    expect(restored).toMatchObject({ status: 'PAID', amountPaid: 1180, stockDeducted: true });
    expect(restored.dueDate?.toISOString().slice(0, 10)).toBe(isoDay(-10));
    // The same login still works after the restore.
    expect((await api.get('/api/auth/me').set(auth)).status).toBe(200);
  });

  it('rejects files that are not InWoice backups', async () => {
    const res = await api.post('/api/backups/restore?confirm=REPLACE').set(auth).set('Content-Type', 'application/octet-stream').send(Buffer.from('hello'));
    expect(res.status).toBe(400);
  });
});
