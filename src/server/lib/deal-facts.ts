/**
 * Reads product facts from a shop page (structured data first) and drafts the deal form
 * without any AI. Everything here is rule-based and only uses what the page really says.
 */

export const DEAL_CATEGORIES = ['Electronics', 'Mobile Phones', 'Fashion', 'Groceries', 'Restaurants', 'Home & Kitchen', 'Travel', 'Beauty', 'Sports', 'Books', 'Toys', 'Other'];

export type ProductFacts = {
  title?: string;
  description?: string;
  brand?: string;
  siteName?: string;
  price?: number;
  mrp?: number;
  mrpEstimated?: boolean;
  currency?: string;
  text: string;
  fromPage: boolean;
};

export type DealDraft = {
  title: string;
  description: string;
  longDetails: string;
  originalPrice: number | null;
  salePrice: number | null;
  retailer: string;
  category: string;
};

function decode(s: string): string {
  return s
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&nbsp;/gi, ' ')
    .replace(/&#x20b9;|&#8377;/gi, '₹');
}

export function cleanText(s: string, max: number): string {
  const t = decode(s).replace(/<[^>]*>/g, ' ').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '));
  return (stop > max * 0.5 ? cut.slice(0, stop + 1) : cut.replace(/\s+\S*$/, '') + '...').trim();
}

export function parsePrice(v: unknown): number | undefined {
  if (typeof v === 'number') return v > 0 && v < 1e8 ? v : undefined;
  if (typeof v !== 'string') return undefined;
  const m = /\d[\d,]*(?:\.\d+)?/.exec(v);
  if (!m) return undefined;
  const n = Number(m[0].replace(/,/g, ''));
  return n > 0 && n < 1e8 ? n : undefined;
}

function metaContent(html: string, keys: string[]): string | undefined {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = /(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase();
    if (key && keys.includes(key)) {
      const c = /content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i.exec(tag);
      const v = c ? (c[1] ?? c[2]) : undefined;
      if (v && v.trim()) return decode(v.trim());
    }
  }
  return undefined;
}

type Json = Record<string, unknown>;

function collectProducts(node: unknown, out: Json[], depth = 0): void {
  if (!node || depth > 6) return;
  if (Array.isArray(node)) { node.forEach((n) => collectProducts(n, out, depth + 1)); return; }
  if (typeof node !== 'object') return;
  const o = node as Json;
  const t = o['@type'];
  const types = Array.isArray(t) ? t : [t];
  if (types.includes('Product')) out.push(o);
  for (const v of Object.values(o)) if (v && typeof v === 'object') collectProducts(v, out, depth + 1);
}

function offersOf(product: Json): Json[] {
  const o = product.offers;
  if (!o) return [];
  const list = Array.isArray(o) ? o : [o];
  const flat: Json[] = [];
  for (const x of list) {
    if (x && typeof x === 'object') {
      flat.push(x as Json);
      const nested = (x as Json).offers;
      if (Array.isArray(nested)) for (const n of nested) if (n && typeof n === 'object') flat.push(n as Json);
    }
  }
  return flat;
}


const RUPEE = '\u20b9';
const CUR = `(?:${RUPEE}|Rs\\.?|INR|&#8377;|&#x20b9;)`;
const NUM = '([\\d,]+(?:\\.\\d+)?)';
const MRP_KEYS = '(?:mrp|maximumRetailPrice|maxRetailPrice|listPrice|list_price|originalPrice|original_price|strikePrice|strike_price|strikethroughPrice|strikeThroughPrice|wasPrice|was_price|regularPrice|regular_price|compareAtPrice|compare_at_price|basePrice|priceBeforeDiscount|crossedPrice|markedPrice|marked_price|retailPrice|maxPrice|originalListPrice)';

