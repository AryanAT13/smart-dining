/**
 * MenuService — the single read-path for menu data.
 *
 * Every consumer (REST routes, agents, the Order Validation Agent's stock
 * check) goes through this service. Direct Prisma reads of `menu_items` are
 * forbidden by convention; tests assert this.
 *
 * Caching strategy: menu is read-heavy and write-rare. We cache the full
 * menu list in memory with a 60s TTL. Mutation paths (none in Phase 1; admin
 * tools later) bust the cache via `invalidateCache()`.
 */

import type { MenuCategory, PrismaClient } from '@prisma/client';

import { prisma } from '../../db/client.js';
import { NotFoundError, StockUnavailableError } from '../../lib/errors.js';
import { childLogger } from '../../lib/logger.js';
import { classifyTimeOfDay, type TimeOfDay } from '../../lib/time.js';
import { embedQuery } from '../../llm/embeddings.js';

import { toMenuItemView } from './mappers.js';
import type {
  ComplementarySuggestion,
  MenuFilters,
  MenuItemView,
  SemanticMatch,
  SemanticSearchOptions,
} from './types.js';

const log = childLogger('menu-service');
const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  expiresAt: number;
  items: MenuItemView[];
}

let listCache: CacheEntry | null = null;

export class MenuService {
  constructor(private readonly db: PrismaClient = prisma) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async list(filters: MenuFilters = {}): Promise<MenuItemView[]> {
    const all = await this.getAllCached();
    return applyFilters(all, filters);
  }

  async getById(id: string): Promise<MenuItemView> {
    // Fast path through cache.
    const cached = listCache?.items.find((it) => it.id === id);
    if (cached) return cached;

    const row = await this.db.menuItem.findUnique({ where: { id } });
    if (!row) throw new NotFoundError('MenuItem', id);
    return toMenuItemView(row);
  }

  async getBySlug(slug: string): Promise<MenuItemView> {
    const cached = listCache?.items.find((it) => it.slug === slug);
    if (cached) return cached;

    const row = await this.db.menuItem.findUnique({ where: { slug } });
    if (!row) throw new NotFoundError('MenuItem', slug);
    return toMenuItemView(row);
  }

  /**
   * Text search via Postgres `ILIKE` on name + description + tags.
   * Cheap and good-enough for typed queries; semantic search handles intent.
   */
  async textSearch(query: string, filters: MenuFilters = {}): Promise<MenuItemView[]> {
    const trimmed = query.trim();
    if (trimmed.length === 0) return this.list(filters);

    const all = await this.getAllCached();
    const needle = trimmed.toLowerCase();
    const hits = all.filter((it) => {
      if (it.name.toLowerCase().includes(needle)) return true;
      if (it.description.toLowerCase().includes(needle)) return true;
      if (it.tags.some((t) => t.toLowerCase().includes(needle))) return true;
      return false;
    });
    return applyFilters(hits, filters);
  }

  /**
   * Semantic search via pgvector cosine distance.
   *
   * Performance note: we do filtering in SQL (allergens, availability) BEFORE
   * the ORDER BY <=> so the kNN scan operates on a smaller set. ivfflat
   * recall is the tradeoff; for our scale (≤500 items, lists=8) it's a wash.
   */
  async semanticSearch(query: string, opts: SemanticSearchOptions = {}): Promise<SemanticMatch[]> {
    const topK = opts.topK ?? 10;
    const vector = await embedQuery(query);
    const literal = `[${vector.join(',')}]`;

    // Build the WHERE clause dynamically but parameterised.
    const conditions: string[] = ['m.available = TRUE'];
    const params: unknown[] = [];

    if (opts.availableOnly === false) {
      conditions[0] = 'TRUE';
    }
    if (opts.categories && opts.categories.length > 0) {
      conditions.push(`m.category = ANY($${params.push(opts.categories)}::menu_category[])`);
    }
    if (opts.excludeAllergens && opts.excludeAllergens.length > 0) {
      conditions.push(`NOT (m.allergens && $${params.push(opts.excludeAllergens)}::text[])`);
    }
    if (opts.requireTags && opts.requireTags.length > 0) {
      conditions.push(`m.tags @> $${params.push(opts.requireTags)}::text[]`);
    }
    if (opts.excludeIds && opts.excludeIds.length > 0) {
      conditions.push(`m.id <> ALL($${params.push(opts.excludeIds)}::uuid[])`);
    }
    if (opts.maxCaloriesKcal !== undefined) {
      conditions.push(
        `(m.calories_kcal IS NULL OR m.calories_kcal <= $${params.push(opts.maxCaloriesKcal)})`,
      );
    }

    const vectorParam = params.push(literal);
    const limitParam = params.push(topK);

    // 1 - cosine_distance = similarity in [0, 1] for normalized vectors.
    const sql = `
      SELECT
        m.id, m.slug, m.name, m.category, m.price, m.description, m.image_url,
        m.tags, m.allergens, m.available, m.popular_score, m.calories_kcal,
        m.prep_time_minutes,
        1 - (e.embedding <=> $${vectorParam}::vector) AS similarity
      FROM menu_items m
      JOIN menu_item_embeddings e ON e.menu_item_id = m.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY e.embedding <=> $${vectorParam}::vector
      LIMIT $${limitParam}
    `;

    type Row = {
      id: string;
      slug: string;
      name: string;
      category: MenuCategory;
      price: string; // pg numeric → string in $queryRawUnsafe
      description: string;
      image_url: string;
      tags: string[];
      allergens: string[];
      available: boolean;
      popular_score: number;
      calories_kcal: number | null;
      prep_time_minutes: number | null;
      similarity: number;
    };

    const rows = await this.db.$queryRawUnsafe<Row[]>(sql, ...params);

    return rows.map((r) => ({
      item: {
        id: r.id,
        slug: r.slug,
        name: r.name,
        category: r.category,
        price: Number(r.price),
        description: r.description,
        imageUrl: r.image_url,
        tags: r.tags,
        allergens: r.allergens,
        available: r.available,
        popularScore: r.popular_score,
        caloriesKcal: r.calories_kcal,
        prepTimeMinutes: r.prep_time_minutes,
      },
      similarity: r.similarity,
    }));
  }

