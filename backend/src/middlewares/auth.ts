import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { config } from '../lib/config';
import { HttpError } from '../lib/errors';
import { ROLE_LABELS, can, type Area, type Role } from '../lib/permissions';
import { currentTenant } from '../lib/tenancy';

export interface AuthUser {
  id: string;
  role: string;
  name?: string;
}

interface TokenPayload {
  id: string;
  role: string;
  tv?: number; // token version: sessions issued before a password change or disable stop working
  tn?: string; // business (tenant) the token belongs to, in multi-business mode
  purpose?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: { id: string; role: string; tokenVersion?: number }): string {
  return jwt.sign({ id: user.id, role: user.role, tv: user.tokenVersion ?? 0, tn: currentTenant()?.slug }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

/** Short-lived ticket between "password OK" and "two-factor code OK" at login. */
export function signTwoFactorTicket(user: { id: string; role: string; tokenVersion: number }): string {
  return jwt.sign({ id: user.id, role: user.role, tv: user.tokenVersion, tn: currentTenant()?.slug, purpose: '2fa' }, config.jwtSecret, { expiresIn: '5m' });
}

export function verifyTwoFactorTicket(ticket: string): TokenPayload | null {
  try {
    const p = jwt.verify(ticket, config.jwtSecret) as TokenPayload;
    return p.purpose === '2fa' && (p.tn ?? null) === (currentTenant()?.slug ?? null) ? p : null;
  } catch {
    return null;
  }
}

// Each request checks the user is still active, still on the same token version and
// still has the same role. A short in-process cache keeps this to ~one query per user
// every few seconds, which matters on slow machines.
const CACHE_MS = 5_000;
const cache = new Map<string, { at: number; isActive: boolean; tokenVersion: number; role: string; name: string }>();

/** Call after changing a user's role, status or password so the change applies at once. */
const cacheKey = (id: string) => `${currentTenant()?.slug ?? ''}:${id}`;

export function forgetUser(id: string) {
  cache.delete(cacheKey(id));
}

async function currentUser(id: string) {
  const key = cacheKey(id);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit;
  const u = await prisma.user.findUnique({ where: { id }, select: { isActive: true, tokenVersion: true, role: true, name: true } });
  if (!u) {
    cache.delete(key);
    return null;
  }
  const entry = { at: Date.now(), ...u };
  cache.set(key, entry);
  return entry;
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.header('Authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) return next(new HttpError(401, 'Authentication required'));
  let decoded: TokenPayload;
  try {
    decoded = jwt.verify(token, config.jwtSecret) as TokenPayload;
  } catch {
    return next(new HttpError(401, 'Session expired or invalid. Please sign in again.'));
  }
  if (decoded.purpose) return next(new HttpError(401, 'Finish signing in first.'));
  // A token only works at the business it was issued for.
  if ((decoded.tn ?? null) !== (currentTenant()?.slug ?? null)) return next(new HttpError(401, 'Please sign in to this business.'));
  try {
    const u = await currentUser(decoded.id);
    if (!u || !u.isActive || (decoded.tv ?? 0) !== u.tokenVersion) {
      return next(new HttpError(401, 'Your session has ended. Please sign in again.'));
    }
    req.user = { id: decoded.id, role: u.role, name: u.name };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.role !== 'ADMIN') return next(new HttpError(403, 'Admin access required'));
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role as Role)) return next(new HttpError(403, 'You do not have access to this'));
    next();
  };
}

/**
 * Role check for an area of the app: reads need read access, changes need write access.
 * Use after `authenticate`.
 */
export function authorize(area: Area) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const role = req.user?.role ?? '';
    const need = req.method === 'GET' || req.method === 'HEAD' ? 'read' : 'write';
    if (can(role, area, need)) return next();
    const label = ROLE_LABELS[role as Role] ?? role;
    next(new HttpError(403, need === 'read' ? `Your role (${label}) does not have access to this part of InWoice.` : `Your role (${label}) can view this but not change it.`));
  };
}
