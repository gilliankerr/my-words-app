const { test, expect } = require('@playwright/test');
const { openNoteTools } = require('./note-tools');

test('Notes puts compact cues first and keeps finding, reading and editing simple', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  const cue = 'Fictional book club cue ' + Date.now();
  await addNote(page, cue);
  await expect(page.getByLabel('Search Notes', { exact: true })).toBeHidden();
  await expect(page.getByRole('button', { name: 'All notes', exact: true })).toBeHidden();
  const card = page.locator('[data-note]').filter({ has: page.getByRole('heading', { name: cue, exact: true }) });
  await expect(card).toContainText(cue);
  expect(await card.innerText()).toBe(cue);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(card.locator('.note-open')).toHaveCSS('font-size', '16px');
    expect((await card.locator('.note-open').boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 390) await page.screenshot({ path: 'test-results/next/notes-compact-390.png', fullPage: true });
  }
  await card.locator('.note-open').click();
  await expect(page.locator('main > .passage')).toHaveText(cue);
  await expect(page.locator('main > .passage')).toHaveCSS('font-size', '16px');
  await expect(page.locator('main > h2')).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit note', exact: true }).click();
  await expect(page.getByLabel('What do you want to say?', { exact: true })).toHaveCSS('font-size', '16px');
  await backTo(page, 'Notes');
  await page.getByText('Find notes', { exact: true }).click();
  await openNoteTools(page);
  await page.getByLabel('Search Notes', { exact: true }).fill(cue);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByLabel('Search Notes', { exact: true })).toHaveValue(cue);
  await expect(card).toBeVisible();
});

