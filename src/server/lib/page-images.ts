/**
 * Finds and downloads product pictures from a deal link.
 *
 * Because the SERVER fetches whatever address a user types, every request is guarded:
 *  - http/https only, ports 80/443 only, no user:password in the address
 *  - the host name is resolved first and refused if it points at a private, loopback,
 *    link-local or otherwise internal address; the connection then uses that exact checked
 *    address (so the name cannot be switched to an internal one between check and connect)
 *  - redirects are followed manually (max 4) and each hop is checked again
 *  - time and size limits on every download
 */
import dns from 'node:dns';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR, MAX_IMAGE_BYTES } from './uploads.js';

// Re-use connections (shops serve all their pictures from one host) - saves a handshake per picture.
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 16, keepAliveMsecs: 10_000 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 16, keepAliveMsecs: 10_000 });

const USER_AGENT = 'Mozilla/5.0 (compatible; ChennaiDealsBot/1.0; +https://chennaideals.in)';
const MAX_HTML_BYTES = 1_500_000;
const MIN_IMAGE_BYTES = 2_000;
const MAX_CANDIDATES = 10;

// ---------- address safety ----------

export function isBlockedAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === '::' || l === '::1') return true;
    if (l.startsWith('::ffff:')) {
      const v4 = l.slice(7);
      return net.isIPv4(v4) ? isBlockedAddress(v4) : true;
    }
    return (
      l.startsWith('fc') || l.startsWith('fd') ||
      l.startsWith('fe8') || l.startsWith('fe9') || l.startsWith('fea') || l.startsWith('feb') ||
      l.startsWith('ff') || l.startsWith('64:ff9b') || l.startsWith('2001:db8')
    );
  }
  return true;
}

export function parsePublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('That is not a valid web address');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only http and https addresses are allowed');
  if (url.username || url.password) throw new Error('Addresses with a user name or password are not allowed');
  if (url.port && url.port !== '80' && url.port !== '443') throw new Error('Only the standard web ports are allowed');
  return url;
}

const dnsCache = new Map<string, { addr: { address: string; family: number }; expires: number }>();

async function resolvePublic(hostname: string): Promise<{ address: string; family: number }> {
  const bare = hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(bare)) {
    if (isBlockedAddress(bare)) throw new Error('That address is not allowed');
    return { address: bare, family: net.isIPv6(bare) ? 6 : 4 };
  }
  const cached = dnsCache.get(bare);
  if (cached && cached.expires > Date.now()) return cached.addr;
  const found = await dns.promises.lookup(bare, { all: true });
  if (found.length === 0 || found.some((f) => isBlockedAddress(f.address))) {
    throw new Error('That address is not allowed');
  }
  const addr = { address: found[0].address, family: found[0].family };
  dnsCache.set(bare, { addr, expires: Date.now() + 60_000 }); // only safe answers are ever cached
  if (dnsCache.size > 500) dnsCache.clear();
  return addr;
}

// ---------- guarded download ----------

export type SafeResponse = { status: number; headers: http.IncomingHttpHeaders; body: Buffer; finalUrl: string };

type GetOptions = { maxBytes: number; truncate?: boolean; accept?: string; referer?: string; timeoutMs?: number; compress?: boolean };

function requestOnce(url: URL, addr: { address: string; family: number }, opts: GetOptions): Promise<Omit<SafeResponse, 'finalUrl'>> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    let settled = false;
    const finish = (fn: () => void) => { if (!settled) { settled = true; fn(); } };
    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname.replace(/^\[|\]$/g, ''),
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        agent: url.protocol === 'https:' ? httpsAgent : httpAgent,
        timeout: opts.timeoutMs ?? 8000,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: opts.accept ?? '*/*',
          'Accept-Language': 'en-IN,en;q=0.9',
          'Accept-Encoding': opts.compress ? 'gzip, deflate, br' : 'identity',
          ...(opts.referer ? { Referer: opts.referer } : {}),
        },
        // Always connect to the address we already checked.
        lookup: ((_host: string, options: { all?: boolean }, cb: (...args: unknown[]) => void) => {
          if (options && options.all) cb(null, [{ address: addr.address, family: addr.family }]);
          else cb(null, addr.address, addr.family);
        }) as unknown as net.LookupFunction,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        const enc = String(res.headers['content-encoding'] ?? '').toLowerCase();
        let body: NodeJS.ReadableStream = res;
        if (opts.compress) {
          if (enc === 'gzip' || enc === 'x-gzip') body = res.pipe(zlib.createGunzip());
          else if (enc === 'deflate') body = res.pipe(zlib.createInflate());
          else if (enc === 'br') body = res.pipe(zlib.createBrotliDecompress());
        }
        const status = res.statusCode ?? 0;
        body.on('data', (chunk: Buffer) => {
          if (settled) return;
          total += chunk.length;
          if (total > opts.maxBytes) {
            if (opts.truncate) {
              chunks.push(chunk.subarray(0, chunk.length - (total - opts.maxBytes)));
              finish(() => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) }));
            } else {
              finish(() => reject(new Error('The file is too large')));
            }
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });
        body.on('end', () => finish(() => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) })));
        body.on('error', (err: Error) => finish(() => reject(err)));
        res.on('error', (err) => finish(() => reject(err)));
      },
    );
    req.on('timeout', () => { if (!settled) req.destroy(new Error('The website took too long to answer')); });
    req.on('error', (err) => finish(() => reject(err)));
    req.end();
  });
}

export async function safeGet(rawUrl: string, opts: GetOptions): Promise<SafeResponse> {
  let current = rawUrl;
  for (let hop = 0; hop <= 4; hop++) {
    const url = parsePublicHttpUrl(current);
    const addr = await resolvePublic(url.hostname);
    const res = await requestOnce(url, addr, opts);
    if ([301, 302, 303, 307, 308].includes(res.status) && res.headers.location) {
      current = new URL(String(res.headers.location), url).toString();
      continue;
    }
    return { ...res, finalUrl: url.toString() };
  }
  throw new Error('The link redirects too many times');
}

