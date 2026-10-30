const { test, expect } = require('@playwright/test');

test('password eye control shows and hides typed wording without submitting or losing it', async ({ page }, testInfo) => {
  let submissions = 0;
  await page.route('**/api/sign-in', async route => {
    submissions++;
    expect(route.request().postDataJSON().password).toBe('Fictional-éye-password!');
    await route.fulfill({ status: 401, json: { error: 'Synthetic password check failed' } });
  });
  await page.goto('/editor.html');
  const password = page.getByLabel('Password', { exact: true });
  await password.fill('Fictional-éye-password!');
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'text');
  const hide = page.getByRole('button', { name: 'Hide password', exact: true });
  await expect(hide).toHaveAttribute('aria-controls', 'password');
  expect(submissions).toBe(0);
  await hide.focus(); await page.keyboard.press('Enter');
  await expect(password).toHaveAttribute('type', 'password');
  await expect(password).toHaveValue('Fictional-éye-password!');
  expect(submissions).toBe(0);
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await page.getByLabel('Account', { exact: true }).fill('owner');
  await password.press('Enter');
  await expect(page.getByRole('status')).toContainText('Synthetic password check failed');
  expect(submissions).toBe(1);
  await expect(password).toHaveValue('Fictional-éye-password!');
  await expect(page.getByRole('button', { name: 'Hide password', exact: true })).toBeEnabled();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const target = await hide.boundingBox(); expect(target.width).toBeGreaterThanOrEqual(44); expect(target.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: testInfo.outputPath(`password-${width}.png`), fullPage: true });
  }
});
const fs = require('node:fs');
const path = require('node:path');

for (const width of [390, 820]) test(`multi-account entry accepts an editable username at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.route('**/js/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'globalThis.NextRuntime = {sharedAccount:true,multiAccount:true};' }));
  let submitted;
  await page.route('**/api/sign-in', async route => {
    submitted = route.request().postDataJSON();
    // Entry-form regression only: the existing disposable fixture server owns
    // authentication. Real multi-account database proof is a separate suite.
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), workspace: 'demo' } });
  });
  await page.goto('/');
  const username = page.getByLabel('Username', { exact: true });
  await expect(username).toBeVisible({ timeout: 3000 });
  await expect(username).toBeEditable();
  await expect(page.locator('input[type=email]')).toHaveCount(0);
  await page.screenshot({ path: path.resolve(__dirname, `../../../test-results/next/entry-${width}.png`), fullPage: true });
  await username.fill('owner');
  await page.getByLabel('Password', { exact: true }).fill('owner-fictional-only');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  expect(submitted).toEqual({ name: 'owner', password: 'owner-fictional-only' });
});

test('shared sign-in shows configured username and sends no email field', async ({ page }) => {
  await page.route('**/js/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'globalThis.NextRuntime = {sharedAccount:true,username:"demo-user"};' }));
  let submitted;
  await page.route('**/api/sign-in', async route => {
    submitted = route.request().postDataJSON();
    // Real disposable fixture authentication remains server-side; adapt only its fixture name.
    const response = await route.fetch({ postData: JSON.stringify({ ...submitted, name: 'owner' }) });
    const result = await response.json();
    await route.fulfill({ response, json: { ...result, workspace: 'demo' } });
  });
  await page.goto('/');
  await expect(page.getByLabel('Username', { exact: true })).toHaveValue('demo-user');
  await expect(page.getByLabel('Username', { exact: true })).toHaveAttribute('readonly', '');
  await expect(page.getByLabel('Email', { exact: true })).toHaveCount(0);
  await page.getByLabel('Password', { exact: true }).fill('owner-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  expect(submitted.name).toBe('demo-user'); expect(submitted).not.toHaveProperty('email');
});

