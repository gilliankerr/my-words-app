const { test, expect } = require('@playwright/test');

async function signIn(page) {
  await page.getByLabel('Account', { exact: true }).fill('owner');
  await page.getByLabel('Password', { exact: true }).fill('owner-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
}

async function savedCopy(page) {
  return page.evaluate(async () => {
    const store = await new NextLocalStore().open();
    try { return await store.read('owner', 'demo'); } finally { store.db.close(); }
  });
}

test('removing the local copy survives a delayed returning download, reload and deliberate sign-in', async ({ page }) => {
  await page.goto('/editor.html'); await signIn(page);
  let release, captured;
  const pending = new Promise(resolve => { release = resolve; });
  const requested = new Promise(resolve => { captured = resolve; });
  await page.route('**/api/workspaces/demo', async route => {
    const response = await route.fetch(); captured();
    await pending; await route.fulfill({ response });
  });
  try {
    await page.reload(); await requested;
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await page.evaluate(() => {
      const receive = NextLocalStore.prototype.receive;
      NextLocalStore.prototype.receive = async function (...args) {
        try { return await receive.apply(this, args); } finally { window.oldReceiveFinished = true; }
      };
    });
    await page.getByText('Download or restore a backup', { exact: true }).click();
    await page.getByRole('button', { name: 'Remove local saved copy', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    expect(await savedCopy(page)).toBeNull();
    release(); await page.waitForFunction(() => window.oldReceiveFinished);
    expect(await savedCopy(page)).toBeNull();
    await page.unroute('**/api/workspaces/demo');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    expect(await savedCopy(page)).toBeNull();
    await signIn(page);
    expect((await savedCopy(page)).snapshot.owner).toBe('owner');
  } finally { release(); }
});

test('a download from another tab cannot replace a fresh owned copy after local removal', async ({ page, context }) => {
  await page.goto('/editor.html'); await signIn(page);
  const other = await context.newPage(); await other.goto('/editor.html');
  await expect(other.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await other.evaluate(async () => {
    const store = await new NextLocalStore().open();
    const snapshot = structuredClone((await store.read('owner', 'demo')).snapshot);
    snapshot.future = { syntheticRemovalCheck: 'stale' };
    const repository = { request: async path => {
      if (path.endsWith('/receipts')) return { success: true };
      window.heldDownloadStarted = true;
      return new Promise(resolve => { window.releaseOldDownload = () => resolve(snapshot); });
    } };
    window.heldDownload = new NextSync(store, repository, 'owner', 'demo', 'synthetic-removal-device').download().then(() => 'accepted', error => error.message);
  });
  await other.waitForFunction(() => window.heldDownloadStarted);
  await page.evaluate(async () => {
    const removing = await new NextLocalStore().open();
    const snapshot = structuredClone((await removing.read('owner', 'demo')).snapshot);
    await removing.remove('owner', 'demo', true); removing.db.close();
    snapshot.future = { syntheticRemovalCheck: 'fresh' };
    const fresh = await new NextLocalStore().open();
    try {
      const repository = { request: async path => path.endsWith('/receipts') ? { success: true } : snapshot };
      await new NextSync(fresh, repository, 'owner', 'demo', 'synthetic-fresh-device').download();
    } finally { fresh.db.close(); }
  });
  await other.evaluate(async () => { window.releaseOldDownload(); await window.heldDownload; });
  expect((await savedCopy(page)).snapshot.future).toEqual({ syntheticRemovalCheck: 'fresh' });
});
