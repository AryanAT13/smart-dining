/**
 * Socket.io gateway — bootstrap.
 *
 * Topology:
 *   - HTTP server on env.GATEWAY_PORT (Render expects PORT to be honoured)
 *   - GET /healthz returns 200 for liveness checks
 *   - Socket.io attached to the same HTTP server
 *   - Redis adapter for horizontal fan-out (multiple gateway nodes share rooms)
 *   - A separate Redis subscriber pulls events from `table:*` and `kitchen`
 *     channels — published by the Next.js API process — and emits to rooms
 *
 * This process is the only place in the system that knows about Socket.io
 * sockets. The API process never touches them; it talks via Redis only.
 */

import { createServer } from 'node:http';

import { createAdapter } from '@socket.io/redis-adapter';
import { Server as IOServer } from 'socket.io';

import { env } from '@smart-dining/core/config';
import { childLogger, redisPub, redisSub } from '@smart-dining/core';

import { attachCartHandlers } from './handlers/cart.js';
import { attachSessionHandlers } from './handlers/session.js';
import { authMiddleware } from './middleware/auth.js';
import { connectionRateLimiter } from './middleware/rateLimit.js';

const log = childLogger('gateway');

// ---------------------------------------------------------------------------
// HTTP server (Render needs a real HTTP listener — Socket.io's standalone
// server is fine but we own it so we can also serve /healthz).
// ---------------------------------------------------------------------------

const httpServer = createServer((req, res) => {
  if (req.url === '/healthz' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'gateway', timestamp: Date.now() }));
    return;
  }
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: false, error: { code: 'NOT_FOUND', message: 'Not found' } }));
});

// ---------------------------------------------------------------------------
// Socket.io with Redis adapter.
// ---------------------------------------------------------------------------

const io = new IOServer(httpServer, {
  cors: {
    origin: env.GATEWAY_CORS_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
  },
  pingTimeout: 20_000,
  pingInterval: 25_000,
  // Strict path so Render's load balancer can match cleanly.
  path: '/socket.io',
});

const sub = redisSub();
io.adapter(createAdapter(redisPub, sub));

io.use(connectionRateLimiter());
io.use(authMiddleware());

io.on('connection', (socket) => {
  log.debug({ socketId: socket.id, tableId: socket.data.tableId }, 'socket connected');
  attachSessionHandlers(io, socket);
  attachCartHandlers(io, socket);

  socket.on('disconnect', (reason) => {
    log.debug({ socketId: socket.id, reason }, 'socket disconnected');
  });
});

// ---------------------------------------------------------------------------
// Pub/Sub bridge — pull events from Redis channels and emit to rooms.
// The cart/order services PUBLISH to `table:{tableId}` and `kitchen`;
// the gateway subscribes here and translates Redis messages to socket emits.
// ---------------------------------------------------------------------------

// Dedicated subscriber for pubsub bridge (separate from the adapter's sub).
const pubsubSub = sub.duplicate();

(async () => {
  await pubsubSub.psubscribe('table:*');
  await pubsubSub.subscribe('kitchen');
  log.info('subscribed to table:* and kitchen channels');
})().catch((err) => {
  log.error({ err: err instanceof Error ? err.message : String(err) }, 'pubsub subscribe failed');
  process.exit(1);
});

pubsubSub.on('pmessage', (_pattern, channel, message) => {
  try {
    const payload = JSON.parse(message) as { type?: string; tableId?: string };
    if (!payload.type || !payload.tableId) {
      log.warn({ channel }, 'malformed pubsub message');
      return;
    }
    io.to(`table:${payload.tableId}`).emit(payload.type, payload);
  } catch (err) {
    log.warn({ channel, err: err instanceof Error ? err.message : String(err) }, 'pubsub parse failed');
  }
});

pubsubSub.on('message', (channel, message) => {
  if (channel !== 'kitchen') return;
  try {
    const payload = JSON.parse(message) as { type?: string };
    if (!payload.type) return;
    io.to('kitchen').emit(payload.type, payload);
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, 'kitchen parse failed');
  }
});

// ---------------------------------------------------------------------------
// Listen
// ---------------------------------------------------------------------------

const port = env.GATEWAY_PORT;
httpServer.listen(port, () => {
  log.info({ port, env: env.NODE_ENV }, 'gateway listening');
});

// Graceful shutdown — important on Render where SIGTERM precedes pod kill.
function shutdown(signal: NodeJS.Signals): void {
  log.info({ signal }, 'shutting down');
  io.close(() => {
    httpServer.close(() => {
      Promise.allSettled([pubsubSub.quit(), sub.quit(), redisPub.quit()]).finally(() => {
        log.info('shutdown complete');
        process.exit(0);
      });
    });
  });
  // Hard timeout: 10s.
  setTimeout(() => {
    log.warn('forced exit after shutdown timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