async function signIn(page, route = 'notes') {
  await page.goto('/#' + route);
  await page.getByLabel('Account', { exact: true }).fill('reader');
  await page.getByLabel('Password', { exact: true }).fill('reader-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: route === 'people' ? 'People' : 'Notes', exact: true })).toBeVisible();
  // Opening is deliberately nonblocking. Offline cases require finished caching.
  await page.evaluate(() => navigator.serviceWorker.ready);
}
async function addNote(page, text, title) {
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await page.getByLabel('What do you want to say?', { exact: true }).fill(text);
  if (title) await page.getByLabel('Title (optional)', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Notes', exact: true })).toBeVisible();
}
async function findNote(page, title) {
  await openNoteTools(page);
  await page.getByRole('button', { name: 'All notes', exact: true }).click();
  await openNoteTools(page);
  await page.getByLabel('Search Notes', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.locator('[data-note]').filter({ has: page.getByRole('heading', { name: title, exact: true }) }).locator('.note-open').click();
}

async function memoryEditor(page, kind) {
  await page.evaluate(kind => {
    const main = document.getElementById('main'), status = document.getElementById('status');
    const node = (tag, text, parent, cls) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; parent?.append(el); return el; };
    const payload = { id: 'source-expression-fixture', kind: 'page', category: 'personal', text: kind === 'person' ? 'Pat\nPhone: fictional number' : 'Earlier complete wording', name: kind === 'person' ? 'Pat' : 'Fictional retained note', revision: 1,
      original: { name: 'Pat', groups: ['Book club', 'Neighbours'], aliases: ['Émilie'], photo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2fQAAAAASUVORK5CYII=', remotePhoto: 'https://example.invalid/private-photo', future: { retained: true } },
      binding: { source: 'content', path: [kind === 'person' ? 'contacts' : 'notes', 0], fingerprint: 'untouched' }, future: { custom: ['retained'] } };
    window.expressionMemory = { payload, drafts: {}, saved: [], fail: kind === 'note' };
    const ctx = { scopeKey: 'memory-editor-fixture', main, node, clear: title => { main.replaceChildren(); node('h1', title, main); }, records: () => [payload], drafts: () => window.expressionMemory.drafts,
      button: (label, fn, parent = main, cls) => { const b = node('button', label, parent, cls); b.type = 'button'; b.onclick = () => Promise.resolve().then(fn).catch(ctx.report); return b; },
      rememberDraft: async p => { window.expressionMemory.drafts[p.id] = { id: p.id, base: 1, state: 'draft', payload: structuredClone(p) }; },
      save: async p => { if (window.expressionMemory.fail) throw new Error('Fictional storage failure'); window.expressionMemory.saved.push(structuredClone(p)); return { outcome: 'accepted' }; },
      report: e => { status.textContent = e.message; }, message: text => { status.textContent = text; }, confirm: async () => false,
      navigate: () => {}, history: () => {}, discardDraft: async () => {} };
    window.expressionMemoryContext = ctx;
    if (kind === 'person') NextExpression.editPerson(ctx, payload); else NextExpression.editNote(ctx, payload);
  }, kind);
}

test('reader keeps multiple drafts, empty saves, full punctuation and offline changes across reload', async ({ page, context }) => {
  await signIn(page);
  const title = 'Fictional draft ' + Date.now();
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await page.getByLabel('Title (optional)').fill(title);
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByLabel('What do you want to say?')).toBeVisible();
  await expect(page.getByText('Enter what you want to say before saving. Your unfinished note is kept.', { exact: true })).toBeVisible();
  await page.getByLabel('What do you want to say?').fill('First unfinished clue');
  await backTo(page, 'Notes');
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await page.getByLabel('Title (optional)').fill(title + ' second');
  await page.getByLabel('What do you want to say?').fill('Second unfinished clue');
  await backTo(page, 'Notes');
  await context.setOffline(true); await page.reload();
  await openNoteTools(page);
  await page.getByRole('button', { name: 'Unfinished', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: title + ' second', exact: true })).toBeVisible();
  const row = page.locator('.saved-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  await row.getByRole('button', { name: 'Continue note', exact: true }).click();
  const full = 'Élodie’s question — complete wording.\n\n' + 'A long sentence remains available. '.repeat(120) + 'Final clue at the end.';
  await page.getByLabel('What do you want to say?').fill(full);
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await openNoteTools(page);
  await page.getByRole('button', { name: 'All notes', exact: true }).click();
  await findNote(page, title);
  await expect(page.locator('main > .passage')).toHaveText(full);
  await expect(page.getByRole('button', { name: 'Show note', exact: true })).toHaveCount(0);
  await backTo(page, 'Notes');
  await page.reload(); await findNote(page, title);
  await expect(page.locator('main > .passage')).toHaveText(full);
});

test('exact note deletion has cancellation focus and archived restoration retains an attached draft', async ({ page }) => {
  await signIn(page);
  const title = 'Lifecycle note ' + Date.now(), text = 'Exact fictional message with punctuation — retained.';
  await addNote(page, text, title); await findNote(page, title);
  await page.getByRole('button', { name: 'Edit note', exact: true }).click();
  await page.getByLabel('What do you want to say?').fill('A separate unfinished change.');
  await backTo(page, 'Notes');
  await findNote(page, title);
  await page.getByText('Note options', { exact: true }).click();
  await page.getByRole('button', { name: 'Delete note', exact: true }).click();
  const dialog = page.locator('#confirm'); await expect(dialog).toContainText(text);
  await dialog.getByRole('button', { name: 'Keep note', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete note', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Archive note', exact: true }).click();
  await openNoteTools(page);
  await page.getByRole('button', { name: 'Unfinished', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(0);
  await openNoteTools(page);
  await page.getByRole('button', { name: 'Archived notes', exact: true }).click();
  await page.locator('[data-note]').filter({ has: page.getByRole('heading', { name: title, exact: true }) }).locator('.note-open').click();
  await page.getByText('Note options', { exact: true }).click();
  await page.getByRole('button', { name: 'Delete note', exact: true }).click();
  await dialog.getByRole('button', { name: 'Delete note', exact: true }).click();
  await openNoteTools(page);
  await page.getByRole('button', { name: 'Recently deleted', exact: true }).click();
  await page.locator('[data-note]').filter({ has: page.getByRole('heading', { name: title, exact: true }) }).locator('.note-open').click();
  await page.getByRole('button', { name: 'Restore note', exact: true }).click();
  await openNoteTools(page);
  await page.getByRole('button', { name: 'Archived notes', exact: true }).click();
  const archived = page.locator('[data-note]').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  await expect(archived).toBeVisible();
  await archived.locator('.note-open').click();
  await page.getByRole('button', { name: 'Restore note', exact: true }).click();
  await openNoteTools(page);
  await page.getByRole('button', { name: 'Unfinished', exact: true }).click();
  const draft = page.locator('.saved-card').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  await expect(draft).toContainText('A separate unfinished change.');
});

test('People use one passage, distinguish duplicate labels and search complete offline wording', async ({ page, context }) => {
  await signIn(page, 'people');
  const name = 'Pa ' + Date.now();
  for (const details of ['First fictional person\nÉmilie\nBook club\nNeighbours', 'Second fictional person\nPat\nNeighbours']) {
    await page.getByRole('button', { name: 'Add person', exact: true }).click();
    await expect(page.locator('main textarea')).toHaveCount(1);
    await page.getByLabel('About this person', { exact: true }).fill(name + '\n' + details);
    await page.getByRole('button', { name: 'Save person', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'People', exact: true })).toBeVisible();
  }
  await (await peopleSearch(page)).fill(name);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('[data-person]')).toHaveCount(2);
  const ids = await page.locator('[data-person]').evaluateAll(rows => rows.map(row => row.dataset.person));
  expect(new Set(ids).size).toBe(2);
  await (await peopleSearch(page)).fill('emilie book');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('[data-person]')).toHaveCount(1);
  await page.locator('[data-person] .note-open').first().click();
  await expect(page.locator('main > .passage')).toHaveText(name + '\nFirst fictional person\nÉmilie\nBook club\nNeighbours');
  await expect(page.getByRole('button', { name: 'Show person', exact: true })).toHaveCount(0);
  await backTo(page, 'People');
  await context.setOffline(true); await page.reload();
  await (await peopleSearch(page)).fill('emilie');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('[data-person]')).toHaveCount(1);
});

