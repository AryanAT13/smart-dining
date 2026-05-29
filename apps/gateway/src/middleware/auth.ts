/**
 * Socket auth middleware.
 *
 * Diners aren't authenticated in the traditional sense — there's no login.
 * What we verify is that the `tableId` they claim corresponds to a live
 * Session in Redis. That's enough to grant fan-out membership to a room.
 *
 * Bad actor scenarios this defends against:
 *   - Joining `table:T999` from outside the restaurant to see another
 *     party's cart events. Mitigation: tableId must resolve to an active
 *     session that was created by a real QR scan.
 *   - Connection floods: handled separately by connectionRateLimiter.
 */

import type { Server as IOServer, Socket } from 'socket.io';

import { childLogger, keys, redis } from '@smart-dining/core';

const log = childLogger('gateway-auth');

declare module 'socket.io' {
  interface SocketData {
    tableId: string;
    displayName: string;
    sessionId: string;
  }
}

export function authMiddleware() {
  return async (
    socket: Socket,
    next: (err?: Error) => void,
  ): Promise<void> => {
    try {
      const tableIdRaw = String(socket.handshake.auth?.tableId ?? socket.handshake.query.tableId ?? '');
      const displayNameRaw = String(
        socket.handshake.auth?.displayName ?? socket.handshake.query.displayName ?? '',
      );
      const tableId = tableIdRaw.trim().toUpperCase();
      const displayName = displayNameRaw.trim().slice(0, 50);

      if (!/^[A-Z0-9-]{1,20}$/.test(tableId)) {
        return next(new Error('Invalid tableId'));
      }
      if (displayName.length === 0) {
        return next(new Error('displayName required'));
      }

      const sessionId = await redis.get(keys.sessionByTable(tableId));
      if (!sessionId) {
        log.warn({ tableId }, 'no active session for table; rejecting socket');
        return next(new Error('No active session for this table — please rescan the QR code.'));
      }

      socket.data.tableId = tableId;
      socket.data.displayName = displayName;
      socket.data.sessionId = sessionId;
      next();
    } catch (err) {
      log.error({ err: err instanceof Error ? err.message : String(err) }, 'auth middleware threw');
      next(new Error('Authentication failed'));
    }
  };
}

// Re-export for symmetry with handlers/.
export function _unused_io(_io: IOServer): void {}
