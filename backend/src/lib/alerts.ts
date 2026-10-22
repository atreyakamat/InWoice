import { config } from './config';
import { currentTenant } from './tenancy';

/**
 * Operator alerts: server errors, crashes and failed scheduled jobs are posted to
 * ALERT_WEBHOOK_URL (Slack, Discord, or anything that accepts a JSON POST), so whoever runs
 * the install hears about problems before the customer does. Off when the URL isn't set.
 * The same message is sent at most once every 15 minutes, and at most 30 alerts an hour.
 */

const REPEAT_MS = 15 * 60_000;
const HOUR_MS = 60 * 60_000;
const MAX_PER_HOUR = 30;

const lastSent = new Map<string, number>();
let windowStart = 0;
let sentInWindow = 0;
let suppressed = 0;

export interface AlertState {
  sent: number;
  suppressed: number;
  lastError: { at: string; message: string } | null;
}
const state: AlertState = { sent: 0, suppressed: 0, lastError: null };

/** Recent alert counters for the health endpoint. */
export function alertState(): AlertState {
  return { ...state };
}

const describe = (err: unknown) => (err instanceof Error ? `${err.name}: ${err.message}` : String(err));

/** Decide whether an alert goes out now. Exported for tests. */
export function shouldSend(key: string, now = Date.now()): boolean {
  if (now - windowStart > HOUR_MS) {
    windowStart = now;
    sentInWindow = 0;
  }
  const last = lastSent.get(key);
  if ((last !== undefined && now - last < REPEAT_MS) || sentInWindow >= MAX_PER_HOUR) {
    suppressed++;
    return false;
  }
  lastSent.set(key, now);
  sentInWindow++;
  if (lastSent.size > 500) lastSent.clear(); // bounded memory
  return true;
}

/** Forget throttling history (tests). */
export function resetAlerts() {
  lastSent.clear();
  windowStart = 0;
  sentInWindow = 0;
  suppressed = 0;
  Object.assign(state, { sent: 0, suppressed: 0, lastError: null });
}

/** Log an error and, when configured, post it to the operator's webhook. Never throws. */
export async function reportError(where: string, err: unknown, extra: Record<string, unknown> = {}) {
  const message = describe(err);
  const tenant = currentTenant()?.slug ?? null;
  state.lastError = { at: new Date().toISOString(), message: `${where}: ${message}` };
  const url = config.alertWebhookUrl;
  if (!url || config.isTest) return;
  if (!shouldSend(`${where}|${tenant}|${message}`)) {
    state.suppressed = suppressed;
    return;
  }
  const text = `[${config.platformName}${tenant ? ` · ${tenant}` : ''}] ${where}: ${message}`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `text` for Slack, `content` for Discord, the rest for anything else.
      body: JSON.stringify({ text, content: text.slice(0, 1900), where, tenant, message, ...extra, at: state.lastError.at }),
      signal: AbortSignal.timeout(10_000),
    });
    state.sent++;
  } catch (e) {
    console.error('[alerts] could not post alert:', describe(e));
  }
}
