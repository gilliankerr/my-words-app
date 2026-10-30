const { test, expect } = require('@playwright/test');
const { WorkspaceService } = require('../../../server/next/workspace-service');
const { MemoryRepository } = require('../harness/memory-repository');
const { makeFixtures } = require('../fixtures');
const M = require('../../../app-next/js/model');
test.use({ serviceWorkers: 'block' });

for (const width of [390, 768]) test('shared restore retains local recovery and retries an accepted response loss at ' + width + 'px', async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  const fixtures = makeFixtures(), service = new WorkspaceService(new MemoryRepository(fixtures.workspaces));
  const requests = []; let loseResponse = true;
  await page.route('**/js/runtime-config.js', route => route.fulfill({ contentType: 'application/javascript', body: 'globalThis.NextRuntime={sharedAccount:true,privateLocal:false};' }));
  await page.route('**/api/workspaces/demo', async route => route.fulfill({ json: await service.read('demo', 'owner') }));
  await page.route('**/api/workspaces/demo/restore-preview', async route => route.fulfill({ json: await service.restorePreview('demo', 'owner') }));
  await page.route('**/api/workspaces/demo/restore', async route => {
    const request = route.request().postDataJSON(); requests.push(request);
    const restored = await service.restoreShared('demo', 'owner', request);
    if (loseResponse) { loseResponse = false; await route.fulfill({ status: 503, json: { error: 'Response unavailable. Local work is retained.' } }); }
    else await route.fulfill({ json: restored });
  });
  for (const endpoint of ['session', 'sign-in']) await page.route('**/api/' + endpoint, async route => {
    const response = await route.fetch(endpoint === 'sign-in' ? { postData: JSON.stringify({ name: 'owner', password: 'owner-fictional-only' }) } : {});
    const info = await response.json(); await route.fulfill({ response, json: { ...info, workspace: info.actor ? 'demo' : null, mode: 'shared-account' } });
  });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill('shared@example.invalid');
  await page.getByLabel('Password', { exact: true }).fill('owner-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  const text = JSON.stringify(M.exportPackage(fixtures.workspaces.demo));
  const error = await page.evaluate(async text => { try { await NextTrial.restoreText(text, true); return null; } catch (e) { return e.message; } }, text);
  expect(error).toMatch(/Response unavailable/);
  const held = await page.evaluate(async () => (await new NextLocalStore().open()).read('owner', 'demo'));
  expect(held.restoreHold.request.operation).toBe(requests[0].operation);
  expect(held.snapshot.privateEpoch || 0).toBe(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  expect(await page.evaluate(async text => NextTrial.restoreText(text, true), text)).toBe(true);
  expect(requests[1]).toEqual(requests[0]);
  const restored = await page.evaluate(async () => (await new NextLocalStore().open()).read('owner', 'demo'));
  expect(restored.snapshot.privateEpoch).toBe(1); expect(restored.restoreHold).toBeUndefined();
  expect(JSON.parse(restored.backup).workspace.privateEpoch || 0).toBe(0);
  expect(restored.draftBackup).toBeDefined(); expect(restored.outbox).toEqual([]);
  const draft = await page.evaluate(async () => {
    const local = await new NextLocalStore().open();
    const state = await local.update('owner', 'demo', value => {
      const record = Object.values(value.snapshot.records)[0], payload = structuredClone(record.revisions.find(r => r.number === record.current).payload);
      value.drafts[record.id] = { id: record.id, base: record.current, payload: { ...payload, text: 'Unfinished local wording', future: { retain: ['complete'] } }, state: 'draft' }; return value;
    }); return state.drafts;
  });
  const second = M.exportPackage(fixtures.workspaces.demo); second.workspace.name = 'Second restored book';
  const preview = await service.restorePreview('demo', 'owner');
  await service.restoreShared('demo', 'owner', { text: JSON.stringify(second), confirmed: true, expected: preview.fingerprint, operation: require('node:crypto').randomUUID() });
  await page.goto('/editor.html');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.getByText('Download or restore a backup', { exact: true }).click();
  // Returning content opens before background refresh. Deliberately refresh
  // Settings before reviewing a restoration received from another device.
  await page.getByRole('button', { name: 'Get latest saved changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review restored shared book', exact: true, includeHidden: true })).toHaveCount(1);
  await page.getByText('Download or restore a backup', { exact: true }).click();
  await page.getByRole('button', { name: 'Review restored shared book', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review restored book', exact: true })).toBeVisible();
  await page.screenshot({ path: 'output/shared-restore-review-' + width + '.png' });
  const bounds = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth })); expect(bounds.scroll).toBeLessThanOrEqual(bounds.width + 1);
  await page.getByRole('button', { name: 'Use restored book on this device', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  const adopted = await page.evaluate(async () => (await new NextLocalStore().open()).read('owner', 'demo'));
  expect(adopted.snapshot.privateEpoch).toBe(2); expect(adopted.pendingRestoration).toBeUndefined();
  expect(adopted.restoreHold).toBeUndefined(); expect(JSON.parse(adopted.backup).workspace.privateEpoch).toBe(1);
  expect(adopted.draftBackup.drafts).toEqual(draft); expect(adopted.priorRestoreRecovery).toHaveLength(1);
  expect(requests).toHaveLength(2);
});
