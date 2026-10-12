import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { ArrowLeft, BellRing, Mail, MessageSquare, Save } from 'lucide-react';
import { useSession } from '@/lib/auth/auth-client';

const CATEGORIES = ['Electronics', 'Mobile Phones', 'Fashion', 'Groceries', 'Restaurants', 'Home & Kitchen', 'Travel', 'Beauty', 'Sports', 'Books', 'Toys', 'Other'];
type Preferences = { keywords: string[]; categories: string[]; emailEnabled: boolean; smsEnabled: boolean; phoneNumber: string };

export default function DealAlertsPage() {
  const { user } = useSession();
  const [prefs, setPrefs] = useState<Preferences>({ keywords: [], categories: [], emailEnabled: true, smsEnabled: false, phoneNumber: '' });
  const [keywordText, setKeywordText] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    fetch('/api/alerts').then(async (res) => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load preferences');
      setPrefs(data.preferences);
      setKeywordText((data.preferences.keywords || []).join(', '));
      setEmail(data.email || '');
    }).catch((e) => setError(e instanceof Error ? e.message : 'Could not load preferences'))
      .finally(() => setLoading(false));
  }, [user]);

  const toggleCategory = (category: string) => setPrefs((current) => ({
    ...current,
    categories: current.categories.includes(category)
      ? current.categories.filter((item) => item !== category)
      : [...current.categories, category],
  }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true); setNotice(''); setError('');
    const keywords = [...new Set(keywordText.split(',').map((item) => item.trim()).filter(Boolean))].slice(0, 20);
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...prefs, keywords }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save preferences');
      setPrefs(data.preferences);
      setKeywordText(data.preferences.keywords.join(', '));
      setNotice('Your deal alert preferences have been saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save preferences');
    } finally { setSaving(false); }
  };

  if (!user) return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <BellRing className="mx-auto mb-4 text-primary" size={36} />
      <h1 className="mb-2 text-2xl font-bold">Deal alerts</h1>
      <p className="mb-5 text-sm text-muted-foreground">Sign in to create keyword and category alerts.</p>
      <Link to="/login" className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground">Sign in</Link>
    </main>
  );

  return (
    <>
      <Helmet><title>Deal Alerts — ChennaiDeals.in</title><meta name="description" content="Choose keywords and categories for ChennaiDeals alerts." /></Helmet>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link to="/" className="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"><ArrowLeft size={16} /> Back to deals</Link>
        <div className="mb-6 flex items-start gap-3">
          <div className="rounded-2xl bg-primary/10 p-3 text-primary"><BellRing size={26} /></div>
          <div><h1 className="text-2xl font-bold">Deal alerts</h1><p className="mt-1 text-sm text-muted-foreground">Get notified when new deals match your interests.</p></div>
        </div>
        {loading ? <div className="rounded-xl border border-border p-6 text-sm text-muted-foreground">Loading your preferences…</div> : (
          <form onSubmit={save} className="space-y-6 rounded-2xl border border-border bg-card p-5 sm:p-7">
            <section>
              <label htmlFor="keywords" className="mb-2 block text-sm font-semibold">Keywords</label>
              <input id="keywords" value={keywordText} onChange={(e) => setKeywordText(e.target.value)} placeholder="e.g. laptop, headphones, rice" className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              <p className="mt-1 text-xs text-muted-foreground">Separate terms with commas. Up to 20 keywords.</p>
            </section>
            <section>
              <h2 className="mb-3 text-sm font-semibold">Categories</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {CATEGORIES.map((category) => <label key={category} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3 text-sm hover:bg-muted/60">
                  <input type="checkbox" checked={prefs.categories.includes(category)} onChange={() => toggleCategory(category)} className="accent-primary" />
                  {category}
                </label>)}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">Choose one or more categories, or use keywords. At least one keyword or category is required.</p>
            </section>
            <section className="space-y-3 border-t border-border pt-5">
              <h2 className="text-sm font-semibold">Delivery methods</h2>
              <label className="flex items-start gap-3 rounded-xl border border-border p-4">
                <input type="checkbox" checked={prefs.emailEnabled} onChange={(e) => setPrefs((p) => ({ ...p, emailEnabled: e.target.checked }))} className="mt-1 accent-primary" />
                <Mail size={18} className="mt-0.5 text-primary" />
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">Email alerts</span><span className="block break-all text-xs text-muted-foreground">{email || 'Your account email'}</span></span>
              </label>
              <label className="flex items-start gap-3 rounded-xl border border-border p-4">
                <input type="checkbox" checked={prefs.smsEnabled} onChange={(e) => setPrefs((p) => ({ ...p, smsEnabled: e.target.checked }))} className="mt-1 accent-primary" />
                <MessageSquare size={18} className="mt-0.5 text-primary" />
                <span className="flex-1"><span className="block text-sm font-semibold">SMS alerts</span><span className="block text-xs text-muted-foreground">Use international format including country code.</span></span>
              </label>
              {prefs.smsEnabled && <div><label htmlFor="phone" className="mb-2 block text-sm font-semibold">Mobile number</label><input id="phone" type="tel" value={prefs.phoneNumber} onChange={(e) => setPrefs((p) => ({ ...p, phoneNumber: e.target.value }))} placeholder="+14155550123" className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30" /></div>}
            </section>
            {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
            {notice && <p role="status" className="rounded-lg bg-primary/10 p-3 text-sm text-primary">{notice}</p>}
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"><Save size={16} />{saving ? 'Saving…' : 'Save alert preferences'}</button>
          </form>
        )}
      </main>
    </>
  );
}
