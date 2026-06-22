import { test, expect } from '@playwright/test';

// Backend-free navigation/guard behaviour. A clean context is unauthenticated.

test('redirects unauthenticated access to a protected route back to login', async ({ page }) => {
  await page.goto('/#/libraries');
  // beforeEach guard sends unauthenticated users to the login route
  await expect(page).toHaveURL(/#\/login/);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('Quick Connect is disabled until a server URL is entered', async ({ page }) => {
  await page.goto('/');
  const qc = page.getByRole('button', { name: 'Use Quick Connect' });
  await expect(qc).toBeDisabled();

  await page.locator('#serverUrl').fill('http://192.168.1.10:8096');
  await expect(qc).toBeEnabled();
});
