const { test, expect } = require('@playwright/test');

async function settings(page) {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/');
  await page.getByLabel('Account', { exact: true }).fill('owner');
  await page.getByLabel('Password', { exact: true }).fill('owner-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await page.locator('.home-choice').filter({ hasText: 'Notes' }).click();
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await page.getByLabel('What do you want to say?').fill('Synthetic update draft');
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Update app', exact: true })).toBeVisible();
}

test('Update app loads fresh code in the same session and preserves unfinished offline work', async ({ page }) => {
  await settings(page);
  const identity = await page.evaluate(async () => (await new NextLocalStore().open()).identity());
  await expect(page.getByRole('button', { name: 'Update app', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Update app', exact: true }).click();
  await expect(page).toHaveURL(/\/editor.html\?fresh=1/);
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  const preserved = await page.evaluate(async () => {
    const store = await new NextLocalStore().open(), identity = await store.identity();
    const data = await store.read(identity.actor, identity.workspace || 'demo');
    return { identity, text: Object.values(data.drafts).find(d => d.payload.text === 'Synthetic update draft')?.payload.text,
      scripts: [...document.scripts].filter(s => s.src).map(s => new URL(s.src).search) };
  });
  expect(preserved.identity.actor).toBe(identity.actor);
  expect(preserved.identity.device).toBe(identity.device);
  expect(preserved.text).toBe('Synthetic update draft');
  expect(preserved.scripts.every(query => query.startsWith('?fresh='))).toBe(true);
});

test('Update app stays usable offline and when loading current files fails', async ({ page, context }) => {
  await settings(page);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Update app', exact: true }).click();
  await expect(page.locator('[data-app-update-status]')).toContainText('Connect to the internet');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await context.setOffline(false);
  await page.route('**/editor.html?fresh=1', route => route.fulfill({ status: 503, body: 'Synthetic failure' }));
  await page.getByRole('button', { name: 'Update app', exact: true }).click();
  await expect(page.locator('[data-app-update-status]')).toContainText('could not load');
  await expect(page.getByRole('button', { name: 'Update app', exact: true })).toBeEnabled();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
});

test('consecutive updates use new public tokens and finish offline preparation', async ({ page, context }) => {
  await settings(page);
  await page.getByRole('button', { name: 'Update app', exact: true }).click();
  await expect(page.locator('[data-app-update-status]')).toContainText('Ready for offline use');
  const first = await page.locator('script[src*="/js/trial.js"]').getAttribute('src');
  await page.getByRole('button', { name: 'Update app', exact: true }).click();
  await expect.poll(async () => page.locator('script[src*="/js/trial.js"]').getAttribute('src')).not.toBe(first);
  await expect(page.locator('[data-app-update-status]')).toContainText('Ready for offline use');
  await context.setOffline(true);
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
});

test('failed current script leaves Settings and its unfinished work usable', async ({ page }) => {
  await settings(page);
  await page.route('**/js/trial.js?fresh=*', route => route.fulfill({ status: 503, body: 'Synthetic failure' }));
  await page.getByRole('button', { name: 'Update app', exact: true }).click();
  await expect(page.locator('[data-app-update-status]')).toContainText('could not load');
  await expect(page).not.toHaveURL(/update=/);
  await expect(page.getByRole('button', { name: 'Update app', exact: true })).toBeEnabled();
});

test('leaving Settings cancels a delayed update and returning permits a retry', async ({ page }) => {
  await settings(page);
  let release; const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/editor.html?fresh=1', async route => { await gate; await route.continue().catch(() => {}); });
  await page.getByRole('button', { name: 'Update app', exact: true }).click();
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  release();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Update app', exact: true })).toBeEnabled();
  await page.unroute('**/editor.html?fresh=1');
  await page.getByRole('button', { name: 'Update app', exact: true }).click();
  await expect(page.locator('[data-app-update-status]')).toContainText('Ready for offline use');
});

test('an unfinished local write blocks updating until it is durable', async ({ page }) => {
  await settings(page);
  await page.evaluate(() => {
    const original = NextLocalStore.prototype.update;
    window.releaseUpdateWrite = null;
    NextLocalStore.prototype.update = async function (...args) {
      await new Promise(resolve => { window.releaseUpdateWrite = resolve; });
      NextLocalStore.prototype.update = original;
      return original.apply(this, args);
    };
  });
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.locator('.home-choice').filter({ hasText: 'Notes' }).click();
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await page.getByLabel('What do you want to say?').fill('Delayed synthetic local write');
  await expect.poll(() => page.evaluate(() => !!window.releaseUpdateWrite)).toBe(true);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Update app', exact: true }).click();
  await expect(page.locator('[data-app-update-status]')).toContainText('Saving unfinished work');
  await expect(page).not.toHaveURL(/update=/);
  await page.evaluate(() => window.releaseUpdateWrite());
  await expect(page.locator('[data-app-update-status]')).toContainText('Ready for offline use');
  const drafts = await page.evaluate(async () => { const s = await new NextLocalStore().open(); const i = await s.identity(); return Object.values((await s.read(i.actor, i.workspace)).drafts).map(d => d.payload.text); });
  expect(drafts).toContain('Delayed synthetic local write');
});

test('connection loss after staging still loads the verified page with saved work', async ({ page, context }) => {
  await settings(page);
  await page.exposeFunction('disconnectAfterStaging', () => context.setOffline(true));
  await page.evaluate(() => {
    const put = Cache.prototype.put;
    Cache.prototype.put = async function (request, response) {
      const result = await put.call(this, request, response);
      if (typeof request === 'string' && request.startsWith('/editor.html?fresh=1&update=')) await window.disconnectAfterStaging();
      return result;
    };
  });
  await page.getByRole('button', { name: 'Update app', exact: true }).click();
  await expect(page.locator('[data-app-update-status]')).toContainText('Ready for offline use');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.locator('.home-choice').filter({ hasText: 'Notes' }).click();
  await page.getByText('Find notes', { exact: true }).click();
  await page.getByRole('button', { name: 'Unfinished', exact: true }).click();
  await page.getByRole('button', { name: 'Continue note', exact: true }).click();
  await expect(page.getByLabel('What do you want to say?')).toHaveValue('Synthetic update draft');
});

test('an interrupted network request times out with a usable retry', async ({ page }) => {
  await settings(page);
  await page.clock.install();
  let release; const hold = new Promise(resolve => { release = resolve; });
  await page.route('**/editor.html?fresh=1', async route => { await hold; await route.abort().catch(() => {}); });
  await page.getByRole('button', { name: 'Update app', exact: true }).click();
  await expect(page.locator('[data-app-update-status]')).toContainText('Loading the current app');
  await page.clock.fastForward(31000);
  await expect(page.locator('[data-app-update-status]')).toContainText('could not load');
  await expect(page.getByRole('button', { name: 'Update app', exact: true })).toBeEnabled();
  release();
});

test('repeated updates bound public staging while failed staging removes only its own files', async ({ page }) => {
  await settings(page);
  for (let count = 0; count < 3; count++) {
    const previous = page.url(); await page.getByRole('button', { name: 'Update app', exact: true }).click();
    await expect(page).not.toHaveURL(previous);
    await expect(page.locator('[data-app-update-status]')).toContainText('Ready for offline use');
  }
  const generations = () => page.evaluate(async () => [...new Set((await (await caches.open('cn-next-staged-app-update')).keys()).map(r => new URL(r.url).searchParams.get('update')))]);
  expect((await generations()).length).toBeLessThanOrEqual(2);
  const before = await generations();
  await page.evaluate(() => {
    const put = Cache.prototype.put; let count = 0;
    Cache.prototype.put = async function (request, response) { if (++count === 3) throw new Error('Synthetic quota failure'); return put.call(this, request, response); };
  });
  await page.getByRole('button', { name: 'Update app', exact: true }).click();
  await expect(page.locator('[data-app-update-status]')).toContainText('could not load');
  await expect.poll(generations).toEqual(before);
});

test('concurrent tabs retain every pending navigation when the connection drops', async ({ page, context }) => {
  await settings(page);
  const tabs = [page, await context.newPage(), await context.newPage()];
  for (const tab of tabs.slice(1)) { await tab.goto('/editor.html'); await expect(tab.getByRole('button', { name: 'Update app', exact: true })).toBeVisible(); }
  for (const tab of tabs) {
    await tab.evaluate(() => {
      const put = Cache.prototype.put;
      Cache.prototype.put = async function (request, response) {
        const result = await put.call(this, request, response);
        if (typeof request === 'string' && request.startsWith('/editor.html?fresh=1&update=')) await new Promise(resolve => { window.releaseStagedNavigation = resolve; });
        return result;
      };
    });
    await tab.getByRole('button', { name: 'Update app', exact: true }).click();
  }
  for (const tab of tabs) await expect.poll(() => tab.evaluate(() => !!window.releaseStagedNavigation)).toBe(true);
  await context.setOffline(true);
  await Promise.all(tabs.map(tab => tab.evaluate(() => window.releaseStagedNavigation())));
  for (const tab of tabs) await expect(tab.locator('[data-app-update-status]')).toContainText('Ready for offline use');
  await Promise.all(tabs.slice(1).map(tab => tab.close()));
});
