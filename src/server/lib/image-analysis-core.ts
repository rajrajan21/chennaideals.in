/**
 * Our own picture checks (no AI, no network). They work on a small raw RGB copy of the picture.
 * These are simple rules, not a perfect detector:
 *   - "adult" = a very large share of skin-coloured, textured pixels (typical of nude close-ups)
 *   - "blank" = one flat colour, "blurry" = hardly any sharp edges
 * Lighting, beige products and people photos can fool them, so an unsure result is only a warning.
 */

export type RawImage = { data: Uint8Array; width: number; height: number; channels: number };

export type PixelFindings = {
  skinRatio: number;
  texturedSkinRatio: number;
  centerSkinRatio: number;
  stdLum: number;
  lapVar: number;
};

function isSkin(r: number, g: number, b: number): boolean {
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  if (!(y > 50 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173)) return false;
  return r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 12 && Math.max(r, g, b) - Math.min(r, g, b) > 15;
}

export function analysePixels(img: RawImage): PixelFindings {
  const { data, width: w, height: h, channels: c } = img;
  const lum = new Float32Array(w * h);
  const skin = new Uint8Array(w * h);
  let sum = 0;
  let skinCount = 0;
  let centerSkin = 0;
  let centerTotal = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * c;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      lum[y * w + x] = l;
      sum += l;
      const s = isSkin(r, g, b);
      if (s) { skin[y * w + x] = 1; skinCount++; }
      if (x >= w * 0.2 && x < w * 0.8 && y >= h * 0.2 && y < h * 0.8) { centerTotal++; if (s) centerSkin++; }
    }
  }
  const n = w * h;
  const mean = sum / n;
  let varSum = 0;
  for (let i = 0; i < n; i++) varSum += (lum[i] - mean) ** 2;
  const stdLum = Math.sqrt(varSum / n);

  // Laplacian variance = how many sharp edges there are
  let lapSum = 0;
  let lapSq = 0;
  let lapN = 0;
  let texturedSkin = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = 4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - w] - lum[i + w];
      lapSum += lap;
      lapSq += lap * lap;
      lapN++;
      if (skin[i]) {
        const gx = lum[i + 1] - lum[i - 1];
        const gy = lum[i + w] - lum[i - w];
        if (Math.abs(gx) + Math.abs(gy) > 6) texturedSkin++;
      }
    }
  }
  const lapMean = lapN ? lapSum / lapN : 0;
  const lapVar = lapN ? lapSq / lapN - lapMean * lapMean : 0;
  return {
    skinRatio: skinCount / n,
    texturedSkinRatio: skinCount ? texturedSkin / skinCount : 0,
    centerSkinRatio: centerTotal ? centerSkin / centerTotal : 0,
    stdLum,
    lapVar,
  };
}

export type ImageMeta = { width: number | null; height: number | null; bytes: number };
export type ImageStatus = 'ok' | 'reject_content' | 'drop_quality';

export function judgeImage(meta: ImageMeta, f: PixelFindings | null): { status: ImageStatus; reasons: string[]; warn: string[] } {
  const reasons: string[] = [];
  const warn: string[] = [];
  // quality problems: the picture is simply not good enough to show
  if (meta.width !== null && meta.height !== null) {
    const short = Math.min(meta.width, meta.height);
    const long = Math.max(meta.width, meta.height);
    if (short < 200) reasons.push(`too small (${meta.width}x${meta.height})`);
    if (short > 0 && long / short > 4) reasons.push('odd shape (banner / strip)');
  }
  if (meta.bytes < 4_000) reasons.push('almost empty file');
  if (f) {
    if (f.stdLum < 6) reasons.push('blank or one flat colour');
    else if (f.lapVar < 6 && f.stdLum > 12) reasons.push('very blurry');
  }
  // content problems
  if (f) {
    const adult = f.skinRatio >= 0.55 && f.texturedSkinRatio >= 0.5 && f.centerSkinRatio >= 0.6;
    if (adult) return { status: 'reject_content', reasons: ['mostly skin-coloured picture (possible adult content)'], warn };
    if (f.skinRatio >= 0.4 && f.texturedSkinRatio >= 0.5) warn.push('picture contains a lot of skin-coloured area');
  }
  return { status: reasons.length > 0 ? 'drop_quality' : 'ok', reasons, warn };
}
