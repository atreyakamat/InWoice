import bcrypt from 'bcryptjs';
import prisma, { baseClient } from '../lib/prisma';
import { config } from '../lib/config';
import { badRequest, conflict, HttpError, notFound } from '../lib/errors';
import { currentTenant, runAsTenant, type Tenant } from '../lib/tenancy';
import { migrateSchema } from '../lib/migrator';
import { getSettings } from './settings.service';

/**
 * The platform ("control plane") for multi-business mode: the list of businesses, their
 * plans and status, and the people who run the platform. It lives in its own `control`
 * schema; each business's data lives in its own `t_<slug>` schema (or `public` for an
 * existing single-business install that was adopted as a tenant).
 */

export const PLANS = {
  TRIAL: { label: 'Free trial', users: 3, invoicesPerMonth: 100 },
  STARTER: { label: 'Starter', users: 2, invoicesPerMonth: 300 },
  GROWTH: { label: 'Growth', users: 10, invoicesPerMonth: 2_000 },
  BUSINESS: { label: 'Business', users: 50, invoicesPerMonth: null as number | null },
} as const;
export type Plan = keyof typeof PLANS;
export const PLAN_KEYS = Object.keys(PLANS) as Plan[];

export const SLUG = /^[a-z][a-z0-9-]{2,30}$/;
const RESERVED = new Set(['www', 'app', 'api', 'admin', 'platform', 'mail', 'smtp', 'static', 'assets', 'billing', 'support', 'help', 'status', 'portal', 'login', 'signup']);

export const schemaFor = (slug: string) => `t_${slug.replace(/-/g, '_')}`;

/** PostgreSQL unique_violation (23505), as Prisma reports it for raw queries. */
const isUniqueViolation = (err: unknown) => {
  const e = err as { code?: string; meta?: { code?: string }; message?: string };
  return e?.meta?.code === '23505' || /23505|unique constraint|duplicate key/i.test(e?.message ?? '');
};

let ready: Promise<void> | null = null;

/** Create the control schema and tables if needed (idempotent, runs once per process). */
export function ensureControl() {
  ready ??= (async () => {
    await baseClient.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS control`);
    await baseClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS control.tenant (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        slug text NOT NULL UNIQUE,
        name text NOT NULL,
        schema_name text NOT NULL UNIQUE,
        custom_domain text UNIQUE,
        plan text NOT NULL DEFAULT 'TRIAL',
        status text NOT NULL DEFAULT 'ACTIVE',
        trial_ends_at timestamptz,
        paid_until timestamptz,
        owner_email text,
        notes text,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
    await baseClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS control.platform_admin (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )`);
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  schema_name: string;
  custom_domain: string | null;
  plan: string;
  status: string;
  trial_ends_at: Date | null;
  paid_until: Date | null;
  owner_email: string | null;
  notes: string | null;
  created_at: Date;
}

const toTenant = (r: TenantRow): Tenant & { notes: string | null } => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  schemaName: r.schema_name,
  customDomain: r.custom_domain,
  plan: r.plan,
  status: r.status,
  trialEndsAt: r.trial_ends_at,
  paidUntil: r.paid_until,
  ownerEmail: r.owner_email,
  notes: r.notes,
  createdAt: r.created_at,
});

// Tenant lookups happen on every request: cache them briefly.
const CACHE_MS = 10_000;
const byKey = new Map<string, { at: number; tenant: Tenant | null }>();
export const forgetTenants = () => byKey.clear();

async function cached(key: string, load: () => Promise<TenantRow[]>) {
  const hit = byKey.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.tenant;
  await ensureControl();
  const rows = await load();
  const tenant = rows[0] ? toTenant(rows[0]) : null;
  byKey.set(key, { at: Date.now(), tenant });
  return tenant;
}

export const tenantBySlug = (slug: string) => cached(`s:${slug}`, () => baseClient.$queryRaw<TenantRow[]>`SELECT * FROM control.tenant WHERE slug = ${slug}`);
export const tenantByDomain = (host: string) => cached(`d:${host}`, () => baseClient.$queryRaw<TenantRow[]>`SELECT * FROM control.tenant WHERE custom_domain = ${host}`);

export async function listTenants() {
  await ensureControl();
  return (await baseClient.$queryRaw<TenantRow[]>`SELECT * FROM control.tenant ORDER BY created_at DESC`).map(toTenant);
}

