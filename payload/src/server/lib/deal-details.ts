/** Puts it together: read the page, draft the form, save the pictures. */
import { safeGet, extractImageUrls } from './page-images.js';
import { extractProductFacts, buildRuleDraft, priceLines, detectRetailer, type DealDraft } from './deal-facts.js';
import { draftWithAI, aiConfigured } from './deal-ai.js';
import { collectImages, type CollectedImage } from './image-collector.js';
import { clearUserTmp } from './tmp-images.js';

export type DealDetails = {
  draft: DealDraft;
  images: CollectedImage[];
  notes: string[];
  usedAI: boolean;
  aiConfigured: boolean;
};

export async function buildDealDetails(rawUrl: string, userId: string): Promise<DealDetails> {
  clearUserTmp(userId); // forget pictures from the previous lookup
  const notes: string[] = [];
  let html = '';
  let finalUrl = rawUrl;
  try {
    const res = await safeGet(rawUrl, { maxBytes: 1_500_000, truncate: true, accept: 'text/html,application/xhtml+xml', timeoutMs: 10_000 });
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
    if (ai.highlights.length) parts.push('Key points\n' + ai.highlights.map((h) => `• ${h}`).join('\n'));
    if (ai.whyDeal.length) parts.push('Why this may be a deal\n' + ai.whyDeal.map((h) => `• ${h}`).join('\n'));
    const price = priceLines(facts);
    if (price.length) parts.push(price.map((p) => `• ${p}`).join('\n'));
    parts.push(`• Check the final price, coupons and stock on ${retailer} before buying.`);
    draft.longDetails = parts.join('\n\n');
  }

  let images: CollectedImage[] = [];
  if (html) {
    const candidates = extractImageUrls(html, finalUrl);
    images = await collectImages(candidates, finalUrl, userId);
    if (images.length === 0) notes.push('No usable pictures could be copied from that page. You can upload pictures yourself below.');
  }
  return { draft, images, notes, usedAI, aiConfigured: aiConfigured() };
}
