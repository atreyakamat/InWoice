import { describe, expect, it } from 'vitest';
import { parseOrigins } from '../../src/lib/config';

describe('House of Stix framing', () => {
  it('keeps only real http(s) origins from CONTROL_ROOM_ORIGIN', () => {
    expect(parseOrigins('http://192.168.1.10:8200')).toEqual(['http://192.168.1.10:8200']);
    expect(parseOrigins('http://lab:8200/, https://hub.example.com')).toEqual(['http://lab:8200', 'https://hub.example.com']);
    expect(parseOrigins("'unsafe-inline' javascript:alert(1) *")).toEqual([]);
    expect(parseOrigins('http://a.b; script-src *')).toEqual([]);
    expect(parseOrigins(undefined)).toEqual([]);
  });
});