/** Which business a host name belongs to. `root` = the platform's own site. */
export async function resolveHost(hostname: string): Promise<{ root: true } | { tenant: Tenant | null }> {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  const base = config.baseDomain;
  if (base && (host === base || host === `www.${base}`)) return { root: true };
  if (base && host.endsWith(`.${base}`)) {
    const slug = host.slice(0, -base.length - 1);
    return { tenant: slug.includes('.') ? null : await tenantBySlug(slug) };
  }
  if (!base && (host === 'localhost' || host === '127.0.0.1')) return { root: true };
  return { tenant: await tenantByDomain(host) };
}

// --- Plans, trials and read-only mode -------------------------------------------------

/** "ok", or why the business is read-only right now. */
export function accountState(t: Tenant, now = new Date()): { state: 'ok' | 'suspended' | 'expired'; message?: string } {
  const contact = config.supportEmail ? ` Contact ${config.supportEmail}.` : '';
  if (t.status === 'SUSPENDED') return { state: 'suspended', message: `This account is suspended, so it is read-only. You can still view and export your data.${contact}` };
  const paidUntil = t.paidUntil ? t.paidUntil.getTime() : 0;
  const trialEnd = t.plan === 'TRIAL' && t.trialEndsAt ? t.trialEndsAt.getTime() : 0;
  if (t.plan === 'TRIAL' ? Math.max(trialEnd, paidUntil) < now.getTime() : paidUntil && paidUntil < now.getTime()) {
    return { state: 'expired', message: `Your ${t.plan === 'TRIAL' ? 'free trial' : 'plan'} has ended, so the account is read-only until it is renewed.${contact}` };
  }
  return { state: 'ok' };
}

/** Refuse to go over the plan's limits (no-op for single-business installs). */
export async function assertWithinPlan(kind: 'users' | 'invoices') {
  const t = currentTenant();
  if (!t) return;
  const plan = PLANS[t.plan as Plan] ?? PLANS.TRIAL;
  if (kind === 'users') {
    const n = await prisma.user.count({ where: { isActive: true } });
    if (n >= plan.users) throw new HttpError(402, `Your ${plan.label} plan allows ${plan.users} active users. Upgrade to add more.`);
  } else if (plan.invoicesPerMonth !== null) {
    const now = new Date();
    const n = await prisma.invoice.count({ where: { createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } } });
    if (n >= plan.invoicesPerMonth) throw new HttpError(402, `Your ${plan.label} plan allows ${plan.invoicesPerMonth} invoices a month. Upgrade to create more.`);
  }
}

// --- Creating and managing businesses -------------------------------------------------

export interface NewTenant {
  slug: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  plan?: Plan;
}

export function checkSlug(slug: string) {
  if (!SLUG.test(slug)) throw badRequest('The address must be 3–31 characters: lowercase letters, numbers and dashes, starting with a letter');
  if (RESERVED.has(slug)) throw badRequest('That address is reserved. Please choose another.');
}

/** Create a business: its schema, all tables, its settings and its owner account. */
export async function createTenant(input: NewTenant) {
  await ensureControl();
  const slug = input.slug.trim().toLowerCase();
  checkSlug(slug);
  const schema = schemaFor(slug);
  const trialEndsAt = input.plan && input.plan !== 'TRIAL' ? null : new Date(Date.now() + config.trialDays * 86_400_000);
  let row: TenantRow;
  try {
    [row] = (await baseClient.$queryRaw<TenantRow[]>`
      INSERT INTO control.tenant (slug, name, schema_name, plan, trial_ends_at, owner_email)
      VALUES (${slug}, ${input.name.trim()}, ${schema}, ${input.plan ?? 'TRIAL'}, ${trialEndsAt}, ${input.ownerEmail.trim().toLowerCase()})
      RETURNING *`) as [TenantRow];
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict('That address is already taken');
    throw err;
  }
  const tenant = toTenant(row);
  try {
    await migrateSchema(schema);
    await runAsTenant(tenant, async () => {
      const s = await getSettings();
      await prisma.businessSettings.update({ where: { id: s.id }, data: { businessName: tenant.name } });
      await prisma.user.create({
        data: { name: input.ownerName.trim(), email: input.ownerEmail.trim().toLowerCase(), password: await bcrypt.hash(input.ownerPassword, 10), role: 'ADMIN' },
      });
    });
  } catch (err) {
    // Roll back a half-made business so the address can be used again.
    await baseClient.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
    await baseClient.$executeRaw`DELETE FROM control.tenant WHERE id = ${tenant.id}::uuid`.catch(() => undefined);
    throw err;
  }
  forgetTenants();
  return tenant;
}

