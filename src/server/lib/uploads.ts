import path from 'node:path';
import fs from 'node:fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSecret } from '#airo/secrets';

export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const MAX_IMAGES = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

// Set to false later to let every signed-in user upload a video.
export const VIDEO_ADMIN_ONLY = true;

export const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
export const VIDEO_TYPES: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
};

type R2Target = { client: S3Client; bucket: string; publicUrl: string };
let r2: R2Target | null | undefined;

function getR2(): R2Target | null {
  if (r2 !== undefined) return r2;
  const accountId = getSecret('R2_ACCOUNT_ID');
  const accessKeyId = getSecret('R2_ACCESS_KEY_ID');
  const secretAccessKey = getSecret('R2_SECRET_ACCESS_KEY');
  const bucket = getSecret('R2_BUCKET');
  const publicUrl = getSecret('R2_PUBLIC_URL');
  if (accountId && accessKeyId && secretAccessKey && bucket && publicUrl) {
    r2 = {
      client: new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      }),
      bucket,
      publicUrl,
    };
  } else {
    r2 = null;
  }
  return r2;
}

/** Stores an uploaded file and returns the URL the browser should use. */
export async function publishFile(file: {
  path: string; filename: string; mimetype: string; size: number;
}): Promise<string> {
  const target = getR2();
  if (!target) return `/api/uploads/${file.filename}`; // local fallback

  await target.client.send(new PutObjectCommand({
    Bucket: target.bucket,
    Key: file.filename,
    Body: fs.createReadStream(file.path),
    ContentType: file.mimetype,
    ContentLength: file.size,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  await fs.promises.unlink(file.path).catch(() => {});
  return `${target.publicUrl.replace(/\/+$/, '')}/${file.filename}`;
}