const { test, expect } = require('@playwright/test');

test('all-section search shares compact Notes targets and retains context on Back', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#search');
  await page.getByLabel('Account', { exact: true }).fill('reader');
  await page.getByLabel('Password', { exact: true }).fill('reader-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const query = page.getByLabel('Search all sections', { exact: true });
  await expect(query).toBeVisible();
  // Other suites intentionally persist shared display preferences in the harness.
  await page.evaluate(() => { document.documentElement.style.fontSize = '20px'; });
  await query.fill('dog');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const dog = page.locator('.search-results').getByRole('button', { name: 'Dog', exact: true });
  await expect(dog).toBeVisible();
  await expect(page.locator('.search-results button').filter({ hasText: /^Read / })).toHaveCount(0);
  await expect(page.locator('.search-results')).not.toContainText('Dog Dog');
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    const bounds = await dog.evaluate(b => ({ height: b.getBoundingClientRect().height, font: getComputedStyle(b).fontSize }));
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    expect(bounds.font).toBe('16px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `output/search-compact-${width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await dog.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Dog', exact: true })).toBeVisible();
  await page.goBack();
  await expect(query).toHaveValue('dog');
  await expect(dog).toBeFocused();
  await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
  expect(await dog.evaluate(b => getComputedStyle(b).fontSize)).toBe('25.6px');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(dog).toBeVisible();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(query).toHaveValue('');
  await expect(page.locator('.search-results button')).toHaveCount(0);
});

test('search opens complete note wording with the same text size as Notes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#notes');
  await page.getByLabel('Account', { exact: true }).fill('reader');
  await page.getByLabel('Password', { exact: true }).fill('reader-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  const clue = 'Search layout fixture ' + Date.now();
  const wording = clue + ': my dog enjoys the garden. ' + 'Complete wording remains available. '.repeat(4);
  await page.getByLabel('What do you want to say?', { exact: true }).fill(wording);
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  const note = page.getByRole('button', { name: new RegExp('^' + clue + ':') });
  await expect(note).toBeVisible();
  const size = await note.evaluate(b => getComputedStyle(b).fontSize);
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Search all sections', exact: true }).click();
  await page.getByLabel('Search all sections', { exact: true }).fill(clue);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(note).toBeVisible();
  await expect(note).toHaveCSS('font-size', size);
  await page.screenshot({ path: 'output/search-complete-note-390.png' });
  await note.click();
  await expect(page.locator('main .passage')).toHaveText(wording.trim());
  await page.locator('#navigation-back').click();
  await expect(page.getByLabel('Search all sections', { exact: true })).toHaveValue(clue);
  await expect(note).toBeFocused();
});

test('personal and medical passage text is always included without a checkbox, including offline search and Back', async ({ page, context }) => {
  await page.goto('/#search');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  const clue = 'personal-search-' + Date.now();
  await page.evaluate(async clue => {
    const repo = new NextRepository(); await repo.signIn('owner', 'owner-fictional-only');
    for (const [name, medical] of [['Fictional basic details', false], ['Fictional health details', true]]) {
      const p = { ...NextBook.addition('page', 'personal', 'Retained complete passage ' + clue, crypto.randomUUID(), name), medical };
      await repo.request('workspaces/demo/operations', { recordId: p.id, base: 0, operation: crypto.randomUUID(), payload: p });
    }
  }, clue);
  await page.getByLabel('Account', { exact: true }).fill('reader');
  await page.getByLabel('Password', { exact: true }).fill('reader-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const query = page.getByLabel('Search all sections', { exact: true });
  await expect(query).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Include personal details', exact: true })).toHaveCount(0);
  await query.fill(clue); await page.getByRole('button', { name: 'Search', exact: true }).click();
  const basic = page.getByRole('button', { name: 'Fictional basic details', exact: true });
  const medical = page.getByRole('button', { name: 'Fictional health details', exact: true });
  await expect(basic).toBeVisible(); await expect(medical).toBeVisible();
  await basic.click(); await expect(page.locator('.personal-passage').filter({ hasText: 'Fictional basic details' })).toContainText(clue);
  await page.goBack(); await expect(query).toHaveValue(clue); await expect(basic).toBeFocused();
  for (const width of [390, 768]) { await page.setViewportSize({ width, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: `test-results/next/search-personal-always-${width}.png`, fullPage: true }); }
  await page.evaluate(() => navigator.serviceWorker.ready); await context.setOffline(true); await page.reload();
  await query.fill(clue); await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(basic).toBeVisible(); await expect(medical).toBeVisible();
  await expect(page.getByText('Include personal details', { exact: true })).toHaveCount(0);
});
