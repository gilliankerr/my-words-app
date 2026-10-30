async function openNoteTools(page) {
  const tools = page.locator('.notes-find');
  await tools.locator('summary').waitFor({ state: 'visible' });
  if (!await tools.evaluate(el => el.open)) await tools.locator('summary').click();
}
module.exports = { openNoteTools };
