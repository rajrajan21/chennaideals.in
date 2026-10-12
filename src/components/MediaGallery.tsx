import { useState } from 'react';
import type { MediaItem } from '@/lib/media';

export default function MediaGallery({ media, primaryUrl, onSetPrimary }: { media: MediaItem[]; primaryUrl?: string | null; onSetPrimary?: (url: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const images = media.filter((m) => m.type === 'image');
  const video = media.find((m) => m.type === 'video');
  if (images.length === 0 && !video) return null;

  return (
    <div className="space-y-3">
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {images.map((m) => (
            <div key={m.id} className={`relative overflow-hidden rounded-xl border-2 bg-muted ${primaryUrl === m.url ? 'border-primary' : 'border-border'}`}>
              <button type="button" onClick={() => setOpen(m.url)} className="block aspect-square w-full">
                <img src={m.url} alt="Deal photo" loading="lazy" className="h-full w-full object-cover" />
              </button>
              {onSetPrimary && <button type="button" onClick={() => onSetPrimary(m.url)}
                className={`w-full px-2 py-1.5 text-xs font-bold ${primaryUrl === m.url ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>
                {primaryUrl === m.url ? '★ Main photo' : 'Set as main'}
              </button>}
            </div>
          ))}
        </div>
      )}

      {video && (
        <video src={video.url} controls preload="metadata"
          className="w-full max-h-96 rounded-xl bg-black" />
      )}

      {open && (
        <div role="dialog" aria-modal="true" onClick={() => setOpen(null)}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4">
          <img src={open} alt="Deal photo enlarged" className="max-h-full max-w-full rounded-xl" />
        </div>
      )}
    </div>
  );
}