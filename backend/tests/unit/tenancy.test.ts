import { describe, expect, it } from 'vitest';
import { migrationNames, splitStatements } from '../../src/lib/migrator';
import { accountState, checkSlug, schemaFor } from '../../src/services/platform.service';
import type { Tenant } from '../../src/lib/tenancy';

const tenant = (p: Partial<Tenant>): Tenant => ({
  id: 'x', slug: 'acme', name: 'Acme', schemaName: 't_acme', customDomain: null, plan: 'TRIAL', status: 'ACTIVE',
  trialEndsAt: null, paidUntil: null, ownerEmail: null, createdAt: new Date(), ...p,
});
const NOW = new Date('2026-10-22T10:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

describe('tenant schema migrations', () => {
  it('splits generated DDL into statements, ignoring comments', () => {
    const sql = '-- AlterTable\nALTER TABLE "A" ADD COLUMN "b" TEXT;\n\n-- CreateIndex\nCREATE INDEX "i" ON "A"("b");\n';
    expect(splitStatements(sql)).toEqual(['ALTER TABLE "A" ADD COLUMN "b" TEXT', 'CREATE INDEX "i" ON "A"("b")']);
  });

  it('finds every migration in order', () => {
    const names = migrationNames();
    expect(names[0]).toMatch(/_init$/);
    expect([...names].sort()).toEqual(names);
  });
});

describe('business addresses', () => {
  it('maps addresses to schema names and refuses bad ones', () => {
    expect(schemaFor('stix-n-vibes')).toBe('t_stix_n_vibes');
    expect(() => checkSlug('ab')).toThrow(/3–31/);
    expect(() => checkSlug('1shop')).toThrow();
    expect(() => checkSlug('www')).toThrow(/reserved/);
    expect(() => checkSlug('my-shop')).not.toThrow();
  });
});

describe('account state', () => {
  it('is fine during a trial and read-only after it', () => {
    expect(accountState(tenant({ trialEndsAt: days(3) }), NOW).state).toBe('ok');
    expect(accountState(tenant({ trialEndsAt: days(-1) }), NOW)).toMatchObject({ state: 'expired', message: expect.stringMatching(/free trial has ended/) });
  });

  it('counts payment during a trial, and paid plans expire when unpaid', () => {
    expect(accountState(tenant({ trialEndsAt: days(-1), paidUntil: days(20) }), NOW).state).toBe('ok');
    expect(accountState(tenant({ plan: 'GROWTH', paidUntil: days(-2) }), NOW).state).toBe('expired');
    expect(accountState(tenant({ plan: 'GROWTH', paidUntil: null }), NOW).state).toBe('ok');
  });

  it('is read-only while suspended, whatever the plan', () => {
    expect(accountState(tenant({ plan: 'BUSINESS', status: 'SUSPENDED' }), NOW).state).toBe('suspended');
  });
});