// ---------- finding pictures on a page ----------

function decodeEntities(s: string): string {
  return s.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#0?39;/g, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`(?:^|[\\s"'])${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  const v = m ? (m[1] ?? m[2] ?? m[3] ?? null) : null;
  return v === null ? null : decodeEntities(v.trim());
}

function collectJsonLdImages(node: unknown, out: string[], depth = 0): void {
  if (depth > 6 || node === null || node === undefined) return;
  if (Array.isArray(node)) { node.forEach((n) => collectJsonLdImages(n, out, depth + 1)); return; }
  if (typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  const img = obj.image;
  if (typeof img === 'string') out.push(img);
  else if (Array.isArray(img)) img.forEach((i) => { if (typeof i === 'string') out.push(i); else if (i && typeof i === 'object' && typeof (i as { url?: unknown }).url === 'string') out.push((i as { url: string }).url); });
  else if (img && typeof img === 'object' && typeof (img as { url?: unknown }).url === 'string') out.push((img as { url: string }).url);
  for (const v of Object.values(obj)) if (v && typeof v === 'object') collectJsonLdImages(v, out, depth + 1);
}

const JUNK = /(logo|icon|sprite|pixel|spacer|blank|avatar|badge|placeholder|tracking|1x1|loading|flag-|payment|star-)/i;

export function extractImageUrls(html: string, baseUrl: string): string[] {
  const strong: string[] = [];
  const weak: string[] = [];

  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attr(tag, 'property') ?? attr(tag, 'name') ?? '').toLowerCase();
    if (['og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'twitter:image:src'].includes(key)) {
      const c = attr(tag, 'content');
      if (c) strong.push(c);
    }
  }
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if ((attr(tag, 'rel') ?? '').toLowerCase() === 'image_src') {
      const h = attr(tag, 'href');
      if (h) strong.push(h);
    }
  }
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { collectJsonLdImages(JSON.parse(m[1]), strong); } catch { /* ignore broken JSON-LD */ }
  }
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const w = Number(attr(tag, 'width') ?? '');
    const h = Number(attr(tag, 'height') ?? '');
    if ((w && w < 120) || (h && h < 120)) continue;
    const srcset = attr(tag, 'srcset');
    const best = srcset ? srcset.split(',').map((s) => s.trim().split(/\s+/)[0]).filter(Boolean).pop() : null;
    const src = best || attr(tag, 'data-src') || attr(tag, 'data-old-hires') || attr(tag, 'src');
    if (src) weak.push(src);
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of [...strong, ...weak]) {
    if (!raw || raw.startsWith('data:')) continue;
    let abs: URL;
    try { abs = new URL(raw, baseUrl); } catch { continue; }
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') continue;
    const href = abs.toString();
    if (/\.(svg|gif|ico)(\?|$)/i.test(abs.pathname)) continue;
    if (JUNK.test(abs.pathname)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    result.push(href);
    if (result.length >= MAX_CANDIDATES) break;
  }
  return result;
}

export async function findPageImages(pageUrl: string): Promise<{ images: string[]; note?: string }> {
  let res: SafeResponse;
  try {
    res = await safeGet(pageUrl, { maxBytes: MAX_HTML_BYTES, truncate: true, accept: 'text/html,application/xhtml+xml', compress: true });
  } catch (err) {
    return { images: [], note: err instanceof Error ? err.message : 'Could not open that link' };
  }
  if (res.status >= 400) {
    return { images: [], note: 'That website refused automatic access. Please upload the pictures yourself.' };
  }
  const type = String(res.headers['content-type'] ?? '');
  if (!/html|xml/i.test(type)) {
    return { images: [], note: 'That link is not a web page.' };
  }
  const images = extractImageUrls(res.body.toString('utf8'), res.finalUrl);
  if (images.length === 0) {
    return { images, note: 'No usable pictures were found on that page (many big shops hide them from automatic readers). Please upload pictures yourself.' };
  }
  return { images };
}

// ---------- downloading a chosen picture ----------

function sniffImage(buf: Buffer): { ext: string; mime: string } | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: '.jpg', mime: 'image/jpeg' };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: '.png', mime: 'image/png' };
  if (buf.length > 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return { ext: '.webp', mime: 'image/webp' };
  return null;
}

export async function downloadImageToUpload(
  imageUrl: string,
  referer?: string,
): Promise<{ path: string; filename: string; mimetype: string; size: number }> {
  const res = await safeGet(imageUrl, { maxBytes: MAX_IMAGE_BYTES, accept: 'image/jpeg,image/png,image/webp,*/*;q=0.5', referer });
  if (res.status !== 200) throw new Error('The picture could not be downloaded');
  if (res.body.length < MIN_IMAGE_BYTES) throw new Error('The picture is too small');
  const kind = sniffImage(res.body);
  if (!kind) throw new Error('Only JPG, PNG or WebP pictures can be copied');
  const filename = crypto.randomBytes(16).toString('hex') + kind.ext;
  const full = path.join(UPLOAD_DIR, filename);
  await fs.promises.writeFile(full, res.body);
  return { path: full, filename, mimetype: kind.mime, size: res.body.length };
}

// ---------- simple per-user rate limit (in memory) ----------

const lookups = new Map<string, number[]>();
export function allowLookup(userId: string, perMinute = 12): boolean {
  const now = Date.now();
  const recent = (lookups.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= perMinute) { lookups.set(userId, recent); return false; }
  recent.push(now);
  lookups.set(userId, recent);
  return true;
}
