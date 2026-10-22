import { describe, expect, it } from 'vitest';
import { firstIndexOnOrAfter, occurrence } from '../../src/services/recurring.service';
import { quoteDisplayStatus } from '../../src/services/quote.service';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const ymd = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

describe('recurring schedule dates', () => {
  it('clamps month ends without drifting', () => {
    const start = d(2026, 1, 31);
    expect([0, 1, 2, 3, 13].map((n) => ymd(occurrence(start, 'MONTHLY', 1, n)))).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2027-02-28']);
  });

  it('handles leap years for yearly schedules', () => {
    expect([0, 1, 4].map((n) => ymd(occurrence(d(2028, 2, 29), 'YEARLY', 1, n)))).toEqual(['2028-02-29', '2029-02-28', '2032-02-29']);
  });

  it('supports weekly, quarterly and every-N intervals', () => {
    expect(ymd(occurrence(d(2026, 10, 1), 'WEEKLY', 1, 3))).toBe('2026-10-22');
    expect(ymd(occurrence(d(2026, 10, 1), 'WEEKLY', 2, 2))).toBe('2026-10-29');
    expect(ymd(occurrence(d(2026, 11, 30), 'QUARTERLY', 1, 1))).toBe('2027-02-28');
    expect(ymd(occurrence(d(2026, 1, 15), 'MONTHLY', 6, 2))).toBe('2027-01-15');
  });

  it('finds the next occurrence that has not passed', () => {
    expect(firstIndexOnOrAfter(d(2026, 1, 10), 'MONTHLY', 1, d(2026, 4, 10))).toBe(3);
    expect(firstIndexOnOrAfter(d(2026, 1, 10), 'MONTHLY', 1, d(2026, 4, 11))).toBe(4);
    expect(firstIndexOnOrAfter(d(2026, 6, 1), 'MONTHLY', 1, d(2026, 1, 1))).toBe(0);
  });
});

describe('quote status', () => {
  it('expires open quotes after their validity date only', () => {
    const today = d(2026, 10, 22);
    expect(quoteDisplayStatus({ status: 'SENT', validUntil: d(2026, 10, 21) }, today)).toBe('EXPIRED');
    expect(quoteDisplayStatus({ status: 'SENT', validUntil: d(2026, 10, 22) }, today)).toBe('SENT');
    expect(quoteDisplayStatus({ status: 'ACCEPTED', validUntil: d(2026, 1, 1) }, today)).toBe('ACCEPTED');
    expect(quoteDisplayStatus({ status: 'DRAFT', validUntil: null }, today)).toBe('DRAFT');
  });
});
