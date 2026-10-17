import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { ArrowLeft, Share2, Check, ExternalLink, Flame, Loader2, ShoppingBag, Sparkles, Store, TriangleAlert } from 'lucide-react';
import { useSession } from '@/lib/auth/auth-client';

type Cand = {
  id: string; title: string; url: string; retailer: string; imageUrl: string | null;
  salePrice: number | null; originalPrice: number | null; discountPercent: number | null; offerText: string | null;
  likes: number | null; views: number | null; postedAt: string | null;
  category: string; subCategory: string; images: string[]; uniqueness: 'lowest' | 'matched' | 'unknown';
  otherBest: { shop: string; price: number; url: string } | null; area: string; heat: number; tier: 'super-hot' | 'hot' | 'good';
  reasons: string[]; warnings: string[]; verified: boolean; foundBy: string[];
};
type Job = {
  id: string; mode: 'ecommerce' | 'local' | 'social'; city: string; count: number; status: 'running' | 'done' | 'error';
  stage: string; percent: number; log: string[]; results: Cand[];
  sources: { name: string; ok: boolean; found: number; note?: string }[];
  usedAI: boolean; providers: string[]; social: boolean; days: number; posted: Record<string, number>; error: string | null;
};

const rupees = (n: number | null) => (n === null ? '' : '₹' + Math.round(n).toLocaleString('en-IN'));
const TIER = {
  'super-hot': { label: 'Super hot', bg: 'hsl(var(--destructive))', fg: 'hsl(var(--destructive-foreground))' },
  hot: { label: 'Hot', bg: 'hsl(var(--primary))', fg: 'hsl(var(--primary-foreground))' },
  good: { label: 'Good deal', bg: 'hsl(var(--secondary))', fg: 'hsl(var(--secondary-foreground))' },
  normal: { label: 'Normal deal', bg: 'hsl(var(--muted))', fg: 'hsl(var(--foreground))' },
} as const;

async function api<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let data: unknown = null;
  try { data = await res.json(); } catch { /* not JSON */ }
  if (!res.ok) throw new Error((data as { error?: string } | null)?.error || `Request failed (${res.status})`);
  return data as T;
}

