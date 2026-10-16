import { useEffect, useRef, useState } from 'react';
import { Check, Link2, Sparkles, Undo2 } from 'lucide-react';
import { fetchDealDetails, fetchPulledImage, type DealDraft, type PulledImage } from '@/lib/deal-link';

interface Props {
  url: string;
  onUrl: (value: string) => void;
  /** True when the form already has text the user typed (we ask before replacing it). */
  hasTypedText: boolean;
  onApplyDraft: (draft: DealDraft) => void;
  canUndo: boolean;
  onUndo: () => void;
  selected: string[];
  onSelected: (tokens: string[]) => void;
  /** How many more pictures the deal can take (5 minus the user's own uploads). */
  maxSelectable: number;
  disabled?: boolean;
  isAdmin?: boolean;
}

const PICTURE_WORKERS = 3;

export default function DealLinkAssist({
  url, onUrl, hasTypedText, onApplyDraft, canUndo, onUndo, selected, onSelected, maxSelectable, disabled, isAdmin,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [loadingPics, setLoadingPics] = useState<{ done: number; total: number } | null>(null);
  const runId = useRef(0);
  const selectedRef = useRef<string[]>(selected);
  const maxRef = useRef(maxSelectable);
  selectedRef.current = selected;
  maxRef.current = maxSelectable;
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [images, setImages] = useState<PulledImage[]>([]);
  const [filled, setFilled] = useState<{ usedAI: boolean; aiConfigured: boolean } | null>(null);

  // If the user adds pictures of their own, keep the total within the limit.
  useEffect(() => {
    const max = Math.max(0, maxSelectable);
    if (selected.length > max) onSelected(selected.slice(0, max));
  }, [maxSelectable, selected, onSelected]);

  async function run() {
    const link = url.trim();
    if (!link) return;
    if (hasTypedText && !window.confirm('Replace what you have typed with the details from the link? (You can undo it.)')) return;
    const myRun = ++runId.current;
    setLoading(true);
    setLoadingPics(null);
    setError('');
    setNotes([]);
    setImages([]);
    const result = await fetchDealDetails(link);
    if (myRun !== runId.current) return;
    setLoading(false);
    if (!result.ok) { setError(result.error); return; }
    onApplyDraft(result.draft);
    setNotes(result.notes);
    setFilled({ usedAI: result.usedAI, aiConfigured: result.aiConfigured });
    onSelected([]);
    if (!result.lookupId || result.candidateCount === 0) return;

    // Pictures: a few at a time, shown as soon as each one is saved.
    const lookupId = result.lookupId;
    const total = result.candidateCount;
    let next = 0;
    let done = 0;
    let expired = false;
    setLoadingPics({ done: 0, total });
    const worker = async () => {
      while (!expired && myRun === runId.current) {
        const index = next++;
        if (index >= total) return;
        const r = await fetchPulledImage(lookupId, index);
        if (myRun !== runId.current) return;
        done++;
        setLoadingPics({ done, total });
        if (!r.ok) { if (r.expired) expired = true; continue; }
        const img = r.image;
        if (!img) continue;
        setImages((prev) => [...prev, img].sort((x, y) => (x.index ?? 0) - (y.index ?? 0)));
        if (selectedRef.current.length < Math.max(0, maxRef.current)) {
          const nextSel = [...selectedRef.current, img.token];
          selectedRef.current = nextSel;
          onSelected(nextSel);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PICTURE_WORKERS, total) }, worker));
    if (myRun !== runId.current) return;
    setLoadingPics(null);
    if (expired) setNotes((n) => [...n, 'The picture lookup expired. Press "Get details from link" again to load pictures.']);
  }

  function toggle(token: string) {
    if (selected.includes(token)) onSelected(selected.filter((t) => t !== token));
    else if (selected.length < maxSelectable) onSelected([...selected, token]);
    else setNotes(['You can add up to 5 pictures per deal. Untick one first.']);
  }

  function makeMain(token: string) {
    onSelected([token, ...selected.filter((t) => t !== token)]);
  }

  const inputClass = 'w-full rounded-xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-all';

  return (
    <div className="rounded-2xl border border-border bg-muted/40 p-4">
      <label className="block text-sm font-semibold mb-1.5" htmlFor="deal-link">Deal link</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id="deal-link" type="url" value={url} onChange={(e) => onUrl(e.target.value)} disabled={disabled || loading}
          placeholder="Paste the product or offer link here"
          className={inputClass} style={{ color: 'hsl(var(--foreground))' }}
        />
        <button
          type="button" onClick={run} disabled={disabled || loading || !url.trim()}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-all disabled:opacity-50"
          style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
        >
          <Sparkles size={16} /> {loading ? 'Working...' : 'Get details from link'}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        We fill in the title, price, shop, category, description and pictures. You can change anything before posting.
      </p>

      {loading && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Reading the page...
        </p>
      )}
      {loadingPics && (
        <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading pictures in full size ({loadingPics.done} of {loadingPics.total})...
        </p>
      )}
      {error && <p className="mt-3 text-sm font-medium text-destructive" role="alert">{error}</p>}

      {filled && !loading && !error && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="status">
          <p className="flex flex-wrap items-center justify-between gap-2 font-semibold">
            <span>{filled.usedAI ? 'Draft written from the link by AI' : 'Draft filled from the link'} - please check it before posting.</span>
            {canUndo && (
              <button type="button" onClick={onUndo} className="inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-2">
                <Undo2 size={12} /> Undo
              </button>
            )}
          </p>
          {notes.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs">{notes.map((n) => <li key={n}>{n}</li>)}</ul>}
          {isAdmin && !filled.aiConfigured && (
            <p className="mt-1 text-xs">Admin note: add a free GEMINI_API_KEY to .env.local for AI-written descriptions (optional).</p>
          )}
        </div>
      )}

      {images.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Link2 size={12} /> {selected.length} of {Math.max(0, maxSelectable)} pictures chosen - the first one is the main photo</span>
            <span className="flex gap-3">
              <button type="button" className="underline" onClick={() => onSelected(images.slice(0, Math.max(0, maxSelectable)).map((i) => i.token))}>Select all</button>
              <button type="button" className="underline" onClick={() => onSelected([])}>Clear</button>
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {images.map((img) => {
              const idx = selected.indexOf(img.token);
              const on = idx >= 0;
              const small = img.width !== null && img.height !== null && Math.min(img.width, img.height) < 400;
              return (
                <div key={img.token} className={`overflow-hidden rounded-xl border-2 bg-white ${on ? 'border-primary' : 'border-border'}`}>
                  <button type="button" onClick={() => toggle(img.token)} disabled={disabled} aria-pressed={on} className="relative block aspect-square w-full">
                    <img src={img.url} alt="Picture from the deal page" loading="lazy" className="h-full w-full object-contain" />
                    {on && (
                      <span className="absolute right-1 top-1 inline-flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                        <Check size={11} />{idx + 1}
                      </span>
                    )}
                  </button>
                  <div className="flex items-center justify-between gap-1 px-2 py-1 text-[10px] text-muted-foreground">
                    <span title={`${(img.bytes / 1024).toFixed(0)} KB`}>{img.width && img.height ? `${img.width}×${img.height}` : 'size unknown'}{small ? ' (small)' : ''}</span>
                    {on && idx > 0 && (
                      <button type="button" onClick={() => makeMain(img.token)} className="font-semibold text-primary underline">Make main</button>
                    )}
                    {on && idx === 0 && <span className="font-bold text-primary">Main</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
