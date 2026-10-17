/**
 * The AI search engines the Deal Hunter can use. Each one is OFF until its key is in .env.local:
 *   GEMINI_API_KEY      (free tier)           optional GEMINI_SEARCH_MODEL
 *   PERPLEXITY_API_KEY  (paid, small credit)  optional PERPLEXITY_MODEL   (default sonar)
 *   OPENAI_API_KEY      (pay per use)         optional OPENAI_MODEL       (default gpt-4o-mini)
 *   ANTHROPIC_API_KEY   (pay per use)         optional ANTHROPIC_MODEL    (default claude-haiku-5-5)
 * Every engine here searches the live web. Their answers are only LEADS - the Hunter re-checks the
 * prices itself, so a wrong answer cannot reach your site without you seeing it.
 */
import { getSecret } from '#airo/secrets';

export type Provider = 'gemini' | 'perplexity' | 'openai' | 'claude';

export const PROVIDERS: { id: Provider; label: string; keyName: string; cost: string }[] = [
  { id: 'gemini', label: 'Gemini (Google)', keyName: 'GEMINI_API_KEY', cost: 'free tier' },
  { id: 'perplexity', label: 'Perplexity', keyName: 'PERPLEXITY_API_KEY', cost: 'paid API (Pro plan includes a small monthly credit)' },
  { id: 'openai', label: 'ChatGPT (OpenAI)', keyName: 'OPENAI_API_KEY', cost: 'paid API (a ChatGPT Plus plan does not include API use)' },
  { id: 'claude', label: 'Claude (Anthropic)', keyName: 'ANTHROPIC_API_KEY', cost: 'paid API (a Claude Pro plan does not include API use)' },
];

export function providerReady(id: Provider): boolean {
  const p = PROVIDERS.find((x) => x.id === id);
  return Boolean(p && getSecret(p.keyName));
}

export function providerStatus(): { id: Provider; label: string; ready: boolean; cost: string; keyName: string }[] {
  return PROVIDERS.map((p) => ({ id: p.id, label: p.label, ready: providerReady(p.id), cost: p.cost, keyName: p.keyName }));
}

export type SearchOptions = { social?: boolean; days?: number };
export type SearchResult = { text: string | null; note: string | null; citations: string[] };

const lastCall = new Map<Provider, number>();
const dayCount = new Map<string, number>();
const GAP_MS: Record<Provider, number> = { gemini: 7_000, perplexity: 1_500, openai: 2_000, claude: 3_000 };
const DEFAULT_CAP: Record<Provider, number> = { gemini: 150, perplexity: 60, openai: 40, claude: 30 };

