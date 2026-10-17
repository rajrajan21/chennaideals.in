/**
 * Deal Hunter - the pure parts (no network, no database), so they can be tested.
 * Finds, compares and ranks deal candidates.
 */
import { parsePrice, percentFromText } from '../deal-facts.js';
import { isOfficialDomain } from '../deal-review-core.js';

export type HuntMode = 'ecommerce' | 'local' | 'social';
export type Tier = 'super-hot' | 'hot' | 'good' | 'normal';

export type Candidate = {
  id: string;
  mode: HuntMode;
  title: string;
  url: string;
  retailer: string;
  imageUrl: string | null;
  salePrice: number | null;
  originalPrice: number | null;
  discountPercent: number | null;
  offerText: string | null;
  category: string;
  subCategory: string;
  images: string[];
  uniqueness: 'lowest' | 'matched' | 'unknown';
  otherBest: { shop: string; price: number; url: string } | null;
  area: string;
  description: string;
  heat: number;
  tier: Tier;
  reasons: string[];
  warnings: string[];
  /** true when the price was read from the shop's own page */
  verified: boolean;
  official: boolean;
  source: string;
  foundBy: string[];
  likes: number | null;
  views: number | null;
  postedAt: string | null;
};

export type RawItem = { url: string; title?: string; price?: number; mrp?: number; pct?: number; image?: string; source: string; note?: string; retailer?: string; area?: string; category?: string; trusted?: boolean; providers?: string[]; likes?: number; views?: number; postedAt?: string };

export const CITY_OPTIONS = [
  'Chennai (all areas)', 'T. Nagar', 'Anna Nagar', 'Velachery', 'Adyar', 'Mylapore', 'Nungambakkam', 'Porur', 'Tambaram', 'Guindy',
  'OMR / Sholinganallur', 'Perambur', 'Purasawalkam', 'Chromepet', 'Ambattur', 'Kodambakkam', 'Vadapalani', 'Egmore',
  'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tiruppur', 'Erode', 'Tirunelveli', 'Vellore', 'Puducherry',
];

/** The value stored in the deal's "area" column for a chosen city/area. */
export function areaForCity(city: string): string {
  const c = city.trim();
  if (!c || /^chennai/i.test(c)) return 'Chennai';
  return c;
}


type Json = Record<string, unknown>;

