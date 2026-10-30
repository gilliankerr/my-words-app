const { test, expect } = require('@playwright/test');

test('Help explains preparation and printing, opens the same preparation page and returns offline', async ({ page, context }, testInfo) => {
  await page.goto('/editor.html');
  await page.getByLabel('Account', { exact: true }).fill('owner');
  await page.getByLabel('Password', { exact: true }).fill('owner-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const help = page.getByRole('button', { name: 'Help using My Words', exact: true });
  await expect(help).toBeVisible();
  await help.click();
  await expect(page.getByRole('heading', { name: 'Help', exact: true })).toBeVisible();
  for (const title of ['Print the Communication book', 'Print a situation notebook', 'Change saved content', 'Update the app', 'Saving and offline use', 'Back up or restore work']) await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page.getByText(/flip on the short edge/)).toBeVisible();
  await expect(page.getByText(/Download unfinished edits/)).toBeVisible();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 915 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 768) await page.screenshot({ path: testInfo.outputPath('help-tablet.png'), fullPage: true });
  }
  await page.getByRole('button', { name: 'Prepare or change content', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Prepare or change content', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Help using My Words', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Help', exact: true })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready); await context.setOffline(true);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Prepare or change content', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Help using My Words', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Help using My Words', exact: true }).click();
  await page.getByRole('button', { name: 'Go to printing', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print Communication book', exact: true })).toBeInViewport();
});
test('Settings keeps editing on a separate preparation page with reliable Back and Forward', async ({ page, context }, testInfo) => {
  await page.goto('/editor.html'); await page.getByLabel('Account', { exact: true }).fill('owner'); await page.getByLabel('Password', { exact: true }).fill('owner-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const printing = page.getByRole('region', { name: 'Print booklets', exact: true });
  await expect(printing.getByRole('button', { name: 'Print Communication book', exact: true })).toBeVisible();
  await expect(printing.getByRole('heading', { name: 'Situation notebooks', exact: true })).toBeVisible();
  await expect(page.getByLabel('Search saved notebooks', { exact: true })).toBeVisible();
  const prepare = page.getByRole('button', { name: 'Prepare or change content', exact: true });
  await expect(prepare).toBeVisible();
  for (const label of ['Edit book', 'Situation notebooks', 'Quick words', 'Icons', 'People', 'Notes', 'Shopping list', 'Personal information']) await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0);
  await expect(page.getByText('Find saved phrase or page', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Reading choices' }).getByRole('button', { name: 'Display choices', exact: true })).toBeVisible();
  const backups = page.getByRole('region', { name: 'Backups and recovery', exact: true });
  await expect(backups).toBeVisible();
  await expect(page.getByRole('button', { name: /^Continue unfinished edits/ })).toHaveCount(0);
  await expect(page.getByText('Use your personal device. For beta help or account recovery, contact the person who invited you.', { exact: true })).toHaveCount(0);
  for (const width of [320, 390, 412, 768, 1280]) {
    await page.setViewportSize({ width, height: 915 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('button', { name: 'Update app', exact: true })).toBeInViewport();
    await expect(printing.getByRole('button', { name: 'Print Communication book', exact: true })).toBeInViewport();
    if ([390, 768, 1280].includes(width)) await page.screenshot({ path: testInfo.outputPath(`settings-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 412, height: 915 }); await page.evaluate(() => scrollTo(0, 0));
  await expect(page.getByRole('button', { name: 'Update app', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Update app', exact: true }).focus(); await page.keyboard.press('Tab');
  await expect(printing.getByRole('button', { name: 'Print Communication book', exact: true })).toBeFocused();
  await page.getByText('Download or restore a backup', { exact: true }).click();
  await expect(backups.getByRole('button', { name: 'Download saved content', exact: true })).toBeVisible();
  await expect(backups.getByRole('button', { name: 'Download unfinished edits', exact: true })).toBeVisible();
  await expect(backups.getByRole('button', { name: 'Retry sending', exact: true })).toHaveCount(0);
  for (const label of ['Print letter', 'Print a5', 'Print booklet']) await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0);
  await prepare.click();
  await expect(page.getByRole('heading', { name: 'Prepare or change content', exact: true })).toBeVisible();
  for (const label of ['Change book words', 'Edit a saved notebook', 'Prepare a word group', 'Change picture labels and favourites', 'Update someone’s details', 'Add or edit a note', 'Update personal and medical details', 'Change shopping items']) await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
  for (const width of [390, 768]) {
    await page.setViewportSize({ width, height: 915 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`preparation-${width}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'Add or edit a note', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Notes', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Prepare or change content', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add or edit a note', exact: true })).toBeFocused();
  await page.evaluate(() => navigator.serviceWorker.ready); await context.setOffline(true);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(prepare).toBeFocused();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Prepare or change content', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(page.locator('.home-choice .choice-label')).toHaveText(['Quick words', 'People', 'Personal information', 'Notes', 'Icons', 'Communication book', 'Situation notebooks', 'Shopping list']);
  await expect(page.getByRole('button', { name: 'Prepare or change content', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Change book words', exact: true })).toHaveCount(0);
});

test('unfinished editing is offered only when there is a retained edit to continue', async ({ page }) => {
  const { savedShortcuts } = require('../saved-shortcuts');
  await page.goto('/editor.html');
  await page.getByLabel('Account', { exact: true }).fill('owner');
  await page.getByLabel('Password', { exact: true }).fill('owner-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Continue unfinished edits/ })).toHaveCount(0);
  await savedShortcuts(page);
  await page.getByRole('button', { name: 'Edit phrase', exact: true }).click();
  await page.getByLabel('Wording', { exact: true }).fill('Synthetic wording still being edited');
  await page.evaluate(() => NextTrial.exportText());
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Continue unfinished edits (1)', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Continue unfinished edits', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue editing', exact: true }).click();
  await expect(page.getByLabel('Wording', { exact: true })).toHaveValue('Synthetic wording still being edited');
});

test('visible situation print choices search saved titles and preserve context after preview', async ({ page }, testInfo) => {
  await page.goto('/editor.html');
  await page.getByLabel('Account', { exact: true }).fill('owner');
  await page.getByLabel('Password', { exact: true }).fill('owner-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const repository = new NextRepository(); await repository.session();
    for (let i = 0; i < 8; i++) {
      const title = 'Settings print example ' + i;
      const payload = NextBook.addition('notebook', 'notebooks', title, crypto.randomUUID(), title);
      payload.favourite = i === 0;
      payload.notebook = { title, createdAt: `2026-10-0${i + 1}T12:00:00.000Z`, sections: [{ name: 'Useful wording', words: ['Garden', 'Please give me a moment.'] }], future: { retained: true } };
      const result = await repository.request('workspaces/demo/operations', { recordId: payload.id, base: 0, operation: crypto.randomUUID(), payload });
      if (result.outcome !== 'accepted') throw new Error('Disposable notebook fixture failed');
    }
  });
  await page.evaluate(() => NextTrial.checkUpdates());
  const choices = page.locator('.notebook-print-choices');
  await expect(choices.locator('.saved-card')).toHaveCount(6);
  await page.getByRole('button', { name: 'Show more print choices', exact: true }).click();
  expect(await choices.locator('.saved-card').count()).toBeGreaterThan(6);
  await page.getByLabel('Search saved notebooks', { exact: true }).fill('Settings print example');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(choices.locator('.saved-card')).toHaveCount(8);
  await expect(choices.locator('.saved-card').first().getByRole('button', { name: 'Settings print example 0', exact: true })).toBeVisible();
  await page.getByLabel('Search saved notebooks', { exact: true }).fill('Settings print example 7');
  await expect(choices.locator('.saved-card')).toHaveCount(1);
  await expect(page.getByLabel('Search saved notebooks', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(choices.locator('.saved-card')).toHaveCount(1);
  const before = await page.evaluate(() => NextTrial.exportText());
  await choices.getByRole('button', { name: 'Settings print example 7', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Saved PDF preview ready.');
  await expect(page.getByTitle('Generated PDF preview')).toHaveAttribute('src', /^blob:/);
  await expect(page.getByRole('link', { name: 'Open PDF to print', exact: true })).toBeVisible();
  expect(await page.evaluate(() => NextTrial.exportText())).toBe(before);
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByLabel('Search saved notebooks', { exact: true })).toHaveValue('Settings print example 7');
  await expect(choices.getByRole('button', { name: 'Settings print example 7', exact: true })).toBeFocused();
  const searchInput = page.getByLabel('Search saved notebooks', { exact: true });
  await searchInput.fill('  SETTINGS PRINT EXAMPLE 7  ');
  await expect(choices.locator('.saved-card')).toHaveCount(1);
  await searchInput.press('Enter');
  await expect(choices.locator('.saved-card')).toHaveCount(1);
  await searchInput.fill('not a saved notebook');
  await expect(choices.locator('.saved-card')).toHaveCount(0);
  await expect(choices.getByText('No saved notebooks match your search.', { exact: true })).toBeVisible();
  await choices.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(searchInput).toHaveValue('');
  await expect(searchInput).toBeFocused();
  expect(await choices.locator('.saved-card').count()).toBeGreaterThan(1);
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 915 });
    await page.getByLabel('Search saved notebooks', { exact: true }).fill('Settings print example');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`notebook-print-choices-${width}.png`), fullPage: true });
  }
});
