let currencySymbol = '₹';
let locale = 'en-IN';

/** Called once settings load so every money() call uses the business currency. */
export function setCurrency(symbol: string, currency: string) {
  currencySymbol = symbol || '₹';
  locale = currency === 'INR' ? 'en-IN' : 'en-US';
}

export function money(n: number | null | undefined, opts: { decimals?: number } = {}) {
  const d = opts.decimals ?? 2;
  const v = Number(n ?? 0);
  return `${v < 0 ? '-' : ''}${currencySymbol}${Math.abs(v).toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}

export function num(n: number | null | undefined, decimals = 2) {
  return Number(n ?? 0).toLocaleString(locale, { maximumFractionDigits: decimals });
}

export function date(d: string | Date | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function dateTime(d: string | Date | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** yyyy-mm-dd for <input type="date">. */
export function isoDate(d: string | Date | null | undefined) {
  if (!d) return '';
  const x = new Date(d);
  return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export const titleCase = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
