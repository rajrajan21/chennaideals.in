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
  index?: number;
}

export type DetailsResult =
  | { ok: true; draft: DealDraft; notes: string[]; usedAI: boolean; aiConfigured: boolean; lookupId: string | null; candidateCount: number }
  | { ok: false; error: string };

/** Step 1: reads the page and drafts the form (fast). Pictures are fetched one by one afterwards. */
export async function fetchDealDetails(url: string): Promise<DetailsResult> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 40_000);
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
      notes: (data.notes as string[]) ?? [],
      usedAI: Boolean(data.usedAI),
      aiConfigured: Boolean(data.aiConfigured),
      lookupId: (data.lookupId as string | null) ?? null,
      candidateCount: Number(data.candidateCount) || 0,
    };
  } catch {
    return { ok: false, error: 'The website took too long or the connection dropped. Please press the button again.' };
  } finally {
    window.clearTimeout(timer);
  }
}

export type PictureResult = { ok: true; image: PulledImage | null } | { ok: false; expired: boolean };

/** Step 2: downloads one picture (full size) into the server's temporary buffer. */
export async function fetchPulledImage(lookupId: string, index: number): Promise<PictureResult> {
  try {
    const res = await fetch('/api/deals/fetch-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lookupId, index }),
    });
    if (res.status === 410) return { ok: false, expired: true };
    if (!res.ok) return { ok: false, expired: false };
    const data = (await res.json()) as { image?: PulledImage | null };
    return { ok: true, image: data.image ?? null };
  } catch {
    return { ok: false, expired: false };
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
