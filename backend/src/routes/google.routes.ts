import { Router } from 'express';
import prisma from '../lib/prisma';
import { param, requestOrigin } from '../lib/util';
import { authenticate } from '../middlewares/auth';
import { automaticSender, callbackUrl, completeConnect, connectUrl, disconnectGmail, googleClient } from '../services/gmail.service';
import { publicBaseUrl } from '../services/settings.service';

/** Connect Gmail (Google OAuth, send-only). */
const router = Router();

/**
 * Google sends the browser back here after sign-in. No InWoice login header on this request:
 * the signed `state` says which user started it. Always ends on the Settings page.
 */
router.get('/callback', async (req, res) => {
  const back = `${(await publicBaseUrl(requestOrigin(req))) ?? ''}/settings?tab=Email`;
  const fail = (msg: string) => res.redirect(303, `${back}&gmailError=${encodeURIComponent(msg)}`);
  if (typeof req.query.error === 'string') return fail(req.query.error === 'access_denied' ? 'Google sign-in was cancelled' : `Google said: ${req.query.error}`);
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  if (!code || !state) return fail('Google did not send a sign-in code');
  try {
    const r = await completeConnect(code, state, requestOrigin(req));
    res.redirect(303, `${back}&gmail=${encodeURIComponent(r.email)}`);
  } catch (err) {
    fail(err instanceof Error ? err.message : 'Could not connect Gmail');
  }
});

router.use(authenticate);

router.get('/status', async (req, res) => {
  const [client, me, sender] = await Promise.all([
    googleClient(),
    prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { gmailAddress: true, gmailRefreshToken: true, gmailConnectedAt: true } }),
    automaticSender(),
  ]);
  const isAdmin = req.user!.role === 'ADMIN';
  res.json({
    success: true,
    data: {
      configured: Boolean(client),
      redirectUri: await callbackUrl(requestOrigin(req)),
      connected: me.gmailAddress && me.gmailRefreshToken ? me.gmailAddress : null,
      expired: Boolean(me.gmailAddress && !me.gmailRefreshToken),
      connectedAt: me.gmailConnectedAt,
      automaticSender: sender,
      // Admins choose which connected Gmail sends the automatic emails.
      accounts: isAdmin
        ? await prisma.user.findMany({ where: { isActive: true, gmailRefreshToken: { not: null } }, select: { id: true, name: true, gmailAddress: true }, orderBy: { name: 'asc' } })
        : undefined,
    },
  });
});

router.post('/connect', async (req, res) => {
  res.json({ success: true, data: { url: await connectUrl(req.user!.id, requestOrigin(req)) } });
});

router.post('/disconnect', async (req, res) => {
  await disconnectGmail(req.user!.id);
  res.json({ success: true, message: 'Gmail disconnected' });
});

/** Admins can disconnect someone else's Gmail (e.g. a staff member who left). */
router.post('/disconnect/:userId', async (req, res) => {
  if (req.user!.role !== 'ADMIN') {
    res.status(403).json({ success: false, error: 'Only an admin can do this' });
    return;
  }
  await disconnectGmail(param(req.params.userId));
  res.json({ success: true, message: 'Gmail disconnected' });
});

export default router;
