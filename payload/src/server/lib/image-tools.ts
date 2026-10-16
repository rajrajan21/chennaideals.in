/** Small helpers for recognising pictures and guessing a higher-resolution address. */

export type ImageKind = { ext: string; mime: string };

export function sniffImage(buf: Buffer): ImageKind | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: '.jpg', mime: 'image/jpeg' };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: '.png', mime: 'image/png' };
  if (buf.length > 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return { ext: '.webp', mime: 'image/webp' };
  return null;
}

export function imageSize(buf: Buffer, kind: ImageKind): { width: number; height: number } | null {
  try {
    if (kind.mime === 'image/png') {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (kind.mime === 'image/jpeg') {
      let i = 2;
      while (i + 9 < buf.length) {
        if (buf[i] !== 0xff) { i += 1; continue; }
        const marker = buf[i + 1];
        if (marker === 0xff) { i += 1; continue; }
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        i += 2 + buf.readUInt16BE(i + 2);
      }
      return null;
    }
    if (kind.mime === 'image/webp') {
      const chunk = buf.subarray(12, 16).toString('ascii');
      if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      if (chunk === 'VP8L') {
        const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
        return { width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
      }
      if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** Shops serve small thumbnails by default; these rules ask for the large version first. */
export function imageUrlVariants(u: string): string[] {
  const out: string[] = [];
  try {
    const host = new URL(u).hostname;
    let up: string | null = null;
    if (/media-amazon\.com|ssl-images-amazon\.com/i.test(host)) {
      up = u.replace(/\._[^/]*_\.(jpg|jpeg|png|webp)(\?.*)?$/i, '.$1');
    } else if (/flixcart\.com/i.test(host)) {
      up = u.replace(/\/image\/\d+\/\d+\//, '/image/832/832/');
    } else if (/myntassets\.com/i.test(host)) {
      up = u.replace(/h_\d+/, 'h_1440').replace(/w_\d+/, 'w_1080');
    } else {
      const shopify = u.replace(/([_-])\d{2,4}x\d{0,4}(\.(?:jpg|jpeg|png|webp))/i, (_m, _sep, ext: string) => ext);
      if (shopify !== u) up = shopify;
      else if (/[?&](?:w|width)=\d+/i.test(u)) up = u.replace(/([?&](?:w|width)=)\d+/i, (_m, p: string) => `${p}1600`);
    }
    if (up && up !== u) out.push(up);
  } catch {
    /* keep the original only */
  }
  out.push(u);
  return out;
}
