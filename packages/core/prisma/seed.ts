/**
 * Seed: menu items + embeddings + complement graph.
 *
 * Phase 0 ships the *structure* of the seed pipeline. The embedding call to
 * OpenAI and the ivfflat index creation land in Phase 1 alongside the
 * MenuService. Running this in Phase 0 will:
 *   - upsert all menu items from data/menu.json
 *   - upsert the complement graph
 *   - leave embeddings empty (logged warning)
 *
 * In Phase 1 the embedding pipeline activates and this becomes idempotent
 * end-to-end: seeded items with existing embeddings are not re-embedded
 * unless their description or name changed.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Data schema (mirrors data/menu.json)
// ---------------------------------------------------------------------------

const MenuCategoryEnum = z.enum([
  'veg_starters',
  'non_veg_starters',
  'mains_veg',
  'mains_non_veg',
  'breads_rice',
  'desserts',
  'beverages_hot',
  'beverages_cold',
  'combos_deals',
]);

const MenuItemSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1).max(120),
  category: MenuCategoryEnum,
  price: z.number().positive(),
  description: z.string().min(1).max(160),
  tags: z.array(z.string()).default([]),
  allergens: z.array(z.string()).default([]),
  /** Optional override; defaults to true. Set false to demo the greyed-out treatment. */
  available: z.boolean().default(true),
  popularScore: z.number().min(0).max(1).default(0),
  caloriesKcal: z.number().int().positive().optional(),
  prepTimeMinutes: z.number().int().positive().optional(),
  gstRate: z.number().nonnegative().max(0.5).default(0.05),
});

const ComplementSchema = z.object({
  source: z.string(),
  target: z.string(),
  weight: z.number().min(0).max(1).default(1),
});

const SeedDataSchema = z.object({
  restaurant: z.object({
    name: z.string(),
    tagline: z.string(),
    assistant: z.string(),
  }),
  items: z.array(MenuItemSchema).min(1),
  complementGraph: z.array(ComplementSchema).default([]),
});

type SeedData = z.infer<typeof SeedDataSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadMenuData(): SeedData {
  const path = resolve(__dirname, 'data/menu.json');
  const raw = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
  const parsed = SeedDataSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid menu.json: ${parsed.error.toString()}`);
  }
  return parsed.data;
}

function placeholderImageUrl(slug: string): string {
  // In Phase 1 we'll upload real WebP images to R2 and persist canonical URLs.
  // For now a deterministic placeholder keeps the schema NOT-NULL constraint happy.
  const publicBase = process.env['R2_PUBLIC_URL'] ?? 'http://localhost:3000/menu-images';
  return `${publicBase}/${slug}.webp`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const data = loadMenuData();

  console.info(`[seed] Restaurant: ${data.restaurant.name}`);
  console.info(`[seed] Menu items: ${data.items.length}`);
  console.info(`[seed] Complement edges: ${data.complementGraph.length}`);

  // Stage 1: upsert menu items, capturing slug→id mapping for the graph.
  const idBySlug = new Map<string, string>();
  for (const item of data.items) {
    const row = await prisma.menuItem.upsert({
      where: { slug: item.slug },
      create: {
        slug: item.slug,
        name: item.name,
        category: item.category,
        price: item.price,
        description: item.description,
        imageUrl: placeholderImageUrl(item.slug),
        tags: item.tags,
        allergens: item.allergens,
        available: item.available,
        popularScore: item.popularScore,
        caloriesKcal: item.caloriesKcal ?? null,
        prepTimeMinutes: item.prepTimeMinutes ?? null,
        gstRate: item.gstRate,
      },
      update: {
        name: item.name,
        category: item.category,
        price: item.price,
        description: item.description,
        imageUrl: placeholderImageUrl(item.slug),
        tags: item.tags,
        allergens: item.allergens,
        available: item.available,
        popularScore: item.popularScore,
        caloriesKcal: item.caloriesKcal ?? null,
        prepTimeMinutes: item.prepTimeMinutes ?? null,
        gstRate: item.gstRate,
      },
    });
    idBySlug.set(item.slug, row.id);
  }
  console.info(`[seed] Upserted ${idBySlug.size} menu items.`);

  // Stage 2: complement graph.
  let edgeCount = 0;
  for (const edge of data.complementGraph) {
    const sourceId = idBySlug.get(edge.source);
    const targetId = idBySlug.get(edge.target);
    if (!sourceId || !targetId) {
      console.warn(`[seed] Skipping edge ${edge.source}→${edge.target} (unknown slug)`);
      continue;
    }
    await prisma.complement.upsert({
      where: { sourceId_targetId: { sourceId, targetId } },
      create: { sourceId, targetId, weight: edge.weight },
      update: { weight: edge.weight },
    });
    edgeCount++;
  }
  console.info(`[seed] Upserted ${edgeCount} complement edges.`);

  // Stage 3: embeddings.
  if (!process.env['OPENAI_API_KEY'] || process.env['OPENAI_API_KEY'] === 'sk-dummy-key-for-now') {
    console.warn(
      '[seed] OPENAI_API_KEY not set (or placeholder) — skipping embeddings step.\n' +
        '       Set a real key and re-run seed to populate menu_item_embeddings.',
    );
  } else {
    // Dynamic import keeps the seed runnable in Phase 0 builds where the
    // llm module may not yet exist.
    const { refreshAllEmbeddings } = await import('../src/llm/embeddings.js');
    const stats = await refreshAllEmbeddings(prisma);
    console.info(`[seed] Embeddings: ${stats.embedded} embedded, ${stats.skipped} skipped, ${stats.failed} failed.`);
    console.info(`[seed] Estimated embedding cost: $${stats.estimatedCostUsd.toFixed(4)}`);
  }

  await prisma.$disconnect();
}

main().catch((err: unknown) => {
  console.error('[seed] FAILED:', err);
  process.exit(1);
});
