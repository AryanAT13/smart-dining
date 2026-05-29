/**
 * CartService — shared, per-session, real-time cart.
 *
 * Source of truth: Postgres `cart_items`. Redis holds nothing durable for
 * carts; we publish events on `table:{tableId}` after every mutation so
 * the gateway can broadcast to connected clients.
 *
 * Conflict policy: last-write-wins with an `expectedVersion` precondition
 * on updates. If the precondition fails, we throw `CartVersionMismatchError`
 * so the UI can render a toast and refresh. See ADR-003.
 *
 * Why the events go through Redis pub/sub instead of being emitted directly
 * by the API process: the API runs on Vercel serverless and has no socket;
 * the gateway runs on Render and owns the sockets. Redis is the bridge.
 */

import type { CartItem, Prisma, PrismaClient } from '@prisma/client';

import {
  type CartItemAdded,
  type CartItemRemoved,
  type CartItemUpdated,
  type ServerEvent,
} from '@smart-dining/shared';

import { channels, redisPub } from '../../db/redis.js';
import { prisma } from '../../db/client.js';
import {
  CartVersionMismatchError,
  NotFoundError,
  StockUnavailableError,
  ValidationError,
} from '../../lib/errors.js';
import { childLogger } from '../../lib/logger.js';
import { MenuService } from '../menu/service.js';
import { toMenuItemView } from '../menu/mappers.js';
import { SessionService } from '../session/service.js';

import type { AddItemInput, CartLine, CartView, UpdateItemInput } from './types.js';

const log = childLogger('cart-service');

