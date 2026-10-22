import { AsyncLocalStorage } from 'async_hooks';
import { PrismaClient } from '@prisma/client';

/**
 * Multi-business (SaaS) mode: every business ("tenant") has its own PostgreSQL schema
 * with the full set of InWoice tables. A request runs inside an AsyncLocalStorage context
 * that carries its tenant and that tenant's Prisma client, so data can never mix between
 * businesses even in hand-written SQL. Single-business installs never enter a context.
 */

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  schemaName: string;
  customDomain: string | null;
  plan: string;
  status: string; // ACTIVE, SUSPENDED
  trialEndsAt: Date | null;
  paidUntil: Date | null;
  ownerEmail: string | null;
  createdAt: Date;
}

interface Context {
  tenant: Tenant;
  client: PrismaClient;
}

const store = new AsyncLocalStorage<Context>();

export const currentTenant = (): Tenant | null => store.getStore()?.tenant ?? null;
export const tenantClient = (): PrismaClient | null => store.getStore()?.client ?? null;

// --- One Prisma client per tenant schema, kept small for slow servers -------------------

const MAX_CLIENTS = Math.max(Number(process.env.TENANT_CLIENTS) || 20, 2);
const clients = new Map<string, { client: PrismaClient; lastUsed: number; inUse: number }>();

export function schemaUrl(schema: string) {
  const base = process.env.DATABASE_URL ?? '';
  const url = new URL(base);
  url.searchParams.set('schema', schema);
  if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', process.env.TENANT_CONNECTIONS || '3');
  return url.toString();
}

function evictIdle() {
  if (clients.size <= MAX_CLIENTS) return;
  const idle = [...clients.entries()].filter(([, c]) => c.inUse === 0).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  for (const [schema, c] of idle) {
    if (clients.size <= MAX_CLIENTS) break;
    clients.delete(schema);
    void c.client.$disconnect().catch(() => undefined);
  }
}

function acquire(schema: string) {
  let entry = clients.get(schema);
  if (!entry) {
    entry = { client: new PrismaClient({ datasources: { db: { url: schemaUrl(schema) } }, log: ['error'] }), lastUsed: Date.now(), inUse: 0 };
    clients.set(schema, entry);
    evictIdle();
  }
  entry.inUse++;
  entry.lastUsed = Date.now();
  return entry;
}

/** Run `fn` as the given tenant (requests, scheduler jobs, CLI). */
export async function runAsTenant<T>(tenant: Tenant, fn: () => Promise<T>): Promise<T> {
  const entry = acquire(tenant.schemaName);
  try {
    return await store.run({ tenant, client: entry.client }, fn);
  } finally {
    entry.inUse--;
    entry.lastUsed = Date.now();
  }
}

/** Enter a tenant for the rest of an Express request; `done` is called when it finishes. */
export function enterTenant(tenant: Tenant, next: () => void, onFinish: (release: () => void) => void) {
  const entry = acquire(tenant.schemaName);
  let released = false;
  onFinish(() => {
    if (released) return;
    released = true;
    entry.inUse--;
    entry.lastUsed = Date.now();
  });
  store.run({ tenant, client: entry.client }, next);
}

export async function disconnectTenants() {
  await Promise.all([...clients.values()].map((c) => c.client.$disconnect().catch(() => undefined)));
  clients.clear();
}
