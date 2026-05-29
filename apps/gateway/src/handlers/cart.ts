/**
 * Cart handler — currently a noop attachment point.
 *
 * Cart mutations come in via the HTTP API (Next.js Route Handlers) which
 * writes the DB and publishes to Redis. The pub/sub bridge in `index.ts`
 * picks those messages up and emits them to the table room.
 *
 * This module exists so future client-initiated cart actions (e.g. a "type
 * special instruction" event for live collaboration) have an obvious home.
 * Today it just registers a typed acknowledgement for ping/pong on the
 * `cart:ping` channel — useful for the UI's connection health indicator.
 */

import type { Server as IOServer, Socket } from 'socket.io';

import { childLogger } from '@smart-dining/core';

const log = childLogger('gateway-cart');

export function attachCartHandlers(_io: IOServer, socket: Socket): void {
  socket.on('cart:ping', (ack?: (response: { ok: true; timestamp: number }) => void) => {
    if (typeof ack === 'function') ack({ ok: true, timestamp: Date.now() });
    log.debug({ socketId: socket.id }, 'cart:ping');
  });
}
