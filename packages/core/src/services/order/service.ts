/**
 * OrderService — transactional checkout.
 *
 * Invariants enforced by `place()`, inside a single Prisma transaction:
 *   1. OTP verify-token is consumed exactly once (OtpService).
 *   2. Session is `active` and not expired.
 *   3. Cart has at least one line.
 *   4. Every cart line's menu item is still `available`.
 *   5. Order row is created with snapshotted name/price/gst per line.
 *   6. Cart is emptied.
 *   7. Session is flipped to `ordered`.
 *
 * Side effects (outside the txn, best-effort):
 *   - Publish `order:placed` to `table:{tableId}` (diners see confirmation).
 *   - Publish `order:placed` to `kitchen` (kitchen dashboard sees the ticket).
 */

import type { OrderItem, OrderStatus, Prisma, PrismaClient } from '@prisma/client';

import { type OrderPlaced } from '@smart-dining/shared';

import { prisma } from '../../db/client.js';
import { channels, redisPub } from '../../db/redis.js';
import {
  NotFoundError,
  StockUnavailableError,
  ValidationError,
} from '../../lib/errors.js';
import { childLogger } from '../../lib/logger.js';
import { hashPhone } from '../../lib/crypto.js';
import { otpService, type OtpService } from '../otp/service.js';
import { SessionService } from '../session/service.js';

import type { OrderLineView, OrderView, PlaceOrderInput } from './types.js';

const log = childLogger('order-service');

