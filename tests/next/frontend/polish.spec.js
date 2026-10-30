const { test, expect } = require('@playwright/test');
async function open(page) {
  await page.goto('/#home'); await page.getByLabel('Account', { exact: true }).fill('owner');
  await page.getByLabel('Password', { exact: true }).fill('owner-fictional-only'); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
}
test('compact native navigation keeps labelled Home/Back and an accessible quiet Settings cog', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await open(page);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  const settings = nav.getByRole('link', { name: 'Settings', exact: true });
  await page.screenshot({ path: 'output/polished-home-phone.png', fullPage: true });
  await expect(settings.locator('svg')).toHaveCount(1); await expect(settings).not.toHaveText('Settings');
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect((await page.locator('header').boundingBox()).height).toBeLessThanOrEqual(54);
    for (const control of [nav.getByRole('link', { name: 'Home', exact: true }), settings]) {
      const box = await control.boundingBox(); expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const overflow = await page.locator('.home-choice').evaluateAll(choices => choices.map(choice => {
      const label = choice.querySelector('.choice-label'), context = document.createElement('canvas').getContext('2d');
      context.font = getComputedStyle(label).font;
      const style = getComputedStyle(choice), available = choice.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      return { label: label.textContent, available, needed: Math.max(...label.textContent.split(/\s+/).map(word => context.measureText(word).width)) };
    }).filter(item => item.needed > item.available + 1));
    expect(overflow).toEqual([]);
  }
  await page.locator('.home-choice').filter({ hasText: 'People' }).click();
  await page.screenshot({ path: 'output/polished-people-phone.png', fullPage: true });
  await expect(nav.getByRole('button', { name: 'Back', exact: true })).toBeVisible();
  await settings.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
});
test('communication actions are separated and reading controls retain comfortable targets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await open(page);
  await page.locator('.home-choice').filter({ hasText: 'People' }).click();
  await page.locator('[data-person] .note-open').first().click();
  const geometry = await page.locator('main > button').evaluateAll(buttons => buttons.map(button => {
    const r = button.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  }));
  expect(geometry.length).toBeGreaterThan(1);
  expect(geometry.every(b => b.width >= 44 && b.height >= 44)).toBe(true);
  for (let i = 1; i < geometry.length; i++) {
    const a = geometry[i - 1], b = geometry[i];
    expect(b.top >= a.bottom + 6 || b.left >= a.right + 6).toBe(true);
  }
  await page.screenshot({ path: 'output/polished-person-phone.png', fullPage: true });
});
