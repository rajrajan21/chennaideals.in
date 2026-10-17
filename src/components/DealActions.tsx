import { MessageCircle, Flag } from 'lucide-react';
import { CONTACT_EMAIL } from '@/lib/site-config';

/** WhatsApp share + "report this deal" (opens the visitor's mail app, addressed to the site contact). */
export default function DealActions({ title }: { title: string }) {
  const url = typeof window !== 'undefined' ? window.location.href : '';
  const wa = `https://wa.me/?text=${encodeURIComponent(`${title} - ${url}`)}`;
  const subject = encodeURIComponent(`Report deal: ${title}`);
  const body = encodeURIComponent(`Deal page: ${url}\n\nWhat is wrong with this deal (expired, wrong price, scam, bad content)?\n`);
  const cls = 'inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold hover:bg-muted transition-colors';
  return (
    <>
      <a href={wa} target="_blank" rel="noopener noreferrer" className={cls}><MessageCircle size={16} /> WhatsApp</a>
      <a href={`mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`} className={cls}><Flag size={16} /> Report</a>
    </>
  );
}
