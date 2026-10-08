import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { deals, comments, votes } from '../../../db/schema.js';
import { eq, desc, and } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid deal id' });

    const [deal] = await db.select().from(deals).where(eq(deals.id, id)).limit(1);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    // Increment view count
    await db.update(deals).set({ viewCount: deal.viewCount + 1 }).where(eq(deals.id, id));

    // Comments (top-level only, replies fetched separately)
    const dealComments = await db.select().from(comments)
      .where(and(eq(comments.dealId, id)))
      .orderBy(desc(comments.createdAt))
      .limit(50);

    // Current user's vote
    let userVote = 0;
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: req.headers as unknown as Headers });
    if (session?.user) {
      const [v] = await db.select().from(votes)
        .where(and(eq(votes.dealId, id), eq(votes.userId, session.user.id)))
        .limit(1);
      if (v) userVote = v.value;
    }

    res.json({ deal: { ...deal, viewCount: deal.viewCount + 1 }, comments: dealComments, userVote });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch deal', message: String(err) });
  }
}
