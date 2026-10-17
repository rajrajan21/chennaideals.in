import type { Request, Response } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { deals } from '../../../db/schema.js';

/** Deal of the day: best Front Page deal; if none, best Popular; if none, the best New deal. */
export default async function handler(_req: Request, res: Response) {
  try {
    for (const status of ['frontpage', 'popular', 'new']) {
      const rows = await db.select().from(deals)
        .where(and(eq(deals.status, status), sql`(${deals.expiresAt} IS NULL OR ${deals.expiresAt} > NOW())`))
        .orderBy(sql`(${deals.imageUrl} IS NULL)`, desc(deals.score), desc(deals.savingsPercent), desc(deals.createdAt))
        .limit(1);
      if (rows[0]) return res.json({ deal: rows[0], from: status });
    }
    res.json({ deal: null, from: null });
  } catch (err) {
    res.status(500).json({ error: 'Failed to pick the deal of the day', message: String(err) });
  }
}
