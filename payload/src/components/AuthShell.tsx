import type { ReactNode } from 'react';
import { BadgePercent, MessageSquare, ShieldCheck } from 'lucide-react';

const POINTS = [
  { icon: BadgePercent, text: 'Real offers from Chennai shops and online stores' },
  { icon: MessageSquare, text: 'Vote, comment and share what actually worked' },
  { icon: ShieldCheck, text: 'Community-supported and checked automatically' },
];

function Logo({ className }: { className: string }) {
  return (
    <span className="inline-flex overflow-hidden rounded-lg bg-background shadow-sm ring-1 ring-black/5">
      <img src="/logo.jpg" alt="ChennaiDeals.in" className={`${className} w-auto mix-blend-multiply`} />
    </span>
  );
}

/** Shared look for the sign in, sign up and password pages. Uses the website's own colours. */
export default function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="bg-background px-4 py-6 sm:py-10">
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-card shadow-xl lg:grid-cols-5">
        <aside
          className="relative hidden flex-col justify-between p-8 text-primary-foreground lg:col-span-2 lg:flex"
          style={{ background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.82) 100%)' }}
        >
          <div>
            <a href="/" aria-label="ChennaiDeals.in home"><Logo className="h-12" /></a>
            <h2 className="mt-8 text-2xl font-bold leading-snug" style={{ fontFamily: 'var(--font-heading)' }}>Chennai's community for the best deals</h2>
            <p className="mt-2 text-sm text-white/90">Join to post deals, vote and save money together.</p>
          </div>
          <ul className="mt-8 space-y-4 text-sm">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/25"><Icon size={15} /></span>
                <span className="text-white/95">{text}</span>
              </li>
            ))}
          </ul>
        </aside>
        <main className="p-6 sm:p-10 lg:col-span-3">
          <a href="/" className="mb-4 inline-block lg:hidden" aria-label="ChennaiDeals.in home"><Logo className="h-10" /></a>
          <h1 className="text-2xl font-bold tracking-tight text-foreground" style={{ fontFamily: 'var(--font-heading)' }}>{title}</h1>
          {subtitle && <p className="mt-1 mb-6 text-sm text-muted-foreground">{subtitle}</p>}
          {!subtitle && <div className="mb-6" />}
          {children}
        </main>
      </div>
    </div>
  );
}
