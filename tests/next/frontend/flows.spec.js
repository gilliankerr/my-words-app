const { savedShortcuts } = require('../saved-shortcuts');
const { test, expect } = require('@playwright/test');
async function signIn(page, name, editor = false) {
  await page.goto(editor ? '/editor.html' : '/#book');
  await page.getByLabel('Account', { exact: true }).fill(name);
  await page.getByLabel('Password', { exact: true }).fill(`${name}-fictional-only`);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  if (editor) await expect(page.getByText(`Signed in as ${name}`, { exact: true })).toBeVisible();
  else await expect(page.getByRole('heading', { name: 'Communication book', exact: true })).toBeVisible();
  if (editor) await page.getByText('Download or restore a backup', { exact: true }).click();
}
test('two supporters conflict, reader holds selected wording and deliberately adopts then restores offline', async ({ browser }) => {
  const a = await browser.newContext(), b = await browser.newContext(), c = await browser.newContext();
  const pa = await a.newPage(), pb = await b.newPage(), pc = await c.newPage();
  await signIn(pa, 'alex', true); await signIn(pb, 'robin', true); await signIn(pc, 'reader');
  // Repeated PostgreSQL runs retain prior state instead of reseeding over it.
  const initialPhrase = await pc.evaluate(async () => {
    const pkg = JSON.parse(await window.NextTrial.exportText());
    return pkg.workspace.editions[pkg.activeEdition].payloads['b4420c84-a4cc-4b47-9d9e-bd6bd6dd4b53'].text;
  });
  await pc.getByRole('button', { name: 'Common Phrases', exact: true }).click();
  await pc.getByRole('button', { name: initialPhrase, exact: true }).click();
  await expect(pc.getByRole('button', { name: initialPhrase, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await savedShortcuts(pa); await pa.getByRole('button', { name: 'Edit phrase', exact: true }).click();
  await savedShortcuts(pb); await pb.getByRole('button', { name: 'Edit phrase', exact: true }).click();
  await pa.getByLabel('Wording').fill('Please give me more time.');
  await pa.getByRole('button', { name: 'Save to book', exact: true }).click();
  await expect(pa.getByRole('status')).toContainText('Synced to workspace');
  await pb.getByLabel('Wording').fill('Please wait for me.');
  await pb.getByRole('button', { name: 'Save to book', exact: true }).click();
  await expect(pb.getByRole('heading', { name: 'Changes need review' })).toBeVisible();
  await expect(pb.getByText('Please give me more time.', { exact: true }).first()).toBeVisible();
  await pa.getByRole('button', { name: 'Return', exact: true }).click();
  await savedShortcuts(pa); await pa.getByRole('button', { name: 'Edit page', exact: true }).click();
  await pa.getByLabel('Wording').fill('Fictional practice page\n\nMy name is Morgan.\nPlease offer me a choice.\n\n• Give me time.\n• Check what I mean.');
  await pa.getByRole('button', { name: 'Save to book', exact: true }).click();
  await expect(pa.getByRole('status')).toContainText('Synced to workspace');
  await pc.evaluate(() => window.NextTrial.checkUpdates());
  await expect(pc.getByRole('button', { name: initialPhrase, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await pc.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Back', exact: true }).click();
  await pc.getByRole('button', { name: 'Use updated words', exact: true }).click();
  await pc.getByRole('button', { name: 'Common Phrases', exact: true }).click();
  await expect(pc.getByRole('button', { name: 'Please give me more time.', exact: true })).toBeVisible();
  const pkg = await pc.evaluate(() => window.NextTrial.exportText());
  const d = await browser.newContext(); const pd = await d.newPage(); await signIn(pd, 'reader');
  await pd.evaluate(text => window.NextTrial.restoreText(text, true), pkg);
  await pd.evaluate(() => navigator.serviceWorker.ready); await d.setOffline(true); await pd.reload();
  await expect(pd.getByRole('heading', { name: 'Communication book', exact: true })).toBeVisible();
  await pd.getByRole('button', { name: 'Personal information', exact: true }).click();
  await expect(pd.getByText('My name is Morgan.', { exact: false })).toBeVisible();
  await expect(pd.getByText('Please offer me a choice.', { exact: false })).toBeVisible();
  for (const context of [a,b,c,d]) await context.close();
});
test('offline drafts and invalid restore preserve original bytes and private actor scope', async ({ browser }) => {
  const context = await browser.newContext(); const page = await context.newPage();
  await signIn(page, 'alex', true);
  await savedShortcuts(page); await page.getByRole('button', { name: 'Edit page', exact: true }).click();
  await page.evaluate(() => navigator.serviceWorker.ready); await context.setOffline(true);
  await page.getByLabel('Wording').fill('Private fictional draft\n\nÉlodie’s garden.');
  await page.getByRole('button', { name: 'Save to book', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Waiting to sync');
  await page.reload();
  await savedShortcuts(page); await page.getByRole('button', { name: 'Continue my draft', exact: true }).click();
  await expect(page.getByLabel('Wording')).toHaveValue('Private fictional draft\n\nÉlodie’s garden.');
  const before = await page.evaluate(() => window.NextTrial.exportText());
  await page.evaluate(async () => { try { await window.NextTrial.restoreText('{bad', true); } catch {} });
  expect(await page.evaluate(() => window.NextTrial.exportText())).toBe(before);
  await context.setOffline(false);
  await page.goto('/editor.html');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByLabel('Account', { exact: true })).toBeVisible();
  await signIn(page, 'robin', true);
  await expect(page.getByRole('button', { name: 'Continue my draft', exact: true })).toHaveCount(0);
  await context.close();
});
test('quota abort leaves shared bytes intact and failed download sends no false receipt', async ({ page }) => {
  await signIn(page, 'alex');
  const before = await page.evaluate(() => window.NextTrial.exportText());
  await page.evaluate(async text => {
    const put = IDBObjectStore.prototype.put;
    let writes = 0;
    IDBObjectStore.prototype.put = function (...args) { writes++; if (writes === 2) throw new DOMException('Fictional pointer-switch quota test', 'QuotaExceededError'); return put.apply(this, args); };
    try { await window.NextTrial.restoreText(text, true); throw new Error('Restore should have failed'); }
    catch (error) { if (error.message === 'Restore should have failed') throw error; }
    finally { IDBObjectStore.prototype.put = put; }
  }, before);
  expect(await page.evaluate(() => window.NextTrial.exportText())).toBe(before);
  let receipts = 0;
  page.on('request', req => { if (req.url().endsWith('/receipts')) receipts++; });
  await page.evaluate(async () => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () { throw new DOMException('Fictional quota test', 'QuotaExceededError'); };
    try { await window.NextTrial.checkUpdates(); } finally { IDBObjectStore.prototype.put = put; }
  });
  expect(receipts).toBe(0);
  expect(await page.evaluate(() => window.NextTrial.exportText())).toBe(before);
  const cached = await page.evaluate(async () => { const names = await caches.keys(); const urls = []; for (const name of names) for (const req of await (await caches.open(name)).keys()) urls.push(req.url); return urls; });
  expect(cached.some(url => url.includes('/api/'))).toBe(false);
});
test('malformed success leaves proposal pending; revocation on Retry locks without relabelling', async ({ page }) => {
  await signIn(page, 'alex', true);
  await page.route('**/api/workspaces/demo/operations', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ outcome: 'accepted', workspace: 'someone-else' }) }));
  await savedShortcuts(page); await page.getByRole('button', { name: 'Edit phrase', exact: true }).click();
  await page.getByLabel('Wording').fill('<img src=x onerror="window.compromised=true"> Give me time.');
  await page.getByRole('button', { name: 'Save to book', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Invalid save response');
  await page.getByRole('button', { name: 'Return', exact: true }).click();
  await page.route('**/api/workspaces/demo/operations', route => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Access denied' }) }));
  await page.getByRole('button', { name: 'Retry sending', exact: true }).click();
  await expect(page.getByLabel('Account', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.compromised)).toBeUndefined();
  await page.unroute('**/api/workspaces/demo/operations');
  await signIn(page, 'alex', true);
  await savedShortcuts(page); await page.getByRole('button', { name: 'Continue my draft', exact: true }).click();
  await expect(page.getByLabel('Wording')).toHaveValue(/Give me time/);
});
test('private draft restore keeps pending operation identity and corrupt canonical data blocks mutation', async ({ browser }) => {
  const a = await browser.newContext(), b = await browser.newContext(); const pa = await a.newPage(), pb = await b.newPage();
  await signIn(pa, 'alex', true); await savedShortcuts(pa); await pa.getByRole('button', { name: 'Edit page', exact: true }).click();
  await a.setOffline(true); await pa.getByLabel('Wording').fill('A private offline passage\n\nÉlodie’s words.');
  await pa.getByRole('button', { name: 'Save to book', exact: true }).click(); await expect(pa.getByRole('status')).toContainText('Waiting to sync');
  const bundle = await pa.evaluate(async () => { const s = await new NextLocalStore().open(), d = await s.read('alex', 'demo'); s.db.close(); return { schema: 1, type: 'cn-next-drafts', actor: 'alex', workspace: 'demo', drafts: d.drafts, outbox: d.outbox }; });
  const pkg = await pa.evaluate(() => window.NextTrial.exportText());
  await signIn(pb, 'alex', true); await pb.evaluate(text => window.NextTrial.restoreText(text, true), pkg);
  await pb.evaluate(text => window.NextTrial.restoreDraftText(text, true), JSON.stringify(bundle));
  const restored = await pb.evaluate(async () => { const s = await new NextLocalStore().open(), d = await s.read('alex', 'demo'); s.db.close(); return d; });
  expect(restored.outbox[0].operation).toBe(bundle.outbox[0].operation);
  expect(Object.values(restored.drafts)[0].payload.text).toBe('A private offline passage\n\nÉlodie’s words.');
  await pb.evaluate(async () => {
    const s = await new NextLocalStore().open();
    const d = await s.read('alex', 'demo'); d.snapshot.records[Object.keys(d.snapshot.records)[0]].current = 999;
    await s.transact('scopes', 'readwrite', (os, done, fail) => { s.resolve(os, s.key('alex','demo'), (value, key) => { os.put(d, key); done(true); }, fail); });
    let blocked = false;
    try { await s.update('alex','demo', value => { value.drafts = {}; return value; }); } catch { blocked = true; }
    if (!blocked) throw new Error('Corrupt canonical store was overwritten');
    const raw = await s.transact('scopes', 'readonly', (os, done, fail) => { s.resolve(os, s.key('alex','demo'), value => done(value), fail); });
    if (raw.snapshot.records[Object.keys(raw.snapshot.records)[0]].current !== 999 || !Object.keys(raw.drafts).length) throw new Error('Previous bytes changed');
    s.db.close();
  });
  await a.close(); await b.close();
});
test('same saved edition prints complete dense vocabulary without legacy private requests', async ({ page }) => {
  test.setTimeout(120000); await signIn(page, 'alex', true);
  const printSource = await page.evaluate(async () => {
    const pkg = JSON.parse(await window.NextTrial.exportText());
    const edition = pkg.workspace.editions[pkg.activeEdition];
    return { edition: edition.id, phrase: edition.payloads['b4420c84-a4cc-4b47-9d9e-bd6bd6dd4b53'].text, passage: edition.payloads['e6f89c93-0c18-49e9-9aaf-9134fa14b72d'].text };
  });
  const fs = require('node:fs'); fs.mkdirSync('test-results/next/prints', { recursive: true });
  fs.writeFileSync('test-results/next/prints/selected-edition.json', JSON.stringify(printSource, null, 2));
  const privateRequests = []; page.on('request', req => { if (req.url().includes('/api/settings/') || req.url().includes('/api/reference-library/')) privateRequests.push(req.url()); });
  await page.getByRole('button', { name: 'Print Communication book', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Saved PDF preview ready.');
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save PDF', exact: true }).click();
  await (await event).saveAs('test-results/next/prints/fictional-booklet.pdf');
  expect(privateRequests).toEqual([]);
});
for (const width of [320,390,768,1200]) test(`communication/editor reflow and focus at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 }); await signIn(page, 'alex', true);
  await savedShortcuts(page); await page.getByRole('button', { name: 'Edit page', exact: true }).click();
  await page.evaluate(() => { document.documentElement.style.fontSize = '40px'; for (const el of document.querySelectorAll('*')) { el.style.letterSpacing = '.12em'; el.style.wordSpacing = '.16em'; el.style.lineHeight = '1.5'; } });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: 'Save to book', exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/next/editor-${width}.png`, fullPage: true });
});

test('keyboard Show and destructive cancellation contain focus and return to the exact control', async ({ page }) => {
  await signIn(page, 'reader');
  await page.getByRole('button', { name: 'Common Phrases', exact: true }).click();
  const phrase = page.getByRole('button', { name: 'Please wait.', exact: true });
  await phrase.focus(); await page.keyboard.press('Enter');
  await expect(phrase).toBeFocused();
  await expect(phrase).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Enter'); await expect(phrase).toHaveAttribute('aria-pressed', 'false');
  await page.goto('/editor.html');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByLabel('Account', { exact: true })).toBeVisible();
  await signIn(page, 'alex', true);
  await savedShortcuts(page); await page.getByRole('button', { name: 'Edit page', exact: true }).click();
  await expect(page.getByLabel('Wording')).toBeFocused();
  await page.getByLabel('Wording').fill('Keyboard cancellation keeps this fictional passage.');
  await expect(page.getByRole('status')).toContainText('Draft saved on this device');
  const discard = page.getByRole('button', { name: 'Discard draft', exact: true });
  await discard.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  for (let step = 0; step < 4; step++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !document.hasFocus() || document.activeElement.closest('dialog')?.id === 'confirm')).toBe(true);
  }
  await page.getByRole('button', { name: 'Cancel', exact: true }).focus();
  await page.keyboard.press('Escape'); await expect(discard).toBeFocused();
  await expect(page.getByLabel('Wording')).toHaveValue('Keyboard cancellation keeps this fictional passage.');
});

test('communication and editor controls meet the touch floor at phone and tablet widths', async ({ page }) => {
  await signIn(page, 'alex', true);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await savedShortcuts(page); await page.getByRole('button', { name: 'Edit page', exact: true }).click();
    const tooSmall = await page.locator('button:visible, input:visible, textarea:visible, nav a:visible').evaluateAll(elements => elements
      .map(el => ({ name: el.textContent || el.id, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }))
      .filter(size => size.width < 44 || size.height < 44));
    expect(tooSmall).toEqual([]);
    await page.getByRole('button', { name: 'Return', exact: true }).click();
  }
  await page.goto('/#book');
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.locator('button:visible, nav a:visible').evaluateAll(elements => elements.every(el => {
      const bounds = el.getBoundingClientRect(); return bounds.width >= 44 && bounds.height >= 44;
    }))).toBe(true);
  }
});

