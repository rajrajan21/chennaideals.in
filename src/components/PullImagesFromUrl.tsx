import { useEffect, useState } from 'react';
import { Check, Link2 } from 'lucide-react';
import { fetchPageImages } from '@/lib/page-images';

interface Props {
  url: string;
  selected: string[];
  onChange: (urls: string[]) => void;
  /** How many more pictures this deal can still take (5 minus pictures already chosen). */
  maxSelectable: number;
  disabled?: boolean;
}

export default function PullImagesFromUrl({ url, selected, onChange, maxSelectable, disabled }: Props) {
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [broken, setBroken] = useState<string[]>([]);

  // If the user adds more uploads of their own, keep the total within the limit.
  useEffect(() => {
    if (selected.length > Math.max(0, maxSelectable)) onChange(selected.slice(0, Math.max(0, maxSelectable)));
  }, [maxSelectable, selected, onChange]);

  async function find() {
    setLoading(true);
    setMessage('');
    setBroken([]);
    const result = await fetchPageImages(url.trim());
    setLoading(false);
    if (!result.ok) { setMessage(result.error); return; }
    setCandidates(result.images);
    onChange(result.images.slice(0, Math.max(0, maxSelectable)).slice(0, 1));
    setMessage(result.note ?? (result.images.length ? 'Tick the pictures you want to use.' : ''));
  }

  function toggle(src: string) {
    if (selected.includes(src)) onChange(selected.filter((s) => s !== src));
    else if (selected.length < maxSelectable) onChange([...selected, src]);
    else setMessage(`You can add up to 5 pictures per deal.`);
  }

  const shown = candidates.filter((c) => !broken.includes(c));

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={find}
        disabled={disabled || loading || !url.trim() || maxSelectable <= 0}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border border-border bg-background hover:bg-muted transition-colors disabled:opacity-50"
      >
        <Link2 size={16} /> {loading ? 'Looking for pictures...' : 'Find pictures from the deal link'}
      </button>
      {!url.trim() && <p className="text-xs text-muted-foreground mt-1">Enter the deal link above first.</p>}
      {message && <p className="text-xs text-muted-foreground mt-2">{message}</p>}

      {shown.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3">
          {shown.map((src) => {
            const on = selected.includes(src);
            return (
              <button
                type="button"
                key={src}
                onClick={() => toggle(src)}
                disabled={disabled}
                aria-pressed={on}
                className={`relative aspect-square rounded-xl overflow-hidden border-2 bg-white ${on ? 'border-primary' : 'border-border'}`}
              >
                <img
                  src={src}
                  alt="Picture found on the deal page"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  className="h-full w-full object-contain"
                  onError={() => setBroken((b) => [...b, src])}
                />
                {on && (
                  <span className="absolute top-1 right-1 rounded-full bg-primary p-1 text-primary-foreground">
                    <Check size={12} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {selected.length > 0 && (
        <p className="text-xs text-muted-foreground mt-2">
          {selected.length} picture{selected.length > 1 ? 's' : ''} will be copied to your deal when you submit.
        </p>
      )}
    </div>
  );
}
