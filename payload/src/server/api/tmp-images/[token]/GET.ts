import fs from 'node:fs';
import type { Request, Response } from 'express';
import { getAuth } from '../../../../lib/auth/auth.js';
import { getTmpImage } from '../../../lib/tmp-images.js';

// GET /api/tmp-images/:token - preview of a picture copied from a deal link (owner only)
export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: req.headers as unknown as Headers });
    if (!session?.user) return res.status(401).end();
    const token = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
    const meta = getTmpImage(token, session.user.id);
    if (!meta) return res.status(404).end();
    res.setHeader('Content-Type', meta.mime);
    res.setHeader('Content-Length', String(meta.size));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    fs.createReadStream(meta.file).on('error', () => res.destroy()).pipe(res);
  } catch {
    res.status(500).end();
  }
}
