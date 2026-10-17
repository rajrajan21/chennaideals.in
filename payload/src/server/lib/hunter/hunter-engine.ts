/**
 * Deal Hunter engine (network part). It never gives up just because a shop blocks us - it switches method:
 *   1. shop product feeds (Shopify / WooCommerce publish prices + original prices openly)       -> trusted data
 *   2. shop deal pages we are allowed to read
 *   3. for shops that are blocked: the chosen AI engines search the live web for that shop's offers
 *   4. social posts (public Facebook / Instagram / ad pages, last few days) via the AI engines' web search
 *   5. local mode: discover the best-selling shops of each area, then look for their discounted items
 * Then: verify on the shop's page when possible, compare with other shops, score, safety-check, rate.
 * If the first round finds too little, a deeper second round runs. Whatever is found is shown with a rating.
 */
import { safeGet, extractImageUrls } from '../page-images.js';
import { extractProductFacts, detectRetailer, guessCategory, cleanTitle, titleFromUrl, percentFromText } from '../deal-facts.js';
import { reviewDealText } from '../deal-review.js';
import {
  applyUniqueness, areaForCity, guessSubcategory, isGenericOffer, isOfficial, listingSignal, looksLikeListingUrl, looksLikePriceRange,
  matchesFilter, parseListing, parseShopifyProducts, parseWooProducts, pickTop, productEvidence, productUrlShape, scoreCandidates,
  type Candidate, type HuntMode, type RawItem,
} from './hunter-core.js';
import { loadSources, localSourcesFor, shopifyFor, type Source } from './hunter-sources.js';
import { discoverShops, findOtherPrices, polishWithAI, searchEcommerceWithAI, shopOffers, socialOnline, socialPosts, readyProviders, type SearchOpts, type Shop } from './hunter-ai.js';
import { progress, type Job } from './hunter-jobs.js';

const BUDGET_MS = 40 * 60_000;
const DEEP_AREAS = ['T. Nagar', 'Anna Nagar', 'Velachery', 'Adyar', 'Porur', 'Tambaram', 'Mylapore', 'Guindy'];

async function inPool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>, stop: () => boolean): Promise<R[]> {
  const out: R[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length && !stop()) {
      const mine = next++;
      out[mine] = await fn(items[mine]);
    }
  }));
  return out.filter((x) => x !== undefined);
}

type Page = { html: string; finalUrl: string; status: number };
async function readPage(url: string): Promise<Page> {
  try {
    const r = await safeGet(url, { maxBytes: 1_500_000, truncate: true, accept: 'text/html,application/xhtml+xml', timeoutMs: 10_000, compress: true });
    const ok = r.status < 400 && /html|xml/i.test(String(r.headers['content-type'] ?? ''));
    return { html: ok ? r.body.toString('utf8') : '', finalUrl: r.finalUrl, status: r.status };
  } catch {
    return { html: '', finalUrl: url, status: 0 };
  }
}

async function getJson(url: string): Promise<unknown> {
  try {
    const r = await safeGet(url, { maxBytes: 10_000_000, accept: 'application/json', timeoutMs: 20_000, compress: true });
    if (r.status !== 200) return null;
    return JSON.parse(r.body.toString('utf8')) as unknown;
  } catch { return null; }
}

type Report = { name: string; ok: boolean; found: number; note?: string };

