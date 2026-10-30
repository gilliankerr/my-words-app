const { test, expect } = require('@playwright/test');
const { openPreparation } = require('../saved-shortcuts');
async function open(page, name = 'alex', editor = true) {
  await page.goto(editor ? '/editor.html' : '/#book');
  await page.getByLabel('Account', { exact: true }).fill(name);
  await page.getByLabel('Password', { exact: true }).fill(name + '-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  if (editor) await expect(page.getByText('Signed in as ' + name, { exact: true })).toBeVisible();
  else await expect(page.getByRole('heading', { name: 'Communication book', exact: true })).toBeVisible();
  // Opening is nonblocking; an offline reload needs the complete public shell first.
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (editor) await openPreparation(page);
}
test('all-section edit, highlight, hide and unfinished new-word recovery use the complete saved source', async ({ page, context }) => {
  await open(page);
  await page.getByRole('button', { name: 'Change book words', exact: true }).click();
  await page.getByRole('button', { name: 'Home & Household', exact: true }).click();
  const row = page.locator('[data-item]').first();
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Wording').fill('Reading lamp — a complete fictional phrase');
  await page.getByLabel('Highlight', { exact: true }).check();
  await page.getByRole('button', { name: 'Save to book', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved');
  await page.getByRole('button', { name: 'Return', exact: true }).click();
  await expect(page.locator('.highlighted').filter({ hasText: 'Reading lamp' }).first()).toBeVisible();
  await page.locator('[data-item]').first().getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Show in book', { exact: true }).uncheck(); await page.getByRole('button', { name: 'Save to book', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Saved');
  await page.getByRole('button', { name: 'Return', exact: true }).click(); await expect(page.getByText('Hidden — not in the book', { exact: true }).first()).toBeVisible();
  await page.locator('[data-item]').first().getByRole('button', { name: 'Edit', exact: true }).click(); await page.getByLabel('Show in book', { exact: true }).check();
  await page.getByRole('button', { name: 'Save to book', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Saved'); await page.getByRole('button', { name: 'Return', exact: true }).click();
  await page.getByRole('button', { name: 'Add word or phrase', exact: true }).click();
  await context.setOffline(true);
  await page.getByLabel('Wording').fill('A fictional long household addition');
  await page.getByRole('button', { name: 'Save to book', exact: true }).click();
  await expect(page.getByRole('status')).toContainText(/waiting/i);
  await page.reload();
  await page.getByRole('button', { name: /^Continue unfinished edits/ }).click();
  await page.getByRole('button', { name: 'Continue editing', exact: true }).click();
  await expect(page.getByLabel('Wording')).toHaveValue('A fictional long household addition');
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Return', exact: true }).click();
  await page.getByRole('button', { name: 'Retry sending', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Synced');
});

test('reader words highlight in place, with maintenance and printing kept in the editor', async ({ page }) => {
  await open(page, 'reader', false);
  await expect(page.getByRole('button', { name: 'Print booklet', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Workspace access', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Home & Household', exact: true }).click();
  const word = page.getByRole('button', { name: 'Reading lamp — a complete fictional phrase', exact: true });
  await expect(word).toHaveCSS('font-weight', '400');
  await expect(word).not.toHaveAttribute('aria-description', 'Highlighted');
  await expect(word).toHaveAttribute('aria-pressed', 'true');
  await expect(word).toHaveCSS('background-color', 'rgb(220, 234, 217)');
  const before = await word.boundingBox();
  await word.click(); await expect(word).toHaveAttribute('aria-pressed', 'false');
  await word.click(); await expect(word).toHaveAttribute('aria-pressed', 'true');
  await expect(word).toHaveCSS('font-weight', '400');
  await expect(word).toHaveCSS('background-color', 'rgb(220, 234, 217)');
  expect((await word.boundingBox()).width).toBe(before.width);
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.screenshot({ path: `output/book-plain-selection-${width}.png` });
  }
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await word.click(); await expect(word).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Save word group', exact: true }).click();
  await expect(word).toHaveAttribute('aria-pressed', 'false');
  await word.click();
  await expect(word).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('1. Reading lamp — a complete fictional phrase', { exact: true })).toBeVisible();
});
test('reopening an unfinished word keeps the original complete draft before any new typing', async ({ page }) => {
  await open(page); await page.getByRole('button', { name: 'Change book words', exact: true }).click(); await page.getByRole('button', { name: 'Home & Household', exact: true }).click();
  await page.locator('[data-item]').first().getByRole('button', { name: 'Edit', exact: true }).click(); await page.getByLabel('Wording').fill('Fictional unfinished wording to preserve');
  await page.getByRole('button', { name: 'Return', exact: true }).click(); await page.locator('[data-item]').first().getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Wording')).toHaveValue('Fictional unfinished wording to preserve');
});
