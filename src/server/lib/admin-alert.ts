/** Tells the site owner about a rejected deal (email) and keeps a local log as a backup. */
import fs from 'node:fs';
import path from 'node:path';
import { getSecret } from '#airo/secrets';
import { sendResendEmail } from '@/lib/email/resend';

export const ADMIN_EMAIL_DEFAULT = 'Chennaideals.in@gmail.com';

export type RejectedDeal = {
  kind: 'deal' | 'picture';
  title: string;
  url?: string | null;
  retailer?: string | null;
  description?: string | null;
  reasons: string[];
  checks: string[];
  user: { id: string; email?: string | null; name?: string | null };
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

export async function alertAdminRejected(d: RejectedDeal): Promise<void> {
  const to = String(getSecret('ADMIN_ALERT_EMAIL') || ADMIN_EMAIL_DEFAULT);
  const when = new Date().toISOString();

  // 1. local log first (never lost, even if email is not set up yet)
  try {
    const dir = path.resolve(process.cwd(), 'review-log');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'rejected-deals.jsonl'), JSON.stringify({ when, ...d, description: d.description?.slice(0, 500) }) + '\n');
  } catch { /* logging must never break a submission */ }

  // 2. email
  const lines = [
    `A ${d.kind === 'picture' ? 'picture in a submitted deal' : 'submitted deal'} was REJECTED by the automatic review and was not posted.`,
    '',
    `Title: ${d.title}`,
    `Link: ${d.url || '(none)'}`,
    `Shop: ${d.retailer || '(none)'}`,
    `Submitted by: ${d.user.name || ''} <${d.user.email || 'no email'}> (id ${d.user.id})`,
    `Time (UTC): ${when}`,
    '',
    'Why it was rejected:',
    ...d.reasons.map((r) => `- ${r}`),
    '',
    'What was checked:',
    ...d.checks.map((c) => `- ${c}`),
    '',
    d.description ? `Description (first 500 characters):\n${d.description.slice(0, 500)}` : '',
  ];
  const text = lines.join('\n');
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.5;max-width:640px"><h2 style="color:#b91c1c">Deal rejected by automatic review</h2><p><b>Title:</b> ${esc(d.title)}<br><b>Link:</b> ${esc(d.url || '(none)')}<br><b>Shop:</b> ${esc(d.retailer || '(none)')}<br><b>Submitted by:</b> ${esc(d.user.name || '')} &lt;${esc(d.user.email || 'no email')}&gt;<br><b>Time (UTC):</b> ${esc(when)}</p><h3>Why</h3><ul>${d.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul><h3>What was checked</h3><ul>${d.checks.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>`;
  try {
    await sendResendEmail({ to, subject: `[ChennaiDeals] Deal rejected: ${d.title.slice(0, 80)}`, text, html });
  } catch (err) {
    console.error('Could not email the admin about a rejected deal (see review-log/rejected-deals.jsonl)', { message: err instanceof Error ? err.message : String(err) });
  }
}
