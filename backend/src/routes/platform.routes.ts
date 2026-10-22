import { Router, type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../lib/config';
import { HttpError, notFound } from '../lib/errors';
import { optDate, optStr, param } from '../lib/util';
import {
  PLANS,
  PLAN_KEYS,
  accountState,
  checkPlatformAdmin,
  checkSlug,
  createTenant,
  listTenants,
  tenantBySlug,
  tenantUsage,
  updateTenant,
} from '../services/platform.service';

/**
 * Platform API (multi-business mode): what this address is, sign-up for new businesses,
 * and the platform admin's tools. Everything except /info only works on the platform's
 * own address (the root domain), never on a business's address.
 */
const router = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 1000 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: 'Too many attempts. Try again in 15 minutes.' },
});

const plans = PLAN_KEYS.map((k) => ({ key: k, ...PLANS[k] }));

/** What the browser is looking at: single business, the platform site, or one business. */
router.get('/info', (req, res) => {
  const t = req.tenant;
  res.json({
    success: true,
    data: {
      multiTenant: config.multiTenant,
      platformName: config.platformName,
      baseDomain: config.baseDomain || null,
      root: Boolean(req.platformRoot),
      signupEnabled: config.multiTenant && config.signupEnabled,
      supportEmail: config.supportEmail || null,
      notFound: config.multiTenant && !req.platformRoot && !t,
      tenant: t
        ? {
            name: t.name,
            slug: t.slug,
            plan: t.plan,
            planLabel: PLANS[t.plan as keyof typeof PLANS]?.label ?? t.plan,
            trialEndsAt: t.trialEndsAt,
            paidUntil: t.paidUntil,
            ...accountState(t),
          }
        : null,
      plans,
    },
  });
});

function rootOnly(req: Request, _res: Response, next: NextFunction) {
  if (!config.multiTenant) return next(new HttpError(404, 'Multi-business mode is off on this server'));
  if (!req.platformRoot) return next(new HttpError(404, 'Not available at a business address'));
  next();
}

const businessUrl = (req: Request, slug: string) => {
  const host = config.baseDomain ? `${slug}.${config.baseDomain}${req.get('host')?.match(/:\d+$/)?.[0] ?? ''}` : req.get('host');
  return `${req.protocol}://${host}`;
};

router.get('/check-slug', rootOnly, async (req, res) => {
  const slug = String(req.query.slug ?? '').trim().toLowerCase();
  try {
    checkSlug(slug);
  } catch (err) {
    res.json({ success: true, data: { available: false, reason: (err as Error).message } });
    return;
  }
  const taken = await tenantBySlug(slug);
  res.json({ success: true, data: { available: !taken, reason: taken ? 'That address is already taken' : null } });
});

/** Self-service sign-up: a new business with its owner account and a free trial. */
router.post('/signup', rootOnly, limiter, async (req, res) => {
  if (!config.signupEnabled) throw new HttpError(403, 'Sign-up is closed. Contact us to get an account.');
  const data = z
    .object({
      businessName: z.string().trim().min(2).max(80),
      slug: z.string().trim().toLowerCase(),
      name: z.string().trim().min(2).max(80),
      email: z.string().trim().toLowerCase().email(),
      password: z.string().min(8, 'Password must be at least 8 characters').max(200),
    })
    .parse(req.body);
  const t = await createTenant({ slug: data.slug, name: data.businessName, ownerName: data.name, ownerEmail: data.email, ownerPassword: data.password });
  res.status(201).json({ success: true, data: { slug: t.slug, url: businessUrl(req, t.slug), trialEndsAt: t.trialEndsAt } });
});

// --- Platform admin ----------------------------------------------------------------

const PLATFORM = 'platform';

function platformAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.header('Authorization')?.replace(/^Bearer /, '');
  try {
    const p = token ? (jwt.verify(token, config.jwtSecret) as { purpose?: string; email?: string }) : null;
    if (p?.purpose !== PLATFORM) throw new Error('not a platform token');
    next();
  } catch {
    next(new HttpError(401, 'Platform admin sign-in required'));
  }
}

router.post('/admin/login', rootOnly, limiter, async (req, res) => {
  const { email, password } = z.object({ email: z.string().trim().email(), password: z.string().min(1) }).parse(req.body);
  const admin = await checkPlatformAdmin(email, password);
  if (!admin) throw new HttpError(401, 'Invalid email or password');
  res.json({ success: true, token: jwt.sign({ id: admin.id, email: admin.email, purpose: PLATFORM }, config.jwtSecret, { expiresIn: '12h' }) });
});

router.get('/admin/tenants', rootOnly, platformAuth, async (_req, res) => {
  const tenants = await listTenants();
  const rows = [];
  for (const t of tenants) {
    let usage = null;
    try {
      usage = await tenantUsage(t);
    } catch {
      // A broken schema shouldn't hide the rest of the list.
    }
    rows.push({ ...t, account: accountState(t), usage });
  }
  res.json({ success: true, data: rows, plans });
});

router.post('/admin/tenants', rootOnly, platformAuth, async (req, res) => {
  const data = z
    .object({
      businessName: z.string().trim().min(2).max(80),
      slug: z.string().trim().toLowerCase(),
      name: z.string().trim().min(2).max(80),
      email: z.string().trim().toLowerCase().email(),
      password: z.string().min(8).max(200),
      plan: z.enum(PLAN_KEYS as [string, ...string[]]).default('TRIAL'),
    })
    .parse(req.body);
  const t = await createTenant({ slug: data.slug, name: data.businessName, ownerName: data.name, ownerEmail: data.email, ownerPassword: data.password, plan: data.plan as keyof typeof PLANS });
  res.status(201).json({ success: true, data: { ...t, url: businessUrl(req, t.slug) } });
});

router.patch('/admin/tenants/:id', rootOnly, platformAuth, async (req, res) => {
  const data = z
    .object({
      name: z.string().trim().min(2).max(80).optional(),
      plan: z.enum(PLAN_KEYS as [string, ...string[]]).optional(),
      status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
      trialEndsAt: optDate,
      paidUntil: optDate,
      customDomain: optStr.refine((v) => !v || /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v), 'Enter a domain like billing.client.in'),
      notes: optStr,
    })
    .parse(req.body);
  const id = param(req.params.id);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound('Business');
  const t = await updateTenant(id, { ...data, plan: data.plan as keyof typeof PLANS | undefined });
  res.json({ success: true, data: { ...t, account: accountState(t) } });
});

export default router;
