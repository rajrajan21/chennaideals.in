import type { Request, Response } from 'express';
import crypto from 'node:crypto';
import { getAuth } from '../../../../lib/auth/auth.js';
import { getLookup } from '../../../lib/lookup-store.js';
import { bestVersion } from '../../../lib/image-collector.js';
import { putTmpImage } from '../../../lib/tmp-images.js';

// POST /api/deals/fetch-image  { lookupId, index }
// Downloads ONE picture found by "Get details from link" in full size and keeps it for the user.
const recent = new Map<string, number[]>();
function allow(userId: string): boolean {
  const now = Date.now();
  const list = (recent.get(userId) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= 40) { recent.set(userId, list); return false; }
  list.push(now);
  recent.set(userId, list);
  return true;
}

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: req.headers as unknown as Headers });
    if (!session?.user) return res.status(401).json({ error: 'Login required' });
    const userId = session.user.id;

    if (!allow(userId)) return res.status(429).json({ error: 'Too many picture requests. Please wait a minute.' });

    const lookup = getLookup(req.body?.lookupId, userId);
    if (!lookup) return res.status(410).json({ error: 'This lookup expired. Press "Get details from link" again.' });
    const index = Number(req.body?.index);
    if (!Number.isInteger(index) || index < 0 || index >= lookup.candidates.length) {
      return res.status(400).json({ error: 'Invalid picture number' });
    }

    const got = await bestVersion(lookup.candidates[index], lookup.pageUrl);
    if (!got) return res.json({ image: null });

    const hash = crypto.createHash('sha1').update(got.buf).digest('hex');
    if (lookup.hashes.has(hash)) return res.json({ image: null, duplicate: true }); // same picture, other address
    lookup.hashes.add(hash);

    // The user may have started a newer lookup while this one downloaded: then drop the result.
    if (getLookup(req.body?.lookupId, userId) !== lookup) return res.status(410).json({ error: 'This lookup expired.' });

    const saved = await putTmpImage(userId, got.buf, got.kind, got.dims);
    res.json({
      image: { token: saved.token, url: `/api/tmp-images/${saved.token}`, width: saved.width, height: saved.height, bytes: saved.size, index },
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not download that picture', message: String(err) });
  }
}
