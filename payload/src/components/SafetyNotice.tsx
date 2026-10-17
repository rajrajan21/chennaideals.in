import { useEffect, useState } from 'react';
import { HeartHandshake, X } from 'lucide-react';
import { CONTACT_EMAIL } from '@/lib/site-config';

const KEY = 'cd-safety-notice-closed';

/** Short, friendly site-wide reminder. Can be closed for the current visit. */
export default function SafetyNotice() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try { setOpen(window.sessionStorage.getItem(KEY) !== '1'); } catch { setOpen(true); }
  }, []);
  if (!open) return null;
  return (
    <div className="border-b border-border bg-muted text-foreground" role="note">
      <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-2.5 text-xs leading-relaxed sm:text-sm">
        <HeartHandshake size={20} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
        <div className="flex-1">
          <p><strong>ChennaiDeals is community-supported</strong> &mdash; real people share deals and we check every post automatically.</p>
          <p>Please confirm the seller, final price and return policy before paying, and never share OTPs or card details; every purchase is your own responsibility.</p>
          <p>Spotted something suspicious? Write to <a className="font-semibold underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> &mdash; thank you for keeping us safe!</p>
        </div>
        <button type="button" aria-label="Close this notice"
          onClick={() => { setOpen(false); try { window.sessionStorage.setItem(KEY, '1'); } catch { /* ignore */ } }}
          className="rounded p-1 hover:bg-black/5">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