/** Method 1: the shop's own open product feed (Shopify, then WooCommerce). */
async function readStoreFeed(s: Source, deep: boolean, area?: string): Promise<{ report: Report; items: RawItem[] }> {
  let origin = '';
  try { origin = new URL(s.url).origin; } catch { return { report: { name: s.name, ok: false, found: 0, note: 'invalid address' }, items: [] }; }
  const items: RawItem[] = [];
  for (const page of deep ? [1, 2, 3] : [1]) {
    const j = await getJson(`${origin}/products.json?limit=250&page=${page}`);
    const got = parseShopifyProducts(j, origin, `${s.name} (shop feed)`, 14);
    if (!got.length && !(j as { products?: unknown[] } | null)?.products?.length) break;
    items.push(...got);
    if (items.length >= 14 && !deep) break;
  }
  if (!items.length) {
    const j = await getJson(`${origin}/wp-json/wc/store/v1/products?on_sale=true&per_page=100`);
    items.push(...parseWooProducts(j, `${s.name} (shop feed)`, 14));
  }
  if (area) items.forEach((i) => { i.area = area; i.retailer = s.name; });
  else items.forEach((i) => { i.retailer = s.name; });
  return { report: { name: `${s.name} - product feed`, ok: items.length > 0, found: items.length, note: items.length ? undefined : 'no open product feed' }, items };
}

/** Method 2: deal / offers pages. */
async function readListing(s: Source): Promise<{ report: Report; items: RawItem[]; blocked: boolean }> {
  const page = await readPage(s.url);
  if (!page.html) return { report: { name: s.name, ok: false, found: 0, note: `${page.status ? `blocked (HTTP ${page.status})` : 'not reachable'} - trying other methods` }, items: [], blocked: true };
  const items = parseListing(page.html, page.finalUrl, s.name);
  return { report: { name: s.name, ok: items.length > 0, found: items.length, note: items.length ? undefined : 'page is built by scripts - trying other methods' }, items, blocked: items.length === 0 };
}

function candidateFromRaw(raw: RawItem, mode: HuntMode, area: string, extra?: { html?: string; finalUrl?: string; siteName?: string; description?: string; images?: string[]; verified?: boolean }): Candidate | null {
  const title = cleanTitle(raw.title ?? titleFromUrl(raw.url) ?? '');
  if (!title || title.length < 4) return null;
  const price = raw.price ?? null;
  const mrp = raw.mrp && price !== null && raw.mrp > price ? raw.mrp : null;
  const discount = price !== null && mrp !== null ? Math.round(((mrp - price) / mrp) * 100) : raw.pct ?? percentFromText(`${raw.title ?? ''} ${raw.note ?? ''}`) ?? null;
  const url = extra?.finalUrl ?? raw.url;
  const images = extra?.images ?? (raw.image ? [raw.image] : []);
  const category = guessCategory(raw.category ? `${raw.category} ${title}` : title, extra?.description ?? '');
  return {
    id: '', mode, title, url,
    retailer: raw.retailer || detectRetailer(url, extra?.siteName),
    imageUrl: images[0] ?? null, images,
    salePrice: price, originalPrice: mrp, discountPercent: discount, offerText: raw.note ?? null,
    category, subCategory: guessSubcategory(category, title), uniqueness: 'unknown', otherBest: null,
    area: raw.area || area, description: (extra?.description ?? '').slice(0, 400),
    heat: 0, tier: 'normal', reasons: [], warnings: [],
    verified: extra?.verified ?? Boolean(raw.trusted), official: isOfficial(url),
    source: raw.source, foundBy: raw.providers ?? [raw.source],
    likes: raw.likes ?? null, views: raw.views ?? null, postedAt: raw.postedAt ?? null,
  };
}

