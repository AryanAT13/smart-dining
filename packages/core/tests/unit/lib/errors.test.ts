import './../setup';

import { describe, expect, it } from 'vitest';

import {
  CartVersionMismatchError,
  DomainError,
  NotFoundError,
  OtpError,
  StockUnavailableError,
  toDomainError,
} from '../../../src/lib/errors.js';

describe('error hierarchy', () => {
  it('NotFoundError serialises with code/message/details', () => {
    const err = new NotFoundError('Order', 'abc-123');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.statusCode).toBe(404);
    expect(err.toJSON()).toMatchObject({
      code: 'NOT_FOUND',
      details: { resource: 'Order', identifier: 'abc-123' },
    });
  });

  it('CartVersionMismatchError exposes versions in details', () => {
    const err = new CartVersionMismatchError('ci-1', 2, 3);
    expect(err.statusCode).toBe(409);
    expect(err.details).toMatchObject({ expected: 2, actual: 3 });
  });

  it('StockUnavailableError carries item info', () => {
    const err = new StockUnavailableError('Paneer Tikka', 'mi-1');
    expect(err.details).toMatchObject({ itemId: 'mi-1', itemName: 'Paneer Tikka' });
  });

  it('OtpError defaults OTP_LOCKED to 429', () => {
    const err = new OtpError('OTP_LOCKED', 'locked');
    expect(err.statusCode).toBe(429);
  });

  it('OtpError defaults OTP_INVALID to 400', () => {
    const err = new OtpError('OTP_INVALID', 'nope');
    expect(err.statusCode).toBe(400);
  });

  it('toDomainError wraps a plain Error as INTERNAL', () => {
    const wrapped = toDomainError(new Error('boom'));
    expect(wrapped).toBeInstanceOf(DomainError);
    expect(wrapped.code).toBe('INTERNAL');
    expect(wrapped.message).toBe('boom');
  });

  it('toDomainError passes DomainErrors through unchanged', () => {
    const original = new NotFoundError('Session', 'sid');
    expect(toDomainError(original)).toBe(original);
  });

  it('toDomainError handles non-Error throwables', () => {
    const wrapped = toDomainError('weird string');
    expect(wrapped.code).toBe('INTERNAL');
  });
});
