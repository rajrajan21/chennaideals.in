export type FetchImagesResult =
  | { ok: true; images: string[]; note?: string }
  | { ok: false; error: string };

export async function fetchPageImages(url: string): Promise<FetchImagesResult> {
  try {
    const res = await fetch('/api/deals/fetch-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    let data: { images?: string[]; note?: string; error?: string } | null = null;
    try { data = await res.json(); } catch { /* reply was not JSON */ }
    if (!res.ok) return { ok: false, error: data?.error || 'Could not look up pictures' };
    return { ok: true, images: data?.images ?? [], note: data?.note };
  } catch {
    return { ok: false, error: 'Network error. Please try again.' };
  }
}

export type ImportImagesResult =
  | { ok: true; imported: number; skipped: number }
  | { ok: false; error: string };

export async function importDealImages(dealId: number | string, urls: string[]): Promise<ImportImagesResult> {
  if (urls.length === 0) return { ok: true, imported: 0, skipped: 0 };
  try {
    const res = await fetch(`/api/deals/${dealId}/media/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
    });
    let data: { imported?: number; skipped?: number; error?: string } | null = null;
    try { data = await res.json(); } catch { /* reply was not JSON */ }
    if (!res.ok) return { ok: false, error: data?.error || 'Could not copy the pictures' };
    return { ok: true, imported: data?.imported ?? 0, skipped: data?.skipped ?? 0 };
  } catch {
    return { ok: false, error: 'Network error while copying pictures.' };
  }
}
