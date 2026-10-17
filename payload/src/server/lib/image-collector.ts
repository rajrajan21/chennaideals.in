/** Downloads the candidate pictures of a page (full size, with retries) into the temp store. */
import crypto from 'node:crypto';
import { safeGet } from './page-images.js';
import { sniffImage, imageSize, imageUrlVariants } from './image-tools.js';
import { putTmpImage } from './tmp-images.js';

export const MAX_PULLED_IMAGE_BYTES = 8 * 1024 * 1024;
const MIN_BYTES = 3_000;
const MIN_SIDE = 200;
const MAX_RETURNED = 8;
const CONCURRENCY = 4;

export type CollectedImage = { token: string; url: string; width: number | null; height: number | null; bytes: number };

type Got = { buf: Buffer; kind: { ext: string; mime: string }; dims: { width: number; height: number } | null };

async function tryDownload(url: string, referer: string): Promise<Got | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await safeGet(url, {
        maxBytes: MAX_PULLED_IMAGE_BYTES,
        accept: 'image/jpeg,image/png,image/webp,*/*;q=0.5',
        referer,
        timeoutMs: 9000,
      });
      if (res.status !== 200) return null; // a definite "no" - do not retry
      const kind = sniffImage(res.body);
      if (!kind || res.body.length < MIN_BYTES) return null;
      return { buf: res.body, kind, dims: imageSize(res.body, kind) };
    } catch {
      await new Promise((r) => setTimeout(r, 400)); // network hiccup: one more try
    }
  }
  return null;
}

async function bestVersion(candidate: string, referer: string): Promise<Got | null> {
  for (const variant of imageUrlVariants(candidate)) {
    const got = await tryDownload(variant, referer);
    if (got && (!got.dims || Math.min(got.dims.width, got.dims.height) >= MIN_SIDE)) return got;
  }
  return null;
}

export async function collectImages(
  candidates: string[],
  pageUrl: string,
  userId: string,
  budgetMs = 25_000,
): Promise<CollectedImage[]> {
  const deadline = Date.now() + budgetMs;
  const results: (Got | null)[] = new Array(candidates.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < candidates.length && Date.now() < deadline) {
      const i = next++;
      results[i] = await bestVersion(candidates[i], pageUrl);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, worker));

  const seen = new Set<string>();
  const ranked: { got: Got; score: number }[] = [];
  results.forEach((got, i) => {
    if (!got) return;
    const hash = crypto.createHash('sha1').update(got.buf).digest('hex');
    if (seen.has(hash)) return; // the same picture under two addresses
    seen.add(hash);
    const area = got.dims ? got.dims.width * got.dims.height : 250_000;
    ranked.push({ got, score: area * (i < 2 ? 1.3 : 1) });
  });
  ranked.sort((a, b) => b.score - a.score);

  const out: CollectedImage[] = [];
  for (const { got } of ranked.slice(0, MAX_RETURNED)) {
    const saved = await putTmpImage(userId, got.buf, got.kind, got.dims);
    out.push({ token: saved.token, url: `/api/tmp-images/${saved.token}`, width: saved.width, height: saved.height, bytes: saved.size });
  }
  return out;
}
