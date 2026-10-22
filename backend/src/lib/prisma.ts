import { PrismaClient } from '@prisma/client';
import { tenantClient } from './tenancy';

// The base client (public schema). Prisma keeps a small connection pool; on a
// low-resource server cap it with `?connection_limit=5` in DATABASE_URL.
export const baseClient = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

/**
 * The client every service imports. In single-business mode it is simply the base client.
 * In multi-business (SaaS) mode each request runs inside a tenant context and this proxy
 * forwards every call to that business's own client (its own PostgreSQL schema), so
 * services and raw SQL never need to know which business they are serving.
 */
const prisma = new Proxy(baseClient, {
  get(target, prop) {
    const client = tenantClient() ?? target;
    const value = Reflect.get(client, prop);
    return typeof value === 'function' ? value.bind(client) : value;
  },
}) as PrismaClient;

export default prisma;