function verifyOne(mode: HuntMode, area: string) {
  return async (raw: RawItem): Promise<Candidate | null> => {
    if (raw.trusted) return candidateFromRaw(raw, mode, area);
    const lead = raw.source === 'AI search' || raw.source === 'Social post';
    const onSocialSite = raw.source === 'Social post' && /(^|\.)(facebook|instagram|fb)\.(com|watch)$/i.test(hostOf(raw.url));
    const page: Page = onSocialSite ? { html: '', finalUrl: raw.url, status: 0 } : await readPage(raw.url);
    const facts = extractProductFacts(page.html, page.finalUrl);
    const rawTitle = facts.title ?? raw.title ?? titleFromUrl(page.finalUrl) ?? '';
    const evidence = page.html ? productEvidence(page.html) : 'none';
    const isProductPage = Boolean(page.html) && !looksLikeListingUrl(page.finalUrl) && !looksLikePriceRange(rawTitle)
      && (evidence === 'single' || (evidence === 'none' && productUrlShape(page.finalUrl)));

    if (isProductPage) {
      const pagePrice = facts.price;
      const price = pagePrice ?? raw.price;
      let mrp = facts.mrp ?? raw.mrp;
      if (price !== undefined && mrp !== undefined && mrp <= price) mrp = undefined;
      if (price !== undefined && mrp !== undefined && price < mrp * 0.05) return null;
      if (mode === 'ecommerce' && (price === undefined || price < 20)) return null;
      const images = extractImageUrls(page.html, page.finalUrl).slice(0, 6);
      if (raw.image && !images.includes(raw.image)) images.push(raw.image);
      const c = candidateFromRaw({ ...raw, title: raw.title && mode === 'local' && !facts.title ? raw.title : rawTitle, price, mrp }, mode, area,
        { finalUrl: page.finalUrl, siteName: facts.siteName, description: facts.description, images, verified: pagePrice !== undefined });
      if (!c) return null;
      if (mode === 'ecommerce' && (c.discountPercent === null || c.discountPercent < 10)) return null;
      if (mode !== 'ecommerce' && isGenericOffer(`${c.title} ${c.offerText ?? ''}`, c.salePrice !== null)) return null;
      return c;
    }

    // The page cannot be read (blocked / login wall / scripts), or it is a listing page.
    // An AI lead with its own price is kept - clearly marked as not confirmed on the shop's page.
    if (!lead || (page.html && raw.source !== 'Social post')) return null;
    if (looksLikeListingUrl(raw.url) && raw.source !== 'Social post') return null;
    if (mode === 'ecommerce' && !(raw.price && raw.price >= 20 && (raw.mrp || raw.pct))) return null;
    const c = candidateFromRaw(raw, mode, area, { verified: false });
    if (!c) return null;
    c.warnings = [`${raw.source === 'Social post' ? 'Seen in a social post' : 'The shop blocks automatic checking'} - confirm the price on the shop before posting`];
    if (mode === 'ecommerce' && (c.discountPercent === null || c.discountPercent < 10)) return null;
    if (mode !== 'ecommerce') {
      if (isGenericOffer(`${c.title} ${c.offerText ?? ''}`, c.salePrice !== null)) return null;
      if (c.salePrice === null && c.discountPercent === null) return null;
    }
    return c;
  };
}

function hostOf(u: string): string { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }

