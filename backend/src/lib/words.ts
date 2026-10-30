/**
 * Amounts in words, Indian style (lakh, crore), as printed on GST invoices:
 * 141600.5 → "Rupees One Lakh Forty-One Thousand Six Hundred and Fifty Paise Only".
 */

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(n: number) {
  if (n < 20) return ONES[n]!;
  const t = TENS[Math.floor(n / 10)]!;
  return n % 10 ? `${t}-${ONES[n % 10]}` : t;
}

function belowThousand(n: number) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', rest ? belowHundred(rest) : ''].filter(Boolean).join(' ');
}

/** A whole number in words with Indian grouping. 0 → "Zero". */
export function numberInWords(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  if (crore) parts.push(`${numberInWords(crore)} Crore`); // 100 crore and up read as "One Hundred Crore"
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (n) parts.push(belowThousand(n));
  return parts.join(' ');
}

/** Money in words. INR uses rupees and paise; other currencies use their code. */
export function amountInWords(amount: number, currency = 'INR'): string {
  const paiseTotal = Math.round(Math.abs(amount) * 100);
  const whole = Math.floor(paiseTotal / 100);
  const fraction = paiseTotal % 100;
  const inr = currency === 'INR';
  const main = `${inr ? 'Rupees' : currency} ${numberInWords(whole)}`;
  const sub = fraction ? ` and ${belowHundred(fraction)} ${inr ? 'Paise' : 'Cents'}` : '';
  return `${amount < 0 ? 'Minus ' : ''}${main}${sub} Only`;
}
