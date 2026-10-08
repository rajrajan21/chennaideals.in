import {
  mysqlTable, int, varchar, text, boolean, timestamp, decimal, index
} from 'drizzle-orm/mysql-core';

// ── Auth tables (BetterAuth managed) ─────────────────────────────────────────
export const user = mysqlTable('user', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 255 }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  emailVerified: boolean('email_verified').default(false),
  image: text('image'),
  isAdmin: boolean('is_admin').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const session = mysqlTable('session', {
  id: varchar('id', { length: 36 }).primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: varchar('token', { length: 255 }).notNull().unique(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const account = mysqlTable('account', {
  id: varchar('id', { length: 36 }).primaryKey(),
  accountId: varchar('account_id', { length: 255 }).notNull(),
  providerId: varchar('provider_id', { length: 255 }).notNull(),
  userId: varchar('user_id', { length: 36 })
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: varchar('password', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

export const verification = mysqlTable('verification', {
  id: varchar('id', { length: 36 }).primaryKey(),
  identifier: varchar('identifier', { length: 255 }).notNull(),
  value: varchar('value', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
});

// ── Deals ─────────────────────────────────────────────────────────────────────
// status lifecycle: 'new' → 'popular' → 'frontpage' | 'expired' | 'rejected'
// Promotion thresholds (configurable):
//   new → popular  : score >= 50
//   popular → frontpage : score >= 150
export const deals = mysqlTable('deals', {
  id: int('id').primaryKey().autoincrement(),
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description'),
  url: text('url'),                                   // external deal link
  imageUrl: text('image_url'),
  originalPrice: decimal('original_price', { precision: 10, scale: 2 }),
  salePrice: decimal('sale_price', { precision: 10, scale: 2 }),
  savingsPercent: int('savings_percent'),
  retailer: varchar('retailer', { length: 100 }),
  category: varchar('category', { length: 100 }),
  area: varchar('area', { length: 100 }),             // Chennai locality
  // Lifecycle
  status: varchar('status', { length: 20 }).notNull().default('new'),
  // 'new' | 'popular' | 'frontpage' | 'expired' | 'rejected'
  score: int('score').notNull().default(0),           // upvotes - downvotes
  upvotes: int('upvotes').notNull().default(0),
  downvotes: int('downvotes').notNull().default(0),
  commentCount: int('comment_count').notNull().default(0),
  viewCount: int('view_count').notNull().default(0),
  // Promotion tracking
  promotedToPopularAt: timestamp('promoted_to_popular_at'),
  promotedToFrontpageAt: timestamp('promoted_to_frontpage_at'),
  // Authorship
  submittedBy: varchar('submitted_by', { length: 36 }).references(() => user.id, { onDelete: 'set null' }),
  submittedByName: varchar('submitted_by_name', { length: 255 }),
  // Expiry
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
}, (t) => [
  index('idx_deals_status').on(t.status),
  index('idx_deals_score').on(t.score),
  index('idx_deals_category').on(t.category),
  index('idx_deals_area').on(t.area),
  index('idx_deals_retailer').on(t.retailer),
  index('idx_deals_created').on(t.createdAt),
]);

// ── Votes ─────────────────────────────────────────────────────────────────────
export const votes = mysqlTable('votes', {
  id: int('id').primaryKey().autoincrement(),
  dealId: int('deal_id').notNull().references(() => deals.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => user.id, { onDelete: 'cascade' }),
  value: int('value').notNull(),   // +1 or -1
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  index('idx_votes_deal').on(t.dealId),
  index('idx_votes_user_deal').on(t.userId, t.dealId),
]);

// ── Comments ──────────────────────────────────────────────────────────────────
export const comments = mysqlTable('comments', {
  id: int('id').primaryKey().autoincrement(),
  dealId: int('deal_id').notNull().references(() => deals.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => user.id, { onDelete: 'cascade' }),
  userName: varchar('user_name', { length: 255 }),
  body: text('body').notNull(),
  parentId: int('parent_id'),   // for threaded replies (self-ref added via migration)
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
}, (t) => [
  index('idx_comments_deal').on(t.dealId),
  index('idx_comments_parent').on(t.parentId),
]);

// ── Saved deals ───────────────────────────────────────────────────────────────
export const savedDeals = mysqlTable('saved_deals', {
  id: int('id').primaryKey().autoincrement(),
  dealId: int('deal_id').notNull().references(() => deals.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => user.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow(),
}, (t) => [
  index('idx_saved_user').on(t.userId),
  index('idx_saved_user_deal').on(t.userId, t.dealId),
]);