/** Same product found by several searches = merge, and remember who found it. */
function mergeRaws(list: RawItem[]): RawItem[] {
  const by = new Map<string, RawItem>();
  for (const r of list) {
    const k = r.url.replace(/[?#].*$/, '').replace(/\/$/, '');
    const cur = by.get(k);
    if (!cur) { by.set(k, { ...r, providers: r.providers ? [...r.providers] : [r.source] }); continue; }
    for (const p of r.providers ?? [r.source]) if (!cur.providers?.includes(p)) cur.providers = [...(cur.providers ?? []), p];
    cur.price ??= r.price; cur.mrp ??= r.mrp; cur.image ??= r.image; cur.note ??= r.note;
  }
  return Array.from(by.values());
}

export async function runHunt(job: Job): Promise<void> {
  const started = Date.now();
  const stop = () => Date.now() - started > BUDGET_MS;
  try {
    const mode = job.mode;
    const providers = readyProviders(job.providers);
    const area = mode === 'ecommerce' ? 'India' : areaForCity(/online/i.test(job.city) || /\+/.test(job.city) ? 'Chennai' : job.city);
    const filtering = job.categories.length > 0 || job.subCategory !== '';
    const opts = (deep: boolean): SearchOpts => ({ mode, city: job.city, count: job.count, categories: job.categories, subCategory: job.subCategory, providers, social: job.social, days: job.days, deep });
    const seen = new Set<string>();
    const all: Candidate[] = [];
    const noteAi = (notes: string[]) => { for (const n of notes) if (!job.log.includes(n)) job.log.push(n); };
    if (providers.length === 0 && mode === 'social') throw new Error('Option 3 needs at least one AI engine with a key (run tools\\Set-AI-Key.bat).');
    if (providers.length === 0) job.log.push('No AI engine is ready - using shop feeds and shop pages only. Add a key (for example GEMINI_API_KEY) to .env.local for much better results.');

    async function round(deep: boolean, base: number): Promise<void> {
      const label = deep ? 'Deeper search' : 'Search';
      const raws: RawItem[] = [];
      const blocked: Source[] = [];

      // 1 + 2: shop feeds and deal pages (these need no AI)
      progress(job, base + 2, `${label}: reading shop product feeds and deal pages`);
      const feedShops = mode === 'social' ? [] : shopifyFor(mode, job.city);
      const feeds = await inPool(feedShops, 4, (s) => readStoreFeed(s, deep, mode === 'local' ? area : undefined), stop);
      for (const f of feeds) { job.sources.push(f.report); raws.push(...f.items); }
      const pages: Source[] = mode === 'ecommerce' ? loadSources().ecommerce : mode === 'local' ? localSourcesFor(job.city) : [];
      if (!deep) {
        const lists = await inPool(pages, 4, readListing, stop);
        lists.forEach((l, i) => { job.sources.push(l.report); raws.push(...l.items); if (l.blocked) blocked.push(pages[i]); });
      }

      // 3-5: AI web search (online shops, blocked shops, social posts, local shops)
      if (providers.length > 0 && !stop()) {
        if (mode === 'ecommerce') {
          progress(job, base + 8, `${label}: AI web search across online shops${job.social ? ' and recent social posts' : ''}`);
          const run = await searchEcommerceWithAI(opts(deep));
          raws.push(...run.items); noteAi(run.notes);
          run.ok.forEach((o) => job.sources.push({ name: `${o.name} web search`, ok: o.found > 0, found: o.found, note: o.found ? undefined : 'nothing usable returned' }));
          if (blocked.length && !stop()) {
            progress(job, base + 14, `${label}: finding offers of blocked shops through AI search (${blocked.map((b) => b.name).join(', ')})`);
            const shops: Shop[] = blocked.map((b) => ({ name: b.name, url: b.url, area: 'India', kind: 'online shop' }));
            for (let i = 0; i < shops.length && !stop(); i += 3) {
              const r = await shopOffers(shops.slice(i, i + 3), opts(deep), providers[(i / 3) % providers.length]);
              raws.push(...r.items); if (r.note) noteAi([r.note]);
              job.sources.push({ name: `Blocked shops via AI: ${shops.slice(i, i + 3).map((s) => s.name).join(', ')}`, ok: r.items.length > 0, found: r.items.length });
            }
          }
        } else if (mode === 'social') {
          const online = /online/i.test(job.city);
          const chennai = /^chennai/i.test(job.city);
          const targets: string[] = [];
          if (chennai || !online) targets.push(...(chennai ? (deep ? DEEP_AREAS : DEEP_AREAS.slice(0, 3)) : [job.city]));
          if (online || /\+/.test(job.city)) targets.push('ONLINE');
          let n = 0;
          for (const t of targets) {
            n++;
            for (const p of providers) {
              if (stop()) break;
              progress(job, base + 6 + (n / targets.length) * 30, `${label}: ${t === 'ONLINE' ? 'online-shop deals' : t} - popular Facebook / Instagram posts (${p})`);
              const r = t === 'ONLINE' ? await socialOnline(opts(deep), p) : await socialPosts(t, opts(deep), p);
              raws.push(...r.items); if (r.note) noteAi([r.note]);
              job.sources.push({ name: `Social posts - ${t === 'ONLINE' ? 'online shops' : t} (${p})`, ok: r.items.length > 0, found: r.items.length });
            }
          }
        } else {
          const areas = /^chennai/i.test(job.city) ? (deep ? DEEP_AREAS : DEEP_AREAS.slice(0, 5)) : [job.city];
          let n = 0;
          for (const a of areas) {
            if (stop()) break;
            n++;
            progress(job, base + 6 + (n / areas.length) * 22, `${label}: ${a} - finding the most popular shops`);
            const found = await discoverShops(a, opts(deep), deep ? 14 : 10, providers[n % providers.length]);
            if (found.note) noteAi([found.note]);
            const known = pages.map((p) => ({ name: p.name, url: p.url, area: a, kind: 'local shop' }));
            const shops = [...found.shops, ...(n === 1 ? known : [])];
            job.sources.push({ name: `Shops in ${a}`, ok: shops.length > 0, found: shops.length, note: shops.length ? undefined : 'none found' });
            // their own product feeds, when they have one
            const withSites = found.shops.filter((s) => s.url && /^https?:\/\//.test(s.url)).slice(0, 8);
            const sf = await inPool(withSites, 4, (s) => readStoreFeed({ name: s.name, url: s.url as string }, false, a), stop);
            for (const f of sf) { if (f.items.length) { job.sources.push(f.report); raws.push(...f.items); } }
            for (let i = 0; i < shops.length && !stop(); i += 3) {
              progress(job, base + 6 + (n / areas.length) * 22, `${label}: ${a} - looking for discounted items at ${shops.slice(i, i + 3).map((s) => s.name).join(', ')}`);
              const r = await shopOffers(shops.slice(i, i + 3), opts(deep), providers[(i / 3 + n) % providers.length]);
              raws.push(...r.items); if (r.note) noteAi([r.note]);
            }
            if (job.social && !stop()) {
              progress(job, base + 6 + (n / areas.length) * 22, `${label}: ${a} - recent Facebook / Instagram / ad posts`);
              for (const p of providers) {
                const r = await socialPosts(a, opts(deep), p);
                raws.push(...r.items); if (r.note) noteAi([r.note]);
                job.sources.push({ name: `Social posts in ${a} (${p})`, ok: r.items.length > 0, found: r.items.length });
              }
            }
          }
        }
      }
      job.usedAI = job.usedAI || providers.length > 0;

      // verify
      const merged = mergeRaws(raws).filter((r) => { const k = r.url.replace(/[?#].*$/, ''); if (seen.has(k)) return false; seen.add(k); return true; });
      const aiBoost = (r: RawItem) => (r.trusted ? 20 : r.source === 'AI search' || r.source === 'Social post' ? 12 : 0) + (r.providers?.length ?? 1) * 3;
      merged.sort((a, b) => listingSignal(b) + aiBoost(b) - (listingSignal(a) + aiBoost(a)));
      const shortlist = merged.slice(0, Math.min(140, Math.max(job.count * (filtering ? 6 : 4), 24)));
      let done = 0;
      progress(job, base + 30, `${label}: checking ${shortlist.length} possible deals one by one`);
      const checked = await inPool(shortlist, 5, async (r) => {
        const c = await verifyOne(mode, area)(r);
        done++;
        progress(job, base + 30 + (done / Math.max(1, shortlist.length)) * 14, `${label}: checking possible deals (${done}/${shortlist.length})`);
        return c;
      }, stop);
      for (const c of checked) if (c && matchesFilter(c, job.categories, job.subCategory)) all.push(c);
    }

    await round(false, 0);
    if (all.length < job.count * 1.5 && !stop()) {
      job.log.push(`First search found ${all.length} usable deal(s) - starting a deeper search.`);
      await round(true, 45);
    }
    if (all.length === 0) job.log.push('Nothing usable was found. See "Where we looked" below for what each method returned.');
    all.forEach((c, i) => { c.id = `${job.id}-${i + 1}`; });

    // score and pick (no single category may take over the list)
    progress(job, 92, 'Comparing prices and rating the deals');
    scoreCandidates(all);
    const catCap = job.categories.length === 1 ? 0 : Math.max(2, Math.ceil(job.count * 0.34));
    const picks = pickTop(all, Math.min(60, Math.ceil(job.count * 1.8)), catCap);

    // is the price unique? look for the same product at other shops
    progress(job, 94, 'Checking whether any other shop sells it as cheaply');
    const cross = await findOtherPrices(picks, providers);
    const confirmed = await inPool(Array.from(cross.prices.entries()), 4, async ([id, o]) => {
      if (!o.url) return [id, o] as const;
      const pg = await readPage(o.url);
      const f = pg.html ? extractProductFacts(pg.html, pg.finalUrl) : null;
      return [id, f?.price ? { ...o, price: f.price, confirmed: true } : o] as const;
    }, stop);
    const others = new Map(confirmed);
    for (const c of picks) applyUniqueness(c, others.get(c.id) ?? null);
    if (!cross.checked) job.log.push('No AI engine could compare prices with other shops this time; prices were compared only within this search.');
    let kept = picks;
    if (job.strict) {
      const dropped = picks.filter((c) => c.uniqueness === 'matched');
      kept = picks.filter((c) => c.uniqueness !== 'matched');
      if (kept.length < job.count && dropped.length) {
        const fill = dropped.sort((a, b) => b.heat - a.heat).slice(0, job.count - kept.length);
        kept = [...kept, ...fill];
        job.log.push(`${fill.length} deal(s) that other shops also sell at a similar price were kept so the list is not empty - they are marked and rated lower.`);
      } else if (dropped.length) job.log.push(`${dropped.length} deal(s) removed because another shop sells them at the same or a lower price.`);
    }

    // safety review (same rules as user-submitted deals)
    progress(job, 96, 'Running the scam and safety check');
    const reviewed = await inPool(kept, 3, async (c) => {
      if (/(^|\.)(facebook|instagram|fb)\.(com|watch)$|fb\.watch/i.test(hostOf(c.url))) { c.warnings = [...c.warnings, 'Social post - verify the seller before buying'].slice(0, 4); return c; }
      try {
        const v = await reviewDealText({ title: c.title, description: c.description, url: c.url, retailer: c.retailer, originalPrice: c.originalPrice, salePrice: c.salePrice });
        if (v.decision === 'reject') return null;
        if (v.cautions.length) c.warnings = [...c.warnings, ...v.cautions].slice(0, 4);
        return c;
      } catch { return c; }
    }, stop);
    const safe = reviewed.filter((c): c is Candidate => Boolean(c));
    const finalList = pickTop(safe, job.count, catCap);

    progress(job, 98, 'Writing short catchy headlines');
    const words = await polishWithAI(finalList);
    for (const c of finalList) {
      const w = words.get(c.id);
      if (w) { c.title = w.title; if (w.blurb) c.description = w.blurb; }
    }
    finalList.sort((a, b) => b.heat - a.heat);
    job.results = finalList;
    job.percent = 100;
    const hot = finalList.filter((c) => c.tier === 'super-hot' || c.tier === 'hot').length;
    job.stage = finalList.length ? `Done - ${finalList.length} deal${finalList.length > 1 ? 's' : ''} found (${hot} hot or super hot)` : 'Done - nothing usable was found';
    job.status = 'done';
    if (finalList.length < job.count && finalList.length > 0) job.log.push(`Only ${finalList.length} of the ${job.count} you asked for could be found. More AI engines (tick them on the first screen) and more shops in data/hunter-sources.json find more.`);
  } catch (err) {
    job.status = 'error';
    job.error = err instanceof Error ? err.message : 'The search stopped unexpectedly';
    job.stage = 'Stopped';
  }
}
