import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../../../../db/client.js';
import { deals, dealMedia } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { UPLOAD_DIR } from '../../../../lib/uploads.js';
import { reviewImages } from '../../../../lib/image-review.js';
import { cautionNote, REJECT_MESSAGE } from '../../../../lib/deal-review-core.js';
import { sendReviewAlert } from '../../../../lib/review-mail.js';

// POST /api/deals/:id/finalize
// Last step of submitting a deal: checks its pictures. If they pass, the deal goes live.
// If a picture is adult / violent the whole deal is rejected and deleted; if some pictures are just
// poor (tiny, blank, blurry) those pictures are removed and the rest are kept.
function removeLocalFile(url: string) {
  if (!url.startsWith('/api/uploads/')) return;
  const name = path.basename(url.slice('/api/uploads/'.length).split('?')[0]);
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return;
  try { fs.unlinkSync(path.join(UPLOAD_DIR, name)); } catch { /* already gone */ }
}

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: req.headers as unknown as Headers });
    if (!session?.user) return res.status(401).json({ error: 'Login required' });

    const dealId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    if (isNaN(dealId)) return res.status(400).json({ error: 'Invalid deal id' });

    const [deal] = await db.select().from(deals).where(eq(deals.id, dealId)).limit(1);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    const isAdmin = Boolean((session.user as { isAdmin?: boolean }).isAdmin);
    if (deal.submittedBy !== session.user.id && !isAdmin) return res.status(403).json({ error: 'Not your deal' });

    // Already live (admin deals, or finalized before): nothing to do.
    if (deal.status !== 'pending') return res.json({ ok: true, deal, removedPictures: 0 });

    const media = await db.select().from(dealMedia).where(eq(dealMedia.dealId, dealId)).orderBy(dealMedia.sortOrder);
    const images = media.filter((m) => m.type === 'image');
    const review = await reviewImages(images.map((m) => ({ id: m.id, url: m.url })));
    const who = { id: session.user.id, name: session.user.name, email: session.user.email };
    const summary = { id: dealId, title: deal.title, url: deal.url, retailer: deal.retailer, salePrice: deal.salePrice, originalPrice: deal.originalPrice };

    const bad = review.results.filter((r) => r.status === 'reject_content');
    const poor = review.results.filter((r) => r.status === 'drop_quality');
    const rejectDeal = bad.length > 0 || (images.length > 0 && poor.length === images.length);

    if (rejectDeal) {
      const reasons = [
        ...bad.flatMap((r) => r.reasons),
        ...(bad.length === 0 ? poor.flatMap((r) => r.reasons).map((r) => `All pictures unusable: ${r}`) : []),
      ];
      const detail = review.results.map((r) => `picture ${r.id} [${r.checkedBy.join('+')}]: ${r.status}${r.reasons.length ? ' - ' + r.reasons.join(', ') : ''}`);
      for (const m of media) removeLocalFile(m.url);
      await db.delete(deals).where(eq(deals.id, dealId)); // media rows go with it (cascade)
      void sendReviewAlert({ kind: 'rejected', stage: 'picture check', submitter: who, deal: summary, reasons, signals: detail });
      return res.status(422).json({ error: REJECT_MESSAGE, rejected: true });
    }

    // drop the poor pictures, keep the rest
    let removed = 0;
    for (const r of poor) {
      const m = images.find((x) => x.id === r.id);
      if (!m) continue;
      await db.delete(dealMedia).where(eq(dealMedia.id, m.id));
      removeLocalFile(m.url);
      removed++;
    }
    const keep = images.filter((m) => !poor.some((r) => r.id === m.id));

    // warnings from the pictures are added to the editor's note
    const warns = review.results.flatMap((r) => r.warn);
    let note = deal.editorNote;
    if (warns.length > 0) {
      const extra = cautionNote(Array.from(new Set(warns.map((w) => `Pictures: ${w}.`))));
      note = note ? `${note}\n\n${extra}` : extra;
      void sendReviewAlert({ kind: 'caution', stage: 'picture check', submitter: who, deal: summary, reasons: warns });
    }

    const mainImage = keep.some((m) => m.url === deal.imageUrl) ? deal.imageUrl : (keep[0]?.url ?? null);
    await db.update(deals).set({ status: 'new', editorNote: note ?? null, imageUrl: mainImage }).where(eq(deals.id, dealId));
    const [live] = await db.select().from(deals).where(eq(deals.id, dealId)).limit(1);
    res.json({ ok: true, deal: live, removedPictures: removed, checked: { pixels: review.pixelChecks, ai: review.geminiChecks } });
  } catch (err) {
    res.status(500).json({ error: 'Could not finish checking the deal', message: String(err) });
  }
}
