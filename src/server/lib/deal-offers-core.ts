/**
 * Finds ways to pay less (coupon codes, bank / card offers, cashback, EMI, exchange ...) in page text,
 * and builds the "Ways to save more" editor note. Pure functions - no network - so they can be tested.
 */
export type Offer = { type: string; text: string; code?: string | null; validTill?: string | null; from: 'page' | 'ai' };

export const NOTE_MARK = 'Ways to save more';

const OFFER_RE = /\b(coupon|promo(?:\s?code)?|offer code|use code|apply code|bank offer|card offer|instant discount|cashback|cash back|no[- ]cost emi|exchange offer|upi offer|first order|student discount|bundle offer|extra \d+\s?%|save extra|wallet offer)\b/i;
const NOISE = /(terms and conditions apply only|sign in|log in|cookie|privacy|subscribe|newsletter)/i;
const BAD_CODES = new Set(['APPLY', 'COUPON', 'PROMO', 'CODE', 'OFFER', 'DISCOUNT', 'CHECKOUT', 'BELOW', 'ABOVE', 'WELCOME', 'HERE']);

export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '. ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/gi, '&').replace(/&nbsp;/gi, ' ').replace(/&#8377;|&#x20b9;/gi, '₹').replace(/&quot;/gi, '"').replace(/&#0?39;/gi, "'")
    .replace(/\s+/g, ' ').trim();
}

export function extractCodes(text: string): string[] {
  const out = new Set<string>();
  const res = [
    /(?:use|apply|enter|with)\s+(?:the\s+)?(?:promo\s+|coupon\s+|offer\s+|discount\s+)?code[:\s]+["'‘“]?([A-Z][A-Z0-9]{3,15})\b/g,
    /\b(?:coupon|promo)\s*(?:code)?[:\s]+["'‘“]?([A-Z][A-Z0-9]{3,15})\b/g,
    /\bcode[:\s]+["'‘“]?([A-Z][A-Z0-9]{3,15})\b/g,
  ];
  for (const re of res) for (const m of text.matchAll(re)) if (!BAD_CODES.has(m[1]) && /[A-Z]/.test(m[1]) && /\d|^[A-Z]{5,}$/.test(m[1])) out.add(m[1]);
  return Array.from(out).slice(0, 4);
}

export function extractOffers(pageText: string): Offer[] {
  const out: Offer[] = [];
  const seen = new Set<string>();
  const segments = pageText.split(/(?<=[.!?|•·])\s+|\s{2,}/);
  for (const raw of segments) {
    const seg = raw.trim();
    if (seg.length < 15 || seg.length > 200 || !OFFER_RE.test(seg) || NOISE.test(seg)) continue;
    if (!/[\d%₹]/.test(seg)) continue;
    const key = seg.toLowerCase().replace(/[^a-z0-9]+/g, ' ').slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    const type = /bank|card|upi|wallet/i.test(seg) ? 'bank' : /emi/i.test(seg) ? 'emi' : /exchange/i.test(seg) ? 'exchange' : /cash\s?back/i.test(seg) ? 'cashback' : /coupon|promo|code/i.test(seg) ? 'coupon' : 'other';
    out.push({ type, text: seg.slice(0, 160), code: extractCodes(seg)[0] ?? null, from: 'page' });
    if (out.length >= 6) break;
  }
  for (const code of extractCodes(pageText)) if (!out.some((o) => o.code === code)) out.push({ type: 'coupon', text: `Coupon code ${code} was mentioned on the page`, code, from: 'page' });
  return out.slice(0, 7);
}

const LABEL: Record<string, string> = { coupon: 'Coupon', bank: 'Bank / card offer', cashback: 'Cashback', emi: 'EMI', exchange: 'Exchange', other: 'Offer' };

export function buildOfferNote(offers: Offer[], retailer: string): string {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const o of offers) {
    const key = (o.code ?? '') + o.text.toLowerCase().slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    const label = LABEL[o.type] ?? 'Offer';
    const code = o.code && !o.text.includes(o.code) ? ` - code ${o.code}` : '';
    const valid = o.validTill ? ` (valid till ${o.validTill})` : '';
    lines.push(`• ${label}: ${o.text}${code}${valid}${o.from === 'ai' ? ' *' : ''}`);
    if (lines.length >= 7) break;
  }
  const head = `${NOTE_MARK} on ${retailer || 'this deal'}:`;
  if (lines.length === 0) {
    return `${head}\n• No coupon or bank offer could be found right now. Open the offers / payment section at checkout on ${retailer || 'the shop'} - card, UPI and first-order offers change often.`;
  }
  const star = offers.some((o) => o.from === 'ai') ? '\n* reported by an AI web search - please confirm it at checkout.' : '';
  return `${head}\n${lines.join('\n')}${star}\nOffers change quickly and may need a minimum order.`;
}
