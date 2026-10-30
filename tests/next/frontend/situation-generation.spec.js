const { test, expect } = require('@playwright/test');
test('saved notebook opens with its name, date and visible contents before its full wording', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const main = document.getElementById('main');
    const node = (tag, text, parent, cls) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; parent?.append(el); return el; };
    const payload = { id: 'synthetic-cover', kind: 'notebook', name: 'Synthetic booklet', notebook: { title: 'Synthetic booklet', createdAt: '2026-10-07T12:00:00Z', situation: 'Complete context.', sections: [{ name: 'Discussion', words: ['Housing'] }] } };
    const ctx = { main, node, clear: name => { main.replaceChildren(); node('h1', name, main); }, records: () => [payload], button: (label, fn, parent = main, cls) => { const b = node('button', label, parent, cls); b.onclick = fn; return b; } };
    NextNotebooks.read(ctx, payload);
  });
  await expect(page.locator('.notebook-date')).toContainText('2026');
  await expect(page.locator('.notebook-contents')).toHaveAttribute('open', '');
  const order = await page.locator('main > *').evaluateAll(els => els.map(el => el.tagName));
  expect(order.slice(0, 2)).toEqual(['H1', 'P']);
  const contents = await page.locator('.notebook-contents').boundingBox();
  expect(contents.y).toBeLessThan((await page.getByText('Complete context.', { exact: true }).boundingBox()).y);
  await expect(page.getByRole('button', { name: 'Discussion', exact: true })).toBeVisible();
  await expect(page.getByText('Complete context.', { exact: true })).toBeVisible();
});
const fixture = () => ({ title: 'Synthetic generated notebook', sections: [{ id: 'discussion', name: 'Discussion', context: 'Full context', words: ['First word'], items: [{ text: 'A complete thought.', context: 'Specific item context', futureItem: 8 }] }], frontMatter: { entityType: 'book', entityName: 'Synthetic book', content: { title: 'Synthetic book', author: 'Synthetic author', summary: 'A complete synthetic summary', mainCharacters: ['Synthetic person — complete recognition description'], themes: ['Synthetic theme'], discussionStarters: ['What did you think of this book?'] } }, future: { preserved: true } });
async function start(page) {
  await page.goto('/#home'); await page.getByLabel('Account', { exact: true }).fill('owner'); await page.getByLabel('Password', { exact: true }).fill('owner-fictional-only'); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.getByRole('button', { name: /Situation notebooks/ }).click(); await page.getByRole('button', { name: 'Create notebook', exact: true }).click();
}