// ---------- categories ----------
export const CATEGORY_TREE: Record<string, { name: string; re: RegExp }[]> = {
  Electronics: [
    { name: 'Laptops & Computers', re: /\b(laptop|notebook|macbook|desktop|monitor|keyboard|mouse|printer|ssd|hard disk|router)\b/i },
    { name: 'TVs & Home Theatre', re: /\b(tv|television|soundbar|projector|home theatre|led tv|smart tv)\b/i },
    { name: 'Headphones & Speakers', re: /\b(headphone|earbuds?|earphone|airdopes|neckband|speaker|bluetooth speaker|tws)\b/i },
    { name: 'Smartwatches & Wearables', re: /\b(smartwatch|smart watch|fitness band|fitness tracker)\b/i },
    { name: 'Cameras', re: /\b(camera|dslr|mirrorless|gopro|lens)\b/i },
    { name: 'Power & Accessories', re: /\b(charger|power bank|cable|adapter|usb|pendrive|memory card)\b/i },
  ],
  'Mobile Phones': [
    { name: 'Smartphones', re: /\b(phone|iphone|galaxy|redmi|realme|oneplus|poco|vivo|oppo|pixel|moto|5g)\b/i },
    { name: 'Tablets', re: /\b(tablet|ipad|tab)\b/i },
    { name: 'Mobile Accessories', re: /\b(case|cover|screen guard|tempered|charger|earphone)\b/i },
  ],
  Fashion: [
    { name: 'Sarees', re: /\b(saree|sari|silk saree|pattu)\b/i },
    { name: "Men's Clothing", re: /\b(men|mens|men's|shirt|trouser|kurta for men|vest|dhoti)\b/i },
    { name: "Women's Clothing", re: /\b(women|womens|women's|kurti|dress|churidar|lehenga|top|salwar)\b/i },
    { name: "Kids' Clothing", re: /\b(kids|boys|girls|baby|infant)\b/i },
    { name: 'Footwear', re: /\b(shoe|shoes|sneaker|sandal|slipper|footwear|flip flop)\b/i },
    { name: 'Watches', re: /\b(watch|watches|chronograph|wristwatch)\b/i },
    { name: 'Bags & Luggage', re: /\b(bag|backpack|handbag|luggage|trolley|wallet)\b/i },
    { name: 'Jewellery', re: /\b(jewel|jewellery|gold|silver|diamond|necklace|ring|earring|bangle)\b/i },
  ],
  Groceries: [
    { name: 'Staples & Oil', re: /\b(rice|atta|flour|oil|dal|sugar|salt|ghee)\b/i },
    { name: 'Snacks & Sweets', re: /\b(snack|biscuit|chocolate|sweet|namkeen|chips|cookies)\b/i },
    { name: 'Tea, Coffee & Drinks', re: /\b(tea|coffee|juice|drink|beverage|milk)\b/i },
    { name: 'Organic & Health', re: /\b(organic|millet|protein|supplement|honey)\b/i },
  ],
  Restaurants: [
    { name: 'Biryani & Meals', re: /\b(biryani|meals|thali|combo)\b/i },
    { name: 'Pizza & Burgers', re: /\b(pizza|burger|sandwich|fries)\b/i },
    { name: 'Cafes & Desserts', re: /\b(cafe|dessert|ice cream|bakery|cake|coffee)\b/i },
    { name: 'Buffets & Fine Dining', re: /\b(buffet|dine|fine dining|brunch)\b/i },
  ],
  'Home & Kitchen': [
    { name: 'Appliances', re: /\b(refrigerator|fridge|washing machine|air conditioner|ac|microwave|mixer|grinder|air fryer|water purifier|vacuum|geyser|fan)\b/i },
    { name: 'Cookware & Kitchen', re: /\b(cookware|pressure cooker|kadai|pan|kettle|dinner set|lunch box|bottle|container)\b/i },
    { name: 'Furniture', re: /\b(sofa|bed|table|chair|wardrobe|mattress|furniture|shelf)\b/i },
    { name: 'Decor & Bedding', re: /\b(curtain|bedsheet|pillow|lamp|decor|carpet|blanket|clock)\b/i },
  ],
  Travel: [
    { name: 'Flights', re: /\b(flight|airline|air ticket)\b/i },
    { name: 'Hotels & Stays', re: /\b(hotel|resort|stay|homestay)\b/i },
    { name: 'Bus & Train', re: /\b(bus|train|redbus|irctc)\b/i },
    { name: 'Holiday Packages', re: /\b(package|holiday|tour|trip|vacation)\b/i },
  ],
  Beauty: [
    { name: 'Skincare', re: /\b(skincare|serum|moisturi[sz]er|sunscreen|face wash|cream|lotion)\b/i },
    { name: 'Makeup', re: /\b(lipstick|makeup|kajal|foundation|mascara|eyeliner|nail)\b/i },
    { name: 'Haircare', re: /\b(shampoo|conditioner|hair oil|hair)\b/i },
    { name: 'Fragrance', re: /\b(perfume|deodorant|fragrance|attar)\b/i },
    { name: 'Salon & Spa', re: /\b(salon|spa|facial|massage|haircut)\b/i },
  ],
  Sports: [
    { name: 'Fitness & Gym', re: /\b(gym|dumbbell|treadmill|yoga|fitness|protein|cycle)\b/i },
    { name: 'Cricket', re: /\b(cricket|bat|ball|pads)\b/i },
    { name: 'Sportswear', re: /\b(sportswear|track|jersey|running)\b/i },
  ],
  Books: [
    { name: 'Exam & Study', re: /\b(exam|study|guide|upsc|neet|jee|textbook)\b/i },
    { name: 'Fiction & General', re: /\b(novel|fiction|story|author|paperback)\b/i },
    { name: "Children's Books", re: /\b(children|kids|rhymes)\b/i },
  ],
  Toys: [
    { name: 'Toys & Games', re: /\b(toy|lego|puzzle|board game|doll|rc car)\b/i },
    { name: 'Baby Products', re: /\b(baby|diaper|stroller|infant)\b/i },
  ],
  Other: [],
};

export function guessSubcategory(category: string, title: string): string {
  for (const s of CATEGORY_TREE[category] ?? []) if (s.re.test(title)) return s.name;
  return '';
}

/** True when the deal fits the chosen categories (none chosen = everything) and sub-category. */
export function matchesFilter(c: { category: string; subCategory: string }, cats: string[], sub: string): boolean {
  if (cats.length > 0 && !cats.includes(c.category)) return false;
  if (sub && c.subCategory !== sub) return false;
  return true;
}

// ---------- is this really ONE product page? ----------
/** Collection / category / search / offers pages show many products and often a price RANGE such as "10K to 15K". */
export function looksLikeListingUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (/\/(dp|products?|pd|item|itm)\//.test(path)) return false;
    return /\/(collections?|category|categories|search|browse|shop-by[^/]*|offers?|deals?|sales?|c|b|brands?|store|stores|pages?)(\/|$)/.test(path) || path === '/' || path === '';
  } catch { return true; }
}

export function looksLikePriceRange(text: string): boolean {
  return /\d+\s*[kKlL]?\s*(?:to|-|–)\s*\d+\s*[kKlL]\b/.test(text) || /\b(?:under|below|starting|starts?\s+from|upto|up\s+to)\s*(?:₹|rs\.?)?\s*\d/i.test(text) || /\b(collection|collections|all products|shop all)\b/i.test(text);
}

export function productEvidence(html: string): 'single' | 'multiple' | 'none' {
  const found: Json[] = [];
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { collectLd(JSON.parse(m[1]), found); } catch { /* ignore */ }
  }
  const named = found.filter((p) => typeof p.name === 'string').length;
  if (named > 4) return 'multiple';
  if (named >= 1) return 'single';
  if (/property\s*=\s*["']og:type["'][^>]*content\s*=\s*["']product|content\s*=\s*["']product["'][^>]*property\s*=\s*["']og:type|product:price:amount/i.test(html)) return 'single';
  return 'none';
}

export function productUrlShape(url: string): boolean {
  try { const u = new URL(url); return /\/(dp|p|pd|product|products|item|itm|buy)\b|-p-\d|[?&]pid=/i.test(u.pathname + u.search); } catch { return false; }
}

// ---------- text helpers ----------
const STOP = new Set(['with', 'for', 'and', 'the', 'in', 'of', 'india', 'new', 'latest', 'buy', 'online', 'price', 'off', 'rs', 'mrp', 'offer', 'deal', 'deals', 'at', 'from', 'best', 'free', 'sale', 'upto', 'up', 'to', 'pack', 'combo']);

export function tokens(title: string): string[] {
  const out = new Set<string>();
  for (const w of title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ')) {
    if (w.length < 2 || STOP.has(w)) continue;
    out.add(w);
  }
  return Array.from(out);
}

export function similarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const sb = new Set(b);
  let inter = 0;
  for (const w of a) if (sb.has(w)) inter++;
  return inter / (a.length + b.length - inter);
}

export function decodeText(s: string): string {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'").replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&#x20b9;|&#8377;/gi, '₹')
    .replace(/\s+/g, ' ').trim();
}

function absUrl(href: string, base: string): string | null {
  try {
    const u = new URL(href.trim(), base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    return u.toString();
  } catch { return null; }
}

const SKIP_LINK = /(login|signin|sign-in|register|cart|checkout|account|wishlist|javascript:|mailto:|tel:|\/help|\/contact|faq|privacy|terms|\.(css|js|png|jpe?g|gif|svg|webp)(\?|$))/i;

function collectLd(node: unknown, out: Json[], depth = 0): void {
  if (depth > 7 || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) collectLd(n, out, depth + 1); return; }
  const o = node as Json;
  const t = o['@type'];
  const types = Array.isArray(t) ? t.map(String) : [String(t ?? '')];
  if (types.includes('Product')) out.push(o);
  for (const k of ['@graph', 'itemListElement', 'item', 'mainEntity', 'offers']) if (o[k]) collectLd(o[k], out, depth + 1);
}

function firstImage(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return firstImage(v[0]);
  if (v && typeof v === 'object' && typeof (v as Json).url === 'string') return (v as Json).url as string;
  return undefined;
}

/** Pulls product-like entries out of a shop's deals/offers page. */
export function parseListing(html: string, baseUrl: string, source: string, limit = 80): RawItem[] {
  const items = new Map<string, RawItem>();
  const add = (it: RawItem) => { if (!items.has(it.url) && items.size < limit) items.set(it.url, it); };

  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const found: Json[] = [];
      collectLd(JSON.parse(m[1]), found);
      for (const p of found) {
        const url = typeof p.url === 'string' ? absUrl(p.url, baseUrl) : null;
        if (!url || typeof p.name !== 'string') continue;
        const offers = Array.isArray(p.offers) ? (p.offers[0] as Json | undefined) : (p.offers as Json | undefined);
        const price = parsePrice(offers?.price ?? offers?.lowPrice);
        const image = firstImage(p.image);
        add({ url, title: decodeText(p.name).slice(0, 200), price, image: image ? absUrl(image, baseUrl) ?? undefined : undefined, source });
      }
    } catch { /* ignore broken JSON-LD */ }
  }

  for (const m of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]{0,1500}?)<\/a>/gi)) {
    const url = absUrl(m[1], baseUrl);
    if (!url || SKIP_LINK.test(url)) continue;
    const text = decodeText(m[2]);
    if (text.length < 12) continue;
    const prices = Array.from(text.matchAll(/(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d{1,2})?)/gi))
      .map((x) => parsePrice(x[1])).filter((n): n is number => typeof n === 'number' && n > 0);
    const pct = percentFromText(text);
    if (prices.length === 0 && pct === undefined) continue;
    const price = prices.length ? Math.min(...prices) : undefined;
    const mrp = prices.length > 1 && Math.max(...prices) > (price ?? 0) ? Math.max(...prices) : undefined;
    const title = text.replace(/(?:₹|Rs\.?|INR)\s*[\d,.]+/gi, ' ').replace(/\d{1,2}\s*%\s*(?:off|discount)/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
    if (title.length < 8) continue;
    const img = /<img[^>]+(?:data-src|data-original|src)\s*=\s*["']([^"']+)["']/i.exec(m[2]);
    add({ url, title, price, mrp, pct, image: img ? absUrl(img[1], baseUrl) ?? undefined : undefined, source });
  }
  return Array.from(items.values());
}

