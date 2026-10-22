import type { NextFunction, Request, Response } from 'express';
import { config } from '../lib/config';
import { HttpError } from '../lib/errors';
import { enterTenant, type Tenant } from '../lib/tenancy';
import { accountState, resolveHost, tenantBySlug } from '../services/platform.service';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenant?: Tenant;
      platformRoot?: boolean;
    }
  }
}

const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
// Signing in and managing your own password still work on a read-only account.
const ALLOWED_READ_ONLY = /^\/api\/auth\//;

/**
 * Multi-business mode: work out which business this request is for (sub-domain, custom
 * domain, or X-Tenant in development) and run the rest of the request as that business.
 * Single-business installs skip all of this.
 */
export async function tenantResolver(req: Request, res: Response, next: NextFunction) {
  if (!config.multiTenant) return next();
  try {
    const header = config.allowTenantHeader ? req.header('x-tenant')?.trim().toLowerCase() : undefined;
    const resolved = header ? { tenant: await tenantBySlug(header) } : await resolveHost(req.hostname);
    const path = req.originalUrl.split('?')[0]!;

    if ('root' in resolved) {
      req.platformRoot = true;
      if (path.startsWith('/api/platform/')) return next();
      return next(new HttpError(404, 'This is the platform site. Open your business at its own address.'));
    }
    const tenant = resolved.tenant;
    if (!tenant) {
      if (path === '/api/platform/info') return next();
      return next(new HttpError(404, 'There is no business at this address.'));
    }
    req.tenant = tenant;
    if (WRITE.has(req.method) && !ALLOWED_READ_ONLY.test(path)) {
      const st = accountState(tenant);
      if (st.state !== 'ok') return next(new HttpError(402, st.message!));
    }
    enterTenant(tenant, next, (release) => {
      res.on('finish', release);
      res.on('close', release);
    });
  } catch (err) {
    next(err);
  }
}
