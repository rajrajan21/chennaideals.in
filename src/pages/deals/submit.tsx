import { useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion } from 'motion/react';
import { ArrowLeft, Send, Info } from 'lucide-react';
import { useSession } from '@/lib/auth/auth-client';
import { submit_deal } from 'virtual:content';
import MediaPicker from '@/components/MediaPicker';
import { uploadDealMedia, MAX_IMAGES } from '@/lib/media';
import DealLinkAssist from '@/components/DealLinkAssist';
import { importPulledImages, type DealDraft } from '@/lib/deal-link';
import { finalizeDeal } from '@/lib/finalize';

const CATEGORIES = ['Electronics', 'Mobile Phones', 'Fashion', 'Groceries', 'Restaurants', 'Home & Kitchen', 'Travel', 'Beauty', 'Sports', 'Books', 'Toys', 'Other'];
const RETAILERS = ['Flipkart', 'Amazon', 'Meesho', 'Myntra', 'Nykaa', 'BigBasket', 'Swiggy', 'Zomato', 'Local Store', 'Other'];
const AREAS = ['Chennai (All)', 'T. Nagar', 'Anna Nagar', 'Velachery', 'Adyar', 'OMR', 'Porur', 'Tambaram', 'Chromepet', 'Perambur', 'Egmore', 'Nungambakkam', 'Kodambakkam'];