/** Quick listing-page signal used to decide which pages are worth opening. */
export function listingSignal(it: RawItem): number {
  let pct = it.pct ?? 0;
  if (it.price && it.mrp && it.mrp > it.price) pct = Math.max(pct, Math.round(((it.mrp - it.price) / it.mrp) * 100));
  const saving = it.price && it.mrp ? it.mrp - it.price : 0;
  return pct + Math.min(15, saving / 500);
}

// ---------- scoring ----------
function rupees(n: number): string { return '₹' + Math.round(n).toLocaleString('en-IN'); }

export function tierFor(heat: number): Tier {
  return heat >= 80 ? 'super-hot' : heat >= 55 ? 'hot' : heat >= 35 ? 'good' : 'normal';
}

/**
 * Gives every candidate a "heat" score (0-100), a tier and plain-language reasons.
 * Candidates for the same product from different shops are compared with each other.
 */
export function scoreCandidates(list: Candidate[]): Candidate[] {
  const toks = list.map((c) => tokens(c.title));
  list.forEach((c, i) => {
    const reasons: string[] = [];
    const warnings: string[] = [...c.warnings];
    let h = 0;
    const d = c.discountPercent ?? 0;
    h += Math.min(d, 70);
    if (d >= 30 && c.originalPrice && c.salePrice) reasons.push(`${d}% below the listed price (${rupees(c.salePrice)} instead of ${rupees(c.originalPrice)})`);
    else if (d >= 30) reasons.push(`${d}% discount advertised`);
    if (c.salePrice && c.originalPrice && c.originalPrice > c.salePrice) {
      const saving = c.originalPrice - c.salePrice;
      h += Math.min(15, saving / 500);
      if (saving >= 1000) reasons.push(`Saves ${rupees(saving)}`);
    }
    if (c.foundBy.length > 1) { h += Math.min(8, (c.foundBy.length - 1) * 4); reasons.push(`Found by ${c.foundBy.length} different AI searches`); }
    if (c.likes || c.views) {
      const eng = (c.likes ?? 0) + (c.views ?? 0) / 20;
      const bonus = Math.min(14, Math.round(Math.log10(eng + 1) * 3.5));
      if (bonus > 0) { h += bonus; reasons.push(`Popular post: ${c.likes ? c.likes.toLocaleString('en-IN') + ' likes' : ''}${c.likes && c.views ? ', ' : ''}${c.views ? c.views.toLocaleString('en-IN') + ' views' : ''}`); }
    }
    if (c.verified) { h += 6; reasons.push('Price confirmed on the shop’s own page'); }
    else { h -= 12; warnings.push('Price could not be confirmed on the page - check before posting'); }
    if (c.official) { h += 4; reasons.push('Well-known / official shop website'); }

    // compare with the same product from other shops in this search
    if (c.salePrice && c.mode !== 'local') {
      const peers: { c: Candidate; price: number }[] = [];
      list.forEach((o, j) => {
        if (j === i || !o.salePrice || o.retailer === c.retailer) return;
        if (similarity(toks[i], toks[j]) >= 0.6) peers.push({ c: o, price: o.salePrice });
      });
      if (peers.length > 0) {
        const lowest = Math.min(...peers.map((p) => p.price));
        const cheaper = ((lowest - c.salePrice) / lowest) * 100;
        if (cheaper >= 2) {
          h += Math.min(15, cheaper * 1.5);
          reasons.push(`Cheaper than ${peers.length} other shop${peers.length > 1 ? 's' : ''} we compared (by ${Math.round(cheaper)}%)`);
        } else if (cheaper < -2) {
          h -= 8;
          warnings.push(`${peers.find((p) => p.price === lowest)?.c.retailer ?? 'Another shop'} has it for less`);
        }
      } else if (c.verified && d >= 25) {
        h += 3;
        reasons.push('No lower price found at the other shops we checked');
      }
    }
    if (c.images.length === 0 && !c.imageUrl) { h -= 6; warnings.push('No picture found - add one after posting'); }
    if (d > 85) { h -= d > 92 ? 45 : 25; warnings.push('Discount above 85% - double-check it is genuine'); }
    if (c.mode === 'ecommerce' && c.salePrice === null) { h -= 30; }
    if (c.mode === 'local' && c.offerText) reasons.push(`Offer: ${c.offerText}`);

    c.heat = Math.max(0, Math.min(100, Math.round(h)));
    c.tier = tierFor(c.heat);
    c.reasons = reasons.slice(0, 5);
    c.warnings = warnings.slice(0, 4);
  });
  return list;
}

