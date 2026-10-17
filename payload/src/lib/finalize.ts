export type FinalizeResult =
  | { ok: true; removedPictures: number }
  | { ok: false; rejected: boolean; error: string };

/** Last step of posting a deal: the server checks the pictures and then makes the deal public. */
export async function finalizeDeal(dealId: number | string): Promise<FinalizeResult> {
  try {
    const res = await fetch(`/api/deals/${dealId}/finalize`, { method: 'POST' });
    let data: { error?: string; rejected?: boolean; removedPictures?: number } | null = null;
    try { data = await res.json(); } catch { /* reply was not JSON */ }
    if (res.ok) return { ok: true, removedPictures: data?.removedPictures ?? 0 };
    return { ok: false, rejected: Boolean(data?.rejected), error: data?.error || 'The final check could not be completed.' };
  } catch {
    return { ok: false, rejected: false, error: 'Network error during the final check.' };
  }
}
