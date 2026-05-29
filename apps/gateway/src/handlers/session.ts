/**
 * Session handlers — join the table room, announce arrival, observe departure.
 *
 * The room name convention is `table:{tableId}` so that the pub/sub bridge
 * in `index.ts` can use the same string when forwarding events from Redis.
 */

import type { Server as IOServer, Socket } from 'socket.io';

import { childLogger, redisPub, channels } from '@smart-dining/core';
import {
  SOCKET_EVENTS,
  type SessionUserJoined,
  type SessionUserLeft,
} from '@smart-dining/shared';

const log = childLogger('gateway-session');

export function attachSessionHandlers(io: IOServer, socket: Socket): void {
  const { tableId, displayName, sessionId } = socket.data;
  const room = `table:${tableId}`;

  void (async () => {
    await socket.join(room);
    const participantCount = (await io.in(room).fetchSockets()).length;

    const event: SessionUserJoined = {
      type: 'session:user_joined',
      tableId,
      sessionId,
      displayName,
      participantCount,
      timestamp: Date.now(),
    };
    // Broadcast to the room (and to this socket too, so the joiner sees the
    // up-to-date participant count immediately).
    io.to(room).emit(SOCKET_EVENTS.SESSION_USER_JOINED, event);
    // Republish through Redis so any other gateway nodes (if scaled out)
    // also see the join. The adapter already handles cross-node room emits,
    // but the pub/sub channel is also where the AI services listen for
    // group-coordination triggers (Phase 2).
    void redisPub.publish(channels.table(tableId), JSON.stringify(event));
    log.info({ tableId, displayName, participantCount }, 'user joined');
  })();

  socket.on('disconnect', () => {
    void (async () => {
      const remaining = (await io.in(room).fetchSockets()).length;
      const event: SessionUserLeft = {
        type: 'session:user_left',
        tableId,
        sessionId,
        displayName,
        participantCount: remaining,
        timestamp: Date.now(),
      };
      io.to(room).emit(SOCKET_EVENTS.SESSION_USER_LEFT, event);
      void redisPub.publish(channels.table(tableId), JSON.stringify(event));
      log.info({ tableId, displayName, remaining }, 'user left');
    })().catch((err) =>
      log.warn({ err: err instanceof Error ? err.message : String(err) }, 'leave handler failed'),
    );
  });
}
