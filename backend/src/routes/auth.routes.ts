import crypto from 'crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { config } from '../lib/config';
import { badRequest, HttpError, notFound } from '../lib/errors';
import { param, requestOrigin } from '../lib/util';
import QRCode from 'qrcode';
import { authenticate, forgetUser, requireAdmin, signToken, signTwoFactorTicket, verifyTwoFactorTicket } from '../middlewares/auth';
import { ROLES, accessFor } from '../lib/permissions';
import { hashRecoveryCode, newRecoveryCodes, newTotpSecret, otpauthUrl, verifyTotp } from '../lib/totp';
import { getSettings, publicBaseUrl } from '../services/settings.service';
import { isEmailConfigured, sendMail } from '../services/email.service';
import { audit } from '../services/audit.service';
import { assertWithinPlan } from '../services/platform.service';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 1000 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: 'Too many login attempts. Try again in 15 minutes.' },
});

const publicUser = (u: { id: string; name: string; email: string; role: string; totpEnabled?: boolean }) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  totpEnabled: Boolean(u.totpEnabled),
  permissions: accessFor(u.role),
});

/** Sign everyone out of this account (password change, reset, disable). */
async function endSessions(userId: string) {
  const u = await prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
  forgetUser(userId);
  return u;
}

async function signedIn(user: { id: string; name: string; email: string; role: string; tokenVersion: number; totpEnabled: boolean }, ip: string | undefined) {
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ userId: user.id, userName: user.name, action: 'LOGIN', entity: 'auth', entityId: user.id, label: user.email, ip });
  return { success: true, token: signToken(user), user: publicUser(user) };
}

const password = z.string().min(8, 'Password must be at least 8 characters').max(200);

/** Whether first-run setup is still needed (no users yet). */
router.get('/status', async (_req, res) => {
  const users = await prisma.user.count();
  res.json({ success: true, data: { setupRequired: users === 0 } });
});

/** First-run: create the owner account + business name. Only works while there are no users. */
router.post('/setup', loginLimiter, async (req, res) => {
  if ((await prisma.user.count()) > 0) throw new HttpError(403, 'Setup has already been completed. Please sign in.');
  const data = z
    .object({
      name: z.string().trim().min(2),
      email: z.string().trim().toLowerCase().email(),
      password,
      businessName: z.string().trim().min(2).optional(),
    })
    .parse(req.body);

  const user = await prisma.$transaction(async (tx) => {
    if ((await tx.user.count()) > 0) throw new HttpError(403, 'Setup has already been completed. Please sign in.');
    return tx.user.create({
      data: { name: data.name, email: data.email, password: await bcrypt.hash(data.password, 10), role: 'ADMIN' },
    });
  });
  if (data.businessName) {
    const s = await getSettings();
    await prisma.businessSettings.update({ where: { id: s.id }, data: { businessName: data.businessName } });
  }
  res.status(201).json({ success: true, token: signToken(user), user: publicUser(user) });
});

router.post('/login', loginLimiter, async (req, res) => {
  const data = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user || !user.isActive || !(await bcrypt.compare(data.password, user.password))) {
    await audit({ userId: user?.id ?? null, userName: user?.name ?? null, action: 'LOGIN_FAILED', entity: 'auth', label: data.email, ip: req.ip });
    throw new HttpError(401, 'Invalid email or password');
  }
  if (user.totpEnabled) {
    // Password is right; now ask for the code from the authenticator app.
    res.json({ success: true, twoFactorRequired: true, ticket: signTwoFactorTicket(user) });
    return;
  }
  res.json(await signedIn(user, req.ip));
});

