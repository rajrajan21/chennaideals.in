/** One small helper for asking the FREE Gemini API a question. Returns null when no key / quota / error. */
import { getSecret } from '#airo/secrets';

let day = '';
let used = 0;
function underCap(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; used = 0; }
  const cap = Number(getSecret('GEMINI_DAILY_LIMIT') ?? '200') || 200;
  if (used >= cap) return false;
  used++;
  return true;
}

export function geminiConfigured(): boolean {
  return Boolean(getSecret('GEMINI_API_KEY'));
}

export type GeminiReply = { json: Record<string, unknown> | null; blocked: boolean };

export async function askGemini(parts: unknown[], timeoutMs = 20_000): Promise<GeminiReply | null> {
  const key = getSecret('GEMINI_API_KEY');
  if (!key || !underCap()) return null;
  const model = getSecret('GEMINI_MODEL') || 'gemini-3.1-flash-lite';
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) { console.error('Gemini review request not accepted', { status: res.status }); return null; }
    const data = (await res.json()) as {
      promptFeedback?: { blockReason?: string };
      candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
    };
    if (data.promptFeedback?.blockReason) return { json: null, blocked: true };
    const cand = data.candidates?.[0];
    if (cand?.finishReason === 'SAFETY' || cand?.finishReason === 'PROHIBITED_CONTENT') return { json: null, blocked: true };
    const text = (cand?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
    if (!text.startsWith('{')) return null;
    try { return { json: JSON.parse(text) as Record<string, unknown>, blocked: false }; } catch { return null; }
  } catch (err) {
    console.error('Gemini review request failed', { message: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