test('offline retry keeps its original identity, repeated review checks newest wording, and removal/Undo stay recoverable', async ({ browser }) => {
  const a = await browser.newContext(), b = await browser.newContext();
  const pa = await a.newPage(), pb = await b.newPage();
  try {
    await signIn(pa, 'alex', true); await signIn(pb, 'robin', true);
    await savedShortcuts(pa); await pa.getByRole('button', { name: 'Edit phrase', exact: true }).click();
    await savedShortcuts(pb); await pb.getByRole('button', { name: 'Edit phrase', exact: true }).click();
    await b.setOffline(true);
    await pb.getByLabel('Wording').fill('Please wait while I find my words.');
    await pb.getByRole('button', { name: 'Save to book', exact: true }).click();
    await expect(pb.getByRole('status')).toContainText('Waiting to sync');
    const operation = await pb.evaluate(async () => { const s = await new NextLocalStore().open(); const d = await s.read('robin', 'demo'); s.db.close(); return d.outbox[0]; });
    await pa.getByLabel('Wording').fill('Please let me finish.');
    await pa.getByRole('button', { name: 'Save to book', exact: true }).click();
    await expect(pa.getByRole('status')).toContainText('Synced to workspace');
    await b.setOffline(false);
    await pb.getByRole('button', { name: 'Return', exact: true }).click();
    const request = pb.waitForRequest(req => req.url().endsWith('/operations'));
    await pb.getByRole('button', { name: 'Retry sending', exact: true }).click();
    expect((await request).postDataJSON()).toEqual(operation);
    await expect(pb.getByRole('heading', { name: 'Changes need review' })).toBeVisible();
    const pkg = JSON.parse(await pb.evaluate(() => window.NextTrial.exportText()));
    expect(pkg.workspace.conflicts.find(c => c.operation === operation.operation).proposal.payload.text).toBe(operation.payload.text);
    // A change after the comparison was shown must reopen comparison, never overwrite it.
    await pa.getByLabel('Wording').fill('Please give me a choice.');
    await pa.getByRole('button', { name: 'Save to book', exact: true }).click();
    await expect(pa.getByRole('status')).toContainText('Synced to workspace');
    await pb.getByRole('button', { name: 'Publish my wording as a new version', exact: true }).click();
    await expect(pb.getByText('Please give me a choice.', { exact: true })).toBeVisible();
    await expect(pb.getByRole('heading', { name: 'Changes need review' })).toBeVisible();
    await pb.getByRole('button', { name: 'Publish my wording as a new version', exact: true }).click();
    await expect(pb.getByRole('status')).toContainText('Synced to workspace');
    await expect(pb.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await savedShortcuts(pb); await pb.getByRole('button', { name: 'Earlier versions', exact: true }).first().click();
    await pb.getByRole('button', { name: 'Remove saved item', exact: true }).click();
    await expect(pb.getByRole('dialog')).toContainText('Remove this exact phrase');
    await pb.getByRole('button', { name: 'Confirm', exact: true }).click();
    await savedShortcuts(pb); await expect(pb.getByText('Removed · recoverable in Earlier versions', { exact: true })).toBeVisible();
    await savedShortcuts(pb); await pb.getByRole('button', { name: 'Earlier versions', exact: true }).first().click();
    await pb.getByRole('button', { name: 'Restore this version', exact: true }).first().click();
    await savedShortcuts(pb); await expect(pb.getByRole('button', { name: 'Edit phrase', exact: true })).toBeVisible();
    await savedShortcuts(pb); await expect(pb.getByText('Removed · recoverable in Earlier versions', { exact: true })).toHaveCount(0);
    // Alex still has an older current pointer; Undo must conflict with Robin's newer history.
    await savedShortcuts(pa); await pa.getByRole('button', { name: 'Earlier versions', exact: true }).first().click();
    await pa.getByRole('button', { name: 'Undo latest change', exact: true }).click();
    await expect(pa.getByRole('heading', { name: 'Changes need review' })).toBeVisible();
    expect(JSON.parse(await pa.evaluate(() => window.NextTrial.exportText())).workspace.conflicts.some(c => c.proposal.action === 'undo')).toBe(true);
  } finally { await a.close(); await b.close(); }
});

test('real authenticated reader/editor/outsider requests enforce workspace access and CSRF', async ({ browser }) => {
  const contexts = [];
  try {
    for (const name of ['reader', 'alex', 'outsider']) {
      const context = await browser.newContext(); contexts.push(context);
      const page = await context.newPage();
      if (name !== 'outsider') await signIn(page, name);
      else {
        await page.goto('/#book'); await page.getByLabel('Account', { exact: true }).fill(name);
        await page.getByLabel('Password', { exact: true }).fill('outsider-fictional-only');
        const signInResponse = page.waitForResponse(response => response.url().endsWith('/sign-in'));
        await page.getByRole('button', { name: 'Sign in', exact: true }).click();
        expect((await signInResponse).status()).toBe(200);
        await expect(page.getByRole('status')).toContainText('Access denied');
      }
      const origin = new URL(page.url()).origin;
      const session = await (await context.request.get(origin + '/api/session')).json();
      const headers = { origin, 'x-next-csrf': session.csrf };
      expect(session.actor).toBe(name);
      if (name === 'outsider') {
        const response = await context.request.get(origin + '/api/workspaces/demo');
        expect(response.status()).toBe(403); expect(await response.json()).toEqual({ error: 'Access denied' });
        const receipt = await context.request.post(origin + '/api/workspaces/demo/receipts', { headers, data: { device: 'outsider', edition: 'edition-seed' } });
        expect(receipt.status()).toBe(403); expect(await receipt.json()).toEqual({ error: 'Access denied' });
      }
      if (name !== 'alex') {
        const response = await context.request.post(origin + '/api/workspaces/demo/operations', { headers, data: { actor: 'owner' } });
        expect(response.status()).toBe(403); expect(await response.json()).toEqual({ error: 'Access denied' });
      }
      const grant = await context.request.post(origin + '/api/workspaces/demo/grants', { headers, data: { target: 'outsider', role: 'manager' } });
      expect(grant.status()).toBe(403);
      const csrf = await context.request.post(origin + '/api/workspaces/demo/operations', { data: {} });
      expect(csrf.status()).toBe(403); expect(await csrf.json()).toEqual({ error: 'Request denied' });
    }
  } finally { for (const context of contexts) await context.close(); }
});
