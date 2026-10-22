import { describe, expect, it } from 'vitest';
import { guessMapping, parseBankAmount, parseBankDate, parseCsv, readStatement } from '../../src/services/bank.service';
import { gstr1Json, normaliseDocNumber, parseGstr2b } from '../../src/services/gstn.service';
import type { GstReport } from '../../src/services/gst.service';

const ymd = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null);

describe('bank statement CSV', () => {
  it('parses quoted cells, commas and new lines inside quotes', () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,"two\nlines",3\n\n')).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['1', 'two\nlines', '3'],
    ]);
  });

  it('finds the columns of common Indian bank exports, skipping header junk', () => {
    const hdfc = parseCsv('HDFC BANK Ltd.\nStatement of account\nDate,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance\n01/10/26,UPI-ASHA,0001,01/10/26,,"1,180.00","11,180.00"\n');
    expect(guessMapping(hdfc)).toMatchObject({ headerRow: 2, date: 0, description: 1, reference: 2, debit: 4, credit: 5, balance: 6 });
    const sbi = parseCsv('Txn Date,Value Date,Description,Ref No./Cheque No.,Debit,Credit,Balance\n');
    expect(guessMapping(sbi)).toMatchObject({ date: 0, description: 2, reference: 3, debit: 4, credit: 5, balance: 6 });
    const icici = parseCsv('S No.,Value Date,Transaction Date,Cheque Number,Transaction Remarks,Withdrawal Amount (INR ),Deposit Amount (INR ),Balance (INR )\n');
    expect(guessMapping(icici)).toMatchObject({ date: 2, description: 4, reference: 3, debit: 5, credit: 6, balance: 7 });
    expect(guessMapping(parseCsv('foo,bar\n1,2\n'))).toBeNull();
  });

  it('reads dates and amounts in the formats banks use', () => {
    expect(ymd(parseBankDate('05/10/2026'))).toBe('2026-10-05');
    expect(ymd(parseBankDate('05-10-26'))).toBe('2026-10-05');
    expect(ymd(parseBankDate('05-Oct-2026'))).toBe('2026-10-05');
    expect(ymd(parseBankDate('5 Oct 2026'))).toBe('2026-10-05');
    expect(ymd(parseBankDate('2026-10-05'))).toBe('2026-10-05');
    expect(ymd(parseBankDate('10/05/2026', 'MDY'))).toBe('2026-10-05');
    expect(parseBankDate('Opening balance')).toBeNull();
    expect(parseBankAmount('1,23,456.50')).toBe(123456.5);
    expect(parseBankAmount('₹ 500')).toBe(500);
    expect(parseBankAmount('(250.00)')).toBe(-250);
    expect(parseBankAmount('1,000.00 Dr')).toBe(-1000);
    expect(parseBankAmount('')).toBeNull();
    expect(parseBankAmount('-')).toBeNull();
  });

  it('turns rows into signed transactions and skips non-transaction rows', () => {
    const rows = parseCsv('Date,Narration,Ref,Withdrawal,Deposit,Balance\n01/10/26,UPI ASHA,R1,,1180.00,11180\n02/10/26,RENT OCT,R2,"5,000.00",,6180\n,Closing balance,,,,6180\n');
    const { lines, skipped } = readStatement(rows, guessMapping(rows)!);
    expect(lines.map((l) => [ymd(l.date), l.description, l.amount, l.balance])).toEqual([
      ['2026-10-01', 'UPI ASHA', 1180, 11180],
      ['2026-10-02', 'RENT OCT', -5000, 6180],
    ]);
    expect(skipped).toBe(1);
  });
});

describe('GST portal files', () => {
  it('compares bill numbers the way people actually type them', () => {
    expect(normaliseDocNumber('PP/2026-27/0101')).toBe(normaliseDocNumber('pp 2026 27 0101'));
    expect(normaliseDocNumber('000123')).toBe('123');
  });

  it('reads B2B invoices from a GSTR-2B download', () => {
    const r = parseGstr2b({
      data: {
        rtnprd: '102026',
        docdata: { b2b: [{ ctin: '27aaacm5678r1zl', trdnm: 'Mumbai Inks', inv: [{ inum: 'MH/77', dt: '05-10-2026', val: 2016, itcavl: 'Y', items: [{ rt: 12, txval: 1800, igst: 216, cgst: 0, sgst: 0 }] }] }] },
      },
    });
    expect(r.period).toBe('102026');
    expect(r.invoices[0]).toMatchObject({ gstin: '27AAACM5678R1ZL', number: 'MH/77', taxable: 1800, igst: 216, itcAvailable: true });
    expect(() => parseGstr2b({ hello: 1 })).toThrow(/GSTR-2B/);
  });

  it('builds GSTR-1 JSON in the offline tool layout', () => {
    const report = {
      business: { name: 'Shop', gstin: '30ABCDE1234F1ZD', state: '30-Goa' },
      b2b: [{ gstin: '27AAACN1234B1Z5', receiverName: 'Cafe', invoiceNumber: 'G-0001', invoiceDate: '05-Oct-26', invoiceDateIso: '2026-10-05', invoiceValue: 1180, placeOfSupply: '27-Maharashtra', rate: 18, inter: true, taxable: 1000, igst: 180, cgst: 0, sgst: 0 }],
      b2cl: [],
      b2cs: [{ placeOfSupply: '30-Goa', rate: 18, taxable: 400, igst: 0, cgst: 36, sgst: 36 }],
      cdnr: [],
      cdnur: [],
      hsn: [
        { hsn: '4911', description: 'Sticker', rate: 18, quantity: 10, totalValue: 1180, taxable: 1000, igst: 180, cgst: 0, sgst: 0, supplyType: 'B2B' },
        { hsn: '4911', description: 'Sticker', rate: 18, quantity: 4, totalValue: 472, taxable: 400, igst: 0, cgst: 36, sgst: 36, supplyType: 'B2C' },
      ],
      docs: [{ nature: 'Invoices for outward supply', from: 'G-0001', to: 'G-0002', total: 2, cancelled: 0 }],
    } as unknown as GstReport;
    const j = gstr1Json(report, '30ABCDE1234F1ZD', '102026');
    expect(j).toMatchObject({ gstin: '30ABCDE1234F1ZD', fp: '102026' });
    expect(j.b2b![0]).toEqual({
      ctin: '27AAACN1234B1Z5',
      inv: [{ inum: 'G-0001', idt: '05-10-2026', val: 1180, pos: '27', rchrg: 'N', inv_typ: 'R', itms: [{ num: 1801, itm_det: { txval: 1000, rt: 18, iamt: 180, csamt: 0 } }] }],
    });
    expect(j.b2cs![0]).toEqual({ sply_ty: 'INTRA', pos: '30', typ: 'OE', rt: 18, txval: 400, camt: 36, samt: 36, csamt: 0 });
    expect(j.hsn.hsn_b2b).toHaveLength(1);
    expect(j.hsn.hsn_b2c[0]).toMatchObject({ hsn_sc: '4911', uqc: 'NOS', qty: 4, camt: 36 });
    expect(j.doc_issue!.doc_det[0]).toEqual({ doc_num: 1, docs: [{ num: 1, from: 'G-0001', to: 'G-0002', totnum: 2, cancel: 0, net_issue: 2 }] });
    expect(j).not.toHaveProperty('cdnr');
  });
});
