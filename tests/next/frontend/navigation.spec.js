const { test, expect } = require('@playwright/test');
const { openNoteTools } = require('./note-tools');

async function open(page) {
  await page.goto('/');
  await page.getByLabel('Account', { exact: true }).fill('owner');
  await page.getByLabel('Password', { exact: true }).fill('owner-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
}
const back = page => page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Back', exact: true });

test('a delayed display save cannot replace a conversation started after leaving Settings', async ({ page }) => {
  await open(page);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Display choices', exact: true }).click();
  await page.getByLabel('Text size', { exact: true }).selectOption('32');
  let release; const hold = new Promise(resolve => { release = resolve; });
  await page.route('**/workspaces/demo/operations', async route => { await hold; await route.continue(); });
  const sending = page.waitForRequest('**/workspaces/demo/operations');
  await page.getByRole('button', { name: 'Save display choices', exact: true }).click(); await sending;
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.locator('.home-choice').filter({ hasText: 'Quick words' }).click();
  await page.getByLabel('Topic / clue', { exact: true }).fill('Retain this synthetic conversation clue');
  release(); await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Quick words', exact: true })).toBeVisible();
  await expect(page.getByLabel('Topic / clue', { exact: true })).toHaveValue('Retain this synthetic conversation clue');
});

test('browser Back and Forward restore nested Book section, query, highlight and focus', async ({ page }) => {
  await open(page);
  await page.locator('.home-choice').filter({ hasText: 'Communication book' }).click();
  const topic = page.getByRole('button', { name: 'Dining & Restaurants', exact: true });
  const query = page.getByLabel('Search book', { exact: true });
  await query.fill('coffee');
  await topic.click();
  const word = page.locator('.words button').first();
  await word.click();
  await expect(word).toHaveAttribute('aria-pressed', 'true');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'All sections', exact: true })).toBeVisible();
  await expect(topic).toBeFocused();
  await expect(query).toHaveValue('coffee');
  await page.goForward();
  await expect(word).toHaveAttribute('aria-pressed', 'true');
  await back(page).click();
  await expect(page.getByRole('heading', { name: 'All sections', exact: true })).toBeVisible();
});

test('browser Back from editing retains a draft and Forward restores the same input', async ({ page }) => {
  await open(page);
  await page.locator('.home-choice').filter({ hasText: 'Notes' }).click();
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await page.getByLabel('Title (optional)').fill('Navigation draft fixture');
  await page.getByLabel('What do you want to say?').fill('Complete unfinished wording');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Notes', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByLabel('What do you want to say?')).toHaveValue('Complete unfinished wording');
  await page.goBack();
  await page.reload();
  await openNoteTools(page);
  await page.getByRole('button', { name: 'Unfinished', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Navigation draft fixture', exact: true })).toBeVisible();
});

test('Settings round trip returns to the nested communication screen offline', async ({ page, context }) => {
  await open(page);
  await page.locator('.home-choice').filter({ hasText: 'Communication book' }).click();
  await page.getByRole('button', { name: 'Dining & Restaurants', exact: true }).click();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await context.setOffline(true);
  await back(page).click();
  await expect(page.getByRole('heading', { name: 'Dining & Restaurants', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
});

test('picture Show is a reading page and browser Back preserves search context', async ({ page }) => {
  await open(page);
  await page.locator('.home-choice').filter({ hasText: 'Icons' }).click();
  await page.getByLabel('Search pictures', { exact: true }).fill('shower');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const choice = page.locator('[data-dictionary-results]').getByRole('button', { name: 'Show Shower', exact: true });
  await choice.click();
  await expect(page.getByRole('heading', { name: 'Shower', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('main img')).toHaveAttribute('src', '/assets/dictionary/arasaac/27728_500.png');
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await page.screenshot({ path: `output/next-preview-picture-${width}.png`, fullPage: true });
  }
  await page.goBack();
  await expect(page.getByLabel('Search pictures', { exact: true })).toHaveValue('shower');
  await expect(choice).toBeFocused();
  await page.goForward();
  await page.keyboard.press('Escape');
  await expect(choice).toBeFocused();
});

test('browser departure at Home is not trapped', async ({ page }) => {
  await page.goto('/manifest.webmanifest');
  await open(page);
  await page.goBack();
  await expect(page).toHaveURL(/manifest\.webmanifest$/);
});

test('late Icons loading cannot replace Settings', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const original = window.fetch.bind(window);
    window.fetch = (url, ...args) => url === NextDictionary.MANIFEST ? new Promise(resolve => {
      window.finishIcons = async () => resolve(await original(url, ...args));
    }) : original(url, ...args);
  });
  await page.locator('.home-choice').filter({ hasText: 'Icons' }).click();
  await page.waitForFunction(() => !!window.finishIcons);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.evaluate(() => window.finishIcons());
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByLabel('Search pictures', { exact: true })).toHaveCount(0);
});

for (const flow of ['words', 'notebook']) test(`Forward restores enabled ${flow} generation after a departed request settles`, async ({ page }) => {
  let release, settled;
  const done = new Promise(resolve => { settled = resolve; });
  await page.route(flow === 'words' ? '**/api/workspaces/demo/quick-words' : '**/api/workspaces/demo/situation-generation', async route => {
    await new Promise(resolve => { release = resolve; });
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Fictional failure' }) });
    settled();
  });
  await open(page);
  await page.locator('.home-choice').filter({ hasText: flow === 'words' ? 'Quick words' : 'Situation notebooks' }).click();
  if (flow === 'notebook') await page.getByRole('button', { name: 'Create notebook', exact: true }).click();
  await page.getByLabel(flow === 'words' ? 'Topic / clue' : 'Describe the situation', { exact: true }).fill('Fictional conversation');
  const action = page.getByRole('button', { name: flow === 'words' ? 'Get Words' : 'Create My Notebook', exact: true });
  await action.click();
  await expect.poll(() => !!release).toBe(true);
  await page.goBack(); release(); await done;
  await page.goForward();
  await expect(action).toBeEnabled();
});
