import { useEffect, useState } from 'react';
import type { MediaItem } from '@/lib/media';

export default function MediaGallery({
  media,
  primaryUrl,
  onSetPrimary,
}: {
  media: MediaItem[];
  primaryUrl?: string | null;
  onSetPrimary?: (url: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [viewUrl, setViewUrl] = useState<string | null>(primaryUrl || null);
  const images = media.filter((m) => m.type === 'image').slice(0, 5);
  const video = media.find((m) => m.type === 'video');

  useEffect(() => {
    setViewUrl(primaryUrl || images[0]?.url || null);
  }, [primaryUrl, media]);

  if (images.length === 0 && !video) return null;

  const currentImage = images.find((m) => m.url === viewUrl) || images.find((m) => m.url === primaryUrl) || images[0];

  return (
    <div className="space-y-3">
      {images.length > 0 && currentImage && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setOpen(currentImage.url)}
            className="flex w-full items-center justify-center overflow-hidden rounded-xl bg-muted/70 p-2 sm:p-3"
            aria-label="Enlarge main deal photo"
          >
            <img
              src={currentImage.url}
              alt="Main deal photo"
              className="max-h-[32rem] w-full rounded-lg object-contain"
            />
          </button>
          {images.length > 1 && (
            <div className="grid grid-cols-5 gap-2" aria-label="Deal photo gallery">
              {images.map((m, index) => {
                const isPrimary = primaryUrl === m.url;
                const isViewing = currentImage.url === m.url;
                return (
                  <div key={m.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setViewUrl(m.url)}
                      aria-label={`View deal photo ${index + 1}${isPrimary ? ', main photo' : ''}`}
                      aria-pressed={isViewing}
                      className={`relative block aspect-square w-full overflow-hidden rounded-lg border-2 bg-muted transition ${isViewing ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/50'}`}
                    >
                      <img src={m.url} alt={`Deal photo ${index + 1}`} loading="lazy" className="h-full w-full object-cover" />
                      {isPrimary && <span className="absolute bottom-0 left-0 right-0 bg-primary/90 px-1 py-0.5 text-[10px] font-bold text-primary-foreground">MAIN</span>}
                    </button>
                    {onSetPrimary && !isPrimary && (
                      <button type="button" onClick={() => onSetPrimary(m.url)}
                        className="mt-1 w-full rounded-md px-1 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">
                        Set main
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {video && (
        <video src={video.url} controls preload="metadata" aria-label="Deal video"
          className="w-full max-h-96 rounded-xl bg-black" />
      )}

      {open && (
        <div role="dialog" aria-modal="true" onClick={() => setOpen(null)}
          onKeyDown={(event) => { if (event.key === 'Escape') setOpen(null); }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4">
          <button type="button" onClick={() => setOpen(null)} aria-label="Close enlarged photo"
            className="absolute right-4 top-4 rounded-full bg-white/15 px-3 py-2 text-sm font-semibold text-white">Close</button>
          <img src={open} alt="Deal photo enlarged" className="max-h-full max-w-full rounded-xl" />
        </div>
      )}
    </div>
  );
}