export default function DealHunterPage() {
  const { user, isPending } = useSession();
  const isAdmin = Boolean((user as { isAdmin?: boolean } | null)?.isAdmin);
  const [mode, setMode] = useState<'ecommerce' | 'local' | 'social' | null>(null);
  const [count, setCount] = useState(10);
  const [cities, setCities] = useState<string[]>(['Chennai (all areas)']);
  const [city, setCity] = useState('Chennai (all areas)');
  const [aiOn, setAiOn] = useState(false);
  const [tree, setTree] = useState<Record<string, string[]>>({});
  const [cats, setCats] = useState<string[]>([]);
  const [sub, setSub] = useState('');
  const [strict, setStrict] = useState(true);
  const [engines, setEngines] = useState<{ id: string; label: string; ready: boolean; cost: string; keyName: string }[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [social, setSocial] = useState(true);
  const [days, setDays] = useState(7);
  const [job, setJob] = useState<Job | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    api<{ cities: string[]; aiConfigured: boolean; categories: Record<string, string[]>; providers: typeof engines }>('/api/admin/hunter/options').then((o) => { setCities(o.cities); setAiOn(o.aiConfigured); setTree(o.categories ?? {}); setEngines(o.providers ?? []); setChosen((o.providers ?? []).filter((p) => p.ready).map((p) => p.id)); }).catch(() => { /* defaults are fine */ });
  }, [isAdmin]);

  const stopPolling = () => { if (timer.current !== null) { window.clearInterval(timer.current); timer.current = null; } };
  useEffect(() => stopPolling, []);

  const poll = useCallback((jobId: string) => {
    stopPolling();
    const tick = async () => {
      try {
        const j = await api<Job>(`/api/admin/hunter/${jobId}`);
        setJob(j);
        if (j.status !== 'running') {
          stopPolling();
          setSelected(new Set(j.results.filter((r) => !j.posted[r.id]).map((r) => r.id)));
        }
      } catch (e) { stopPolling(); setError(e instanceof Error ? e.message : 'Lost contact with the search.'); }
    };
    void tick();
    timer.current = window.setInterval(() => void tick(), 2000);
  }, []);

  const start = async () => {
    if (!mode) return;
    setError(''); setMessage(''); setBusy(true);
    try {
      const r = await api<{ jobId: string }>('/api/admin/hunter/start', { mode, count, city, categories: cats, subCategory: cats.length === 1 ? sub : '', strict, providers: chosen, social, days });
      setJob(null);
      poll(r.jobId);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not start.'); }
    setBusy(false);
  };

  const postSelected = async () => {
    if (!job || selected.size === 0) return;
    setError(''); setMessage(''); setBusy(true);
    try {
      const r = await api<{ posted: { id: string; dealId: number }[]; skipped: { id: string; reason: string }[] }>(`/api/admin/hunter/${job.id}/publish`, { ids: Array.from(selected) });
      const posted = { ...job.posted };
      r.posted.forEach((p) => { posted[p.id] = p.dealId; });
      setJob({ ...job, posted });
      setSelected(new Set());
      setMessage(`${r.posted.length} deal${r.posted.length === 1 ? '' : 's'} posted.` + (r.skipped.length ? ` ${r.skipped.length} skipped (${Array.from(new Set(r.skipped.map((s) => s.reason))).join(', ')}).` : ''));
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not post.'); }
    setBusy(false);
  };

  const reset = () => { stopPolling(); setJob(null); setMode(null); setSelected(new Set()); setError(''); setMessage(''); };

  if (isPending) return <div className="mx-auto max-w-3xl p-8 text-sm text-muted-foreground">Loading...</div>;
  if (!user || !isAdmin) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <h1 className="mb-2 text-xl font-bold">Admin only</h1>
        <p className="mb-4 text-sm text-muted-foreground">{user ? 'This page is only for the site admin.' : 'Please sign in with the admin account.'}</p>
        <Link to={user ? '/' : '/login'} className="font-semibold underline">{user ? 'Back to the deals' : 'Sign in'}</Link>
      </div>
    );
  }

  const results = job?.results ?? [];
  const open = results.filter((r) => !job?.posted[r.id]);
  const allOn = open.length > 0 && open.every((r) => selected.has(r.id));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <Helmet><title>Deal Hunter - ChennaiDeals.in</title><meta name="robots" content="noindex" /></Helmet>
      <div className="mb-5 flex items-center gap-3">
        <Flame className="text-primary" />
        <h1 className="text-2xl font-extrabold">Deal Hunter</h1>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">Admin only</span>
      </div>

      {error && <p role="alert" className="mb-4 rounded-lg border border-border bg-card p-3 text-sm" style={{ color: 'hsl(var(--destructive))' }}>{error}</p>}

      {/* Step 1 + 2: choose option, number, city */}
      {!job && (
        <div>
          <p className="mb-3 text-sm text-muted-foreground">Choose where to look for the best deals. {aiOn ? 'AI search is on (free Gemini).' : 'AI search is off (no Gemini key) - shop pages only.'}</p>
          <div className="grid gap-4 md:grid-cols-3">
            {([
              ['ecommerce', 'Option 1', 'Top deals from eCommerce websites', 'Amazon, Flipkart, Croma, Nykaa and more - the biggest real discounts, price-checked on the shop page.', ShoppingBag],
              ['local', 'Option 2', 'Top deals from local Chennai shops', 'Local retailers, showrooms and ads - filter by area or city.', Store],
              ['social', 'Option 3', 'Popular Facebook / Instagram deal posts', 'Public posts from the last 3 or 7 days with the most likes and views - Chennai and online shops.', Share2],
            ] as const).map(([key, tag, name, text, Icon]) => (
              <button key={key} type="button" onClick={() => setMode(key)} aria-pressed={mode === key}
                className="rounded-2xl border-2 bg-card p-5 text-left transition-colors hover:bg-muted"
                style={{ borderColor: mode === key ? 'hsl(var(--primary))' : 'hsl(var(--border))' }}>
                <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-primary"><Icon size={16} />{tag}</div>
                <div className="text-lg font-bold">{name}</div>
                <p className="mt-1 text-sm text-muted-foreground">{text}</p>
              </button>
            ))}
          </div>

          {mode && (
            <div className="mt-5 rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-end gap-4">
                <label className="text-sm font-semibold">
                  How many deals?
                  <input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                    className="mt-1 block w-28 rounded-lg border border-border bg-background px-3 py-2" />
                </label>
                {(mode === 'local' || mode === 'social') && (
                  <label className="text-sm font-semibold">
                    {mode === 'social' ? 'Where' : 'City / area'}
                    <select value={city} onChange={(e) => setCity(e.target.value)} className="mt-1 block w-64 rounded-lg border border-border bg-background px-3 py-2">
                      {(mode === 'social' ? ['Chennai + online shops', 'Online shops only'] : []).map((c) => <option key={c}>{c}</option>)}
                      {cities.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </label>
                )}
                <button type="button" onClick={start} disabled={busy}
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold disabled:opacity-50"
                  style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Find the hottest deals
                </button>
              </div>
              <div className="mt-4">
                <div className="mb-1 text-sm font-semibold">Category <span className="font-normal text-muted-foreground">(none ticked = a mix of everything)</span></div>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(tree).map((c) => {
                    const on = cats.includes(c);
                    return (
                      <button key={c} type="button" aria-pressed={on}
                        onClick={() => { setSub(''); setCats((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c])); }}
                        className="rounded-full border px-3 py-1 text-xs font-semibold"
                        style={{ borderColor: on ? 'hsl(var(--primary))' : 'hsl(var(--border))', background: on ? 'hsl(var(--primary))' : 'transparent', color: on ? 'hsl(var(--primary-foreground))' : 'inherit' }}>
                        {c}
                      </button>
                    );
                  })}
                </div>
                {cats.length === 1 && (tree[cats[0]] ?? []).length > 0 && (
                  <label className="mt-3 block text-sm font-semibold">
                    Sub-category
                    <select value={sub} onChange={(e) => setSub(e.target.value)} className="mt-1 block w-64 rounded-lg border border-border bg-background px-3 py-2">
                      <option value="">All of {cats[0]}</option>
                      {tree[cats[0]].map((n) => <option key={n}>{n}</option>)}
                    </select>
                  </label>
                )}
                <div className="mt-4">
                  <div className="mb-1 text-sm font-semibold">AI search engines <span className="font-normal text-muted-foreground">(tick one, several or all - each searches the live web)</span></div>
                  <div className="flex flex-wrap gap-2">
                    {engines.map((e) => {
                      const on = chosen.includes(e.id);
                      return (
                        <label key={e.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs" style={{ opacity: e.ready ? 1 : 0.55 }} title={e.ready ? e.cost : `Add ${e.keyName} to .env.local to use this (${e.cost})`}>
                          <input type="checkbox" disabled={!e.ready} checked={on && e.ready} onChange={() => setChosen((cur) => (cur.includes(e.id) ? cur.filter((x) => x !== e.id) : [...cur, e.id]))} />
                          <span><b>{e.label}</b><br />{e.ready ? e.cost : `no key - add ${e.keyName}`}</span>
                        </label>
                      );
                    })}
                    {engines.some((e) => e.ready) && (
                      <button type="button" className="rounded-lg border border-border px-3 py-2 text-xs font-semibold underline" onClick={() => setChosen(engines.filter((e) => e.ready).map((e) => e.id))}>Select all</button>
                    )}
                  </div>
                </div>
                <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  {mode === 'social' ? <b>Posts from the last</b> : <input type="checkbox" checked={social} onChange={(e) => setSocial(e.target.checked)} />}
                  {mode !== 'social' && <span><b>Include recent public Facebook / Instagram / ad posts</b> from the last</span>}
                  <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border border-border bg-background px-2 py-1"><option value={3}>3 days</option><option value={7}>7 days</option></select>
                </label>
                <label className="mt-3 flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} className="mt-1" />
                  <span><b>Only unique prices</b> - drop any deal that another shop sells at the same or a lower price (needs the Gemini key to compare with other shops).</span>
                </label>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Deep searches can take 10-30 minutes - you can leave this page open. Every deal is opened on the shop&rsquo;s own page, price-checked, compared and safety-checked before you see it.</p>
            </div>
          )}
        </div>
      )}

      {/* Step 3: progress */}
      {job && job.status === 'running' && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-2 flex items-center gap-2 font-semibold"><Loader2 size={18} className="animate-spin text-primary" />{job.stage}</div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${job.percent}%` }} /></div>
          <p className="mt-2 text-xs text-muted-foreground">{job.percent}% - you can leave this page open; it updates by itself.</p>
        </div>
      )}
      {job && job.status === 'error' && (
        <div className="rounded-2xl border border-border bg-card p-6"><p className="mb-3 text-sm">The search stopped: {job.error}</p><button type="button" onClick={reset} className="font-semibold underline">Start again</button></div>
      )}

      {/* Step 4: review and post */}
      {job && job.status === 'done' && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={reset} className="inline-flex items-center gap-1 text-sm font-semibold underline"><ArrowLeft size={14} /> New search</button>
            <span className="text-sm text-muted-foreground">{job.mode === 'ecommerce' ? 'eCommerce websites' : job.mode === 'social' ? `Facebook / Instagram posts - ${job.city}` : `Local shops - ${job.city}`} - {results.length} deal{results.length === 1 ? '' : 's'} found{job.usedAI ? ' (AI helped)' : ''}</span>
          </div>
          {message && <p role="status" className="mb-3 rounded-lg bg-muted p-3 text-sm font-semibold">{message}</p>}
          {job.log.length > 0 && <details className="mb-3 text-xs text-muted-foreground" open={results.length === 0}><summary className="cursor-pointer font-semibold">What the search did</summary><ul className="mt-1 list-disc space-y-1 pl-5">{job.log.map((l, i) => <li key={i}>{l}</li>)}</ul></details>}

          {results.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-6 text-sm">No strong deal could be confirmed this time. Open "What the search did" and "Where we looked" below to see why, then try another AI engine, or add shops to <code>data/hunter-sources.json</code>.</div>
          ) : (
            <>
              <div className="sticky top-16 z-10 mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={allOn} onChange={() => setSelected(allOn ? new Set() : new Set(open.map((r) => r.id)))} /> Select all ({open.length})
                </label>
                <span className="text-sm text-muted-foreground">{selected.size} selected</span>
                <button type="button" onClick={postSelected} disabled={busy || selected.size === 0}
                  className="ml-auto inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-bold disabled:opacity-50"
                  style={{ background: 'hsl(var(--secondary))', color: 'hsl(var(--secondary-foreground))' }}>
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Post {selected.size} selected deal{selected.size === 1 ? '' : 's'}
                </button>
              </div>
              <ul className="space-y-3">
                {results.map((c) => {
                  const posted = job.posted[c.id];
                  const t = TIER[c.tier];
                  return (
                    <li key={c.id} className="flex gap-3 rounded-2xl border border-border bg-card p-3" style={{ opacity: posted ? 0.65 : 1 }}>
                      <input type="checkbox" aria-label={`Select ${c.title}`} className="mt-1 h-5 w-5 shrink-0" disabled={Boolean(posted)} checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                      {c.imageUrl ? <img src={c.imageUrl} alt="" referrerPolicy="no-referrer" className="h-24 w-24 shrink-0 rounded-lg bg-muted object-contain" /> : <div className="h-24 w-24 shrink-0 rounded-lg bg-muted" />}
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded-full px-2 py-0.5 font-bold" style={{ background: t.bg, color: t.fg }}>{t.label} {c.heat}</span>
                          <span className="font-semibold">{c.retailer}</span>
                          <span className="text-muted-foreground">{c.category}{c.subCategory ? ` > ${c.subCategory}` : ''} - {c.area}</span>
                          {c.uniqueness === 'lowest' && <span className="rounded-full px-2 py-0.5 font-bold" style={{ background: 'hsl(var(--secondary))', color: 'hsl(var(--secondary-foreground))' }}>Lowest price found</span>}
                          {c.uniqueness === 'unknown' && c.salePrice !== null && <span className="text-muted-foreground">not compared elsewhere</span>}
                          {(c.likes || c.views) && <span className="font-semibold">{c.likes ? `${c.likes.toLocaleString('en-IN')} likes` : ''}{c.likes && c.views ? ' - ' : ''}{c.views ? `${c.views.toLocaleString('en-IN')} views` : ''}</span>}
                          {c.postedAt && <span className="text-muted-foreground">posted {c.postedAt}</span>}
                          {c.foundBy.length > 0 && <span className="text-muted-foreground">via {c.foundBy.slice(0, 3).join(', ')}</span>}
                          {c.images.length === 0 && !c.imageUrl && <span className="text-muted-foreground">no picture</span>}
                          {!c.verified && <span className="inline-flex items-center gap-1 text-muted-foreground"><TriangleAlert size={12} />not confirmed on page</span>}
                        </div>
                        <div className="font-bold leading-snug">{c.title}</div>
                        <div className="mt-1 text-sm">
                          {c.salePrice !== null && <span className="font-extrabold text-primary">{rupees(c.salePrice)}</span>}{' '}
                          {c.originalPrice !== null && <span className="text-muted-foreground line-through">{rupees(c.originalPrice)}</span>}{' '}
                          {c.discountPercent !== null && <span className="font-bold" style={{ color: 'hsl(var(--secondary))' }}>{c.discountPercent}% off</span>}
                          {c.offerText && c.salePrice === null && <span>{c.offerText}</span>}
                        </div>
                        {c.reasons.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">{c.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
                        {c.warnings.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs" style={{ color: 'hsl(var(--destructive))' }}>{c.warnings.map((r) => <li key={r}>{r}</li>)}</ul>}
                        <div className="mt-2 flex items-center gap-4 text-xs font-semibold">
                          <a href={c.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">Open shop page <ExternalLink size={12} /></a>
                          {posted && <Link to={`/deals/${posted}`} className="underline">Posted - view on site</Link>}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {job.sources.length > 0 && (
            <details className="mt-6 text-xs text-muted-foreground">
              <summary className="cursor-pointer font-semibold">Where we looked ({job.sources.filter((s) => s.ok).length} of {job.sources.length} readable)</summary>
              <ul className="mt-2 space-y-1">{job.sources.map((s) => <li key={s.name}>{s.ok ? 'OK' : 'Skipped'} - {s.name}{s.ok ? ` (${s.found} items)` : s.note ? ` - ${s.note}` : ''}</li>)}</ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
