const { test, expect } = require('@playwright/test');
const { openNoteTools } = require('./note-tools');
test('missing startup code exposes safe recovery without displaying raw error details', async ({ page }) => {
  await page.route('**/js/trial.js', route => route.fulfill({ contentType: 'application/javascript', body: 'throw new Error("fictional private error detail");' }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Opening paused', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open latest app files', exact: true })).toBeVisible();
  await expect(page.locator('main')).not.toContainText('fictional private error detail');
});
test('stalled saved storage provides recovery instead of an endless opening screen', async ({ page }) => {
  await page.addInitScript(() => { indexedDB.open = () => ({}); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Opening paused', exact: true })).toBeVisible({ timeout: 18000 });
  await expect(page.getByText('Opening saved storage is taking too long. Your saved data has not been removed.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry opening', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open latest app files', exact: true })).toHaveAttribute('href', '/?fresh=1#home');
});
test('a stalled session check cannot leave returning owned words stuck opening', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Account', { exact: true }).fill('reader');
  await page.getByLabel('Password', { exact: true }).fill('reader-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/session', async route => { await pending; await route.abort(); });
  try {
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible({ timeout: 14000 });
    await expect(page.locator('#status')).toContainText('Saved words available offline');
    await page.locator('.home-choice').filter({ hasText: 'Notes' }).click();
    await expect(page.getByRole('heading', { name: 'Notes', exact: true })).toBeVisible();
  } finally { release(); }
});
test('opening does not wait for the entire offline picture installation', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.serviceWorker, 'ready', { get: () => new Promise(() => {}) });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible({ timeout: 2000 });
});
test('confirmed returning account opens its saved screen before slow workspace refresh without replacing entered text', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Account', { exact: true }).fill('reader');
  await page.getByLabel('Password', { exact: true }).fill('reader-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  await page.route('**/api/workspaces/demo', async route => { await waiting; await route.continue(); });
  await page.reload();
  try {
    await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible({ timeout: 2000 });
    await page.locator('.home-choice').filter({ hasText: 'Notes' }).click();
    await openNoteTools(page);
    await page.getByLabel('Search Notes', { exact: true }).fill('My retained clue');
    const response = page.waitForResponse(r => r.url().endsWith('/api/workspaces/demo'));
    release(); await response;
    await expect(page.getByLabel('Search Notes', { exact: true })).toHaveValue('My retained clue');
    await expect(page.getByRole('heading', { name: 'Notes', exact: true })).toBeVisible();
  } finally { release(); }
});

test('a denied background refresh locks the owned saved copy', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Account', { exact: true }).fill('reader');
  await page.getByLabel('Password', { exact: true }).fill('reader-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  await page.route('**/api/workspaces/demo', async route => { await waiting; await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Access denied' }) }); });
  await page.reload();
  try {
    await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible({ timeout: 2000 });
    release();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Home', exact: true })).toHaveCount(0);
    expect(await page.evaluate(async () => (await new NextLocalStore().open()).identity())).toBeNull();
  } finally { release(); }
});

for (const status of [401, 403]) test(`a denied session (${status}) locks returning words instead of reopening offline`, async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Account', { exact: true }).fill('reader');
  await page.getByLabel('Password', { exact: true }).fill('reader-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  const beforeSnapshot = await page.evaluate(async () => {
    const store = await new NextLocalStore().open();
    try { return (await store.read('reader', 'demo')).snapshot; }
    finally { store.db.close(); }
  });
  await page.route('**/api/session', route => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: 'Access denied' }) }));
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible({ timeout: 3000 });
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toHaveCount(0);
  const retained = await page.evaluate(async () => {
    const store = await new NextLocalStore().open();
    try { const data = await store.read('reader', 'demo'); return { identity: await store.identity(), locked: data.locked, snapshot: data.snapshot }; }
    finally { store.db.close(); }
  });
  expect(retained).toEqual({ identity: null, locked: true, snapshot: beforeSnapshot });
});
