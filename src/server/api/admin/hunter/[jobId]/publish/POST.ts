import type { Request, Response } from 'express';
import { eq, or } from 'drizzle-orm';
import { db } from '../../../../../db/client.js';
import { deals } from '../../../../../db/schema.js';
import { requireAdmin } from '../../../../../lib/hunter/admin-guard.js';
import { getJob } from '../../../../../lib/hunter/hunter-jobs.js';
import { downloadImageToUpload } from '../../../../../lib/page-images.js';
import { publishFile } from '../../../../../lib/uploads.js';
import { titleWithPrice } from '../../../../../lib/deal-facts.js';
import { queueOfferNote } from '../../../../../lib/deal-offers.js';

/** Posts the deals the admin ticked. They go live straight away (status 'new'). */
export default async function handler(req: Request, res: Response) {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const job = getJob(String(req.params.jobId));
    if (!job || job.userId !== admin.id || job.status !== 'done') return res.status(404).json({ error: 'That search is not available any more. Please start again.' });
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    if (ids.length === 0) return res.status(400).json({ error: 'Tick at least one deal first.' });

    const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const posted: { id: string; dealId: number; title: string }[] = [];
    const skipped: { id: string; reason: string }[] = [];

    for (const id of ids.slice(0, 60)) {
      const c = job.results.find((r) => r.id === id);
      if (!c) { skipped.push({ id, reason: 'not in this search' }); continue; }
      if (job.posted[id]) { skipped.push({ id, reason: 'already posted' }); continue; }
      const same = await db.select({ id: deals.id }).from(deals).where(or(eq(deals.url, c.url), eq(deals.title, c.title))).limit(1);
      if (same.length) { skipped.push({ id, reason: 'this deal is already on the site' }); continue; }

      // Copy the first picture that downloads; if none can be copied, link to the shop's own picture so the deal is never blank.
      let imageUrl: string | null = null;
      const pictures = Array.from(new Set([...(c.images ?? []), ...(c.imageUrl ? [c.imageUrl] : [])])).slice(0, 8);
      for (const pic of pictures) {
        for (const referer of [c.url, undefined]) {
          try { imageUrl = await publishFile(await downloadImageToUpload(pic, referer)); break; } catch { /* try the next one */ }
        }
        if (imageUrl) break;
      }
      if (!imageUrl && pictures[0]) imageUrl = pictures[0];
      const title = titleWithPrice(c.title, c.salePrice, c.originalPrice, 'INR').slice(0, 480);
      const notes = [`Found by the ChennaiDeals Deal Hunter on ${today}.`, 'Offers change quickly - please confirm the final price, stock and return policy on the shop before you pay.'];
      if (c.warnings.length) notes.push(...c.warnings.map((w) => `Note: ${w}.`));
      const social = c.source === 'Social post' ? `Seen in a public social media post${c.postedAt ? ` (${c.postedAt})` : ''}${c.likes ? `, ${c.likes.toLocaleString('en-IN')} likes` : ''}${c.views ? `, ${c.views.toLocaleString('en-IN')} views` : ''}.` : '';
      const description = [c.description, social, c.reasons.length ? 'Why it is hot\n' + c.reasons.map((r) => `• ${r}`).join('\n') : ''].filter(Boolean).join('\n\n');
      const result = await db.insert(deals).values({
        title, description: description || null, url: c.url, imageUrl,
        originalPrice: c.originalPrice ? String(c.originalPrice) : null,
        salePrice: c.salePrice ? String(c.salePrice) : null,
        savingsPercent: c.discountPercent,
        retailer: c.retailer.slice(0, 100), category: c.category, area: c.area,
        status: 'new', editorNote: notes.join(' '),
        score: 0, upvotes: 0, downvotes: 0,
        submittedBy: admin.id, submittedByName: admin.name || admin.email || 'ChennaiDeals',
        expiresAt: null,
      });
      const dealId = Number(result[0].insertId);
      job.posted[id] = dealId;
      queueOfferNote(dealId);
      posted.push({ id, dealId, title });
    }
    res.json({ posted, skipped });
  } catch (err) {
    res.status(500).json({ error: 'Could not post the deals', message: String(err) });
  }
}
