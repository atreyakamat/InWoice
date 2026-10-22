import request from 'supertest';
import app from '../src/app';
import prisma from '../src/lib/prisma';

export const api = request(app);

/** Wipe all business data between test files (keeps the schema). */
export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

/** Create the owner via first-run setup and return an auth header. */
export async function setupOwner() {
  const res = await api
    .post('/api/auth/setup')
    .send({ name: 'Owner', email: 'owner@test.local', password: 'password123', businessName: 'Test Biz' });
  if (res.status !== 201) throw new Error(`setup failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { Authorization: `Bearer ${res.body.token}` };
}

export { prisma };
