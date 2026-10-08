import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { deals, votes } from '../../../../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { promoteDeals } from '../../../../lib/deal-promoter.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: req.headers as unknown as Headers });
    if (!session?.user) return res.status(401).json({ error: 'Login required to vote' });

    const dealId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    if (isNaN(dealId)) return res.status(400).json({ error: 'Invalid deal id' });

    const { value } = req.body; // +1 or -1
    if (value !== 1 && value !== -1) return res.status(400).json({ error: 'Vote must be +1 or -1' });

    const [deal] = await db.select().from(deals).where(eq(deals.id, dealId)).limit(1);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    // Check existing vote
    const [existing] = await db.select().from(votes)
      .where(and(eq(votes.dealId, dealId), eq(votes.userId, session.user.id)))
      .limit(1);

    if (existing) {
      if (existing.value === value) {
        // Remove vote (toggle off)
        await db.delete(votes).where(eq(votes.id, existing.id));
        const upAdj = value === 1 ? -1 : 0;
        const downAdj = value === -1 ? -1 : 0;
        await db.update(deals).set({
          upvotes: sql`${deals.upvotes} + ${upAdj}`,
          downvotes: sql`${deals.downvotes} + ${downAdj}`,
          score: sql`${deals.score} - ${value}`,
        }).where(eq(deals.id, dealId));
        const [updated] = await db.select().from(deals).where(eq(deals.id, dealId)).limit(1);
        return res.json({ deal: updated, userVote: 0 });
      } else {
        // Change vote
        await db.update(votes).set({ value }).where(eq(votes.id, existing.id));
        const upAdj = value === 1 ? 1 : -1;
        const downAdj = value === -1 ? 1 : -1;
        await db.update(deals).set({
          upvotes: sql`${deals.upvotes} + ${upAdj}`,
          downvotes: sql`${deals.downvotes} + ${downAdj}`,
          score: sql`${deals.score} + ${value * 2}`,
        }).where(eq(deals.id, dealId));
      }
    } else {
      // New vote
      await db.insert(votes).values({ dealId, userId: session.user.id, value });
      await db.update(deals).set({
        upvotes: value === 1 ? sql`${deals.upvotes} + 1` : sql`${deals.upvotes}`,
        downvotes: value === -1 ? sql`${deals.downvotes} + 1` : sql`${deals.downvotes}`,
        score: sql`${deals.score} + ${value}`,
      }).where(eq(deals.id, dealId));
    }

    // Run promotion check after every vote
    await promoteDeals();

    const [updated] = await db.select().from(deals).where(eq(deals.id, dealId)).limit(1);
    res.json({ deal: updated, userVote: value });
  } catch (err) {
    res.status(500).json({ error: 'Vote failed', message: String(err) });
  }
}
