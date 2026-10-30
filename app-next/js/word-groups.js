(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('./model') : root.NextModel);
  if (typeof module === 'object') module.exports = api; else root.NextWordGroups = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  const clone = M.clone;
  const active = p => !p.hidden && !p.archived && !p.tombstone;
  const strip = p => { const out = clone(p); delete out.revision; delete out.waiting; delete out.synthetic; delete out.available; return out; };
  const slotId = n => { M.insist(n === 1 || n === 2, 'Unknown Home position.'); return '5d02a111-4ca0-5000-8000-00000000000' + n; };
  // Source names are scoped by the owning workspace; no content-derived identity.
  function legacyId(key) {
    const hash = seed => { let n = seed; for (const c of 'quick-words:' + key) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return (n >>> 0).toString(16).padStart(8, '0'); };
    const hex = [2166136261, 2166136262, 2166136263, 2166136264].map(hash).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-5' + hex.slice(13, 16) + '-8' + hex.slice(17, 20) + '-' + hex.slice(20);
  }
  function snapshotWords(words) {
    M.insist(Array.isArray(words) && words.length > 0, 'Choose at least one complete word or phrase.');
    return words.map(word => {
      const text = typeof word === 'string' ? word : word.text;
      M.insist(typeof text === 'string' && text.trim(), 'A word needs complete wording.');
      if (typeof word === 'string') return { text };
      return word.id || word.binding ? { text, source: clone(word) } : clone(word);
    });
  }
  function groups(ctx, includeInactive = false) {
    const saved = ctx.records().filter(p => p.kind === 'group' && p.category === 'quick-words');
    const project = ctx.project?.() || {};
    const source = (project.extra || []).filter(g => !saved.some(p => 'group:' + p.id === g.id || p.id === legacyId(g.id) || p.provenance?.legacyGroup === g.id)).map(g => {
      const words = (g.words || []).map(w => typeof w === 'string' ? { text: w } : w).filter(active);
      const notebookIndex = /^notebook:(\d+)$/.exec(g.id);
      const original = (project.content?.savedGroups || []).find(p => 'group:' + p.id === g.id) || (notebookIndex && project.content?.notebook?.sections?.[Number(notebookIndex[1])]) || g;
      return { ...clone(original), ...clone(g), id: legacyId(g.id), kind: 'group', category: 'quick-words', text: words.map(w => w.text).join('\n') || g.name || 'Saved word group', words: words.length ? snapshotWords(words) : [], selection: clone(original.selection || []), provenance: { ...(clone(original.provenance || {})), legacyGroup: g.id, original: clone(original) }, binding: { source: 'addition', category: 'quick-words' }, revision: 0, synthetic: true };
    });
    const result = [...saved, ...source];
    return includeInactive ? result : result.filter(active);
  }
  function search(ctx, query = '') {
    const key = query.trim().toLocaleLowerCase();
    return groups(ctx).filter(g => !key || [g.name, g.situation, g.text, ...(g.words || []).map(w => w.text)].filter(Boolean).join('\n').toLocaleLowerCase().includes(key));
  }
  function removeWord(payload, index) {
    const result = clone(payload);
    result.words.splice(index, 1);
    result.selection = (result.selection || []).filter(i => i !== index).map(i => i > index ? i - 1 : i);
    if (result.rapid) {
      if (index < result.rapid.originalWordCount) result.rapid.originalWordCount--;
      if (index < result.rapid.moreBatchStart) result.rapid.moreBatchStart--;
    }
    return result;
  }
  function slots(ctx) {
    const all = groups(ctx, true);
    return [1, 2].map(n => {
      const saved = ctx.records().find(p => p.id === slotId(n));
      const p = saved || { id: slotId(n), kind: 'preference', category: 'home-slot:' + n, text: 'Home shortcut ' + n, binding: { source: 'addition', category: 'home-slot:' + n }, groupId: null, revision: 0 };
      const group = all.find(g => g.id === p.groupId);
      return { ...clone(p), available: !!group && active(group) };
    });
  }
  function changeSlot(current, group) {
    const result = strip(current);
    result.groupId = group?.id || null; result.groupLabel = group?.name || '';
    result.undo = { previousGroupId: current.groupId || null, previousLabel: current.groupLabel || '', expectedRevision: (current.revision || 0) + 1, assignedGroupId: result.groupId };
    return result;
  }
  function undoSlot(current) {
    M.insist(current.undo && current.revision === current.undo.expectedRevision && current.groupId === current.undo.assignedGroupId, 'This Home position changed. Keep the newer choice or choose a group again.');
    return { ...strip(current), groupId: current.undo.previousGroupId, groupLabel: current.undo.previousLabel, undo: null };
  }
  const success = result => result?.outcome === 'accepted' || result?.outcome === 'waiting';
  const checkedSave = async (ctx, p, options) => {
    const screen = ctx.main?.firstChild;
    const result = await ctx.save(strip(p), options);
    if (!success(result)) return false;
    // A completed save must not reopen a screen the person deliberately left.
    if (screen && !ctx.main.contains(screen)) return false;
    return true;
  };
  function field(ctx, parent, title, value, multiline = false) {
    const id = 'word-group-' + title.toLowerCase().replace(/\W+/g, '-');
    const label = ctx.node('label', title, parent); label.htmlFor = id;
    const input = ctx.node(multiline ? 'textarea' : 'input', undefined, parent); input.id = id; input.value = value || ''; return input;
  }
  function listWords(ctx, parent, words) {
    const list = ctx.node('ol', undefined, parent, 'group-word-preview');
    words.forEach(w => ctx.node('li', w.text, list)); return list;
  }
  function cue(ctx, parent, value) {
    if (typeof value === 'string' && value) ctx.node('span', value, parent, 'group-cue');
    else if (value && /^\/assets\/dictionary\/symbols\/\d+\.svg$/.test(value.asset || '')) {
      const image = ctx.node('img', undefined, parent, 'group-cue-image'); image.src = value.asset; image.alt = value.label || 'Chosen picture';
      image.onerror = () => { image.hidden = true; };
      ctx.node('span', value.label || 'Chosen picture', parent, 'group-cue');
    }
  }
  function validateGeneratedWords(result, initial = false) {
    const words = result?.words;
    M.insist(result?.success === true && Array.isArray(words) && words.length > 0 && words.length <= 100 && (!initial || words.length === 50) && words.every(w => typeof w === 'string' && w.trim() && w.length <= 500), 'Words could not be generated. Your entry and earlier words are kept. Try again.');
    return words.map(w => w.trim());
  }
  function addGeneratedWords(payload, words, clues) {
    const p = clone(payload), keys = new Set(p.words.map(w => w.text.trim().normalize('NFKC').toLocaleLowerCase()));
    const start = p.words.length;
    const batch = (p.rapid.latestBatch || (p.rapid.clueHistory || []).length) + 1;
    for (const text of words) { const key = text.trim().normalize('NFKC').toLocaleLowerCase(); if (!keys.has(key)) { keys.add(key); p.words.push({ text, quickBatch: batch }); } }
    p.rapid.clueHistory = [...(p.rapid.clueHistory || []), clone(clues)];
    if (p.words.length > start) { p.rapid.moreBatchStart = start; p.rapid.latestBatch = batch; }
    p.text = p.words.map(w => w.text).join('\n');
    return p;
  }
  function quick(ctx, state = { query: '' }, initial) {
    const draft = initial ? Object.values(ctx.drafts?.() || {}).find(d => d.payload?.id === initial.id && ['draft', 'waiting'].includes(d.state)) : Object.values(ctx.drafts?.() || {}).filter(d => d.payload?.rapid && d.state === 'draft').sort((a, b) => (b.payload.rapid.updatedAt || 0) - (a.payload.rapid.updatedAt || 0))[0];
    let p = strip(draft?.payload || initial || { ...ctx.newPayload('group', 'quick-words', 'Quick words', ''), words: [], selection: [], rapid: { entry: '', keywords: '', originalWordCount: 0, clueHistory: [] } });
    let base = draft?.base ?? initial?.revision ?? 0, queue = Promise.resolve(), storageError, busy = false, changing = false, notice = '', heading, pendingDraft, writingDraft = false, generationSequence = 0, queuedDraftSignature;
    const current = () => (!ctx.scopeAlive || ctx.scopeAlive()) && heading?.isConnected;
    const retain = () => {
      const signature = JSON.stringify({ base, payload: { ...p, rapid: { ...p.rapid, updatedAt: undefined } } });
      // Submission can reuse the already tracked save of unchanged wording.
      if (!storageError && signature === queuedDraftSignature) return queue;
      queuedDraftSignature = signature;
      p.rapid.updatedAt = Date.now(); pendingDraft = { payload: clone(p), base };
      if (!writingDraft) {
        writingDraft = true;
        queue = queue.catch(() => {}).then(async () => {
          try {
            // Keep the first in-flight save and the newest pending wording. Avoid
            // rewriting complete owned history once for every intermediate key.
            while (pendingDraft) {
              const captured = pendingDraft; pendingDraft = null;
              try { await ctx.rememberDraft(captured.payload, captured.base); storageError = false; }
              catch { storageError = true; notice = 'This draft could not be saved. Keep this page open and retry or export your words.'; if (current()) error.textContent = notice; }
            }
          } finally { writingDraft = false; }
        });
        ctx.trackDraftQueue?.(queue);
      }
      return queue;
    };
    let error;
    const generate = async expand => {
      if (busy) return;
      if (p.rapid.entry.trim().length < 2 || (expand && !p.selection.length)) { error.textContent = 'Enter a topic or select a word first.'; return; }
      const token = ctx.screenToken?.();
      const generation = ++generationSequence;
      const requestCurrent = () => current() && (!ctx.screenToken || ctx.screenToken() === token);
      busy = true; get.disabled = true; if (different) different.disabled = true; if (more) more.disabled = true;
      error.textContent = 'Getting words…';
      const bankButtons = [...ctx.main.querySelectorAll('.quick-bank button')];
      await retain(); await queue;
      if (!requestCurrent()) { busy = false; get.disabled = false; if (different) different.disabled = false; if (more) more.disabled = !p.selection.length; return; }
      if (storageError) { busy = false; get.disabled = false; if (different) different.disabled = false; if (more) more.disabled = !p.selection.length; return; }
      if (!navigator.onLine) { notice = 'No connection for new words. Your entry and earlier words are kept. Use your saved words or the Communication book.'; busy = false; render(); return; }
      const captured = clone(p), clues = expand ? p.selection.map(i => p.words[i].text) : [];
      try {
        const response = await ctx.generateWords({ keywords: expand ? p.rapid.keywords : p.rapid.entry.trim(), clues, existingWords: expand ? p.words.map(w => w.text) : [] });
        if (!requestCurrent()) return;
        const words = validateGeneratedWords(response, !expand);
        if (expand) p = addGeneratedWords(p, words, clues);
        else {
          // A new topic keeps the previous bank in its own local draft.
          if (p.words.length) { p = { ...ctx.newPayload('group', 'quick-words', 'Quick words', ''), words: [], selection: [], rapid: { entry: captured.rapid.entry } }; base = 0; }
          p.words = words.map(text => ({ text })); p.selection = []; p.name = captured.rapid.entry.trim(); p.text = words.join('\n');
          p.rapid = { ...p.rapid, keywords: captured.rapid.entry.trim(), originalWordCount: 50, moreBatchStart: 50, latestBatch: 0, clueHistory: [] };
        }
        notice = expand ? (p.words.length === captured.words.length ? 'No new words returned. Earlier words and your selection are kept.' : (p.words.length - captured.words.length) + ' more words added.') : '';
        // The entry is durable before requesting generation. Let User use the
        // returned words immediately while the tracked local draft save finishes.
        const savedDraft = retain();
        busy = false; render();
        const target = ctx.main.querySelector(expand ? '[data-quick-fresh-heading]' : '[data-quick-bank="original"] button');
        if (expand && target) target.style.scrollMarginTop = ((document.querySelector('header')?.offsetHeight || 53) + (ctx.main.querySelector('.quick-selection')?.offsetHeight || 0) + 8) + 'px';
        target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: expand ? 'start' : 'nearest' });
        await savedDraft;
      } catch { if (requestCurrent()) { notice = 'Words could not be generated. Your entry and earlier words are kept. Try again.'; busy = false; render(); } }
      finally { if (generation === generationSequence) { busy = false; get.disabled = false; if (different) different.disabled = false; if (more) more.disabled = !p.selection.length; bankButtons.forEach(b => { b.disabled = false; }); } }
    };
    let get, more, different;
    const render = () => {
      ctx.clear('Quick words'); heading = ctx.main.firstChild;
      const form = ctx.node('form', undefined, ctx.main, 'quick-form');
      const input = field(ctx, form, 'Topic / clue', p.rapid.entry); input.maxLength = 200; input.autocomplete = 'off';
      input.spellcheck = false; input.setAttribute('autocorrect', 'off');
      input.enterKeyHint = 'go';
      input.oninput = () => { p.rapid.entry = input.value; retain(); };
      input.onkeydown = event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); generate(false); } };
      get = ctx.node('button', 'Get Words', form, 'primary'); get.type = 'submit'; get.disabled = busy;
      form.onsubmit = event => { event.preventDefault(); generate(false); };
      error = ctx.node('p', notice, ctx.main); error.dataset.quickError = ''; error.setAttribute('role', 'alert');
      more = null;
      different = null;
      if (p.words.length) {
        const selectedArea = ctx.node('section', undefined, ctx.main, 'quick-selection');
        const selectedHeading = ctx.node('h2', 'Selected words', selectedArea); selectedHeading.tabIndex = -1; selectedHeading.dataset.quickSelectionHeading = '';
        const selected = ctx.node('p', '', selectedArea); selected.dataset.quickSelection = '';
        const hint = ctx.node('p', '', selectedArea); hint.setAttribute('aria-live', 'polite');
        const change = ctx.button(changing ? 'Done' : 'Change selection', () => { changing = !changing; refresh(); }, selectedArea);
        more = ctx.button('Get more words', () => generate(true), selectedArea, 'primary');
        const chips = [];
        const bank = (name, title, indices) => {
          const titleNode = ctx.node('h2', title, ctx.main); titleNode.tabIndex = -1;
          if (name === 'original' && !p.words.some(word => word.quickBatch)) titleNode.className = 'quick-bank-heading-quiet';
          if (name === 'fresh') titleNode.dataset.quickFreshHeading = '';
          if (name === 'original') titleNode.dataset.quickOriginalHeading = '';
          const grid = ctx.node('div', undefined, ctx.main, 'words quick-bank'); grid.dataset.quickBank = name;
          indices.forEach(i => {
            const word = p.words[i];
            const b = ctx.button(word.text, () => { if (busy) return; if (!p.selection.includes(i)) p.selection.push(i); else if (changing) p.selection = p.selection.filter(n => n !== i); refresh(); retain(); }, grid);
            b.setAttribute('aria-label', word.text);
            chips.push([b, i]);
          });
        };
        const indices = p.words.map((_, i) => i);
        const originals = indices.filter(i => !p.words[i].quickBatch), additions = indices.filter(i => p.words[i].quickBatch);
        if (additions.length) { bank('fresh', 'More words', additions.filter(i => p.words[i].quickBatch === p.rapid.latestBatch)); const earlier = additions.filter(i => p.words[i].quickBatch !== p.rapid.latestBatch); if (earlier.length) bank('earlier', 'Earlier added words', earlier); }
        bank('original', additions.length ? 'Original words' : 'Words', originals);
        const keep = ctx.button('Keep message as a note', async () => { await retain(); if (!storageError && current()) ctx.keepNote(p.selection.map(i => p.words[i].text).join(' · ')); });
        const refresh = () => {
          selectedArea.hidden = !p.selection.length && !changing;
          selected.textContent = p.selection.map(i => p.words[i]?.text).filter(Boolean).join(' · '); selected.hidden = !p.selection.length;
          hint.textContent = changing ? 'Tap a highlighted word to take it out.' : p.selection.length ? p.selection.length + ' selected' : 'Select a word, then get more words.';
          change.hidden = !p.selection.length && !changing; change.textContent = changing ? 'Done' : 'Change selection'; change.setAttribute('aria-pressed', String(changing));
          more.disabled = busy || !p.selection.length; keep.hidden = !p.selection.length;
          for (const [b, i] of chips) { const chosen = p.selection.includes(i); b.setAttribute('aria-pressed', String(chosen)); b.textContent = (chosen ? '✓ ' : '') + p.words[i].text; b.disabled = busy; }
        }; refresh();
        const actions = ctx.node('div', undefined, ctx.main, 'actions quick-actions');
        ctx.button('Save Words', async () => { await retain(); if (!storageError && current()) editor(ctx, { ...p, revision: base }, () => quick(ctx, state, { ...p, revision: base }), base === 0); }, actions);
        different = ctx.button('Get Different Words', () => generate(false), actions); different.disabled = busy;
        ctx.button('Start Over', async () => {
          await retain(); if (storageError || !current()) return;
          quick(ctx, state, { ...ctx.newPayload('group', 'quick-words', 'Quick words', ''), words: [], selection: [], rapid: { entry: '', keywords: '', originalWordCount: 0, clueHistory: [] } });
          ctx.main.querySelector('.quick-form input')?.focus();
        }, actions);
      }
      savedLists(ctx, state, !p.words.length);
      const recovery = ctx.node('details', undefined, ctx.main); ctx.node('summary', 'Draft backup', recovery);
      ctx.button('Export Quick words draft', () => {
        const blob = new Blob([JSON.stringify({ type: 'communication-notes-word-group-draft', base, payload: p }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob), link = ctx.node('a'); link.href = url; link.download = 'quick-words-draft.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, recovery);
    }; render();
  }
  function savedLists(ctx, state, expanded) {
    const saved = ctx.node('details', undefined, ctx.main); saved.open = expanded;
    ctx.node('summary', 'Saved word lists', saved);
    const input = field(ctx, saved, 'Search saved word groups', state.query);
    const results = ctx.node('div', undefined, saved);
    const render = () => {
      results.replaceChildren(); const matches = search(ctx, input.value);
      if (!matches.length) ctx.node('p', input.value ? 'No saved word groups match. Try another clue.' : 'No saved word groups yet. Choose words in Communication book, then Save word group.', results);
      for (const g of matches) {
        const row = ctx.node('section', undefined, results, 'saved-card'); cue(ctx, row, g.cue);
        ctx.button(g.name || 'Saved word group', () => open(ctx, g.id, () => quick(ctx, state)), row);
        ctx.node('p', (g.words || []).slice(0, 3).map(w => w.text).join(' · '), row);
        if (slots(ctx).some(s => s.groupId === g.id)) ctx.node('p', 'On Home', row, 'item-status');
      }
    };
    input.oninput = () => { state.query = input.value; render(); }; render();
    ctx.button('Change favourites', () => manage(ctx));
    const unfinished = Object.values(ctx.drafts?.() || {}).filter(d => d.payload?.kind === 'group' && !['accepted', 'waiting'].includes(d.state) && (!d.payload.rapid || d.payload.rapid.entry?.trim() || d.payload.words?.length));
    if (unfinished.length) {
      const details = ctx.node('details', undefined, ctx.main); ctx.node('summary', 'Unfinished word groups', details);
      for (const d of unfinished) ctx.button('Continue ' + (d.payload.name || d.payload.rapid?.entry || 'word group'), () => d.payload.rapid ? quick(ctx, state, { ...d.payload, revision: d.base }) : editor(ctx, { ...d.payload, revision: d.base }, () => quick(ctx), d.base === 0), details);
    }
    const inactive = groups(ctx, true).filter(g => g.archived || g.tombstone);
    if (inactive.length) {
      const details = ctx.node('details', undefined, ctx.main); ctx.node('summary', 'Archived and deleted groups', details);
      inactive.forEach(g => { const row = ctx.node('section', undefined, details, 'saved-card'); ctx.node('h2', g.name, row); listWords(ctx, row, g.words || []); ctx.button('Restore group', async () => { if (await checkedSave(ctx, { ...g, archived: false, tombstone: false }, { base: g.revision, action: 'resurrect' })) quick(ctx, state); }, row); if (g.revision) ctx.button('History', () => ctx.history(g.id), row); });
    }
    ctx.button('Home', ctx.home);
  }
  function open(ctx, id, back = () => quick(ctx)) {
    const initial = groups(ctx, true).find(g => g.id === id);
    if (!initial || !active(initial)) { ctx.clear('Word group unavailable'); ctx.node('p', 'This group is archived or deleted. Its Home position is kept.', ctx.main); ctx.button('Choose another group', () => manage(ctx)); ctx.button('Home', ctx.home); return; }
    if (initial.rapid) return quick(ctx, { query: '' }, initial);
    let group = clone(initial), composition = false, selection = [...(group.selection || [])].filter(i => Number.isInteger(i) && i >= 0 && i < group.words.length);
    const render = () => {
      ctx.clear(group.name || 'Saved word group'); cue(ctx, ctx.main, group.cue);
      ctx.button(composition ? 'Show one word' : 'Compose message', () => { composition = !composition; render(); });
      const bank = ctx.node('div', undefined, ctx.main, 'words');
      const sequence = ctx.node('p', undefined, ctx.main, 'word-preview'); sequence.dataset.groupSelection = '';
      const refresh = () => { sequence.textContent = selection.length ? selection.map(i => group.words[i].text).join(' · ') : 'No words selected.'; bank.querySelectorAll('button').forEach((b, i) => { if (composition) b.setAttribute('aria-pressed', String(selection.includes(i))); else b.removeAttribute('aria-pressed'); }); };
      group.words.forEach((word, i) => ctx.button(word.text, () => {
        if (!composition) return ctx.show(word.text, group.name || 'Show word');
        selection = selection.includes(i) ? selection.filter(n => n !== i) : [...selection, i]; refresh();
      }, bank));
      sequence.hidden = !composition; refresh();
      if (composition) {
        const show = ctx.button('Show message', () => ctx.show(selection.map(i => group.words[i].text).join(' '), 'Show message')); show.disabled = !selection.length;
        const keep = ctx.button('Keep message as a note', async () => { const text = selection.map(i => group.words[i].text).join(' '); if (!text) return; const result = await ctx.keepNote(text); if (success(result)) ctx.message('Message kept as an independent note.'); });
        keep.disabled = !selection.length;
        const previousRefresh = refresh;
        bank.addEventListener('click', () => { previousRefresh(); show.disabled = keep.disabled = !selection.length; });
      }
      ctx.button('Keep word list and selection', async () => {
        const payload = { ...strip(group), selection: [...selection] };
        if (await checkedSave(ctx, payload, { base: group.revision || 0 })) { group = groups(ctx, true).find(g => g.id === id) || payload; ctx.message('Word list and selection kept on this device.'); }
      });
      ctx.button('Add shortcut', async () => { if (group.synthetic) { if (!(await checkedSave(ctx, group, { base: 0 }))) return; group = groups(ctx, true).find(g => g.id === id) || { ...group, synthetic: false }; } ctx.shortcut ? ctx.shortcut({type:'group',id:group.id,label:group.name || 'Saved word group'}) : offerHome(ctx, group); });
      globalThis.NextHomeCollections?.groupStar(ctx, group, ctx.main);
      ctx.button('Edit word group', () => editor(ctx, group, () => open(ctx, id, back)));
      if (group.revision) ctx.button('History', () => ctx.history(group.id));
      ctx.button('Back', back); ctx.button('Home', ctx.home);
    }; render();
  }
  function capture(ctx, orderedWordEnvelopes) {
    const words = snapshotWords(orderedWordEnvelopes);
    const name = words.slice(0, 2).map(w => w.text).join(' · ');
    const payload = { ...ctx.newPayload('group', 'quick-words', words.map(w => w.text).join('\n'), name), words, selection: [] };
    editor(ctx, payload, () => ctx.navigate('book'), true);
  }
  function editor(ctx, initial, back, fresh = false) {
    const draft = Object.values(ctx.drafts?.() || {}).find(d => (d.id || d.payload?.id) === initial.id);
    let p = strip(draft?.payload || initial), base = draft?.base ?? initial.revision ?? 0;
    let queue = Promise.resolve(), draftError, notice;
    const screenGuard = () => {
      const screen = ctx.main.firstChild, token = ctx.screenToken?.();
      return () => screen?.isConnected && (!ctx.scopeAlive || ctx.scopeAlive()) && (!ctx.screenToken || ctx.screenToken() === token);
    };
    const refreshDraft = async () => { const current = screenGuard(); await retain(); if (current() && !draftError) render(); };
    const retain = () => {
      const captured = strip(p);
      queue = queue.catch(() => {}).then(() => ctx.rememberDraft(captured, base)).then(() => { draftError = null; }, error => { draftError = error; if (notice) notice.textContent = 'This draft could not be saved. Keep this page open. Retry or export your words.'; ctx.report(error); });
      return queue;
    };
    const render = () => {
      ctx.clear(fresh ? 'Save word group' : 'Edit word group');
      const name = field(ctx, ctx.main, 'Group name', p.name);
      const picture = field(ctx, ctx.main, 'Recognition cue (optional)', typeof p.cue === 'string' ? p.cue : '');
      name.oninput = () => { p.name = name.value; retain(); }; picture.oninput = () => { p.cue = picture.value; retain(); };
      cue(ctx, ctx.main, p.cue);
      ctx.button('Choose picture (optional)', async () => {
        const current = screenGuard(); await retain(); if (draftError || !current()) return;
        if (!globalThis.NextDictionary?.load) { ctx.message('Pictures are unavailable. Your words and cue are kept.'); return; }
        try {
          const catalogue = await globalThis.NextDictionary.load();
          if (!current()) return;
          ctx.clear('Choose a picture'); const clue = field(ctx, ctx.main, 'Search pictures', ''), choices = ctx.node('div', undefined, ctx.main, 'words');
          const draw = () => { choices.replaceChildren(); const items = globalThis.NextDictionary.search(catalogue, clue.value).slice(0, 20); if (!items.length) ctx.node('p', 'No pictures match. Try another clue.', choices); items.forEach(item => { const b = ctx.button(item.label, async () => { p.cue = { id: item.id, asset: item.asset, label: item.label }; await refreshDraft(); }, choices); const image = ctx.node('img', undefined, b, 'group-cue-image'); image.alt = ''; image.src = item.asset; image.onerror = () => { image.hidden = true; }; }); };
          clue.oninput = draw; draw(); ctx.button('No picture', async () => { p.cue = ''; await refreshDraft(); }); ctx.button('Back', render);
        } catch (error) { ctx.report(error); }
      });
      ctx.node('p', 'These complete words will stay in this order. Source changes do not rewrite this list.', ctx.main);
      p.words.forEach((word, i) => {
        const row = ctx.node('section', undefined, ctx.main, 'group-edit-word'); ctx.node('p', word.text, row);
        const wording = field(ctx, row, 'Wording ' + (i + 1), word.text, true);
        wording.oninput = () => { word.text = wording.value; p.text = p.words.map(w => w.text).join('\n'); retain(); };
        const up = ctx.button('Move up', async () => { move(i, -1); await refreshDraft(); }, row); up.disabled = i === 0; up.setAttribute('aria-label', 'Move up: ' + word.text);
        const down = ctx.button('Move down', async () => { move(i, 1); await refreshDraft(); }, row); down.disabled = i === p.words.length - 1; down.setAttribute('aria-label', 'Move down: ' + word.text);
        ctx.button('Remove word', async () => { const current = screenGuard(); if (!(await ctx.confirm('Remove this word from the group? The original Book word stays saved. History keeps this version.')) || !current()) return; p = removeWord(p, i); await refreshDraft(); }, row);
        if (word.source?.id) {
          const current = ctx.records().find(item => item.id === word.source.id);
          if (current && active(current) && current.text !== word.text) ctx.button('Update from source', async () => { const visible = screenGuard(); if (!(await ctx.confirm('Replace “' + word.text + '” with “' + current.text + '”?')) || !visible()) return; p.words[i] = snapshotWords([current])[0]; await refreshDraft(); }, row);
        }
      });
      const added = field(ctx, ctx.main, 'Add complete word or phrase', p.pendingWord || '');
      added.oninput = () => { p.pendingWord = added.value; retain(); };
      ctx.button('Add word', async () => { if (!added.value.trim()) return; p.words.push({ text: added.value, ...(p.rapid ? { quickBatch: p.rapid.latestBatch || 1 } : {}) }); if (p.rapid && !p.rapid.latestBatch) p.rapid.latestBatch = 1; p.pendingWord = ''; await refreshDraft(); });
      const error = notice = ctx.node('p', draftError ? 'This draft could not be saved. Keep this page open. Retry or export your words.' : '', ctx.main); error.setAttribute('role', 'status');
      ctx.button(fresh ? 'Save word group' : 'Save changes', async () => {
        const current = screenGuard();
        if (!p.words.length) { error.textContent = 'Keep at least one word or phrase.'; return; }
        p.name = name.value.trim() || p.words.slice(0, 2).map(w => w.text).join(' · '); p.text = p.words.map(w => w.text).join('\n');
        await retain(); await queue; if (draftError || !current()) return;
        if (!(await checkedSave(ctx, p, { base }))) return;
        const saved = groups(ctx, true).find(g => g.id === p.id) || p;
        ctx.clear('Word group saved'); ctx.node('h2', saved.name, ctx.main); listWords(ctx, ctx.main, saved.words);
        ctx.button('Add shortcut', () => ctx.shortcut ? ctx.shortcut({type:'group',id:saved.id,label:saved.name || 'Saved word group'}) : offerHome(ctx, saved)); ctx.button('Open word group', () => open(ctx, saved.id)); ctx.button('Quick words', () => quick(ctx));
        ctx.message('Word group saved on this device.');
      }, ctx.main, 'primary');
      ctx.button('Export word-group draft', () => {
        const blob = new Blob([JSON.stringify({ type: 'communication-notes-word-group-draft', base, payload: p }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob), link = ctx.node('a'); link.href = url; link.download = 'word-group-draft.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      if (!fresh) {
        ctx.button('Archive group', async () => { if (!(await ctx.confirm('Archive this group? You can restore it. Its Home shortcut will be unavailable.'))) return; if (await checkedSave(ctx, { ...p, archived: true }, { base })) quick(ctx); });
        ctx.button('Delete group', async () => { if (!(await ctx.confirm('Delete this group? You can restore it from Archived and deleted groups. Book words stay saved.'))) return; if (await checkedSave(ctx, { ...p, tombstone: true }, { base, action: 'remove' })) quick(ctx); });
      }
      ctx.button('Back', async () => { const current = screenGuard(); await retain(); if (!draftError && current()) back(); });
      retain();
    };
    const move = (i, offset) => {
      const ordered = p.words.map((word, index) => ({ word, index })); [ordered[i], ordered[i + offset]] = [ordered[i + offset], ordered[i]];
      p.words = ordered.map(v => v.word); p.selection = (p.selection || []).map(index => ordered.findIndex(v => v.index === index));
    }; render();
  }
  function home(ctx, parent = ctx.main, actions = parent) {
    const values = slots(ctx);
    if (!values.some(s => s.groupId)) { ctx.button('Choose favourite', () => manage(ctx), actions); return; }
    const section = ctx.node('section', undefined, parent); ctx.node('h2', 'Favourite word groups', section);
    const grid = ctx.node('div', undefined, section, 'home-word-groups');
    for (const s of values) {
      const row = ctx.node('div', undefined, grid, 'home-word-slot'); row.dataset.homeSlot = s.category.slice(-1);
      if (!s.groupId) { row.setAttribute('aria-hidden', 'true'); continue; }
      const group = groups(ctx, true).find(g => g.id === s.groupId);
      if (s.available) { cue(ctx, row, group.cue); ctx.button(group.name || 'Saved word group', () => open(ctx, group.id, ctx.home), row); }
      else { ctx.node('p', (s.groupLabel || 'Word group') + ' — unavailable', row); ctx.button('Choose another group', () => picker(ctx, s), row); }
    }
    ctx.button('Change favourites', () => manage(ctx), actions);
  }
  function manage(ctx) {
    ctx.clear('Change favourites');
    for (const s of slots(ctx)) {
      const row = ctx.node('section', undefined, ctx.main, 'saved-card'); row.dataset.homeSlot = s.category.slice(-1);
      ctx.node('h2', 'Home slot ' + s.category.slice(-1), row);
      const group = groups(ctx, true).find(g => g.id === s.groupId);
      ctx.node('p', s.groupId ? (group?.name || s.groupLabel || 'Word group') + (s.available ? '' : ' — unavailable') : 'No word group chosen.', row); cue(ctx, row, group?.cue);
      ctx.button(s.groupId ? 'Replace' : 'Choose word group', () => picker(ctx, s), row);
      if (s.groupId) ctx.button('Remove from Home', async () => { if (await checkedSave(ctx, changeSlot(s, null), { base: s.revision })) { manage(ctx); ctx.message('Removed from Home. Still saved in Quick words.'); } }, row);
      if (s.undo) {
        const undo = ctx.button('Undo', async () => { try { if (await checkedSave(ctx, undoSlot(s), { base: s.undo.expectedRevision })) { manage(ctx); ctx.message('Previous Home choice restored.'); } } catch (error) { ctx.report(error); } }, row);
        undo.disabled = s.revision !== s.undo.expectedRevision || s.groupId !== s.undo.assignedGroupId;
        if (undo.disabled) ctx.node('p', 'This Home position has a newer waiting change. Send it before choosing an earlier version.', row);
      }
    }
    ctx.button('Done', ctx.home);
  }
  function offerHome(ctx, group) {
    const values = slots(ctx), existing = values.find(s => s.groupId === group.id);
    if (existing) {
      ctx.clear('Already on Home'); ctx.node('p', group.name + ' is already in Home slot ' + existing.category.slice(-1) + '.', ctx.main);
      ctx.button('Home', ctx.home); ctx.button('Open word group', () => open(ctx, group.id)); return;
    }
    const empty = values.find(s => !s.groupId);
    if (empty) return preview(ctx, empty, group, () => open(ctx, group.id));
    ctx.clear('Show on Home'); ctx.node('p', 'Choose the favourite to replace.', ctx.main);
    for (const s of values) ctx.button('Replace ' + (groups(ctx, true).find(g => g.id === s.groupId)?.name || s.groupLabel || 'unavailable group'), () => preview(ctx, s, group, () => offerHome(ctx, group)));
    ctx.button('Keep Home unchanged', () => open(ctx, group.id));
  }
  function picker(ctx, slot, state = { query: '' }) {
    ctx.clear('Choose word group'); ctx.node('p', 'Choose a group for Home slot ' + slot.category.slice(-1) + '.', ctx.main);
    const input = field(ctx, ctx.main, 'Search saved word groups', state.query), list = ctx.node('div', undefined, ctx.main);
    const render = () => { list.replaceChildren(); const matches = search(ctx, input.value); if (!matches.length) ctx.node('p', 'No saved word groups match.', list); matches.forEach(g => { const row = ctx.node('div', undefined, list, 'saved-card'); cue(ctx, row, g.cue); ctx.button(g.name || 'Saved word group', () => preview(ctx, slot, g, () => picker(ctx, slot, state)), row); }); };
    input.oninput = () => { state.query = input.value; render(); }; render(); ctx.button('Back', () => manage(ctx));
  }
  function preview(ctx, slot, group, back) {
    ctx.clear('Use on Home');
    ctx.node('p', 'Home slot ' + slot.category.slice(-1) + (slot.groupId ? ': replace ' + (slot.groupLabel || 'the current group') + ' with ' + group.name + '.' : ': add ' + group.name + '.'), ctx.main);
    cue(ctx, ctx.main, group.cue); listWords(ctx, ctx.main, group.words);
    ctx.button('Use on Home', async () => {
      if (group.synthetic && !(await checkedSave(ctx, group, { base: 0 }))) return;
      if (await checkedSave(ctx, changeSlot(slot, group), { base: slot.revision })) { ctx.home(); ctx.message('Home choice saved on this device. Undo is in Change favourites.'); }
    }, ctx.main, 'primary'); ctx.button('Back', back);
  }
  return { validateGeneratedWords, addGeneratedWords, snapshotWords, legacyId, slotId, groups, search, slots, changeSlot, undoSlot, removeWord, quick, open, edit: editor, capture, home, manage };
});
