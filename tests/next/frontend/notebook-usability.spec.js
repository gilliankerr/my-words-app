const { test, expect } = require('@playwright/test');

async function open(page, fixture = true) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByLabel('Account', { exact: true }).fill('owner');
  await page.getByLabel('Password', { exact: true }).fill('owner-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  if (fixture) await page.evaluate(async () => {
    const id = 'c6f6b544-1829-4bc1-890a-7d13fc46235c';
    const repository = new NextRepository(); await repository.session();
    const existing = await repository.request('workspaces/demo');
    if (existing.records[id]) return;
    const p = NextBook.addition('notebook', 'notebooks', 'Synthetic navigation book', id, 'Synthetic navigation book');
    p.notebook = { title: p.name, createdAt: '2026-10-08', situation: 'Opening context', frontMatter: { entityType: 'book', content: { title: 'Synthetic title', summary: 'Reference passage' } }, sections: [{ name: 'First section', words: ['First choice'] }, { name: 'Second section', words: ['Second choice'] }], unknown: { keep: true } };
    const response = await repository.request('workspaces/demo/operations', { recordId: id, base: 0, operation: crypto.randomUUID(), payload: p });
    if (response.outcome !== 'accepted') throw new Error('Fixture save failed');
  });
  await page.reload();
  await page.locator('.home-choice').filter({ hasText: 'Situation notebooks' }).click();
}

test('contents opens the selected section and browser Back follows notebook pages with retained choices', async ({ page, context }) => {
  await open(page);
  await page.getByRole('button', { name: 'Synthetic navigation book', exact: true }).click();
  await page.getByRole('button', { name: 'Second section', exact: true }).click();
  await page.screenshot({ path: test.info().outputPath('section-phone.png'), fullPage: true });
  await expect(page.getByRole('heading', { name: 'Second section', exact: true }).first()).toBeInViewport();
  await expect(page.getByText('Reference passage', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Second choice', exact: true }).click();
  await page.locator('.notebook-contents summary').click();
  await page.getByRole('button', { name: 'First section', exact: true }).click();
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Second choice', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.goForward();
  await expect(page.getByRole('button', { name: 'First choice', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('button', { name: 'First choice', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Second choice', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Synthetic navigation book', exact: true })).toBeVisible();
  await expect(page.locator('.notebook-contents')).toHaveAttribute('open', '');
});

test('permanent notebook deletion cancels safely, requires a connection and removes drafts and all revisions', async ({ page, context }) => {
  await open(page);
  await page.getByRole('button', { name: 'Synthetic navigation book', exact: true }).click();
  await page.locator('.notebook-options summary').click();
  await page.getByRole('button', { name: 'Edit notebook', exact: true }).click();
  await page.getByLabel('Context (optional)', { exact: true }).fill('Interrupted notebook draft');
  await expect.poll(() => page.evaluate(async () => {
    const s = await new NextLocalStore().open(), d = await s.read('owner', 'demo');
    return Object.values(d.drafts).some(x => x.payload.notebook?.context === 'Interrupted notebook draft');
  })).toBe(true);
  await page.goBack();
  await page.getByRole('button', { name: 'Delete notebook', exact: true }).click();
  await page.getByRole('button', { name: 'Keep notebooks', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Synthetic navigation book', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete notebook', exact: true })).toBeFocused();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Delete notebook', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete permanently', exact: true }).click();
  await expect(page.locator('#status')).toContainText('Connect to the internet');
  await expect(page.getByRole('heading', { name: 'Synthetic navigation book', exact: true })).toBeVisible();
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Delete notebook', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete permanently', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Situation notebooks', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Synthetic navigation book', exact: true })).toHaveCount(0);
  const remaining = await page.evaluate(async () => {
    const s = await new NextLocalStore().open(), d = await s.read('owner', 'demo');
    const repository = new NextRepository(); await repository.session();
    return { local: JSON.stringify(d), shared: JSON.stringify(await repository.request('workspaces/demo')) };
  });
  expect(remaining.local).not.toMatch(/Synthetic navigation book|Interrupted notebook draft|Reference passage/);
  expect(remaining.shared).not.toMatch(/Synthetic navigation book|Reference passage/);
  await page.goBack();
  await expect(page.getByText('Synthetic navigation book', { exact: true })).toHaveCount(0);
});

test('Book club is the first creation choice above the form on a phone and tablet', async ({ page }) => {
  await open(page, false);
  await page.getByRole('button', { name: 'Create notebook', exact: true }).click();
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    const book = page.getByRole('button', { name: 'Book club', exact: true });
    await expect(book).toBeInViewport();
    await expect(page.locator('[data-situation-picks] button').first()).toHaveText('Book club');
    expect((await book.boundingBox()).y).toBeLessThan((await page.getByLabel('Describe the situation', { exact: true }).boundingBox()).y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('create-' + width + '.png'), fullPage: true });
  }
});