export function isOfficial(url: string): boolean {
  try { return isOfficialDomain(new URL(url).hostname); } catch { return false; }
}

/** Highest heat first, with at most a fair share per shop, and near-duplicate products removed. */
export function pickTop(list: Candidate[], count: number, perCategoryCap = 0): Candidate[] {
  const sorted = [...list].sort((a, b) => b.heat - a.heat || (b.discountPercent ?? 0) - (a.discountPercent ?? 0));
  const cap = Math.max(2, Math.ceil(count * 0.4));
  const chosen: Candidate[] = [];
  const perShop = new Map<string, number>();
  const perCat = new Map<string, number>();
  const seenTok: string[][] = [];
  const dupe = (c: Candidate) => {
    const t = tokens(c.title);
    return seenTok.some((s) => similarity(s, t) >= 0.8) || chosen.some((x) => x.url === c.url);
  };
  for (const pass of [0, 1]) {
    for (const c of sorted) {
      if (chosen.length >= count) break;
      if (chosen.includes(c) || dupe(c)) continue;
      const n = perShop.get(c.retailer) ?? 0;
      const k = c.category + '/' + c.subCategory;
      if (pass === 0 && n >= cap) continue;
      if (pass === 0 && perCategoryCap > 0 && (perCat.get(c.category) ?? 0) >= perCategoryCap) continue;
      void k;
      chosen.push(c);
      seenTok.push(tokens(c.title));
      perShop.set(c.retailer, n + 1);
      perCat.set(c.category, (perCat.get(c.category) ?? 0) + 1);
    }
  }
  return chosen;
}

