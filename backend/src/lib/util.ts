import type { Request, Response } from 'express';
import { z } from 'zod';
import { gstinError } from './gst';

/** Round to 2 decimal places (money). */
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Express 5 types params as string | string[]; routes only ever use single values. */
export const param = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? '' : v ?? '');

/** Address this request came in on (honours X-Forwarded-* behind a proxy). */
export const requestOrigin = (req: Request) => `${req.protocol}://${req.get('host')}`;

/** Query string helper. */
export const qs = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);

export const pagination = (query: Record<string, unknown>) => {
  const take = Math.min(Math.max(parseInt(String(query.limit ?? '100'), 10) || 100, 1), 500);
  const skip = Math.max(parseInt(String(query.offset ?? '0'), 10) || 0, 0);
  return { take, skip };
};

// Common zod helpers -------------------------------------------------------

/**
 * Optional string for forms: "" means "clear this field" (null), while an absent
 * field stays undefined so partial updates never wipe data they did not send.
 */
export const optStr = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v === '' ? null : v));

export const optEmail = z
  .union([z.literal(''), z.string().trim().email()])
  .optional()
  .nullable()
  .transform((v) => (v === undefined ? undefined : v ? v : null));

export const optDate = z
  .union([z.literal(''), z.coerce.date()])
  .optional()
  .nullable()
  .transform((v) => (v === undefined ? undefined : v instanceof Date ? v : null));

export const money = z.coerce.number().min(0);

/** Optional GSTIN: uppercased, structure + checksum validated; "" clears it. */
export const optGstin = optStr.transform((v, ctx) => {
  if (!v) return v;
  const g = v.replace(/\s+/g, '').toUpperCase();
  const err = gstinError(g);
  if (err) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: err });
    return z.NEVER;
  }
  return g;
});

/** Remove keys whose value is undefined so partial updates leave fields untouched. */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = v instanceof Date ? v.toISOString() : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(','), ...rows.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\n');
}

/** Send CSV as a download; the BOM makes Excel open UTF-8 (₹, names) correctly. */
export function sendCsv(res: Response, name: string, csv: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(`﻿${csv}`);
}
