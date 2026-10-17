/**
 * Checks the pictures of a submitted deal.
 *   1. basic facts (size, shape, tiny/empty files)
 *   2. our own pixel checks (needs the "sharp" package; skipped if it is not installed)
 *   3. Google Gemini FREE tier looks at the pictures too, but only if GEMINI_API_KEY is set
 *      (pictures are then sent to Google; on the free tier Google may use them to improve its products)
 */
import fs from 'node:fs';
import path from 'node:path';
import { getSecret } from '#airo/secrets';
import { UPLOAD_DIR } from './uploads.js';
import { safeGet } from './page-images.js';
import { sniffImage, imageSize } from './image-tools.js';
import { analysePixels, judgeImage, type ImageStatus, type PixelFindings } from './image-analysis-core.js';

export type ImageToReview = { id: number | string; url: string };
export type ImageVerdict = { id: number | string; status: ImageStatus; reasons: string[]; warn: string[]; checkedBy: string[] };
export type ImageReview = { results: ImageVerdict[]; pixelChecks: boolean; geminiChecks: boolean };

async function loadBuffer(url: string): Promise<Buffer | null> {
  try {
    if (url.startsWith('/api/uploads/')) {
      const name = path.basename(url.slice('/api/uploads/'.length).split('?')[0]);
      if (!/^[A-Za-z0-9._-]+$/.test(name)) return null;
      return await fs.promises.readFile(path.join(UPLOAD_DIR, name));
    }
    if (/^https?:\/\//i.test(url)) {
      const res = await safeGet(url, { maxBytes: 8 * 1024 * 1024, accept: 'image/*', timeoutMs: 8000 });
      return res.status === 200 ? res.body : null;
    }
  } catch { /* unreadable: handled by the caller */ }
  return null;
}

type SharpFn = (input: Buffer) => {
  rotate: () => ReturnType<SharpFn>;
  resize: (w: number, h: number, o: { fit: string }) => ReturnType<SharpFn>;
  removeAlpha: () => ReturnType<SharpFn>;
  raw: () => ReturnType<SharpFn>;
  toBuffer: (o: { resolveWithObject: true }) => Promise<{ data: Buffer; info: { width: number; height: number; channels: number } }>;
};
let sharpFn: SharpFn | null | undefined;
async function getSharp(): Promise<SharpFn | null> {
  if (sharpFn !== undefined) return sharpFn;
  try {
    const name = 'sharp';
    const mod = (await import(/* @vite-ignore */ name)) as { default?: SharpFn };
    sharpFn = (mod.default ?? (mod as unknown as SharpFn)) as SharpFn;
  } catch {
    sharpFn = null;
    console.warn('Picture pixel checks are off: the "sharp" package is not installed (run npm.cmd install sharp).');
  }
  return sharpFn;
}

async function pixelFindings(buf: Buffer): Promise<PixelFindings | null> {
  const sharp = await getSharp();
  if (!sharp) return null;
  try {
    const { data, info } = await sharp(buf).rotate().resize(128, 128, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    return analysePixels({ data, width: info.width, height: info.height, channels: info.channels });
  } catch {
    return null;
  }
}

let gDay = '';
let gUsed = 0;
function geminiBudget(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== gDay) { gDay = today; gUsed = 0; }
  const cap = Number(getSecret('GEMINI_IMAGE_DAILY_LIMIT') ?? '100') || 100;
  if (gUsed >= cap) return false;
  gUsed++;
  return true;
}

type GeminiSay = { adult?: number; violence?: number; hate_or_illegal?: number; scam_text?: boolean; unusable?: boolean };
async function geminiLook(buf: Buffer, mime: string): Promise<GeminiSay | null> {
  const key = getSecret('GEMINI_API_KEY');
  if (!key || buf.length > 4_000_000 || !geminiBudget()) return null;
  const model = getSecret('GEMINI_MODEL') || 'gemini-3.1-flash-lite';
  const prompt =
    'You moderate product pictures for a shopping-deals website. Look at the picture and answer ONLY with JSON: ' +
    '{"adult":0-3,"violence":0-3,"hate_or_illegal":0-3,"scam_text":true|false,"unusable":true|false}. ' +
    'adult: 0 none, 1 swimwear/lingerie product shot, 2 sexually suggestive, 3 nudity or explicit. ' +
    'violence: 0 none, 3 gore or weapons being used. hate_or_illegal: hate symbols, drugs, illegal items. ' +
    'scam_text: the picture contains a phone number, WhatsApp/Telegram contact, or "pay/earn money" text. ' +
    'unusable: very blurry, unrelated meme, screenshot of chat, or otherwise not a product/offer picture.';
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: mime, data: buf.toString('base64') } }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) { console.error('Gemini picture check not accepted', { status: res.status }); return null; }
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    const m = /\{[\s\S]*\}/.exec(text);
    return m ? (JSON.parse(m[0]) as GeminiSay) : null;
  } catch (err) {
    console.error('Gemini picture check failed', { message: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export async function reviewImages(items: ImageToReview[]): Promise<ImageReview> {
  const results: ImageVerdict[] = [];
  let pixelChecks = false;
  let geminiChecks = false;
  for (const it of items.slice(0, 8)) {
    const checkedBy: string[] = ['basic'];
    const buf = await loadBuffer(it.url);
    const kind = buf ? sniffImage(buf) : null;
    if (!buf || !kind) {
      results.push({ id: it.id, status: 'drop_quality', reasons: ['could not be read as a JPG/PNG/WebP picture'], warn: [], checkedBy });
      continue;
    }
    const dims = imageSize(buf, kind);
    const f = await pixelFindings(buf);
    if (f) { checkedBy.push('pixels'); pixelChecks = true; }
    const j = judgeImage({ width: dims?.width ?? null, height: dims?.height ?? null, bytes: buf.length }, f);
    let { status } = j;
    const reasons = [...j.reasons];
    const warn = [...j.warn];

    const g = await geminiLook(buf, kind.mime);
    if (g) {
      checkedBy.push('gemini');
      geminiChecks = true;
      if ((g.adult ?? 0) >= 2) { status = 'reject_content'; reasons.push('AI: adult / suggestive content'); }
      else if ((g.violence ?? 0) >= 2) { status = 'reject_content'; reasons.push('AI: violent content'); }
      else if ((g.hate_or_illegal ?? 0) >= 2) { status = 'reject_content'; reasons.push('AI: hateful or illegal content'); }
      else {
        if (g.scam_text) warn.push('picture shows contact details or "earn money" style text');
        if (g.unusable && status === 'ok') { status = 'drop_quality'; reasons.push('AI: not a usable product picture'); }
        // the AI is more reliable than our colour rule: undo a pixel-only "adult" guess when the AI saw nothing
        if (status === 'reject_content' && (g.adult ?? 0) === 0 && reasons.every((r) => r.startsWith('mostly skin'))) {
          status = 'ok';
          reasons.length = 0;
          warn.push('skin-coloured picture, AI saw nothing wrong');
        }
      }
    }
    results.push({ id: it.id, status, reasons, warn, checkedBy });
  }
  return { results, pixelChecks, geminiChecks };
}