export function clampCount(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return 10;
  return Math.max(1, Math.min(50, n));
}

/** Applies what the cross-shop price check found. Call once per candidate, after scoring. */
export function applyUniqueness(c: Candidate, other: { shop: string; price: number; url: string } | null): void {
  if (!other || !c.salePrice) { c.uniqueness = 'unknown'; return; }
  c.otherBest = other;
  if (other.price <= c.salePrice * 1.01) {
    c.uniqueness = 'matched';
    c.heat = Math.max(0, c.heat - 35);
    c.warnings = [...c.warnings, `${other.shop} also sells it for ${rupees(other.price)}`].slice(0, 4);
  } else if (other.price >= c.salePrice * 1.03) {
    c.uniqueness = 'lowest';
    c.heat = Math.min(100, c.heat + 15);
    c.reasons = [`Lowest price we found anywhere - next best is ${rupees(other.price)} at ${other.shop}`, ...c.reasons].slice(0, 5);
  } else {
    c.uniqueness = 'unknown';
  }
  c.tier = tierFor(c.heat);
}

/** "Flat 40% off on sarees" style blanket offers - not one specific item, so not worth a deal page. */
export function isGenericOffer(title: string, hasPrice: boolean): boolean {
  if (hasPrice) return false;
  const t = title.toLowerCase();
  if (/\b(flat|upto|up to|minimum|min\.?|starting|extra|get)\b[^.]{0,30}\d+\s*%/.test(t)) return true;
  if (/\b(sale|festival|clearance|collection|collections|offer|offers|all|any|range|season)\b/.test(t) && !/\b[a-z]*\d{2,}[a-z0-9-]*\b/.test(t)) return true;
  return false;
}


