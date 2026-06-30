// Cloudflare R2 (S3-compatible) write helper for admin cover uploads. Lazily
// builds the S3 client from config.r2; r2Configured() lets routes fail closed
// (503) until the R2_* env keys are set on the server.
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config.js';

let client = null;

export function r2Configured() {
  const r = config.r2;
  return !!(r.endpoint && r.accessKeyId && r.secretAccessKey && r.bucket);
}

function getClient() {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: config.r2.endpoint,
      credentials: { accessKeyId: config.r2.accessKeyId, secretAccessKey: config.r2.secretAccessKey },
    });
  }
  return client;
}

// PUT an object to R2. Covers are immutable-per-version (the ?v= query busts the
// cache), so we keep the long immutable cache-control the CDN already serves.
export async function r2Put(key, body, contentType) {
  await getClient().send(new PutObjectCommand({
    Bucket: config.r2.bucket,
    Key: key,
    Body: body,
    ContentType: contentType || 'image/png',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
}
