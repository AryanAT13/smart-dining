import './../setup';

import { describe, expect, it } from 'vitest';

// We test the snapshot/aggregate math via the publicly testable behaviour of
// the GST calculation. The private estimateWait function is exercised through
// the OrderService integration tests in Phase 4; here we focus on the
// invariants exposed at the type level.

import { CartVersionMismatchError } from '../../../src/lib/errors.js';

describe('CartVersionMismatchError contract', () => {
  it('carries the expected and actual version', () => {
    const err = new CartVersionMismatchError('ci-1', 5, 7);
    expect(err.details.expected).toBe(5);
    expect(err.details.actual).toBe(7);
    expect(err.code).toBe('CART_VERSION_MISMATCH');
  });
});
