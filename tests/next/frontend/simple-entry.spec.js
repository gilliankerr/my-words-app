const { test, expect } = require('@playwright/test');
test('single-book entry has one personal-information choice and keeps extra editing shortcuts secondary', async ({ page }) => {
  await page.goto('/editor.html'); await page.getByLabel('Account', { exact: true }).fill('alex'); await page.getByLabel('Password', { exact: true }).fill('alex-fictional-only'); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Current app', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit phrase', exact: true })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit page', exact: true })).not.toBeVisible();
  await page.getByRole('button', { name: 'Prepare or change content', exact: true }).click();
  await page.getByText('Saved wording shortcuts', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit page', exact: true })).toBeVisible();
  await page.goto('/#book');
  await expect(page.getByRole('button', { name: 'Personal information', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Read Basic info', exact: true })).toHaveCount(0);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('button, nav a, summary').evaluateAll(els => els.filter(e => e.getBoundingClientRect().height > 0).every(e => e.getBoundingClientRect().height >= 44))).toBe(true);
  }
  await page.getByRole('button', { name: 'Personal information', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.personal-passage .passage').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show page', exact: true })).toHaveCount(0);
});
