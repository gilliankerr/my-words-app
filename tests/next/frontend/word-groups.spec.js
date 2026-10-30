const { test, expect } = require('@playwright/test');
test('saved groups show single words, preserve ordered composition offline, and keep independent notes', async ({ page, context }) => {
  await page.goto('/#home');
  await page.getByLabel('Account', { exact: true }).fill('reader');
  await page.getByLabel('Password', { exact: true }).fill('reader-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const repo = new NextRepository(); await repo.session();
    const id = crypto.randomUUID();
    await repo.request('workspaces/demo/operations', { recordId: id, operation: crypto.randomUUID(), base: 0,
      payload: { id, kind: 'group', category: 'quick-words', name: 'Fictional café', text: 'Élodie’s café\nA complete long phrase', words: [{ text: 'Élodie’s café' }, { text: 'A complete long phrase' }], selection: [], binding: { source: 'addition', category: 'quick-words' }, tombstone: false } });
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible(); await page.evaluate(() => NextTrial.checkUpdates());
  await page.getByRole('button', { name: /Quick words/ }).click();
  await page.getByRole('button', { name: 'Fictional café', exact: true }).click();
  await page.getByRole('button', { name: 'Élodie’s café', exact: true }).click();
  await expect(page.locator('[data-show-page] .passage')).toHaveText('Élodie’s café');
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Compose message', exact: true }).click();
  await page.getByRole('button', { name: 'A complete long phrase', exact: true }).click();
  await page.getByRole('button', { name: 'Élodie’s café', exact: true }).click();
  await expect(page.locator('[data-group-selection]')).toHaveText('A complete long phrase · Élodie’s café');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Keep word list and selection', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('kept');
  await page.reload(); await expect(page.getByRole('heading', { name: 'Quick words', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fictional café', exact: true }).click();
  await page.getByRole('button', { name: 'Compose message', exact: true }).click();
  await expect(page.locator('[data-group-selection]')).toHaveText('A complete long phrase · Élodie’s café');
  await page.getByRole('button', { name: 'Keep message as a note', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Add note', exact: true })).toBeVisible();
  await expect(page.getByLabel('What do you want to say?', { exact: true })).toHaveValue('A complete long phrase Élodie’s café');
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Notes', exact: true })).toBeVisible();
});

test('legacy second Home word group carries into Favourites and Shortcuts without rewriting the slots', async ({ page }) => {
  await page.goto('/#home');
  await expect(page.getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
  const hadGeneric=await page.evaluate(async () => {
    const repo=new NextRepository(); await repo.signIn('reader','reader-fictional-only'); const id=crypto.randomUUID();
    const group={...NextBook.addition('group','quick-words','Tea\nPlease',id,'Fictional old second shortcut'),words:[{text:'Tea'},{text:'Please'}]};
    await repo.request('workspaces/demo/operations',{recordId:id,base:0,operation:crypto.randomUUID(),payload:group});
    const slot={...NextBook.addition('preference','home-slot:2','Home shortcut 2',NextWordGroups.slotId(2)),groupId:id,groupLabel:group.name,future:{keep:true}};
    await repo.request('workspaces/demo/operations',{recordId:slot.id,base:0,operation:crypto.randomUUID(),payload:slot});return Object.values((await repo.request('workspaces/demo')).records).some(r=>NextBook.latest(r).payload.category==='shortcuts');
  });
  await page.getByLabel('Account',{exact:true}).fill('reader');await page.getByLabel('Password', { exact: true }).fill('reader-fictional-only');await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Shortcuts',exact:true}).click();if(!hadGeneric)await expect(page.locator('.shortcut-row')).toContainText('Fictional old second shortcut');
  await page.getByRole('link',{name:'Home',exact:true}).click();await page.getByRole('button',{name:'Favourites',exact:true}).click();await expect(page.getByRole('button',{name:'Fictional old second shortcut',exact:true})).toBeVisible();
  const backup=await page.evaluate(async()=>JSON.parse(await NextTrial.exportText()));expect(backup.workspace.records['5d02a111-4ca0-5000-8000-000000000002'].revisions.at(-1).payload.future).toEqual({keep:true});
});

test('group editing preserves unknown fields and complete words; archived Home references stay in position', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/#home'); await page.getByLabel('Account', { exact: true }).fill('reader'); await page.getByLabel('Password', { exact: true }).fill('reader-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  const id = await page.evaluate(async () => {
    const repo = new NextRepository(); await repo.session(); const id = crypto.randomUUID();
    await repo.request('workspaces/demo/operations', { recordId: id, operation: crypto.randomUUID(), base: 0, payload: {
      id, kind: 'group', category: 'quick-words', name: 'Fictional editing group', text: 'First complete phrase\nSecond complete phrase', future: { retained: true },
      words: [{ text: 'First complete phrase', source: { id: 'original-first', text: 'First complete phrase', future: 7 } }, { text: 'Second complete phrase' }], selection: [1, 0], binding: { source: 'addition', category: 'quick-words' }
    } }); return id;
  });
  await page.reload(); await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible(); await page.evaluate(() => NextTrial.checkUpdates()); await page.getByRole('button', { name: /Quick words/ }).click(); await page.getByRole('button', { name: 'Fictional editing group', exact: true }).click();
  await page.getByRole('button', { name: 'Edit word group', exact: true }).click(); await page.getByLabel('Group name', { exact: true }).fill('Fictional revised group');
  await page.getByRole('button', { name: 'Move down: First complete phrase', exact: true }).click();
  const injected = '<img src=x onerror="window.groupInjection=true">complete phrase';
  await page.getByLabel('Add complete word or phrase', { exact: true }).fill(injected); await page.getByRole('button', { name: 'Add word', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Word group saved', exact: true })).toBeVisible();
  await expect(page.locator('main img[src="x"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.groupInjection)).toBeUndefined();
  const payload = await page.evaluate(async id => { const repo = new NextRepository(); await repo.session(); return NextBook.latest((await repo.request('workspaces/demo')).records[id]).payload; }, id);
  expect(payload.future).toEqual({ retained: true });
  expect(payload.words.map(w => w.text)).toEqual(['Second complete phrase', 'First complete phrase', injected]);
  expect(payload.words[1].source.future).toBe(7); expect(payload.selection).toEqual([0, 1]);
  await page.getByRole('button', { name: 'Add shortcut', exact: true }).click(); await expect(page.locator('#status')).toContainText('Shortcut added'); await page.getByRole('link', { name: 'Home', exact: true }).click(); await page.getByRole('button', { name: 'Shortcuts', exact: true }).click();
  await page.getByRole('button', { name: 'Fictional revised group', exact: true }).click(); await page.getByRole('button', { name: 'Edit word group', exact: true }).click();
  await page.getByRole('button', { name: 'Archive group', exact: true }).click(); await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.getByRole('link', { name: 'Home', exact: true }).click(); await page.getByRole('button', { name: 'Shortcuts', exact: true }).click(); await expect(page.locator('.shortcuts-collection')).toContainText('unavailable');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/next/groups-run/group-phone-unavailable.png', fullPage: true });
  await page.setViewportSize({ width: 768, height: 1024 }); await page.getByRole('link', { name: 'Home', exact: true }).click(); await page.getByRole('button', { name: /Quick words/ }).click();
  await page.getByText('Archived and deleted groups', { exact: true }).click(); await page.getByRole('button', { name: 'Restore group', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fictional revised group', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Home', exact: true }).click(); await page.getByRole('button', { name: 'Shortcuts', exact: true }).click(); await expect(page.locator('.shortcuts-collection')).toContainText('Fictional revised group');
  await expect(page.locator('.shortcuts-collection')).not.toContainText('unavailable');
  await page.screenshot({ path: 'test-results/next/groups-run/group-tablet-restored.png', fullPage: true });
});

test('a delayed group restoration preserves a deliberate navigation to Home', async ({ page }) => {
  await page.goto('/#home'); await page.getByLabel('Account', { exact: true }).fill('reader'); await page.getByLabel('Password', { exact: true }).fill('reader-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await page.evaluate(async () => {
    const repo = new NextRepository(); await repo.session(); const id = crypto.randomUUID();
    await repo.request('workspaces/demo/operations', { recordId: id, operation: crypto.randomUUID(), base: 0, payload: { id, kind: 'group', category: 'quick-words', name: 'Fictional delayed group', archived: true, text: 'Word', words: [{ text: 'Word' }], binding: { source: 'addition', category: 'quick-words' } } });
  });
  await page.reload(); await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible(); await page.evaluate(() => NextTrial.checkUpdates()); await page.getByRole('button', { name: /Quick words/ }).click(); await page.getByText('Archived and deleted groups', { exact: true }).click();
  let release, captured;
  const gate = new Promise(resolve => { release = resolve; }), intercepted = new Promise(resolve => { captured = resolve; });
  await page.route('**/api/workspaces/demo/operations', async route => { captured(); await gate; await route.continue(); });
  await page.getByRole('button', { name: 'Restore group', exact: true }).click(); await intercepted;
  await page.getByRole('link', { name: 'Home', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  release(); await expect(page.getByRole('status')).toHaveText('Saved to book. Synced to workspace.');
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
});

test('Book capture previews exact chosen order and saves a reusable snapshot without changing Home', async ({ page }) => {
  await page.goto('/#book'); await page.getByLabel('Account', { exact: true }).fill('reader'); await page.getByLabel('Password', { exact: true }).fill('reader-fictional-only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Communication book', exact: true })).toBeVisible();
  const before = await page.evaluate(async () => { const repo = new NextRepository(); await repo.session(); const snapshot = await repo.request('workspaces/demo'); return Object.fromEntries(Object.entries(snapshot.records).filter(([, r]) => NextBook.latest(r).payload.category?.startsWith('home-slot:'))); });
  await page.getByRole('button', { name: 'People words', exact: true }).click(); await page.getByRole('button', { name: 'Save word group', exact: true }).click();
  await page.getByRole('button', { name: 'spouse', exact: true }).click(); await page.getByRole('button', { name: 'wife', exact: true }).click();
  await page.getByRole('button', { name: 'Preview word group', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Save word group', exact: true })).toBeVisible();
  await expect(page.getByLabel('Group name', { exact: true })).toHaveValue('spouse · wife');
  await expect(page.locator('.group-edit-word p')).toHaveText(['spouse', 'wife']);
  await page.getByRole('button', { name: 'Save word group', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Word group saved', exact: true })).toBeVisible();
  const saved = await page.evaluate(async () => { const repo = new NextRepository(); await repo.session(); const snapshot = await repo.request('workspaces/demo'); return { group: Object.values(snapshot.records).map(r => NextBook.latest(r).payload).find(p => p.kind === 'group' && p.name === 'spouse · wife'), home: Object.fromEntries(Object.entries(snapshot.records).filter(([, r]) => NextBook.latest(r).payload.category?.startsWith('home-slot:'))) }; });
  expect(saved.home).toEqual(before); expect(saved.group.words.map(w => w.text)).toEqual(['spouse', 'wife']);
  expect(saved.group.words[0].source.binding.category).toBe('people'); expect(saved.group.words[0].source.original.text).toBe('spouse');
  await page.getByRole('button', { name: 'Open word group', exact: true }).click(); await page.getByRole('button', { name: 'spouse', exact: true }).click();
  await expect(page.locator('[data-show-page] .passage')).toHaveText('spouse');
});
