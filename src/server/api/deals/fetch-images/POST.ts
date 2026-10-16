import type { Request, Response } from 'express';
import { getAuth } from '../../../../lib/auth/auth.js';
import { findPageImages, allowLookup } from '../../../lib/page-images.js';

// POST /api/deals/fetch-images  { url }  ->  { images: string[], note?: string }
export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: req.headers as unknown as Headers });
    if (!session?.user) return res.status(401).json({ error: 'Login required' });

    const url = typeof req.body?.url === 'string' ? req.body.url.trim() : '';
    if (!url || url.length > 2000) return res.status(400).json({ error: 'Enter the deal link first' });

    if (!allowLookup(session.user.id)) {
      return res.status(429).json({ error: 'Please wait a minute before looking up more links' });
    }

    const result = await findPageImages(url);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Could not look up pictures', message: String(err) });
  }
}
