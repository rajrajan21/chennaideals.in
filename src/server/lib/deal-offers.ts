/**
 * Adds a "Ways to save more" editor note to a deal: coupon codes, bank / card offers, cashback, EMI, exchange.
 * Step 1 (own code): read the deal's page and pick out offer sentences and codes.
 * Step 2 (AI, optional): a web-search AI engine looks for currently valid codes and bank offers.
 * It runs in the background after the deal is saved, so posting is never slowed down.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { deals } from '../db/schema.js';
import { safeGet } from './page-images.js';
import { PROVIDERS, providerReady, searchWith, type Provider } from './hunter/hunter-providers.js';
import { NOTE_MARK, buildOfferNote, extractOffers, stripHtml, type Offer } from './deal-offers-core.js';

const ORDER: Provider[] = ['perplexity', 'gemini', 'openai', 'claude'];

async function pageOffers(url: string): Promise<Offer[]> {
  if (!/^https?:\/\//i.test(url)) return [];
  try {
    const r = await safeGet(url, { maxBytes: 1_500_000, truncate: true, accept: 'text/html,application/xhtml+xml', timeoutMs: 10_000, compress: true });
    if (r.status >= 400 || !/html|xml/i.test(String(r.headers['content-type'] ?? ''))) return [];
    return extractOffers(stripHtml(r.body.toString('utf8')).slice(0, 80_000));
  } catch { return []; }
}

function parseJsonArray(text: string): Record<string, unknown>[] {
  const s = text.replace(/```(?:json)?/gi, '');
  const a = s.indexOf('['); const b = s.lastIndexOf(']');
  if (a < 0 || b <= a) return [];
  try { const v = JSON.parse(s.slice(a, b + 1)) as unknown; return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]) : []; } catch { return []; }
}

async function aiOffers(d: { title: string; url: string | null; retailer: string | null; salePrice: string | null }): Promise<Offer[]> {
  const engine = ORDER.find((p) => providerReady(p));
  if (!engine || !PROVIDERS.some((p) => p.id === engine)) return [];
  const prompt = [
    'Use web search. Find CURRENTLY VALID ways to pay less or get more value for this product in India.',
    `Product: ${d.title}`, `Shop: ${d.retailer ?? 'unknown'}`, d.url ? `Link: ${d.url}` : '', d.salePrice ? `Listed price: Rs ${d.salePrice}` : '',
    'Look for: coupon / promo codes (give the exact code), bank, credit-card, debit-card and UPI offers (bank name, % or Rs off, maximum, minimum order), cashback, no-cost EMI, exchange or trade-in bonus, first-order / app-only / student offers, bundles and free gifts.',
    'Only include offers you saw on the shop\'s or the bank\'s own pages, or on a reputable coupon page, in the last few days. Never invent a code. If there are none, return [].',
    'Reply with ONLY a JSON array, no other text: [{"type": "coupon" | "bank" | "cashback" | "emi" | "exchange" | "other", "text": string (max 140 characters), "code": string or null, "validTill": string or null}]',
  ].filter(Boolean).join('\n');
  const r = await Promise.race([searchWith(engine, prompt), new Promise<null>((res) => setTimeout(() => res(null), 150_000))]);
  if (!r || !r.text) return [];
  const out: Offer[] = [];
  for (const o of parseJsonArray(r.text)) {
    const text = typeof o.text === 'string' ? o.text.trim().slice(0, 160) : '';
    if (text.length < 8) continue;
    out.push({ type: typeof o.type === 'string' ? o.type : 'other', text, code: typeof o.code === 'string' && /^[A-Za-z0-9]{3,20}$/.test(o.code) ? o.code.toUpperCase() : null, validTill: typeof o.validTill === 'string' ? o.validTill.slice(0, 30) : null, from: 'ai' });
    if (out.length >= 6) break;
  }
  return out;
}

async function addNote(dealId: number): Promise<void> {
  const [d] = await db.select().from(deals).where(eq(deals.id, dealId)).limit(1);
  if (!d || (d.editorNote ?? '').includes(NOTE_MARK)) return;
  const fromPage = d.url ? await pageOffers(d.url) : [];
  const fromAi = await aiOffers({ title: d.title, url: d.url, retailer: d.retailer, salePrice: d.salePrice });
  const note = buildOfferNote([...fromAi, ...fromPage], d.retailer ?? '');
  const [fresh] = await db.select({ editorNote: deals.editorNote }).from(deals).where(eq(deals.id, dealId)).limit(1);
  if (!fresh || (fresh.editorNote ?? '').includes(NOTE_MARK)) return;
  const merged = fresh.editorNote ? `${fresh.editorNote}\n\n${note}` : note;
  await db.update(deals).set({ editorNote: merged.slice(0, 4000) }).where(eq(deals.id, dealId));
}

let chain: Promise<void> = Promise.resolve();
/** Queue one deal. Deals are handled one at a time so the AI limits are respected. */
export function queueOfferNote(dealId: number): void {
  chain = chain.then(() => addNote(dealId)).catch((err) => { console.error('Offer note failed', { dealId, message: err instanceof Error ? err.message : String(err) }); });
}
