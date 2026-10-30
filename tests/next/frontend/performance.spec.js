const { test, expect } = require('@playwright/test');
const { openPreparation } = require('../saved-shortcuts');

test('returned words become usable while their local draft finishes saving', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Account', { exact: true }).fill('owner');
  await page.getByLabel('Password', { exact: true }).fill('owner-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: /Quick words/ }).click();
  await page.evaluate(() => {
    const update = NextLocalStore.prototype.update;
    NextLocalStore.prototype.update = async function (...args) {
      if (window.pauseReturnedDraft) { window.pauseReturnedDraft = false; await new Promise(resolve => { window.releaseReturnedDraft = resolve; }); }
      return update.apply(this, args);
    };
  });
  await page.route('**/api/workspaces/demo/quick-words', async route => {
    await page.evaluate(() => { window.pauseReturnedDraft = true; });
    await route.fulfill({ json: { success: true, words: Array.from({ length: 50 }, (_, i) => 'Choice ' + i) } });
  });
  await page.getByLabel('Topic / clue', { exact: true }).fill('Dentist');
  await page.getByRole('button', { name: 'Get Words', exact: true }).click();
  await page.waitForFunction(() => !!window.releaseReturnedDraft);
  await expect(page.locator('[data-quick-bank="original"] button').first()).toBeEnabled();
  await page.locator('[data-quick-bank="original"] button').first().click();
  await page.evaluate(() => window.releaseReturnedDraft());
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Update app', exact: true }).click();
  await expect(page).toHaveURL(/fresh=1/);
  await openPreparation(page);
  await page.getByRole('button', { name: 'Prepare a word group', exact: true }).click();
  await expect(page.locator('[data-quick-bank="original"] button').first()).toHaveAttribute('aria-pressed', 'true');
});

test('rapid clue edits keep the latest draft without queuing a complete workspace write per keystroke', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Account', { exact: true }).fill('reader');
  await page.getByLabel('Password', { exact: true }).fill('reader-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: /Quick words/ }).click();
  await page.evaluate(() => {
    window.draftWrites = 0;
    const update = NextLocalStore.prototype.update;
    NextLocalStore.prototype.update = async function (...args) {
      window.draftWrites++;
      if (window.draftWrites === 1) await new Promise(resolve => { window.releaseDraft = resolve; });
      return update.apply(this, args);
    };
  });
  let input;
  let writesBeforeRequest;
  await page.route('**/api/workspaces/demo/quick-words', route => {
    input = route.request().postDataJSON();
    return page.evaluate(() => window.draftWrites).then(count => {
      writesBeforeRequest = count;
      return route.fulfill({ json: { success: true, words: Array.from({ length: 50 }, (_, i) => 'Choice ' + i) } });
    });
  });
  for (let i = 0; i < 12; i++) await page.getByLabel('Topic / clue', { exact: true }).fill('Dentist ' + i);
  await page.getByRole('button', { name: 'Get Words', exact: true }).click();
  await page.waitForFunction(() => !!window.releaseDraft);
  expect(input).toBeUndefined();
  await page.evaluate(() => window.releaseDraft());
  await expect(page.locator('[data-quick-bank="original"] button')).toHaveCount(50);
  expect(input.keywords).toBe('Dentist 11');
  // Baseline and draft save together; submission reuses the first/latest saves.
  expect(writesBeforeRequest).toBe(2);
  expect(await page.evaluate(() => window.draftWrites)).toBeLessThan(8);
  await page.reload();
  await expect(page.getByLabel('Topic / clue', { exact: true })).toHaveValue('Dentist 11');
  await expect(page.locator('[data-quick-bank="original"] button')).toHaveCount(50);
});

test('Book labels read display preferences without rebuilding all vocabulary for each label', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Account', { exact: true }).fill('reader');
  await page.getByLabel('Password', { exact: true }).fill('reader-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await page.evaluate(() => {
    window.catalogueCalls = 0;
    const catalogue = NextBook.catalogue;
    NextBook.catalogue = (...args) => { window.catalogueCalls++; return catalogue(...args); };
  });
  await page.getByRole('button', { name: 'Communication book Words and phrases by subject', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'All sections', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.catalogueCalls)).toBeLessThan(5);
});

test('Update app waits for the newest coalesced Quick words clue', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Account', { exact: true }).fill('owner');
  await page.getByLabel('Password', { exact: true }).fill('owner-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: /Quick words/ }).click();
  await page.evaluate(() => {
    const update = NextLocalStore.prototype.update;
    let writes = 0;
    NextLocalStore.prototype.update = async function (...args) {
      if (++writes === 1) await new Promise(resolve => { window.releaseDraft = resolve; });
      return update.apply(this, args);
    };
  });
  await page.getByLabel('Topic / clue', { exact: true }).fill('First clue');
  await page.waitForFunction(() => !!window.releaseDraft);
  await page.getByLabel('Topic / clue', { exact: true }).fill('Newest retained clue');
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Update app', exact: true }).click();
  await expect(page).not.toHaveURL(/fresh=1/);
  await page.evaluate(() => window.releaseDraft());
  await expect(page).toHaveURL(/fresh=1/);
  await openPreparation(page);
  await page.getByRole('button', { name: 'Prepare a word group', exact: true }).click();
  await expect(page.getByLabel('Topic / clue', { exact: true })).toHaveValue('Newest retained clue');
});
