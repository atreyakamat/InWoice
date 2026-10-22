import crypto from 'crypto';

/**
 * Minimal S3-compatible upload (AWS Signature Version 4) with no SDK, so off-site backups
 * work with AWS S3, Cloudflare R2, Backblaze B2, Wasabi, DigitalOcean Spaces or MinIO
 * without adding megabytes of dependencies.
 */

export interface S3Config {
  endpoint?: string | null; // e.g. https://<account>.r2.cloudflarestorage.com; blank = AWS
  region: string; // e.g. ap-south-1 (R2: auto)
  bucket: string;
  accessKey: string;
  secretKey: string;
}

const sha256 = (data: string | Buffer) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key: Buffer | string, data: string) => crypto.createHmac('sha256', key).update(data).digest();

/** RFC 3986 encoding as SigV4 expects (keep / in paths). */
export const encodePath = (p: string) => p.split('/').map((seg) => encodeURIComponent(seg).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');

export interface SignInput {
  method: string;
  url: URL;
  region: string;
  service: string;
  accessKey: string;
  secretKey: string;
  headers: Record<string, string>; // headers to sign (host is added)
  payloadHash: string;
  now?: Date;
}

/** Returns the headers to send, including Authorization and x-amz-date. */
export function signV4(i: SignInput): Record<string, string> {
  const now = i.now ?? new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // 20150830T123600Z
  const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = { ...Object.fromEntries(Object.entries(i.headers).map(([k, v]) => [k.toLowerCase(), v.trim()])), host: i.url.host, 'x-amz-date': amzDate };
  const names = Object.keys(headers).sort();
  const query = [...i.url.searchParams.entries()]
    .map(([k, v]) => [encodeURIComponent(k), encodeURIComponent(v)])
    .sort(([a], [b]) => (a! < b! ? -1 : a! > b! ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const canonical = [
    i.method,
    encodePath(decodeURIComponent(i.url.pathname)) || '/',
    query,
    names.map((n) => `${n}:${headers[n]}\n`).join(''),
    names.join(';'),
    i.payloadHash,
  ].join('\n');
  const scope = `${day}/${i.region}/${i.service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${i.secretKey}`, day), i.region), i.service), 'aws4_request');
  const signature = crypto.createHmac('sha256', key).update(toSign).digest('hex');
  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${i.accessKey}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`,
  };
}

/** Object URL: virtual-hosted style for AWS, path style for everyone else. */
export function objectUrl(cfg: S3Config, key: string): URL {
  const endpoint = (cfg.endpoint || `https://s3.${cfg.region}.amazonaws.com`).replace(/\/+$/, '');
  const base = new URL(endpoint);
  if (/amazonaws\.com$/.test(base.hostname)) return new URL(`${base.protocol}//${cfg.bucket}.${base.host}/${encodePath(key)}`);
  return new URL(`${endpoint}/${encodePath(cfg.bucket)}/${encodePath(key)}`);
}

export async function s3Put(cfg: S3Config, key: string, body: Buffer, contentType = 'application/octet-stream') {
  const url = objectUrl(cfg, key);
  const payloadHash = sha256(body);
  const headers = signV4({
    method: 'PUT',
    url,
    region: cfg.region,
    service: 's3',
    accessKey: cfg.accessKey,
    secretKey: cfg.secretKey,
    headers: { 'content-type': contentType, 'x-amz-content-sha256': payloadHash },
    payloadHash,
  });
  delete headers.host; // fetch sets it
  const res = await fetch(url, { method: 'PUT', headers, body: new Uint8Array(body), signal: AbortSignal.timeout(120_000) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const code = text.match(/<Code>([^<]+)<\/Code>/)?.[1];
    const message = text.match(/<Message>([^<]+)<\/Message>/)?.[1];
    throw new Error(`Storage refused the upload (${res.status}${code ? ` ${code}` : ''})${message ? `: ${message}` : ''}`);
  }
  return { url: url.toString(), etag: res.headers.get('etag') };
}