for (const lookup of [true, false]) test(`notebook confirmation shows immediate progress and recovers after failure (lookup=${lookup})`, async ({ page }) => {
  await start(page);
  await page.getByLabel('Describe the situation', { exact: true }).fill('Book club discussing Synthetic book');
  await page.getByLabel('Look up specific details online', { exact: true }).check();
  let release, requests = 0;
  await page.route('**/api/workspaces/demo/situation-generation', async route => {
    requests++;
    if (route.request().postDataJSON().action === 'detect') return route.fulfill({ json: { success: true, entities: [{ type: 'book', name: 'Synthetic book', description: 'A fictional book' }] } });
    await new Promise(resolve => { release = resolve; });
    await route.fulfill({ status: 503, json: { error: 'private diagnostic' } });
  });
  await page.getByRole('button', { name: 'Create My Notebook', exact: true }).click();
  const label = lookup ? 'Yes, look up this book' : 'No, use general vocabulary';
  await page.getByRole('button', { name: label, exact: true }).click();
  try {
    const pending = page.getByRole('button', { name: lookup ? 'Looking up book…' : 'Creating notebook…', exact: true });
    await expect(pending).toBeDisabled();
    await expect(pending).toHaveAttribute('aria-busy', 'true');
    const progress = page.locator('[data-generation-progress]');
    await expect(progress).toContainText('Your request was received.');
    await expect(progress).toContainText('Please wait');
    await pending.dispatchEvent('click');
    expect(requests).toBe(2);
    for (const width of [390, 768]) {
      await page.setViewportSize({ width, height: 845 });
      await expect(progress).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/next/confirmation-progress-${lookup}-${width}.png`, fullPage: true });
    }
  } finally { release?.(); }
  await expect(page.locator('[data-generation-error]')).toContainText('Try again');
  await expect(page.getByRole('button', { name: label, exact: true })).toBeEnabled();
  await expect(page.locator('[data-generation-progress]')).toBeHidden();
  await expect(page.locator('main')).not.toContainText('private diagnostic');
});

test('original Book club quick pick stays visible and confirms the specific book before lookup', async ({ page }) => {
  await start(page);
  const book = page.getByRole('button', { name: 'Book club', exact: true });
  await expect(book).toBeVisible();
  await expect(page.getByRole('button', { name: 'Grocery shopping', exact: true })).toBeVisible();
  await book.click();
  await expect(page.getByLabel('Describe the situation', { exact: true })).toHaveValue('Book club meeting to discuss [book title]');
  await page.getByLabel('Describe the situation', { exact: true }).fill('Book club meeting to discuss Synthetic book');
  await page.getByLabel('Look up specific details online', { exact: true }).check();
  const requests = [];
  await page.route('**/api/workspaces/demo/situation-generation', route => { const body = route.request().postDataJSON(); requests.push(body); return route.fulfill({ json: { success: true, entities: [{ type: 'book', name: 'Synthetic book', description: 'A fictional title to verify' }] } }); });
  await page.getByRole('button', { name: 'Create My Notebook', exact: true }).click();
  await expect(page.getByText('We found a specific book', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Yes, look up this book', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'No, use general vocabulary', exact: true })).toBeVisible();
  expect(requests.map(r => r.action)).toEqual(['detect']);
});
test('situation creation confirms optional entity, reviews complete results, edits and saves a named envelope offline', async ({ page, context }) => {
  await start(page); const requests = [];
  await page.route('**/api/workspaces/demo/situation-generation', route => { const body = route.request().postDataJSON(); requests.push(body); return route.fulfill({ json: body.action === 'detect' ? { success: true, entities: [{ name: 'Synthetic book', type: 'book', description: 'A fictional book' }] } : { success: true, notebook: fixture() } }); });
  await page.getByLabel('Describe the situation', { exact: true }).fill('Book club discussing Synthetic book'); await page.getByLabel('Look up specific details online', { exact: true }).check(); await page.getByRole('button', { name: 'Create My Notebook', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Confirm details', exact: true })).toBeVisible(); expect(requests).toHaveLength(1); await page.getByRole('button', { name: 'Yes, look up this book', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review notebook', exact: true })).toBeVisible(); await expect(page.locator('main')).toContainText('A complete thought.'); await expect(page.locator('main')).toContainText('A complete synthetic summary'); expect(requests[1]).toMatchObject({ confirmed: true, entity: { name: 'Synthetic book' } });
  const reference = page.locator('[data-book-reference]');
  await expect(reference.getByRole('heading')).toHaveText(['About this book', 'Title', 'Author', 'Summary', 'People and characters', 'Themes', 'Discussion starters']);
  await expect(reference).toContainText('Synthetic author');
  await expect(reference).toContainText('Synthetic person — complete recognition description');
  await expect(reference).toContainText('What did you think of this book?');
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 845 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/next/browser-run/situation-review-' + width + '.png', fullPage: true });
  }
  await page.getByRole('button', { name: 'Edit notebook contents', exact: true }).click(); await page.getByLabel('items 1', { exact: true }).fill('Revised complete thought.'); await page.getByLabel('items 1 context', { exact: true }).fill('Revised item context'); await page.getByLabel('Front matter: content / summary', { exact: true }).fill('Revised synthetic summary'); await page.getByRole('button', { name: 'Done editing', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Review notebook', exact: true })).toBeVisible(); await expect(page.locator('main')).toContainText('Revised complete thought.'); await expect(page.locator('main')).toContainText('Revised synthetic summary');
  await page.getByLabel('Notebook name', { exact: true }).fill('Synthetic named notebook'); await page.evaluate(() => navigator.serviceWorker.ready); await context.setOffline(true); await page.reload(); await page.getByRole('button', { name: /Continue Synthetic named notebook/ }).click(); await expect(page.getByRole('heading', { name: 'Review notebook', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save notebook', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Synthetic named notebook', exact: true })).toBeVisible(); await expect(page.locator('main')).toContainText('Revised complete thought.');
  await context.setOffline(false); await page.reload();
  const saved = await page.evaluate(async () => { const store = await new NextLocalStore().open(); const d = await store.read('owner', 'demo'); return Object.values(d.drafts).find(d => d.payload.name === 'Synthetic named notebook').payload; });
  expect(saved.notebook.future).toEqual({ preserved: true }); expect(saved.notebook.sections[0].items[0]).toMatchObject({ text: 'Revised complete thought.', context: 'Revised item context', futureItem: 8 }); expect(saved.notebook.frontMatter.content.summary).toBe('Revised synthetic summary');
});
test('failed situation generation and unfinished description survive navigation and reload', async ({ page }) => {
  await start(page); await page.getByLabel('Describe the situation', { exact: true }).fill('Synthetic retained situation'); await page.route('**/api/workspaces/demo/situation-generation', route => route.fulfill({ status: 503, json: { error: 'raw private error' } })); await page.getByRole('button', { name: 'Create My Notebook', exact: true }).click(); await expect(page.locator('[data-generation-error]')).toContainText('could not');
  await page.locator('#navigation-back').click(); await page.reload(); await page.getByRole('button', { name: /Continue Synthetic retained situation/ }).click(); await expect(page.getByLabel('Describe the situation', { exact: true })).toHaveValue('Synthetic retained situation'); await expect(page.locator('main')).not.toContainText('raw private error');
});
test('invalid replacement generation retains earlier results and late results cannot reopen a departed screen', async ({ page }) => {
  await start(page); let response = { success: true, notebook: fixture() }; await page.route('**/api/workspaces/demo/situation-generation', route => route.fulfill({ json: response }));
  await page.getByLabel('Describe the situation', { exact: true }).fill('Synthetic original situation'); await page.getByRole('button', { name: 'Create My Notebook', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Review notebook', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Change situation', exact: true }).click(); await page.getByLabel('Describe the situation', { exact: true }).fill('Synthetic replacement situation'); response = { success: true, notebook: { title: 'Incomplete' } }; await page.getByRole('button', { name: 'Create My Notebook', exact: true }).click(); await expect(page.locator('[data-generation-error]')).toContainText('could not');
  await page.getByRole('button', { name: 'Review earlier results', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Review notebook', exact: true })).toBeVisible(); await expect(page.locator('main')).toContainText('A complete thought.');
  await page.getByRole('button', { name: 'Change situation', exact: true }).click(); let release, captured; const intercepted = new Promise(r => { captured = r; }); await page.unroute('**/api/workspaces/demo/situation-generation'); await page.route('**/api/workspaces/demo/situation-generation', async route => { captured(); await new Promise(r => { release = r; }); await route.fulfill({ json: { success: true, notebook: fixture() } }); });
  await page.getByRole('button', { name: 'Create My Notebook', exact: true }).click(); await intercepted; await page.getByRole('link', { name: 'Home', exact: true }).click(); release(); await page.waitForTimeout(150); await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
});
