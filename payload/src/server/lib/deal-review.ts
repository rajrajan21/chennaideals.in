/**
 * Automatic review of a submitted deal: opens the link safely, looks the website up, applies the
 * rules in deal-review-core.ts. Everything here is free (no paid service is needed).
 * Optional free extra: SAFE_BROWSING_API_KEY (Google Safe Browsing) checks the link against Google's list.
 */
import { getSecret } from '#airo/secrets';
import { safeGet } from './page-images.js';
import { extractProductFacts } from './deal-facts.js';
import { assess, registrableDomain, isOfficialDomain, type Evidence, type PageInfo, type ReviewInput, type Verdict } from './deal-review-core.js';

async function readPage(url: string): Promise<{ page: PageInfo | null; problem: Evidence['fetchProblem'] }> {
  try {
    const res = await safeGet(url, { maxBytes: 1_500_000, truncate: true, accept: 'text/html,application/xhtml+xml', timeoutMs: 8_000, compress: true });
    const type = String(res.headers['content-type'] ?? '');
    const html = res.status < 400 && /html|xml/i.test(type) ? res.body.toString('utf8') : '';
    const facts = html ? extractProductFacts(html, res.finalUrl) : null;
    const title = html ? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.replace(/\s+/g, ' ').trim().slice(0, 200) : undefined;
    return {
      page: { finalUrl: res.finalUrl, status: res.status, html, text: facts?.text ?? '', title, pagePrice: facts?.price },
      problem: null,
    };
  } catch (err) {
    const e = err as { code?: string; message?: string };
    const msg = String(e?.message ?? '');
    if (e?.code === 'ENOTFOUND') return { page: null, problem: 'dns' };
    if (/not allowed|not a valid web address|standard web ports|user name or password|Only http/i.test(msg)) return { page: null, problem: 'unsafe' };
    if (/took too long|timeout|ETIMEDOUT/i.test(msg + (e?.code ?? ''))) return { page: null, problem: 'timeout' };
    if (/ECONNRESET|ECONNREFUSED|EAI_AGAIN|certificate|SSL|TLS|too many times/i.test(msg + (e?.code ?? ''))) return { page: null, problem: 'other' };
    return { page: null, problem: 'other' };
  }
}

/** Age of the domain in days from the public RDAP registry (free). null when unknown. */
async function domainAgeDays(host: string): Promise<number | null> {
  try {
    const domain = registrableDomain(host);
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return null;
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      headers: { accept: 'application/rdap+json, application/json' },
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { events?: { eventAction?: string; eventDate?: string }[] };
    const reg = data.events?.find((e) => e.eventAction === 'registration')?.eventDate;
    if (!reg) return null;
    const ms = Date.now() - new Date(reg).getTime();
    return Number.isFinite(ms) && ms >= 0 ? Math.floor(ms / 86_400_000) : null;
  } catch {
    return null;
  }
}

async function safeBrowsingHit(url: string): Promise<boolean> {
  const key = getSecret('SAFE_BROWSING_API_KEY');
  if (!key) return false;
  try {
    const res = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: { clientId: 'chennaideals', clientVersion: '1.0' },
        threatInfo: {
          threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url }],
        },
      }),
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { matches?: unknown[] };
    return Array.isArray(data.matches) && data.matches.length > 0;
  } catch {
    return false;
  }
}

export async function reviewDealText(input: ReviewInput): Promise<Verdict> {
  let page: PageInfo | null = null;
  let problem: Evidence['fetchProblem'] = null;
  let age: number | null = null;
  let hit = false;

  if (input.url) {
    let host = '';
    try { host = new URL(input.url).hostname; } catch { /* assess() reports an invalid address */ }
    const official = host ? isOfficialDomain(host) : false;
    const [p, a, s] = await Promise.all([
      readPage(input.url),
      host && !official ? domainAgeDays(host) : Promise.resolve(null),
      safeBrowsingHit(input.url),
    ]);
    page = p.page;
    problem = p.problem;
    age = a;
    hit = s;
    // The final address after redirects may be a different shop: look that one up too.
    if (page) {
      try {
        const finalHost = new URL(page.finalUrl).hostname;
        if (host && registrableDomain(finalHost) !== registrableDomain(host) && !isOfficialDomain(finalHost) && age === null) {
          age = await domainAgeDays(finalHost);
        }
      } catch { /* keep going */ }
    }
  }
  return assess(input, { page, fetchProblem: problem, domainAgeDays: age, safeBrowsingHit: hit });
}
