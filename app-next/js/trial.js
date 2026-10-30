(async function () {

  'use strict';

  const M = NextModel, B = NextBook, main = document.getElementById('main'), status = document.getElementById('status'), recovery = document.getElementById('recovery');

  let editorMode = location.pathname === '/editor.html';

  const sharedAccount = globalThis.NextRuntime?.sharedAccount === true;

  const multiAccount = globalThis.NextRuntime?.multiAccount === true;

  const privateLocal = globalThis.NextRuntime?.privateLocal === true;

  let bookId = 'demo', needsSetup = false;

  let store;
  globalThis.NextBoot?.phase('Opening saved storage');

  try { store = await new NextLocalStore().open(); }

  catch { main.replaceChildren(); const notice = document.createElement('p'); notice.textContent = 'Saved storage could not open. Your existing bytes have not been replaced.'; main.append(notice); const retry = document.createElement('button'); retry.textContent = 'Retry opening'; retry.onclick = () => location.reload(); main.append(retry); message('Unable to open saved storage. Retry opening.'); return; }

  const repository = new NextRepository();

  let actor, data, sync, master, masterHash, edit, draftQueue = Promise.resolve(), saveQueue = Promise.resolve(), shoppingQueue = Promise.resolve(), expressionQueue = Promise.resolve(), view = 'home', editingCategory, expressionReturn;

  let quickDraftQueue = Promise.resolve();
  const waitDrafts = () => Promise.all([draftQueue, quickDraftQueue]);
  let accountEpoch = 0;
  globalThis.NextBoot?.phase('Reading saved sign-in');
  let device = (await store.identity())?.device || crypto.randomUUID();

  const node = (tag, text, parent, cls) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; parent?.append(el); return el; };

  function message(text) { status.textContent = text; }

  function button(text, action, parent = main, cls) {

    const el = node('button', text, parent, cls); el.type = 'button';

    el.addEventListener('click', () => Promise.resolve().then(action).catch(report)); return el;

  }

  function report(error) { message(error.message || 'Unable to save. Your input is retained. Retry or export your draft.'); }

  const screens = new Map();
  let savedVersion = 0;
  let screenEpoch = 0;
  let currentScreen, pendingURL, restoringScreen = false;
  const navigationSession = crypto.randomUUID();

  function retainScreen() {
    if (!currentScreen || currentScreen.scope !== actor + ':' + bookId) return;
    const content = document.createDocumentFragment(), retainedRecovery = document.createDocumentFragment();
    currentScreen.focus = document.activeElement; currentScreen.scroll = window.scrollY;
    currentScreen.status = status.textContent;
    Object.assign(currentScreen, { edit, editingCategory, expressionReturn });
    content.append(...main.childNodes); retainedRecovery.append(...recovery.childNodes);
    Object.assign(currentScreen, { content, recovery: retainedRecovery });
  }

  function navigationState() {
    // History carries opaque screen identity only; private wording stays in RAM/IndexedDB.
    return { nextScreen: currentScreen.id, nextSession: navigationSession };
  }

  function updateNavigation() {
    document.getElementById('navigation-back').disabled = !currentScreen?.parent && (!actor || view === 'home' && !editorMode);
    document.title = editorMode ? 'Settings — My Words' : 'My Words';
  }

  function goBack() {
    if (currentScreen?.parent) window.history.back();
    else if (actor && (view !== 'home' || editorMode)) { editorMode = false; navigate('home'); }
  }

  document.getElementById('navigation-back').onclick = goBack;

  function clear(title, screenKey = '') {
    globalThis.NextAppUpdate?.cancel();
    globalThis.NextBoot?.finish();
    screenEpoch++;
    if (!actor || data?.locked || currentScreen && currentScreen.scope !== actor + ':' + bookId) { screens.clear(); currentScreen = null; }
    else if (!restoringScreen) {
      const url = pendingURL || location.pathname + location.search + location.hash;
      const same = currentScreen?.scope === actor + ':' + bookId && currentScreen.title === title && currentScreen.url === url && currentScreen.view === view && currentScreen.key === screenKey;
      if (!same) {
        const previous = currentScreen;
        retainScreen();
        currentScreen = { id: crypto.randomUUID(), scope: actor + ':' + bookId, title, key: screenKey, url, view, editorMode, parent: previous?.id };
        screens.set(currentScreen.id, currentScreen);
        if (previous) window.history.pushState(navigationState(), '', url);
        else window.history.replaceState(navigationState(), '', url);
      } else { currentScreen.view = view; currentScreen.content = null; currentScreen.recovery = null; }
    }
    pendingURL = null; updateNavigation();
    main.replaceChildren(); recovery.replaceChildren();

    const heading = node('h1', title, main); heading.tabIndex = -1;

    const addNote = document.getElementById('add-note-link'); if (addNote) addNote.hidden = title === 'Add note' || title === 'Edit note';

    if (actor) { heading.focus({ preventScroll: true }); window.scrollTo(0, 0); }

  }

  window.addEventListener('popstate', event => {
    globalThis.NextAppUpdate?.cancel();
    screenEpoch++;
    if (!actor || !data || data.locked) { screens.clear(); currentScreen = null; return; }
    const target = event.state?.nextSession === navigationSession && screens.get(event.state.nextScreen);
    if (target?.scope === actor + ':' + bookId && target.content) {
      retainScreen(); currentScreen = target; editorMode = target.editorMode; view = target.view;
      edit = target.edit; editingCategory = target.editingCategory; expressionReturn = target.expressionReturn;
      main.replaceChildren(target.content); recovery.replaceChildren(target.recovery);
      target.content = null; target.recovery = null; status.textContent = target.status || '';
      updateNavigation(); target.focus?.focus({ preventScroll: true }); window.scrollTo(0, target.scroll || 0);
      if (target.refresh && target.savedVersion !== savedVersion) {
        const position = target.scroll, focusId = target.focus?.id;
        Promise.resolve(target.refresh()).then(() => { if (currentScreen === target) { if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true }); window.scrollTo(0, position || 0); } }).catch(report);
      }
    } else {
      // After a cold reload, return to the public destination; drafts remain in IndexedDB.
      screens.clear(); currentScreen = null; editorMode = location.pathname === '/editor.html';
      editorMode ? home() : renderRoute();
    }
  });

  document.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link || !actor || !data || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    const url = new URL(link.href);
    if (url.origin !== location.origin || !['/', '/index.html', '/editor.html'].includes(url.pathname)) return;
    event.preventDefault(); editorMode = url.pathname === '/editor.html';
    pendingURL = url.pathname + url.hash;
    editorMode ? home() : renderRoute(url.hash.slice(1));
  });

  main.addEventListener('keydown', event => {
    if (event.key === 'Escape' && main.querySelector('[data-show-page]')) { event.preventDefault(); goBack(); }
  });

  const edition = () => data.snapshot.editions[data.active];

  const recordFor = id => data.snapshot.records[id] || data.baselines?.[id];

  const privateOperation = operation => privateLocal || sharedAccount ? { ...operation, privateEpoch: data.snapshot.privateEpoch || 0 } : operation;

  function expressionRecords() {

    const records = new Map(B.catalogue(B.currentEdition(data.snapshot), master, masterHash).map(p => [p.id, { ...p, revision: data.snapshot.records[p.id]?.current ?? 1 }]));

    for (const o of data.outbox) if (o.recordId && o.payload) records.set(o.recordId, { ...M.clone(o.payload), revision: o.base + 1, waiting: true });

    for (const d of Object.values(data.drafts)) if (d.state === 'waiting') records.set(d.id, { ...M.clone(d.payload), revision: d.base + 1, waiting: true });

    return [...records.values()];

  }

  async function rememberExpression(payload, base) {

    const copy = M.clone(payload); delete copy.revision; delete copy.waiting;
    M.insist(!data.snapshot.purgedNotebooks?.[copy.id], 'This notebook was permanently deleted.');

    const r = recordFor(copy.id), number = r?.current ?? (B.baseline(data.snapshot, copy.id, master, masterHash) ? 1 : 0);
    const source = r ? null : baselineSnapshot(copy, number);
    // One atomic local write keeps the complete baseline and draft together.
    data = await store.update(actor, bookId, v => {
      if (source && !v.snapshot.records[copy.id] && !v.baselines?.[copy.id]) { v.baselines ||= {}; v.baselines[copy.id] = source; }
      v.drafts[copy.id] = { id: copy.id, base: base ?? number, payload: copy, state: 'draft' }; return v;
    });

  }

  function saveExpression(payload, options = {}) {

    const expectedScope = actor + ':' + bookId, originalHeading = options.originHeading || main.querySelector('h1');

    let copy = M.clone(payload); delete copy.revision; delete copy.waiting;

    const save = async () => {

      M.insist(actor && actor + ':' + bookId === expectedScope, 'This change belongs to the previous account. Reopen that account to continue it.');
      M.insist(!data.snapshot.purgedNotebooks?.[copy.id], 'This notebook was permanently deleted.');

      B.validatePayload(copy); await keepBaseline(copy, recordFor(copy.id)?.current ?? (B.baseline(data.snapshot, copy.id, master, masterHash) ? 1 : 0));

      const r = recordFor(copy.id), prior = data.outbox.find(o => o.recordId === copy.id);

      if (prior && ['undo', 'restore'].includes(options.action)) throw new Error('Send the waiting change before restoring an earlier version.');

      if (['undo', 'restore'].includes(options.action)) { const target = r.revisions.find(v => v.number === options.target); const source = options.action === 'undo' ? r.revisions.find(v => v.number === target?.base) : target; M.insist(source, 'That earlier version is unavailable. Your current wording is retained.'); copy = M.clone(source.payload); if (options.action === 'restore') copy.tombstone = false; }

      const action = options.action || (copy.tombstone ? 'remove' : B.latest(r).payload.tombstone && r.current > 0 ? 'resurrect' : 'edit');

      const operation = prior || privateOperation({ recordId: copy.id, base: options.base ?? r.current, operation: crypto.randomUUID(), payload: copy, action, ...(options.target !== undefined ? { target: options.target } : {}) });

      data = await store.update(actor, bookId, v => { if (options.preserveDraft && v.drafts[copy.id]?.state === 'draft') (v.retainedDrafts ||= {})[copy.id] = M.clone(v.drafts[copy.id]); else if (!options.preserveDraft && v.retainedDrafts) delete v.retainedDrafts[copy.id]; v.drafts[copy.id] = { id: copy.id, base: operation.base, payload: copy, operation: operation.operation, state: 'waiting' }; if (!prior) v.outbox.push(operation); return v; });

      applyDisplay(); message('Saved on this device. Waiting to sync.');
      savedVersion++;

      if (options.backgroundSync) {
        const savingSync = sync, savingActor = actor, savingBook = bookId, savingEpoch = accountEpoch;
        // The local transaction is complete. Cloud latency must not block more stars.
        setTimeout(async () => {
          if (savingEpoch !== accountEpoch || !navigator.onLine) return;
          try {
            await savingSync.send();
            if (savingEpoch !== accountEpoch) return;
            const saved = await store.read(savingActor, savingBook);
            if (savingEpoch !== accountEpoch) return;
            const before = data; data = saved; invalidateDeletedScreens(before);
            savedVersion++;
            const conflict = Object.values(data.outcomes).findLast(result => result.outcome === 'conflict' && !result.resolved);
            message(conflict ? 'Changes need review. Open Home to review them.' : data.outbox.length ? 'Saved on this device. Waiting to sync.' : (options.backgroundLabel || 'Favourites') + ' saved.');
          } catch (error) {
            if (savingEpoch !== accountEpoch) return;
            if (error.status === 401 || error.status === 403) { await lock(); message('Sign in to send changes. Saved work is retained.'); }
            else message((options.backgroundLabel || 'Favourites') + ' saved on this device. Waiting for a connection to sync.');
          }
        }, 150);
        return { outcome: 'waiting', revision: operation.base + 1 };
      }
      if (!navigator.onLine) return { outcome: 'waiting', revision: operation.base + 1 };

      try {

        const saved = await sync.send(); M.insist(actor + ':' + bookId === expectedScope, 'Saved work remains in its owning account.'); const before = data; data = saved; invalidateDeletedScreens(before); const result = data.outcomes[operation.operation];

        if (result?.outcome === 'conflict') { if (originalHeading?.isConnected) conflictView(result, operation); else message('Changes need review. Open Home to review them.'); return result; }

        const chainedConflict = Object.values(data.outcomes).findLast(o => o.recordId === copy.id && o.outcome === 'conflict' && !o.resolved);

        if (chainedConflict) { if (originalHeading?.isConnected) conflictView(chainedConflict, { recordId: copy.id, base: chainedConflict.conflict.base }); else message('Changes need review. Open Home to review them.'); return chainedConflict; }

        applyDisplay(); message('Saved to book. Synced to workspace.'); return result;

      } catch (error) {

        if (error.status === 401 || error.status === 403) { await lock(); throw new Error('Sign in to send changes. Your saved work is retained.'); }

        message('Saved on this device. Waiting to sync. ' + error.message); return { outcome: 'waiting', revision: operation.base + 1 };

      }

    };

    const task = expressionQueue.catch(() => {}).then(save); expressionQueue = task; return task;

  }

  function expressionContext() {

    const scope = actor + ':' + bookId;
    const epoch = accountEpoch;

    const guard = () => M.insist(actor && actor + ':' + bookId === scope && epoch === accountEpoch, 'Reopen the account that owns this content.');

    return { M, B, node, button, main, clear, show, showPage, back: goBack, confirm, report, message, refreshOnReturn: render => { if (currentScreen) { currentScreen.refresh = render; currentScreen.savedVersion = savedVersion; } }, home: () => editorMode ? home() : navigate('home'), navigate: route => { guard(); if (editorMode) { if (route === 'people') return NextExpression.people(expressionContext()); if (route === 'notes') return NextExpression.notes(expressionContext()); if (route === 'quick-words') return quickWords(); return home(); } navigate(route); }, master, scopeKey: scope, isCurrent: () => actor + ':' + bookId === scope && view === 'icons',

      records: () => { guard(); return expressionRecords(); }, drafts: () => { guard(); return M.clone({ ...data.drafts, ...data.retainedDrafts }); }, project: () => { guard(); return { ...B.project(B.currentEdition(data.snapshot), master, masterHash), content: M.clone(data.snapshot.content) }; },

      shortcut: target => { guard(); return NextHomeCollections.addShortcut(expressionContext(), target); },
      shoppingItems: () => { guard(); return NextShopping.catalogueItems({catalogue:expressionRecords().filter(p=>p.kind==='phrase'&&p.category==='shopping-list')},data); },
      openShopping: p => { guard(); pendingURL='/#shopping'; const result=shoppingView(false,p.id); const input=[...main.querySelectorAll('[data-shopping]')].find(el=>el.dataset.shopping===p.id)?.querySelector('input'); input?.scrollIntoView({block:'center'}); return result; },
      openDestination: route => { guard(); editorMode=false; return navigate(route); },
      openPersonal: p => { guard(); pendingURL='/#personal-information'; return readPage(p.id); },
      newPayload: (kind, category, text, name) => { guard(); return B.addition(kind, category, text, crypto.randomUUID(), name); }, save: (p, o) => { guard(); return saveExpression(p, o); },
      purgeNotebooks: async selected => {
        guard(); M.insist(navigator.onLine, 'Connect to the internet to delete notebooks permanently. Nothing has been deleted.');
        await waitDrafts(); await expressionQueue; guard();
        const expected = Object.fromEntries(selected.map(p => [p.id, p.revision ?? 1]));
        const prior = data.notebookDeletion;
        const request = prior && M.canonical(prior.expected) === M.canonical(expected) && prior.privateEpoch === (data.snapshot.privateEpoch || 0) ? prior : { confirmed: true, expected, operation: crypto.randomUUID(), privateEpoch: data.snapshot.privateEpoch || 0 };
        data = await store.update(actor, bookId, value => { value.notebookDeletion = request; return value; }); guard();
        const result = await repository.request(`workspaces/${bookId}/delete-notebooks`, request);
        guard(); M.insist(result.success === true && result.workspace === bookId && result.operation === request.operation && M.canonical(Object.keys(result.deleted || {}).sort()) === M.canonical(Object.keys(expected).sort()) && Object.entries(expected).every(([id, revision]) => result.deleted[id]?.revision === revision), 'Deletion was not confirmed. Reopen notebooks to check.');
        // Drop retained reading DOMs and in-flight history callbacks containing private wording.
        screens.clear(); currentScreen = null; savedVersion++;
        data = await store.eraseNotebooks(actor, bookId, result.deleted); guard();
        data = await store.update(actor, bookId, value => { delete value.notebookDeletion; return value; }); guard();
        await sync.download(); data = await store.read(actor, bookId); guard();
        return result;
      },

      rememberDraft: (p, base) => { guard(); const task = draftQueue.catch(() => {}).then(() => { guard(); return rememberExpression(p, base); }); draftQueue = task; return task; },
      trackDraftQueue: task => { quickDraftQueue = Promise.all([quickDraftQueue.catch(() => {}), task]); },

      discardDraft: async id => { guard(); await waitDrafts(); guard(); data = await store.update(actor, bookId, v => { if (!v.outbox.some(o => o.recordId === id)) { delete v.drafts[id]; if (v.retainedDrafts) delete v.retainedDrafts[id]; } return v; }); },

      history: async (id, back) => { guard(); expressionReturn = back || home; const p = expressionRecords().find(p => p.id === id); if (p) await keepBaseline(p, recordFor(id)?.current ?? (B.baseline(data.snapshot, id, master, masterHash) ? 1 : 0)); guard(); history(id); },

      retry: async () => { guard(); const saved = await sync.send(); guard(); data = saved; const conflict = Object.values(data.outcomes).findLast(r => r.outcome === 'conflict' && !r.resolved); if (conflict) { conflictView(conflict, { recordId: conflict.recordId, base: conflict.conflict.base }); return { outcome: 'conflict' }; } message('Saved changes sent.'); return { outcome: 'accepted' }; },

      keepNote: text => { guard(); view = 'note-edit'; return NextExpression.addNote(expressionContext(), text); },
      scopeAlive: () => !!actor && actor + ':' + bookId === scope && epoch === accountEpoch,
      screenToken: () => screenEpoch,
      generateWords: async input => {
        guard();
        try { const result = await repository.request('workspaces/' + bookId + '/quick-words', input); guard(); return result; }
        catch (error) { if ((error.status === 401 || error.status === 403) && epoch === accountEpoch) await lock(); throw error; }
      },
      generateSituation: async input => {
        guard();
        try { const result = await repository.request('workspaces/' + bookId + '/situation-generation', input); guard(); return result; }
        catch (error) { if ((error.status === 401 || error.status === 403) && epoch === accountEpoch) await lock(); throw error; }
      }

    };

  }

  function editorUI() {

    return { compactCommunicationBook: true, node, button, clear, main, home, section: maintainSection, sections: editBook, history, hasHistory: id => !!data.snapshot.records[id], edit: prepareEdit, add: addItem, move: moveItem };

  }

  function editBook() { view = 'maintenance'; expressionReturn = null; editingCategory = null; NextBookEditor.sections(editorUI(), data.snapshot.edition, master, masterHash); }

  function maintainSection(category) { view = 'maintenance'; editingCategory = category; NextBookEditor.section(editorUI(), data.snapshot.edition, master, masterHash, category); if (data.outbox.length) button('Retry sending', retry); }

  function baselineSnapshot(payload, number) {
    return number === 0 ? { id: payload.id, current: 0, revisions: [{ number: 0, base: 0, payload: { ...M.clone(payload), tombstone: true }, author: actor, at: new Date().toISOString(), operation: 'new' }] }

      : B.baseline(data.snapshot, payload.id, master, masterHash) || { id: payload.id, current: 1, revisions: [{ number: 1, base: 0, payload: M.clone(payload), author: data.snapshot.owner, at: data.snapshot.edition.at, operation: 'source' }] };
  }

  async function keepBaseline(payload, number = 1) {
    if (recordFor(payload.id)) return;
    const source = baselineSnapshot(payload, number);

    data = await store.update(actor, bookId, value => { value.baselines ||= {}; value.baselines[payload.id] = source; return value; });

  }

  async function prepareEdit(payload) { await keepBaseline(payload); editRecord(payload.id); }

  async function addItem(kind, category) {

    const payload = B.addition(kind, category, kind === 'page' ? 'New personal passage' : 'New word or phrase', crypto.randomUUID(), kind === 'page' ? 'Personal page' : undefined);

    await keepBaseline(payload, 0);

    editRecord(payload.id, false, { id: payload.id, base: 0, payload: { ...payload, text: '' } });

  }

  async function moveItem(category, ids, id, offset) {

    const index = ids.indexOf(id), destination = index + offset;

    if (index < 0 || destination < 0 || destination >= ids.length) return;

    const items = [...ids]; [items[index], items[destination]] = [items[destination], items[index]];

    const payload = B.orderPayload(category, ids); await keepBaseline(payload);

    const r = recordFor(payload.id);

    edit = { id: r.id, base: r.current, payload: { ...M.clone(B.latest(r).payload), items } };

    await saveEdit(edit.payload.text);

    if (view !== 'conflict') category === 'sections' ? editBook() : maintainSection(category);

  }

  function unfinished() {

    clear('Continue unfinished edits'); view = 'unfinished';

    const entries = Object.values(data.drafts).filter(d => d.state !== 'accepted');

    if (!entries.length) node('p', 'There are no unfinished edits on this device.', main);

    for (const d of entries) { const row = node('section', undefined, main, 'version'); node('p', d.payload.text || 'New item', row); if (d.state === 'waiting') node('p', 'Saved on this device; waiting to send.', row); button('Continue editing', () => { editingCategory = d.payload.category; editRecord(d.id, true); }, row); }

    if (data.outbox.length) button('Retry sending', retry); button('Return', home);

  }

  let shoppingPending = 0;
  function shoppingView(editMode = false, focusItem) {

    focusItem ||= document.activeElement?.closest('[data-shopping]')?.dataset.shopping;
    view = 'shopping';
    const scope = actor + ':' + bookId;
    let shoppingScreen;
    const isCurrent = () => actor + ':' + bookId === scope && view === 'shopping' && currentScreen?.id === shoppingScreen;
    const refresh = text => { if (isCurrent()) { shoppingView(editMode); message(text === 'Shopping list saved.' && shoppingPending > 1 ? 'Saving remaining selections on this device…' : text); } };

    const serial = fn => { shoppingPending++; shoppingQueue = shoppingQueue.catch(() => {}).then(fn).finally(() => { shoppingPending--; }); return shoppingQueue; };

    const change = (p, changes, action = 'edit') => serial(async () => {

      // Resolve a catalogue choice again after earlier queued ticks have saved it.
      // Repeated taps must update that item, rather than create duplicate records.
      const latest = NextShopping.items(data).find(item => item.id === p.id || p.shoppingSourceId && item.shoppingSourceId === p.shoppingSourceId);
      if (latest) p = latest;

      await keepBaseline(p, recordFor(p.id)?.current ?? 0);

      const r = recordFor(p.id), payload = { ...M.clone(p), ...changes }; delete payload.revision;

      const prior = data.outbox.find(o => o.recordId === p.id);

      const operation = prior || privateOperation({ recordId: p.id, base: r.current, payload, operation: crypto.randomUUID(), action });

      data = await store.update(actor, bookId, value => { value.drafts[p.id] = { id: p.id, base: operation.base, payload, operation: operation.operation, state: 'waiting' }; if (!prior) value.outbox.push(operation); return value; });

      refresh('Saved on this device. Waiting to sync.');

      if (navigator.onLine) {
        try { data = await sync.send(); const result = data.outcomes[operation.operation]; if (isCurrent() && result?.outcome === 'conflict') conflictView(result, operation); else refresh(result?.outcome === 'accepted' ? 'Shopping list saved.' : 'Saved on this device. Waiting to sync.'); }
        catch (error) { if (error.status === 401 || error.status === 403) { await lock(); message('Sign in to send changes. Saved work is retained.'); } else refresh('Saved on this device. Waiting to sync. Check your connection and retry sending.'); }
      }

    });

    NextShopping.render({ node, button, main, clear, home: () => { if (isCurrent()) home(); }, report, show: async mode => { await shoppingQueue; if (isCurrent()) shoppingView(mode); }, retry: async () => { await sync.send(); await readLocal(); refresh('Shopping list saved.'); },

      scopeKey: actor + ':' + bookId,
      catalogue: expressionRecords().filter(p => p.category === 'shopping-list' && p.kind === 'phrase'),
      showWord: text => expressionContext().showPage('Shopping', area => node('p', text, area, 'passage')),

      add: text => change(B.addition('shopping', 'shopping-list', text, crypto.randomUUID()), {}),

      tick: (p, checked) => { if (isCurrent()) message('Saving on this device…'); return p.catalogueChoice ? change({ ...B.addition('shopping', 'shopping-list', p.text, crypto.randomUUID()), usage: p.usage, shoppingSourceId: p.id }, { checked }) : change(p, { checked }); }, edit: async p => { await shoppingQueue; if (isCurrent()) prepareEdit(p); },

      remove: async p => { if (await confirm('Delete this item? You can restore it from Deleted items.')) await change(p, { tombstone: true }, 'remove'); },

      restore: p => change(p, { tombstone: false }, 'resurrect'),

      undoClear: async before => {
        await shoppingQueue;
        const current = NextShopping.items(data);
        if (data.outbox.length || before.some(p => !current.some(item => item.id === p.id && !item.checked && item.revision === p.revision + 1))) {
          message('The list changed after clearing. Your current ticks are kept. Review the list before changing them.'); return false;
        }
        for (const p of before) await change(current.find(item => item.id === p.id), { checked: true });
        return true;
      },

      clearAll: () => serial(async () => {

        if (data.outbox.length) { message('Send the waiting changes before clearing the list. Your ticks are retained.'); return; }

        if (!(await confirm('Untick all boxes? All items will stay on the list.'))) return;

        const operation = privateOperation({ action: 'clear-shopping', expected: Object.fromEntries(NextShopping.items(data).map(p => [p.id, p.revision])), operation: crypto.randomUUID() });

        data = await store.update(actor, bookId, v => { v.outbox.push(operation); return v; });

        refresh('Reset saved on this device. Waiting to sync.');

        if (navigator.onLine) { data = await sync.send(); const accepted = data.outcomes[operation.operation]?.outcome === 'accepted'; refresh(accepted ? 'All boxes unticked. Items kept.' : 'The list changed. Review it before clearing again.'); return accepted; }

      })

    }, data, editMode);
    shoppingScreen = currentScreen?.id;

    if (focusItem) [...main.querySelectorAll('[data-shopping]')].find(el => el.dataset.shopping === focusItem)?.querySelector('input')?.focus({ preventScroll: true });

  }

  function confirm(text, options = {}) {

    const dialog = document.getElementById('confirm'), before = document.activeElement;

    document.getElementById('confirm-text').textContent = text;

    document.getElementById('confirm-yes').textContent = options.confirmLabel || 'Confirm';

    document.getElementById('confirm-no').textContent = options.cancelLabel || 'Cancel';

    return new Promise(resolve => {

      const finish = result => { dialog.close(); before?.focus(); resolve(result); };

      document.getElementById('confirm-yes').onclick = () => finish(true);

      document.getElementById('confirm-no').onclick = () => finish(false);

      dialog.oncancel = event => { event.preventDefault(); finish(false); }; dialog.showModal();

      document.getElementById('confirm-no').focus();

    });

  }

  function show(text, title = 'Show words') {
    showPage(title, area => node('div', text, area, 'passage'));
  }

  function showPage(title, render) {
    view = 'show'; clear(title);
    const area = node('section', undefined, main); area.dataset.showPage = 'true'; render(area);
  }

  async function loadMaster() {

    const response = await fetch('/master.json'); if (!response.ok) throw new Error('Public words unavailable.');

    const bytes = await response.arrayBuffer(); master = JSON.parse(new TextDecoder().decode(bytes));

    masterHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join('');

  }

  async function readLocal() {
    const prior = data;
    data = await store.read(actor, bookId);
    invalidateDeletedScreens(prior);
    return data;
  }
  function invalidateDeletedScreens(previous) {
    const prior = new Set(Object.keys(previous?.snapshot.purgedNotebooks || {}));
    if (Object.keys(data?.snapshot.purgedNotebooks || {}).some(id => !prior.has(id))) {
      screens.clear(); currentScreen = null; savedVersion++;
      expressionReturn = null;
      if (view === 'notebooks') NextNotebooks.list(expressionContext());
    }
  }

  function identity() {

    const el = document.getElementById('identity'); el.replaceChildren();

    if (!editorMode) return;

    node('span', privateLocal ? 'Book unlocked' : sharedAccount ? 'Shared account signed in' : `Signed in as ${actor}`, el);

    button('Sign out', async () => {

      await waitDrafts(); await expressionQueue.catch(() => {}); await shoppingQueue.catch(() => {}); await saveQueue.catch(() => {}); NextDictionary.reset();

      await store.identity({ signOutPending: true }); accountEpoch++; actor = null; data = null; edit = null; NextHomeCollections.reset();

      el.replaceChildren(); await finishSignOut();

    }, el);

  }

  function closedSignOut() {
    signInView();
    message('Local content is closed. Online sign-out was not confirmed. Retry when connected.');
    button('Retry sign out', finishSignOut);
  }

  async function finishSignOut() {
    try {
      await repository.session();
      const result = await repository.request('sign-out', {});
      M.insist(result?.success === true, 'Sign-out was not confirmed.');
      await store.identity(null);
    } catch { closedSignOut(); return; }
    signInView(); message('Signed out. Saved content and drafts remain in their own account store.');
  }

  function signInView() {

    if (privateLocal) return privateSignInView();

    clear('Open My Words');

    const form = node('form', undefined, main);

    const username = sharedAccount && globalThis.NextRuntime?.username;
    const label = node('label', username || multiAccount ? 'Username' : sharedAccount ? 'Email' : 'Account', form); label.htmlFor = 'account';

    const name = node('input', undefined, form); name.id = 'account'; if (sharedAccount && !username && !multiAccount) name.type = 'email'; name.autocomplete = 'username';
    if (username) { name.value = username; name.readOnly = true; }

    const lp = node('label', 'Password', form); lp.htmlFor = 'password';

    const passwordField = node('div', undefined, form, 'password-field');
    const password = node('input', undefined, passwordField); password.id = 'password'; password.type = 'password'; password.autocomplete = 'current-password'; password.spellcheck = false; password.setAttribute('autocapitalize', 'off');
    const visibility = button(undefined, () => {
      const showing = password.type === 'password';
      password.type = showing ? 'text' : 'password';
      visibility.setAttribute('aria-label', showing ? 'Hide password' : 'Show password');
      visibility.setAttribute('aria-pressed', String(showing)); visibilityText.textContent = showing ? 'Hide' : 'Show';
    }, passwordField, 'password-visibility');
    visibility.setAttribute('aria-label', 'Show password'); visibility.setAttribute('aria-controls', password.id); visibility.setAttribute('aria-pressed', 'false');
    const eye = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); eye.setAttribute('viewBox', '0 0 24 24'); eye.setAttribute('aria-hidden', 'true');
    const outline = document.createElementNS(eye.namespaceURI, 'path'); outline.setAttribute('d', 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z'); eye.append(outline);
    const pupil = document.createElementNS(eye.namespaceURI, 'circle'); pupil.setAttribute('cx', '12'); pupil.setAttribute('cy', '12'); pupil.setAttribute('r', '3'); eye.append(pupil);
    const slash = document.createElementNS(eye.namespaceURI, 'path'); slash.setAttribute('d', 'm4 4 16 16'); slash.setAttribute('class', 'password-hide-line'); eye.append(slash); visibility.append(eye);
    const visibilityText = node('span', 'Show', visibility);

    const submit = node('button', 'Sign in', form); submit.type = 'submit';

    let signingIn = false;
    form.onsubmit = async event => {
      event.preventDefault(); if (signingIn) return;
      signingIn = true; submit.disabled = true; name.disabled = true; password.disabled = true; visibility.disabled = true;
      try { const info = await repository.signIn(name.value.trim(), password.value); password.value = ''; if (sharedAccount) bookId = info.workspace; await openActor(info.actor, info.mode); }
      catch (error) { report(error); }
      finally { signingIn = false; submit.disabled = false; name.disabled = false; password.disabled = false; visibility.disabled = false; }
    };

    if (sharedAccount) node('p', multiAccount ? 'Sign in to your words.' : 'Sign in to your shared content.', main);
    if (globalThis.NextRuntime?.invitedBeta) node('p', 'Private beta. Open your invitation link to create an account. For help, contact the person who invited you. Use your own device.', main);

  }

  function privateSignInView() {

    clear(needsSetup ? 'Set up this book' : 'Open your book');

    node('p', needsSetup ? 'Choose a supporter password with at least 12 characters. Keep it safely. Use a dedicated browser profile for this private book.' : 'Enter the supporter password to open the saved book on this device.', main);

    const form = node('form', undefined, main);

    const label = node('label', 'Supporter password', form); label.htmlFor = 'private-password';

    const password = node('input', undefined, form); password.id = 'private-password'; password.type = 'password'; password.autocomplete = needsSetup ? 'new-password' : 'current-password';

    let again;

    if (needsSetup) { password.minLength = 12; const repeat = node('label', 'Confirm password', form); repeat.htmlFor = 'confirm-password'; again = node('input', undefined, form); again.id = 'confirm-password'; again.type = 'password'; again.autocomplete = 'new-password'; }

    password.required = true;

    const submit = node('button', needsSetup ? 'Create private book' : 'Open book', form); submit.type = 'submit';

    form.onsubmit = async event => {

      event.preventDefault(); submit.disabled = true;

      try {

        if (needsSetup && password.value !== again.value) throw new Error('The passwords do not match. Please check both boxes.');

        await repository.session();

        const info = needsSetup ? await repository.request('setup', { password: password.value }) : await repository.signIn('', password.value);

        repository.csrf = info.csrf; bookId = info.workspace; needsSetup = false;

        password.value = ''; if (again) again.value = '';

        await openActor(info.actor, info.mode);

      } catch (error) { report(error); } finally { submit.disabled = false; }

    };

    node('p', 'Personal files stay on this computer. Caregivers can back up and restore the book.', main);

  }

  async function openActor(name, mode, offline = false) {
    accountEpoch++;

    NextDictionary.reset(); actor = name; edit = null; expressionReturn = null; sync = new NextSync(store, repository, actor, bookId, device);

    const openingActor = actor, openingBook = bookId, openingEpoch = accountEpoch, openingSync = sync;
    const stillOpening = () => actor === openingActor && bookId === openingBook && accountEpoch === openingEpoch;
    let shown = false, openingScreen;
    async function presentSaved() {
      await store.identity({ actor: openingActor, workspace: openingBook, owner: data.snapshot.owner, device });
      if (!stillOpening()) return;
      identity(); applyDisplay(); editorMode ? home() : renderRoute(); shown = true; openingScreen = screenEpoch;
    }

    const savedLocal = await store.read(openingActor, openingBook);
    if (!stillOpening()) return; data = savedLocal;

    // The caller has already confirmed the session. Reuse its owned local copy
    // immediately; refreshing complete revision history must not block reading.
    if (!offline && data && !data.locked) {
      await presentSaved(); if (!stillOpening()) return;
      message('Saved words available. Checking for updates…');
    }

    if (!offline) {

      globalThis.NextBoot?.phase('Downloading saved words');

      try { const downloaded = await openingSync.download(); if (!stillOpening()) return; const before = data; data = downloaded; invalidateDeletedScreens(before); }

      catch (error) { if (!stillOpening()) return; if (error.status === 403 || error.status === 401) { await lock(); throw error; } if (!data) throw error; const saved = await store.read(openingActor, openingBook); if (!stillOpening()) return; data = saved; report(error); }

    }

    if (!data || data.locked) { actor = null; data = null; signInView(); throw new Error('Sign in or restore an owned export before using saved content.'); }

    if (!offline && globalThis.NextRuntime?.invitedBeta && new URLSearchParams(location.search).get('return') === 'invite') {
      location.replace('/beta.html'); return;
    }

    if (!shown) await presentSaved();
    if (!stillOpening() || screenEpoch !== openingScreen) return;

    message(offline ? 'Saved words available offline. Sign in to send changes.' : mode === 'memory-test' ? 'Memory persistence test double. Real database proof remains incomplete.' : privateLocal ? 'Saved book available on this device.' : '');

  }

  async function lock() {
    NextHomeCollections.reset();
    accountEpoch++;

    NextDictionary.reset();

    if (actor && data) await store.update(actor, bookId, value => { value.locked = true; return value; });

    await store.identity(null); actor = null; data = null; edit = null; document.getElementById('show').close(); document.getElementById('identity').replaceChildren(); signInView();

  }

  function updates(parent) {

    if (!data.pending) return;

    const box = node('section', undefined, parent, 'notice'); box.dataset.editionUpdate = ''; node('h2', 'Updated words available', box);

    button(privateLocal ? 'Update book' : 'Use updated words', async () => {

      main.inert = true; message('Updating saved words…');

      try { data = await sync.adopt(); if (view === 'book') book(); else home(); message('Using the updated edition on this device.'); }

      finally { main.inert = false; }

    }, box, 'primary');

    button('Keep this view', () => { box.remove(); message('Keeping the current edition. Updated words remain available.'); }, box);

  }

  function navigate(route) {
    pendingURL = '/#' + route; renderRoute(route);
  }

  function renderRoute(destination) {

    if (!data || data.locked || editorMode) return;

    const route = typeof destination === 'string' ? destination : location.hash.slice(1);

    if (route === 'book') return book();

    if (route === 'quick-words') return quickWords();

    if (route === 'people') { view = 'people'; return NextExpression.people(expressionContext()); }

    if (route === 'personal-information') return readPage();

    if (route === 'notes') { view = 'notes'; return NextExpression.notes(expressionContext()); }

    if (route === 'add-note') { view = 'note-edit'; return NextExpression.addNote(expressionContext()); }

    if (route === 'icons') { view = 'icons'; return NextDictionary.render(expressionContext()).catch(report); }

    if (route === 'notebooks') return notebooks();

    if (route === 'shopping') return shoppingView();

    if (route === 'favourites') { view = 'favourites'; return NextHomeCollections.favourites(expressionContext()).catch(report); }
    if (route === 'shortcuts') { view = 'shortcuts'; return NextHomeCollections.shortcuts(expressionContext()).catch(report); }
    if (route === 'search') return searchAll();

    if (route === 'display') return location.assign('/editor.html');

    pendingURL = '/#home'; appHome();

  }

  // popstate handles hash navigation too; do not render twice and destroy retained context.

  function home() {

    if (!data || data.locked) return signInView(); view = 'home'; edit = null;

    if (!editorMode) return navigate('home');

    clear('Settings');

    if (actor === 'reader') {

      clear('Caregiver access required');

      node('p', 'Open Home to use your saved words.', main);

      return;

      return;

    }

    contents();

  }

  function invitationEntry(parent, accountSection = false) {
    if (!globalThis.NextRuntime?.invitedBeta) return;
    const owner = actor, epoch = accountEpoch;
    const area = node(accountSection ? 'section' : 'div', undefined, parent, accountSection ? 'settings-section' : 'home-secondary'); area.hidden = true;
    if (accountSection) {
      area.setAttribute('aria-label', 'Account'); node('h2', 'Account', area);
      node('p', 'Invite another person to create their own separate beta account.', area, 'settings-description');
    }
    const nav = node('nav', undefined, area); nav.setAttribute('aria-label', 'Invitations');
    const link = node('a', 'Invite someone', nav); link.href = '/beta.html';
    // Never infer this capability from a username or apply an old account's reply.
    repository.request('beta').then(result => {
      if (result?.admin === true && actor === owner && accountEpoch === epoch && data && !data.locked && area.isConnected) area.hidden = false;
    }).catch(() => {});
  }

  function appHome() {

    view = 'home'; clear('Home');

    invitationEntry(main);

    const grid = node('div', undefined, main, 'home-grid');

    const destinations = [

      ['Quick words', 'Find words for now', 'quick-words', 'M5 5h14v10H9l-4 4V5m4 4h6m-6 3h4'],

      ['People', 'Names and people I know', 'people', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m-6 9v-2a6 6 0 0 1 12 0v2m2-16a4 4 0 0 1 0 8m1 3a5 5 0 0 1 3 5'],

      ['Personal information', 'Details about me', 'personal-information', 'M3 5h18v14H3V5m5 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4m-3 8h6m4-7h3m-3 4h3'],

      ['Notes', 'Things I want to say', 'notes', 'M5 3h14v18H5V3m4 5h6m-6 4h6m-6 4h4'],

      ['Icons', 'Picture dictionary', 'icons', 'M3 3h7v7H3V3m11 0h7v7h-7V3M3 14h7v7H3v-7m11 0h7v7h-7v-7'],

      ['Communication book', 'Words and phrases by subject', 'book', 'M12 5v16m0-16C8 3 5 3 2 4v15c3-1 6-1 10 2m0-16c4-2 7-2 10-1v15c-3-1-6-1-10 2'],

      ['Situation notebooks', 'Saved conversations and activities', 'notebooks', 'M5 3h14v18H5V3m4 5h6m-6 4h6m-6 4h4'],

      ['Shopping list', '', 'shopping', 'M5 5h14v16H5V5m4-3h6v5H9V2m-1 9 2 2 4-4']

    ];

    for (const [label, subtitle, route, path] of destinations) {

      const choice = button(undefined, () => navigate(route), grid, 'home-choice');

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');

      const drawing = document.createElementNS(svg.namespaceURI, 'path'); drawing.setAttribute('d', path); svg.append(drawing); choice.append(svg);

      node('span', label, choice, 'choice-label'); node('span', subtitle, choice, 'choice-description');

    }

    const actions = node('div', undefined, undefined, 'actions home-actions');
    button('Favourites', () => navigate('favourites'), actions);
    button('Shortcuts', () => navigate('shortcuts'), actions);
    main.append(actions);
    button('Search all sections', () => navigate('search'), actions);

    if (data.outbox.length) { button('Retry sending', retry, actions); node('p', 'Saved on this device. Changes are waiting to sync.', main, 'notice'); }

    const conflicts = Object.values(data.outcomes).filter(o => o.outcome === 'conflict' && !o.resolved && o.recordId);

    if (conflicts.length) button('Review changes', () => { const result = conflicts[0]; conflictView(result, { recordId: result.recordId, base: result.conflict.base }); }, actions);

  }

  const displayId = 'd196b3a2-9990-4c22-a73f-040000000001';

  const displayPreference = () => {
    // Display preferences are saved records, not vocabulary. Rebuilding the full
    // catalogue for every section label/cue made Book navigation block the phone.
    const saved = new Map();
    const add = (payload, revision, waiting = false) => {
      if (payload.kind === 'preference' && payload.category === 'display') saved.set(payload.id, { ...payload, revision, ...(waiting ? { waiting: true } : {}) });
    };
    for (const record of Object.values(data.snapshot.records)) add(B.latest(record).payload, record.current);
    for (const operation of data.outbox) if (operation.recordId && operation.payload) add(operation.payload, operation.base + 1, true);
    for (const draft of Object.values(data.drafts)) if (draft.state === 'waiting') add(draft.payload, draft.base + 1, true);
    return saved.values().next().value;
  };

  function applyDisplay() {

    if (!data) return;

    const values = displayPreference()?.display || data.snapshot.content.preferences;

    document.documentElement.style.fontSize = [20, 24, 28, 32].includes(values.textSize) ? values.textSize + 'px' : '20px';

    document.body.dataset.spacing = values.spacing === 'roomy' ? 'roomy' : 'compact';

    // Retired global picture switch: keep legacy values in saved records/backups,
    // while picture browsing and section cues use their normal presentation.
    document.body.dataset.pictures = 'normal';

  }

  function sectionLabel(section) { return displayPreference()?.display?.sections?.[section.id]?.name || section.name; }

  function sectionCue(parent, section) { NextDiscovery.cue(parent, displayPreference()?.display?.sections?.[section.id]?.icon || section.icon, document.body.dataset.pictures === 'text'); }

  function displaySettings(reviewed) {

    view = 'display'; clear('Display choices');

    const saved = reviewed || displayPreference(), payload = saved ? M.clone(saved) : { ...B.addition('preference', 'display', 'Display choices', displayId), revision: 0 };

    payload.display = { textSize: 20, spacing: 'compact', pictures: 'normal', sections: {}, ...payload.display };

    const form = node('form', undefined, main);

    function select(label, key, choices) { const l = node('label', label, form); const s = node('select', undefined, form); s.id = 'display-' + key; l.htmlFor = s.id; for (const [value, text] of choices) { const o = node('option', text, s); o.value = value; } s.value = payload.display[key]; s.onchange = () => { payload.display[key] = key === 'textSize' ? Number(s.value) : s.value; }; }

    select('Text size', 'textSize', [[20, 'Standard'], [24, 'Larger'], [28, 'Extra large'], [32, 'Largest']]);

    select('Spacing', 'spacing', [['compact', 'Compact'], ['roomy', 'Roomier']]);

    const sections = node('details', undefined, form); node('summary', 'Section labels and cues', sections);

    payload.display.sections ||= {};

    for (const section of master.categories) {

      const row = node('section', undefined, sections); node('h2', section.name, row);

      const l = node('label', 'Display name for ' + section.name, row); const input = node('input', undefined, row); input.id = 'alias-' + section.id; l.htmlFor = input.id; input.value = payload.display.sections[section.id]?.name || section.name;

      input.oninput = () => { (payload.display.sections[section.id] ||= {}).name = input.value.trim() || section.name; };

      const c = node('label', 'Cue for ' + section.name, row); const s = node('select', undefined, row); s.id = 'cue-' + section.id; c.htmlFor = s.id;

      for (const source of master.categories) { const o = node('option', source.name, s); o.value = source.icon; } s.value = payload.display.sections[section.id]?.icon || section.icon; s.onchange = () => { (payload.display.sections[section.id] ||= {}).icon = s.value; };

    }

    const preview = node('section', undefined, form, 'passage'); node('h2', 'Preview', preview); node('p', 'Please give me time. I can point to the words I need.', preview);

    const save = node('button', 'Save display choices', form); save.type = 'submit'; form.onsubmit = async event => { event.preventDefault(); const savingScreen = screenEpoch; try { save.disabled = true; const result = await saveExpression(payload, { base: saved?.revision ?? 0 }); if (result.outcome !== 'conflict' && savingScreen === screenEpoch && form.isConnected) { applyDisplay(); editorMode ? home() : navigate('home'); } } catch (e) { if (form.isConnected) report(e); } finally { save.disabled = false; } };

    button('Back', () => editorMode ? home() : navigate('home'));

  }

  const searchStates = new Map();

  function searchAll(retain = false) {

    view = 'search'; clear('Search all sections');

    const key = actor + ':' + bookId, s = searchStates.get(key) || { query: '', count: 40 }; searchStates.set(key, s);

    const form = node('form', undefined, main, 'word-search all-search'); const label = node('label', 'Search all sections', form); label.htmlFor = 'all-query'; label.className = 'search-label';

    const query = node('input', undefined, form); query.id = 'all-query'; query.type = 'search'; query.value = s.query;



    const submit = node('button', 'Search', form); submit.type = 'submit'; button('Clear search', () => { s.query = ''; s.count = 40; searchAll(); }, form);

    const results = node('section', undefined, main, 'search-results'); results.setAttribute('aria-live', 'polite');

    const render = async () => {

      results.replaceChildren(); if (!s.query.trim()) { node('p', 'Enter a word or short clue.', results); return; }

      const candidates = [...expressionRecords(), ...NextWordGroups.groups(expressionContext()).filter(g => !expressionRecords().some(p => p.id === g.id))];

      try { const index = await NextDictionary.load(); const prefs = expressionRecords().find(p => p.kind === 'preference' && p.category === 'dictionary')?.dictionary || {}; candidates.push(...NextSymbolCatalogue.search(index, '', 'All', prefs).map(p => ({ ...p, kind: 'symbol', text: [p.label, p.messageText, ...NextSymbolCatalogue.aliases(prefs, p.id)].join(' ') }))); } catch { node('p', 'Pictures have not opened on this device. Other saved sections are searchable.', results); }

      if (view !== 'search' || actor + ':' + bookId !== key || !results.isConnected) return;

      const matches = NextDiscovery.search(candidates, s.query);

      node('p', matches.length + ' results in all sections', results);

      for (const destination of NextDiscovery.order) {

        const found = matches.filter(p => NextDiscovery.destination(p) === destination); if (!found.length) continue;

        const group = node('section', undefined, results, 'search-group'); node('h2', destination, group);
        const choices = node('div', undefined, group, 'search-choices');

        for (const p of found.slice(0, s.count)) {

          const wording = destination === 'Icons' ? p.label : p.name || p.title || p.text || destination;
          button(wording, () => {





            if (destination === 'Personal information') return readPage(p.id);
            if (destination === 'Icons') return NextDictionaryView.show(expressionContext(), [p]);

            clear(p.name || p.title || p.label || destination); view = 'search-read';

            node('div', destination === 'Quick words' ? p.words.map(w => w.text).join('\n') : p.text, main, 'passage');

            if (destination === 'Icons') { const image = node('img', undefined, main, 'dictionary-picture'); image.src = p.asset; image.alt = ''; image.onerror = () => image.remove(); }

            button('Show', () => show(destination === 'Quick words' ? p.words.map(w => w.text).join('\n') : p.text, p.name || p.label || destination));



          }, choices, 'note-open search-open');

        }

        if (found.length > s.count) button('More results in ' + destination, () => { s.count += 40; return render(); }, results);

      }

      if (!matches.length) node('p', 'No results in all sections. Try fewer words or open Notes to search Unfinished, Archived notes or Recently deleted.', results);

    };

    form.onsubmit = event => { event.preventDefault(); s.query = query.value; s.count = 40; render().catch(report); };

    if (retain || s.query) render().catch(report);

  }

  function quickWords() {

    view = 'quick'; return NextWordGroups.quick(expressionContext());

  }

  function notebooks() { view = 'notebooks'; return NextNotebooks.list(expressionContext()); }

  function book() {

    view = 'book'; clear('Communication book'); updates(main);
    if (currentScreen) { currentScreen.savedVersion = savedVersion; currentScreen.refresh = () => { main.querySelector('[data-edition-update]')?.remove(); updates(main); currentScreen.savedVersion = savedVersion; }; }

    const navigation = node('nav', undefined, main, 'actions'); navigation.setAttribute('aria-label', 'Book navigation');

    button('Personal information', readPage, navigation); button('Shopping list', () => shoppingView(), navigation);

    node('h2', 'All sections', main); const grid = node('div', undefined, main, 'grid');

    const currentBook = B.project(B.currentEdition(data.snapshot), master, masterHash), sections = B.communicationCategories(currentBook).filter(section => section.words.length);
    for (const section of sections) sectionCue(button(sectionLabel(section), () => sectionView(section), grid, 'section-entrance'), section);

    const search = node('form', undefined, main, 'word-search'); const label = node('label', 'Search book', search); label.htmlFor = 'book-query'; const input = node('input', undefined, search); input.id = 'book-query'; input.type = 'search'; const submit = node('button', 'Search', search); submit.type = 'submit'; const results = node('section', undefined, main);

    search.onsubmit = event => { event.preventDefault(); results.replaceChildren(); const found = NextDiscovery.search(sections.flatMap(section => section.words), input.value); node('p', found.length + ' results in the book', results); for (const p of found.slice(0, 40)) button(p.text, () => { clear(p.name || 'Book words'); view = 'book-read'; node('div', p.text, main, 'passage'); button('Show words', () => show(p.text)); }, results); if (found.length > 40) node('p', 'Use a more specific clue or Search all sections to see more.', results); };

    button('Clear search', () => { input.value = ''; results.replaceChildren(); }, search); button('Search all sections', () => { const key = actor + ':' + bookId; searchStates.set(key, { query: input.value, count: 40 }); navigate('search'); }, search);

    button('Check for updates', checkUpdates);

  }

  function sectionView(section) {

    view = 'section'; clear(sectionLabel(section)); sectionCue(main.querySelector('h1'), section);

    NextHomeCollections.syncHighlights(expressionContext());
    let choosing = false; const selected = [];

    const selection = node('p', '', main); const capture = button('Save word group', () => { if (!choosing) { choosing = true; for (const choice of grid.children) choice.setAttribute('aria-pressed', 'false'); capture.textContent = 'Preview word group'; selection.textContent = 'Choose words in the order you want.'; } else if (!selected.length) message('Choose at least one word or phrase.'); else NextWordGroups.capture(expressionContext(), selected); });

    const grid = node('div', undefined, main, 'words');

    for (const word of section.words) { const el = button(word.text, () => { if (!choosing) { NextHomeCollections.toggleBook(expressionContext(), word); return; } const i = selected.findIndex(p => p.id === word.id); if (i < 0) selected.push(word); else selected.splice(i, 1); el.setAttribute('aria-pressed', String(i < 0)); selection.textContent = selected.map((p, i) => (i + 1) + '. ' + p.text).join(' · '); }, grid); NextHomeCollections.highlightButton(expressionContext(), word, el, () => !choosing); }

  }

  function readPage(selected) {

    view = 'page'; clear('Personal information');

    const pages = expressionRecords().filter(p => p.kind === 'page' && !NextDiscovery.excludedPersonal(p) && !p.hidden && !p.archived && !p.tombstone && !['contacts', 'notes'].includes(p.binding?.path?.[0]) && !['front', 'guide'].includes(p.category) && p.binding?.path?.[0] !== 'guide');

    const regular = pages.filter(p => !NextDiscovery.medical(p)), medical = pages.filter(NextDiscovery.medical);

    function passage(payload, parent) {

      const section = node('section', undefined, parent, 'personal-passage');

      const heading = node('h2', payload.name || 'Personal page', section);
      if (payload.id === selected) { heading.tabIndex = -1; requestAnimationFrame(() => { if (heading.isConnected) { heading.focus(); heading.scrollIntoView({block:'start'}); } }); }
      button('Add shortcut', () => NextHomeCollections.addShortcut(expressionContext(), {type:'personal',id:payload.id,label:payload.name || 'Personal page'}), section);

      node('div', payload.text, section, 'passage' + (payload.highlight ? ' highlighted' : ''));

      button('Edit ' + (payload.name || 'page'), () => { expressionReturn = () => readPage(payload.id); prepareEdit(payload); }, section);

    }

    if (!regular.length) node('p', 'No personal information saved yet.', main);

    for (const payload of regular) passage(payload, main);

    const toggle = button('Medical info', () => {

      const revealed = toggle.getAttribute('aria-expanded') !== 'true';

      toggle.setAttribute('aria-expanded', String(revealed)); toggle.textContent = revealed ? 'Hide medical info' : 'Medical info';

      medicalArea.replaceChildren();

      if (revealed) {

        if (!medical.length) node('p', 'No medical information saved yet.', medicalArea);

        for (const payload of medical) passage(payload, medicalArea);

      }

    });

    toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', 'medical-information');

    const medicalArea = node('section', undefined, main); medicalArea.id = 'medical-information';
    if (medical.some(p => p.id === selected)) toggle.click();

    button('Return', () => editorMode ? home() : navigate(location.hash === '#book' ? 'book' : 'home'));

  }

  function prepareContent() {
    view = 'preparation'; clear('Prepare or change content');
    const preparation = node('div', undefined, main, 'preparation-workspace');
    node('p', 'Choose a task below. Use Home when you are ready to use the communication pages.', preparation);
    button('Help using My Words', helpView, preparation);
    function task(parent, title, explanation, action) {
      const row = node('section', undefined, parent, 'preparation-task');
      button(title, action, row); node('p', explanation, row);
    }
    node('h2', 'Words and notebooks', preparation);
    const words = node('div', undefined, preparation, 'preparation-actions');
    task(words, 'Change book words', 'Add or change words in the main Communication book and choose what is printed.', editBook);
    task(words, 'Edit a saved notebook', 'Choose a notebook for an activity, visit or book-club conversation. You can also create one.', notebooks);
    task(words, 'Prepare a word group', 'Find words for a topic, choose useful ones and save a named group.', quickWords);
    task(words, 'Change picture labels and favourites', 'Find a picture in Icons, then change its wording or favourite choice.', () => { view = 'icons'; NextDictionaryEditor.render(expressionContext()).catch(report); });
    node('h2', 'Personal content', preparation);
    const personal = node('div', undefined, preparation, 'preparation-actions');
    task(personal, 'Update someone’s details', 'Add or change names and contact information in People.', () => NextExpression.people(expressionContext()));
    task(personal, 'Add or edit a note', 'Keep a short cue or a longer message in Notes.', () => NextExpression.notes(expressionContext()));
    task(personal, 'Update personal and medical details', 'Change information about the person using My Words.', readPage);
    task(personal, 'Change shopping items', 'Add or change items on the Shopping list.', () => shoppingView());
    const shortcuts = node('details', undefined, preparation); node('summary', 'Saved wording shortcuts', shortcuts);
    node('p', 'Quick links to one saved phrase and personal page. Use the tasks above for other content.', shortcuts, 'settings-description');
    const records = Object.values(data.snapshot.records);
    const quick = [records.find(r => { const p = B.latest(r).payload; return p.kind === 'phrase' && p.binding?.category === 'phrases' && p.binding.locator === 0; }) || records.find(r => B.latest(r).payload.kind === 'phrase'), records.find(r => B.latest(r).payload.kind === 'page' && B.latest(r).payload.name === 'Basic info') || records.find(r => B.latest(r).payload.kind === 'page')].filter(Boolean);
    for (const { id } of quick) {
      const record = data.snapshot.records[id], latest = record.revisions.find(r => r.number === record.current);
      const label = latest.payload.name || (latest.payload.kind === 'page' ? 'Personal information' : 'Book → ' + (master.categories.find(c => c.id === latest.payload.binding?.category)?.name || 'Words'));
      const row = node('section', undefined, shortcuts, 'version'); node('h2', label, row); node('p', latest.payload.text, row);
      if (latest.payload.tombstone) node('p', 'Removed · recoverable in Earlier versions', row);
      button(latest.payload.kind === 'phrase' ? 'Edit phrase' : 'Edit page', () => { editingCategory = null; editRecord(id); }, row);
      if (data.drafts[id] && data.drafts[id].state !== 'accepted') button('Continue my draft', () => editRecord(id, true), row);
      button('Earlier versions', () => history(id), row);
    }
  }

  function helpView() {
    view = 'help'; clear('Help');
    const help = node('div', undefined, main, 'help-workspace');
    const privacy = node('a', 'Privacy, development and licence', help); privacy.href = '/privacy.html';
    node('p', 'Home opens the communication pages for finding and showing words. Settings is where you prepare content, print books and look after saved work.', help);
    button('Go to printing', home, help);
    function topic(title, steps) {
      const section = node('section', undefined, help); node('h2', title, section);
      const list = node('ol', undefined, section); for (const text of steps) node('li', text, list);
      return section;
    }
    topic('Print the Communication book', [
      'In Settings, choose Print Communication book. This is the main collection of words and phrases.',
      'Check the preview, then choose Open PDF to print or Save PDF.',
      'Follow the print instructions above the preview: Letter paper, Landscape, print both sides and flip on the short edge. Leave the printer’s booklet mode off. Test one folded sheet first.'
    ]);
    topic('Print a situation notebook', [
      'A situation notebook contains words prepared for an activity, visit or conversation, such as a book-club meeting.',
      'In Settings, find its title under Situation notebooks. Use Search saved notebooks to narrow the list as you type; Clear search restores the list and Show more print choices reveals more titles.',
      'Select the notebook title to open its booklet preview. Check it, then choose Open PDF to print or Save PDF and follow the print instructions.'
    ]);
    const changes = topic('Change saved content', [
      'Choose Prepare or change content in Settings. The preparation page explains each task.',
      'Choose what you want to change, make your changes and use that page’s Save button. Wait for its saved confirmation.',
      'Use Back to return to the preceding page. Use Home to return to the communication pages.'
    ]);
    button('Prepare or change content', prepareContent, changes);
    topic('Update the app', [
      'Connect to the internet and choose Update app at the top of Settings.',
      'Keep the page open while the update finishes. It keeps saved work and sign-in. If it cannot finish, your saved work is kept and you can try again.'
    ]);
    topic('Saving and offline use', [
      'Changes save on this device first, then send to the account when a connection is available. Another device cannot receive changes that are still waiting to send.',
      'If changes are waiting to sync, reconnect and use Retry sending when offered. If changes need review, keep both versions until you have checked them.',
      'For offline use, sign in online and let offline preparation finish first. Do not clear browser or site data to fix a saving problem; it can contain unfinished work.'
    ]);
    topic('Back up or restore work', [
      'In Settings, under Backups and recovery, open Download or restore a backup.',
      'Use Download saved content and Download unfinished edits to keep both files somewhere private. A booklet PDF is a printout, not a restorable backup.',
      'To restore a backup, review the proposed changes before confirming. Keep the existing device copy and backups until you have checked the result.'
    ]);
    if (globalThis.NextRuntime?.invitedBeta) topic('Beta accounts and password help', [
      'Each beta account has its own saved content. The registration link lets someone create a separate account; it does not share your words with that person. The beta has 12 places, including the organiser.',
      'Use your own device for this beta. An offline copy remains in this browser after signing out.',
      'Invited participants can ask the beta organiser for a password-recovery link. The organiser manages invitations and recovery from the Account section.'
    ]);
  }

  function contents() {

    view = 'contents';
    const appUpdateArea = node('section', undefined, main, 'settings-update');
    const appUpdateStatus = node('p', '', appUpdateArea);
    appUpdateStatus.dataset.appUpdateStatus = ''; appUpdateStatus.setAttribute('aria-live', 'polite');
    NextAppUpdate.loadedStatus(appUpdateStatus);
    const appUpdateScope = actor + ':' + bookId;
    const appUpdateButton = button('Update app', () => { const appUpdateEpoch = screenEpoch; return NextAppUpdate.run({
      button: appUpdateButton, status: appUpdateStatus,
      isCurrent: () => actor + ':' + bookId === appUpdateScope && screenEpoch === appUpdateEpoch && appUpdateButton.isConnected,
      flush: () => Promise.all([waitDrafts(), saveQueue, shoppingQueue, expressionQueue])
    }); }, appUpdateArea);
    appUpdateArea.prepend(appUpdateButton);
    if (data.restoreHold) node('p', 'A book restore needs attention. Waiting changes are held. Restore the backup again; your previous input remains available in recovery.', main, 'notice');
    function settingsSection(title, id, parent = main) {
      const section = node('section', undefined, parent, 'settings-section');
      const heading = node('h2', title, section); heading.id = id; section.setAttribute('aria-labelledby', id); return section;
    }
    const layout = node('div', undefined, main, 'settings-layout');
    const printing = settingsSection('Print booklets', 'settings-print', layout);
    button('Print Communication book', () => previewPrint('booklet'), printing, 'primary');
    node('p', 'Preview the main Communication book, then open or save its booklet PDF.', printing, 'settings-description');
    NextNotebooks.printChoices({ ...expressionContext(), main: printing }, async payload => { message('Preparing the saved notebook…'); presentPDF(await NextPrintAdapter.buildNotebook(payload), false); }, '', 6);
    const options = node('details', undefined, printing); node('summary', 'More print options', options);
    button('Print shopping sheet', previewShopping, options);
    const labelShopping = node('label', undefined, options, 'check-row'); const include = node('input', undefined, labelShopping); include.type = 'checkbox'; node('span', 'Include shopping sheet in booklet', labelShopping);
    button('Preview with these options', () => previewPrint('booklet', include.checked), options);
    const secondary = node('div', undefined, layout, 'settings-secondary');
    const help = settingsSection('Help', 'settings-help', secondary);
    const privacy = node('a', 'Privacy, development and licence', help); privacy.href = '/privacy.html';
    button('Help using My Words', helpView, help);
    const preparation = settingsSection('Preparation', 'settings-preparation', secondary);
    button('Prepare or change content', prepareContent, preparation);
    const reading = settingsSection('Reading choices', 'settings-reading', secondary);
    const readingActions = node('div', undefined, reading, 'settings-actions');
    button('Display choices', displaySettings, readingActions); button('Shortcuts', () => NextHomeCollections.shortcuts(expressionContext(), true), readingActions);
    invitationEntry(secondary, true);
    const savedWork = settingsSection('Backups and recovery', 'settings-saved', secondary);
    const unfinishedCount = Object.values(data.drafts).filter(d => d.state !== 'accepted').length;
    if (unfinishedCount) button('Continue unfinished edits (' + unfinishedCount + ')', unfinished, savedWork);
    if (data.outbox.length) button('Retry sending', retry, savedWork);
    if (Object.values(data.outcomes).some(result => result.outcome === 'conflict' && !result.resolved)) button('Review changes', retry, savedWork);
    const recovery = node('details', undefined, savedWork); node('summary', 'Download or restore a backup', recovery); utilities(recovery);

    const credits = node('details', undefined, secondary, 'dictionary-attribution'); node('summary', 'Picture credits', credits);
    node('p', 'Pictograms: Sergio Palao / ARASAAC. Owner: Government of Aragon. CC BY-NC-SA 4.0.', credits);
    for (const [label, href] of [['ARASAAC source', 'https://arasaac.org/'], ['CC BY-NC-SA 4.0 licence', 'https://creativecommons.org/licenses/by-nc-sa/4.0/'], ['Bundled licence', '/assets/dictionary/ARASAAC-LICENSE.txt'], ['Picture credits', '/assets/dictionary/ARASAAC-CREDITS.txt']]) {
      const link = node('a', label, credits); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer';
    }

  }

  async function previewPrint(format, includeShopping = false, source = data.snapshot.edition) {

    M.insist(editorMode && actor !== 'reader', 'Caregiver access required.');

    await waitDrafts(); message('Preparing the saved book…');

    const shopping = includeShopping ? { at: new Date().toISOString(), items: NextShopping.items(data).map(p => ({ id: p.id, revision: p.revision, text: p.text })) } : undefined;

    const result = await NextPrintAdapter.build(source, master, masterHash, format, { compactCommunicationBook: true, ...(shopping ? { shopping } : {}) }); presentPDF(result, false);

  }

  async function previewShopping() { M.insist(editorMode && actor !== 'reader', 'Caregiver access required.'); const result = NextPrintAdapter.buildShopping({ at: new Date().toISOString(), items: NextShopping.items(data).map(p => ({ id: p.id, revision: p.revision, text: p.text })) }); presentPDF(result, true); }

  let previewURL;

  function presentPDF(result, shopping) {

    if (previewURL) URL.revokeObjectURL(previewURL);

    clear(shopping ? 'Preview shopping sheet' : 'Preview booklet'); view = 'print';

    node('p', 'Book saved: ' + new Date(result.edition?.at || result.snapshot.at).toLocaleString('en-CA'), main);

    node('p', 'Unfinished changes are not included. Save them to the book first.', main);

    node('p', `${result.pages} PDF pages · ${result.sheets} ${result.sheets === 1 ? 'sheet' : 'sheets'}`, main);

    if (result.format === 'booklet') {
      const instructions = node('section', undefined, main, 'notice'); instructions.setAttribute('aria-label', 'Booklet print settings');
      node('h2', 'Booklet print settings', instructions);
      node('p', 'Choose these settings in the print window after opening the PDF:', instructions);
      const settings = node('ul', undefined, instructions);
      for (const setting of [
        'Paper: Letter (8½ × 11 inches).',
        'Orientation: Landscape.',
        'Two-sided printing: On — flip on the short edge.',
        'Scale: Actual size / 100%. Use Fit to printable area only if the preview cuts off wording.',
        'Pages per sheet: 1. Each PDF page already contains two booklet pages.',
        'Booklet mode: Off. The PDF is already arranged for folding.'
      ]) node('li', setting, settings);
      node('p', 'Test first: print PDF pages 1–2 on both sides of one sheet. Fold it in half and check that both sides are upright. Then print all pages and fold the sheets together.', instructions);
    }

    if (result.inventory) node('p', 'Saved Communication book content prepared.' + (result.inventory.omitted.length ? ` ${result.inventory.omitted.length} items excluded; see Print coverage details.` : ''), main);

    previewURL = URL.createObjectURL(result.pdf.output('blob'));

    const open = node('a', 'Open PDF to print', main); open.href = previewURL; open.target = '_blank'; open.rel = 'noopener';

    button('Save PDF', () => result.pdf.save(shopping ? (privateLocal || sharedAccount ? 'shopping-sheet.pdf' : 'fictional-shopping.pdf') : `${result.notebook ? 'situation-notebook' : privateLocal || sharedAccount ? 'communication-book' : 'fictional'}-${result.format}-${result.edition.id}.pdf`));

    const frame = node('iframe', undefined, main, 'pdf-preview'); frame.title = 'Generated PDF preview'; frame.src = previewURL;

    if (result.inventory) { const details = node('details', undefined, main); node('summary', 'Print coverage details', details); for (const p of result.inventory.omitted) node('p', p.name + ': ' + p.reason, details); }

    button('Return', () => { URL.revokeObjectURL(previewURL); previewURL = null; home(); }); message('Saved PDF preview ready.');

  }

  function editRecord(id, resume = false, manual) {

    const record = recordFor(id), revision = record.revisions.find(r => r.number === record.current);

    const draft = data.drafts[id] && (resume || data.drafts[id].state !== 'accepted') ? data.drafts[id] : null;

    edit = manual || { id, base: draft?.base ?? revision.number, payload: M.clone(draft?.payload || revision.payload) };

    view = 'edit'; clear(edit.payload.kind === 'phrase' ? 'Edit phrase' : edit.payload.kind === 'shopping' ? 'Edit item' : 'Edit page');

    node('p', edit.payload.name || (edit.payload.kind === 'page' ? 'Personal information' : 'Book words'), main);

    const layout = node('div', undefined, main, 'edit-layout'), primary = node('div', undefined, layout), aside = node('aside', undefined, layout);

    const label = node('label', 'Wording', primary); label.htmlFor = 'wording'; const input = node('textarea', undefined, primary); input.id = 'wording'; input.value = edit.payload.text;

    const rememberInput = () => { const text = input.value, draftEdit = M.clone(edit); draftEdit.payload.text = text;

      draftQueue = draftQueue.catch(() => {}).then(async () => {

        data = await store.update(actor, bookId, value => { value.drafts[id] = { ...draftEdit, state: 'draft' }; return value; });

        message('Draft saved on this device. Unfinished changes are not in the saved book yet.');

      }); draftQueue.catch(() => message('Storage failed. Keep this page open. Retry or export your draft.'));

    };

    input.oninput = rememberInput;

    if (edit.payload.kind === 'page') {

      const label = node('label', 'Page heading', primary); label.htmlFor = 'page-heading'; const heading = node('input', undefined, primary); heading.id = 'page-heading'; heading.value = edit.payload.name || 'Personal page'; heading.oninput = () => { edit.payload.name = heading.value; rememberInput(); };

    }

    const preview = node('div', input.value, primary, 'word-preview' + (edit.payload.highlight ? ' highlighted' : '')); preview.setAttribute('aria-label', 'Print preview');

    input.addEventListener('input', () => { preview.textContent = input.value; });

    function setting(labelText, key, inverted = false) {

      const label = node('label', undefined, primary, 'check-row'); const check = node('input', undefined, label); check.type = 'checkbox'; check.checked = inverted ? !edit.payload[key] && !edit.payload.archived && !edit.payload.tombstone : !!edit.payload[key];

      node('span', labelText, label); check.onchange = () => { edit.payload[key] = inverted ? !check.checked : check.checked; if (inverted && check.checked) edit.payload.archived = false; preview.classList.toggle('highlighted', !!edit.payload.highlight); rememberInput(); };

    }

    if (edit.payload.kind !== 'shopping') { setting('Highlight', 'highlight'); if (!['guide', 'front'].includes(edit.payload.category)) setting('Show in book', 'hidden', true); }

    const actions = node('div', undefined, primary, 'actions');

    const save = button('Save to book', () => {

      save.disabled = true; message('Saving…');

      saveQueue = saveEdit(input.value).finally(() => { save.disabled = false; }); return saveQueue;

    }, actions, 'primary');

    button('Return', async () => { await saveQueue.catch(() => {}); await waitDrafts(); if (expressionReturn) expressionReturn(); else if (edit?.payload.kind === 'shopping') shoppingView(); else editingCategory ? maintainSection(editingCategory) : home(); }, actions);

    if (data.snapshot.records[id]) button('Earlier versions', () => history(id), aside); button('Show draft preview', () => show(input.value, 'Unshared draft preview'), aside);

    button('Export draft', () => download('fictional-draft.json', JSON.stringify({ schema: 1, type: 'cn-next-drafts', actor, workspace: bookId, baselines: data.baselines || {}, drafts: { [id]: { ...edit, payload: { ...edit.payload, text: input.value } } } })), aside);

    button('Discard draft', async () => { if (await confirm('Discard your local draft and cancel waiting changes for this item? Shared proposals and earlier versions remain recoverable.')) { data = await store.update(actor, bookId, v => { v.draftBackup = { drafts: M.clone(v.drafts), outbox: M.clone(v.outbox) }; delete v.drafts[id]; v.outbox = v.outbox.filter(op => op.recordId !== id); return v; }); home(); } }, aside);

    input.focus();

  }

  async function saveEdit(text, extra = {}) {

    const editing = edit, scope = actor + ':' + bookId, originHeading = main.querySelector('h1');

    const payload = M.editEnvelope(editing.payload, text);

    await waitDrafts().catch(() => {});

    M.insist(actor + ':' + bookId === scope, 'Reopen the account that owns this draft.');

    const result = await saveExpression(payload, { base: editing.base, originHeading, ...extra });

    if (result?.outcome === 'accepted' && edit === editing && actor + ':' + bookId === scope && originHeading.isConnected) {

      editing.base = result.revision; editing.payload = M.clone(result.latest.payload);

      message(privateLocal ? 'Saved to book.' : 'Saved to book. Synced to workspace.');

    }

    return result;

  }

  function reviewDetails(payload, parent) {

    if (!payload) return;

    const detail = (label, value) => { if (value !== undefined && value !== '') { node('h3', label, parent); node('div', Array.isArray(value) ? value.join('\n') : String(value), parent, 'passage'); } };

    detail('Name', payload.name || payload.title); detail('Wording', payload.text);

    if (payload.kind === 'group') { detail('Ordered words', payload.words.map((w, i) => (i + 1) + '. ' + w.text)); detail('Selected words', (payload.selection || []).map(i => payload.words[i]?.text || 'Unavailable word')); detail('Situation', payload.situation); detail('Cue', payload.cue); }

    if (payload.kind === 'person' || payload.binding?.path?.[0] === 'contacts') { detail('Context', payload.context); detail('Groups', payload.groups); detail('Other names', payload.aliases); }

    if (payload.category?.startsWith('home-slot:')) detail('Home slot ' + payload.category.slice(-1), payload.groupId ? payload.groupLabel || 'Saved word group' : 'Empty');
    if (payload.kind === 'notebook') {
      const notebook = NextNotebooks.content(payload);
      detail('Situation', notebook.situation); detail('Context', notebook.context);
      for (const section of notebook.sections || []) detail(section.name || section.title || 'Section', [section.context, section.text, ...(section.words || []), ...(section.phrases || []), ...(section.messages || [])].filter(Boolean).map(item => typeof item === 'string' ? item : item.text || item.word || item.message || item.phrase || 'Saved item needing review'));
    }

    if (payload.category === 'display') { const p = payload.display || {}; detail('Text size', p.textSize); detail('Spacing', p.spacing); detail('Picture prominence', p.pictures); for (const [id, chosen] of Object.entries(p.sections || {})) detail(master.categories.find(c => c.id === id)?.name || id, [chosen.name, chosen.icon].filter(Boolean).join(' · ')); }

    if (payload.category === 'dictionary') { detail('Favourite icons', payload.dictionary?.favourites); detail('Selected icons', payload.dictionary?.selection); detail('Hidden icons', payload.dictionary?.hidden); for (const [id, text] of Object.entries(payload.dictionary?.labels || {})) detail('Picture label — ' + id, text); for (const [id, text] of Object.entries(payload.dictionary?.messageText || {})) detail('Picture message — ' + id, text); for (const [id, words] of Object.entries(payload.dictionary?.aliases || {})) detail('Icon words — ' + id, words); }

    detail('State', [payload.highlight ? 'Highlighted' : '', payload.hidden ? 'Hidden' : '', payload.archived ? 'Archived' : '', payload.tombstone ? 'Removed' : 'Kept', payload.kind === 'shopping' ? payload.checked ? 'Bought' : 'Not bought' : ''].filter(Boolean).join(' · '));

    if (payload.items) detail('Order', payload.items.map(id => expressionRecords().find(p => p.id === id)?.text || master.categories.find(c => c.id === id)?.name || id));

  }

  function conflictView(result, operation) {

    clear('Changes need review'); view = 'conflict';

    const record = recordFor(operation.recordId);

    for (const [name, payload] of [[privateLocal ? 'Earlier wording' : 'Base', record.revisions.find(r => r.number === operation.base)?.payload], [privateLocal ? 'Saved wording' : `Latest saved (${result.latest.author})`, result.latest.payload], [privateLocal ? 'Your change' : 'Your proposal', result.conflict.proposal.payload]]) {

      const row = node('section', undefined, main, 'version'); node('h2', name, row); reviewDetails(payload, row);

    }

    node('p', 'Your proposal remains recoverable. Publishing uses the latest revision shown here; another intervening change will need review again.', main);

    const manual = { id: operation.recordId, base: result.revision, payload: M.preserve(result.latest.payload, result.conflict.proposal.payload) };

    button('Keep latest', async () => { data = await store.update(actor, bookId, value => { const outcome = value.outcomes[result.operation]; if (outcome) outcome.resolved = true; return value; }); home(); });

    if (['phrase', 'page', 'shopping'].includes(manual.payload.kind)) button('Combine wording', () => editRecord(operation.recordId, false, manual));

    else if (['note', 'person', 'group', 'notebook'].includes(manual.payload.kind) || manual.payload.category === 'display') button('Review my changes', () => {

      const p = { ...M.clone(manual.payload), revision: result.revision }, ctx = expressionContext();

      if (p.kind === 'note') NextExpression.editNote(ctx, p);

      else if (p.kind === 'person') NextExpression.editPerson(ctx, p);

      else if (p.kind === 'group') NextWordGroups.edit(ctx, p, home);
      else if (p.kind === 'notebook') NextNotebooks.edit(ctx, p, { payload: p, base: result.revision });

      else displaySettings(p);

    });

    button(manual.payload.kind === 'preference' ? 'Use my choices' : privateLocal ? 'Save my wording to book' : 'Publish my wording as a new version', async () => { const saved = await saveExpression(manual.payload, { base: manual.base, ...(result.latest.payload.tombstone ? { action: 'resurrect' } : {}) }); if (saved?.outcome !== 'conflict') home(); });

    button('Return', home);

  }

  function history(id) {

    clear('Earlier versions'); view = 'history'; const record = recordFor(id), back = expressionReturn || home;

    if (!record) { node('p', 'Earlier versions will be available after the first save.', main); button('Return', back); return; }

    const restore = async (revision, action) => {

      if (expressionReturn) { const result = await saveExpression(B.latest(record).payload, { base: record.current, action, target: revision.number, preserveDraft: true }); if (result.outcome !== 'conflict') back(); }

      else { edit = { id, base: record.current, payload: revision.payload }; await saveEdit(revision.payload.text, { action, target: revision.number }); if (view !== 'conflict') back(); }

    };

    for (const revision of [...record.revisions].reverse()) {

      const row = node('section', undefined, main, 'version'); node('h2', privateLocal ? 'Saved ' + new Date(revision.at).toLocaleString('en-CA') : `Version ${revision.number} · ${revision.author}`, row); node('p', revision.payload.text, row);

      if (revision.number < record.current) button('Restore this version', () => restore(revision, 'restore'), row);

    }

    if (record.current > 1) button('Undo latest change', () => restore(B.latest(record), 'undo'));

    if (!expressionReturn) button('Remove saved item', async () => { if (await confirm(`Remove this exact ${id === 'b4420c84-a4cc-4b47-9d9e-bd6bd6dd4b53' ? 'phrase' : 'page'}? Full wording and history remain recoverable.`)) { edit = { id, base: record.current, payload: record.revisions.at(-1).payload }; await saveEdit(edit.payload.text, { action: 'remove' }); if (view !== 'conflict') home(); } });

    for (const conflict of data.snapshot.conflicts.filter(c => c.recordId === id)) button(`Review retained proposal · ${conflict.author}`, () => conflictView({ revision: record.current, latest: record.revisions.at(-1), conflict }, { recordId: id, base: conflict.base }));

    button('Return', back);

  }

  function download(name, text) { const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

  function draftBundle(all = true) { return { schema: 1, type: 'cn-next-drafts', actor, workspace: bookId, baselines: M.clone(data.baselines || {}), drafts: M.clone(all ? data.drafts : Object.fromEntries(Object.entries(data.drafts).filter(([, d]) => d.state === 'waiting'))), retainedDrafts: M.clone(all ? data.retainedDrafts || {} : {}), outbox: M.clone(data.outbox) }; }

  async function exportText() { await waitDrafts().catch(() => {}); await readLocal(); const pkg = M.exportPackage(data.snapshot); pkg.activeEdition = data.active; if (data.outbox.length) pkg.recovery = draftBundle(false); return JSON.stringify(pkg, null, 2); }

  function restorePackage(text) {

    if (!privateLocal) return M.validatePackage(text, bookId, data?.snapshot.owner || 'owner', master, masterHash);

    const source = JSON.parse(text);

    return M.validatePackage(text, source.workspace?.id, source.workspace?.owner, master, masterHash);

  }

  async function restoreText(text, confirmed, expected) {
    const restoreActor = actor, restoreBook = bookId, restoreEpoch = accountEpoch;
    const guard = () => M.insist(actor === restoreActor && bookId === restoreBook && accountEpoch === restoreEpoch, 'Reopen the account that owns this restoration.');

    if (privateLocal || sharedAccount) main.inert = true;

    try {

    let pkg = restorePackage(text); const importedRecovery = pkg.recovery;

    if (pkg.activeEdition) M.insist(pkg.workspace.editions[pkg.activeEdition], 'Invalid adopted edition reference');

    if (sharedAccount) {
      M.insist(confirmed === true, 'Confirm restoration first.');
      await waitDrafts(); await saveQueue; await shoppingQueue; await expressionQueue.catch(() => {}); guard();
      const session = await repository.session(); guard();
      M.insist(session.actor === restoreActor, 'Sign in to the account that owns this book.');
      const local = await store.read(restoreActor, restoreBook); guard(); data = local;
      let request = data.restoreHold?.request;
      if (request) M.insist(request.text === text, 'Retry the pending restoration with the same backup before choosing another replacement.');
      else {
        if (!expected) expected = (await repository.request(`workspaces/${restoreBook}/restore-preview`)).fingerprint;
        guard(); request = { text, expected, confirmed: true, operation: crypto.randomUUID() };
        data = await store.update(restoreActor, restoreBook, value => { value.restoreHold = { reason: 'shared-restore-request', request }; return value; }); guard();
      }
      let result;
      try { result = await repository.request(`workspaces/${restoreBook}/restore`, request); }
      catch (error) {
        guard();
        if ([400, 409, 413].includes(error.status)) {
          const held = await store.update(restoreActor, restoreBook, value => {
            if (value.restoreHold?.request?.operation === request.operation) { delete value.restoreHold.request; value.restoreHold.reason = 'review-required'; }
            return value;
          }); guard(); data = held;
        }
        throw error;
      }
      guard();
      pkg = M.validatePackage(JSON.stringify(result), restoreBook, data.snapshot.owner, master, masterHash);
      M.insist((pkg.workspace.privateEpoch || 0) > (data.snapshot.privateEpoch || 0), 'Invalid restored book response. Recovery and waiting changes are retained.');
      text = JSON.stringify(pkg);
    }
    if (privateLocal) {

      M.insist(confirmed === true, 'Confirm restoration first.');

      await waitDrafts(); await saveQueue; await shoppingQueue; await expressionQueue.catch(() => {});

      await repository.session();

      if (!expected) expected = (await repository.request('private-state')).fingerprint;

      // Durable hold before disk mutation: a quota failure stops here; a later failure cannot send old proposals into the restored book.

      data = await store.update(actor, bookId, value => { value.restoreHold = { at: new Date().toISOString() }; return value; });

      const result = await repository.request('restore-private-book', { text, expected, confirmed: true, rebind: true });

      // Validate durable response before switching this device's namespace. A local failure leaves disk recovery intact.

      pkg = M.validatePackage(JSON.stringify(result), bookId, data.snapshot.owner, master, masterHash);

      // Waiting work is recovery input, never an automatic replay into a restored edition.

      text = JSON.stringify(pkg);

    }

    const restored = await store.restore(restoreActor, restoreBook, data?.snapshot.owner || 'owner', text, confirmed, master, masterHash, { suspendDrafts: privateLocal || sharedAccount, recovery: importedRecovery }); guard(); data = restored;

    screens.clear(); currentScreen = null; editorMode ? home() : renderRoute(); if (privateLocal || sharedAccount) message(sharedAccount ? 'Shared book restored. The prior book and unfinished changes remain in recovery.' : 'Book restored and saved on this computer. Unfinished changes remain in recovery.'); return true;

    } finally { if (privateLocal || sharedAccount) main.inert = false; }

  }

  async function restoreDraftText(text, confirmed) {

    M.insist(typeof text === 'string' && new TextEncoder().encode(text).length <= M.MAX_PACKAGE_BYTES, 'Draft bundle too large');

    const bundle = JSON.parse(text);
    M.eraseNotebookCopies(bundle, data.snapshot.purgedNotebooks);

    M.insist(bundle.actor === actor && bundle.workspace === bookId, 'Draft owner mapping does not match');

    M.validateDraftBundle(bundle, data.snapshot, master, masterHash);

    const baselines = bundle.baselines || {};

    const outbox = bundle.outbox || []; M.insist(Array.isArray(outbox), 'Invalid pending operations');

    M.insist(confirmed, 'Confirm draft replacement first.');

    data = await store.update(actor, bookId, value => {

      value.draftBackup = draftBundle(true);

      value.baselines = { ...value.baselines, ...baselines };

      for (const op of outbox) { const old = value.outbox.find(o => o.operation === op.operation); M.insist(!old || M.canonical(old) === M.canonical(op), 'Pending operation key reused with different input'); if (!old) value.outbox.push(op); }

      value.drafts = { ...value.drafts, ...bundle.drafts }; value.retainedDrafts = { ...value.retainedDrafts, ...bundle.retainedDrafts }; return value;

    }); home(); return true;

  }

  function restorationReview(text, wording, action, actionLabel = 'Restore shared book') {
    const pkg = restorePackage(text), reviewActor = actor, reviewBook = bookId, reviewEpoch = accountEpoch;
    const guard = () => M.insist(actor === reviewActor && bookId === reviewBook && accountEpoch === reviewEpoch, 'Reopen the account that owns this review.');
    const before = new Map(B.catalogue(B.currentEdition(data.snapshot), master, masterHash).map(p => [p.id, p]));
    const after = B.catalogue(B.currentEdition(pkg.workspace), master, masterHash);
    clear('Review restored book'); node('p', wording, main, 'passage');
    const changed = after.filter(p => before.has(p.id) && M.canonical(before.get(p.id)) !== M.canonical(p)).length;
    node('p', `${after.filter(p => !before.has(p.id)).length} added; ${changed} changed; ${[...before.keys()].filter(id => !after.some(p => p.id === id)).length} removed. Open the sections below to review complete wording.`, main);
    // Render imported wording as text only. Opaque excluded fields still survive in backup.
    function passage(value, parent, key = '') {
      if (/guide|photo|alphabet|image|provenance|source|legacyRow/i.test(key) || /^(id|kind|type|created_at|updated_at|createdAt|updatedAt)$/.test(key)) return;
      if (typeof value === 'string' && value.trim()) node('p', value, parent, 'passage');
      else if (Array.isArray(value)) value.forEach(v => passage(v, parent, key));
      else if (M.object(value) && ![value.id, value.name, value.title].some(v => typeof v === 'string' && /^(communication partner guide|partner guide|guide|alphabet(?: grid)?|spelling grid)$/i.test(v.replace(/[-_]/g, ' ').trim()))) for (const [k, v] of Object.entries(value)) passage(v, parent, k);
    }
    const groups = new Map();
    for (const p of after) {
      if (/guide|alphabet|spelling.grid/i.test(p.category + ' ' + p.name)) continue;
      let group = groups.get(p.category);
      if (!group) { group = node('details', undefined, main); node('summary', p.category === 'personal' ? 'Personal information, including medical details' : master.categories.find(c => c.id === p.category)?.name || ({ notebooks: 'Situation notebooks', 'quick-words': 'Quick words', notes: 'Notes', people: 'People' })[p.category] || p.category, group); groups.set(p.category, group); }
      if (p.tombstone || p.archived || p.hidden) node('p', p.tombstone ? 'Removed, retained for recovery' : p.archived ? 'Archived' : 'Hidden', group);
      node('p', p.text, group, 'passage');
      if (p.kind === 'notebook' || p.kind === 'group') passage(p.notebook || p.original || p.words, group);
    }
    button('Download reviewed backup', () => download('reviewed-communication-book.json', text));
    button(actionLabel, async () => { guard(); if (await confirm(wording)) { guard(); await action(); } }, main, 'primary');
    button('Cancel', () => { guard(); home(); });
  }

  async function adoptRestoredBook(text) {
    const reviewActor = actor, reviewBook = bookId, reviewEpoch = accountEpoch;
    const guard = () => M.insist(actor === reviewActor && bookId === reviewBook && accountEpoch === reviewEpoch, 'Reopen the account that owns this restored book.');
    const pkg = restorePackage(text);
    await waitDrafts(); await saveQueue; await shoppingQueue; await expressionQueue.catch(() => {}); guard();
    const local = await store.read(reviewActor, reviewBook); guard(); data = local;
    M.insist(data.pendingRestoration && M.canonical(data.pendingRestoration) === M.canonical(pkg.workspace), 'The restored book changed. Review it again.');
    const adopted = await store.restore(reviewActor, reviewBook, data.snapshot.owner, text, true, master, masterHash, { suspendDrafts: true }); guard(); data = adopted;
    screens.clear(); currentScreen = null; home(); message('Using the restored shared book. The prior local book and unfinished changes remain in recovery.');
  }
  function utilities(parent = main) {

    const box = node('section', undefined, parent);

    button('Get latest saved changes', checkUpdates, box);
    if (sharedAccount && data.restoreHold?.request) button('Retry book restoration', () => {
      const request = data.restoreHold.request;
      restorationReview(request.text, 'Finish the pending shared book restoration? The prior book and unfinished changes remain recoverable.', () => restoreText(request.text, true, request.expected));
    }, box);
    else if (sharedAccount && data.pendingRestoration) button('Review restored shared book', () => {
      const text = JSON.stringify(M.exportPackage(data.pendingRestoration));
      restorationReview(text, 'Use the shared book restored on another device? This replaces this device’s reading copy. Its prior local book and unfinished changes remain recoverable and will not be sent automatically.', () => adoptRestoredBook(text), 'Use restored book on this device');
    }, box);

    button('Download saved content', async () => download(privateLocal || sharedAccount ? 'communication-book-backup.json' : 'fictional-workspace.json', await exportText()), box);

    button('Download unfinished edits', async () => { await waitDrafts().catch(() => {}); await readLocal(); download(privateLocal || sharedAccount ? 'unfinished-changes.json' : 'fictional-drafts.json', JSON.stringify(draftBundle(true))); }, box);

    const label = node('label', 'Restore saved content from a backup', box); label.htmlFor = 'restore-file'; const file = node('input', undefined, box); file.id = 'restore-file'; file.type = 'file'; file.accept = '.json';

    file.onchange = async () => {

      try {

        if (!file.files[0]) return;

        const text = await file.files[0].text(), pkg = restorePackage(text);

        const current = privateLocal ? await repository.request('private-state') : sharedAccount ? await repository.request(`workspaces/${bookId}/restore-preview`) : null;

        const wording = privateLocal ? `Restore this backup as this person's book? It has ${Object.keys(pkg.workspace.records).length} saved items. The saved book on this computer will be replaced. The original import, previous book and unfinished changes remain recoverable. Only confirm if this is the correct person's backup.`

          : `Replace the saved shared book with ${pkg.workspace.name}, ${Object.keys(pkg.workspace.records).length} saved items? This changes the book for all devices. The prior book and unfinished changes remain recoverable. Waiting changes will be held for separate review.`;

        if (sharedAccount) restorationReview(text, wording, () => restoreText(text, true, current?.fingerprint));
        else if (await confirm(wording)) await restoreText(text, true, current?.fingerprint);

      } catch (e) { report(e); }

    };

    const draftLabel = node('label', 'Restore unfinished edits from a backup', box); draftLabel.htmlFor = 'draft-file'; const draftFile = node('input', undefined, box); draftFile.id = 'draft-file'; draftFile.type = 'file'; draftFile.accept = '.json';

    draftFile.onchange = async () => { try { if (!draftFile.files[0]) return; const text = await draftFile.files[0].text(); if (await confirm('Restore these private drafts and pending operations? Existing input stays in a backup. Nothing is automatically sent.')) await restoreDraftText(text, true); } catch (e) { report(e); } };

    if (data.backup) button('Download prior-store backup', () => download('prior-fictional-workspace.json', data.backup), box);

    if (data.draftBackup) button('Download prior draft backup', () => download('prior-fictional-drafts.json', JSON.stringify({ schema: 1, type: 'cn-next-drafts', actor, workspace: bookId, baselines: data.baselines || {}, ...data.draftBackup })), box);

    if (data.priorRestoreRecovery?.length) button('Download earlier device recovery', () => download('earlier-device-recovery.json', JSON.stringify(data.priorRestoreRecovery)), box);

    if (data.importedRecovery) { node('p', 'This backup also contained waiting changes. They remain in a separate recovery copy; review them before saving to the restored book.', box); button('Download waiting-change recovery', () => download('waiting-change-recovery.json', JSON.stringify(data.importedRecovery)), box); }

    const older = node('details', undefined, box); node('summary', 'Earlier copies', older);

    for (const saved of Object.values(data.snapshot.editions).reverse()) button('Preview copy saved ' + new Date(saved.at).toLocaleString('en-CA'), () => previewPrint('booklet', false, saved), older);

    button('Remove local saved copy', async () => { if (await confirm('Export a backup first. Remove this account’s downloaded workspace and private drafts from this device? Offline copies cannot be remotely erased.')) { await store.remove(actor, bookId, true); await store.identity(null); data = null; actor = null; signInView(); } }, box);

  }

  async function checkUpdates() {

    if (!actor) return;
    const checkingScope = actor + ':' + bookId, checkingEpoch = accountEpoch, heading = main.querySelector('h1');

    try { await sync.download(); await readLocal(); savedVersion++; if (view === 'home' || view === 'book' || view === 'contents') home(); else message('Update stored on this device. This open view stays unchanged until you return.'); }

    catch (error) { if (actor + ':' + bookId !== checkingScope || accountEpoch !== checkingEpoch) return; if (error.status === 401 || error.status === 403) { await lock(); message('Sign in to send changes. Saved work remains locked in its account store.'); } else {
      // A restore notification also persists a held reading copy for review.
      // Refresh the deliberate Settings check so its recovery action is reachable.
      await readLocal();
      if (editorMode && view === 'contents' && heading?.isConnected && data.pendingRestoration) home();
      report(error);
    } }

  }

  async function retry() { try { await sync.send(); await readLocal(); const result = Object.values(data.outcomes).findLast(r => r.outcome === 'conflict' && !r.resolved); if (result?.action === 'clear-shopping') { shoppingView(); message('The list changed. Clear all was not applied.'); } else if (result) conflictView(result, { recordId: result.recordId, base: result.conflict.base }); else { home(); message('Synced to workspace.'); } } catch (error) { if (error.status === 401 || error.status === 403) { await lock(); message('Sign in to send changes. Pending work remains in its account store.'); } else report(error); } }

  function accessView() {

    clear('Workspace access'); node('p', 'Revocation stops future online access. Previously downloaded offline copies cannot be remotely erased. Each actor can export a backup and deliberately remove their local copy.', main);

    for (const target of ['alex', 'robin', 'reader', 'outsider']) { const row = node('section', undefined, main, 'version'); node('h2', target, row); for (const role of ['reader', 'editor', 'manager', null]) button(role ? `Grant ${role}` : 'Revoke access', async () => { await repository.request('workspaces/' + bookId + '/grants', { target, role }); message('Access updated.'); }, row); }

    button('Return', home);

  }

  window.NextTrial = { checkUpdates, exportText, restoreText, restoreDraftText };

  try {

    document.title = editorMode ? 'Settings — My Words' : 'My Words';

    if ('serviceWorker' in navigator) {
      // Installation still requires every offline asset before activation, but
      // opening the online app does not wait for that background download.
      navigator.serviceWorker.register('/sw.js').catch(() => message('Offline preparation could not finish. Keep the app online and reopen to retry.'));
    }

    globalThis.NextBoot?.phase('Loading communication words');
    await loadMaster(); const remembered = await store.identity();

    if (remembered?.signOutPending) { closedSignOut(); return; }

    if ((privateLocal || sharedAccount) && remembered?.workspace) bookId = remembered.workspace;

    let session;

    globalThis.NextBoot?.phase('Checking sign-in');
    try { session = await repository.session(); }
    catch (error) {
      if (error.status === 401 || error.status === 403) {
        if (remembered) { actor = remembered.actor; data = await store.read(actor, bookId); }
        await lock(); message('Sign in to continue. Saved work is retained in its account.');
      } else if (remembered) await openActor(remembered.actor, null, true);
      else signInView();
      return;
    }

    if (sharedAccount && session.workspace) bookId = session.workspace;

    if (privateLocal) { needsSetup = session.setup; if (session.workspace) bookId = session.workspace; }

    let joined;
    try {
      const destination = sessionStorage.getItem('mywords-join-session');
      sessionStorage.removeItem('mywords-join-session');
      joined = JSON.parse(destination);
    } catch { /* A missing/unavailable hint uses the normal sign-in screen. */ }
    // This one-use hint follows deliberate signup/sign-in. Authentication still
    // comes from the checked server session and owned workspace download.
    const joinedHere = sharedAccount && joined?.actor === session.actor && joined?.workspace === session.workspace;
    if (session.actor && (joined ? joinedHere : remembered?.actor === session.actor)) await openActor(session.actor, session.mode); else { await store.identity(null); signInView(); }

  } catch (error) { report(error); if (!data) signInView(); }

})();

