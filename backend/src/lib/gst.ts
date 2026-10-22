/**
 * Indian GST helpers: state codes, GSTIN validation and place-of-supply resolution.
 * State codes are the two-digit prefixes used in GSTINs and in GSTR-1 "Place Of Supply".
 */

export const GST_STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
};

const norm = (v: string) => v.toLowerCase().replace(/&/g, 'and').replace(/[^a-z]/g, '');

const BY_NAME = new Map<string, string>(Object.entries(GST_STATES).map(([code, name]) => [norm(name), code]));
const ALIASES: Record<string, string> = {
  jandk: '01', jammukashmir: '01', jk: '01',
  hp: '02',
  uttaranchal: '05', uk: '05',
  newdelhi: '07', nctofdelhi: '07', dl: '07',
  up: '09',
  orissa: '21',
  cg: '22', chattisgarh: '22',
  mp: '23',
  gj: '24',
  damananddiu: '26', dadraandnagarhaveli: '26', dnh: '26', dnhdd: '26',
  mh: '27', bombay: '27',
  ka: '29',
  ga: '30',
  kl: '32',
  tn: '33', tamilnadu: '33',
  pondicherry: '34', py: '34',
  andamanandnicobar: '35', andaman: '35',
  ts: '36', tg: '36',
  ap: '37', andhra: '37',
  la: '38',
  wb: '19', westbengal: '19',
  rj: '08',
  hr: '06',
  pb: '03',
};

/** Resolve a state name, alias or "30-Goa" style label to its 2-digit code. */
export function stateCode(value?: string | null): string | null {
  if (!value) return null;
  const v = value.trim();
  const prefixed = v.match(/^(\d{2})\b/);
  if (prefixed && GST_STATES[prefixed[1]!]) return prefixed[1]!;
  const key = norm(v);
  return BY_NAME.get(key) ?? ALIASES[key] ?? null;
}

/** "30-Goa": the format GSTR-1 uses for place of supply. */
export function stateLabel(code: string | null): string {
  return code && GST_STATES[code] ? `${code}-${GST_STATES[code]}` : '';
}

const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Compute the 15th (check) character of a GSTIN from its first 14. */
export function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = GSTIN_CHARS.indexOf(first14[i]!) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36]!;
}

/** Structure, state code and checksum. Returns an error message, or null when valid. */
export function gstinError(raw: string): string | null {
  const g = raw.trim().toUpperCase();
  if (!GSTIN_PATTERN.test(g)) return 'GSTIN must be 15 characters like 27AAPFU0939F1ZV';
  if (!GST_STATES[g.slice(0, 2)] && g.slice(0, 2) !== '99') return 'GSTIN starts with an unknown state code';
  if (gstinCheckChar(g.slice(0, 14)) !== g[14]) return 'GSTIN check digit does not match. Check for a typo.';
  return null;
}

/**
 * Place-of-supply code for a customer: the explicit place of supply, else their state,
 * else the state embedded in their GSTIN.
 */
export function placeOfSupplyCode(pos: string | null | undefined, state: string | null | undefined, gstin: string | null | undefined) {
  return stateCode(pos) ?? stateCode(state) ?? (gstin ? stateCode(gstin.slice(0, 2)) : null);
}

/** Business's own state code: settings.state, else its GSTIN prefix. */
export function businessStateCode(state: string | null | undefined, gstNumber: string | null | undefined) {
  return stateCode(state) ?? (gstNumber ? stateCode(gstNumber.slice(0, 2)) : null);
}