/**
 * Shopify shops publish every product, its price and its "compare at" (original) price at /products.json.
 * That is real structured data straight from the shop, so these items need no page scraping.
 */
export function parseShopifyProducts(json: unknown, origin: string, source: string, limit = 14): RawItem[] {
  const list = (json as { products?: unknown } | null)?.products;
  if (!Array.isArray(list)) return [];
  const out: (RawItem & { disc: number })[] = [];
  for (const p of list as Record<string, unknown>[]) {
    const handle = typeof p.handle === 'string' ? p.handle : '';
    const title = typeof p.title === 'string' ? p.title : '';
    if (!handle || !title) continue;
    const variants = Array.isArray(p.variants) ? (p.variants as Record<string, unknown>[]) : [];
    let best: { price: number; mrp: number; disc: number } | null = null;
    for (const v of variants) {
      if (v.available === false) continue;
      const price = parsePrice(v.price);
      const mrp = parsePrice(v.compare_at_price);
      if (!price || !mrp || mrp <= price) continue;
      const disc = Math.round(((mrp - price) / mrp) * 100);
      if (!best || disc > best.disc) best = { price, mrp, disc };
    }
    if (!best || best.disc < 8) continue;
    const images = Array.isArray(p.images) ? (p.images as Record<string, unknown>[]) : [];
    const img = images[0] && typeof images[0].src === 'string' ? (images[0].src as string) : undefined;
    const type = typeof p.product_type === 'string' ? p.product_type : '';
    out.push({ url: `${origin}/products/${handle}`, title: `${title}${type ? '' : ''}`.slice(0, 200), price: best.price, mrp: best.mrp, pct: best.disc, image: img, source, category: type || undefined, trusted: true, disc: best.disc });
  }
  out.sort((a, b) => b.disc - a.disc);
  return out.slice(0, limit).map((o) => { const { disc, ...rest } = o; void disc; return rest; });
}

/** WooCommerce shops publish on-sale products at /wp-json/wc/store/v1/products?on_sale=true (prices in minor units). */
export function parseWooProducts(json: unknown, source: string, limit = 14): RawItem[] {
  if (!Array.isArray(json)) return [];
  const out: RawItem[] = [];
  for (const p of json as Record<string, unknown>[]) {
    const prices = p.prices as Record<string, unknown> | undefined;
    const link = typeof p.permalink === 'string' ? p.permalink : '';
    const name = typeof p.name === 'string' ? p.name : '';
    if (!prices || !link || !name || p.is_in_stock === false) continue;
    const minor = Number(prices.currency_minor_unit ?? 2);
    const div = Math.pow(10, Number.isFinite(minor) ? minor : 2);
    const price = Number(prices.price) / div;
    const mrp = Number(prices.regular_price) / div;
    if (!(price > 0) || !(mrp > price)) continue;
    const disc = Math.round(((mrp - price) / mrp) * 100);
    if (disc < 8) continue;
    const imgs = Array.isArray(p.images) ? (p.images as Record<string, unknown>[]) : [];
    const cats = Array.isArray(p.categories) ? (p.categories as Record<string, unknown>[]) : [];
    out.push({ url: link, title: decodeText(name).slice(0, 200), price, mrp, pct: disc, image: imgs[0] && typeof imgs[0].src === 'string' ? (imgs[0].src as string) : undefined, source, category: cats[0] && typeof cats[0].name === 'string' ? (cats[0].name as string) : undefined, trusted: true });
  }
  out.sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
  return out.slice(0, limit);
}
