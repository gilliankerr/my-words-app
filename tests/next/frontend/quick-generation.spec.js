const { openPreparation } = require('../saved-shortcuts');
const { test, expect } = require('@playwright/test');

test('a stalled request releases Quick words and keeps the clue for retry', async ({ page }) => {
  await start(page);
  await page.clock.install();
  let arrived;
  const requested = new Promise(resolve => { arrived = resolve; });
  await page.route('**/api/workspaces/demo/quick-words', () => { arrived(); });
  await page.getByLabel('Topic / clue', { exact: true }).fill('Synthetic retained clue');
  await page.getByRole('button', { name: 'Get Words', exact: true }).click();
  await expect(page.locator('[data-quick-error]')).toContainText('Getting words');
  await requested;
  await page.clock.fastForward(100001);
  await expect(page.getByRole('button', { name: 'Get Words', exact: true })).toBeEnabled();
  await expect(page.locator('[data-quick-error]')).toContainText('could not');
  await expect(page.getByLabel('Topic / clue', { exact: true })).toHaveValue('Synthetic retained clue');
  await page.unroute('**/api/workspaces/demo/quick-words');
  await page.route('**/api/workspaces/demo/quick-words', route => route.fulfill({ json: { success: true, words: originals } }));
  await page.getByRole('button', { name: 'Get Words', exact: true }).click();
  await expect(page.locator('[data-quick-bank="original"] button')).toHaveCount(50);
});
const originals = Array.from({ length: 50 }, (_, i) => 'Original ' + i);
async function start(page) {
  await page.goto('/#home'); await page.getByLabel('Account', { exact: true }).fill('reader'); await page.getByLabel('Password', { exact: true }).fill('reader-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Quick words/ }).click();
}
test('Enter submits clues once and dental words use compact readable choices at phone and desktop widths', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await start(page);
  const dental = ['Dentist appointment', 'Toothache', 'Bleeding gums', 'Dental cleaning', 'Filling', 'Root canal', 'Tooth extraction', 'Dental X-ray', 'Local anaesthetic', 'Pain relief', 'Swollen gums', 'Broken tooth', 'Dental crown', 'Dental insurance', 'Payment', 'Treatment plan', 'Prescription', 'Emergency appointment', 'Dental appointment', 'Anaesthetic', 'Dentist', 'Hygienist', 'Gum', 'Blood', 'Bleeding', 'Tender', 'Sensitive', 'Pain', 'Numb', 'Infection', 'Appointment', 'Check-up', 'Dentures', 'Wisdom tooth', 'Jaw', 'Mouth', 'Brush', 'Floss', 'Rinse', 'Mouthwash', 'Please wait', 'It hurts', 'Here', 'Left', 'Right', 'Upper', 'Lower', 'Show me', 'Not that one', 'Thank you'];
  let requests = 0;
  await page.route('**/api/workspaces/demo/quick-words', route => { requests++; return route.fulfill({ json: { success: true, words: dental } }); });
  const input = page.getByLabel('Topic / clue', { exact: true });
  await expect(input).toHaveAttribute('spellcheck', 'false'); await expect(input).toHaveAttribute('autocorrect', 'off');
  await input.fill('Dentist pain bld'); await input.press('Enter');
  await expect(page.locator('[data-quick-bank="original"] button')).toHaveCount(50);
  expect(requests).toBe(1);
  await expect(page.locator('.quick-selection')).toBeHidden();
  const first = await page.locator('[data-quick-bank="original"] button').first().boundingBox();
  expect(first.y).toBeLessThan(260);
  await expect(page.getByRole('button', { name: 'Get Different Words', exact: true })).toBeVisible();
  expect(await page.locator('[data-quick-bank="original"]').evaluate(el => getComputedStyle(el).display)).toBe('flex');
  const differentBox = await page.getByRole('button', { name: 'Get Different Words', exact: true }).boundingBox();
  const bankBox = await page.locator('[data-quick-bank="original"]').boundingBox();
  expect(differentBox.y).toBeGreaterThanOrEqual(bankBox.y + bankBox.height);
  // Current plain-word choices need intact labels and separate pointing areas.
  await expect(page.locator('[data-quick-bank="original"] button')).toHaveText(dental);
  for (const width of [320, 390, 768, 1084]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const geometry = await page.locator('[data-quick-bank="original"] button').evaluateAll(buttons => buttons.map(button => {
      const range = document.createRange(); range.selectNodeContents(button);
      return { text: button.textContent, lines: range.getClientRects().length, height: button.getBoundingClientRect().height,
        left: button.getBoundingClientRect().left, right: button.getBoundingClientRect().right, top: button.getBoundingClientRect().top, bottom: button.getBoundingClientRect().bottom, width: button.getBoundingClientRect().width, overflow: button.scrollWidth > button.clientWidth };
    }));
    expect(geometry.every(b => b.height >= 44 && !b.overflow)).toBe(true);
    for (let i = 0; i < geometry.length; i++) for (let j = i + 1; j < geometry.length; j++) {
      const a = geometry[i], b = geometry[j];
      expect(b.left >= a.right + 6 || a.left >= b.right + 6 || b.top >= a.bottom + 6 || a.top >= b.bottom + 6).toBe(true);
    }
    expect(geometry.find(b => b.text === 'Toothache').lines).toBe(1);
    expect(geometry.find(b => b.text === 'Dental appointment').lines).toBe(1);
    expect(geometry.find(b => b.text === 'Bleeding gums').lines).toBe(1);
    expect(geometry.find(b => b.text === 'Emergency appointment').width).toBeGreaterThan(geometry.find(b => b.text === 'Toothache').width);
  }
  await page.getByRole('button', { name: 'Toothache', exact: true }).click();
  await expect(page.locator('.quick-selection')).toBeVisible();
  await expect(page.locator('[data-quick-selection]')).toHaveText('Toothache');
  await page.getByRole('button', { name: 'Get Different Words', exact: true }).click();
  await expect.poll(() => requests).toBe(2);
  await expect(page.locator('.quick-selection')).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 }); await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: 'output/quick-dental-phone.png', fullPage: false });
  await page.setViewportSize({ width: 1084, height: 844 }); await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: 'output/quick-dental-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Start Over', exact: true }).click();
  await expect(input).toHaveValue(''); await expect(input).toBeFocused();
  await expect(page.locator('[data-quick-bank]')).toHaveCount(0);
  await page.getByText('Unfinished word groups', { exact: true }).click();
  await page.getByRole('button', { name: 'Continue Dentist pain bld', exact: true }).last().click();
  await expect(page.locator('[data-quick-bank="original"] button')).toHaveCount(50);
});
test('rapid words retain originals, repeated clues, ordered selection, reload and named saving', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 845 }); await start(page);
  const requests = []; let response = originals;
  await page.route('**/api/workspaces/demo/quick-words', route => { requests.push(route.request().postDataJSON()); return route.fulfill({ json: { success: true, words: response } }); });
  await page.getByLabel('Topic / clue', { exact: true }).fill('Synthetic topic'); await page.getByRole('button', { name: 'Get Words', exact: true }).click();
  await expect(page.locator('[data-quick-bank="original"] button')).toHaveCount(50);
  await page.getByRole('button', { name: 'Original 49', exact: true }).click(); await page.getByRole('button', { name: 'Original 0', exact: true }).click(); await page.getByRole('button', { name: 'Original 49', exact: true }).click();
  await expect(page.locator('[data-quick-selection]')).toHaveText('Original 49 · Original 0');
  response = ['original 0', 'Tangential clue', '<img src=x onerror="window.quickInjection=1">'];
  await page.getByRole('button', { name: 'Get more words', exact: true }).click(); await expect(page.locator('[data-quick-bank="fresh"] button')).toHaveCount(2);
  const sticky = await page.locator('.quick-selection').boundingBox(), fresh = await page.locator('[data-quick-fresh-heading]').boundingBox();
  expect(fresh.y).toBeGreaterThanOrEqual(sticky.y + sticky.height);
  expect(requests[1].clues).toEqual(['Original 49', 'Original 0']);
  await page.getByRole('button', { name: 'Change selection', exact: true }).click(); await page.getByRole('button', { name: 'Original 49', exact: true }).click(); await page.getByRole('button', { name: 'Original 0', exact: true }).click(); await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Tangential clue', exact: true }).click(); response = ['Tangential clue', 'Fresh association'];
  await page.getByRole('button', { name: 'Get more words', exact: true }).click(); await expect(page.locator('[data-quick-bank="fresh"] button')).toHaveText(['Fresh association']);
  expect(requests[2].clues).toEqual(['Tangential clue']); await expect(page.locator('[data-quick-bank="earlier"] button')).toHaveCount(2);
  expect(await page.evaluate(() => window.quickInjection)).toBeUndefined(); await expect(page.locator('main img[src=x]')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Show message', exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'output/quick-phone.png', fullPage: true });
  await page.evaluate(() => navigator.serviceWorker.ready); await context.setOffline(true); await page.reload();
  await expect(page.locator('[data-quick-bank="original"] button')).toHaveCount(50); await expect(page.locator('[data-quick-selection]')).toHaveText('Tangential clue');
  await page.getByRole('button', { name: 'Get more words', exact: true }).click(); await expect(page.locator('[data-quick-error]')).toContainText('No connection'); await expect(page.locator('[data-quick-bank="fresh"] button')).toHaveText(['Fresh association']);
  await page.getByRole('button', { name: 'Save Words', exact: true }).click(); await page.getByLabel('Group name', { exact: true }).fill('Synthetic rapid saved');
  await page.getByRole('button', { name: 'Save word group', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Word group saved', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open word group', exact: true }).click(); await expect(page.locator('[data-quick-selection]')).toHaveText('Tangential clue');
  await page.setViewportSize({ width: 768, height: 1024 }); await page.screenshot({ path: 'output/quick-tablet.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Keep message as a note', exact: true }).click(); await expect(page.getByLabel('What do you want to say?', { exact: true })).toHaveValue('Tangential clue');
});
test('invalid and failed responses retain drafts; duplicate clicks and late navigation results are ignored', async ({ page }) => {
  await start(page); let release, requests = 0;
  await page.route('**/api/workspaces/demo/quick-words', async route => { requests++; await new Promise(r => { release = r; }); await route.fulfill({ json: { success: true, words: originals } }); });
  await page.getByLabel('Topic / clue', { exact: true }).fill('Retained clue'); await page.getByRole('button', { name: 'Get Words', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Get Words', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Home', exact: true }).click(); release(); await page.waitForTimeout(150);
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible(); expect(requests).toBe(1);
  await page.getByRole('button', { name: /Quick words/ }).click(); await expect(page.getByLabel('Topic / clue', { exact: true })).toHaveValue('Retained clue'); await expect(page.locator('[data-quick-bank]')).toHaveCount(0);
  await page.unroute('**/api/workspaces/demo/quick-words'); await page.route('**/api/workspaces/demo/quick-words', route => route.fulfill({ json: { success: true, words: ['incomplete'] } }));
  await page.getByRole('button', { name: 'Get Words', exact: true }).click(); await expect(page.locator('[data-quick-error]')).toContainText('could not'); await page.reload(); await expect(page.getByLabel('Topic / clue', { exact: true })).toHaveValue('Retained clue');
  await page.route('**/api/workspaces/demo/quick-words', route => route.fulfill({ status: 503, json: { error: '<private provider error>' } })); await page.getByRole('button', { name: 'Get Words', exact: true }).click(); await expect(page.locator('[data-quick-error]')).toContainText('could not'); await expect(page.locator('main')).not.toContainText('private provider');
});
test('late generation after account closure cannot expose results in the next account', async ({ page }) => {
  await page.goto('/editor.html'); await page.getByLabel('Account', { exact: true }).fill('owner'); await page.getByLabel('Password', { exact: true }).fill('owner-fictional-only'); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await openPreparation(page); await page.getByRole('button', { name: 'Prepare a word group', exact: true }).click(); let release; let intercepted;
  const captured = new Promise(r => { intercepted = r; });
  await page.route('**/api/workspaces/demo/quick-words', async route => { intercepted(); await new Promise(r => { release = r; }); await route.fulfill({ json: { success: true, words: originals } }); });
  await page.getByLabel('Topic / clue', { exact: true }).fill('Account private clue'); await page.getByRole('button', { name: 'Get Words', exact: true }).click(); await captured;
  await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await page.getByLabel('Account', { exact: true }).fill('alex'); await page.getByLabel('Password', { exact: true }).fill('alex-fictional-only'); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible(); release(); await page.waitForTimeout(150); await openPreparation(page); await page.getByRole('button', { name: 'Prepare a word group', exact: true }).click();
  await expect(page.getByLabel('Topic / clue', { exact: true })).toHaveValue(''); await expect(page.locator('[data-quick-bank]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await page.getByLabel('Account', { exact: true }).fill('owner'); await page.getByLabel('Password', { exact: true }).fill('owner-fictional-only'); await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await openPreparation(page); await page.getByRole('button', { name: 'Prepare a word group', exact: true }).click(); await expect(page.getByLabel('Topic / clue', { exact: true })).toHaveValue('Account private clue');
});
test('storage failure prevents transmission and keeps the entered clue available', async ({ page }) => {
  await start(page);
  await page.evaluate(() => { const original = NextLocalStore.prototype.update; NextLocalStore.prototype.update = function (actor, workspace, fn, initial) { if (window.failQuickDraft) return Promise.reject(new Error('Synthetic quota')); return original.call(this, actor, workspace, fn, initial); }; window.failQuickDraft = true; });
  let calls = 0; await page.route('**/api/workspaces/demo/quick-words', route => { calls++; return route.fulfill({ json: { success: true, words: originals } }); });
  await page.getByLabel('Topic / clue', { exact: true }).fill('Retained quota clue'); await page.getByRole('button', { name: 'Get Words', exact: true }).click(); await expect(page.locator('[data-quick-error]')).toContainText('could not be saved'); expect(calls).toBe(0); await expect(page.getByLabel('Topic / clue', { exact: true })).toHaveValue('Retained quota clue');
  await page.evaluate(() => { window.failQuickDraft = false; }); await page.getByRole('button', { name: 'Get Words', exact: true }).click(); await expect(page.locator('[data-quick-bank="original"] button')).toHaveCount(50); expect(calls).toBe(1);
});
test('enlarged Quick words wrap complete choices and retain batches after wording edits and reordering', async ({ page }) => {
  await page.goto('/editor.html'); await page.getByLabel('Account', { exact: true }).fill('owner'); await page.getByLabel('Password', { exact: true }).fill('owner-fictional-only'); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Display choices', exact: true }).click(); await page.getByLabel('Text size', { exact: true }).selectOption('32'); await page.getByLabel('Spacing', { exact: true }).selectOption('roomy'); await page.getByRole('button', { name: 'Save display choices', exact: true }).click();
  await page.getByRole('link', { name: 'Home', exact: true }).click(); await page.getByRole('button', { name: /Quick words/ }).click();
  const words = ['Élodie’s extraordinarily long communication phrase', 'Medium wording', ...originals.slice(2)]; let response = words;
  await page.route('**/api/workspaces/demo/quick-words', route => route.fulfill({ json: { success: true, words: response } }));
  await page.getByLabel('Topic / clue', { exact: true }).fill('Synthetic large wording'); await page.getByRole('button', { name: 'Get Words', exact: true }).click(); await expect(page.locator('[data-quick-bank="original"] button')).toHaveCount(50);
  await page.getByRole('button', { name: 'Original 49', exact: true }).click(); response = ['Added phrase']; await page.getByRole('button', { name: 'Get more words', exact: true }).click(); await expect(page.locator('[data-quick-bank="fresh"] button')).toHaveCount(1);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 845 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const bounds = await page.locator('.quick-bank button').evaluateAll(els => els.map(el => ({ rect: { height: el.getBoundingClientRect().height, width: el.getBoundingClientRect().width }, overflow: el.scrollWidth > el.clientWidth })));
    expect(bounds.every(b => b.rect.height >= 44 && b.rect.width >= 44 && !b.overflow)).toBe(true);
    expect(await page.getByRole('button', { name: 'Original 2', exact: true }).evaluate(el => { const canvas = document.createElement('canvas'), context = canvas.getContext('2d'); context.font = getComputedStyle(el).font; return el.clientWidth >= context.measureText('Original').width; })).toBe(true);
    await page.screenshot({ path: 'output/quick-enlarged-' + width + '.png', fullPage: true });
  }
  await page.getByRole('button', { name: 'Save Words', exact: true }).click(); await page.getByLabel('Wording 1', { exact: true }).fill('Revised complete phrase');
  await page.getByRole('button', { name: 'Move down: Original 49', exact: true }).click(); await page.getByRole('button', { name: 'Save word group', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Word group saved', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open word group', exact: true }).click(); await expect(page.locator('[data-quick-bank="original"] button')).toHaveCount(50); await expect(page.locator('[data-quick-bank="fresh"] button')).toHaveText(['Added phrase']); await expect(page.locator('[data-quick-bank="original"]')).toContainText('Revised complete phrase'); await expect(page.locator('[data-quick-selection]')).toHaveText('Original 49');
});
test('a delayed review edit cannot reopen Quick words after leaving the screen', async ({ page }) => {
  await start(page); await page.route('**/api/workspaces/demo/quick-words', route => route.fulfill({ json: { success: true, words: originals } }));
  await page.getByLabel('Topic / clue', { exact: true }).fill('Synthetic delayed review'); await page.getByRole('button', { name: 'Get Words', exact: true }).click(); await page.getByRole('button', { name: 'Save Words', exact: true }).click();
  await page.evaluate(() => { const update = NextLocalStore.prototype.update; NextLocalStore.prototype.update = async function (...args) { if (window.delayReviewDraft) { window.reviewCaptured = true; await new Promise(resolve => { window.releaseReview = resolve; }); } return update.apply(this, args); }; window.delayReviewDraft = true; });
  await page.getByRole('button', { name: 'Move down: Original 0', exact: true }).click(); await expect.poll(() => page.evaluate(() => window.reviewCaptured)).toBe(true);
  await page.getByRole('link', { name: 'Home', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible(); await page.evaluate(() => { window.delayReviewDraft = false; window.releaseReview(); });
  await page.waitForTimeout(150); await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Quick words/ }).click(); await expect(page.locator('[data-quick-bank="original"] button').first()).toHaveText('Original 1');
});