export class CartService {
  constructor(
    private readonly db: PrismaClient = prisma,
    private readonly menu: MenuService = new MenuService(prisma),
    private readonly sessions: SessionService = new SessionService(prisma),
  ) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async getCart(sessionId: string): Promise<CartView> {
    const session = await this.sessions.getById(sessionId);
    const rows = await this.db.cartItem.findMany({
      where: { sessionId },
      include: { menuItem: true },
      orderBy: { createdAt: 'asc' },
    });

    const items: CartLine[] = rows.map((row) => {
      const item = toMenuItemView(row.menuItem);
      const subtotal = item.price * row.quantity;
      const tax = subtotal * row.menuItem.gstRate.toNumber();
      return {
        id: row.id,
        menuItem: item,
        quantity: row.quantity,
        specialInstructions: row.specialInstructions,
        addedBy: row.addedBy,
        version: row.version,
        lineSubtotal: round2(subtotal),
        lineTax: round2(tax),
        lineTotal: round2(subtotal + tax),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });

    return aggregateCart(session.id, session.tableId, items);
  }

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  async addItem(input: AddItemInput): Promise<{ cart: CartView; addedLine: CartLine }> {
    if (input.quantity <= 0 || input.quantity > 20) {
      throw new ValidationError('Quantity out of range', { quantity: input.quantity });
    }

    const session = await this.sessions.assertActive(input.sessionId);
    const menuItem = await this.menu.validateStock(input.menuItemId);

    // Merge behaviour: if the same menuItem+addedBy+identical instructions
    // already exists in the cart, bump quantity rather than creating a new line.
    // This is what users expect when they tap "Add" twice.
    const existing = await this.db.cartItem.findFirst({
      where: {
        sessionId: input.sessionId,
        menuItemId: input.menuItemId,
        addedBy: input.addedBy,
        specialInstructions: input.specialInstructions ?? null,
      },
    });

    let row: CartItem;
    if (existing) {
      row = await this.db.cartItem.update({
        where: { id: existing.id },
        data: {
          quantity: { increment: input.quantity },
          version: { increment: 1 },
        },
      });
    } else {
      row = await this.db.cartItem.create({
        data: {
          sessionId: input.sessionId,
          menuItemId: input.menuItemId,
          quantity: input.quantity,
          specialInstructions: input.specialInstructions ?? null,
          addedBy: input.addedBy,
          version: 1,
        },
      });
    }

    log.info(
      { sessionId: session.id, cartItemId: row.id, menuItemId: input.menuItemId, addedBy: input.addedBy },
      'cart item added',
    );

    const cart = await this.getCart(input.sessionId);
    const addedLine = mustFind(cart.items, (l) => l.id === row.id);

    await this.publish({
      type: 'cart:item_added',
      tableId: session.tableId,
      sessionId: session.id,
      item: {
        cartItemId: row.id,
        menuItemId: menuItem.id,
        name: menuItem.name,
        price: menuItem.price,
        quantity: addedLine.quantity,
        addedBy: row.addedBy,
        specialInstructions: row.specialInstructions,
        version: row.version,
      },
      cartSubtotal: cart.subtotal,
      timestamp: Date.now(),
    } satisfies CartItemAdded);

    // Extending TTL on any cart activity is the natural signal of life.
    await this.sessions.extendTtl(input.sessionId).catch(() => undefined);

    return { cart, addedLine };
  }

  async updateItem(input: UpdateItemInput, updatedBy: string): Promise<CartView> {
    if (input.quantity !== undefined && (input.quantity <= 0 || input.quantity > 20)) {
      throw new ValidationError('Quantity out of range', { quantity: input.quantity });
    }

    const existing = await this.db.cartItem.findUnique({
      where: { id: input.cartItemId },
      include: { menuItem: { select: { id: true, name: true, available: true } } },
    });
    if (!existing) throw new NotFoundError('CartItem', input.cartItemId);
    if (!existing.menuItem.available) {
      throw new StockUnavailableError(existing.menuItem.name, existing.menuItem.id);
    }
    if (existing.version !== input.expectedVersion) {
      throw new CartVersionMismatchError(input.cartItemId, input.expectedVersion, existing.version);
    }

    const data: Prisma.CartItemUpdateInput = { version: { increment: 1 } };
    if (input.quantity !== undefined) data.quantity = input.quantity;
    if (input.specialInstructions !== undefined) {
      data.specialInstructions = input.specialInstructions;
    }

    const updated = await this.db.cartItem.update({ where: { id: input.cartItemId }, data });

    const session = await this.sessions.getById(existing.sessionId);
    const cart = await this.getCart(existing.sessionId);

    await this.publish({
      type: 'cart:item_updated',
      tableId: session.tableId,
      sessionId: session.id,
      cartItemId: updated.id,
      quantity: updated.quantity,
      version: updated.version,
      updatedBy,
      timestamp: Date.now(),
    } satisfies CartItemUpdated);

    log.info({ cartItemId: updated.id, version: updated.version }, 'cart item updated');
    return cart;
  }

  async removeItem(cartItemId: string, removedBy: string): Promise<CartView> {
    const existing = await this.db.cartItem.findUnique({ where: { id: cartItemId } });
    if (!existing) throw new NotFoundError('CartItem', cartItemId);

    await this.db.cartItem.delete({ where: { id: cartItemId } });

    const session = await this.sessions.getById(existing.sessionId);
    const cart = await this.getCart(existing.sessionId);

    await this.publish({
      type: 'cart:item_removed',
      tableId: session.tableId,
      sessionId: session.id,
      cartItemId,
      removedBy,
      timestamp: Date.now(),
    } satisfies CartItemRemoved);

    log.info({ cartItemId }, 'cart item removed');
    return cart;
  }

  /** Wipe cart in a transaction. Used by OrderService after successful checkout. */
  async clearForSession(sessionId: string, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.db;
    await client.cartItem.deleteMany({ where: { sessionId } });
  }

  // -------------------------------------------------------------------------
  // Pub/Sub
  // -------------------------------------------------------------------------

  private async publish(event: ServerEvent): Promise<void> {
    const channel =
      'tableId' in event ? channels.table(event.tableId) : channels.kitchen();
    try {
      await redisPub.publish(channel, JSON.stringify(event));
    } catch (err) {
      log.warn(
        { err: err instanceof Error ? err.message : String(err), channel, type: event.type },
        'redis publish failed (event will not reach connected clients)',
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function aggregateCart(sessionId: string, tableId: string, items: CartLine[]): CartView {
  const subtotal = items.reduce((acc, l) => acc + l.lineSubtotal, 0);
  const tax = items.reduce((acc, l) => acc + l.lineTax, 0);
  return {
    sessionId,
    tableId,
    items,
    subtotal: round2(subtotal),
    tax: round2(tax),
    total: round2(subtotal + tax),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function mustFind<T>(arr: T[], pred: (t: T) => boolean): T {
  const found = arr.find(pred);
  if (!found) throw new Error('Internal invariant: expected element missing from cart');
  return found;
}

export const cartService = new CartService();