/** Every number the page presents as an "original" / struck-through price, best sources first. */
export function mrpCandidates(html: string, text: string): number[] {
  const out: number[] = [];
  const push = (v: string | undefined) => { const n = parsePrice(v); if (n !== undefined) out.push(n); };
  const scan = (html.length > 1_200_000 ? html.slice(0, 1_200_000) : html).replace(/&quot;/g, '"');
  // Amazon-style struck price
  for (const m of scan.matchAll(new RegExp(`a-text-price[^>]*>\\s*<span[^>]*a-offscreen[^>]*>\\s*${CUR}?\\s*${NUM}`, 'gi'))) push(m[1]);
  for (const m of scan.matchAll(new RegExp(`class="basisPrice"[\\s\\S]{0,400}?a-offscreen[^>]*>\\s*${CUR}?\\s*${NUM}`, 'gi'))) push(m[1]);
  // data attributes
  for (const m of scan.matchAll(new RegExp(`data-(?:mrp|original-price|was-price|list-price|strike-price)\\s*=\\s*["']?${CUR}?\\s*${NUM}`, 'gi'))) push(m[1]);
  // JSON embedded in the page, e.g. "mrp":4490 or "originalPrice":{"value":"4,490"}
  for (const m of scan.matchAll(new RegExp(`"${MRP_KEYS}"\\s*:\\s*(?:"|\\{[^{}]{0,120}?"(?:value|amount|price|text|raw|displayValue)"\\s*:\\s*"?)?\\s*${CUR}?\\s*${NUM}`, 'gi'))) push(m[1]);
  // struck-through markup
  for (const m of scan.matchAll(new RegExp(`<(?:del|s|strike)\\b[^>]*>\\s*(?:<[^>]+>\\s*)*${CUR}?\\s*${NUM}`, 'gi'))) push(m[1]);
  for (const m of scan.matchAll(new RegExp(`class="[^"]*(?:strike|line-through|old-price|was-price|price-old|mrp|original-price|price--compare|compare-at)[^"]*"[^>]*>\\s*(?:<[^>]+>\\s*)*${CUR}?\\s*${NUM}`, 'gi'))) push(m[1]);
  // printed labels in the visible text
  for (const m of text.matchAll(new RegExp(`(?:M\\.?R\\.?P\\.?)\\s*[:.\\-]?\\s*${CUR}?\\s*${NUM}`, 'gi'))) push(m[1]);
  for (const m of text.matchAll(new RegExp(`(?:List Price|Original Price|Regular Price|Marked Price|Was)\\s*[:.\\-]?\\s*${CUR}\\s*${NUM}`, 'gi'))) push(m[1]);
  return out;
}

/** Chooses the most plausible original price: higher than the price, matching a shown discount if there is one. */
export function pickMrp(cands: number[], price: number, pctHint?: number): number | undefined {
  const ok = cands.filter((c) => c > price * 1.02 && c <= price * 25);
  if (ok.length === 0) return undefined;
  if (pctHint !== undefined) {
    const match = ok.find((c) => Math.abs(Math.round(((c - price) / c) * 100) - pctHint) <= 1);
    if (match !== undefined) return match;
  }
  const counts = new Map<number, number>();
  for (const c of ok) counts.set(c, (counts.get(c) ?? 0) + 1);
  let best = ok[0];
  let bestCount = 0;
  for (const [v, n] of counts) if (n > bestCount) { best = v; bestCount = n; }
  return best;
}

export function percentFromText(t: string): number | undefined {
  const m = /(\d{1,2})\s*%\s*(?:off|discount)/i.exec(t) ?? /(?:save|discount of|flat)\s*(\d{1,2})\s*%/i.exec(t) ?? /-\s*(\d{1,2})\s*%/.exec(t);
  const n = m ? Number(m[1]) : NaN;
  return n >= 5 && n <= 90 ? n : undefined;
}

/** A discount percentage printed close to the price on the page (not anywhere in the page, to avoid other products). */
export function percentNearPrice(text: string, price: number): number | undefined {
  const forms = Array.from(new Set([price.toLocaleString('en-IN', { maximumFractionDigits: 2 }), price.toLocaleString('en-US', { maximumFractionDigits: 2 }), String(price)]));
  for (const f of forms) {
    const at = text.indexOf(f);
    if (at < 0) continue;
    const near = text.slice(Math.max(0, at - 200), at + 300);
    const p = percentFromText(near);
    if (p !== undefined) return p;
  }
  return undefined;
}

