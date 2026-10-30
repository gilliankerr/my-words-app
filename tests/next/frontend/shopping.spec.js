const { test, expect } = require('@playwright/test');
const { openPreparation } = require('../saved-shortcuts');
test('failed shopping sync keeps ticks and says the save is waiting on this device', async ({ page }) => {
  await page.goto('/#shopping'); await page.getByLabel('Account', { exact: true }).fill('reader'); await page.getByLabel('Password', { exact: true }).fill('reader-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.route('**/workspaces/demo/operations', route => route.fulfill({ status: 503, json: { error: 'Synthetic unavailable' } }));
  await page.getByLabel('Broccoli', { exact: true }).check();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#status')).toContainText('Saved on this device. Waiting to sync.');
  await expect(page.getByLabel('Broccoli', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Broccoli', { exact: true })).toBeEnabled();
  await page.reload(); await expect(page.getByLabel('Broccoli', { exact: true })).toBeChecked();
});
for (const departure of ['Home', 'Back', 'browser Back']) test(`shopping save cannot reopen the list after ${departure}`, async ({ page }) => {
  await page.goto('/#home'); await page.getByLabel('Account', { exact: true }).fill('reader'); await page.getByLabel('Password', { exact: true }).fill('reader-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.locator('.home-choice').filter({ hasText: 'Shopping list' }).click();
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  await page.route('**/workspaces/demo/operations', async route => { await hold; await route.continue(); });
  const saving = page.waitForRequest(request => request.url().endsWith('/workspaces/demo/operations'));
  const item = { Home: 'Broccoli', Back: 'Tomatoes', 'browser Back': 'Celery' }[departure];
  await page.getByLabel(item, { exact: true }).check(); await saving;
  if (departure === 'browser Back') await page.goBack();
  else if (departure === 'Back') await page.locator('#navigation-back').click();
  else await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  release(); await page.waitForLoadState('networkidle');
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await page.locator('.home-choice').filter({ hasText: 'Shopping list' }).click();
  await expect(page.getByLabel(item, { exact: true })).toBeChecked();
});
test('rapid shopping ticks stay enabled and visible while earlier saves finish', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#shopping'); await page.getByLabel('Account', { exact: true }).fill('reader'); await page.getByLabel('Password', { exact: true }).fill('reader-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.route('**/workspaces/demo/operations', async route => { await new Promise(resolve => setTimeout(resolve, 350)); await route.continue(); });
  const names = ['Carrots', 'Spinach', 'Kale'];
  await expect(page.getByLabel('Carrots', { exact: true })).toBeVisible();
  const immediate = await page.evaluate(names => {
    for (const name of names) { const box = [...document.querySelectorAll('.shopping-grid input')].find(box => box.parentElement.textContent === name); box.checked = true; box.dispatchEvent(new Event('change', { bubbles: true })); }
    return names.map(name => { const box = [...document.querySelectorAll('.shopping-grid input')].find(box => box.parentElement.textContent === name); return { checked: box.checked, disabled: box.disabled, highlighted: box.parentElement.classList.contains('bought') }; });
  }, names);
  expect(immediate).toEqual(names.map(() => ({ checked: true, disabled: false, highlighted: true })));
  for (const name of names) { await expect(page.getByLabel(name, { exact: true })).toBeEnabled(); await expect(page.getByLabel(name, { exact: true })).toBeChecked(); }
  // Reverse a not-yet-created catalogue choice while its first tick is pending.
  await page.getByLabel('Kale', { exact: true }).uncheck(); await page.getByLabel('Kale', { exact: true }).check();
  // An empty outbox between serial operations does not mean the queue is done.
  await page.waitForLoadState('networkidle');
  await expect.poll(() => page.evaluate(async () => { const store = await new NextLocalStore().open(); const value = await store.read('reader', 'demo'); store.db.close(); return value?.outbox.length; })).toBe(0);
  await page.reload();
  for (const name of names) await expect(page.getByLabel(name, { exact: true })).toBeChecked();
  await expect(page.getByText('Tick each item when bought.', { exact: true })).toHaveCount(0);
  for (const width of [390, 768]) { await page.setViewportSize({ width, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: test.info().outputPath(`shopping-rapid-${width}.png`) }); }
});
test('one shopping list adds, ticks, clears, deletes and restores; repeated offline ticks survive reload', async ({ page, context }) => {
  const itemName = 'Fictional lentils ' + Date.now();
  await page.goto('/#book'); await page.getByLabel('Account', { exact: true }).fill('reader'); await page.getByLabel('Password', { exact: true }).fill('reader-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.getByRole('button', { name: 'Shopping list', exact: true }).click();
  await page.getByText('Add an item', { exact: true }).click(); await page.getByLabel('Add item', { exact: true }).fill(itemName); await page.getByRole('button', { name: 'Add item', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Shopping list saved.');
  await page.getByLabel(itemName, { exact: true }).check(); await expect(page.getByRole('status')).toHaveText('Shopping list saved.');
  await page.getByRole('button', { name: 'Clear all', exact: true }).click(); await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByLabel(itemName, { exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Undo clear', exact: true }).click();
  await expect(page.getByLabel(itemName, { exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Clear all', exact: true }).click(); await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByLabel(itemName, { exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Edit list', exact: true }).click(); await page.locator('[data-shopping]').filter({ hasText: itemName }).getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Shopping list saved.');
  await expect(page.getByLabel(itemName, { exact: true })).toHaveCount(0);
  await page.getByText('Deleted items', { exact: true }).click(); await page.locator('[data-shopping]').filter({ hasText: itemName }).getByRole('button', { name: 'Restore', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Shopping list saved.');
  await page.getByRole('button', { name: 'Done', exact: true }).click(); await page.evaluate(() => navigator.serviceWorker.ready); await context.setOffline(true);
  await page.getByLabel(itemName, { exact: true }).check(); await expect(page.getByRole('status')).toContainText('Waiting');
  await page.getByLabel(itemName, { exact: true }).uncheck(); await expect(page.getByLabel(itemName, { exact: true })).toBeEnabled(); await expect(page.getByLabel(itemName, { exact: true })).not.toBeChecked();
  await expect.poll(() => page.evaluate(async name => { const store = await new NextLocalStore().open(); const value = await store.read('reader', 'demo'); store.db.close(); return Object.values(value.drafts).find(d => d.payload.text === name)?.payload.checked; }, itemName)).toBe(false);
  await page.reload(); await page.getByRole('button', { name: 'Shopping list', exact: true }).click(); await expect(page.getByLabel(itemName, { exact: true })).not.toBeChecked();
  await context.setOffline(false); await page.getByText('Changes waiting to sync', { exact: true }).click(); await page.getByRole('button', { name: 'Sync now', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Shopping list saved.');
  await page.reload(); await page.getByRole('button', { name: 'Shopping list', exact: true }).click(); await expect(page.getByLabel(itemName, { exact: true })).not.toBeChecked();
});
test('a stale Clear all remains recoverable through Review changes in Settings', async ({ page }) => {
  await page.goto('/editor.html'); await page.getByLabel('Account', { exact: true }).fill('alex'); await page.getByLabel('Password', { exact: true }).fill('alex-fictional-only'); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await openPreparation(page); await page.getByRole('button', { name: 'Change shopping items', exact: true }).click(); await page.getByText('Add an item', { exact: true }).click(); await page.getByLabel('Add item', { exact: true }).fill('Fictional stale-list item ' + Date.now()); await page.getByRole('button', { name: 'Add item', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Shopping list saved.');
  await page.evaluate(async () => { const r = new NextRepository(); await r.session(); const w = await r.request('workspaces/demo'); const record = Object.values(w.records).find(r => NextBook.latest(r).payload.kind === 'shopping' && !NextBook.latest(r).payload.tombstone); await r.request('workspaces/demo/operations', { recordId: record.id, base: record.current, payload: { ...NextBook.latest(record).payload, checked: true }, operation: crypto.randomUUID() }); });
  await page.getByRole('button', { name: 'Clear all', exact: true }).click(); await page.getByRole('button', { name: 'Confirm', exact: true }).click(); await expect(page.getByRole('status')).toContainText('The list changed');
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review changes', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review changes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Shopping list', exact: true })).toBeVisible(); await expect(page.locator('main .notice')).toContainText('Clear all was not applied');
});
