import { defineConfig } from 'vitest/config';

/**
 * Vitest is for unit/component tests under `tests/unit/**`. Playwright owns
 * `tests/e2e/**` and runs through `pnpm test:e2e`.
 */

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules', '.next', 'dist'],
  },
});
