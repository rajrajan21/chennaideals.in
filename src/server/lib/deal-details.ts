/** Phase 1 of "Get details from link": read the page and draft the form. Pictures come afterwards. */
import { safeGet, extractImageUrls } from './page-images.js';
import { extractProductFacts, buildRuleDraft, priceLines, detectRetailer, titleWithPrice, type DealDraft } from './deal-facts.js';
import { draftWithAI, aiConfigured } from './deal-ai.js';
import { createLookup } from './lookup-store.js';
import { clearUserTmp } from './tmp-images.js';

export const MAX_CANDIDATES_SHOWN = 8;

export type DealDetails = {
  draft: DealDraft;
  notes: string[];
  usedAI: boolean;
  aiConfigured: boolean;
  lookupId: string | null;
  candidateCount: number;
};

export async function buildDealDetails(rawUrl: string, userId: string): Promise<DealDetails> {
  clearUserTmp(userId); // forget pictures from the previous lookup
  const notes: string[] = [];
  let html = '';
  let finalUrl = rawUrl;
  try {
    const res = await safeGet(rawUrl, { maxBytes: 1_500_000, truncate: true, accept: 'text/html,application/xhtml+xml', timeoutMs: 8_000, compress: true });
    finalUrl = res.finalUrl;
    if (res.status < 400 && /html|xml/i.test(String(res.headers['content-type'] ?? ''))) html = res.body.toString('utf8');
  } catch (err) {
    notes.push(err instanceof Error ? err.message : 'Could not open that link.');
  }

  const facts = extractProductFacts(html, finalUrl);
  const retailer = detectRetailer(finalUrl, facts.siteName);
  const draft = buildRuleDraft(facts, finalUrl);
  if (!html) {
    notes.push(`${retailer} did not let us read the page automatically, so only the product name from the link was filled in. Please add the price and details yourself.`);
  } else if (facts.price === undefined) {
    notes.push('The price was not found on the page - please enter it.');
  }

  let usedAI = false;
  const ai = await draftWithAI(facts, retailer);
  if (ai) {
    usedAI = true;
    if (ai.title) draft.title = ai.title;
    if (ai.description) draft.description = ai.description;
    if (ai.category) draft.category = ai.category;
    const parts: string[] = [];
    if (ai.highlights.length) parts.push('Key points\n' + ai.highlights.map((h) => `\u2022 ${h}`).join('\n'));
    if (ai.whyDeal.length) parts.push('Why this may be a deal\n' + ai.whyDeal.map((h) => `\u2022 ${h}`).join('\n'));
    const price = priceLines(facts);
    if (price.length) parts.push(price.map((p) => `\u2022 ${p}`).join('\n'));
    parts.push(`\u2022 Check the final price, coupons and stock on ${retailer} before buying.`);
    draft.longDetails = parts.join('\n\n');
  }

  // Title carries the real numbers: offer price, original price and the discount.
  draft.title = titleWithPrice(draft.title, draft.salePrice, draft.originalPrice, facts.currency);
  if (draft.salePrice !== null && draft.originalPrice === null) {
    notes.push('The original price was not found on the page - enter it if you know it and the title will still show the offer price.');
  } else if (facts.mrpEstimated) {
    notes.push('The original price was worked out from the discount shown on the page, so it may be a few rupees off - please check it.');
  }

  let lookupId: string | null = null;
  let candidateCount = 0;
  if (html) {
    const candidates = extractImageUrls(html, finalUrl).slice(0, MAX_CANDIDATES_SHOWN);
    if (candidates.length > 0) {
      lookupId = createLookup(userId, finalUrl, candidates);
      candidateCount = candidates.length;
    } else {
      notes.push('No pictures were found on that page. You can upload pictures yourself below.');
    }
  }
  return { draft, notes, usedAI, aiConfigured: aiConfigured(), lookupId, candidateCount };
}
