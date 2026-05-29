/**
 * Embeddings pipeline.
 *
 * Strategy:
 *   - Build a canonical "embed text" for each menu item that concatenates
 *     the name, description, category, and tags. This gives the embedding
 *     more signal than the description alone — searches on "spicy" still
 *     hit items where "spicy" is a tag, not in the description.
 *   - Batch in groups of 96 (well under the 2048-input limit; keeps each
 *     request fast and individually retryable).
 *   - Skip items whose embedding already exists for the SAME model — lets
 *     `pnpm db:seed` re-run cheaply.
 */

import type { Prisma, PrismaClient } from '@prisma/client';

import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import { childLogger } from '../lib/logger.js';

import { estimateCostUsd, openai, wrapOpenAiError } from './client.js';

const log = childLogger('embeddings');
const BATCH_SIZE = 96;

type MenuItemForEmbed = Pick<
  Prisma.MenuItemGetPayload<true>,
  'id' | 'name' | 'description' | 'category' | 'tags'
>;

/**
 * Compose the text we actually embed. Order matters: name first carries the
 * most weight in similarity, then descriptive cues.
 */
export function buildEmbedText(item: MenuItemForEmbed): string {
  const tagPart = item.tags.length > 0 ? ` Tags: ${item.tags.join(', ')}.` : '';
  return `${item.name}. Category: ${item.category}.${tagPart} ${item.description}`;
}

/**
 * Embed a single ad-hoc query (used by RAG at request time).
 */
export async function embedQuery(text: string): Promise<number[]> {
  try {
    const res = await openai.embeddings.create({
      model: env.EMBEDDING_MODEL,
      input: text,
    });
    const vec = res.data[0]?.embedding;
    if (!vec) throw new Error('embeddings.create returned no vector');
    return vec;
  } catch (err) {
    throw wrapOpenAiError(err, 'embedQuery');
  }
}

export interface RefreshStats {
  scanned: number;
  embedded: number;
  skipped: number;
  failed: number;
  estimatedCostUsd: number;
}

/**
 * Idempotent refresh — only embeds items missing an embedding for the
 * current model. Safe to run from the seed and from a future admin tool.
 */
export async function refreshAllEmbeddings(
  client: PrismaClient = prisma,
): Promise<RefreshStats> {
  const model = env.EMBEDDING_MODEL;
  const items = await client.menuItem.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      tags: true,
      embedding: { select: { model: true } },
    },
  });

  const todo = items.filter((it) => it.embedding?.model !== model);
  const stats: RefreshStats = {
    scanned: items.length,
    embedded: 0,
    skipped: items.length - todo.length,
    failed: 0,
    estimatedCostUsd: 0,
  };

  if (todo.length === 0) {
    log.info({ model, items: items.length }, 'embeddings already current');
    return stats;
  }

  log.info({ model, toEmbed: todo.length, alreadyCurrent: stats.skipped }, 'starting embed batch');

  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const slice = todo.slice(i, i + BATCH_SIZE);
    const inputs = slice.map((it) =>
      buildEmbedText({
        id: it.id,
        name: it.name,
        description: it.description,
        category: it.category,
        tags: it.tags,
      }),
    );

    try {
      const res = await openai.embeddings.create({ model, input: inputs });

      // Write each embedding via raw SQL because Prisma can't bind `vector`.
      // Parameterised, not string-concatenated — vectors come in as text.
      for (let j = 0; j < slice.length; j++) {
        const item = slice[j];
        const embedding = res.data[j]?.embedding;
        if (!item || !embedding) {
          stats.failed += 1;
          log.error({ index: i + j }, 'missing embedding in response');
          continue;
        }
        const literal = `[${embedding.join(',')}]`;
        await client.$executeRaw`
          INSERT INTO menu_item_embeddings (menu_item_id, embedding, model, created_at)
          VALUES (${item.id}::uuid, ${literal}::vector, ${model}, NOW())
          ON CONFLICT (menu_item_id)
          DO UPDATE SET embedding = EXCLUDED.embedding, model = EXCLUDED.model, created_at = NOW()
        `;
        stats.embedded += 1;
      }

      stats.estimatedCostUsd += estimateCostUsd(model, res.usage?.total_tokens ?? 0, 0);
    } catch (err) {
      stats.failed += slice.length;
      log.error(
        { err: err instanceof Error ? err.message : String(err), batchStart: i },
        'embed batch failed',
      );
    }
  }

  log.info({ stats }, 'embeddings refresh complete');
  return stats;
}
