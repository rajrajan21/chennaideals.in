/**
 * Remembers, for a short time, which pictures were found on the page a user just looked up.
 * The browser then asks for the pictures one at a time (so text fills in first and pictures
 * appear as they arrive). Each lookup belongs to one user and a new lookup replaces the old one.
 */
import crypto from 'node:crypto';

const TTL_MS = 30 * 60 * 1000;
const ID_RE = /^[a-f0-9]{32}$/;

export type Lookup = { userId: string; pageUrl: string; candidates: string[]; hashes: Set<string>; createdAt: number };
const lookups = new Map<string, Lookup>();

export function createLookup(userId: string, pageUrl: string, candidates: string[]): string {
  for (const [id, l] of lookups) if (l.userId === userId || Date.now() - l.createdAt > TTL_MS) lookups.delete(id);
  const id = crypto.randomBytes(16).toString('hex');
  lookups.set(id, { userId, pageUrl, candidates, hashes: new Set(), createdAt: Date.now() });
  return id;
}

export function getLookup(id: unknown, userId: string): Lookup | null {
  if (typeof id !== 'string' || !ID_RE.test(id)) return null;
  const l = lookups.get(id);
  if (!l || l.userId !== userId) return null;
  if (Date.now() - l.createdAt > TTL_MS) { lookups.delete(id); return null; }
  return l;
}
