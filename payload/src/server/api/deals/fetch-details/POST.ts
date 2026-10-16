import type { Request, Response } from 'express';
import { getAuth } from '../../../../lib/auth/auth.js';
import { allowLookup } from '../../../lib/page-images.js';
import { buildDealDetails } from '../../../lib/deal-details.js';

// POST /api/deals/fetch-details  { url }  ->  { draft, images, notes, usedAI, aiConfigured }
export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: req.headers as unknown as Headers });
    if (!session?.user) return res.status(401).json({ error: 'Login required' });

    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    if (!url || url.length > 2000) return res.status(400).json({ error: 'Enter the deal link first' });
    if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'The link must start with http:// or https://' });
    if (!allowLookup(session.user.id, 8)) return res.status(429).json({ error: 'Please wait a minute before looking up more links' });

    res.json(await buildDealDetails(url, session.user.id));
  } catch (err) {
    res.status(500).json({ error: 'Could not read that link', message: String(err) });
  }
}
