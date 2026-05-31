/**
 * Upload menu images to Cloudflare R2.
 *
 * Run: `pnpm menu:upload-images`
 *
 * Reads source images from `packages/core/prisma/data/menu-images/<slug>.{webp,jpg,jpeg,png}`,
 * converts to optimised WebP (max 1024px wide, q=80), and uploads to R2
 * under the key `menu/<slug>.webp`.
 *
 * After upload, optionally re-syncs `menu_items.image_url` so the public URL
 * matches the actual R2 object. Pass `--sync-db` to enable.
 *
 * R2 credentials come from env:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
 *   R2_BUCKET, R2_PUBLIC_URL
 *
 * Files smaller than 100 KB get a quality bump (no point shrinking already-
 * small images). Files missing get a clear warning, not an error — so the
 * script can run incrementally as new images are added.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argv } from 'node:process';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';

import { env, prisma } from '@smart-dining/core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SRC_DIR = resolve(REPO_ROOT, 'packages/core/prisma/data/menu-images');

const SUPPORTED_EXTS = new Set(['.webp', '.jpg', '.jpeg', '.png']);
const MAX_WIDTH_PX = 1024;
const WEBP_QUALITY = 80;
const TARGET_MAX_BYTES = 100 * 1024;

interface CliFlags {
  syncDb: boolean;
  dryRun: boolean;
  only: string | null;
}

function parseFlags(): CliFlags {
  const flags: CliFlags = { syncDb: false, dryRun: false, only: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sync-db') flags.syncDb = true;
    if (a === '--dry-run') flags.dryRun = true;
    if (a === '--only' && argv[i + 1]) {
      flags.only = argv[i + 1] ?? null;
      i += 1;
    }
  }
  return flags;
}

function makeR2Client(): S3Client {
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    throw new Error(
      'R2 credentials missing — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env',
    );
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
}

async function findSourceFiles(): Promise<Map<string, string>> {
  try {
    await stat(SRC_DIR);
  } catch {
    console.warn(`[upload] source dir not found: ${SRC_DIR}`);
    console.warn('[upload] create it and drop <slug>.{webp,jpg,jpeg,png} files inside.');
    return new Map();
  }
  const entries = await readdir(SRC_DIR);
  const out = new Map<string, string>();
  for (const entry of entries) {
    const ext = extname(entry).toLowerCase();
    if (!SUPPORTED_EXTS.has(ext)) continue;
    const slug = basename(entry, ext).toLowerCase();
    out.set(slug, resolve(SRC_DIR, entry));
  }
  return out;
}

async function transcodeToWebp(srcPath: string): Promise<Buffer> {
  const src = await readFile(srcPath);
  const meta = await sharp(src).metadata();
  let pipeline = sharp(src).rotate(); // honour EXIF
  if ((meta.width ?? 0) > MAX_WIDTH_PX) {
    pipeline = pipeline.resize({ width: MAX_WIDTH_PX, withoutEnlargement: true });
  }
  let buf = await pipeline.webp({ quality: WEBP_QUALITY, effort: 6 }).toBuffer();
  // If we overshot the soft target, drop quality once and re-encode.
  if (buf.length > TARGET_MAX_BYTES) {
    buf = await sharp(src)
      .rotate()
      .resize({ width: MAX_WIDTH_PX, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY - 15, effort: 6 })
      .toBuffer();
  }
  return buf;
}

async function uploadOne(
  client: S3Client,
  slug: string,
  buffer: Buffer,
  dryRun: boolean,
): Promise<string> {
  const key = `menu/${slug}.webp`;
  if (dryRun) {
    console.info(`[upload] DRY-RUN ${key} (${(buffer.length / 1024).toFixed(1)} KB)`);
  } else {
    await client.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    console.info(`[upload] ${key} (${(buffer.length / 1024).toFixed(1)} KB)`);
  }
  return `${env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
}

async function syncDb(slug: string, publicUrl: string, dryRun: boolean): Promise<void> {
  const action = dryRun ? '[dry-run] would update' : 'updated';
  if (dryRun) {
    console.info(`[upload] ${action} menu_items.image_url for ${slug}`);
    return;
  }
  await prisma.menuItem.update({ where: { slug }, data: { imageUrl: publicUrl } });
  console.info(`[upload] ${action} menu_items.image_url for ${slug}`);
}

async function main(): Promise<void> {
  const flags = parseFlags();
  const client = flags.dryRun ? null : makeR2Client();

  const sources = await findSourceFiles();
  if (sources.size === 0) {
    console.info('[upload] no source images found; nothing to do.');
    return;
  }

  const slugsInDb = await prisma.menuItem.findMany({ select: { slug: true } });
  const slugSet = new Set(slugsInDb.map((s) => s.slug));

  const toProcess = Array.from(sources.entries()).filter(([slug]) => {
    if (flags.only && slug !== flags.only) return false;
    if (!slugSet.has(slug)) {
      console.warn(`[upload] skipping ${slug} — no menu item with that slug`);
      return false;
    }
    return true;
  });

  console.info(
    `[upload] ${toProcess.length} of ${sources.size} source image(s) match a menu_item${
      flags.dryRun ? ' (DRY RUN)' : ''
    }`,
  );

  let uploaded = 0;
  let failed = 0;
  for (const [slug, path] of toProcess) {
    try {
      const buf = await transcodeToWebp(path);
      const publicUrl = await uploadOne(client!, slug, buf, flags.dryRun);
      if (flags.syncDb) await syncDb(slug, publicUrl, flags.dryRun);
      uploaded++;
    } catch (err) {
      failed++;
      console.error(
        `[upload] FAILED ${slug}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  console.info('');
  console.info(`[upload] done — ${uploaded} uploaded, ${failed} failed`);
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main().catch(async (err: unknown) => {
  console.error('[upload] CRASH:', err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
