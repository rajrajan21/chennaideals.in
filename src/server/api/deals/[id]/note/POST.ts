import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { deals } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: req.headers as unknown as Headers });
    if (!session?.user) return res.status(401).json({ error: 'Login required' });
    if (!(session.user as { isAdmin?: boolean }).isAdmin) {
      return res.status(403).json({ error: 'Only editors can change notes' });
    }

    const dealId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    if (isNaN(dealId)) return res.status(400).json({ error: 'Invalid deal id' });

    const { note } = req.body;
    if (note !== undefined && typeof note !== 'string') {
      return res.status(400).json({ error: 'Note must be text' });
    }
    const clean = (note ?? '').trim();
    if (clean.length > 5000) return res.status(400).json({ error: 'Note is too long (max 5000 characters)' });

    const [deal] = await db.select().from(deals).where(eq(deals.id, dealId)).limit(1);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    await db.update(deals).set({ editorNote: clean || null }).where(eq(deals.id, dealId));

    const [updated] = await db.select().from(deals).where(eq(deals.id, dealId)).limit(1);
    res.json({ deal: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save note', message: String(err) });
  }
}