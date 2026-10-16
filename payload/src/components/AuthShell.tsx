import type { ReactNode } from 'react';
import { BadgePercent, MessageSquare, ShieldCheck } from 'lucide-react';

const POINTS = [
  { icon: BadgePercent, text: 'Real offers from Chennai shops and online stores' },
  { icon: MessageSquare, text: 'Vote, comment and share what actually worked' },
  { icon: ShieldCheck, text: 'Moderated by the community, free to use' },
];

/** Shared look for the sign in, sign up and password pages. Sits right under the site header. */
export default function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="bg-gray-50 px-4 py-6 sm:py-10">
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl lg:grid-cols-5">
        <aside className="relative hidden flex-col justify-between bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 p-8 text-white lg:col-span-2 lg:flex">
          <div>
            <a href="/" className="inline-flex items-center gap-2 text-lg font-extrabold tracking-tight">
              <img src="/logo.jpg" alt="" className="h-9 w-9 rounded-lg bg-white object-cover" />
              ChennaiDeals.in
            </a>
            <h2 className="mt-8 text-2xl font-bold leading-snug">Chennai's community for the best deals</h2>
            <p className="mt-2 text-sm text-blue-100">Join to post deals, vote and save money together.</p>
          </div>
          <ul className="mt-8 space-y-4 text-sm">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15"><Icon size={15} /></span>
                <span className="text-blue-50">{text}</span>
              </li>
            ))}
          </ul>
        </aside>
        <main className="p-6 sm:p-10 lg:col-span-3">
          <a href="/" className="mb-4 inline-flex items-center gap-2 text-base font-extrabold text-blue-700 lg:hidden">
            <img src="/logo.jpg" alt="" className="h-8 w-8 rounded-lg object-cover" />
            ChennaiDeals.in
          </a>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{title}</h1>
          {subtitle && <p className="mt-1 mb-6 text-sm text-gray-600">{subtitle}</p>}
          {!subtitle && <div className="mb-6" />}
          {children}
        </main>
      </div>
    </div>
  );
}
