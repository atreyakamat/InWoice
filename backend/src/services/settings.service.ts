import type { BusinessSettings } from '@prisma/client';
import prisma from '../lib/prisma';
import { config } from '../lib/config';
import { HttpError } from '../lib/errors';

/** The app is single-business: there is exactly one settings row, created on demand. */
export async function getSettings(): Promise<BusinessSettings> {
  const existing = await prisma.businessSettings.findFirst({ orderBy: { createdAt: 'asc' } });
  if (existing) return existing;
  return prisma.businessSettings.create({ data: { businessName: 'My Business' } });
}

const SECRET_FIELDS = ['smtpPassword', 'aiApiKey', 's3SecretKey', 'shopSyncToken'] as const;

/** Settings safe to send to the browser: secrets are replaced by a "configured" flag. */
export function toPublicSettings(s: BusinessSettings) {
  const out: Record<string, unknown> = { ...s };
  for (const f of SECRET_FIELDS) {
    out[`${f}Set`] = Boolean(s[f]);
    delete out[f];
  }
  return out;
}

/**
 * Base URL for links in emails and messages: Settings › Business, then APP_URL, then the
 * address the current request came in on (if any). Null when none is known.
 */
export async function publicBaseUrl(requestOrigin?: string | null): Promise<string | null> {
  const s = await getSettings();
  const url = (s.appUrl || config.appUrl || requestOrigin || '').trim().replace(/\/+$/, '');
  return /^https?:\/\//.test(url) ? url : null;
}

const fmtDay = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

/**
 * Period lock: refuse to create, change or cancel anything dated on or before
 * Settings › lockedUntil (e.g. a month whose GST return is filed). Dates are whole days in
 * server time.
 */
export async function assertOpenPeriod(dates: (Date | null | undefined)[], what: string) {
  const s = await getSettings();
  if (!s.lockedUntil) return;
  const end = new Date(s.lockedUntil.getFullYear(), s.lockedUntil.getMonth(), s.lockedUntil.getDate() + 1);
  const hit = dates.find((d) => d && d < end);
  if (hit) {
    throw new HttpError(409, `${what} is dated ${fmtDay(hit)}, in a locked period (up to ${fmtDay(s.lockedUntil)}). An admin can change the lock in Settings › Invoicing.`);
  }
}
