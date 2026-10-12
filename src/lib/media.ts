export const MAX_IMAGES = 5;
export const MAX_IMAGE_MB = 5;
export const MAX_VIDEO_MB = 50;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const VIDEO_TYPES = ['video/mp4', 'video/webm'];

export interface MediaItem {
  id: number;
  type: string;
  url: string;
  sortOrder: number;
}

export type UploadResult =
  | { ok: true; media: MediaItem[] | null }
  | { ok: false; error: string };

export async function uploadDealMedia(
  dealId: number | string,
  images: File[],
  video: File | null,
  primaryImageIndex = 0,
  primaryImageUrl?: string,
): Promise<UploadResult> {
  if (images.length === 0 && !video && !primaryImageUrl) return { ok: true, media: null };

  const fd = new FormData();
  images.forEach((f) => fd.append('images', f));
  if (video) fd.append('video', video);
  if (images.length > 0) fd.append('primaryImageIndex', String(Math.max(0, Math.min(primaryImageIndex, images.length - 1))));
  if (primaryImageUrl) fd.append('primaryImageUrl', primaryImageUrl);

  try {
    // No Content-Type header: the browser sets the multipart boundary itself.
    const res = await fetch(`/api/deals/${dealId}/media`, { method: 'POST', body: fd });
    let data: { media?: MediaItem[]; error?: string } | null = null;
    try { data = await res.json(); } catch { /* reply was not JSON */ }
    if (!res.ok) return { ok: false, error: data?.error || 'Upload failed' };
    return { ok: true, media: data?.media ?? [] };
  } catch {
    return { ok: false, error: 'Network error. Please try again.' };
  }
}