export class OrderService {
  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly sessions: SessionService = new SessionService(prisma),
    private readonly otp: OtpService = otpService,
  ) {}

  async place(input: PlaceOrderInput): Promise<OrderView> {
    validatePlaceInput(input);
    await this.otp.consumeToken(input.otpToken, input.customerPhone);

    const phoneHash = hashPhone(input.customerPhone);

    const order = await this.db.$transaction(async (tx) => {
      const session = await tx.session.findUnique({ where: { id: input.sessionId } });
      if (!session) throw new NotFoundError('Session', input.sessionId);
      if (session.status !== 'active') {
        throw new ValidationError('Session is not active', { status: session.status });
      }
      if (session.expiresAt < new Date()) {
        throw new ValidationError('Session has expired');
      }

      const lines = await tx.cartItem.findMany({
        where: { sessionId: input.sessionId },
        include: { menuItem: true },
        orderBy: { createdAt: 'asc' },
      });
      if (lines.length === 0) {
        throw new ValidationError('Cannot place an empty order');
      }

      // Revalidate stock + compute totals from snapshotted server-side state.
      let subtotal = 0;
      let tax = 0;
      const orderItemPayloads: Prisma.OrderItemCreateManyOrderInput[] = [];

      for (const line of lines) {
        if (!line.menuItem.available) {
          throw new StockUnavailableError(line.menuItem.name, line.menuItem.id);
        }
        const price = line.menuItem.price.toNumber();
        const gstRate = line.menuItem.gstRate.toNumber();
        const lineSubtotal = price * line.quantity;
        const lineTax = lineSubtotal * gstRate;
        subtotal += lineSubtotal;
        tax += lineTax;

        orderItemPayloads.push({
          menuItemId: line.menuItem.id,
          nameSnapshot: line.menuItem.name,
          priceSnapshot: line.menuItem.price,
          gstRateSnapshot: line.menuItem.gstRate,
          quantity: line.quantity,
          specialInstructions: line.specialInstructions,
        });
      }

      subtotal = round2(subtotal);
      tax = round2(tax);
      const total = round2(subtotal + tax);
      const estimatedWaitMinutes = estimateWait(lines.map((l) => l.menuItem.prepTimeMinutes));

      const created = await tx.order.create({
        data: {
          sessionId: input.sessionId,
          customerName: input.customerName.trim(),
          customerPhone: input.customerPhone,
          customerPhoneHash: phoneHash,
          status: 'pending',
          subtotalAmount: subtotal,
          taxAmount: tax,
          totalAmount: total,
          estimatedWaitMinutes,
          items: { createMany: { data: orderItemPayloads } },
        },
        include: { items: true },
      });

      await tx.cartItem.deleteMany({ where: { sessionId: input.sessionId } });
      await tx.session.update({
        where: { id: input.sessionId },
        data: { status: 'ordered', closedAt: new Date() },
      });

      log.info(
        {
          orderId: created.id,
          sessionId: input.sessionId,
          tableId: session.tableId,
          subtotal,
          tax,
          total,
        },
        'order placed',
      );

      return { row: created, tableId: session.tableId };
    });

    // Best-effort kitchen + table notifications.
    const placedEvent: OrderPlaced = {
      type: 'order:placed',
      tableId: order.tableId,
      sessionId: input.sessionId,
      orderId: order.row.id,
      status: order.row.status,
      estimatedWaitMinutes: order.row.estimatedWaitMinutes,
      timestamp: Date.now(),
    };
    await Promise.all([
      this.publish(channels.table(order.tableId), placedEvent),
      this.publish(channels.kitchen(), placedEvent),
    ]);

    return toView(order.row, order.row.items);
  }

  async getById(orderId: string): Promise<OrderView> {
    const row = await this.db.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!row) throw new NotFoundError('Order', orderId);
    return toView(row, row.items);
  }

  async updateStatus(orderId: string, status: OrderStatus): Promise<OrderView> {
    const row = await this.db.order.update({
      where: { id: orderId },
      data: { status },
      include: { items: true, session: { select: { tableId: true } } },
    });
    await this.publish(channels.table(row.session.tableId), {
      type: 'order:status_changed',
      tableId: row.session.tableId,
      sessionId: row.sessionId,
      orderId: row.id,
      status: row.status,
      timestamp: Date.now(),
    });
    return toView(row, row.items);
  }

  private async publish(channel: string, payload: unknown): Promise<void> {
    try {
      await redisPub.publish(channel, JSON.stringify(payload));
    } catch (err) {
      log.warn(
        { err: err instanceof Error ? err.message : String(err), channel },
        'failed to publish order event',
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validatePlaceInput(input: PlaceOrderInput): void {
  if (!input.customerName.trim()) {
    throw new ValidationError('Customer name is required');
  }
  if (!/^\+?[1-9]\d{6,14}$/.test(input.customerPhone)) {
    throw new ValidationError('Customer phone must be E.164');
  }
  if (!input.otpToken) {
    throw new ValidationError('OTP verification token is required');
  }
}

function toView(
  row: {
    id: string;
    sessionId: string;
    status: OrderStatus;
    customerName: string;
    customerPhone: string;
    subtotalAmount: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    estimatedWaitMinutes: number | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  items: OrderItem[],
): OrderView {
  return {
    id: row.id,
    sessionId: row.sessionId,
    status: row.status,
    customerName: row.customerName,
    customerPhoneMasked: maskPhone(row.customerPhone),
    subtotalAmount: row.subtotalAmount.toNumber(),
    taxAmount: row.taxAmount.toNumber(),
    totalAmount: row.totalAmount.toNumber(),
    estimatedWaitMinutes: row.estimatedWaitMinutes,
    items: items.map(toLineView),
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toLineView(it: OrderItem): OrderLineView {
  const price = it.priceSnapshot.toNumber();
  const subtotal = price * it.quantity;
  const tax = subtotal * it.gstRateSnapshot.toNumber();
  return {
    menuItemId: it.menuItemId,
    name: it.nameSnapshot,
    price,
    quantity: it.quantity,
    lineSubtotal: round2(subtotal),
    lineTax: round2(tax),
    specialInstructions: it.specialInstructions,
  };
}

function maskPhone(phone: string): string {
  if (phone.length <= 4) return '****';
  return `${'*'.repeat(phone.length - 4)}${phone.slice(-4)}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Estimate wait by taking the max prep time across all lines plus a small
 * batching overhead. Returns null if no item declared a prep time.
 */
function estimateWait(prepTimes: (number | null)[]): number | null {
  const values = prepTimes.filter((t): t is number => t !== null);
  if (values.length === 0) return null;
  const maxPrep = Math.max(...values);
  const batchOverhead = Math.min(8, Math.max(2, values.length));
  return maxPrep + batchOverhead;
}

export const orderService = new OrderService();
