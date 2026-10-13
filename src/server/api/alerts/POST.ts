import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { dealAlertPreferences } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';

function cleanList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === 'string')
    .map(v => v.trim()).filter(Boolean).map(v => v.slice(0, 80)))].slice(0, max);
}

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const session = await auth.api.getSession({ headers: req.headers as unknown as Headers });
    if (!session?.user) return res.status(401).json({ error: 'Login required' });

    const keywords = cleanList(req.body?.keywords, 20);
    const categories = cleanList(req.body?.categories, 30);
    const emailEnabled = req.body?.emailEnabled !== false;
    const smsEnabled = req.body?.smsEnabled === true;
    const phoneNumber = typeof req.body?.phoneNumber === 'string' ? req.body.phoneNumber.trim().slice(0, 32) : '';

    if (smsEnabled && !/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
      return res.status(400).json({ error: 'Enter a valid phone number in international format, such as +14155550123.' });
    }
    if (keywords.length === 0 && categories.length === 0) {
      return res.status(400).json({ error: 'Add at least one keyword or select a category.' });
    }

    const values = {
      userId: session.user.id,
      keywords: JSON.stringify(keywords),
      categories: JSON.stringify(categories),
      emailEnabled,
      smsEnabled,
      phoneNumber: smsEnabled ? phoneNumber : null,
    };
    const [existing] = await db.select({ id: dealAlertPreferences.id }).from(dealAlertPreferences)
      .where(eq(dealAlertPreferences.userId, session.user.id)).limit(1);
    if (existing) {
      await db.update(dealAlertPreferences).set(values).where(eq(dealAlertPreferences.id, existing.id));
    } else {
      await db.insert(dealAlertPreferences).values(values);
    }
    res.json({ ok: true, preferences: { keywords, categories, emailEnabled, smsEnabled, phoneNumber: smsEnabled ? phoneNumber : '' } });
  } catch {
    res.status(500).json({ error: 'Could not save alert preferences' });
  }
}
