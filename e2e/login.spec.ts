import { test, expect } from '@playwright/test';

// The app uses hash routing; a clean browser context has no saved servers,
// so the login form renders directly. No Jellyfin backend is required for
// these flows — real login / Quick Connect are intentionally out of scope.

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('boots to the login screen', async ({ page }) => {
  await expect(page.getByText('Jellyfin Client')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.locator('#serverUrl')).toBeVisible();
});

test('rejects a non-http(s) server URL with an inline error', async ({ page }) => {
  // ftp:// is a valid URL for the native <input type="url"> check, so the form
  // submits and our validateServerUrl() is what rejects it.
  await page.locator('#serverUrl').fill('ftp://example.com');
  await page.locator('#username').fill('alice');
  await page.locator('#password').fill('secret');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText('Server URL must use http:// or https://')).toBeVisible();
  // Still on the login page — no navigation occurred
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('password visibility toggle flips the input type', async ({ page }) => {
  const pwd = page.locator('#password');
  await pwd.fill('secret');
  await expect(pwd).toHaveAttribute('type', 'password');

  // The eye button sits inside the password field's relative wrapper
  await pwd.locator('xpath=following-sibling::button').click();
  await expect(pwd).toHaveAttribute('type', 'text');
});
