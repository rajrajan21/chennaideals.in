import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { deals } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import { reviewDealText } from '../../lib/deal-review.js';
import { cautionNote, REJECT_MESSAGE } from '../../lib/deal-review-core.js';
import { sendReviewAlert } from '../../lib/review-mail.js';

// Every new deal is checked automatically before it can appear on the site:
//   step 1 (here): the link, the website, the wording, the prices
//   step 2 (/api/deals/:id/finalize): the pictures
// Until step 2 passes the deal has status 'pending' and is invisible to everyone but its author.
const recent = new Map<string, number[]>();
function allowSubmit(userId: string): boolean {
  const now = Date.now();
  const list = (recent.get(userId) ?? []).filter((t) => now - t < 3_600_000);
  if (list.length >= 10) { recent.set(userId, list); return false; }
  list.push(now);
  recent.set(userId, list);
  return true;
}

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: req.headers as unknown as Headers });
    if (!session?.user) return res.status(401).json({ error: 'Login required to submit a deal' });

    const {
      title, description, url, imageUrl,
      originalPrice, salePrice,
      retailer, category, area, expiresAt,
    } = req.body;

    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
    if (!retailer?.trim()) return res.status(400).json({ error: 'Retailer is required' });
    if (!category?.trim()) return res.status(400).json({ error: 'Category is required' });

    const isAdmin = Boolean((session.user as { isAdmin?: boolean }).isAdmin);
    if (!isAdmin && !allowSubmit(session.user.id)) {
      return res.status(429).json({ error: 'You have submitted many deals in the last hour. Please try again later.' });
    }

    const orig = parseFloat(originalPrice) || null;
    const sale = parseFloat(salePrice) || null;
    const savings = orig && sale ? Math.round(((orig - sale) / orig) * 100) : null;

    // ---- automatic review (editors / admins are trusted and skip it) ----
    let cautions: string[] = [];
    if (!isAdmin) {
      const verdict = await reviewDealText({
        title: String(title), description: String(description ?? ''), url: String(url ?? '').trim(),
        retailer: String(retailer), originalPrice: orig, salePrice: sale,
      });
      const who = { id: session.user.id, name: session.user.name, email: session.user.email };
      const summary = { title: String(title), url: String(url ?? ''), retailer: String(retailer), salePrice: sale, originalPrice: orig };
      if (verdict.decision === 'reject') {
        void sendReviewAlert({ kind: 'rejected', stage: 'link and text check', submitter: who, deal: summary, reasons: verdict.rejectReasons, signals: verdict.signals });
        return res.status(422).json({ error: REJECT_MESSAGE, rejected: true });
      }
      cautions = verdict.cautions;
    }

    const result = await db.insert(deals).values({
      title: title.trim(),
      description: description?.trim() || null,
      url: url?.trim() || null,
      imageUrl: imageUrl?.trim() || null,
      originalPrice: orig ? String(orig) : null,
      salePrice: sale ? String(sale) : null,
      savingsPercent: savings,
      retailer: retailer.trim(),
      category: category.trim(),
      area: area?.trim() || 'Chennai',
      status: isAdmin ? 'new' : 'pending',
      editorNote: cautions.length > 0 ? cautionNote(cautions) : null,
      score: 0,
      upvotes: 0,
      downvotes: 0,
      submittedBy: session.user.id,
      submittedByName: session.user.name || session.user.email,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });

    const insertId = Number(result[0].insertId);
    const [newDeal] = await db.select().from(deals).where(eq(deals.id, insertId)).limit(1);

    if (cautions.length > 0) {
      void sendReviewAlert({
        kind: 'caution', stage: 'link and text check',
        submitter: { id: session.user.id, name: session.user.name, email: session.user.email },
        deal: { id: insertId, title: String(title), url: String(url ?? ''), retailer: String(retailer), salePrice: sale, originalPrice: orig },
        reasons: cautions,
      });
    }

    res.status(201).json(newDeal);
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit deal', message: String(err) });
  }
}
