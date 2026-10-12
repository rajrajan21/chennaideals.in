import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { savedDeals } from '../../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: req.headers as unknown as Headers });
    if (!session?.user) return res.status(401).json({ error: 'Login required' });
    const dealId = Number(req.body?.dealId);
    const action = req.body?.action;
    if (!Number.isSafeInteger(dealId) || dealId <= 0 || !['save', 'remove'].includes(action)) {
      return res.status(400).json({ error: 'Valid dealId and action are required' });
    }
    const existing = await db.select({ id: savedDeals.id }).from(savedDeals)
      .where(and(eq(savedDeals.userId, session.user.id), eq(savedDeals.dealId, dealId))).limit(1);
    if (action === 'remove') {
      if (existing.length) await db.delete(savedDeals).where(eq(savedDeals.id, existing[0].id));
      return res.json({ saved: false });
    }
    if (!existing.length) await db.insert(savedDeals).values({ userId: session.user.id, dealId });
    res.json({ saved: true });
  } catch {
    res.status(500).json({ error: 'Could not update saved deal' });
  }
}
