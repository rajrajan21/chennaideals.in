/**
 * Short-lived store for pictures copied from a deal link.
 * They are downloaded ONCE, in full size, while the user is choosing, and kept here until the
 * deal is submitted (or they expire after 2 hours). Submitting then just moves the saved files,
 * so there is no second download that could fail.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR } from './uploads.js';

const TMP_DIR = path.join(UPLOAD_DIR, 'tmp');
const TTL_MS = 2 * 60 * 60 * 1000;
const TOKEN_RE = /^[a-f0-9]{32}$/;

type Meta = { userId: string; file: string; mime: string; ext: string; size: number; width: number | null; height: number | null; createdAt: number };
const store = new Map<string, Meta>();

fs.mkdirSync(TMP_DIR, { recursive: true });
// The list of tokens lives in memory, so files left from a previous run are unreachable: remove them.
for (const f of fs.readdirSync(TMP_DIR)) { try { fs.unlinkSync(path.join(TMP_DIR, f)); } catch { /* ignore */ } }

function drop(token: string): void {
  const m = store.get(token);
  store.delete(token);
  if (m) { try { fs.unlinkSync(m.file); } catch { /* already gone */ } }
}

export function sweepTmpImages(now = Date.now()): void {
  for (const [token, m] of store) if (now - m.createdAt > TTL_MS) drop(token);
}
setInterval(() => sweepTmpImages(), 10 * 60 * 1000).unref();

export function clearUserTmp(userId: string): void {
  for (const [token, m] of store) if (m.userId === userId) drop(token);
}

export async function putTmpImage(
  userId: string,
  buf: Buffer,
  kind: { ext: string; mime: string },
  dims: { width: number; height: number } | null,
): Promise<{ token: string; size: number; width: number | null; height: number | null }> {
  const token = crypto.randomBytes(16).toString('hex');
  const file = path.join(TMP_DIR, token + kind.ext);
  await fs.promises.writeFile(file, buf);
  store.set(token, { userId, file, mime: kind.mime, ext: kind.ext, size: buf.length, width: dims?.width ?? null, height: dims?.height ?? null, createdAt: Date.now() });
  return { token, size: buf.length, width: dims?.width ?? null, height: dims?.height ?? null };
}

export function getTmpImage(token: string, userId: string): Meta | null {
  if (!TOKEN_RE.test(token)) return null;
  const m = store.get(token);
  if (!m || m.userId !== userId) return null;
  if (Date.now() - m.createdAt > TTL_MS || !fs.existsSync(m.file)) { drop(token); return null; }
  return m;
}

/** Moves a saved picture into the uploads folder (ready for publishFile) and forgets the token. */
export async function takeTmpImage(
  token: string,
  userId: string,
): Promise<{ path: string; filename: string; mimetype: string; size: number } | null> {
  const m = getTmpImage(token, userId);
  if (!m) return null;
  const filename = crypto.randomBytes(16).toString('hex') + m.ext;
  const dest = path.join(UPLOAD_DIR, filename);
  await fs.promises.rename(m.file, dest);
  store.delete(token);
  return { path: dest, filename, mimetype: m.mime, size: m.size };
}
