import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import MailComposer from 'nodemailer/lib/mail-composer';
import prisma from '../lib/prisma';
import { config } from '../lib/config';
import { HttpError, badRequest } from '../lib/errors';
import { currentTenant } from '../lib/tenancy';
import { getSettings, publicBaseUrl } from './settings.service';

/**
 * "Connect Gmail": each user can sign in with Google once (only the gmail.send permission:
 * InWoice can send as them, never read their mail). Emails then go out from their own Gmail
 * with the PDF attached, with no SMTP setup. An admin can also pick one connected Gmail to
 * send the automatic emails (reminders, statements, monthly summary).
 *
 * Needs a Google OAuth client (Google Cloud console → Credentials → OAuth client ID, type
 * "Web application") with this install's callback as a redirect URI. Its ID and secret go in
 * Settings › Email, or GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET for every business.
 */

export const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send'];

const endpoints = () => ({
  auth: process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
  token: process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
  revoke: process.env.GOOGLE_REVOKE_URL || 'https://oauth2.googleapis.com/revoke',
  gmail: (process.env.GMAIL_API_URL || 'https://gmail.googleapis.com').replace(/\/+$/, ''),
});

export async function googleClient() {
  const s = await getSettings();
  const id = s.googleClientId || process.env.GOOGLE_CLIENT_ID || '';
  const secret = s.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET || '';
  return id && secret ? { id, secret } : null;
}

export async function callbackUrl(requestOrigin?: string | null) {
  return `${(await publicBaseUrl(requestOrigin)) ?? requestOrigin ?? ''}/api/google/callback`;
}