export default function SubmitDealPage() {
  const navigate = useNavigate();
  const { user } = useSession();
    const isAdmin = Boolean((user as { isAdmin?: boolean } | null)?.isAdmin);
  const [images, setImages] = useState<File[]>([]);
  const [primaryImageIndex, setPrimaryImageIndex] = useState(0);
  const [video, setVideo] = useState<File | null>(null);
  const [pulledTokens, setPulledTokens] = useState<string[]>([]);
  const [prevForm, setPrevForm] = useState<Record<string, string> | null>(null);

  const [form, setForm] = useState({
    title: '', description: '', longDetails: '', url: '',
    originalPrice: '', salePrice: '',
    retailer: '', category: '', area: 'Chennai (All)',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [stage, setStage] = useState('');
  const [retryId, setRetryId] = useState<number | null>(null);

  const savings = form.originalPrice && form.salePrice
    ? Math.round(((parseFloat(form.originalPrice) - parseFloat(form.salePrice)) / parseFloat(form.originalPrice)) * 100)
    : null;

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const applyDraft = (d: DealDraft) => {
    setPrevForm({ ...form });
    setForm((f) => ({
      ...f,
      title: d.title || f.title,
      description: d.description || f.description,
      longDetails: d.longDetails || f.longDetails,
      originalPrice: d.originalPrice !== null ? String(d.originalPrice) : f.originalPrice,
      salePrice: d.salePrice !== null ? String(d.salePrice) : f.salePrice,
      retailer: RETAILERS.includes(d.retailer) ? d.retailer : 'Other',
      category: CATEGORIES.includes(d.category) ? d.category : 'Other',
    }));
  };
  const undoDraft = () => {
    if (prevForm) setForm((f) => ({ ...f, ...prevForm }));
    setPrevForm(null);
  };
  const hasTypedText = Boolean(form.title.trim() || form.description.trim() || form.longDetails.trim() || form.originalPrice || form.salePrice);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { navigate('/login'); return; }
    setSubmitting(true);
    setError('');
    setRetryId(null);
    setStage('Checking the link and website...');
    try {
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          description: form.longDetails.trim()
            ? `${form.description.trim()}${form.description.trim() ? '\n\n' : ''}\n\n[DEAL_LONG_DETAILS]\n${form.longDetails.trim()}`
            : form.description,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Submission failed'); return; }
      setStage('Adding your pictures...');
      const up = await uploadDealMedia(data.id, images, video, primaryImageIndex);
      let pullError = '';
      if (pulledTokens.length > 0) {
        const imp = await importPulledImages(data.id, pulledTokens);
        if (!imp.ok) pullError = imp.error;
        else if (imp.skipped > 0) pullError = `${imp.skipped} of the chosen pictures could not be added. You can add them again from the deal page.`;
      }
      setStage('Checking the pictures...');
      const fin = await finalizeDeal(data.id);
      if (!fin.ok) {
        setError(fin.error);
        if (!fin.rejected) setRetryId(data.id); // the deal is saved but still hidden: allow a retry
        return;
      }
      const mediaError = !up.ok ? up.error : pullError || (fin.removedPictures > 0 ? `${fin.removedPictures} picture(s) were removed because they were too small, blank or blurry.` : '');
      navigate(`/deals/${data.id}`, mediaError ? { state: { uploadError: mediaError } } : undefined);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
      setStage('');
    }
  };

  const retryFinalCheck = async () => {
    if (retryId === null) return;
    setSubmitting(true);
    setStage('Checking the pictures...');
    setError('');
    const fin = await finalizeDeal(retryId);
    setSubmitting(false);
    setStage('');
    if (!fin.ok) { setError(fin.error); if (fin.rejected) setRetryId(null); return; }
    navigate(`/deals/${retryId}`);
  };

  if (!user) return (
    <main className="max-w-lg mx-auto px-4 py-20 text-center">
      <div className="text-4xl mb-4">🔐</div>
      <h1 className="text-xl font-bold mb-2" style={{ fontFamily: 'var(--font-heading)' }}>{submit_deal.labels.signInHeading}</h1>
      <p className="text-muted-foreground text-sm mb-6">{submit_deal.labels.signInBody}</p>
      <Link to="/login" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm"
        style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
        {submit_deal.labels.signInCta}
      </Link>
    </main>
  );

  return (
    <>
      <Helmet>
        <title>{submit_deal.meta.title}</title>
        <meta name="description" content={submit_deal.meta.description} />
      </Helmet>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-5 transition-colors">
          <ArrowLeft size={14} /> Back to deals
        </Link>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <h1 className="text-2xl font-bold mb-1" style={{ fontFamily: 'var(--font-heading)' }}>{submit_deal.heading}</h1>
          <p className="text-sm text-muted-foreground mb-6">
            {submit_deal.subheading}
          </p>

          {/* Lifecycle info */}
          <div className="flex items-start gap-3 p-4 rounded-xl mb-6 border border-border bg-muted/50">
            <Info size={16} className="text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              {submit_deal.infoBox}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Deal link + autofill */}
            <DealLinkAssist
              url={form.url}
              onUrl={(v) => setForm((f) => ({ ...f, url: v }))}
              hasTypedText={hasTypedText}
              onApplyDraft={applyDraft}
              canUndo={prevForm !== null}
              onUndo={undoDraft}
              selected={pulledTokens}
              onSelected={setPulledTokens}
              maxSelectable={MAX_IMAGES - images.length}
              disabled={submitting}
              isAdmin={isAdmin}
            />

            {/* Title */}
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'hsl(var(--foreground))' }}>
                {submit_deal.labels.title} <span className="text-destructive">*</span>
              </label>
              <input value={form.title} onChange={set('title')} required
                placeholder={submit_deal.placeholders.title}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                style={{ color: 'hsl(var(--foreground))' }} />
            </div>

            {/* Prices */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: 'hsl(var(--foreground))' }}>{submit_deal.labels.originalPrice}</label>
                <input value={form.originalPrice} onChange={set('originalPrice')} type="number" min="0" step="0.01"
                  placeholder={submit_deal.placeholders.originalPrice}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  style={{ color: 'hsl(var(--foreground))' }} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: 'hsl(var(--foreground))' }}>{submit_deal.labels.salePrice}</label>
                <input value={form.salePrice} onChange={set('salePrice')} type="number" min="0" step="0.01"
                  placeholder={submit_deal.placeholders.salePrice}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  style={{ color: 'hsl(var(--foreground))' }} />
              </div>
            </div>
            {savings !== null && savings > 0 && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="text-sm font-semibold px-4 py-2 rounded-lg inline-block"
                style={{ background: 'hsl(var(--deal-score-positive) / 0.12)', color: 'hsl(var(--deal-score-positive))' }}>
                🎉 {savings}% {submit_deal.labels.savingsMsg}
              </motion.div>
            )}

            {/* Retailer + Category */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: 'hsl(var(--foreground))' }}>
                  {submit_deal.labels.retailer} <span className="text-destructive">*</span>
                </label>
                <select value={form.retailer} onChange={set('retailer')} required
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  style={{ color: 'hsl(var(--foreground))' }}>
                  <option value="">Select retailer</option>
                  {RETAILERS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: 'hsl(var(--foreground))' }}>
                  {submit_deal.labels.category} <span className="text-destructive">*</span>
                </label>
                <select value={form.category} onChange={set('category')} required
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                  style={{ color: 'hsl(var(--foreground))' }}>
                  <option value="">Select category</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {/* Area */}
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'hsl(var(--foreground))' }}>{submit_deal.labels.area}</label>
              <select value={form.area} onChange={set('area')}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                style={{ color: 'hsl(var(--foreground))' }}>
                {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>


            {/* Description */}
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'hsl(var(--foreground))' }}>{submit_deal.labels.description}</label>
              <textarea value={form.description} onChange={set('description')} rows={4}
                placeholder={submit_deal.placeholders.description}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm resize-none outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                style={{ color: 'hsl(var(--foreground))' }} />
            </div>

            {/* Long deal details */}
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'hsl(var(--foreground))' }}>
                Deal long details <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </label>
              <p className="text-xs text-muted-foreground mb-2">Add specifications, offer conditions, coupon codes, delivery details, limitations, or why this is a good deal.</p>
              <textarea value={form.longDetails} onChange={set('longDetails')} rows={6}
                placeholder="• Key features and specifications&#10;• Coupon code / offer conditions&#10;• Delivery, warranty, or eligibility details"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm resize-y outline-none focus:ring-2 focus:ring-primary/30 transition-all"
                style={{ color: 'hsl(var(--foreground))' }} />
            </div>

            {error && (
              <div className="p-3 rounded-xl text-sm font-medium" style={{ background: 'hsl(var(--destructive) / 0.1)', color: 'hsl(var(--destructive))' }}>
                {error}
                {retryId !== null && (
                  <button type="button" onClick={retryFinalCheck} disabled={submitting} className="mt-2 block font-bold underline">
                    Try the final check again
                  </button>
                )}
              </div>
            )}
                        {/* Photos & video */}
            <div>
              <label className="block text-sm font-semibold mb-1.5" style={{ color: 'hsl(var(--foreground))' }}>
                Photos{isAdmin ? ' & video' : ''}
              </label>
              <MediaPicker
                images={images} video={video}
                onImages={(next) => { setImages(next); setPrimaryImageIndex((current) => Math.min(current, Math.max(0, next.length - 1))); }} onVideo={setVideo}
                primaryIndex={primaryImageIndex} onPrimaryIndex={setPrimaryImageIndex}
                canVideo={isAdmin} disabled={submitting} onError={setError}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Every deal is checked automatically (link, website, wording, prices and pictures) before it is posted. Unsafe, adult or misleading deals are rejected and reported to the site admin.
            </p>

            <button type="submit" disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm transition-all hover:scale-[1.02] disabled:opacity-60 disabled:scale-100"
              style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
              <Send size={16} /> <span>{submitting ? (stage || submit_deal.labels.submitting) : submit_deal.labels.submit}</span>
            </button>
          </form>
        </motion.div>
      </main>
    </>
  );
}
