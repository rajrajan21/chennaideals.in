/** Emails the site admin when a deal is rejected (or accepted with a warning) by the automatic review. */
import { getSecret } from '#airo/secrets';
import { sendResendEmail } from '@/lib/email/resend';

export const ADMIN_EMAIL_DEFAULT = 'Chennaideals.in@gmail.com';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

export type AlertInfo = {
  kind: 'rejected' | 'caution';
  stage: 'link and text check' | 'picture check';
  submitter: { id: string; name?: string | null; email?: string | null };
  deal: { title: string; url?: string | null; retailer?: string | null; salePrice?: string | number | null; originalPrice?: string | number | null; description?: string | null; id?: number | null };
  reasons: string[];
  signals?: string[];
  note?: string;
};

export async function sendReviewAlert(a: AlertInfo): Promise<void> {
  try {
    const to = getSecret('ADMIN_ALERT_EMAIL') || ADMIN_EMAIL_DEFAULT;
    const head = a.kind === 'rejected' ? 'Deal REJECTED by the automatic review' : 'Deal posted WITH A WARNING by the automatic review';
    const rows: [string, string][] = [
      ['Result', head],
      ['Check', a.stage],
      ['Deal title', a.deal.title],
      ['Link', a.deal.url || '(none)'],
      ['Shop', a.deal.retailer || '-'],
      ['Price', `${a.deal.salePrice ?? '-'} (original ${a.deal.originalPrice ?? '-'})`],
      ['Submitted by', `${a.submitter.name || '-'} <${a.submitter.email || '-'}> id ${a.submitter.id}`],
      ['Time', new Date().toISOString()],
    ];
    if (a.deal.id) rows.push(['Deal id', String(a.deal.id)]);
    const text = [
      rows.map(([k, v]) => `${k}: ${v}`).join('\n'),
      '',
      a.kind === 'rejected' ? 'Why it was rejected:' : 'Warnings shown to shoppers:',
      ...a.reasons.map((r) => `- ${r}`),
      ...(a.signals && a.signals.length ? ['', 'Everything the check noticed:', ...a.signals.map((s) => `- ${s}`)] : []),
      ...(a.note ? ['', a.note] : []),
      '',
      a.kind === 'rejected'
        ? 'The deal was NOT posted. If it was a mistake, post it yourself from an admin account.'
        : 'The deal is live with a caution note in its Editor\'s Note. You can edit or remove it on the deal page.',
    ].join('\n');
    const html = `<div style="font-family:Arial,sans-serif;line-height:1.5;max-width:640px"><h2 style="color:${a.kind === 'rejected' ? '#b91c1c' : '#b45309'}">${esc(head)}</h2><table cellpadding="4" style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="color:#555;vertical-align:top">${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join('')}</table><h3>${a.kind === 'rejected' ? 'Why it was rejected' : 'Warnings shown to shoppers'}</h3><ul>${a.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>${a.signals && a.signals.length ? `<h4>Everything the check noticed</h4><ul>${a.signals.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}${a.note ? `<p>${esc(a.note)}</p>` : ''}</div>`;
    await sendResendEmail({ to, subject: `[ChennaiDeals] ${a.kind === 'rejected' ? 'Deal rejected' : 'Deal flagged'}: ${a.deal.title.slice(0, 80)}`, text, html });
  } catch (err) {
    // An email problem must never block or crash the submission.
    console.error('Admin alert email could not be sent', { message: err instanceof Error ? err.message : String(err) });
  }
}
