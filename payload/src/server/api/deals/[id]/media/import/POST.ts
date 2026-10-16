import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { deals, dealMedia } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { MAX_IMAGES, publishFile } from '../../../../../lib/uploads.js';
import { takeTmpImage } from '../../../../../lib/tmp-images.js';

// POST /api/deals/:id/media/import  { tokens: string[] }
// Adds pictures that were already downloaded (full size) while the user was choosing them.
// Submitter or admin only. Nothing is downloaded again here, so it cannot fail halfway.
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
    if (deal.submittedBy !== session.user.id && !isAdmin) {
      return res.status(403).json({ error: 'Only the submitter or an editor can add media' });
    }

    const tokens: string[] = Array.isArray(req.body?.tokens)
      ? Array.from(new Set((req.body.tokens as unknown[]).filter((t): t is string => typeof t === 'string')))
      : [];
    if (tokens.length === 0) return res.status(400).json({ error: 'No pictures chosen' });

    const existing = await db.select().from(dealMedia).where(eq(dealMedia.dealId, dealId));
    const existingImages = existing.filter((m) => m.type === 'image').length;
    const room = MAX_IMAGES - existingImages;
    if (room <= 0) return res.status(400).json({ error: `A deal can have at most ${MAX_IMAGES} images` });

    const published: string[] = [];
    let skipped = Math.max(0, tokens.length - room);
    for (const token of tokens.slice(0, room)) {
      try {
        const file = await takeTmpImage(token, session.user.id);
        if (!file) { skipped += 1; continue; }
        published.push(await publishFile(file));
      } catch {
        skipped += 1;
      }
    }

    if (published.length === 0) {
      return res.status(422).json({ error: 'The chosen pictures expired. Please press "Get details from link" again, or upload the pictures yourself.' });
    }

    await db.insert(dealMedia).values(
      published.map((url, i) => ({ dealId, type: 'image', url, sortOrder: existingImages + i })),
    );
    if (!deal.imageUrl) {
      await db.update(deals).set({ imageUrl: published[0] }).where(eq(deals.id, dealId));
    }

    const media = await db.select().from(dealMedia).where(eq(dealMedia.dealId, dealId)).orderBy(dealMedia.sortOrder);
    res.status(201).json({ media, imported: published.length, skipped });
  } catch (err) {
    res.status(500).json({ error: 'Could not add the pictures', message: String(err) });
  }
}
