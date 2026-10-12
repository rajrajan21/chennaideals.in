import { db } from '../db/client.js';
import { dealAlertPreferences, user } from '../db/schema.js';
import { getSecret } from '#airo/secrets';

type NewDeal = {
  id: number;
  title: string;
  description?: string | null;
  url?: string | null;
  retailer?: string | null;
  category?: string | null;
  salePrice?: string | null;
  savingsPercent?: number | null;
};

function secret(name: string): string {
  const value = getSecret(name);
  return typeof value === 'string' ? value.trim() : '';
}

function parseList(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch { return []; }
}

export async function notifyDealAlertSubscribers(deal: NewDeal): Promise<void> {
  const [preferences] = await db.select({
    userId: dealAlertPreferences.userId,
    keywords: dealAlertPreferences.keywords,
    categories: dealAlertPreferences.categories,
    emailEnabled: dealAlertPreferences.emailEnabled,
    smsEnabled: dealAlertPreferences.smsEnabled,
    phoneNumber: dealAlertPreferences.phoneNumber,
    email: user.email,
  }).from(dealAlertPreferences)
    .innerJoin(user, (await import('drizzle-orm')).eq(dealAlertPreferences.userId, user.id));

  const searchable = [deal.title, deal.description || '', deal.retailer || ''].join(' ').toLowerCase();
  const url = `${(secret('PUBLIC_SITE_URL') || 'https://chennaideals.in').replace(/\/$/, '')}/deals/${deal.id}`;
  const emailKey = secret('RESEND_API_KEY');
  const fromEmail = secret('ALERT_FROM_EMAIL');
  const twilioSid = secret('TWILIO_ACCOUNT_SID');
  const twilioToken = secret('TWILIO_AUTH_TOKEN');
  const twilioFrom = secret('TWILIO_FROM_NUMBER');
  const text = `New ChennaiDeals match: ${deal.title}. ${deal.salePrice ? `Price: ₹${deal.salePrice}. ` : ''}${url}`;

  await Promise.allSettled(preferences.filter((pref) => {
    const keywords = parseList(pref.keywords).map((keyword) => keyword.toLowerCase());
    const categories = parseList(pref.categories).map((category) => category.toLowerCase());
    return (keywords.some((keyword) => searchable.includes(keyword)) ||
      (!!deal.category && categories.includes(deal.category.toLowerCase())));
  }).map(async (pref) => {
    const tasks: Promise<unknown>[] = [];
    if (pref.emailEnabled && pref.email && emailKey && fromEmail) {
      tasks.push(fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${emailKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fromEmail,
          to: [pref.email],
          subject: `ChennaiDeals alert: ${deal.title}`,
          text,
          html: `<p>A deal matches your ChennaiDeals alert preferences.</p><h2>${escapeHtml(deal.title)}</h2><p>${escapeHtml(deal.description || '')}</p><p><a href="${url}">View deal</a></p>`,
        }),
      }).then((response) => { if (!response.ok) throw new Error(`Email provider returned ${response.status}`); }));
    }
    if (pref.smsEnabled && pref.phoneNumber && twilioSid && twilioToken && twilioFrom) {
      const body = new URLSearchParams({ To: pref.phoneNumber, From: twilioFrom, Body: text.slice(0, 1500) });
      tasks.push(fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilioSid)}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      }).then((response) => { if (!response.ok) throw new Error(`SMS provider returned ${response.status}`); }));
    }
    await Promise.all(tasks);
  }));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char);
}
