const { test, expect } = require('@playwright/test');

async function signIn(page, account = 'reader', path = '/') {
  await page.goto(path);
  await page.getByLabel('Account', { exact: true }).fill(account);
  await page.getByLabel('Password', { exact: true }).fill(account + '-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test('communication Home has eight stable destinations, separate Settings, and saved routes work offline', async ({ page, context }) => {
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  const labels = ['Quick words', 'People', 'Personal information', 'Notes', 'Icons', 'Communication book', 'Situation notebooks', 'Shopping list'];
  await expect(page.locator('.home-choice .choice-label')).toHaveText(labels);
  await expect(page.locator('body')).not.toContainText(/fictional|print|supporter|caregiver/i);
  await page.getByRole('button', { name: 'Quick words Find words for now', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Quick words', exact: true })).toBeVisible();
  await expect(page.getByLabel('Topic / clue', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Saved word group', exact: true }).click();
  await page.getByRole('button', { name: 'Thank you', exact: true }).first().click();
  await expect(page.locator('[data-show-page]')).toContainText('Thank you');
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Communication book Words and phrases by subject', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'All sections', exact: true })).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true })); });
  await context.setOffline(true); await page.reload();
  await expect(page.getByRole('heading', { name: 'All sections', exact: true })).toBeVisible();
  expect(await page.title()).toBe('My Words');
  const iconSizes = await page.evaluate(async () => {
    const sizes = [];
    for (const size of [180, 192, 512]) {
      const image = new Image(); image.src = `/assets/app/my-words-${size}.png`;
      await image.decode(); sizes.push([image.naturalWidth, image.naturalHeight]);
    }
    return sizes;
  });
  expect(iconSizes).toEqual([[180, 180], [192, 192], [512, 512]]);
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('.home-choice').evaluateAll(els => els.every(e => e.getBoundingClientRect().height >= 44))).toBe(true);
  }
});

test('reader cannot enter caregiver printing; editor has it only at the separate address', async ({ page }) => {
  await signIn(page, 'reader', '/editor.html');
  await expect(page.getByRole('heading', { name: 'Caregiver access required', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Print Communication book|Print shopping sheet|Print letter/ })).toHaveCount(0);
  const editor = await page.context().browser().newContext();
  const caregiver = await editor.newPage();
  await signIn(caregiver, 'alex', '/editor.html');
  await expect(caregiver.getByRole('button', { name: 'Print Communication book', exact: true })).toBeVisible();
  await caregiver.getByRole('link', { name: 'Home', exact: true }).click();
  await expect(caregiver.locator('body')).not.toContainText(/print/i);
  await editor.close();
});
