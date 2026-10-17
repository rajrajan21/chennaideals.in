export interface DealDraft {
  title: string;
  description: string;
  longDetails: string;
  originalPrice: number | null;
  salePrice: number | null;
  retailer: string;
  category: string;
}

export interface PulledImage {
  token: string;
  url: string;
  width: number | null;
  height: number | null;
  bytes: number;
}

export type DetailsResult =
  | { ok: true; draft: DealDraft; images: PulledImage[]; notes: string[]; usedAI: boolean; aiConfigured: boolean }
  | { ok: false; error: string };

/** One request: reads the page, drafts the form, and saves the pictures (full size) on the server. */
export async function fetchDealDetails(url: string): Promise<DetailsResult> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch('/api/deals/fetch-details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });
    let data: Record<string, unknown> | null = null;
    try { data = await res.json(); } catch { /* reply was not JSON */ }
    if (!res.ok || !data) return { ok: false, error: (data?.error as string) || 'Could not read that link. Please try again.' };
    return {
      ok: true,
      draft: data.draft as DealDraft,
      images: (data.images as PulledImage[]) ?? [],
      notes: (data.notes as string[]) ?? [],
      usedAI: Boolean(data.usedAI),
      aiConfigured: Boolean(data.aiConfigured),
    };
  } catch {
    return { ok: false, error: 'The website took too long or the connection dropped. Please press the button again.' };
  } finally {
    window.clearTimeout(timer);
  }
}

export type ImportResult = { ok: true; imported: number; skipped: number } | { ok: false; error: string };

/** Adds the already-saved pictures to the new deal (no second download happens). */
export async function importPulledImages(dealId: number | string, tokens: string[]): Promise<ImportResult> {
  if (tokens.length === 0) return { ok: true, imported: 0, skipped: 0 };
  try {
    const res = await fetch(`/api/deals/${dealId}/media/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokens }),
    });
    let data: { imported?: number; skipped?: number; error?: string } | null = null;
    try { data = await res.json(); } catch { /* reply was not JSON */ }
    if (!res.ok) return { ok: false, error: data?.error || 'Could not add the pictures' };
    return { ok: true, imported: data?.imported ?? 0, skipped: data?.skipped ?? 0 };
  } catch {
    return { ok: false, error: 'Network error while adding pictures.' };
  }
}