test('one-passage People drafts survive offline reload and remain usable at phone and tablet widths', async ({ page, context }) => {
  await signIn(page, 'people');
  const passage = 'Élodie — neighbour ' + Date.now() + '\n\n' + 'Complete recognition detail. '.repeat(25) + 'Final clue.';
  await page.getByRole('button', { name: 'Add person', exact: true }).click();
  const wording = page.getByLabel('About this person', { exact: true });
  await page.getByRole('button', { name: 'Save person', exact: true }).click();
  await expect(wording).toBeFocused();
  await wording.fill(passage);
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('main button:visible').evaluateAll(els => els.every(el => el.getBoundingClientRect().height >= 44))).toBe(true);
  }
  await backTo(page, 'People');
  await context.setOffline(true); await page.reload();
  await expect(page.getByRole('navigation', { name: 'People filters', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Unfinished people', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Deleted people', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add person', exact: true }).click();
  await page.getByRole('button', { name: 'Continue person', exact: true }).click();
  await expect(wording).toHaveValue(passage);
  await page.getByRole('button', { name: 'Save person', exact: true }).click();
  await (await peopleSearch(page)).fill('Final clue');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.locator('[data-person] .note-open').first().click();
  await expect(page.locator('main > .passage')).toHaveText(passage);
  await page.screenshot({ path: 'output/review-people-tablet.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'output/review-people-phone.png', fullPage: true });
});

test('note favourites keep deliberate order through reading, movement and offline reopening', async ({ page, context }) => {
  await signIn(page);
  const prefix = 'Fictional favourite ' + Date.now(), titles = [prefix + ' first', prefix + ' second', prefix + ' third'];
  for (const title of titles) {
    await addNote(page, 'Complete message for ' + title, title); await findNote(page, title);
    await page.getByText('Note options', { exact: true }).click();
    await page.getByRole('button', { name: 'Favourite note', exact: true }).click();
    await expect(page.getByText('Note options', { exact: true })).toBeVisible();
    await backTo(page, 'Notes');
  }
  await openNoteTools(page);
  await page.getByRole('button', { name: 'Favourites', exact: true }).click();
  await openNoteTools(page);
  await page.getByLabel('Search Notes', { exact: true }).fill(prefix);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('[data-note] .note-title')).toHaveText(titles);
  const third = page.locator('[data-note]').filter({ has: page.getByRole('heading', { name: titles[2], exact: true }) });
  await third.getByRole('button', { name: 'Move favourite up', exact: true }).click();
  const order = [titles[0], titles[2], titles[1]];
  await expect(page.locator('[data-note] .note-title')).toHaveText(order);
  await page.locator('[data-note]').first().locator('.note-open').click();
  await backTo(page, 'Notes');
  await expect(page.locator('[data-note] .note-title')).toHaveText(order);
  await context.setOffline(true); await page.reload();
  await openNoteTools(page);
  await page.getByRole('button', { name: 'Favourites', exact: true }).click();
  await openNoteTools(page);
  await page.getByLabel('Search Notes', { exact: true }).fill(prefix);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('[data-note] .note-title')).toHaveText(order);
});

test('full-record batches and unsafe wording remain readable at phone and tablet widths (memory UI)', async ({ page }) => {
  await signIn(page);
  await page.evaluate(() => {
    const records = Array.from({ length: 500 }, (_, i) => ({ id: 'memory-' + i, kind: 'note', category: 'notes', text: 'Fictional message ' + i }));
    records[486].text += ' '.repeat(1000) + 'Après l’école — final rendez-vous';
    records[486].future = { keep: true };
    records[0].text = '<img src=x onerror="window.expressionUnsafe=1"><script>window.expressionUnsafe=2</script>';
    const main = document.getElementById('main');
    const node = (tag, text, parent, cls) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; parent?.append(el); return el; };
    const ctx = { scopeKey: 'fictional-search-only', main, node, clear: name => { main.replaceChildren(); node('h1', name, main); }, records: () => records, drafts: () => [],
      button: (label, fn, parent = main, cls) => { const b = node('button', label, parent, cls); b.type = 'button'; b.onclick = fn; return b; }, show: text => { document.getElementById('show-text').textContent = text; document.getElementById('show').showModal(); },
      save: async () => ({ outcome: 'accepted' }), rememberDraft: async () => {}, report: () => {}, confirm: async () => false, history: () => {} };
    window.batchExpressionContext = ctx; NextExpression.notes(ctx);
  });
  await expect(page.locator('[data-note]')).toHaveCount(20);
  await expect(page.locator('main img, main script')).toHaveCount(0);
  expect(await page.evaluate(() => window.expressionUnsafe)).toBeUndefined();
  await page.getByRole('button', { name: 'Show more notes', exact: true }).click();
  await expect(page.locator('[data-note]')).toHaveCount(40);
  await openNoteTools(page);
  await page.getByLabel('Search Notes', { exact: true }).fill('apres ecole rendez vous');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('[data-note]')).toHaveCount(1);
  await expect(page.locator('[data-note]')).toHaveAttribute('data-note', 'memory-486');
  await expect(page.locator('[data-note]')).toContainText('Après l’école');
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('main button:visible').evaluateAll(buttons => buttons.filter(b => b.getClientRects().length).every(b => b.getBoundingClientRect().height >= 44))).toBe(true);
  }
  await page.locator('.note-open').click();
  await expect(page.locator('main > .passage')).toContainText('final rendez-vous');
  await page.evaluate(() => NextExpression.notes(window.batchExpressionContext));
  await expect(page.getByLabel('Search Notes', { exact: true })).toHaveValue('apres ecole rendez vous');
});

