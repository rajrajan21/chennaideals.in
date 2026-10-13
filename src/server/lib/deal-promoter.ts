import { db } from '../db/client.js';
import { deals } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';

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
