import { describe, expect, it } from 'vitest';
import { amountInWords, numberInWords } from '../../src/lib/words';
import { salesHeading, unicodeFonts } from '../../src/services/pdf.service';

describe('amount in words (Indian system)', () => {
  it.each([
    [0, 'Zero'],
    [7, 'Seven'],
    [19, 'Nineteen'],
    [42, 'Forty-Two'],
    [100, 'One Hundred'],
    [5779, 'Five Thousand Seven Hundred Seventy-Nine'],
    [100000, 'One Lakh'],
    [141600, 'One Lakh Forty-One Thousand Six Hundred'],
    [9999999, 'Ninety-Nine Lakh Ninety-Nine Thousand Nine Hundred Ninety-Nine'],
    [12345678, 'One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight'],
    [1500000000, 'One Hundred Fifty Crore'],
  ])('%i → %s', (n, words) => {
    expect(numberInWords(n)).toBe(words);
  });

  it('adds paise and "Only"', () => {
    expect(amountInWords(5779)).toBe('Rupees Five Thousand Seven Hundred Seventy-Nine Only');
    expect(amountInWords(141.6)).toBe('Rupees One Hundred Forty-One and Sixty Paise Only');
    expect(amountInWords(0.05)).toBe('Rupees Zero and Five Paise Only');
    expect(amountInWords(704.46)).toBe('Rupees Seven Hundred Four and Forty-Six Paise Only');
  });

  it('rounds to the paisa (no 0.1 + 0.2 surprises)', () => {
    expect(amountInWords(0.1 + 0.2)).toBe('Rupees Zero and Thirty Paise Only');
    expect(amountInWords(1999.995)).toBe('Rupees Two Thousand Only');
  });

  it('other currencies use their code', () => {
    expect(amountInWords(12.5, 'USD')).toBe('USD Twelve and Fifty Cents Only');
  });
});

describe('invoice title', () => {
  const registered = { gstNumber: '30ABCDE1234F1ZD' };
  it('GST-registered: Tax Invoice, or Bill of Supply when nothing is taxed', () => {
    expect(salesHeading('INVOICE', registered, 729)).toBe('TAX INVOICE');
    expect(salesHeading('INVOICE', registered, 0)).toBe('BILL OF SUPPLY');
  });
  it('not registered: plain Invoice; quotes stay Quotation', () => {
    expect(salesHeading('INVOICE', { gstNumber: null }, 729)).toBe('INVOICE');
    expect(salesHeading('QUOTATION', registered, 729)).toBe('QUOTATION');
  });
  it('the ₹ font is bundled', () => {
    expect(unicodeFonts).toBe(true);
  });
});