test('failed note saves retain input, prior envelope and durable draft for retry (memory UI)', async ({ page }) => {
  await signIn(page); await memoryEditor(page, 'note');
  await page.getByLabel('What do you want to say?').fill('A complete proposed change — kept.');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByText('Unable to save. Your input and earlier wording are kept. Retry saving or export wording.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('What do you want to say?')).toHaveValue('A complete proposed change — kept.');
  const failed = await page.evaluate(() => window.expressionMemory);
  expect(failed.payload.text).toBe('Earlier complete wording');
  expect(failed.drafts[failed.payload.id].payload.text).toBe('A complete proposed change — kept.');
  await page.evaluate(() => { window.expressionMemory.fail = false; });
  await page.getByRole('button', { name: 'Retry saving', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.expressionMemory.saved.length)).toBe(1);
  const saved = await page.evaluate(() => window.expressionMemory.saved[0]);
  expect(saved.binding).toEqual(failed.payload.binding); expect(saved.original).toEqual(failed.payload.original); expect(saved.future).toEqual(failed.payload.future);
});

test('contact editing has no photo UI or requests and preserves opaque legacy metadata (memory UI)', async ({ page }) => {
  const imageRequests = [];
  page.on('request', request => { if (request.url().includes('example.invalid/private-photo')) imageRequests.push(request.url()); });
  await signIn(page, 'people'); await memoryEditor(page, 'person');
  await expect(page.locator('main img')).toHaveCount(0);
  await expect(page.locator('main input[type="file"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remove photo', exact: true })).toHaveCount(0);
  await expect(page.locator('main textarea')).toHaveCount(1);
  await page.getByLabel('About this person', { exact: true }).fill('Pa\nPhone: fictional number');
  await page.getByRole('button', { name: 'Save person', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.expressionMemory.saved.length)).toBe(1);
  const { payload, saved } = await page.evaluate(() => window.expressionMemory);
  expect(saved[0]).toMatchObject({ id: payload.id, kind: 'page', category: 'personal', name: 'Pa', text: 'Pa\nPhone: fictional number', binding: payload.binding, original: payload.original, future: payload.future });
  expect(saved[0].aliases).toBeUndefined();
  expect(saved[0].original.photo).toBe(payload.original.photo); expect(imageRequests).toEqual([]);
  await page.evaluate(() => NextExpression.people(window.expressionMemoryContext));
  await expect(page.locator('main img')).toHaveCount(0);
  await page.locator('[data-person] .note-open').first().click();
  await expect(page.locator('main img')).toHaveCount(0); expect(imageRequests).toEqual([]);
});


