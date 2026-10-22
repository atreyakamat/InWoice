import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { config } from '../lib/config';
import { badRequest, notFound } from '../lib/errors';
import { s3Put, type S3Config } from '../lib/s3';
import { getSettings } from './settings.service';
import { currentTenant } from '../lib/tenancy';

/**
 * Portable backups: every table exported to gzipped JSON with plain SQL. No pg_dump
 * needed, so it works the same on Windows, Linux and inside Docker. A restore loads the
 * file into an empty database that has been migrated to the same schema.
 */

const FORMAT = 'inwoice-backup';
const NAME_PATTERN = /^inwoice-\d{8}-\d{6}(-manual)?\.json\.gz$/;

export interface BackupFile {
  format: typeof FORMAT;
  version: 1;
  createdAt: string;
  migration: string | null;
  tables: Record<string, Record<string, unknown>[]>;
}

async function tableNames(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename NOT IN ('_prisma_migrations', '_inwoice_migrations') ORDER BY tablename`;
  return rows.map((r) => r.tablename);
}

/** Newest migration applied to this schema (Prisma's table, or ours for business schemas). */
async function latestMigration(): Promise<string | null> {
  const [{ prismaTable } = { prismaTable: null }] = await prisma.$queryRaw<{ prismaTable: string | null }[]>`SELECT to_regclass('_prisma_migrations')::text AS "prismaTable"`;
  const rows = prismaTable
    ? await prisma.$queryRaw<{ name: string }[]>`
        SELECT migration_name AS name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY migration_name DESC LIMIT 1`
    : await prisma.$queryRaw<{ name: string }[]>`SELECT name FROM "_inwoice_migrations" ORDER BY name DESC LIMIT 1`;
  return rows[0]?.name ?? null;
}

/** Order tables so every table comes after the tables it references (for inserting). */
async function insertOrder(tables: string[]): Promise<string[]> {
  const fks = await prisma.$queryRaw<{ child: string; parent: string }[]>`
    SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent
    FROM pg_constraint c WHERE c.contype = 'f' AND c.connamespace = current_schema()::regnamespace`;
  const strip = (t: string) => t.replace(/^"|"$/g, '');
  const deps = new Map(tables.map((t) => [t, new Set<string>()]));
  for (const fk of fks) {
    const child = strip(fk.child);
    const parent = strip(fk.parent);
    if (child !== parent) deps.get(child)?.add(parent);
  }
  const ordered: string[] = [];
  const visit = (t: string, seen: Set<string>) => {
    if (ordered.includes(t) || seen.has(t)) return;
    seen.add(t);
    for (const p of deps.get(t) ?? []) visit(p, seen);
    ordered.push(t);
  };
  tables.forEach((t) => visit(t, new Set()));
  return ordered;
}

export async function exportData(): Promise<BackupFile> {
  const tables: BackupFile['tables'] = {};
  const names = await tableNames();
  // One snapshot-consistent read across all tables.
  await prisma.$transaction(
    async (tx) => {
      for (const t of names) tables[t] = await tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "${t}"`);
    },
    { timeout: 120_000, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
  return { format: FORMAT, version: 1, createdAt: new Date().toISOString(), migration: await latestMigration(), tables };
}

export const gzipBackup = (b: BackupFile) => zlib.gzipSync(Buffer.from(JSON.stringify(b)), { level: 6 });

export function parseBackup(buf: Buffer): BackupFile {
  let data: BackupFile;
  try {
    const raw = buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf) : buf;
    data = JSON.parse(raw.toString('utf8'));
  } catch {
    throw badRequest('This is not a readable InWoice backup file');
  }
  if (data?.format !== FORMAT || typeof data.tables !== 'object') throw badRequest('This is not an InWoice backup file');
  return data;
}

/**
 * Load a backup into this database. Refuses to overwrite data unless `replace` is set,
 * in which case every table is emptied first. Runs in one transaction: all or nothing.
 */
