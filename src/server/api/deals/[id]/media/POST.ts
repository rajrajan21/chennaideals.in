import type { Request, Response } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { db } from '../../../../db/client.js';
import { deals, dealMedia } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import {
  UPLOAD_DIR, MAX_IMAGES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES,
  IMAGE_TYPES, VIDEO_TYPES, VIDEO_ADMIN_ONLY, publishFile,
} from '../../../../lib/uploads.js';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = IMAGE_TYPES[file.mimetype] ?? VIDEO_TYPES[file.mimetype] ?? '';
    cb(null, crypto.randomBytes(16).toString('hex') + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_VIDEO_BYTES, files: MAX_IMAGES + 1 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.fieldname === 'images' ? file.mimetype in IMAGE_TYPES
      : file.fieldname === 'video' ? file.mimetype in VIDEO_TYPES
      : false;
    cb(null, ok);
  },
}).fields([
  { name: 'images', maxCount: MAX_IMAGES },
  { name: 'video', maxCount: 1 },
]);

export default async function handler(req: Request, res: Response) {
  let received: Express.Multer.File[] = [];
  const cleanup = () => {
    for (const f of received) { try { fs.unlinkSync(f.path); } catch { /* already gone */ } }
  };

  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: req.headers as unknown as Headers });
    if (!session?.user) return res.status(401).json({ error: 'Login required' });

    const dealId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    if (isNaN(dealId)) return res.status(400).json({ error: 'Invalid deal id' });

    const [deal] = await db.select().from(deals).where(eq(deals.id, dealId)).limit(1);
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    const isAdmin = Boolean((session.user as { isAdmin?: boolean }).isAdmin);

    // Pictures: the deal's submitter or an admin. To let ANY signed-in user add
    // pictures to ANY deal, delete the next three lines.
    if (deal.submittedBy !== session.user.id && !isAdmin) {
      return res.status(403).json({ error: 'Only the submitter or an editor can add media' });
    }

    await new Promise<void>((resolve, reject) => {
      upload(req, res, (err: unknown) => (err ? reject(err) : resolve()));
    });

    const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
    const images = files.images ?? [];
    const video = files.video?.[0];
    received = [...images, ...(video ? [video] : [])];

    // Load existing media before handling a request that only changes the main photo.
    const existing = await db.select().from(dealMedia).where(eq(dealMedia.dealId, dealId));
    const requestedPrimaryUrl = typeof req.body?.primaryImageUrl === 'string' ? req.body.primaryImageUrl : '';
    if (received.length === 0 && requestedPrimaryUrl) {
      const validPrimary = existing.find((m) => m.type === 'image' && m.url === requestedPrimaryUrl);
      if (!validPrimary) return res.status(400).json({ error: 'Choose a photo already uploaded to this deal.' });
      await db.update(deals).set({ imageUrl: validPrimary.url }).where(eq(deals.id, dealId));
      const media = await db.select().from(dealMedia).where(eq(dealMedia.dealId, dealId)).orderBy(dealMedia.sortOrder);
      return res.status(200).json({ media });
    }
    if (received.length === 0) {
      return res.status(400).json({ error: 'No valid files. Use JPG, PNG or WebP images and an MP4 or WebM video.' });
    }
    if (video && VIDEO_ADMIN_ONLY && !isAdmin) {
      cleanup();
      return res.status(403).json({ error: 'Video upload is limited to editors for now' });
    }
    if (images.some((f) => f.size > MAX_IMAGE_BYTES)) {
      cleanup();
      return res.status(400).json({ error: 'Each image must be 5 MB or smaller' });
    }

    const existingImages = existing.filter((m) => m.type === 'image').length;
    const hasVideo = existing.some((m) => m.type === 'video');

    if (existingImages + images.length > MAX_IMAGES) {
      cleanup();
      return res.status(400).json({ error: `A deal can have at most ${MAX_IMAGES} images` });
    }
    if (video && hasVideo) {
      cleanup();
      return res.status(400).json({ error: 'This deal already has a video' });
    }

    const imageUrls = await Promise.all(images.map((f) => publishFile(f)));
    const videoUrl = video ? await publishFile(video) : null;

    const rows = [
      ...imageUrls.map((url, i) => ({
        dealId, type: 'image', url, sortOrder: existingImages + i,
      })),
      ...(videoUrl ? [{ dealId, type: 'video', url: videoUrl, sortOrder: 0 }] : []),
    ];
    await db.insert(dealMedia).values(rows);

    const requestedIndex = Number.parseInt(String(req.body?.primaryImageIndex ?? '0'), 10);
    const chosenIndex = Number.isFinite(requestedIndex) && requestedIndex >= 0 && requestedIndex < imageUrls.length ? requestedIndex : 0;
    if (imageUrls.length > 0 && (!deal.imageUrl || req.body?.primaryImageIndex !== undefined)) {
      await db.update(deals).set({ imageUrl: imageUrls[chosenIndex] }).where(eq(deals.id, dealId));
    }

    const media = await db.select().from(dealMedia)
      .where(eq(dealMedia.dealId, dealId)).orderBy(dealMedia.sortOrder);
    res.status(201).json({ media });
  } catch (err) {
    cleanup();
    if (err instanceof multer.MulterError) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return res.status(tooBig ? 413 : 400).json({
        error: tooBig ? 'File is too large (images 5 MB, video 50 MB)' : err.message,
      });
    }
    res.status(500).json({ error: 'Upload failed', message: String(err) });
  }
}