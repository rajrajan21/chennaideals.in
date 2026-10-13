import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR } from '../../../lib/uploads.js';

export default function handler(req: Request, res: Response) {
  const raw = req.params.name;
  const name = (Array.isArray(raw) ? raw[0] : raw) ?? '';
  if (!/^[a-f0-9]{32}\.(jpg|png|webp|mp4|webm)$/.test(name)
      || !fs.existsSync(path.join(UPLOAD_DIR, name))) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(name, {
    root: UPLOAD_DIR,
    maxAge: '1y',
    immutable: true,
    headers: { 'X-Content-Type-Options': 'nosniff' },
  });
}