/**
 * Demo-mode kitchen simulator.
 *
 * In a real restaurant deployment, the kitchen tablet would advance order
 * status via a staff dashboard. For the demo, we simulate that workflow by
 * scheduling status transitions at realistic intervals after placement:
 *
 *   t+15s   → confirmed   ("kitchen accepted")
 *   t+45s   → preparing   ("cooking now")
 *   t+150s  → ready       ("coming to your table")
 *   t+240s  → delivered   ("enjoy")
 *
 * Each transition fires `OrderService.updateStatus`, which publishes
 * `order:status_changed` to `table:{tableId}` — so the live OrderTracker
 * page picks it up over the socket and updates in real time.
 *
 * Scheduled timers are tracked so a process restart cleans up cleanly;
 * the timers are also cleared if the order reaches a terminal state early.
 *
 * Production note: when we wire a real kitchen dashboard, this module
 * either stays as a fallback ("auto-progress if no human input in N
 * minutes") or is gated behind `isDemoMode`.
 */

import type { OrderStatus } from '@prisma/client';

import { isDemoMode } from '../../config/env.js';
import { childLogger } from '../../lib/logger.js';

const log = childLogger('order-auto-progression');

// Wall-clock offsets from placement → target status.
const SCHEDULE: Array<{ atSeconds: number; status: OrderStatus }> = [
  { atSeconds: 15, status: 'confirmed' },
  { atSeconds: 45, status: 'preparing' },
  { atSeconds: 150, status: 'ready' },
  { atSeconds: 240, status: 'delivered' },
];

const inflight = new Map<string, NodeJS.Timeout[]>();

/**
 * Schedule the auto-progression for an order. Idempotent — re-calling
 * for the same orderId cancels any pending transitions first. Safe to
 * call from the OrderService.place() best-effort tail.
 */
export function scheduleOrderProgression(orderId: string): void {
  if (!isDemoMode) {
    log.debug({ orderId }, 'demo mode off; skipping auto-progression');
    return;
  }

  cancelOrderProgression(orderId);

  const timers: NodeJS.Timeout[] = [];
  for (const step of SCHEDULE) {
    const handle = setTimeout(() => {
      void runStep(orderId, step.status);
    }, step.atSeconds * 1000);
    timers.push(handle);
  }
  inflight.set(orderId, timers);
  log.info(
    { orderId, steps: SCHEDULE.map((s) => `${s.status}@${s.atSeconds}s`) },
    'scheduled auto-progression',
  );
}

export function cancelOrderProgression(orderId: string): void {
  const existing = inflight.get(orderId);
  if (!existing) return;
  for (const t of existing) clearTimeout(t);
  inflight.delete(orderId);
}

async function runStep(orderId: string, status: OrderStatus): Promise<void> {
  try {
    // Lazy-import to avoid the singleton circularity with OrderService.
    const { orderService } = await import('./service.js');
    const fresh = await orderService.getById(orderId);
    // Don't move backwards if a human (or earlier step) already advanced.
    const order = STATUS_ORDER.indexOf(fresh.status);
    const target = STATUS_ORDER.indexOf(status);
    if (order < 0 || target <= order) {
      log.debug({ orderId, current: fresh.status, target: status }, 'skipping; already past');
      return;
    }
    if (fresh.status === 'cancelled') {
      log.debug({ orderId }, 'order cancelled; cancelling auto-progression');
      cancelOrderProgression(orderId);
      return;
    }
    await orderService.updateStatus(orderId, status);
    log.info({ orderId, status }, 'auto-progressed');
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err), orderId, status },
      'auto-progression step failed (non-fatal)',
    );
  }
}

const STATUS_ORDER: OrderStatus[] = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'delivered',
  'cancelled',
];

/** Cancel all pending transitions on process shutdown. */
export function cancelAllOrderProgression(): void {
  for (const orderId of inflight.keys()) cancelOrderProgression(orderId);
}
