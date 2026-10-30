(function (root, factory) {
  const api = factory();
  if (typeof module === 'object') module.exports = api;
  else root.NextExpression = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const states = new WeakMap();
  const values = value => Array.isArray(value) ? value : Object.values(value || {});
  const isNote = p => p.kind === 'note' && p.category === 'notes' || p.kind === 'page' && p.binding?.path?.[0] === 'notes';
  const isPerson = p => p.kind === 'person' && p.category === 'people' || p.kind === 'page' && p.binding?.path?.[0] === 'contacts';
  const noteRecords = records => values(records).filter(isNote);
  const peopleRecords = records => values(records).filter(isPerson);
  const normalise = text => String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const field = (p, key) => Object.prototype.hasOwnProperty.call(p, key) ? p[key] : p.original?.[key];
  const strings = v => Array.isArray(v) ? v.filter(s => typeof s === 'string') : typeof v === 'string' ? [v] : [];
  const peopleCategories = [
    ['Health team', 'M3 3v5a5 5 0 0 0 10 0V3M8 13v3a5 5 0 0 0 10 0v-4m0-4a2 2 0 1 0 0 4 2 2 0 0 0 0-4'],
    ['Family', 'M8 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M2 21v-4a6 6 0 0 1 12 0v4M17 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6m-2 3a5 5 0 0 1 7 4v2'],
    ['Friends', 'M6 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6m12 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6M1 21v-5c0-5 10-5 10 0v5m2 0v-5c0-5 10-5 10 0v5'],
    ['Neighbours', 'M1 11 6 6l5 5M3 9v11h6V9m4 2 5-5 5 5m-8-2v11h6V9'],
    ['Cottage', 'M2 12 12 3l10 9M5 10v11h14V10m-10 11v-7h6v7'],
    ['Contractors', 'M14 3a6 6 0 0 0-5 8L2 18l4 4 7-7a6 6 0 0 0 8-6l-4 3-4-4 3-5z'],
    ['Other', 'M4 12h.1M12 12h.1M20 12h.1'],
    ['Emergency contact', 'M12 2 1 21h22L12 2m0 6v6m0 3h.1'],
    ['Book club', 'M12 5C8 2 3 3 2 4v16c3-2 7-2 10 0 3-2 7-2 10 0V4c-3-2-7-2-10 1v15'],
    ['Favourites', 'm12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z']
  ].map(([label, icon]) => ({label, icon}));
  const categoryLabel = label => ({ 'my family': 'Family', 'my health team': 'Health team' })[normalise(label)] || peopleCategories.find(c => normalise(c.label) === normalise(label))?.label || label;
  const groups = p => [...new Set(strings(field(p, 'groups') ?? field(p, 'group') ?? field(p, 'relationship')).map(categoryLabel))];
  const personCategories = p => [...new Set([...groups(p), ...(field(p, 'favourite') ? ['Favourites'] : [])])];
  function categoryCue(ctx, label, parent) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svg.namespaceURI, 'path');
    path.setAttribute('d', peopleCategories.find(c => c.label === label)?.icon || peopleCategories[6].icon);
    svg.append(path); parent.append(svg); ctx.node('span', label, parent);
  }
  const title = p => String(field(p, 'title') ?? p.name ?? '').trim();
  const personName = p => String(p.name || field(p, 'name') || p.text?.split('\n')[0] || 'Person');
  const noteName = p => title(p) && title(p) !== 'Notes' ? title(p) : String(p.text || '').trim().slice(0, 100) || 'Unfinished note';
  function search(records, query) {
    const tokens = normalise(query).split(' ').filter(Boolean);
    return values(records).filter(p => {
      const haystack = normalise([p.text, p.name, field(p, 'title'), ...strings(field(p, 'aliases')), ...groups(p), field(p, 'context')].join(' '));
      return tokens.every(token => haystack.includes(token));
    });
  }
  function change(payload, updates) { return { ...clone(payload), ...clone(updates) }; }
  function restore(payload) { return change(payload, { tombstone: false, archived: payload.deletedFromArchived === true }); }
  function unfinished(drafts, records) {
    const saved = new Map(noteRecords(records).map(p => [p.id, p]));
    return values(drafts).filter(d => isNote(d.payload || {}) && !['accepted', 'waiting'].includes(d.state) &&
      !(saved.get(d.id)?.archived || saved.get(d.id)?.tombstone) && !d.payload.archived && !d.payload.tombstone);
  }
  function favourites(records) {
    return values(records).filter(p => p.favourite).sort((a, b) => (a.favouriteOrder ?? 0) - (b.favouriteOrder ?? 0) || String(a.id).localeCompare(String(b.id)));
  }
  function moveFavourite(records, id, offset) {
    const sorted = favourites(records), index = sorted.findIndex(p => p.id === id), destination = index + offset;
    if (index < 0 || destination < 0 || destination >= sorted.length) return sorted[index];
    const item = sorted[index], rest = sorted.filter(p => p.id !== id);
    const left = rest[destination - 1]?.favouriteOrder, right = rest[destination]?.favouriteOrder;
    const rank = left === undefined ? (right ?? 0) - 1 : right === undefined ? left + 1 : (left + right) / 2;
    return change(item, { favouriteOrder: rank });
  }
  function state(ctx, key) {
    if (!states.has(ctx.main)) states.set(ctx.main, {});
    const all = states.get(ctx.main);
    const scope = ctx.scopeKey || 'local';
    if (!all[scope]) all[scope] = {};
    return all[scope][key] ||= { filter: 'all', query: '', enteredQuery: '', count: 20, groups: [] };
  }
  const recordsFor = (ctx, kind) => kind === 'note' ? noteRecords(ctx.records()) : peopleRecords(ctx.records());
  const current = records => records.filter(p => !p.hidden && !p.archived && !p.tombstone);
  const accepted = result => ['accepted', 'waiting'].includes(result?.outcome);
  const savedHere = (ctx, result, screen) => accepted(result) && ctx.main.contains(screen);
  const baseOf = p => p.revision ?? p.current ?? (p.binding?.source === 'content' ? 1 : 0);
  const saveState = (ctx, payload, options = {}) => ctx.save(payload, { ...options, preserveDraft: true });
  function returnTo(ctx, route, render) { if (ctx.navigate) ctx.navigate(route); else render(ctx); }
  function input(ctx, parent, labelText, id, value = '', tag = 'input') {
    const label = ctx.node('label', labelText, parent); label.htmlFor = id;
    const el = ctx.node(tag, undefined, parent); el.id = id; el.value = value; return el;
  }
  function searchForm(ctx, s, label, rerender, parent = ctx.main) {
    const form = ctx.node('form', undefined, parent, 'word-search');
    const query = input(ctx, form, label, 'expression-search', s.enteredQuery);
    query.type = 'search'; query.oninput = () => { s.enteredQuery = query.value; };
    const submit = ctx.node('button', 'Search', form); submit.type = 'submit';
    form.onsubmit = event => { event.preventDefault(); s.query = query.value; s.enteredQuery = query.value; s.count = 20; rerender(); };
    ctx.button('Clear search', () => { s.query = ''; s.enteredQuery = ''; s.count = 20; rerender(); }, form);
    if (s.query) ctx.node('p', 'Search: ' + s.query, ctx.main);
  }
  function notes(ctx) {
    const s = state(ctx, 'notes');
    ctx.clear('Notes');
    ctx.refreshOnReturn?.(() => notes(ctx));
    const screen = ctx.main.firstChild;
    const heading = ctx.node('div', undefined, ctx.main, 'notes-heading'); heading.appendChild(screen);
    ctx.button('Add note', () => addNote(ctx), heading, 'primary');
    const tools = ctx.node('details', undefined, ctx.main, 'notes-find');
    tools.open = !!s.findOpen || s.filter !== 'all' || !!s.enteredQuery;
    tools.ontoggle = () => { s.findOpen = tools.open; };
    ctx.node('summary', 'Find notes', tools);
    const filters = ctx.node('nav', undefined, tools); filters.setAttribute('aria-label', 'Note filters');
    for (const [key, label] of [['all', 'All notes'], ['favourites', 'Favourites'], ['unfinished', 'Unfinished'], ['archived', 'Archived notes'], ['deleted', 'Recently deleted']]) {
      const b = ctx.button(label, () => { s.filter = key; s.count = 20; notes(ctx); }, filters); b.setAttribute('aria-pressed', String(s.filter === key));
    }
    searchForm(ctx, s, 'Search Notes', () => notes(ctx), tools);
    ctx.button('Manage notes', () => manageNotes(ctx), tools);
    const records = noteRecords(ctx.records());
    if (s.filter === 'unfinished') {
      const drafts = unfinished(ctx.drafts(), records).filter(d => search([d.payload], s.query).length);
      ctx.node('p', drafts.length + ' unfinished notes', ctx.main);
      for (const d of drafts.slice(0, s.count)) {
        const row = ctx.node('section', undefined, ctx.main, 'saved-card'); ctx.node('h2', noteName(d.payload), row);
        ctx.node('p', d.payload.text?.slice(0, 220) || 'No wording entered yet.', row, 'passage');
        ctx.button('Continue note', () => editNote(ctx, d.payload, d), row);
      }
      if (drafts.length > s.count) ctx.button('Show more notes', () => { s.count += 20; notes(ctx); });
      if (!drafts.length) ctx.node('p', 'No unfinished notes in this view.', ctx.main);
      return;
    }
    let eligible = s.filter === 'archived' ? records.filter(p => p.archived && !p.tombstone) :
      s.filter === 'deleted' ? records.filter(p => p.tombstone) : current(records);
    eligible = s.filter === 'favourites' ? favourites(eligible) : [...eligible].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    const found = search(eligible, s.query);
    ctx.node('p', found.length + (found.length === 1 ? ' note' : ' notes') + ' · ' + (filters.querySelector('[aria-pressed="true"]')?.textContent || 'All notes'), tools);
    const board = ctx.node('div', undefined, ctx.main, 'notes-board');
    for (const p of found.slice(0, s.count)) {
      const row = ctx.node('section', undefined, board, 'saved-card'); row.dataset.note = p.id;
      if (String(p.text || '').length > 100 || p.waiting || s.filter === 'favourites') row.classList.add('note-wide');
      const open = ctx.button('', () => readNote(ctx, p), row, 'note-open'); open.setAttribute('aria-label', noteName(p));
      open.id = 'note-choice-' + p.id;
      const title = ctx.node('span', noteName(p), open, 'note-title'); title.setAttribute('role', 'heading'); title.setAttribute('aria-level', '2');
      if (noteName(p) !== String(p.text || '').trim()) ctx.node('span', excerpt(p.text, s.query), open, 'passage');
      if (p.waiting) { ctx.node('p', 'Saved on this device. Waiting to sync.', row); if (ctx.retry) ctx.button('Retry sending', async () => { if (savedHere(ctx, await ctx.retry(), screen)) notes(ctx); }, row); }
      if (s.filter === 'favourites') {
        const order = favourites(eligible), index = order.findIndex(item => item.id === p.id);
        const up = ctx.button('Move favourite up', async () => { if (savedHere(ctx, await saveState(ctx, moveFavourite(eligible, p.id, -1), { base: baseOf(p) }), screen)) notes(ctx); }, row); up.disabled = index === 0;
        const down = ctx.button('Move favourite down', async () => { if (savedHere(ctx, await saveState(ctx, moveFavourite(eligible, p.id, 1), { base: baseOf(p) }), screen)) notes(ctx); }, row); down.disabled = index === order.length - 1;
      }
    }
    if (!found.length) ctx.node('p', s.query ? 'No notes found in this view. Clear search or choose another filter.' : 'No notes in this view.', ctx.main);
    if (found.length > s.count) ctx.button('Show more notes', () => { s.count += 20; notes(ctx); });
  }
  function excerpt(text, query) {
    const full = String(text || '');
    if (!query || full.length <= 220) return full.length <= 220 ? full : full.slice(0, 220) + '…';
    // Locate a clue in original wording without changing the full read/show payload.
    const needle = normalise(query).split(' ')[0]; let start = 0;
    const words = [...full.matchAll(/[\p{L}\p{N}]+/gu)].find(match => normalise(match[0]).includes(needle));
    if (words) start = Math.max(0, words.index - 60);
    return (start ? '…' : '') + full.slice(start, start + 220) + (start + 220 < full.length ? '…' : '');
  }
  function readNote(ctx, payload) {
    const p = noteRecords(ctx.records()).find(item => item.id === payload.id) || payload;
    ctx.clear('Read note');
    if (noteName(p) !== String(p.text || '').trim()) ctx.node('h2', noteName(p), ctx.main);
    ctx.node('p', p.text, ctx.main, 'passage note-reading');
    const screen = ctx.main.firstChild;
    if (p.waiting) { ctx.node('p', 'Saved on this device. Waiting to sync.', ctx.main); if (ctx.retry) ctx.button('Retry sending', async () => { if (savedHere(ctx, await ctx.retry(), screen)) readNote(ctx, p); }); }
    if (p.tombstone) {
      ctx.node('p', 'Deleted note. The complete wording and earlier changes are kept.', ctx.main);
      ctx.button('Restore note', async () => { if (savedHere(ctx, await saveState(ctx, restore(p), { base: baseOf(p), action: 'resurrect' }), screen)) notes(ctx); });
    } else if (p.archived) {
      ctx.node('p', 'Archived note', ctx.main);
      ctx.button('Restore note', async () => { if (savedHere(ctx, await saveState(ctx, change(p, { archived: false }), { base: baseOf(p) }), screen)) notes(ctx); });
    } else {
      ctx.button('Edit note', () => editNote(ctx, p));
    }
    if (!p.tombstone && !p.archived) {
      const star = ctx.button(p.favourite ? '★' : '☆', async () => {
        const rank = Math.max(0, ...favourites(noteRecords(ctx.records())).map(n => n.favouriteOrder || 0)) + 1;
        if (savedHere(ctx, await saveState(ctx, change(p, { favourite: !p.favourite, ...(p.favourite ? {} : { favouriteOrder: rank }) }), { base: baseOf(p) }), screen)) readNote(ctx, p);
      }, ctx.main, 'favourite-star');
      star.setAttribute('aria-label', 'Favourite note'); star.setAttribute('aria-pressed', String(!!p.favourite));
    }
    const options = ctx.node('details', undefined, ctx.main); ctx.node('summary', 'Note options', options);
    if (!p.tombstone) {
      if (!p.archived) {
        ctx.button('Archive note', async () => {
          if (!savedHere(ctx, await saveState(ctx, change(p, { archived: true }), { base: baseOf(p) }), screen)) return;
          notes(ctx); ctx.message('Note archived.');
          ctx.button('Undo archive', async () => {
            const latest = noteRecords(ctx.records()).find(item => item.id === p.id);
            if (!latest?.archived || latest.tombstone) return;
            if (accepted(await saveState(ctx, change(latest, { archived: false }), { base: baseOf(latest) }))) notes(ctx);
          });
        }, options);
      }
      ctx.button('Delete note', () => deleteNote(ctx, p), options);
    }
    ctx.shortcut && ctx.button('Add shortcut', () => ctx.shortcut({type:'note',id:p.id,label:noteName(p)}), options);
    ctx.button('Earlier note changes', () => ctx.history(p.id, () => readNote(ctx, p)), options);
    const draft = values(ctx.drafts()).find(d => d.id === p.id && !['waiting', 'accepted'].includes(d.state));
    if (draft && !p.archived && !p.tombstone) ctx.button('Continue unfinished change', () => editNote(ctx, draft.payload, draft));
  }
  function manageNotes(ctx) {
    ctx.clear('Manage Notes');
    const s = state(ctx, 'notes');
    for (const [filter, label] of [['archived', 'Archived notes'], ['deleted', 'Recently deleted']]) ctx.button(label, () => { s.filter = filter; notes(ctx); });
    for (const p of current(noteRecords(ctx.records()))) {
      const row = ctx.node('section', undefined, ctx.main, 'saved-card');
      ctx.node('h2', noteName(p), row);
      ctx.button('Edit note', () => editNote(ctx, p), row);
      ctx.button('Delete note', () => deleteNote(ctx, p), row);
    }
  }
  async function deleteNote(ctx, p, beforeDelete) {
    const screen = ctx.main.firstChild;
    if (!await ctx.confirm('Delete this note?\n\n' + noteName(p) + '\n\n' + p.text + '\n\nIt will move to Recently deleted. You can restore it there.', { confirmLabel: 'Delete note', cancelLabel: 'Keep note' })) return;
    if (beforeDelete) await beforeDelete();
    const result = await saveState(ctx, change(p, { tombstone: true, deletedFromArchived: !!p.archived }), { base: baseOf(p), action: 'remove' });
    if (!savedHere(ctx, result, screen)) return;
    notes(ctx); ctx.message('Note moved to Recently deleted.');
    ctx.button('Undo delete', async () => {
      const latest = noteRecords(ctx.records()).find(item => item.id === p.id);
      if (!latest?.tombstone) return;
      const result = await saveState(ctx, restore(latest), { base: baseOf(latest), action: 'resurrect' });
      if (accepted(result)) { notes(ctx); ctx.message('Note restored.'); }
    });
  }
  function addNote(ctx, text = '') {
    const payload = ctx.newPayload('note', 'notes', text, '');
    return editNote(ctx, payload, { id: payload.id, base: 0, payload });
  }
  function editor(ctx, kind, payload, draft, returnView, configure) {
    const base = draft?.base ?? baseOf(payload), original = clone(draft?.payload || payload);
    let edited = clone(original), pending = Promise.resolve(), saveError, draftError, saving = false;
    ctx.clear((draft?.base === 0 || base === 0 ? 'Add ' : 'Edit ') + kind);
    const screen = ctx.main.firstChild;
    const form = ctx.node('form', undefined, ctx.main);
    const fields = configure(form, edited);
    const notice = ctx.node('p', '', form); notice.setAttribute('role', 'status');
    const remember = () => {
      edited = fields.payload(edited);
      const captured = clone(edited);
      pending = pending.catch(() => {}).then(() => ctx.rememberDraft(captured, base)).then(() => { draftError = null; }, error => { draftError = error; retrySave.hidden = false; notice.textContent = 'This draft could not be saved on this device. Keep this page open. Retry or export the wording.'; ctx.report(error); });
      return pending;
    };
    fields.elements.forEach(el => el.addEventListener('input', remember));
    const submit = ctx.node('button', 'Save ' + kind, form); submit.type = 'submit'; submit.className = 'primary';
    const save = async () => {
      if (saving) return;
      saving = true; submit.disabled = true; retrySave.disabled = true;
      submit.textContent = 'Saving…'; notice.textContent = 'Saving ' + kind + '…';
      try {
      await remember();
      if (draftError) { submit.disabled = false; return; }
      if (!fields.valid(edited)) { notice.textContent = kind === 'note' ? 'Enter what you want to say before saving. Your unfinished note is kept.' : 'Enter a name, even part of a name. Your unfinished person is kept.'; fields.first.focus(); return; }
      submit.disabled = true;
      try {
        const outcome = await ctx.save(edited, { base });
        if (accepted(outcome)) { saveError = null; if (ctx.main.contains(screen)) { returnView(); ctx.message?.((kind === 'person' ? 'Person' : 'Note') + (outcome.outcome === 'waiting' ? ' saved on this device. Waiting to sync.' : ' saved.')); } }
        else if (outcome?.outcome !== 'conflict') { retrySave.hidden = false; notice.textContent = 'Save was not confirmed. Your input and earlier wording are kept. Retry saving or export wording.'; }
      } catch (error) { saveError = error; retrySave.hidden = false; notice.textContent = 'Unable to save. Your input and earlier wording are kept. Retry saving or export wording.'; ctx.report(error); }
      } finally { saving = false; submit.disabled = false; retrySave.disabled = false; submit.textContent = 'Save ' + kind; }
    };
    form.onsubmit = event => { event.preventDefault(); save().catch(ctx.report); };
    if (kind === 'note' && !original.tombstone && (payload.revision > 0 || payload.binding?.source === 'content')) ctx.button('Delete note', () => deleteNote(ctx, original, async () => { await remember(); if (draftError) throw draftError; }), form);
    const retrySave = ctx.button('Retry saving', save, form); retrySave.hidden = true;
    const recovery = ctx.node('details', undefined, form); ctx.node('summary', 'Unfinished change options', recovery);
    ctx.button('Export wording', () => {
      edited = fields.payload(edited);
      const data = new Blob([JSON.stringify({ format: 'communication-notes-expression-draft', version: 1, base, payload: edited }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(data), link = document.createElement('a'); link.href = url; link.download = kind + '-draft.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, recovery);
    ctx.button('Discard unfinished change', async () => {
      if (await ctx.confirm('Discard this unfinished ' + kind + ' change? Earlier saved wording will be kept.', { confirmLabel: 'Discard change', cancelLabel: 'Keep change' })) {
        await pending; await ctx.discardDraft(edited.id); returnView();
      }
    }, recovery);
    remember();
    return { payload: () => clone(edited), pending: () => pending, error: () => saveError || draftError };
  }
  function editNote(ctx, payload, draft) {
    const existing = !draft && values(ctx.drafts()).find(d => d.id === payload.id && !['accepted', 'waiting'].includes(d.state));
    return editor(ctx, 'note', payload, draft || existing, () => returnTo(ctx, 'notes', notes), (form, p) => {
      form.classList.add('note-editor');
      const wording = input(ctx, form, 'What do you want to say?', 'note-wording', p.text || '', 'textarea');
      const name = input(ctx, form, 'Title (optional)', 'note-title', title(p) === 'Notes' ? '' : title(p));
      let favourite = !!p.favourite;
      const star = ctx.button(favourite ? '★' : '☆', () => { favourite = !favourite; star.textContent = favourite ? '★' : '☆'; star.setAttribute('aria-pressed', String(favourite)); star.dispatchEvent(new Event('input')); }, form, 'favourite-star');
      star.setAttribute('aria-label', 'Favourite note'); star.setAttribute('aria-pressed', String(favourite));
      return { elements: [wording, name, star], first: wording, valid: edited => !!edited.text.trim(), payload: edited => change(edited, { text: wording.value, name: name.value, title: name.value, favourite }) };
    });
  }
  function people(ctx) {
    const s = state(ctx, 'people'); ctx.clear('People');
    ctx.refreshOnReturn?.(() => people(ctx));
    const screen = ctx.main.firstChild;
    const heading = ctx.node('div', undefined, ctx.main, 'notes-heading people-heading'); heading.appendChild(screen);
    ctx.button('Add person', () => {
      editPerson(ctx, ctx.newPayload('person', 'people', '', ''));
      const drafts = values(ctx.drafts()).filter(d => isPerson(d.payload || {}) && !['waiting', 'accepted'].includes(d.state) && !all.find(p => p.id === d.id)?.tombstone);
      for (const d of drafts) {
        const row = ctx.node('section', undefined, ctx.main, 'saved-card');
        ctx.node('h2', personName(d.payload), row);
        ctx.button('Continue person', () => editPerson(ctx, d.payload, d), row);
      }
    }, heading, 'primary');
    const all = peopleRecords(ctx.records());
    s.filter = 'all';
    const tools = ctx.node('details', undefined, ctx.main, 'notes-find'); tools.open = !!s.findOpen || !!s.enteredQuery;
    tools.ontoggle = () => { s.findOpen = tools.open; }; ctx.node('summary', 'Find people', tools);
    searchForm(ctx, s, 'Search People', () => people(ctx), tools);
    const available = current(all);
    const membership = [...peopleCategories.map(c => c.label), ...new Set(available.flatMap(personCategories).filter(label => !peopleCategories.some(c => c.label === label)))];
    const groupChoices = ctx.node('nav', undefined, ctx.main, 'people-groups'); groupChoices.setAttribute('aria-label', 'People groups');
    const everyone = ctx.button('All people', () => { s.groups = []; s.count = 20; people(ctx); ctx.main.querySelector('[data-people-group="all"]').focus(); }, groupChoices);
    everyone.dataset.peopleGroup = 'all'; everyone.setAttribute('aria-pressed', String(!s.groups.length));
    for (const group of membership) {
      const b = ctx.button('', () => { s.groups = [group]; s.count = 20; people(ctx); [...ctx.main.querySelectorAll('[data-people-group]')].find(el => el.dataset.peopleGroup === group)?.focus(); }, groupChoices); categoryCue(ctx, group, b); b.dataset.peopleGroup = group; b.setAttribute('aria-pressed', String(s.groups.includes(group)));
    }

    groupChoices.after(tools);
    const found = search(available.filter(p => !s.groups.length || s.groups.some(group => personCategories(p).includes(group))), s.query);
    ctx.node('p', found.length + (found.length === 1 ? ' person' : ' people'), tools);
    const board = ctx.node('div', undefined, ctx.main, 'notes-board people-board');
    for (const p of found.slice(0, s.count)) {
      const row = ctx.node('section', undefined, board, 'saved-card'); row.dataset.person = p.id;
      const open = ctx.button('', () => readPerson(ctx, p), row, 'note-open'); open.setAttribute('aria-label', personName(p));
      open.id = 'person-choice-' + p.id;
      const name = ctx.node('span', personName(p), open, 'note-title'); name.setAttribute('role', 'heading'); name.setAttribute('aria-level', '2');
      if (p.waiting) { ctx.node('p', 'Saved on this device. Waiting to sync.', row); if (ctx.retry) ctx.button('Retry sending', async () => { if (savedHere(ctx, await ctx.retry(), screen)) people(ctx); }, row); }
      if (field(p, 'context')) ctx.node('span', field(p, 'context'), open, 'passage');
      if (personCategories(p).length) {
        const badges = ctx.node('span', undefined, open, 'person-categories');
        for (const label of personCategories(p)) categoryCue(ctx, label, ctx.node('span', undefined, badges, 'person-category'));
      }
    }
    if (!found.length) ctx.node('p', 'No people found in this view. Clear search or group filters, or add a person.', ctx.main);
    if (found.length > s.count) ctx.button('Show more people', () => { s.count += 20; people(ctx); });
  }
  function readPerson(ctx, payload) {
    const p = peopleRecords(ctx.records()).find(item => item.id === payload.id) || payload;
    ctx.clear(personName(p)); ctx.main.classList.add('expression-reading');
    const screen = ctx.main.firstChild;
    if (p.waiting) { ctx.node('p', 'Saved on this device. Waiting to sync.', ctx.main); if (ctx.retry) ctx.button('Retry sending', async () => { if (savedHere(ctx, await ctx.retry(), screen)) readPerson(ctx, p); }); }
    ctx.node('p', p.text, ctx.main, 'passage note-reading');
    if (field(p, 'context') && !p.text.includes(field(p, 'context'))) ctx.node('p', field(p, 'context'), ctx.main, 'passage');
    if (strings(field(p, 'aliases')).length) ctx.node('p', 'Also known as: ' + strings(field(p, 'aliases')).join(', '), ctx.main);
    if (personCategories(p).length) ctx.node('p', 'Categories: ' + personCategories(p).join(', '), ctx.main);
    if (p.tombstone) ctx.button('Restore person', async () => { if (savedHere(ctx, await saveState(ctx, change(p, { tombstone: false }), { base: baseOf(p), action: 'resurrect' }), screen)) people(ctx); });
    else {
      ctx.button('Edit person', () => editPerson(ctx, p));
      ctx.button('Delete person', async () => {
        if (await ctx.confirm('Delete ' + personName(p) + '?\n\n' + p.text + '\n\nYou can restore this person from Deleted people.', { confirmLabel: 'Delete person', cancelLabel: 'Keep person' }))
          if (savedHere(ctx, await saveState(ctx, change(p, { tombstone: true }), { base: baseOf(p), action: 'remove' }), screen)) people(ctx);
      });
    }
    const options = ctx.node('details', undefined, ctx.main); ctx.node('summary', 'Person options', options);
    ctx.shortcut && ctx.button('Add shortcut', () => ctx.shortcut({type:'person',id:p.id,label:personName(p)}), options);
    ctx.button('Earlier person changes', () => ctx.history(p.id, () => readPerson(ctx, p)), options);
  }
  function editPerson(ctx, payload, draft) {
    const existing = !draft && values(ctx.drafts()).find(d => d.id === payload.id && !['accepted', 'waiting'].includes(d.state));
    return editor(ctx, 'person', payload, draft || existing, () => returnTo(ctx, 'people', people), (form, p) => {
      form.classList.add('note-editor');
      const name = p.name || field(p, 'name') || '';
      const text = p.text || '';
      // Bring a legacy separate name into the editable passage, retaining its
      // original envelope and all structured metadata for lossless recovery.
      const passage = name && text !== name && !text.startsWith(name + '\n') ? name + '\n' + text : text || name;
      const wording = input(ctx, form, 'About this person', 'person-passage', passage, 'textarea');
      const hint = ctx.node('p', 'Put the name or recognition clue on the first line. A short passage is enough.', form);
      hint.id = 'person-passage-help'; wording.setAttribute('aria-describedby', hint.id);
      const categories = ctx.node('fieldset', undefined, form, 'person-category-editor'); ctx.node('legend', 'Categories', categories);
      const chosen = personCategories(p);
      const choices = peopleCategories.map(c => {
        const label = ctx.node('label', undefined, categories); const checkbox = ctx.node('input', undefined, label);
        checkbox.type = 'checkbox'; checkbox.checked = chosen.includes(c.label); categoryCue(ctx, c.label, label);
        return { label: c.label, checkbox };
      });
      return { elements: [wording, ...choices.map(c => c.checkbox)], first: wording, valid: edited => !!edited.name.trim(), payload: edited => change(edited, {
        name: wording.value.split(/\r?\n/).find(line => line.trim())?.trim() || '', text: wording.value,
        groups: [...groups(p).filter(label => !peopleCategories.some(c => c.label === label)), ...choices.filter(c => c.checkbox.checked && c.label !== 'Favourites').map(c => c.label)],
        favourite: choices.find(c => c.label === 'Favourites').checkbox.checked
      }) };
    });
  }
  return { peopleCategories, personCategories, notes, people, addNote, readNote, editNote, readPerson, editPerson, noteRecords, peopleRecords, search, normalise, change, restore, unfinished, favourites, moveFavourite, noteName, personName, groups, excerpt };
});
