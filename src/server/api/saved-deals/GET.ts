import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { savedDeals } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: req.headers as unknown as Headers });
    if (!session?.user) return res.status(401).json({ error: 'Login required' });
    const rows = await db.select({ dealId: savedDeals.dealId })
      .from(savedDeals).where(eq(savedDeals.userId, session.user.id));
    res.json({ savedDealIds: rows.map(row => row.dealId) });
  } catch {
    res.status(500).json({ error: 'Could not load saved deals' });
  }
}
