/**
 * Prisma client singleton.
 *
 * Why a singleton in a monorepo: HMR in `next dev` will re-import modules
 * repeatedly. Without a global stash we'd leak connections every reload.
 * In production (serverless or persistent), the global cache is harmless —
 * only one process touches it.
 *
 * Query logging is wired through pino so it lives in the same stream as the
 * rest of the app's structured logs.
 */

import { PrismaClient, type Prisma } from '@prisma/client';

import { isDevelopment } from '../config/env.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger('prisma');

const logLevels: Prisma.LogLevel[] = isDevelopment
  ? ['query', 'warn', 'error']
  : ['warn', 'error'];

function buildClient(): PrismaClient {
  const client = new PrismaClient({
    log: logLevels.map((level) => ({ level, emit: 'event' as const })),
  });

  // Type narrowing on event-emit logs is verbose; cast at boundary.
  type LogEventClient = PrismaClient & {
    $on: (event: 'query' | 'warn' | 'error', cb: (e: unknown) => void) => void;
  };
  const c = client as unknown as LogEventClient;

  c.$on('query', (e: unknown) => {
    const ev = e as { query: string; duration: number; params?: string };
    if (ev.duration > 200) {
      log.warn({ query: ev.query, durationMs: ev.duration }, 'slow query');
    } else {
      log.debug({ query: ev.query, durationMs: ev.duration }, 'query');
    }
  });
  c.$on('warn', (e: unknown) => log.warn({ event: e }, 'prisma warn'));
  c.$on('error', (e: unknown) => log.error({ event: e }, 'prisma error'));

  return client;
}

declare global {
  // eslint-disable-next-line no-var
  var __PRISMA__: PrismaClient | undefined;
}

export const prisma: PrismaClient = globalThis.__PRISMA__ ?? buildClient();

if (isDevelopment) {
  globalThis.__PRISMA__ = prisma;
}

/**
 * Convenience for transactional service methods. Prisma's $transaction is
 * the right tool when multiple writes must commit together — order
 * placement is the canonical case.
 */
export type Tx = Prisma.TransactionClient;
