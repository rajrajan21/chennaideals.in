/**
 * Where the Deal Hunter looks. The list lives in data/hunter-sources.json so you can add or remove
 * shops without touching code. The file is created with these defaults the first time it is needed.
 * A shop that blocks automatic reading is simply skipped (and shown as "skipped" on the screen).
 */
import fs from 'node:fs';
import path from 'node:path';

export type Source = { name: string; url: string; city?: string };
export type SourceFile = { ecommerce: Source[]; local: Source[]; shopify: Source[] };

/** Shops built on Shopify publish all products + original prices at /products.json - the most reliable source. Prices are assumed to be INR. */
const SHOPIFY_DEFAULTS: Source[] = [
  { name: 'boAt', url: 'https://www.boat-lifestyle.com' },
  { name: 'Noise', url: 'https://www.gonoise.com' },
  { name: 'Snitch', url: 'https://www.snitch.com' },
  { name: 'Plum', url: 'https://plumgoodness.com' },
  { name: 'mCaffeine', url: 'https://mcaffeine.com' },
  { name: 'Minimalist', url: 'https://beminimalist.co' },
  { name: 'Foxtale', url: 'https://foxtale.in' },
  { name: 'Dot & Key', url: 'https://www.dotandkey.com' },
  { name: 'Wakefit', url: 'https://www.wakefit.co' },
  { name: 'Libas', url: 'https://www.libas.in' },
  { name: 'Bonkers Corner', url: 'https://www.bonkerscorner.com' },
  { name: 'Mokobara', url: 'https://mokobara.com' },
  { name: 'Chumbak', url: 'https://www.chumbak.com' },
  { name: 'The Whole Truth', url: 'https://thewholetruthfoods.com' },
  { name: 'Ugaoo', url: 'https://www.ugaoo.com' },
  { name: 'Pothys', url: 'https://www.pothys.com', city: 'Chennai' },
  { name: 'Nalli', url: 'https://www.nalli.com', city: 'Chennai' },
  { name: 'Girias', url: 'https://www.girias.com', city: 'Chennai' },
];

const DEFAULTS: SourceFile = {
  shopify: SHOPIFY_DEFAULTS,
  ecommerce: [
    { name: 'Amazon.in', url: 'https://www.amazon.in/deals' },
    { name: 'Flipkart', url: 'https://www.flipkart.com/offers-store' },
    { name: 'Croma', url: 'https://www.croma.com/deals-of-the-day' },
    { name: 'Reliance Digital', url: 'https://www.reliancedigital.in/collection/top-deals' },
    { name: 'Vijay Sales', url: 'https://www.vijaysales.com/deals' },
    { name: 'Tata CLiQ', url: 'https://www.tatacliq.com/' },
    { name: 'Nykaa', url: 'https://www.nykaa.com/sp/offers' },
    { name: 'Snapdeal', url: 'https://www.snapdeal.com/products/deals' },
  ],
  local: [
    { name: 'Poorvika Mobiles', url: 'https://www.poorvika.com/offers', city: 'Chennai' },
    { name: 'Sangeetha Mobiles', url: 'https://www.sangeethamobiles.com/', city: 'Chennai' },
    { name: 'Pothys', url: 'https://www.pothys.com/', city: 'Chennai' },
    { name: 'Nalli Silks', url: 'https://www.nalli.com/', city: 'Chennai' },
    { name: 'Girias', url: 'https://www.girias.com/', city: 'Chennai' },
  ],
};

const FILE = path.resolve(process.cwd(), 'data', 'hunter-sources.json');

function clean(list: unknown): Source[] {
  if (!Array.isArray(list)) return [];
  const out: Source[] = [];
  for (const s of list) {
    const o = s as Partial<Source>;
    if (typeof o?.name === 'string' && typeof o?.url === 'string' && /^https?:\/\//i.test(o.url)) {
      out.push({ name: o.name.slice(0, 60), url: o.url, city: typeof o.city === 'string' ? o.city : undefined });
    }
  }
  return out;
}

export function loadSources(): SourceFile {
  try {
    if (!fs.existsSync(FILE)) {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(FILE, JSON.stringify(DEFAULTS, null, 2));
      return DEFAULTS;
    }
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Partial<SourceFile>;
    const e = clean(raw.ecommerce);
    const l = clean(raw.local);
    const sh = clean(raw.shopify);
    return { ecommerce: e.length ? e : DEFAULTS.ecommerce, local: l.length ? l : DEFAULTS.local, shopify: sh.length ? sh : DEFAULTS.shopify };
  } catch {
    return DEFAULTS;
  }
}

/** Local shops for the chosen city. Shops tagged "Chennai" count for every Chennai area. */
export function localSourcesFor(city: string): Source[] {
  const wanted = city.trim().toLowerCase();
  const chennaiWide = !wanted || wanted.startsWith('chennai');
  const chennaiAreas = ['t. nagar', 'anna nagar', 'velachery', 'adyar', 'mylapore', 'nungambakkam', 'porur', 'tambaram', 'guindy', 'omr', 'perambur', 'purasawalkam', 'chromepet', 'ambattur', 'kodambakkam', 'vadapalani', 'egmore'];
  const inChennai = chennaiWide || chennaiAreas.some((a) => wanted.startsWith(a));
  return loadSources().local.filter((s) => {
    const c = (s.city ?? 'Chennai').toLowerCase();
    if (!wanted || chennaiWide) return c.startsWith('chennai');
    if (inChennai && c.startsWith('chennai')) return true;
    return c === wanted || wanted.startsWith(c);
  });
}

/** Shopify shops to read: city-less ones are online shops; city-tagged ones are local shops. */
export function shopifyFor(mode: 'ecommerce' | 'local', city: string): Source[] {
  const all = loadSources().shopify;
  if (mode === 'ecommerce') return all.filter((s) => !s.city);
  const wanted = city.trim().toLowerCase();
  return all.filter((s) => s.city && (wanted.startsWith('chennai') || wanted === s.city.toLowerCase() || /nagar|velachery|adyar|mylapore|porur|tambaram|guindy|omr|perambur|chromepet|ambattur|kodambakkam|vadapalani|egmore|nungambakkam|purasawalkam/.test(wanted)));
}
