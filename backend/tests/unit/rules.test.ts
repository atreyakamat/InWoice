import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { compact, optGstin, round2, toCsv } from '../../src/lib/util';
import { businessStateCode, gstinError, placeOfSupplyCode, stateCode, stateLabel } from '../../src/lib/gst';
import { balanceOf, displayStatus, statusFromPayments } from '../../src/services/invoice.service';
import { billBalance, billDisplayStatus, termsDays } from '../../src/services/bill.service';
import { parsePeriod } from '../../src/services/gst.service';
import { parseReminderDays } from '../../src/services/reminder.service';
import { monthsIn } from '../../src/services/accounts.service';

const yesterday = () => new Date(Date.now() - 86_400_000 * 2);
const nextWeek = () => new Date(Date.now() + 86_400_000 * 7);

describe('money helpers', () => {
  it('rounds to paise the way a person expects', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(-2.345)).toBe(-2.34);
  });

  it('writes CSV with quoting for commas, quotes and new lines', () => {
    const csv = toCsv([{ a: 'x, y', b: 'say "hi"', c: null }, { a: 'line\nbreak', b: 2, c: 3 }], ['a', 'b', 'c']);
    expect(csv).toBe('a,b,c\n"x, y","say ""hi""",\n"line\nbreak",2,3');
  });

  it('drops undefined keys only, so partial updates never clear fields', () => {
    expect(compact({ a: 1, b: undefined, c: null, d: '' })).toEqual({ a: 1, c: null, d: '' });
  });
});

describe('GST rules', () => {
  it('validates and normalises GSTINs', () => {
    const schema = z.object({ g: optGstin });
    expect(schema.parse({ g: ' 30aaacp1234q1zl ' }).g).toBe('30AAACP1234Q1ZL');
    expect(schema.parse({ g: '' }).g).toBeNull();
    expect(schema.safeParse({ g: '30AAACP1234Q1ZM' }).success).toBe(false);
    expect(gstinError('27AAACM5678R1ZL')).toBeNull();
  });

  it('resolves states and the place of supply', () => {
    expect(stateCode('Maharashtra')).toBe('27');
    expect(stateLabel('30')).toBe('30-Goa');
    expect(placeOfSupplyCode(null, null, '27AAACM5678R1ZL')).toBe('27');
    expect(placeOfSupplyCode('Karnataka', 'Goa', '27AAACM5678R1ZL')).toBe('29');
    expect(businessStateCode(null, '30AAACP1234Q1ZL')).toBe('30');
  });
});

describe('invoice rules', () => {
  it('derives overdue and credited statuses', () => {
    expect(displayStatus({ status: 'PENDING', dueDate: yesterday() })).toBe('OVERDUE');
    expect(displayStatus({ status: 'PENDING', dueDate: nextWeek() })).toBe('PENDING');
    expect(displayStatus({ status: 'PAID', dueDate: yesterday(), amountPaid: 0, amountCredited: 100 })).toBe('CREDITED');
    expect(displayStatus({ status: 'PAID', dueDate: yesterday(), amountPaid: 100, amountCredited: 0 })).toBe('PAID');
  });

  it('never shows a negative balance and counts credits as settlement', () => {
    expect(balanceOf({ grandTotal: 1000, amountPaid: 600, amountCredited: 500 })).toBe(0);
    expect(balanceOf({ grandTotal: 1000, amountPaid: 250.5 })).toBe(749.5);
    expect(statusFromPayments(1000, 0, 1000)).toBe('PAID');
    expect(statusFromPayments(1000, 0, 200)).toBe('PARTIAL');
    expect(statusFromPayments(1000, 0, 0)).toBe('PENDING');
  });
});

describe('bill rules', () => {
  it('reads net payment terms from free text', () => {
    expect(termsDays('Net 30')).toBe(30);
    expect(termsDays('45 days')).toBe(45);
    expect(termsDays('Advance')).toBeNull();
    expect(termsDays(null)).toBeNull();
  });

  it('derives overdue only for open bills', () => {
    expect(billDisplayStatus({ status: 'PARTIAL', dueDate: yesterday() })).toBe('OVERDUE');
    expect(billDisplayStatus({ status: 'PAID', dueDate: yesterday() })).toBe('PAID');
    expect(billDisplayStatus({ status: 'PENDING', dueDate: null })).toBe('PENDING');
    expect(billBalance({ grandTotal: 500, amountPaid: 600 })).toBe(0);
  });
});

describe('periods', () => {
  it('parses a month and an inclusive date range in server time', () => {
    const m = parsePeriod({ month: '2026-02' });
    expect(m.from).toEqual(new Date(2026, 1, 1));
    expect(m.to).toEqual(new Date(2026, 2, 1));
    const r = parsePeriod({ from: '2026-04-01', to: '2026-06-30' });
    expect(r.to).toEqual(new Date(2026, 6, 1));
    expect(monthsIn(r)).toEqual(['2026-04', '2026-05', '2026-06']);
  });

  it('rejects malformed or reversed periods', () => {
    expect(() => parsePeriod({ month: '2026-4' })).toThrow(/Month/);
    expect(() => parsePeriod({ from: '2026-05-01', to: '2026-04-01' })).toThrow(/after/);
  });

  it('parses reminder schedules', () => {
    expect(parseReminderDays('15, -1,3,3')).toEqual([-1, 3, 15]);
    expect(() => parseReminderDays('1,2,x')).toThrow();
  });
});