/** The Google sign-in address for this user. The state ties the answer back to them. */
export async function connectUrl(userId: string, requestOrigin?: string | null) {
  const client = await googleClient();
  if (!client) throw badRequest('Add your Google OAuth client ID and secret first (Settings › Email › Gmail)');
  const state = jwt.sign({ u: userId, tn: currentTenant()?.slug ?? null, n: crypto.randomBytes(8).toString('hex'), purpose: 'gmail' }, config.jwtSecret, { expiresIn: '10m' });
  const q = new URLSearchParams({
    client_id: client.id,
    redirect_uri: await callbackUrl(requestOrigin),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline', // a refresh token, so sending keeps working
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${endpoints().auth}?${q.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  let res: Response;
  try {
    res = await fetch(endpoints().token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body), signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    throw new HttpError(502, `Could not reach Google (${err instanceof Error ? err.message : err})`);
  }
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok) json.error ??= `HTTP ${res.status}`;
  return json;
}

/** The email in Google's ID token. It came straight from Google's token endpoint over HTTPS. */
function emailFromIdToken(idToken?: string) {
  try {
    const payload = JSON.parse(Buffer.from(idToken!.split('.')[1]!, 'base64url').toString('utf8'));
    return payload.email_verified === false ? null : (payload.email as string) || null;
  } catch {
    return null;
  }
}

/** Google sent the user back with a code: swap it for tokens and remember the account. */
export async function completeConnect(code: string, state: string, requestOrigin?: string | null) {
  let st: { u: string; tn: string | null; purpose: string };
  try {
    st = jwt.verify(state, config.jwtSecret) as typeof st;
  } catch {
    throw badRequest('This Google sign-in link has expired. Please try Connect Gmail again.');
  }
  if (st.purpose !== 'gmail') throw badRequest('Not a Gmail connection request');
  if ((st.tn ?? null) !== (currentTenant()?.slug ?? null)) throw badRequest('This Google sign-in belongs to a different business');
  const client = await googleClient();
  if (!client) throw badRequest('Google sign-in is not set up');
  const t = await tokenRequest({ code, client_id: client.id, client_secret: client.secret, redirect_uri: await callbackUrl(requestOrigin), grant_type: 'authorization_code' });
  if (t.error || !t.access_token) throw badRequest(`Google did not accept the sign-in: ${t.error_description || t.error || 'no access token'}`);
  if (t.scope && !t.scope.split(' ').includes('https://www.googleapis.com/auth/gmail.send')) {
    throw badRequest('Please tick "Send email on your behalf" on Google\'s screen, then connect again');
  }
  if (!t.refresh_token) throw badRequest('Google did not give lasting access. Remove InWoice at myaccount.google.com/permissions, then connect again.');
  const email = emailFromIdToken(t.id_token);
  if (!email) throw badRequest('Google did not say which Gmail address this is');
  const user = await prisma.user.update({ where: { id: st.u }, data: { gmailAddress: email, gmailRefreshToken: t.refresh_token, gmailConnectedAt: new Date() } });
  tokens.set(user.id, { token: t.access_token, until: Date.now() + ((t.expires_in ?? 3600) - 60) * 1000 });
  return { userId: user.id, email };
}

// Short-lived access tokens, per user, kept in memory only.
const tokens = new Map<string, { token: string; until: number }>();

async function accessToken(userId: string, refreshToken: string) {
  const cached = tokens.get(userId);
  if (cached && cached.until > Date.now()) return cached.token;
  const client = await googleClient();
  if (!client) throw badRequest('Google sign-in is not set up');
  const t = await tokenRequest({ refresh_token: refreshToken, client_id: client.id, client_secret: client.secret, grant_type: 'refresh_token' });
  if (t.error === 'invalid_grant') {
    await prisma.user.update({ where: { id: userId }, data: { gmailRefreshToken: null } });
    throw badRequest('Gmail access was removed or has expired. Connect Gmail again in Settings › Email.');
  }
  if (t.error || !t.access_token) throw new HttpError(502, `Google refused to renew access: ${t.error_description || t.error}`);
  tokens.set(userId, { token: t.access_token, until: Date.now() + ((t.expires_in ?? 3600) - 60) * 1000 });
  return t.access_token;
}

export interface GmailMessage {
  fromName: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer }[];
}

/** Build the MIME message (same library as SMTP sending) and hand it to the Gmail API. */
export async function sendWithGmail(userId: string, m: GmailMessage) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, gmailAddress: true, gmailRefreshToken: true } });
  if (!user?.gmailAddress || !user.gmailRefreshToken) throw badRequest('Gmail is not connected for this account. Connect it in Settings › Email.');
  const raw = await new MailComposer({
    from: { name: m.fromName, address: user.gmailAddress },
    to: m.to,
    subject: m.subject,
    text: m.text,
    html: m.html,
    attachments: m.attachments,
  })
    .compile()
    .build();
  const send = async (token: string) =>
    fetch(`${endpoints().gmail}/gmail/v1/users/me/messages/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: raw.toString('base64url') }),
      signal: AbortSignal.timeout(30_000),
    });
  let res = await send(await accessToken(user.id, user.gmailRefreshToken));
  if (res.status === 401) {
    tokens.delete(user.id); // expired early: renew once
    res = await send(await accessToken(user.id, user.gmailRefreshToken));
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new HttpError(502, `Gmail did not send it: ${body.error?.message ?? `HTTP ${res.status}`}`);
  }
  return { from: user.gmailAddress, id: ((await res.json()) as { id?: string }).id ?? null };
}

export async function disconnectGmail(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { gmailRefreshToken: true } });
  if (user?.gmailRefreshToken) {
    // Tell Google too, so the permission disappears from the Google account. Best effort.
    await fetch(`${endpoints().revoke}?token=${encodeURIComponent(user.gmailRefreshToken)}`, { method: 'POST', signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
  }
  tokens.delete(userId);
  await prisma.user.update({ where: { id: userId }, data: { gmailAddress: null, gmailRefreshToken: null, gmailConnectedAt: null } });
  const s = await getSettings();
  if (s.autoMailUserId === userId) await prisma.businessSettings.update({ where: { id: s.id }, data: { autoMailUserId: null } });
}

/** The connected Gmail that sends automatic emails, if one is chosen and still connected. */
export async function automaticSender() {
  const s = await getSettings();
  if (!s.autoMailUserId) return null;
  const u = await prisma.user.findUnique({ where: { id: s.autoMailUserId }, select: { id: true, isActive: true, gmailAddress: true, gmailRefreshToken: true } });
  return u?.isActive && u.gmailAddress && u.gmailRefreshToken ? { userId: u.id, email: u.gmailAddress } : null;
}
