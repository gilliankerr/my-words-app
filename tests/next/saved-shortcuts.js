async function openPreparation(page) {
  const heading = page.getByRole('heading', { name: 'Prepare or change content', exact: true });
  if (await heading.isVisible()) return;
  await page.getByRole('button', { name: 'Prepare or change content', exact: true }).click();
  await heading.waitFor({ state: 'visible' });
}
async function savedShortcuts(page) {
  const summary = page.getByText('Saved wording shortcuts', { exact: true });
  if (!await summary.count() && await page.getByRole('button', { name: 'Earlier versions', exact: true }).first().isVisible()) return;
  await openPreparation(page);
  await summary.waitFor({ state: 'visible' });
  if (!await summary.evaluate(el => el.parentElement.open)) await summary.click();
}
module.exports = { savedShortcuts, openPreparation };