async function backTo(page, heading) {
  for (let i = 0; i < 6; i++) {
    if (await page.getByRole('heading', { name: heading, exact: true }).isVisible()) return;
    await page.locator('#navigation-back').click();
    await page.waitForTimeout(50);
  }
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
}

test('person save gives immediate feedback and rejects repeated submissions during draft and save', async ({ page }) => {
  await signIn(page, 'people'); await memoryEditor(page, 'person');
  await page.evaluate(() => {
    const ctx = window.expressionMemoryContext;
    ctx.rememberDraft = () => new Promise(resolve => { window.finishPersonDraft = resolve; });
    ctx.save = async p => { window.expressionMemory.saved.push(p); return { outcome: 'waiting' }; };
  });
  await page.getByRole('button', { name: 'Save person', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
  await page.locator('main form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
  await page.evaluate(() => window.finishPersonDraft());
  await expect.poll(() => page.evaluate(() => window.expressionMemory.saved.length)).toBe(1);
  await expect(page.locator('#status')).toContainText('Person saved on this device. Waiting to sync.');
});
async function peopleSearch(page) {
  const query = page.getByLabel('Search People', { exact: true });
  if (!await query.isVisible()) await page.getByText('Find people', { exact: true }).click();
  return query;
}

test('compact People categories support multiple memberships, favourites and offline filtering', async ({ page, context }) => {
  await signIn(page, 'people');
  const name = 'Fictional category person ' + Date.now();
  await page.getByRole('button', { name: 'Add person', exact: true }).click();
  await page.getByLabel('About this person', { exact: true }).fill(name + '\nA recognition clue');
  for (const label of ['Family', 'Book club', 'Favourites']) await page.getByRole('checkbox', { name: label, exact: true }).check();
  await page.getByRole('button', { name: 'Save person', exact: true }).click();
  await expect(page.locator('#status')).toContainText('Person saved');
  const card = page.locator('[data-person]').filter({ has: page.getByRole('heading', { name, exact: true }) });
  await expect(card.locator('.person-category')).toHaveText(['Family', 'Book club', 'Favourites']);
  const nav = page.getByRole('navigation', { name: 'People groups', exact: true });
  for (const label of ['Health team', 'Family', 'Friends', 'Neighbours', 'Cottage', 'Contractors', 'Other', 'Emergency contact', 'Book club', 'Favourites']) {
    await expect(nav.getByRole('button', { name: label, exact: true })).toBeVisible();
    await expect(nav.getByRole('button', { name: label, exact: true }).locator('svg')).toHaveCount(1);
  }
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await nav.locator('button').evaluateAll(els => els.every(el => el.getBoundingClientRect().height >= 44))).toBe(true);
    if (width !== 320) await page.screenshot({ path: `test-results/next/people-categories-${width}.png`, fullPage: true });
  }
  for (const label of ['Family', 'Book club', 'Favourites']) {
    await nav.getByRole('button', { name: label, exact: true }).click(); await expect(card).toBeVisible();
  }
  await context.setOffline(true); await page.reload();
  await nav.getByRole('button', { name: 'Book club', exact: true }).click(); await expect(card).toBeVisible();
  await card.locator('.note-open').click(); await page.getByRole('button', { name: 'Edit person', exact: true }).click();
  for (const label of ['Family', 'Book club', 'Favourites']) await expect(page.getByRole('checkbox', { name: label, exact: true })).toBeChecked();
});