/**
 * Register an existing single-business install (public schema) as a tenant, so an
 * existing customer keeps their data when the server switches to multi-business mode.
 */
export async function adoptPublicSchema(slug: string, name: string) {
  await ensureControl();
  checkSlug(slug);
  if ((await baseClient.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM control.tenant WHERE schema_name = 'public'`)[0]!.n > 0n) {
    throw conflict('The existing data has already been adopted as a business');
  }
  const [row] = await baseClient.$queryRaw<TenantRow[]>`
    INSERT INTO control.tenant (slug, name, schema_name, plan) VALUES (${slug}, ${name}, 'public', 'BUSINESS') RETURNING *`;
  forgetTenants();
  return toTenant(row!);
}

export async function updateTenant(id: string, patch: { name?: string; plan?: Plan; status?: 'ACTIVE' | 'SUSPENDED'; trialEndsAt?: Date | null; paidUntil?: Date | null; customDomain?: string | null; notes?: string | null }) {
  await ensureControl();
  const [existing] = await baseClient.$queryRaw<TenantRow[]>`SELECT * FROM control.tenant WHERE id = ${id}::uuid`;
  if (!existing) throw notFound('Business');
  const next = {
    name: patch.name ?? existing.name,
    plan: patch.plan ?? existing.plan,
    status: patch.status ?? existing.status,
    trial_ends_at: patch.trialEndsAt !== undefined ? patch.trialEndsAt : existing.trial_ends_at,
    paid_until: patch.paidUntil !== undefined ? patch.paidUntil : existing.paid_until,
    custom_domain: patch.customDomain !== undefined ? patch.customDomain?.toLowerCase() || null : existing.custom_domain,
    notes: patch.notes !== undefined ? patch.notes : existing.notes,
  };
  try {
    const [row] = await baseClient.$queryRaw<TenantRow[]>`
      UPDATE control.tenant SET name = ${next.name}, plan = ${next.plan}, status = ${next.status}, trial_ends_at = ${next.trial_ends_at},
        paid_until = ${next.paid_until}, custom_domain = ${next.custom_domain}, notes = ${next.notes}
      WHERE id = ${id}::uuid RETURNING *`;
    forgetTenants();
    return toTenant(row!);
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict('That domain is already used by another business');
    throw err;
  }
}

/** Usage numbers for the platform admin's list. */
export async function tenantUsage(t: Tenant) {
  return runAsTenant(t, async () => {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [users, invoicesThisMonth, customers, lastActivity] = await Promise.all([
      prisma.user.count({ where: { isActive: true } }),
      prisma.invoice.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.customer.count(),
      prisma.auditLog.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    ]);
    return { users, invoicesThisMonth, customers, lastActivityAt: lastActivity?.createdAt ?? null };
  });
}

/** Apply new migrations to every business (run at start-up). */
export async function migrateAllTenants() {
  const results: { slug: string; applied: string[]; error?: string }[] = [];
  for (const t of await listTenants()) {
    if (t.schemaName === 'public') continue; // managed by `prisma migrate deploy`
    try {
      results.push({ slug: t.slug, applied: await migrateSchema(t.schemaName) });
    } catch (err) {
      results.push({ slug: t.slug, applied: [], error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

// --- Platform admins ------------------------------------------------------------------

export async function createPlatformAdmin(email: string, password: string) {
  await ensureControl();
  if (password.length < 10) throw badRequest('Use at least 10 characters for a platform admin password');
  const hash = await bcrypt.hash(password, 10);
  await baseClient.$executeRaw`
    INSERT INTO control.platform_admin (email, password_hash) VALUES (${email.trim().toLowerCase()}, ${hash})
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`;
}

export async function checkPlatformAdmin(email: string, password: string) {
  await ensureControl();
  const [row] = await baseClient.$queryRaw<{ id: string; email: string; password_hash: string }[]>`
    SELECT id, email, password_hash FROM control.platform_admin WHERE email = ${email.trim().toLowerCase()}`;
  if (!row || !(await bcrypt.compare(password, row.password_hash))) return null;
  return { id: row.id, email: row.email };
}
