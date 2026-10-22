import { backedUpToday, backupDir, offsiteConfig, uploadOffsite, writeBackupFile } from './backup.service';
import { pruneAuditLog } from './audit.service';
import { runReminders } from './reminder.service';
import { runRecurringInvoices } from './recurring.service';
import { runMonthlyStatements } from './documents.service';
import { config } from '../lib/config';
import { runAsTenant } from '../lib/tenancy';
import { accountState, listTenants } from './platform.service';
import { takeStockSnapshot } from './accounts.service';
import { runOwnerDigest } from './digest.service';
import { reportError } from '../lib/alerts';
import prisma from '../lib/prisma';

/**
 * Lightweight in-process jobs (no Redis/queue needed). A timer is enough: in
 * multi-business mode the jobs run for each business in turn, inside its own schema.
 * Every job is idempotent: recurring invoices claim each period before creating it,
 * reminders go out at most once per invoice per day, statements once per customer per
 * month, and the backup once per day, so restarts are harmless.
 */

const TICK_MS = 30 * 60 * 1000;
let running = false;

const why = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** One pass of every job for the current business. `active` = allowed to email and invoice. */
async function runJobs(label: string, active: boolean) {
  const log = (tag: string, msg: string) => console.log(`[${tag}] ${label}${msg}`);
  const fail = (tag: string, err: unknown) => {
    console.error(`[${tag}] ${label}failed:`, why(err));
    void reportError(`scheduled ${tag}`, err);
  };

  if (backupDir() && !backedUpToday()) {
    try {
      const b = await writeBackupFile('auto');
      log('backup', `wrote ${b.name} (${Math.round(b.size / 1024)} KB)`);
      if (await offsiteConfig()) {
        try {
          await uploadOffsite(b.name);
          log('backup', `copied ${b.name} off-site`);
        } catch (err) {
          fail('backup off-site', err);
        }
      }
      await pruneAuditLog();
    } catch (err) {
      fail('backup', err);
    }
  }
  // Stock value once a day, so the P&L can show the change in stock for any period.
  try {
    const today = new Date();
    if (!(await prisma.stockSnapshot.count({ where: { date: new Date(today.getFullYear(), today.getMonth(), today.getDate()) } }))) await takeStockSnapshot(today);
  } catch (err) {
    fail('stock value', err);
  }
  // Read-only (suspended or expired) businesses get backups only: no emails or new invoices.
  if (!active) return;
  try {
    const r = await runRecurringInvoices();
    if (r.created.length || r.failed.length) {
      log('recurring', `created ${r.created.join(', ') || 'none'}${r.failed.length ? `; failed: ${r.failed.map((f) => `${f.schedule} (${f.error})`).join('; ')}` : ''}`);
    }
  } catch (err) {
    fail('recurring', err);
  }
  try {
    const r = await runReminders();
    if (r.sent.length || r.failed.length) {
      log('reminders', `sent ${r.sent.length}${r.failed.length ? `, failed ${r.failed.length}: ${r.failed.map((f) => `${f.invoiceNumber} (${f.error})`).join('; ')}` : ''}`);
    }
  } catch (err) {
    fail('reminders', err);
  }
  try {
    const r = await runMonthlyStatements();
    if (r.sent.length || r.failed.length) log('statements', `sent ${r.sent.length}${r.failed.length ? `, failed ${r.failed.length}` : ''}`);
  } catch (err) {
    fail('statements', err);
  }
  try {
    const r = await runOwnerDigest();
    if (r.sent.length) log('digest', `monthly summary sent to ${r.sent.length} owner(s)`);
  } catch (err) {
    fail('digest', err);
  }
}

export async function tick() {
  if (running) return;
  running = true;
  try {
    if (!config.multiTenant) {
      await runJobs('', true);
      return;
    }
    for (const t of await listTenants()) {
      await runAsTenant(t, () => runJobs(`${t.slug}: `, accountState(t).state === 'ok')).catch((err) => {
        console.error(`[scheduler] ${t.slug} failed:`, why(err));
        void reportError(`scheduler (${t.slug})`, err);
      });
    }
  } finally {
    running = false;
  }
}

export function startScheduler() {
  // First run shortly after start-up (not during it), then every 30 minutes.
  const first = setTimeout(() => void tick(), 60 * 1000);
  const timer = setInterval(() => void tick(), TICK_MS);
  first.unref();
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
