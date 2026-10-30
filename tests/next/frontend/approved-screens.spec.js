const { test, expect } = require('@playwright/test');
const { openNoteTools } = require('./note-tools');

async function open(page) {
  await page.goto('/');
  await page.getByLabel('Account', { exact: true }).fill('owner');
  await page.getByLabel('Password', { exact: true }).fill('owner-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
}

test('failed online sign-out closes local content and offers an honest retry', async ({ page }) => {
  await open(page); await page.goto('/editor.html');
  await page.route('**/api/sign-out', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Unavailable' }) }));
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Open My Words', exact: true })).toBeVisible();
  await expect(page.getByText('Local content is closed. Online sign-out was not confirmed. Retry when connected.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Open My Words', exact: true })).toBeVisible();
  await page.unroute('**/api/sign-out');
  await page.getByRole('button', { name: 'Retry sign out', exact: true }).click();
  await expect(page.getByText('Signed out. Saved content and drafts remain in their own account store.', { exact: true })).toBeVisible();
});

test('approved Home keeps eight destinations in two columns, with shared navigation', async ({ page }) => {
  await open(page);
  await expect(page.locator('.home-choice .choice-label')).toHaveText([
    'Quick words', 'People', 'Personal information', 'Notes', 'Icons',
    'Communication book', 'Situation notebooks', 'Shopping list'
  ]);
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.locator('#navigation-back')).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Add note', exact: true })).toHaveCount(0);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    const rectangles = await page.locator('.home-choice').evaluateAll(els => els.map(e => {
      const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, h: r.height };
    }));
    expect(rectangles[0].y).toBe(rectangles[1].y);
    expect(rectangles[1].x).toBeGreaterThan(rectangles[0].x);
    expect(rectangles.every(r => r.h >= 44)).toBe(true);
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    const navBounds = await nav.boundingBox();
    const settings = await nav.getByRole('link', { name: 'Settings', exact: true }).boundingBox();
    expect(Math.abs(settings.x + settings.width - navBounds.x - navBounds.width)).toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('book words highlight in place and excluded resources stay out of communication', async ({ page }) => {
  await open(page);
  await page.locator('.home-choice').filter({ hasText: 'Communication book' }).click();
  await expect(page.getByRole('button', { name: 'Communication Partner Guide', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Rescue words', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Dining & Restaurants', exact: true }).click();
  const word = page.locator('.words button').first();
  await word.click(); await expect(word).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await word.click(); await expect(word).toHaveAttribute('aria-pressed', 'false');
});

 test('Back restores the previous communication screen and its route', async ({ page }) => {
   await open(page);
   await page.locator('.home-choice').filter({ hasText: 'Communication book' }).click();
   await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Back', exact: true }).click();
   await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
   await expect(page).toHaveURL(/#home$/);
 });

test('personal reading keeps medical wording behind an explicit reveal', async ({ page }) => {
  await page.route('**/api/workspaces/demo', async route => {
    const response = await route.fetch(); const workspace = await response.json();
    workspace.content.templateFields = { fictional_medical_info: 'Fictional private medication detail' };
    workspace.edition.content.templateFields = structuredClone(workspace.content.templateFields);
    workspace.editions[workspace.edition.id].content.templateFields = structuredClone(workspace.content.templateFields);
    await route.fulfill({ response, json: workspace });
  });
  await open(page);
  await page.locator('.home-choice').filter({ hasText: 'Personal information' }).click();
  await expect(page.getByText('My name is Morgan.', { exact: false })).toBeVisible();
  await expect(page.getByText('Fictional private medication detail', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show page', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Medical info', exact: true }).click();
  await expect(page.getByText('Fictional private medication detail', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hide medical info', exact: true }).click();
  await expect(page.getByText('Fictional private medication detail', { exact: true })).toHaveCount(0);
});

test('Edit note deletion preserves cancelled wording and offers Undo and Recently deleted recovery', async ({ page }) => {
  await open(page); await page.goto('/#notes');
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await page.getByLabel('Title (optional)').fill('Recoverable fixture');
  await page.getByLabel('What do you want to say?').fill('Complete original wording');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await page.locator('[data-note]').filter({ hasText: 'Recoverable fixture' }).locator('.note-open').click();
  await page.getByRole('button', { name: 'Edit note', exact: true }).click();
  await page.getByLabel('What do you want to say?').fill('An unfinished change');
  await page.getByRole('button', { name: 'Delete note', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Keep note', exact: true }).click();
  await expect(page.getByLabel('What do you want to say?')).toHaveValue('An unfinished change');
  await page.getByRole('button', { name: 'Delete note', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete note', exact: true }).click();
  await expect(page.locator('[data-note]').filter({ hasText: 'Recoverable fixture' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo delete', exact: true }).click();
  await expect(page.locator('[data-note]').filter({ hasText: 'Recoverable fixture' })).toBeVisible();
  await openNoteTools(page);
  await page.getByRole('button', { name: 'Recently deleted', exact: true }).click();
  await expect(page.locator('[data-note]').filter({ hasText: 'Recoverable fixture' })).toHaveCount(0);
});

test('a complete notebook is saved locally, edited and reopened offline', async ({ page, context }) => {
  await open(page); await page.locator('.home-choice').filter({ hasText: 'Situation notebooks' }).click();
  await page.getByRole('button', { name: 'Create notebook', exact: true }).click();
  await page.getByRole('button', { name: 'Write notebook myself', exact: true }).click();
  await page.getByLabel('Notebook name', { exact: true }).fill('Fictional conversation');
  await page.getByLabel('Describe the situation', { exact: true }).fill('An evening discussion');
  await page.getByRole('button', { name: 'Add section', exact: true }).click();
  await page.getByLabel('Section name', { exact: true }).fill('Opinions');
  await page.getByRole('button', { name: 'Add message', exact: true }).click();
  await page.getByLabel('messages 1', { exact: true }).fill('I would like to discuss the ending.');
  await page.getByRole('button', { name: 'Save notebook', exact: true }).click();
  await expect(page.getByText('I would like to discuss the ending.', { exact: true })).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })); });
  await context.setOffline(true); await page.reload();
  await page.getByRole('button', { name: 'Fictional conversation', exact: true }).click();
  await expect(page.getByText('I would like to discuss the ending.', { exact: true })).toBeVisible();
  await page.getByText('Edit or delete notebook', { exact: true }).click();
  await page.getByRole('button', { name: 'Edit notebook', exact: true }).click();
  await page.getByLabel('messages 1', { exact: true }).fill('A complete revised opinion.');
  await page.getByRole('button', { name: 'Save notebook', exact: true }).click();
  await expect(page.getByText('A complete revised opinion.', { exact: true })).toBeVisible();
});

test('Settings stars persist and a saved situation booklet uses a frozen complete message', async ({ page }) => {
  await open(page); await page.goto('/#notebooks');
  await page.getByRole('button', { name: 'Create notebook', exact: true }).click();
  await page.getByRole('button', { name: 'Write notebook myself', exact: true }).click();
  await page.getByLabel('Notebook name', { exact: true }).fill('Fictional printed conversation');
  await page.getByRole('button', { name: 'Add section', exact: true }).click();
  await page.getByLabel('Section name', { exact: true }).fill('Questions');
  await page.getByRole('button', { name: 'Add message', exact: true }).click();
  await page.getByLabel('messages 1', { exact: true }).fill('Could we talk about the whole chapter?');
  await page.getByRole('button', { name: 'Save notebook', exact: true }).click();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Favourite Fictional printed conversation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Favourite Fictional printed conversation', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Favourite Fictional printed conversation', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Fictional printed conversation', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Saved PDF preview ready.');
  const event = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save PDF', exact: true }).click();
  await (await event).saveAs('test-results/next/compactCommunicationBook-situation-booklet.pdf');
});