export function guessCurrency(html: string, pageUrl: string, hasPrice: boolean): string | undefined {
  if (!hasPrice) return undefined;
  try {
    const host = new URL(pageUrl).hostname;
    if (/\.in$|flipkart|myntra|meesho|nykaa|bigbasket|swiggy|zomato|ajio|tatacliq|croma|reliancedigital/i.test(host)) return 'INR';
    if (/\.co\.uk$/i.test(host)) return 'GBP';
    if (/\.(de|fr|it|es|nl)$/i.test(host)) return 'EUR';
  } catch { /* keep guessing */ }
  const sample = html.slice(0, 400_000);
  if (sample.includes(RUPEE) || /&#8377;|&#x20b9;|\bRs\.?\s?\d/i.test(sample)) return 'INR';
  if (/\$\s?\d/.test(sample)) return 'USD';
  return 'INR';
}

/** Removes a price that the page title already ends with, so adding ours does not repeat it. */
export function stripTrailingPrice(t: string): string {
  let out = t.trim();
  const re = new RegExp(`\\s*[-\\u2013\\u2014|@:,]?\\s*(?:(?:at|for|only|now|just|@)\\s+)?(?:[${RUPEE}$\\u00a3\\u20ac]|Rs\\.?|INR|USD)\\s?\\d[\\d,]*(?:\\.\\d+)?(?:\\s*\\([^)]*\\))?\\s*$`, 'i');
  const pct = /\s*[-\u2013\u2014|@:,(]?\s*\d{1,2}\s*%\s*off\)?\s*$/i;
  for (let i = 0; i < 3; i++) {
    const next = out.replace(re, '').replace(pct, '').trim();
    if (next === out || next.length < 8) break;
    out = next;
  }
  return out;
}

/** "Product name - Rs. 1,299 (Original Rs. 4,490, 71% off)" - built from the real numbers only. */
export function titleWithPrice(base: string, price?: number | null, mrp?: number | null, currency?: string, maxLen = 240): string {
  const title = stripTrailingPrice(base);
  if (price === undefined || price === null) return title;
  let suffix = money(price, currency);
  if (mrp !== undefined && mrp !== null && mrp > price) {
    const pct = Math.round(((mrp - price) / mrp) * 100);
    suffix += ` (Original ${money(mrp, currency)}${pct >= 1 ? `, ${pct}% off` : ''})`;
  }
  const sep = ' - ';
  const room = maxLen - sep.length - suffix.length;
  let t = title;
  if (t.length > room) t = t.slice(0, Math.max(10, room)).replace(/\s+\S*$/, '').replace(/[\s,;:\-]+$/, '');
  return `${t}${sep}${suffix}`;
}

export function extractProductFacts(html: string, pageUrl: string): ProductFacts {
  const facts: ProductFacts = { text: '', fromPage: html.length > 0 };
  if (!html) { facts.title = titleFromUrl(pageUrl); facts.fromPage = false; return facts; }

  // 1. structured data (schema.org Product) - the most reliable source
  const products: Json[] = [];
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { collectProducts(JSON.parse(m[1]), products); } catch { /* ignore broken JSON-LD */ }
  }
  const p = products.find((x) => typeof x.name === 'string') ?? products[0];
  if (p) {
    if (typeof p.name === 'string') facts.title = cleanText(p.name, 200);
    if (typeof p.description === 'string') facts.description = cleanText(p.description, 700);
    const b = p.brand;
    if (typeof b === 'string') facts.brand = cleanText(b, 60);
    else if (b && typeof b === 'object' && typeof (b as Json).name === 'string') facts.brand = cleanText((b as Json).name as string, 60);
    for (const offer of offersOf(p)) {
      const price = parsePrice(offer.price) ?? parsePrice(offer.lowPrice);
      if (price !== undefined && facts.price === undefined) facts.price = price;
      if (typeof offer.priceCurrency === 'string' && !facts.currency) facts.currency = offer.priceCurrency.toUpperCase();
      const specs = offer.priceSpecification;
      for (const s of Array.isArray(specs) ? specs : specs ? [specs] : []) {
        if (!s || typeof s !== 'object') continue;
        const kind = String((s as Json).priceType ?? '');
        const sp = parsePrice((s as Json).price);
        if (sp !== undefined && /list|msrp|strike|mrp/i.test(kind) && facts.mrp === undefined) facts.mrp = sp;
        else if (sp !== undefined && facts.price === undefined) facts.price = sp;
      }
    }
  }

  // 2. Open Graph / meta tags
  facts.title ??= metaContent(html, ['og:title', 'twitter:title']) ?? decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').trim();
  facts.description ??= cleanText(metaContent(html, ['og:description', 'description', 'twitter:description']) ?? '', 700) || undefined;
  facts.siteName = metaContent(html, ['og:site_name']);
  facts.price ??= parsePrice(metaContent(html, ['product:price:amount', 'og:price:amount', 'price']));
  facts.mrp ??= parsePrice(metaContent(html, ['product:original_price:amount', 'product:price:standard_amount']));
  facts.currency ??= metaContent(html, ['product:price:currency', 'og:price:currency'])?.toUpperCase();
  facts.brand ??= metaContent(html, ['product:brand', 'og:brand']);
  if (facts.price === undefined) {
    const mt = /itemprop\s*=\s*["']price["'][^>]*content\s*=\s*["']([^"']+)["']|content\s*=\s*["']([^"']+)["'][^>]*itemprop\s*=\s*["']price["']/i.exec(html);
    facts.price = parsePrice(mt?.[1] ?? mt?.[2]);
  }

  if (facts.price === undefined) {
    const mj = /"(?:sellingPrice|finalPrice|offerPrice|salePrice|discountedPrice|special_price)"\s*:\s*\{?\s*(?:"value"\s*:\s*)?"?(\d[\d,.]*)/i.exec(html);
    facts.price = parsePrice(mj?.[1]);
  }

  // 3. readable text (also used to look for a printed MRP)
  const body = html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  facts.text = decode(body).replace(/\s+/g, ' ').trim().slice(0, 3500);

  // original price (MRP): structured data first, then the many ways shops print it
  if (facts.price !== undefined) {
    const metaPct = percentFromText(`${facts.title ?? ''} ${facts.description ?? ''}`);
    const pctHint = metaPct ?? percentNearPrice(facts.text, facts.price);
    if (facts.mrp !== undefined && facts.mrp <= facts.price) facts.mrp = undefined;
    if (facts.mrp === undefined) facts.mrp = pickMrp(mrpCandidates(html, facts.text), facts.price, pctHint);
    if (facts.mrp === undefined && pctHint !== undefined && pctHint >= 5 && pctHint <= 90) {
      facts.mrp = Math.round(facts.price / (1 - pctHint / 100));
      facts.mrpEstimated = true;
    }
  } else {
    facts.mrp = undefined;
  }
  facts.currency ??= guessCurrency(html, pageUrl, facts.price !== undefined);

  if (facts.title) facts.title = cleanText(facts.title, 200);
  if (!facts.title) facts.title = titleFromUrl(pageUrl);
  return facts;
}

export function titleFromUrl(pageUrl: string): string | undefined {
  try {
    const segs = new URL(pageUrl).pathname.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
    const best = segs.filter((s) => /[a-z]/i.test(s) && s.includes('-') && s.length > 12).sort((a, b) => b.length - a.length)[0];
    if (!best) return undefined;
    const words = best.replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
    const BRAND_CASE: Record<string, string> = { iphone: 'iPhone', ipad: 'iPad', macbook: 'MacBook', airpods: 'AirPods', oneplus: 'OnePlus', realme: 'realme', boat: 'boAt', tv: 'TV', ssd: 'SSD', usb: 'USB', led: 'LED', gb: 'GB', tb: 'TB' };
    return words
      .map((w) => BRAND_CASE[w.toLowerCase()] ?? (w === w.toLowerCase() && /^[a-z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w))
      .join(' ')
      .slice(0, 140);
  } catch {
    return undefined;
  }
}

const RETAILERS: [RegExp, string][] = [
  [/amazon\.|amzn\./i, 'Amazon'], [/flipkart\.|fkrt\.|fktr\./i, 'Flipkart'], [/meesho\./i, 'Meesho'],
  [/myntra\./i, 'Myntra'], [/nykaa\./i, 'Nykaa'], [/bigbasket\./i, 'BigBasket'], [/swiggy\./i, 'Swiggy'], [/zomato\./i, 'Zomato'],
];

export function detectRetailer(pageUrl: string, siteName?: string): string {
  try {
    const host = new URL(pageUrl).hostname;
    for (const [re, name] of RETAILERS) if (re.test(host)) return name;
    if (siteName) return cleanText(siteName, 40);
    const label = host.replace(/^www\./, '').split('.')[0];
    return label ? label[0].toUpperCase() + label.slice(1) : 'Other';
  } catch {
    return 'Other';
  }
}

const CATEGORY_RULES: [string, RegExp][] = [
  ['Mobile Phones', /\b(iphone|smartphone|mobile phone|5g phone|galaxy [asmzf]\d|redmi|realme|oneplus|poco|vivo|oppo|pixel \d|moto g|nothing phone)\b/i],
  ['Travel', /\b(flight|flights|hotel|resort|bus ticket|train ticket|holiday|vacation|trip|booking)\b/i],
  ['Restaurants', /\b(restaurant|pizza|burger|biryani|meal combo|buffet|cafe|dine)\b/i],
  ['Books', /\b(book|novel|paperback|hardcover|kindle|author)\b/i],
  ['Toys', /\b(toy|toys|lego|puzzle|doll|board game|rc car|action figure)\b/i],
  ['Sports', /\b(cricket|football|yoga|dumbbell|gym|fitness|cycle|bicycle|badminton|treadmill|protein|sports)\b/i],
  ['Beauty', /\b(lipstick|serum|moisturi[sz]er|shampoo|conditioner|perfume|makeup|skincare|face wash|sunscreen|kajal|foundation|body lotion)\b/i],
  ['Groceries', /\b(rice|atta|flour|cooking oil|dal|tea|coffee|snack|biscuit|chocolate|grocery|masala|ghee|milk|noodles|cereal)\b/i],
  ['Home & Kitchen', /\b(mixer|grinder|pressure cooker|kettle|refrigerator|washing machine|air conditioner|ceiling fan|bedsheet|mattress|cookware|air fryer|vacuum|kitchen|furniture|sofa|lamp|curtain|water purifier|induction)\b/i],
  ['Fashion', /\b(shirt|t-shirt|tshirt|jeans|kurta|saree|dress|shoes|sneaker|sandal|jacket|handbag|trouser|hoodie|slipper|watch|backpack|sunglasses)\b/i],
  ['Electronics', /\b(laptop|television|tv|headphone|earbuds?|speaker|camera|smartwatch|charger|power bank|router|monitor|tablet|printer|ssd|hard disk|keyboard|mouse|bluetooth|soundbar|projector|trimmer|gaming)\b/i],
];

export function guessCategory(title: string, description = ''): string {
  for (const text of [title, `${title} ${description}`]) {
    for (const [cat, re] of CATEGORY_RULES) if (re.test(text)) return cat;
  }
  return 'Other';
}

const SYMBOLS: Record<string, string> = { INR: '\u20b9', USD: '$', GBP: '\u00a3', EUR: '\u20ac' };

export function money(n: number, currency?: string): string {
  const code = (currency ?? 'INR').toUpperCase();
  const sym = SYMBOLS[code] ?? `${code} `;
  return sym + n.toLocaleString(code === 'INR' ? 'en-IN' : 'en-US', { maximumFractionDigits: 2 });
}

export function priceLines(f: Pick<ProductFacts, 'price' | 'mrp' | 'currency'>): string[] {
  if (f.price === undefined) return [];
  if (f.mrp !== undefined && f.mrp > f.price) {
    const pct = Math.round(((f.mrp - f.price) / f.mrp) * 100);
    return [`Price: ${money(f.price, f.currency)} (MRP ${money(f.mrp, f.currency)}, ${pct}% off)`];
  }
  return [`Listed price: ${money(f.price, f.currency)}`];
}

export function cleanTitle(raw: string): string {
  let t = cleanText(raw, 200);
  t = t.replace(/\s*[|–—]\s*(Amazon\.in|Flipkart\.com|Buy[^|]*|Online[^|]*)$/i, '');
  t = t.replace(/\s*:\s*Amazon\.in.*$/i, '').replace(/^Buy\s+/i, '');
  if (t.includes(' | ')) t = t.split(' | ')[0];
  return t.slice(0, 140).trim();
}

export function buildRuleDraft(f: ProductFacts, pageUrl: string): DealDraft {
  const title = cleanTitle(f.title ?? '');
  const retailer = detectRetailer(pageUrl, f.siteName);
  const bullets: string[] = [...priceLines(f)];
  if (f.brand) bullets.push(`Brand: ${f.brand}`);
  if (f.price !== undefined && f.mrp !== undefined) {
    const pct = Math.round(((f.mrp - f.price) / f.mrp) * 100);
    if (pct >= 10) bullets.push(`Why it may be a deal: priced ${pct}% below the listed MRP`);
  }
  const longDetails = bullets.length
    ? bullets.map((b) => `• ${b}`).join('\n') + `\n• Check the final price, coupons and stock on ${retailer} before buying.`
    : '';
  return {
    title,
    description: f.description ? cleanText(f.description, 400) : '',
    longDetails,
    originalPrice: f.mrp ?? null,
    salePrice: f.price ?? null,
    retailer,
    category: guessCategory(title, f.description ?? ''),
  };
}
