/**
 * Generate PWA icons (PNG) from the master SVG.
 *
 * Run: `pnpm icons:generate`
 *
 * Output:
 *   apps/web/public/icons/icon-192.png
 *   apps/web/public/icons/icon-512.png
 *
 * Modern browsers happily consume the SVG directly via the manifest, but
 * iOS requires PNG. We commit both so the manifest works everywhere.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SVG_PATH = resolve(REPO_ROOT, 'apps/web/public/icons/zaika.svg');
const OUT_DIR = resolve(REPO_ROOT, 'apps/web/public/icons');

const SIZES = [192, 512] as const;

async function main(): Promise<void> {
  const svg = await readFile(SVG_PATH);
  for (const size of SIZES) {
    const out = resolve(OUT_DIR, `icon-${size}.png`);
    await sharp(svg)
      .resize(size, size, { fit: 'contain', background: { r: 233, g: 95, b: 46, alpha: 1 } })
      .png({ compressionLevel: 9 })
      .toFile(out);
    console.info(`[icons] wrote ${out}`);
  }
  // Also emit a favicon-ish 32x32 for browser tabs.
  const fav = resolve(OUT_DIR, 'icon-32.png');
  await sharp(svg).resize(32, 32).png({ compressionLevel: 9 }).toFile(fav);
  console.info(`[icons] wrote ${fav}`);

  // Write a 1024 master so future export targets can re-encode without
  // re-rasterising the SVG.
  const master = resolve(OUT_DIR, 'icon-1024.png');
  await sharp(svg).resize(1024, 1024).png({ compressionLevel: 9 }).toFile(master);
  console.info(`[icons] wrote ${master}`);
}

main().catch((err: unknown) => {
  console.error('[icons] FAILED:', err);
  process.exit(1);
});
