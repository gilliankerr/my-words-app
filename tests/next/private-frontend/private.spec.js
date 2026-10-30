const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { PrivateLocalRepository } = require('../../../server/next/private-local');
const { createApp } = require('../../../server/next/app');
let directory, repository, server;
async function start() {
  repository = await PrivateLocalRepository.open(directory);
  server = createApp({ repository, authentication: repository, mode: 'private-local', privateOrigin: 'http://127.0.0.1:3179' }).listen(3179, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
}
async function stop() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await repository.close(); }
test.beforeAll(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-private-browser-fictional-')); await start(); });
test.afterAll(async () => { await stop(); await fs.rm(directory, { recursive: true, force: true }); });
test('private setup, full editing, frozen preview, offline book and restart use isolated ownership', async ({ page, context }) => {
  await page.goto('/editor.html'); await expect(page.getByRole('heading', { name: 'Set up this book', exact: true })).toBeVisible();
  await expect(page.getByLabel('Account', { exact: true })).toHaveCount(0);
  await page.getByLabel('Supporter password', { exact: true }).fill('fictional-test-passphrase'); await page.getByLabel('Confirm password', { exact: true }).fill('different-test-passphrase');
  await page.getByRole('button', { name: 'Create private book', exact: true }).click(); await expect(page.getByRole('status')).toContainText('do not match');
  await page.getByLabel('Confirm password', { exact: true }).fill('fictional-test-passphrase'); await page.getByRole('button', { name: 'Create private book', exact: true }).click();
  await expect(page.getByText('Book unlocked', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Practice content');
  await page.getByRole('button', { name: 'Edit book', exact: true }).click(); await page.getByRole('button', { name: 'Home & Household', exact: true }).click();
  await page.locator('[data-item]').first().getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Wording').fill('Fictional private test phrase'); await page.getByLabel('Highlight', { exact: true }).check();
  await page.getByRole('button', { name: 'Save to book', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Saved to book.');
  await page.getByRole('link', { name: 'Caregiver area', exact: true }).click();
  await page.getByText('Backup and restore', { exact: true }).click();
  const exportEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Back up book', exact: true }).click();
  const download = await exportEvent; const exported = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
  expect(exported.workspace.owner).toBe(repository.state.account.actor); expect(exported.workspace.id).not.toBe('demo'); expect(exported.workspace.members).toBeUndefined();
  await page.getByRole('button', { name: 'Preview booklet', exact: true }).click();
  await expect(page.getByTitle('Generated PDF preview')).toHaveAttribute('src', /^blob:/); await expect(page.getByText('All saved book content included.', { exact: true })).toBeVisible();
  await page.goto('/#book'); await page.getByRole('button', { name: 'Update book', exact: true }).click();
  await page.getByRole('button', { name: 'Home & Household', exact: true }).click(); await page.getByRole('button', { name: 'Fictional private test phrase', exact: true }).click();
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Fictional private test phrase', exact: true })).toBeFocused();
  await context.setOffline(true); await page.reload(); await page.getByRole('button', { name: 'Home & Household', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fictional private test phrase', exact: true })).toBeVisible();
  expect(await page.evaluate(async () => { const result = []; for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) if (new URL(request.url).pathname.startsWith('/api/')) result.push(request.url); return result; })).toEqual([]);
  const databases = await page.evaluate(async () => (await indexedDB.databases()).map(d => d.name)); expect(databases).toContain('cn-private-local-v1'); expect(databases).not.toContain('cn-next-synthetic-v1');
  await context.setOffline(false);
  const before = await fs.readFile(path.join(directory, 'private-book.json'), 'utf8'); await stop(); await start();
  expect(await fs.readFile(path.join(directory, 'private-book.json'), 'utf8')).toBe(before);
  await page.goto('/editor.html'); await page.getByLabel('Supporter password', { exact: true }).fill('fictional-test-passphrase'); await page.getByRole('button', { name: 'Open book', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit book', exact: true })).toBeVisible();
  await page.goto('/#book'); await page.getByRole('button', { name: 'Home & Household', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fictional private test phrase', exact: true })).toBeVisible();
});
test('restoring a book backup survives online reopening and recovery into fresh private ownership', async ({ page }) => {
  await page.goto('/editor.html'); await page.getByLabel('Supporter password', { exact: true }).fill('fictional-test-passphrase'); await page.getByRole('button', { name: 'Open book', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit book', exact: true })).toBeVisible();
  const backup = await page.evaluate(() => window.NextTrial.exportText());
  await page.getByRole('button', { name: 'Edit book', exact: true }).click(); await page.getByRole('button', { name: 'Home & Household', exact: true }).click();
  await page.locator('[data-item]').first().getByRole('button', { name: 'Edit', exact: true }).click(); await page.getByLabel('Wording').fill('Later fictional wording');
  await page.getByRole('button', { name: 'Save to book', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Saved to book.');
  await page.getByRole('link', { name: 'Caregiver area', exact: true }).click(); await page.getByText('Backup and restore', { exact: true }).click();
  // Quota failure must happen before the server's complete aggregate changes.
  const before = repository.fingerprint();
  const quotaBlocked = await page.evaluate(async text => { const put = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function () { throw new DOMException('Fictional quota', 'QuotaExceededError'); }; try { await window.NextTrial.restoreText(text, true); return false; } catch { return true; } finally { IDBObjectStore.prototype.put = put; } }, backup);
  expect(quotaBlocked).toBe(true); expect(repository.fingerprint()).toBe(before);
  await page.getByLabel('Restore book backup', { exact: true }).setInputFiles({ name: 'fictional-recovery.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await expect(page.getByRole('dialog')).toContainText('Only confirm if this is the correct'); await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Book restored and saved');
  await expect(page.getByRole('button', { name: 'Edit book', exact: true })).toBeVisible();
  await page.reload(); await page.getByRole('button', { name: 'Edit book', exact: true }).click(); await page.getByRole('button', { name: 'Home & Household', exact: true }).click();
  await expect(page.locator('[data-item]').first()).toContainText('Fictional private test phrase');
  const originalDirectory = directory;
  const freshDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-private-replacement-fictional-'));
  await stop(); directory = freshDirectory; await start();
  try {
    await page.context().clearCookies(); await page.goto('/editor.html');
    await page.getByLabel('Supporter password', { exact: true }).fill('replacement-test-passphrase'); await page.getByLabel('Confirm password', { exact: true }).fill('replacement-test-passphrase'); await page.getByRole('button', { name: 'Create private book', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit book', exact: true })).toBeVisible();
    await page.getByText('Backup and restore', { exact: true }).click();
    await page.getByLabel('Restore book backup', { exact: true }).setInputFiles({ name: 'fictional-recovery.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
    await page.getByRole('button', { name: 'Confirm', exact: true }).click(); await expect(page.getByRole('status')).toContainText('Book restored and saved'); await expect(page.getByRole('button', { name: 'Edit book', exact: true })).toBeVisible();
    await page.reload(); await page.getByRole('button', { name: 'Edit book', exact: true }).click(); await page.getByRole('button', { name: 'Home & Household', exact: true }).click();
    await expect(page.locator('[data-item]').first()).toContainText('Fictional private test phrase');
    expect(repository.state.workspace.owner).not.toBe(JSON.parse(backup).workspace.owner);
    expect(repository.state.workspace.records).toEqual(JSON.parse(backup).workspace.records);
  } finally { await stop(); await fs.rm(freshDirectory, { recursive: true, force: true }); directory = originalDirectory; await start(); }
});
