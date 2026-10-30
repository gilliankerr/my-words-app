const { test, expect } = require('@playwright/test');
const manifest = require('../../../app-next/assets/dictionary/manifest.json');
async function signIn(page, route) {
  await page.goto('/#' + route);
  await page.getByLabel('Account', { exact: true }).fill('reader');
  await page.getByLabel('Password', { exact: true }).fill('reader-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
test('all category pictures are available without another loading action, with related Nature groups', async ({ page }) => {
  await signIn(page, 'icons');
  await page.getByRole('button', { name: 'Nature and animals', exact: true }).click();
  await expect(page.locator('[data-dictionary-results] [data-symbol]')).toHaveCount(manifest.symbols.filter(s => s.group === 'Nature and animals').length);
  await expect(page.getByRole('button', { name: 'Show more pictures', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Animals', exact: true })).toBeVisible();
  const animals = page.locator('[data-picture-group="Animals"]');
  await expect(animals.getByRole('button', { name: 'Show Elephant', exact: true })).toBeVisible();
  await expect(animals.getByRole('button', { name: 'Show Forest', exact: true })).toHaveCount(0);
});
test('shopping restores grouped catalogue and Notes opens by tapping its wording', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'shopping');
  await expect(page.getByRole('heading', { name: 'Vegetables', exact: true })).toBeVisible();
  await page.screenshot({ path: 'output/shopping-corrected-phone.png' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByLabel('Find an item', { exact: true }).fill('Broccoli');
  // The shared disposable workspace can already contain a checked item from
  // another case. Ensure this action actually changes it before expecting a save.
  if (await page.getByLabel('Broccoli', { exact: true }).isChecked()) {
    await page.getByLabel('Broccoli', { exact: true }).uncheck();
    await expect(page.locator('#status')).toHaveText('Shopping list saved.');
  }
  await page.getByLabel('Broccoli', { exact: true }).check();
  await expect(page.getByRole('status')).toHaveText('Shopping list saved.');
  await page.reload();
  await expect(page.getByLabel('Broccoli', { exact: true })).toBeChecked();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('.shopping-grid .check-row').evaluateAll(rows => rows.every(row => row.getBoundingClientRect().height >= 48))).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#notes');
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await page.getByLabel('What do you want to say?', { exact: true }).fill('My complete message');
  await page.getByLabel('Title (optional)', { exact: true }).fill('Tap this note');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Read note', exact: true })).toHaveCount(0);
  const note = page.locator('[data-note]').filter({ hasText: 'Tap this note' }).locator('.note-open');
  // Prior cases may have saved larger reading choices; respect that preference.
  const readingSize = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize) * .8);
  await expect(note).toHaveCSS('font-size', readingSize + 'px');
  await page.screenshot({ path: 'output/notes-corrected-phone.png' });
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await note.boundingBox()).height).toBeGreaterThanOrEqual(44);
  }
  await note.click();
  await expect(page.locator('main > .passage')).toHaveText('My complete message');
});

test('saved notebook stars and newest creation order agree in the communication collection', async ({ page }) => {
  await signIn(page, 'notebooks');
  await expect(page.getByRole('heading', { name: 'Situation notebooks', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const repository = new NextRepository(); await repository.session();
    for (const [name, date, star] of [['Older', '2024-01-01', false], ['Newest', '2026-10-07', false], ['Starred', '2020-01-01', true]]) {
      const p = NextBook.addition('notebook', 'notebooks', 'Order fixture ' + name, crypto.randomUUID(), 'Order fixture ' + name);
      p.notebook = { title: p.name, createdAt: date, sections: [{ name: 'Opinions', messages: ['Complete fixture message'] }] }; p.printFavourite = star;
      await repository.request('workspaces/demo/operations', { recordId: p.id, payload: p, base: 0, operation: crypto.randomUUID() });
    }
    await NextTrial.checkUpdates();
  });
  await page.reload();
  const choices = page.locator('.notebook-choice').filter({ hasText: 'Order fixture' });
  await expect(choices).toHaveCount(3);
  expect(await choices.evaluateAll(rows => rows.map(row => row.getAttribute('aria-label')))).toEqual(['Order fixture Starred', 'Order fixture Newest', 'Order fixture Older']);
  await page.getByRole('button', { name: 'Order fixture Older', exact: true }).click();
  await page.getByText('Edit or delete notebook', { exact: true }).click();
  await page.getByRole('button', { name: 'Favourite notebook', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Favourite notebook', exact: true, includeHidden: true })).toHaveCount(1);
  await page.getByText('Edit or delete notebook', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Favourite notebook', exact: true })).toBeVisible();
  await page.locator('#navigation-back').click();
  await expect(choices).toHaveCount(3);
  expect(await choices.evaluateAll(rows => rows.map(row => row.getAttribute('aria-label')))).toEqual(['Order fixture Older', 'Order fixture Starred', 'Order fixture Newest']);
});
