import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

function jwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (s && s.length >= 32) return s;
  if (isProd) {
    throw new Error('JWT_SECRET must be set (32+ chars) in production. See backend/.env.example');
  }
  if (!isTest) console.warn('[config] JWT_SECRET missing or short - using an insecure development secret');
  return 'insecure-development-secret-change-me-please-0000';
}

/** Valid http(s) origins from a comma or space separated list; anything else is dropped. */
export function parseOrigins(v: string | undefined): string[] {
  return (v || '')
    .split(/[\s,]+/)
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter((o) => /^https?:\/\/[^\s'";/]+$/.test(o));
}

/**
 * How many reverse proxies to believe in X-Forwarded-For. 0 when InWoice is
 * reached directly (the home lab): otherwise anyone could send a made-up
 * X-Forwarded-For on every try and dodge the login rate limit.
 * Unset keeps the old behaviour (one proxy, e.g. nginx/Caddy in front).
 */
function trustProxy(v: string | undefined): number {
  if (v === undefined || v.trim() === '') return 1;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : 1;
}

export const config = {
  isProd,
  isTest,
  port: Number(process.env.PORT) || 5000,
  jwtSecret: jwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  trustProxy: trustProxy(process.env.TRUST_PROXY),
  // House of Stix control room address: the only other page allowed to show InWoice in a frame.
  frameAncestors: parseOrigins(process.env.CONTROL_ROOM_ORIGIN),
  corsOrigins: (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // Multi-business (SaaS) mode: many businesses on one server, each in its own schema,
  // reached at <slug>.<BASE_DOMAIN> or a custom domain. Off = one business per install.
  multiTenant: process.env.MULTI_TENANT === '1' || process.env.MULTI_TENANT === 'true',
  baseDomain: (process.env.BASE_DOMAIN || '').trim().toLowerCase().replace(/^\.+|\.+$/g, ''),
  signupEnabled: process.env.SIGNUP_ENABLED === '1' || process.env.SIGNUP_ENABLED === 'true',
  trialDays: Math.max(Number(process.env.TRIAL_DAYS) || 14, 0),
  // Lets tests and local development pick a business with an X-Tenant header.
  allowTenantHeader: process.env.ALLOW_TENANT_HEADER === '1' || (!isProd && process.env.ALLOW_TENANT_HEADER !== '0'),
  platformName: process.env.PLATFORM_NAME || 'InWoice',
  supportEmail: process.env.SUPPORT_EMAIL || '',
  // Server errors and failed jobs are posted here (Slack/Discord/any JSON webhook).
  alertWebhookUrl: (process.env.ALERT_WEBHOOK_URL || '').trim(),
  // Public address of this install, used in emailed links (portal, password reset).
  appUrl: (process.env.APP_URL || '').trim().replace(/\/+$/, ''),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  ollamaUrl: process.env.OLLAMA_URL || '',
  ollamaModel: process.env.OLLAMA_MODEL || 'qwen2.5:1.5b',
  // Daily backups to disk: BACKUP_DIR=off disables them (default ./backups, off in tests).
  backupDir: process.env.BACKUP_DIR === 'off' ? '' : process.env.BACKUP_DIR || (isTest ? '' : 'backups'),
  backupKeep: Math.max(Number(process.env.BACKUP_KEEP) || 14, 1),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: process.env.SMTP_PORT || '587',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || '',
  },
};
