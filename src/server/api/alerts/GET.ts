import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { dealAlertPreferences } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: req.headers as unknown as Headers });
    if (!session?.user) return res.status(401).json({ error: 'Login required' });
    const [prefs] = await db.select().from(dealAlertPreferences)
      .where(eq(dealAlertPreferences.userId, session.user.id)).limit(1);
    res.json({
      preferences: prefs ? {
        keywords: parseList(prefs.keywords),
        categories: parseList(prefs.categories),
        emailEnabled: prefs.emailEnabled,
        smsEnabled: prefs.smsEnabled,
        phoneNumber: prefs.phoneNumber || '',
      } : { keywords: [], categories: [], emailEnabled: true, smsEnabled: false, phoneNumber: '' },
      email: session.user.email,
    });
  } catch {
    res.status(500).json({ error: 'Could not load alert preferences' });
  }
}
function parseList(value: string | null): string[] {
  if (!value) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []; }
  catch { return []; }
}
