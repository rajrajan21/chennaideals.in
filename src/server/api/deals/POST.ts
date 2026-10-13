import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { deals } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: req.headers as unknown as Headers });
    if (!session?.user) return res.status(401).json({ error: 'Login required to submit a deal' });

    const {
      title, description, url, imageUrl,
      originalPrice, salePrice,
      retailer, category, area, expiresAt,
    } = req.body;

    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
    if (!retailer?.trim()) return res.status(400).json({ error: 'Retailer is required' });
    if (!category?.trim()) return res.status(400).json({ error: 'Category is required' });

    const orig = parseFloat(originalPrice) || null;
    const sale = parseFloat(salePrice) || null;
    const savings = orig && sale ? Math.round(((orig - sale) / orig) * 100) : null;

    const result = await db.insert(deals).values({
      title: title.trim(),
      description: description?.trim() || null,
      url: url?.trim() || null,
      imageUrl: imageUrl?.trim() || null,
      originalPrice: orig ? String(orig) : null,
      salePrice: sale ? String(sale) : null,
      savingsPercent: savings,
      retailer: retailer.trim(),
      category: category.trim(),
      area: area?.trim() || 'Chennai',
      status: 'new',
      score: 0,
      upvotes: 0,
      downvotes: 0,
      submittedBy: session.user.id,
      submittedByName: session.user.name || session.user.email,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });

    const insertId = Number(result[0].insertId);
    const [newDeal] = await db.select().from(deals).where(eq(deals.id, insertId)).limit(1);

    res.status(201).json(newDeal);
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit deal', message: String(err) });
  }
}
