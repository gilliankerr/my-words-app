const { expect } = require('@playwright/test');
const { randomUUID } = require('node:crypto');
const { openNoteTools } = require('../frontend/note-tools');
async function accountJourney(browser, { origin, accounts }) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
  const [first, second] = accounts, cue = 'Fictional browser note ' + randomUUID(), draft = 'Unsent fictional wording ' + randomUUID();
  const page = await context.newPage();
  async function login(account) {
    await page.getByLabel('Username', { exact: true }).fill(account.username);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  }
  async function signOut() {
    await page.goto(origin + '/editor.html');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
  }
  try {
    await page.goto(origin + '/editor.html'); await login(first);
    await page.goto(origin + '/#notes');
    await page.getByRole('button', { name: 'Add note', exact: true }).click();
    await page.getByLabel('What do you want to say?', { exact: true }).fill(cue);
    await page.getByRole('button', { name: 'Save note', exact: true }).click();
    await expect(page.locator('[data-note]').filter({ hasText: cue })).toContainText(cue);
    await expect.poll(async () => page.evaluate(async () => {
      const store = await new NextLocalStore().open(); try { const who = await store.identity(); return (await store.read(who.actor, who.workspace)).outbox.length; } finally { store.db.close(); }
    })).toBe(0);
    await page.getByRole('button', { name: 'Add note', exact: true }).click();
    await page.getByLabel('What do you want to say?', { exact: true }).fill(draft);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await context.setOffline(true); await page.reload();
    await expect(page.getByRole('heading', { name: 'Notes', exact: true })).toBeVisible();
    await openNoteTools(page); await page.getByRole('button', { name: 'Unfinished', exact: true }).click();
    await expect(page.locator('main')).toContainText(draft);
    await context.setOffline(false); await signOut(); await login(second);
    await page.goto(origin + '/#notes');
    await expect(page.locator('main')).not.toContainText(cue); await expect(page.locator('main')).not.toContainText(draft);
    const secondBook = await page.evaluate(workspace => new NextRepository().request('workspaces/' + workspace), second.workspace);
    expect(JSON.stringify(secondBook)).not.toContain(cue); expect(JSON.stringify(secondBook)).not.toContain(draft);
    await page.setViewportSize({ width: 820, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await signOut(); await login(first); await page.goto(origin + '/#notes');
    await expect(page.locator('[data-note]').filter({ hasText: cue })).toContainText(cue);
    await openNoteTools(page); await page.getByRole('button', { name: 'Unfinished', exact: true }).click();
    await expect(page.locator('main')).toContainText(draft);
    const exported = await page.evaluate(() => NextTrial.exportText());
    expect(JSON.parse(exported).workspace.owner).toBe(String(first.id));
  } finally { await context.close(); }
}
module.exports = { accountJourney };
