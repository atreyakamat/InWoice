import type { NextFunction, Request, Response } from 'express';
import prisma from '../lib/prisma';

/**
 * Audit trail: who changed what, and when. Every successful API call that changes data
 * is recorded automatically (method, path, the user, and a readable reference such as
 * the invoice number). Request bodies are never stored, so passwords and keys can't leak
 * into the log. Logins and failed logins are recorded explicitly.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LABEL_KEYS = ['invoiceNumber', 'quoteNumber', 'billNumber', 'creditNoteNumber', 'poNumber', 'batchNumber', 'name', 'email', 'description'] as const;

const VERBS: Record<string, string> = {
  payments: 'PAYMENT',
  send: 'EMAIL',
  remind: 'REMINDER',
  'credit-notes': 'CREDIT_NOTE',
  receive: 'RECEIVE',
  status: 'STATUS',
  run: 'RUN',
  portal: 'PORTAL',
  regenerate: 'PORTAL_RESET',
};

const verb = (segment: string) => VERBS[segment] ?? segment.toUpperCase().replace(/-/g, '_');

/** "/api/invoices/<id>/cancel" → { entity: invoices, entityId: <id>, action: CANCEL }. */
export function describeRequest(method: string, path: string) {
  const parts = path.replace(/^\/api\//, '').split('?')[0]!.split('/').filter(Boolean);
  const entity = parts[0] ?? 'unknown';
  const entityId = parts.find((p) => UUID.test(p)) ?? null;
  const last = parts[parts.length - 1] ?? '';
  const sub = parts.slice(1).find((p) => !UUID.test(p)); // e.g. "payments" in /invoices/:id/payments/:pid
  let action: string;
  if (method === 'DELETE') action = sub ? `${verb(sub)}_DELETE` : 'DELETE';
  else if (parts.length === 1) action = method === 'POST' ? 'CREATE' : 'UPDATE';
  else if (UUID.test(last)) action = 'UPDATE';
  else action = verb(last);
  return { entity, entityId, action };
}

function labelFrom(body: unknown): string | null {
  const data = (body as { data?: Record<string, unknown> } | undefined)?.data;
  if (!data || typeof data !== 'object') return null;
  for (const k of LABEL_KEYS) {
    const v = (data as Record<string, unknown>)[k];
    if (typeof v === 'string' && v.trim()) return v.slice(0, 120);
  }
  return null;
}

export async function audit(entry: { userId?: string | null; userName?: string | null; action: string; entity: string; entityId?: string | null; label?: string | null; method?: string; path?: string; ip?: string | null }) {
  try {
    await prisma.auditLog.create({ data: { ...entry, userId: entry.userId ?? null } });
  } catch {
    // The audit log must never break the action itself (e.g. a user deleted meanwhile).
  }
}

const SKIP = [/^\/api\/auth\/(login|setup|forgot-password|reset-password)/, /^\/api\/executive\/ask/];

/** Records successful changes. Mount before the API routes. */
export function auditTrail(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const path = req.originalUrl.split('?')[0]!;
  if (SKIP.some((r) => r.test(path))) return next();

  let body: unknown;
  const json = res.json.bind(res);
  res.json = (b: unknown) => {
    body = b;
    return json(b);
  };
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const portal = path.startsWith('/api/portal/');
    if (!req.user && !portal) return;
    const d = describeRequest(req.method, portal ? path.replace(/^\/api\/portal\/[^/]+/, '/api/portal') : path);
    const data = (body as { data?: { id?: unknown } } | undefined)?.data;
    void audit({
      userId: req.user?.id ?? null,
      userName: req.user?.name ?? (portal ? 'Customer (portal)' : null),
      action: d.action,
      entity: portal ? 'portal' : d.entity,
      entityId: d.entityId ?? (typeof data?.id === 'string' ? data.id : null),
      label: labelFrom(body),
      method: req.method,
      // Portal tokens are secrets: never store them in the log.
      path: portal ? path.replace(/^\/api\/portal\/[^/]+/, '/api/portal/…') : path,
      ip: req.ip ?? null,
    });
  });
  next();
}

/** Delete entries older than the retention period (default three years). */
export async function pruneAuditLog(days = Number(process.env.AUDIT_RETENTION_DAYS) || 1095) {
  const { count } = await prisma.auditLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - days * 86_400_000) } } });
  return count;
}
