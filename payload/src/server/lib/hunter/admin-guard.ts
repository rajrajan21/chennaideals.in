import type { Request, Response } from 'express';
import { getAuth } from '../../../lib/auth/auth.js';

export type AdminUser = { id: string; name?: string | null; email?: string | null };

/** Returns the signed-in admin, or sends a 401/403 and returns null. */
export async function requireAdmin(req: Request, res: Response): Promise<AdminUser | null> {
  const session = await getAuth().api.getSession({ headers: req.headers as unknown as Headers });
  const user = session?.user as (AdminUser & { isAdmin?: boolean }) | undefined;
  if (!user) { res.status(401).json({ error: 'Please sign in first.' }); return null; }
  if (!user.isAdmin) { res.status(403).json({ error: 'Only the site admin can use the Deal Hunter.' }); return null; }
  return user;
}