  /**
   * Top-N by popular_score with a soft time-of-day bias.
   *
   * For now the bias is a static category boost; in Phase 4 this becomes a
   * windowed velocity score computed from recent OrderItem rows.
   */
  async getPopular(limit = 5, timeOfDay?: TimeOfDay): Promise<MenuItemView[]> {
    const tod = timeOfDay ?? classifyTimeOfDay();
    const all = await this.getAllCached();
    const available = all.filter((it) => it.available);

    const scored = available.map((it) => ({
      it,
      score: it.popularScore + timeOfDayBoost(it, tod),
    }));
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map((s) => s.it);
  }

  /**
   * Complementary items — sourced from the curated `complements` graph
   * (seeded with co-occurrence weights). Returns sorted by weight desc.
   */
  async getComplementary(itemId: string, limit = 5): Promise<ComplementarySuggestion[]> {
    const edges = await this.db.complement.findMany({
      where: { sourceId: itemId, target: { available: true } },
      orderBy: { weight: 'desc' },
      take: limit,
      include: { target: true },
    });
    return edges.map((e) => ({ item: toMenuItemView(e.target), weight: e.weight }));
  }

  /**
   * Stock validation — used at add-to-cart and during order placement.
   * Throws StockUnavailableError if the item is gone; service code never
   * needs to interpret a boolean.
   */
  async validateStock(itemId: string): Promise<MenuItemView> {
    const item = await this.getById(itemId);
    if (!item.available) throw new StockUnavailableError(item.name, item.id);
    return item;
  }

  // -------------------------------------------------------------------------
  // Cache
  // -------------------------------------------------------------------------

  invalidateCache(): void {
    listCache = null;
  }

  private async getAllCached(): Promise<MenuItemView[]> {
    if (listCache && listCache.expiresAt > Date.now()) {
      return listCache.items;
    }
    const rows = await this.db.menuItem.findMany({ orderBy: { name: 'asc' } });
    const items = rows.map(toMenuItemView);
    listCache = { items, expiresAt: Date.now() + CACHE_TTL_MS };
    log.debug({ count: items.length }, 'menu cache populated');
    return items;
  }
}

// ---------------------------------------------------------------------------
// Filter helpers (pure functions; testable in isolation)
// ---------------------------------------------------------------------------

function applyFilters(items: MenuItemView[], filters: MenuFilters): MenuItemView[] {
  let out = items;
  if (filters.availableOnly !== false) out = out.filter((it) => it.available);
  if (filters.categories?.length) {
    const set = new Set(filters.categories);
    out = out.filter((it) => set.has(it.category));
  }
  if (filters.excludeAllergens?.length) {
    const exclude = new Set(filters.excludeAllergens);
    out = out.filter((it) => !it.allergens.some((a) => exclude.has(a)));
  }
  if (filters.requireTags?.length) {
    out = out.filter((it) => filters.requireTags!.every((t) => it.tags.includes(t)));
  }
  if (filters.excludeIds?.length) {
    const exclude = new Set(filters.excludeIds);
    out = out.filter((it) => !exclude.has(it.id));
  }
  if (filters.maxCaloriesKcal !== undefined) {
    const cap = filters.maxCaloriesKcal;
    out = out.filter((it) => it.caloriesKcal === null || it.caloriesKcal <= cap);
  }
  if (filters.preferTags?.length) {
    const prefer = new Set(filters.preferTags);
    out = [...out].sort((a, b) => {
      const aHits = a.tags.filter((t) => prefer.has(t)).length;
      const bHits = b.tags.filter((t) => prefer.has(t)).length;
      return bHits - aHits;
    });
  }
  return out;
}

function timeOfDayBoost(item: MenuItemView, tod: TimeOfDay): number {
  // Soft additive boost. Magnitude tuned so popular items still dominate
  // but tie-breakers go to the time-appropriate category.
  switch (tod) {
    case 'breakfast':
      if (item.category === 'beverages_hot') return 0.12;
      if (item.category === 'breads_rice') return 0.05;
      return 0;
    case 'lunch':
      if (item.category === 'mains_veg' || item.category === 'mains_non_veg') return 0.08;
      if (item.category === 'combos_deals') return 0.06;
      return 0;
    case 'evening':
      if (item.category === 'veg_starters' || item.category === 'non_veg_starters') return 0.1;
      if (item.category === 'beverages_hot' || item.category === 'beverages_cold') return 0.05;
      return 0;
    case 'dinner':
      if (item.category === 'mains_veg' || item.category === 'mains_non_veg') return 0.1;
      if (item.category === 'desserts') return 0.06;
      return 0;
    case 'late_night':
      if (item.category === 'desserts' || item.category === 'beverages_hot') return 0.04;
      return 0;
  }
}

// Default singleton — sufficient for the application; tests inject their own.
export const menuService = new MenuService();
