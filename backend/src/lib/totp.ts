import crypto from 'crypto';

/**
 * Time-based one-time passwords (RFC 6238, the codes Google Authenticator, Microsoft
 * Authenticator, Authy etc. show). HMAC-SHA1, 6 digits, 30-second steps. No dependencies.
 */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32 character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160-bit random secret, base32 (what authenticator apps expect). */
export const newTotpSecret = () => base32Encode(crypto.randomBytes(20));

/** HOTP (RFC 4226) for a counter. */
export function hotp(secret: string, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const code = ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(code % 10 ** digits).padStart(digits, '0');
}

export const totp = (secret: string, timeMs = Date.now(), digits = 6, step = 30) => hotp(secret, Math.floor(timeMs / 1000 / step), digits);

/** Accepts the current code and one step either side (clock drift). Constant-time compare. */
export function verifyTotp(secret: string, code: string, timeMs = Date.now(), window = 1): boolean {
  const clean = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const counter = Math.floor(timeMs / 1000 / 30);
  let ok = false;
  for (let d = -window; d <= window; d++) {
    const expected = Buffer.from(hotp(secret, counter + d));
    if (crypto.timingSafeEqual(expected, Buffer.from(clean))) ok = true;
  }
  return ok;
}

export function otpauthUrl(secret: string, account: string, issuer: string) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/** Eight one-time recovery codes (shown once) and their hashes (stored). */
export function newRecoveryCodes() {
  const codes = Array.from({ length: 8 }, () => {
    const raw = base32Encode(crypto.randomBytes(5)).toLowerCase().slice(0, 8);
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
  return { codes, hashes: codes.map(hashRecoveryCode) };
}

export const hashRecoveryCode = (code: string) => crypto.createHash('sha256').update(code.trim().toLowerCase().replace(/[\s-]+/g, '')).digest('hex');
