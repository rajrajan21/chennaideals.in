import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { deals } from '../../db/schema.js';
import { eq, desc, asc, and, like, sql, inArray } from 'drizzle-orm';

// Promotion thresholds
const POPULAR_THRESHOLD = 50;
const FRONTPAGE_THRESHOLD = 150;

export async function promoteDeals() {
  await db.update(deals)
    .set({ status: 'popular', promotedToPopularAt: new Date() })
    .where(and(eq(deals.status, 'new'), sql`${deals.score} >= ${POPULAR_THRESHOLD}`));
  await db.update(deals)
    .set({ status: 'frontpage', promotedToFrontpageAt: new Date() })
    .where(and(eq(deals.status, 'popular'), sql`${deals.score} >= ${FRONTPAGE_THRESHOLD}`));
}

export default async function handler(req: Request, res: Response) {
  try {
    const {
      status = 'frontpage',
      category,
      retailer,
      area,
      sort = 'score',
      q,
      page = '1',
      limit = '20',
    } = req.query as Record<string, string>;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];

    if (status === 'all') {
      conditions.push(inArray(deals.status, ['new', 'popular', 'frontpage']));
    } else {
      conditions.push(eq(deals.status, status));
    }

    if (category && category !== 'All') conditions.push(eq(deals.category, category));
    if (retailer && retailer !== 'All') conditions.push(eq(deals.retailer, retailer));
    if (area && area !== 'All') conditions.push(eq(deals.area, area));
    if (q) conditions.push(like(deals.title, `%${q}%`));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const orderBy = sort === 'newest'
      ? [desc(deals.createdAt)]
      : sort === 'price_asc'
      ? [asc(deals.salePrice)]
      : sort === 'savings'
      ? [desc(deals.savingsPercent)]
      : [desc(deals.score), desc(deals.createdAt)];

    const rows = await db.select().from(deals)
      .where(where)
      .orderBy(...orderBy)
      .limit(limitNum)
      .offset(offset);

    // Count per status for tabs
    const counts = await db.select({
      status: deals.status,
      count: sql<number>`count(*)`,
    }).from(deals)
      .where(inArray(deals.status, ['new', 'popular', 'frontpage']))
      .groupBy(deals.status);

    const tabCounts = { new: 0, popular: 0, frontpage: 0 };
    for (const c of counts) {
      if (c.status in tabCounts) tabCounts[c.status as keyof typeof tabCounts] = Number(c.count);
    }

    res.json({ deals: rows, tabCounts, page: pageNum, limit: limitNum });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch deals', message: String(err) });
  }
}
