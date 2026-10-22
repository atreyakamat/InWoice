import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, hashRecoveryCode, hotp, newRecoveryCodes, otpauthUrl, totp, verifyTotp } from '../../src/lib/totp';
import { encodePath, objectUrl, signV4 } from '../../src/lib/s3';
import { ROLES, accessFor, can } from '../../src/lib/permissions';
import { describeRequest } from '../../src/services/audit.service';

describe('TOTP (RFC 6238 / 4226 test vectors)', () => {
  // RFC 6238 appendix B: ASCII secret "12345678901234567890", SHA-1, 8 digits.
  const secret = base32Encode(Buffer.from('12345678901234567890'));

  it('round-trips base32', () => {
    expect(secret).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(secret).toString()).toBe('12345678901234567890');
    expect(base32Decode('gezd gnbv-gy3t')).toEqual(base32Decode('GEZDGNBVGY3T'));
  });

  it('matches the RFC values', () => {
    expect(totp(secret, 59_000, 8)).toBe('94287082');
    expect(totp(secret, 1_111_111_109_000, 8)).toBe('07081804');
    expect(totp(secret, 1_234_567_890_000, 8)).toBe('89005924');
    expect(totp(secret, 2_000_000_000_000, 8)).toBe('69279037');
    expect(hotp(secret, 0)).toBe('755224'); // RFC 4226 appendix D
    expect(hotp(secret, 9)).toBe('520489');
  });

  it('accepts one step of clock drift either way, and nothing else', () => {
    const t = 1_700_000_000_000;
    expect(verifyTotp(secret, totp(secret, t), t)).toBe(true);
    expect(verifyTotp(secret, totp(secret, t - 30_000), t)).toBe(true);
    expect(verifyTotp(secret, totp(secret, t + 30_000), t)).toBe(true);
    expect(verifyTotp(secret, totp(secret, t - 90_000), t)).toBe(false);
    expect(verifyTotp(secret, '12345', t)).toBe(false);
    expect(verifyTotp(secret, 'abcdef', t)).toBe(false);
  });

  it('builds an otpauth link and one-time recovery codes', () => {
    expect(otpauthUrl('ABC', 'me@x.in', 'InWoice Shop')).toBe('otpauth://totp/InWoice%20Shop%3Ame%40x.in?secret=ABC&issuer=InWoice%20Shop&algorithm=SHA1&digits=6&period=30');
    const { codes, hashes } = newRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    expect(codes[0]).toMatch(/^[a-z2-7]{4}-[a-z2-7]{4}$/);
    expect(hashRecoveryCode(codes[0]!.toUpperCase().replace('-', ' '))).toBe(hashes[0]);
  });
});

describe('S3 request signing (AWS Signature V4)', () => {
  it('matches the AWS test-suite "get-vanilla" signature', () => {
    const h = signV4({
      method: 'GET',
      url: new URL('https://example.amazonaws.com/'),
      region: 'us-east-1',
      service: 'service',
      accessKey: 'AKIDEXAMPLE',
      secretKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      headers: {},
      payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      now: new Date('2015-08-30T12:36:00Z'),
    });
    expect(h.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    );
    expect(h['x-amz-date']).toBe('20150830T123600Z');
  });

  it('uses virtual-hosted URLs on AWS and path-style elsewhere', () => {
    expect(objectUrl({ region: 'ap-south-1', bucket: 'b', accessKey: '', secretKey: '' }, 'inwoice/x y.gz').toString()).toBe('https://b.s3.ap-south-1.amazonaws.com/inwoice/x%20y.gz');
    expect(objectUrl({ endpoint: 'https://acc.r2.cloudflarestorage.com/', region: 'auto', bucket: 'b', accessKey: '', secretKey: '' }, 'k.gz').toString()).toBe('https://acc.r2.cloudflarestorage.com/b/k.gz');
    expect(encodePath("a/it's (1)")).toBe('a/it%27s%20%281%29');
  });
});

describe('roles', () => {
  it('gives owners and general staff everything, and narrower roles less', () => {
    for (const r of ['ADMIN', 'STAFF']) expect(Object.values(accessFor(r)).every((a) => a === 'write')).toBe(true);
    expect(can('SALES', 'sales', 'write')).toBe(true);
    expect(can('SALES', 'catalog', 'write')).toBe(false);
    expect(can('SALES', 'catalog', 'read')).toBe(true);
    expect(can('SALES', 'payables', 'read')).toBe(false);
    expect(can('STORES', 'inventory', 'write')).toBe(true);
    expect(can('STORES', 'sales', 'write')).toBe(false);
    expect(can('ACCOUNTANT', 'payables', 'write')).toBe(true);
    expect(can('ACCOUNTANT', 'accounts', 'read')).toBe(true);
    expect(can('ACCOUNTANT', 'sales', 'write')).toBe(false);
    expect(can('SOMETHING_ELSE', 'payables', 'read')).toBe(false); // unknown roles get the narrowest access
    expect(ROLES).toContain('ACCOUNTANT');
  });
});

describe('audit descriptions', () => {
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
  const pid = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
  it('turns API calls into readable actions', () => {
    expect(describeRequest('POST', '/api/invoices')).toEqual({ entity: 'invoices', entityId: null, action: 'CREATE' });
    expect(describeRequest('PUT', `/api/invoices/${id}`)).toEqual({ entity: 'invoices', entityId: id, action: 'UPDATE' });
    expect(describeRequest('POST', `/api/invoices/${id}/cancel`)).toEqual({ entity: 'invoices', entityId: id, action: 'CANCEL' });
    expect(describeRequest('POST', `/api/invoices/${id}/payments`).action).toBe('PAYMENT');
    expect(describeRequest('DELETE', `/api/invoices/${id}/payments/${pid}`).action).toBe('PAYMENT_DELETE');
    expect(describeRequest('DELETE', `/api/customers/${id}`).action).toBe('DELETE');
    expect(describeRequest('PATCH', `/api/quotes/${id}/status`).action).toBe('STATUS');
    expect(describeRequest('PUT', '/api/settings').action).toBe('UPDATE');
    expect(describeRequest('POST', '/api/settings/test-email').action).toBe('TEST_EMAIL');
  });
});
