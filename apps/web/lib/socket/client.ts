/**
 * Socket.io client singleton.
 *
 * One connection per browser session, keyed by (tableId, displayName). We
 * keep it lazy because we don't want to connect before we know who the user is.
 */

'use client';

import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;
let currentKey: string | null = null;

export function getSocket(tableId: string, displayName: string): Socket {
  const key = `${tableId}|${displayName}`;
  if (socket && currentKey === key) return socket;
  // Identity changed — tear down the prior connection cleanly.
  if (socket) socket.disconnect();

  const url = process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:4000';
  socket = io(url, {
    path: '/socket.io',
    transports: ['websocket'],
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5_000,
    auth: { tableId, displayName },
  });
  currentKey = key;
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    currentKey = null;
  }
}
