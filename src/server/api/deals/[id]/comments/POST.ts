import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { deals, comments } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: req.headers as unknown as Headers });
    if (!session?.user) return res.status(401).json({ error: 'Login required to comment' });

    const dealId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    if (isNaN(dealId)) return res.status(400).json({ error: 'Invalid deal id' });

    const { body, parentId } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: 'Comment body is required' });

    const [deal] = await db.select().from(deals).where(eq(deals.id, dealId)).limit(1);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    const result = await db.insert(comments).values({
      dealId,
      userId: session.user.id,
      userName: session.user.name || session.user.email,
      body: body.trim(),
      parentId: parentId ? parseInt(parentId) : null,
    });

    await db.update(deals).set({ commentCount: sql`${deals.commentCount} + 1` }).where(eq(deals.id, dealId));

    const insertId = Number(result[0].insertId);
    const [comment] = await db.select().from(comments).where(eq(comments.id, insertId)).limit(1);

    res.status(201).json(comment);
  } catch (err) {
    res.status(500).json({ error: 'Comment failed', message: String(err) });
  }
}