function underCap(id: Provider): boolean {
  const key = id + new Date().toISOString().slice(0, 10);
  const n = dayCount.get(key) ?? 0;
  const cap = Number(getSecret(`${id.toUpperCase()}_DAILY_LIMIT`) ?? '') || DEFAULT_CAP[id];
  if (n >= cap) return false;
  dayCount.set(key, n + 1);
  return true;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function post(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<{ status: number; json: unknown; message: string }> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
  let json: unknown = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  const err = (json as { error?: { message?: string } | string } | null)?.error;
  const message = typeof err === 'string' ? err : err?.message ?? '';
  return { status: res.status, json, message: message.slice(0, 160) };
}

type Obj = Record<string, unknown>;

async function callOnce(id: Provider, prompt: string, o: SearchOptions): Promise<{ status: number; text: string; citations: string[]; message: string }> {
  if (id === 'gemini') {
    const key = getSecret('GEMINI_API_KEY') ?? '';
    const models = Array.from(new Set([getSecret('GEMINI_SEARCH_MODEL'), getSecret('GEMINI_MODEL'), 'gemini-2.5-flash', 'gemini-2.5-flash-lite'].filter((m): m is string => Boolean(m))));
    let last = { status: 0, text: '', citations: [] as string[], message: '' };
    for (const model of models) {
      const r = await post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { 'x-goog-api-key': key },
        { contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.2 } }, 90_000);
      const data = r.json as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
      const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
      last = { status: r.status, text, citations: [], message: r.message };
      if (r.status === 200 && text) return last;
      if (r.status === 429) return last; // same quota for every model on this key: wait and retry instead
    }
    return last;
  }
  if (id === 'perplexity') {
    const key = getSecret('PERPLEXITY_API_KEY') ?? '';
    const body: Obj = { model: getSecret('PERPLEXITY_MODEL') || 'sonar', messages: [{ role: 'user', content: prompt }], search_recency_filter: (o.days ?? 30) <= 1 ? 'day' : (o.days ?? 30) <= 7 ? 'week' : 'month' };
    if (o.social) body.search_domain_filter = ['facebook.com', 'instagram.com', 'x.com', 'justdial.com'];
    const r = await post('https://api.perplexity.ai/chat/completions', { Authorization: `Bearer ${key}` }, body, 90_000);
    const d = r.json as { choices?: { message?: { content?: string } }[]; citations?: string[] } | null;
    return { status: r.status, text: d?.choices?.[0]?.message?.content ?? '', citations: d?.citations ?? [], message: r.message };
  }
  if (id === 'openai') {
    const key = getSecret('OPENAI_API_KEY') ?? '';
    const r = await post('https://api.openai.com/v1/responses', { Authorization: `Bearer ${key}` },
      { model: getSecret('OPENAI_MODEL') || 'gpt-4o-mini', tools: [{ type: 'web_search_preview' }], input: prompt }, 120_000);
    const d = r.json as { output?: { type?: string; content?: { type?: string; text?: string }[] }[] } | null;
    const text = (d?.output ?? []).filter((x) => x.type === 'message').flatMap((x) => x.content ?? []).filter((c) => c.type === 'output_text').map((c) => c.text ?? '').join('');
    return { status: r.status, text, citations: [], message: r.message };
  }
  const key = getSecret('ANTHROPIC_API_KEY') ?? '';
  const r = await post('https://api.anthropic.com/v1/messages', { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    { model: getSecret('ANTHROPIC_MODEL') || 'claude-haiku-5-5', max_tokens: 4096, tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }], messages: [{ role: 'user', content: prompt }] }, 120_000);
  const d = r.json as { content?: { type?: string; text?: string }[] } | null;
  return { status: r.status, text: (d?.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join(''), citations: [], message: r.message };
}

/** One web-search question to one engine, with spacing, retries on rate limits and a plain-language failure note. */
export async function searchWith(id: Provider, prompt: string, o: SearchOptions = {}): Promise<SearchResult> {
  const label = PROVIDERS.find((p) => p.id === id)?.label ?? id;
  if (!providerReady(id)) return { text: null, note: `${label}: no key set`, citations: [] };
  if (!underCap(id)) return { text: null, note: `${label}: today's limit reached (change ${id.toUpperCase()}_DAILY_LIMIT)`, citations: [] };
  let lastNote = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = (lastCall.get(id) ?? 0) + GAP_MS[id] - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall.set(id, Date.now());
    try {
      const r = await callOnce(id, prompt, o);
      if (r.status === 200 && r.text) return { text: r.text, note: null, citations: r.citations };
      lastNote = `${label}: HTTP ${r.status}${r.message ? ' - ' + r.message : ''}`;
      if (r.status === 429 || r.status === 503 || r.status === 529) { await sleep(Math.min(60_000, 15_000 * (attempt + 1))); continue; }
      if (r.status === 401 || r.status === 403) return { text: null, note: `${lastNote} (check the key in .env.local)`, citations: [] };
      if (r.status === 200) return { text: null, note: `${label}: empty answer`, citations: [] };
      return { text: null, note: lastNote, citations: [] };
    } catch (err) {
      lastNote = `${label}: ${err instanceof Error ? err.message : 'failed'}`;
    }
  }
  return { text: null, note: `${lastNote} (rate limit - try again later or pick another AI)`, citations: [] };
}
