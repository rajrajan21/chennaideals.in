import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Video, X } from 'lucide-react';
import {
  MAX_IMAGES, MAX_IMAGE_MB, MAX_VIDEO_MB, IMAGE_TYPES, VIDEO_TYPES,
} from '@/lib/media';

interface Props {
  images: File[];
  video: File | null;
  onImages: (files: File[]) => void;
  onVideo: (file: File | null) => void;
  canVideo: boolean;
  existingImages?: number;
  hasExistingVideo?: boolean;
  disabled?: boolean;
  onError: (message: string) => void;
  primaryIndex?: number;
  onPrimaryIndex?: (index: number) => void;
}

export default function MediaPicker({
  images, video, onImages, onVideo, canVideo,
  existingImages = 0, hasExistingVideo = false, disabled, onError,
  primaryIndex = 0, onPrimaryIndex,
}: Props) {
  const [previews, setPreviews] = useState<string[]>([]);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const urls = images.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [images]);

  const room = MAX_IMAGES - existingImages - images.length;

  const pickImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    onError('');
    const next = [...images];
    for (const f of picked) {
      if (!IMAGE_TYPES.includes(f.type)) { onError(`${f.name}: use JPG, PNG or WebP`); continue; }
      if (f.size > MAX_IMAGE_MB * 1024 * 1024) { onError(`${f.name} is larger than ${MAX_IMAGE_MB} MB`); continue; }
      if (next.length + existingImages >= MAX_IMAGES) { onError(`Up to ${MAX_IMAGES} pictures per deal`); break; }
      next.push(f);
    }
    onImages(next);
  };

  const pickVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    onError('');
    if (!f) return;
    if (!VIDEO_TYPES.includes(f.type)) { onError('Video must be MP4 or WebM'); return; }
    if (f.size > MAX_VIDEO_MB * 1024 * 1024) { onError(`Video must be ${MAX_VIDEO_MB} MB or smaller`); return; }
    onVideo(f);
  };

  const buttonClass =
    'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border border-border bg-background hover:bg-muted transition-colors disabled:opacity-50';

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass} disabled={disabled || room <= 0}
          onClick={() => imageInput.current?.click()}>
          <ImagePlus size={16} /> Add pictures ({Math.max(room, 0)} left)
        </button>
        <input ref={imageInput} type="file" multiple accept={IMAGE_TYPES.join(',')}
          className="hidden" onChange={pickImages} />

        {canVideo && !hasExistingVideo && (
          <>
            <button type="button" className={buttonClass} disabled={disabled || !!video}
              onClick={() => videoInput.current?.click()}>
              <Video size={16} /> Add video
            </button>
            <input ref={videoInput} type="file" accept={VIDEO_TYPES.join(',')}
              className="hidden" onChange={pickVideo} />
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground mt-2">
        JPG, PNG or WebP, up to {MAX_IMAGE_MB} MB each.
        {canVideo ? ` One MP4 or WebM video, up to ${MAX_VIDEO_MB} MB.` : ''}
      </p>

      {previews.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-3">
          {previews.map((src, i) => (
            <div key={src} className={`relative aspect-square rounded-xl overflow-hidden border-2 ${primaryIndex === i ? 'border-primary' : 'border-border'}`}>
              <img src={src} alt={`Selected picture ${i + 1}`} className="h-full w-full object-cover" />
              {onPrimaryIndex && <button type="button" disabled={disabled} onClick={() => onPrimaryIndex(i)}
                className={`absolute bottom-0 left-0 right-0 px-1 py-1 text-[10px] font-bold ${primaryIndex === i ? 'bg-primary text-primary-foreground' : 'bg-black/65 text-white'}`}>
                {primaryIndex === i ? '★ Main photo' : 'Set as main'}
              </button>}
              <button type="button" aria-label="Remove picture" disabled={disabled}
                onClick={() => { onImages(images.filter((_, j) => j !== i)); if (onPrimaryIndex && i <= primaryIndex) onPrimaryIndex(Math.max(0, primaryIndex - (i < primaryIndex ? 1 : 0))); }}
                className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {video && (
        <div className="flex items-center justify-between gap-2 mt-3 p-2 rounded-lg border border-border text-sm">
          <span className="truncate">{video.name} ({(video.size / 1048576).toFixed(1)} MB)</span>
          <button type="button" aria-label="Remove video" disabled={disabled}
            onClick={() => onVideo(null)} className="p-1 text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}