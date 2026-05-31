/**
 * Session handlers — join the table room, announce arrival, observe departure.
 *
 * The room name convention is `table:{tableId}` so that the pub/sub bridge
 * in `index.ts` can use the same string when forwarding events from Redis.
 *
 * On every new connection, the joining socket also receives a snapshot of
 * every OTHER socket already in the room — so a diner who joins second
 * (or third, …) sees the avatars of the diners who joined before them.
 * Without this, only the join broadcast at-arrival was visible, and prior
 * joiners stayed invisible.
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
  const { tableId, sessionId } = socket.data;
  let { displayName } = socket.data;
  const room = `table:${tableId}`;

  void (async () => {
    // 1. Replay existing participants to the new socket BEFORE we join, so
    //    they appear in the group banner immediately.
    const existingSockets = await io.in(room).fetchSockets();
    for (const other of existingSockets) {
      if (other.id === socket.id) continue;
      const otherName = (other.data as { displayName?: string }).displayName ?? 'Guest';
      const replay: SessionUserJoined = {
        type: 'session:user_joined',
        tableId,
        sessionId,
        displayName: otherName,
        participantCount: existingSockets.length + 1, // include ourselves
        timestamp:
          (other.data as { joinedAt?: number }).joinedAt ?? Date.now() - 1,
      };
      socket.emit(SOCKET_EVENTS.SESSION_USER_JOINED, replay);
    }

    // 1b. Dedup displayName against existing diners. Same browser, two
    //     tabs, same localStorage → both sockets arrive as "Priya". To
    //     keep them distinct in the banner and the cart attribution, we
    //     suffix collisions with " (2)", " (3)", … . The server-side
    //     suffix is the source of truth from this point on.
    const existingNames = new Set(
      existingSockets
        .filter((s) => s.id !== socket.id)
        .map((s) => (s.data as { displayName?: string }).displayName)
        .filter((n): n is string => Boolean(n)),
    );
    if (existingNames.has(displayName)) {
      let suffix = 2;
      while (existingNames.has(`${displayName} (${suffix})`)) suffix++;
      const original = displayName;
      displayName = `${original} (${suffix})`;
      socket.data.displayName = displayName;
      log.info({ tableId, original, deduped: displayName }, 'displayName deduped');
      // Tell the client what we renamed them to so it can update its UI.
      socket.emit('session:rename', { displayName });
    }

    // 2. Stamp our own join time and join the room.
    socket.data.joinedAt = Date.now();
    await socket.join(room);

    // 3. Broadcast OUR join to the whole room (including ourselves).
    const allSockets = await io.in(room).fetchSockets();
    const participantCount = allSockets.length;
    const event: SessionUserJoined = {
      type: 'session:user_joined',
      tableId,
      sessionId,
      displayName,
      participantCount,
      timestamp: Date.now(),
    };
    io.to(room).emit(SOCKET_EVENTS.SESSION_USER_JOINED, event);
    void redisPub.publish(channels.table(tableId), JSON.stringify(event));

    log.info(
      { tableId, displayName, participantCount, replayed: existingSockets.length },
      'user joined; snapshot replayed',
    );

    // 4. Group Coordinator greeting (spec §3.1): when a SECOND-or-later
    //    diner joins, fire the agent to say hello and offer crowd-pleasers
    //    given the existing cart. Fire-and-forget; failures must not
    //    affect the socket session.
    if (participantCount >= 2) {
      const participantNames = allSockets
        .map((s) => (s.data as { displayName?: string }).displayName)
        .filter((n): n is string => Boolean(n));
      void (async () => {
        const { greetNewJoiner } = await import('@smart-dining/core');
        await greetNewJoiner({
          sessionId,
          tableId,
          newJoinerName: displayName,
          participantNames,
        });
      })();
    }
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
