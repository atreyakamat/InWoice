import fs from 'fs';
import path from 'path';
import { baseClient } from './prisma';

/**
 * Applies the Prisma migration SQL files (backend/prisma/migrations) to one tenant schema.
 * The public schema keeps using `prisma migrate deploy`; tenant schemas track what they
 * have applied in their own `_inwoice_migrations` table, so both stay on the same files.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, '../../prisma/migrations');

export const SCHEMA_NAME = /^t_[a-z][a-z0-9_]{1,40}$/;

export function migrationNames() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((d) => /^\d{14}_/.test(d) && fs.existsSync(path.join(MIGRATIONS_DIR, d, 'migration.sql')))
    .sort();
}

/** Split Prisma's generated DDL into single statements (it has no functions or DO blocks). */
export function splitStatements(sql: string) {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function migrateSchema(schema: string) {
  if (!SCHEMA_NAME.test(schema)) throw new Error(`Invalid tenant schema name: ${schema}`);
  await baseClient.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await baseClient.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "${schema}"."_inwoice_migrations" (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await baseClient.$queryRawUnsafe<{ name: string }[]>(`SELECT name FROM "${schema}"."_inwoice_migrations"`)).map((r) => r.name));
  const applied: string[] = [];
  for (const name of migrationNames()) {
    if (done.has(name)) continue;
    const statements = splitStatements(fs.readFileSync(path.join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8'));
    await baseClient.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL search_path TO "${schema}"`);
        for (const st of statements) await tx.$executeRawUnsafe(st);
        await tx.$executeRawUnsafe(`INSERT INTO "${schema}"."_inwoice_migrations" (name) VALUES ($1)`, name);
      },
      { timeout: 120_000, maxWait: 30_000 },
    );
    applied.push(name);
  }
  return applied;
}
