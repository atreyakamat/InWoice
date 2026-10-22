import { beforeEach, describe, expect, it } from 'vitest';
import { alertState, reportError, resetAlerts, shouldSend } from '../../src/lib/alerts';

describe('operator alert throttling', () => {
  beforeEach(() => resetAlerts());

  it('sends a message once, then holds repeats for 15 minutes', () => {
    const t = 1_000_000;
    expect(shouldSend('GET /x|boom', t)).toBe(true);
    expect(shouldSend('GET /x|boom', t + 60_000)).toBe(false);
    expect(shouldSend('GET /y|boom', t + 60_000)).toBe(true); // a different error still goes out
    expect(shouldSend('GET /x|boom', t + 16 * 60_000)).toBe(true);
  });

  it('caps the number of alerts per hour', () => {
    const t = 5_000_000;
    let sent = 0;
    for (let i = 0; i < 100; i++) if (shouldSend(`err-${i}`, t + i)) sent++;
    expect(sent).toBe(30);
    expect(shouldSend('fresh', t + 61 * 60_000)).toBe(true); // a new hour opens the window again
  });

  it('records the last error even when no webhook is configured', async () => {
    await reportError('POST /api/invoices', new Error('database went away'));
    expect(alertState().lastError?.message).toBe('POST /api/invoices: Error: database went away');
    expect(alertState().sent).toBe(0);
  });
});
