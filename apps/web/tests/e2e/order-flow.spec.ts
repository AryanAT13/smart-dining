/**
 * End-to-end smoke — the demo path.
 *
 * Path covered:
 *   1. Land on /table/T1
 *   2. Enter display name in onboarding
 *   3. Add a menu item (the "Add" button on Paneer Tikka)
 *   4. Open cart, place order
 *   5. Enter mock OTP 123456
 *   6. See order confirmation
 *
 * AI chat is exercised by a separate spec (`ai-chat.spec.ts`) since it
 * requires a real OpenAI key. This smoke runs without any LLM calls so it's
 * suitable for every CI run.
 */

import { expect, test } from '@playwright/test';

test.describe('Order flow smoke', () => {
  test('QR → onboarding → add → checkout → confirmation', async ({ page }) => {
    await page.goto('/table/T1');

    // Onboarding — type a display name and start.
    const nameInput = page.getByPlaceholder(/e\.g\. priya/i);
    await expect(nameInput).toBeVisible();
    await nameInput.fill('Priya');
    await page.getByRole('button', { name: /start ordering/i }).click();

    // Wait for menu to load.
    await expect(page.getByRole('heading', { name: /paneer tikka/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    // Add the first item — the "Add" aria-label for Paneer Tikka.
    await page.getByRole('button', { name: /^add paneer tikka/i }).first().click();

    // Cart drawer auto-opens — verify the item shows up.
    await expect(page.getByRole('heading', { name: /your table's cart/i })).toBeVisible();
    await expect(page.getByText(/paneer tikka/i).first()).toBeVisible();

    // Begin checkout.
    await page.getByRole('button', { name: /^place order$/i }).click();

    // Contact form.
    await page.getByLabel(/name/i).fill('Priya');
    await page.getByLabel(/phone/i).fill('+919876543210');
    await page.getByRole('button', { name: /send otp/i }).click();

    // Demo OTP banner appears with code 123456.
    await expect(page.getByText(/demo otp/i)).toBeVisible({ timeout: 10_000 });

    // Enter the 6 digits.
    const digits = ['1', '2', '3', '4', '5', '6'];
    const otpInputs = page.locator('input[inputmode="numeric"]');
    for (let i = 0; i < digits.length; i++) {
      await otpInputs.nth(i).fill(digits[i] ?? '');
    }

    await page.getByRole('button', { name: /verify/i }).click();

    // Confirmation.
    await expect(page.getByRole('heading', { name: /order placed/i })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/order #/i)).toBeVisible();
  });
});