/** Second login step: a 6-digit code from the authenticator app, or a recovery code. */
router.post('/login/2fa', loginLimiter, async (req, res) => {
  const { ticket, code } = z.object({ ticket: z.string().min(10), code: z.string().trim().min(6).max(20) }).parse(req.body);
  const t = verifyTwoFactorTicket(ticket);
  if (!t) throw new HttpError(401, 'That sign-in took too long. Please enter your password again.');
  const user = await prisma.user.findUnique({ where: { id: t.id } });
  if (!user || !user.isActive || !user.totpEnabled || !user.totpSecret || user.tokenVersion !== (t.tv ?? 0)) {
    throw new HttpError(401, 'Please sign in again.');
  }
  if (!verifyTotp(user.totpSecret, code)) {
    // Not a current code: maybe a one-time recovery code.
    const hashes: string[] = user.recoveryCodes ? JSON.parse(user.recoveryCodes) : [];
    const h = hashRecoveryCode(code);
    if (!hashes.includes(h)) {
      await audit({ userId: user.id, userName: user.name, action: 'LOGIN_FAILED', entity: 'auth', label: `${user.email} (wrong code)`, ip: req.ip });
      throw new HttpError(401, 'That code is not right. Check the time on your phone, or use a recovery code.');
    }
    await prisma.user.update({ where: { id: user.id }, data: { recoveryCodes: JSON.stringify(hashes.filter((x) => x !== h)) } });
    await audit({ userId: user.id, userName: user.name, action: 'RECOVERY_CODE_USED', entity: 'auth', entityId: user.id, label: user.email, ip: req.ip });
  }
  res.json(await signedIn(user, req.ip));
});

// --- Forgot / reset password ------------------------------------------------------

const RESET_TTL_MS = 60 * 60 * 1000; // links work for one hour
const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

/**
 * Email a one-time reset link. The answer is the same whether or not the address has an
 * account, so it can't be used to find out who uses this install.
 */
router.post('/forgot-password', loginLimiter, async (req, res) => {
  const { email } = z.object({ email: z.string().trim().toLowerCase().email() }).parse(req.body);
  const generic = 'If that email address has an account, a reset link is on its way. It works for one hour.';
  if (!(await isEmailConfigured())) {
    res.json({
      success: true,
      emailConfigured: false,
      message: "This server can't send email yet. Ask the owner to reset your password in Settings › Team, or on the server run: npm run reset-password -- <email> <new password>",
    });
    return;
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (user?.isActive) {
    const token = crypto.randomBytes(32).toString('base64url');
    await prisma.$transaction([
      prisma.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } }),
      prisma.passwordReset.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) } }),
    ]);
    const base = (await publicBaseUrl(requestOrigin(req))) ?? requestOrigin(req);
    const settings = await getSettings();
    try {
      await sendMail({
        to: user.email,
        subject: `Reset your ${settings.businessName} InWoice password`,
        text: [
          `Hi ${user.name},`,
          '',
          'Someone (hopefully you) asked to reset your InWoice password. Open this link to choose a new one:',
          `${base}/reset-password?token=${token}`,
          '',
          'The link works once, for one hour. If you did not ask for this, ignore this email and your password stays the same.',
        ].join('\n'),
        referenceType: 'PASSWORD_RESET',
        referenceId: user.id,
      });
    } catch {
      // Logged in the email log; the response stays the same so nothing leaks.
    }
  }
  res.json({ success: true, emailConfigured: true, message: generic });
});

async function validReset(token: string) {
  const row = await prisma.passwordReset.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!row || row.usedAt || row.expiresAt < new Date() || !row.user.isActive) return null;
  return row;
}

router.get('/reset-password/:token', loginLimiter, async (req, res) => {
  const row = await validReset(param(req.params.token));
  if (!row) throw badRequest('This reset link is invalid or has expired. Ask for a new one.');
  const [name, domain] = row.user.email.split('@');
  res.json({ success: true, data: { email: `${name!.slice(0, 2)}${'*'.repeat(Math.max(1, name!.length - 2))}@${domain}` } });
});

router.post('/reset-password', loginLimiter, async (req, res) => {
  const data = z.object({ token: z.string().min(20), password }).parse(req.body);
  const row = await validReset(data.token);
  if (!row) throw badRequest('This reset link is invalid or has expired. Ask for a new one.');
  // Mark the link used first, conditionally, so it can never be used twice.
  const claimed = await prisma.passwordReset.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  if (!claimed.count) throw badRequest('This reset link has already been used.');
  await prisma.user.update({ where: { id: row.userId }, data: { password: await bcrypt.hash(data.password, 10) } });
  await endSessions(row.userId);
  await prisma.passwordReset.deleteMany({ where: { userId: row.userId, usedAt: null } });
  await audit({ userId: row.userId, userName: row.user.name, action: 'PASSWORD_RESET', entity: 'auth', entityId: row.userId, label: row.user.email, ip: req.ip });
  res.json({ success: true, message: 'Password changed. You can sign in now.' });
});

