const { test, expect } = require('@playwright/test');
async function open(page) {
  await page.goto('/#home'); await page.getByLabel('Account', { exact: true }).fill('owner');
  await page.getByLabel('Password', { exact: true }).fill('owner-fictional-only'); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.locator('.home-choice').filter({ hasText: 'Communication book' }).click();
  await page.getByRole('button', { name: 'Dining & Restaurants', exact: true }).click();
}
for (const width of [320, 390, 768]) test(`book choices keep complete words and shared compact type at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 }); await open(page);
  const words = page.locator('.words');
  await words.evaluate(grid => {
    for (const text of ['Vegetarian', 'Reservations', 'Accessibility', 'Élodie O’Connor-Smith', 'Please give me a little more time to choose my meal.']) {
      const button = document.createElement('button'); button.textContent = text; grid.append(button);
    }
  });
  const check = async size => {
    const results = await words.locator('button').evaluateAll(buttons => buttons.map(button => {
      const style = getComputedStyle(button), box = button.getBoundingClientRect();
      const canvas = document.createElement('canvas').getContext('2d'); canvas.font = style.font;
      const available = box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const widestWord = Math.max(...button.textContent.split(/\s+/).map(word => canvas.measureText(word).width));
      return { text: button.textContent, size: parseFloat(style.fontSize), width: box.width, height: box.height, available, widestWord };
    }));
    expect(results.every(item => item.size === size && item.width >= 44 && item.height >= 44)).toBe(true);
    expect(results.filter(item => item.widestWord > item.available + 1)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  };
  await check(16);
  await expect(page.getByRole('button', { name: 'Return to book', exact: true })).toHaveCount(0);
  const word = words.getByRole('button', { name: 'Vegetarian', exact: true }).first();
  const before = await word.boundingBox(), initiallyPressed = await word.getAttribute('aria-pressed') === 'true'; await word.click();
  await expect(word).toHaveAttribute('aria-pressed', String(!initiallyPressed)); expect(await word.boundingBox()).toEqual(before);
  await page.screenshot({ path: `output/book-word-flow-${width}.png`, fullPage: true });
  await page.evaluate(() => { document.documentElement.style.fontSize = '32px'; });
  await check(25.6);
  await page.screenshot({ path: `output/book-word-flow-large-${width}.png`, fullPage: true });
  await page.context().setOffline(true); await word.click(); await expect(word).toHaveAttribute('aria-pressed', String(initiallyPressed));
  const back = page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Back', exact: true });
  await back.click(); await expect(page.getByRole('heading', { name: 'Communication book', exact: true })).toBeVisible();
});