export async function restoreData(backup: BackupFile, { replace = false } = {}) {
  const current = await latestMigration();
  if (backup.migration && current && backup.migration > current) {
    throw badRequest(`This backup is from a newer InWoice version (${backup.migration}). Update the app, then restore.`);
  }
  const tables = await tableNames();
  const order = await insertOrder(tables);
  const counts: Record<string, number> = {};

  await prisma.$transaction(
    async (tx) => {
      if (!replace) {
        const used = await tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT (SELECT COUNT(*) FROM "User") + (SELECT COUNT(*) FROM "Invoice") + (SELECT COUNT(*) FROM "Customer") AS n`);
        if (Number(used[0]?.n ?? 0) > 0) throw badRequest('This database already has data. Restore into an empty database, or use replace.');
      }
      await tx.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
      for (const t of order) {
        const rows = backup.tables[t];
        if (!rows?.length) continue;
        // jsonb_populate_recordset casts each JSON value to its column's type. Only columns
        // present in the backup are inserted, so columns added since then get their defaults.
        const cols = await tx.$queryRawUnsafe<{ column_name: string }[]>(
          `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`,
          t,
        );
        const present = cols.map((c) => c.column_name).filter((c) => c in rows[0]!);
        const list = present.map((c) => `"${c}"`).join(', ');
        for (let i = 0; i < rows.length; i += 1000) {
          await tx.$executeRawUnsafe(
            `INSERT INTO "${t}" (${list}) SELECT ${list} FROM jsonb_populate_recordset(NULL::"${t}", $1::jsonb)`,
            JSON.stringify(rows.slice(i, i + 1000)),
          );
        }
        counts[t] = rows.length;
      }
    },
    { timeout: 300_000 },
  );
  return counts;
}

// --- Backup files on disk --------------------------------------------------------

/** Backup folder; in multi-business mode each business gets its own sub-folder. */
export const backupDir = () => {
  if (!config.backupDir) return null;
  const t = currentTenant();
  return t ? path.resolve(config.backupDir, t.slug) : path.resolve(config.backupDir);
};

const stamp = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/** Write a backup file and prune old automatic ones (manual backups are kept). */
export async function writeBackupFile(kind: 'auto' | 'manual' = 'auto') {
  const dir = backupDir();
  if (!dir) throw badRequest('Backups to disk are switched off (BACKUP_DIR=off)');
  fs.mkdirSync(dir, { recursive: true });
  const name = `inwoice-${stamp(new Date())}${kind === 'manual' ? '-manual' : ''}.json.gz`;
  const file = path.join(dir, name);
  fs.writeFileSync(`${file}.tmp`, gzipBackup(await exportData()));
  fs.renameSync(`${file}.tmp`, file);

  const autos = listBackups().filter((b) => !b.name.includes('-manual'));
  for (const old of autos.slice(config.backupKeep)) fs.rmSync(path.join(dir, old.name), { force: true });
  return { name, size: fs.statSync(file).size };
}

export function listBackups() {
  const dir = backupDir();
  if (!dir || !fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => NAME_PATTERN.test(n))
    .map((name) => {
      const st = fs.statSync(path.join(dir, name));
      return { name, size: st.size, createdAt: st.mtime.toISOString() };
    })
    .sort((a, b) => b.name.localeCompare(a.name));
}

export function backupPath(name: string) {
  const dir = backupDir();
  if (!dir || !NAME_PATTERN.test(name)) throw notFound('Backup');
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) throw notFound('Backup');
  return file;
}

/** Has an automatic backup been written today? */
export function backedUpToday() {
  const today = stamp(new Date()).slice(0, 8);
  return listBackups().some((b) => !b.name.includes('-manual') && b.name.slice(8, 16) === today);
}

// --- Off-site copies (S3-compatible storage) ----------------------------------------

export async function offsiteConfig(): Promise<S3Config | null> {
  const s = await getSettings();
  if (!s.s3Bucket || !s.s3AccessKey || !s.s3SecretKey) return null;
  return { endpoint: s.s3Endpoint, region: s.s3Region || 'auto', bucket: s.s3Bucket, accessKey: s.s3AccessKey, secretKey: s.s3SecretKey };
}

const offsiteKey = (prefix: string | null, name: string) => `${(prefix ?? 'inwoice-backups').replace(/^\/+|\/+$/g, '')}/${name}`;

/** Upload one backup file off the server. Records the outcome so Settings can show it. */
export async function uploadOffsite(name: string, data?: Buffer) {
  const cfg = await offsiteConfig();
  if (!cfg) throw badRequest('Off-site storage is not set up (Settings › Backups)');
  const s = await getSettings();
  const body = data ?? fs.readFileSync(backupPath(name));
  try {
    const r = await s3Put(cfg, offsiteKey(s.s3Prefix, name), body, 'application/gzip');
    await prisma.businessSettings.update({ where: { id: s.id }, data: { offsiteLastAt: new Date(), offsiteLastError: null } });
    return r;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.businessSettings.update({ where: { id: s.id }, data: { offsiteLastError: `${new Date().toISOString()}: ${message}` } });
    throw badRequest(`Off-site upload failed: ${message}`);
  }
}

/** Check the storage settings by uploading a tiny file. */
export async function testOffsite() {
  const cfg = await offsiteConfig();
  if (!cfg) throw badRequest('Fill in the bucket, access key and secret key first');
  const s = await getSettings();
  try {
    return await s3Put(cfg, offsiteKey(s.s3Prefix, 'inwoice-connection-test.txt'), Buffer.from(`InWoice connection test ${new Date().toISOString()}\n`), 'text/plain');
  } catch (err) {
    throw badRequest(err instanceof Error ? err.message : String(err));
  }
}