router.get('/me', authenticate, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !user.isActive) throw new HttpError(401, 'Account not found or disabled');
  const codes: string[] = user.recoveryCodes ? JSON.parse(user.recoveryCodes) : [];
  res.json({ success: true, user: { ...publicUser(user), recoveryCodesLeft: user.totpEnabled ? codes.length : null } });
});

router.post('/change-password', authenticate, async (req, res) => {
  const data = z.object({ currentPassword: z.string().min(1), newPassword: password }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user || !(await bcrypt.compare(data.currentPassword, user.password))) {
    throw badRequest('Current password is incorrect');
  }
  await prisma.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(data.newPassword, 10) } });
  // Other devices are signed out; this one gets a fresh token.
  const updated = await endSessions(user.id);
  res.json({ success: true, message: 'Password updated. Other devices have been signed out.', token: signToken(updated) });
});

// --- Two-factor sign-in (authenticator app) ---------------------------------------

/** Start setting up 2FA: a new secret and QR code (not active until confirmed with a code). */
router.post('/2fa/setup', authenticate, async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (user.totpEnabled) throw badRequest('Two-factor sign-in is already on. Turn it off first to set up a new phone.');
  const secret = newTotpSecret();
  await prisma.user.update({ where: { id: user.id }, data: { totpSecret: secret } });
  const settings = await getSettings();
  const url = otpauthUrl(secret, user.email, `InWoice ${settings.businessName}`.slice(0, 60));
  res.json({ success: true, data: { secret, otpauthUrl: url, qr: await QRCode.toDataURL(url, { margin: 1, width: 220 }) } });
});

/** Confirm with a code from the app; turns 2FA on and returns one-time recovery codes. */
router.post('/2fa/enable', authenticate, async (req, res) => {
  const { code } = z.object({ code: z.string().trim() }).parse(req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!user.totpSecret) throw badRequest('Start the setup first');
  if (!verifyTotp(user.totpSecret, code)) throw badRequest('That code is not right. Codes change every 30 seconds; check the time on your phone.');
  const { codes, hashes } = newRecoveryCodes();
  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true, recoveryCodes: JSON.stringify(hashes) } });
  forgetUser(user.id);
  res.json({ success: true, data: { recoveryCodes: codes }, message: 'Two-factor sign-in is on' });
});

router.post('/2fa/disable', authenticate, async (req, res) => {
  const { password: pw } = z.object({ password: z.string().min(1) }).parse(req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await bcrypt.compare(pw, user.password))) throw badRequest('Password is incorrect');
  await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecret: null, recoveryCodes: null } });
  res.json({ success: true, message: 'Two-factor sign-in is off' });
});

// --- Team management (admins only) ----------------------------------------

router.get('/users', authenticate, requireAdmin, async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, email: true, role: true, isActive: true, totpEnabled: true, lastLoginAt: true, createdAt: true },
  });
  res.json({ success: true, data: users });
});

router.post('/users', authenticate, requireAdmin, async (req, res) => {
  const data = z
    .object({
      name: z.string().trim().min(2),
      email: z.string().trim().toLowerCase().email(),
      password,
      role: z.enum(ROLES).default('STAFF'),
    })
    .parse(req.body);
  await assertWithinPlan('users');
  const user = await prisma.user.create({
    data: { ...data, password: await bcrypt.hash(data.password, 10) },
  });
  res.status(201).json({ success: true, data: publicUser(user) });
});

router.patch('/users/:id', authenticate, requireAdmin, async (req, res) => {
  const id = param(req.params.id);
  const data = z
    .object({ role: z.enum(ROLES).optional(), isActive: z.boolean().optional(), password: password.optional(), resetTwoFactor: z.boolean().optional() })
    .parse(req.body);
  if (id === req.user!.id && (data.isActive === false || (data.role && data.role !== 'ADMIN'))) {
    throw badRequest('You cannot disable or demote your own account');
  }
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw notFound('User');
  const user = await prisma.user.update({
    where: { id },
    data: {
      role: data.role,
      isActive: data.isActive,
      password: data.password ? await bcrypt.hash(data.password, 10) : undefined,
      ...(data.resetTwoFactor ? { totpEnabled: false, totpSecret: null, recoveryCodes: null } : {}),
    },
  });
  // A new password or a disabled account signs that user out everywhere; a role change applies at once.
  if (data.password || data.isActive === false) await endSessions(id);
  forgetUser(id);
  res.json({ success: true, data: publicUser(user) });
});

export default router;
