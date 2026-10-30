const { test, expect } = require('@playwright/test');
async function open(page, route = 'home') {
  await page.goto('/#' + route);
  await page.getByLabel('Account', { exact: true }).fill('reader');
  await page.getByLabel('Password', { exact: true }).fill('reader-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toHaveCount(0);
}
const back = page => page.locator('#navigation-back');
test('compact Home, consistent People and note creation star, with Back retaining changed favourites', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await expect(page.getByText('Choose what you want to say.', { exact: true })).toHaveCount(0);
  const actions = page.locator('.home-actions');
  await expect(actions.getByRole('button', { name: 'Favourites', exact: true })).toBeVisible();
  const boxes = await actions.locator('button').evaluateAll(bs => bs.slice(0, 2).map(b => b.getBoundingClientRect().top));
  expect(new Set(boxes).size).toBe(1);
  await page.locator('.home-choice').filter({ hasText: 'Notes' }).click();
  await expect(back(page)).toBeEnabled();
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await page.getByLabel('What do you want to say?', { exact: true }).fill('Star during creation fixture');
  await page.getByRole('button', { name: 'Favourite note', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Favourite note', exact: true })).toHaveText('★');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await page.getByRole('button', { name: 'Star during creation fixture', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Return to Notes', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Favourite note', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Favourite note', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Favourite note', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await back(page).click();
  await expect(page.getByRole('heading', { name: 'Notes', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Star during creation fixture', exact: true })).toBeFocused();
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.locator('.home-choice').filter({ hasText: 'People' }).click();
  await expect(page.locator('.people-board .note-open').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Read person', exact: true })).toHaveCount(0);
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/usability-people-${width}.png` });
  }
});
test('picture stars select several pictures in the category and appear at the top without reload', async ({ page }) => {
  await open(page, 'icons');
  await page.getByRole('button', { name: 'Nature and animals', exact: true }).click();
  const cards = page.locator('[data-dictionary-results] [data-symbol]');
  const first = cards.nth(0), second = cards.nth(1);
  const ids = [await first.getAttribute('data-symbol'), await second.getAttribute('data-symbol')];
  await first.locator('.favourite-star').click();
  await expect(first.locator('.favourite-star')).toHaveAttribute('aria-pressed', 'true');
  await second.locator('.favourite-star').click();
  await expect(second.locator('.favourite-star')).toHaveAttribute('aria-pressed', 'true');
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/usability-pictures-${width}.png` });
  }
  await back(page).click();
  for (const id of ids) await expect(page.locator('[data-dictionary-favourites] [data-symbol="' + id + '"]')).toBeVisible();
  expect(await page.locator('[data-dictionary-favourites] [data-symbol]').evaluateAll((cs, ids) => cs.map(c => c.dataset.symbol).filter(id => ids.includes(id)), ids)).toEqual(ids);
});

test('picture favourite stars stay visually quiet with separate usable tap targets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, 'icons');
  await page.getByRole('button', { name: 'Nature and animals', exact: true }).click();
  const card = page.locator('[data-dictionary-results] [data-symbol]').first();
  const star = card.locator('.favourite-star');
  if (await star.getAttribute('aria-pressed') === 'true') await star.click();
  for (const selected of [false, true]) {
    if (selected) await star.click();
    await expect(star).toHaveAttribute('aria-pressed', String(selected));
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      const geometry = await star.evaluate(button => {
        const style = getComputedStyle(button), r = button.getBoundingClientRect();
        const picture = button.parentElement.querySelector('.dictionary-word').getBoundingClientRect();
        return { width: r.width, height: r.height, font: parseFloat(style.fontSize), background: style.backgroundColor, border: style.borderTopWidth, outline: style.outlineStyle, overlap: r.top < picture.bottom && r.bottom > picture.top };
      });
      expect(geometry.width).toBe(44);
      expect(geometry.height).toBeGreaterThanOrEqual(44);
      expect(geometry.font).toBeLessThanOrEqual(18);
      expect(geometry.background).toBe('rgba(0, 0, 0, 0)');
      expect(geometry.border).toBe('0px');
      expect(geometry.outline).toBe('none');
      expect(geometry.overlap).toBe(false);
    }
  }
  await page.keyboard.press('Tab');
  await star.focus();
  await expect(star).toBeFocused();
  expect(await star.evaluate(b => getComputedStyle(b).outlineStyle)).toBe('solid');
  await page.keyboard.press('Space');
  await expect(star).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('Space');
  await expect(star).toHaveAttribute('aria-pressed', 'true');
  await star.evaluate(b => b.blur());
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.screenshot({ path: `output/picture-stars-${width}.png` });
  }
});
test('notebook star refreshes browser Back list and bulk delete removes selected notebooks permanently', async ({ page }) => {
  await open(page, 'notebooks');
  await expect(page.getByRole('heading', { name: 'Situation notebooks', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const repository = new NextRepository(); await repository.session();
    for (const name of ['A bulk delete fixture', 'B bulk delete fixture']) {
      const p = NextBook.addition('notebook', 'notebooks', name, crypto.randomUUID(), name);
      p.notebook = { title: name, createdAt: '2026-10-08', sections: [] };
      await repository.request('workspaces/demo/operations', { recordId: p.id, payload: p, base: 0, operation: crypto.randomUUID() });
    }
    await NextTrial.checkUpdates();
  });
  await page.reload();
  await expect(back(page)).toBeEnabled();
  await page.getByRole('button', { name: 'B bulk delete fixture', exact: true }).click();
  await page.getByRole('button', { name: 'Favourite notebook', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Favourite notebook', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await back(page).click();
  await expect(page.locator('.notebook-choice').filter({ hasText: 'bulk delete fixture' }).first()).toHaveAttribute('aria-label', 'B bulk delete fixture');
  await page.getByRole('button', { name: 'Delete notebooks', exact: true }).click();
  await page.getByLabel('A bulk delete fixture', { exact: true }).check();
  await page.getByLabel('B bulk delete fixture', { exact: true }).check();
  await page.getByRole('button', { name: /^Delete selected/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete permanently', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Situation notebooks', exact: true })).toBeVisible();
  await expect(page.locator('.notebook-choice').filter({ hasText: 'bulk delete fixture' })).toHaveCount(0);
  await page.goBack();
  await expect(page.getByText('B bulk delete fixture', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.notebook-choice').filter({ hasText: 'bulk delete fixture' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Deleted notebooks', exact: true })).toHaveCount(0);
});

test('a reconnecting device removes a deleted notebook and its stale waiting edit without replaying it', async ({ browser }) => {
  const first = await browser.newContext(), second = await browser.newContext();
  const a = await first.newPage(), b = await second.newPage();
  await open(a, 'notebooks');
  const id = await a.evaluate(async () => {
    const repo = new NextRepository(); await repo.session();
    const p = NextBook.addition('notebook', 'notebooks', 'Cross-device private fixture', crypto.randomUUID(), 'Cross-device private fixture');
    p.notebook = { title: p.name, sections: [] };
    await repo.request('workspaces/demo/operations', { recordId: p.id, base: 0, payload: p, operation: crypto.randomUUID() });
    return p.id;
  });
  await open(b, 'notebooks');
  await expect(b.getByRole('button', { name: 'Cross-device private fixture', exact: true })).toBeVisible();
  await b.evaluate(async id => {
    const store = await new NextLocalStore().open();
    const local = await store.update('reader', 'demo', d => {
      const r = d.snapshot.records[id], payload = { ...NextBook.latest(r).payload, name: 'Stale private edit fixture' }, operation = crypto.randomUUID();
      d.outbox.push({ recordId: id, base: r.current, payload, operation, action: 'edit' });
      d.drafts[id] = { id, base: r.current, payload, operation, state: 'waiting' };
      d.backup = JSON.stringify(NextModel.exportPackage(d.snapshot));
      return d;
    });
    await store.transact('scopes', 'readwrite', (os, done) => { os.put(local, store.key('reader', 'demo') + ':generation:old-test-copy'); done(true); });
    store.db.close();
  }, id);
  await a.evaluate(async id => {
    const repo = new NextRepository(); await repo.session();
    await repo.request('workspaces/demo/delete-notebooks', { confirmed: true, expected: { [id]: 1 }, operation: crypto.randomUUID() });
  }, id);
  const remaining = await b.evaluate(async () => {
    const store = await new NextLocalStore().open(), repo = new NextRepository(); await repo.session();
    const sync = new NextSync(store, repo, 'reader', 'demo', 'deletion-reconnect-fixture');
    const d = await sync.send();
    const allCopies = await store.transact('scopes', 'readonly', (os, done) => { os.getAll().onsuccess = e => done(e.target.result); });
    store.db.close(); return { local: JSON.stringify(allCopies), shared: JSON.stringify(await repo.request('workspaces/demo')), outbox: d.outbox.length };
  });
  expect(remaining.local).not.toMatch(/Cross-device private fixture|Stale private edit fixture/);
  expect(remaining.shared).not.toMatch(/Cross-device private fixture|Stale private edit fixture/);
  expect(remaining.outbox).toBe(0);
  await b.evaluate(() => NextTrial.checkUpdates());
  await expect(b.getByRole('button', { name: 'Cross-device private fixture', exact: true })).toHaveCount(0);
  await first.close(); await second.close();
});

test('retrying an unconfirmed deletion reuses its saved identity after the server committed', async ({ page }) => {
  await open(page, 'notebooks');
  await page.evaluate(async () => {
    const repo = new NextRepository(); await repo.session();
    const p = NextBook.addition('notebook', 'notebooks', 'Deletion receipt retry fixture', crypto.randomUUID(), 'Deletion receipt retry fixture');
    p.notebook = { title: p.name, sections: [] };
    await repo.request('workspaces/demo/operations', { recordId: p.id, base: 0, payload: p, operation: crypto.randomUUID() });
    await NextTrial.checkUpdates();
  });
  await page.reload();
  await page.getByRole('button', { name: 'Deletion receipt retry fixture', exact: true }).click();
  await page.locator('.notebook-options summary').click();
  const operations = []; let dropped = false;
  await page.route('**/delete-notebooks', async route => {
    operations.push(route.request().postDataJSON().operation);
    if (!dropped) { dropped = true; await route.fetch(); await route.abort(); }
    else await route.continue();
  });
  await page.getByRole('button', { name: 'Delete notebook', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete permanently', exact: true }).click();
  await expect(page.locator('#status')).toContainText('Failed to fetch');
  await page.getByRole('button', { name: 'Delete notebook', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete permanently', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Situation notebooks', exact: true })).toBeVisible();
  expect(operations).toHaveLength(2); expect(operations[1]).toBe(operations[0]);
  await expect(page.getByText('Deletion receipt retry fixture', { exact: true })).toHaveCount(0);
});
