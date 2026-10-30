(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('./model') : root.NextModel);
  if (typeof module === 'object') module.exports = api; else root.NextNotebooks = api;
})(globalThis, function (M) {
  'use strict';
  const content = p => p.notebook.data || p.notebook;
  const title = p => p.name || p.notebook.title || content(p).title || 'Untitled notebook';
  const active = p => p.kind === 'notebook' && !p.hidden && !p.archived && !p.tombstone;
  const isFavourite = p => !!(p.favourite || p.printFavourite);
  function date(p) {
    const raw = p.notebook.createdAt || p.notebook.created_at || content(p).createdAt || content(p).created_at;
    const stamp = typeof raw === 'string' ? Date.parse(raw) : NaN;
    const calendar = typeof raw === 'string' && /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(raw);
    if (!calendar || !Number.isFinite(stamp)) return null;
    const day = new Date(Date.UTC(Number(calendar[1]), Number(calendar[2]) - 1, Number(calendar[3]))).toISOString().slice(0, 10);
    return day === raw.slice(0, 10) ? stamp : null;
  }
  function printOrder(records) {
    return records.filter(active).map((p, index) => ({ p, index })).sort((a, b) =>
      Number(isFavourite(b.p)) - Number(isFavourite(a.p)) || (date(b.p) ?? -Infinity) - (date(a.p) ?? -Infinity) || a.index - b.index).map(row => row.p);
  }
  function records(ctx) { return printOrder(ctx.records()); }
  const accepted = r => ['accepted', 'waiting'].includes(r?.outcome);
  const entryText = item => typeof item === 'string' ? item : item?.text || item?.word || item?.message || item?.phrase;
  const excludedSection = section => [section.id, section.name, section.title].some(value => typeof value === 'string' && /^(?:communication partner guide|partner guide|guide|alphabet(?: grid)?|spelling grid)$/i.test(value.replace(/[-_]/g, ' ').trim()));
  function validateGeneration(result) {
    const envelope = result?.notebook, notebook = envelope?.data || envelope;
    M.insist(result?.success === true && M.object(envelope) && M.object(notebook) && Array.isArray(notebook.sections) && notebook.sections.length > 0 && notebook.sections.length <= 100 && notebook.sections.every(section => M.object(section) && typeof (section.name || section.title) === 'string' && ['words', 'items', 'phrases', 'messages'].every(key => section[key] === undefined || Array.isArray(section[key]) && section[key].length <= 3000 && section[key].every(item => typeof entryText(item) === 'string' && entryText(item).trim() && entryText(item).length <= 40000))) && notebook.sections.some(section => ['words', 'items', 'phrases', 'messages'].some(k => section[k]?.length)), 'Notebook could not be generated. Your situation and earlier results are kept. Try again.');
    M.insist(!notebook.sections.some(excludedSection), 'Notebook could not be generated. Your situation and earlier results are kept. Try again.');
    M.rejectAuthority(envelope); return M.clone(envelope);
  }
  function passages(ctx, value, parent) {
    if (typeof value === 'string' && value.trim()) ctx.node('p', value, parent, 'passage');
    else if (Array.isArray(value)) value.forEach(v => passages(ctx, v, parent));
    else if (M.object(value)) for (const [key, v] of Object.entries(value)) if (!/guide|photo|alphabet|image|sources?|provenance/i.test(key)) passages(ctx, v, parent);
  }
  function contents(ctx, notebook) {
    if (notebook.frontMatter) {
      const front = notebook.frontMatter, card = front.content;
      if (front.entityType === 'book' && M.object(card)) {
        const area = ctx.node('section', undefined, ctx.main); area.dataset.bookReference = 'true';
        ctx.node('h2', 'About this book', area);
        for (const [key, label] of [['title', 'Title'], ['author', 'Author'], ['summary', 'Summary'], ['mainCharacters', 'People and characters'], ['themes', 'Themes'], ['discussionStarters', 'Discussion starters']]) {
          ctx.node('h3', label, area); passages(ctx, card[key], area);
        }
        for (const [key, value] of Object.entries(card)) if (!['title', 'author', 'summary', 'mainCharacters', 'themes', 'discussionStarters'].includes(key)) passages(ctx, { [key]: value }, area);
        for (const [key, value] of Object.entries(front)) if (!['content', 'entityType', 'entityName'].includes(key)) passages(ctx, { [key]: value }, area);
      } else passages(ctx, front, ctx.main);
    }
    for (const section of notebook.sections || []) {
      if (excludedSection(section)) continue;
      ctx.node('h2', section.name || section.title || 'Section', ctx.main);
      for (const text of [section.context, section.text]) if (typeof text === 'string') ctx.node('p', text, ctx.main, 'passage');
      const words = ctx.node('div', undefined, ctx.main, 'words');
      const pointable = ['pointable-vocabulary', 'nonfiction-events-and-actions-vocabulary'].includes(section.type);
      for (const item of [...(section.words || []), ...(pointable ? section.items || [] : [])]) { const text = entryText(item); if (typeof text !== 'string') continue; const button = ctx.button(text, () => { button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true')); }, words); button.setAttribute('aria-pressed', 'false'); const context = M.notebookItemContext(item); if (context) ctx.node('p', context, words, 'passage'); }
      for (const item of [...(pointable ? [] : section.items || []), ...(section.phrases || []), ...(section.messages || [])]) { const text = entryText(item); if (typeof text === 'string') ctx.node('p', text, ctx.main, 'passage'); const context = M.notebookItemContext(item); if (context) ctx.node('p', context, ctx.main, 'passage'); }
    }
  }
  function printChoices(ctx, preview, query = '', count = 20) {
    const area = ctx.node('section', undefined, ctx.main, 'notebook-print-choices');
    ctx.node('h3', 'Situation notebooks', area);
    ctx.node('p', 'Starred notebooks stay at the top. Other notebooks are newest-created first.', area);
    const form = ctx.node('form', undefined, area), label = ctx.node('label', 'Search saved notebooks', form), input = ctx.node('input', undefined, form);
    label.htmlFor = input.id = 'print-notebook-query'; input.type = 'search'; input.value = query;
    const search = ctx.node('button', 'Search', form); search.type = 'submit';
    const initialCount = count;
    const clear = ctx.button('Clear search', () => { input.value = ''; refresh('', initialCount); input.focus(); }, form); clear.type = 'button';
    const status = ctx.node('p', '', area); status.id = 'print-notebook-results'; status.setAttribute('aria-live', 'polite'); input.setAttribute('aria-describedby', status.id);
    const results = ctx.node('div', undefined, area);
    const normalise = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
    function refresh(nextQuery = query, nextCount = count) {
      query = nextQuery; count = nextCount; results.replaceChildren(); clear.disabled = !input.value;
      const terms = normalise(query);
      const found = printOrder(ctx.records()).filter(p => normalise(title(p)).includes(terms));
      status.textContent = !found.length && terms ? 'No saved notebooks match your search.' : found.length + (found.length === 1 ? ' notebook' : ' notebooks');
      for (const p of found.slice(0, count)) {
        const row = ctx.node('section', undefined, results, 'saved-card');
        ctx.button(title(p), () => preview(p), row);
        ctx.node('p', date(p) === null ? 'Creation date unavailable' : 'Created ' + new Date(date(p)).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }), row);
        const star = ctx.button(isFavourite(p) ? '★' : '☆', async () => {
          const copy = M.clone(p); copy.printFavourite = copy.favourite = !isFavourite(p);
          const result = await ctx.save(copy, { base: p.revision });
          if (accepted(result) && area.isConnected) refresh();
        }, row, 'favourite-star'); star.setAttribute('aria-label', 'Favourite ' + title(p));
        star.setAttribute('aria-pressed', String(isFavourite(p)));
      }
      if (found.length > count) ctx.button('Show more print choices', () => refresh(query, count + 20), results);
    }
    input.oninput = () => refresh(input.value, 20);
    form.onsubmit = e => { e.preventDefault(); refresh(input.value, 20); };
    refresh();
    return area;
  }
  function list(ctx, query = '', count = 20) {
    ctx.clear('Situation notebooks');
    ctx.refreshOnReturn?.(() => list(ctx, query, count));
    ctx.button('Create notebook', () => {
      const p = ctx.newPayload('notebook', 'notebooks', 'Untitled notebook');
      p.notebook = { title: '', situation: '', createdAt: new Date().toISOString(), frontMatter: {}, sections: [] };
      p.generation = { stage: 'input', lookup: false }; create(ctx, p, { base: 0, payload: p });
    }, ctx.main, 'primary');
    const saved = ctx.records();
    const drafts = Object.values(ctx.drafts()).filter(d => d.payload.kind === 'notebook' && d.state === 'draft' && !saved.find(p => p.id === d.id)?.tombstone && (content(d.payload).title?.trim() || content(d.payload).situation?.trim() || d.payload.generation?.situation?.trim() || content(d.payload).sections?.length));
    for (const draft of drafts) ctx.button('Continue ' + (draft.payload.name || content(draft.payload).title || draft.payload.generation?.situation || content(draft.payload).situation || 'Untitled notebook'), () => draft.payload.generation ? create(ctx, draft.payload, draft) : edit(ctx, draft.payload, draft));
    const form = ctx.node('form', undefined, ctx.main), label = ctx.node('label', 'Find a notebook', form), input = ctx.node('input', undefined, form);
    label.htmlFor = input.id = 'notebook-query'; input.type = 'search'; input.value = query;
    const search = ctx.node('button', 'Search notebooks', form); search.type = 'submit'; form.onsubmit = e => { e.preventDefault(); list(ctx, input.value); };
    const found = records(ctx).filter(p => [title(p), content(p).situation, content(p).context].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    ctx.node('p', found.length + ' saved notebooks', ctx.main);
    for (const p of found.slice(0, count)) {
      const choice = ctx.button(title(p), () => read(ctx, p, () => list(ctx, query, count)), ctx.main, 'notebook-choice');
      choice.setAttribute('aria-label', title(p));
      choice.id = 'notebook-choice-' + p.id;
      if (isFavourite(p)) { const star = ctx.node('span', '★ ', undefined); star.setAttribute('aria-hidden', 'true'); choice.prepend(star); }
    }
    if (found.length > count) ctx.button('Show more notebooks', () => list(ctx, query, count + 20));
    ctx.button('Delete notebooks', () => manageDeletion(ctx, query, count));
  }
  function manageDeletion(ctx, query = '', count = 20) {
    ctx.clear('Delete notebooks');
    const screen = ctx.main.firstChild;
    const selected = new Map();
    const found = ctx.records().filter(p => p.kind === 'notebook');
    const actions = ctx.node('div', undefined, ctx.main, 'actions');
    const boxes = [];
    const update = () => { remove.disabled = !selected.size; remove.textContent = selected.size ? 'Delete selected (' + selected.size + ')' : 'Delete selected'; };
    ctx.button('Select all', () => { for (const [box, p] of boxes) { box.checked = true; selected.set(p.id, p); } update(); }, actions);
    ctx.button('Clear selection', () => { for (const [box] of boxes) box.checked = false; selected.clear(); update(); }, actions);
    const remove = ctx.button('Delete selected', async () => {
      const chosen = [...selected.values()];
      if (!chosen.length || !await confirmDeletion(ctx, chosen)) return;
      remove.disabled = true;
      try { await ctx.purgeNotebooks(chosen); if (screen.isConnected) list(ctx, query, count); ctx.message('Selected notebooks permanently deleted.'); }
      catch (error) { ctx.message(error.message); remove.disabled = false; }
    }, actions); remove.disabled = true;
    for (const p of found) {
      const label = ctx.node('label', undefined, ctx.main, 'check-row');
      const box = ctx.node('input', undefined, label); box.type = 'checkbox'; ctx.node('span', title(p), label); boxes.push([box, p]);
      box.onchange = () => { if (box.checked) selected.set(p.id, p); else selected.delete(p.id); update(); };
    }
    if (!found.length) ctx.node('p', 'No notebooks to delete.', ctx.main);
  }
  function confirmDeletion(ctx, chosen) {
    return ctx.confirm('Permanently delete ' + (chosen.length === 1 ? 'this notebook?' : chosen.length + ' notebooks?') + '\n\n' + chosen.map(title).join('\n') + '\n\nTheir contents, earlier versions and unfinished changes will be removed from this app and the shared account. This cannot be undone. Other devices remove their copies when they reconnect. Previously exported files and service backups are separate copies.', { confirmLabel: 'Delete permanently', cancelLabel: 'Keep notebooks' });
  }
  async function deleteNotebook(ctx, p) {
    const screen = ctx.main.firstChild;
    if (!await confirmDeletion(ctx, [p])) return;
    if (!screen.isConnected || ctx.scopeAlive && !ctx.scopeAlive()) return;
    await ctx.purgeNotebooks([p]);
    if (screen.isConnected && (!ctx.scopeAlive || ctx.scopeAlive())) { list(ctx); ctx.message('Notebook permanently deleted.'); }
  }
  function read(ctx, payload, returnView = () => list(ctx), sectionIndex = null) {
    const p = records(ctx).find(r => r.id === payload.id) || payload, notebook = content(p);
    const sections = notebook.sections || [], overview = sectionIndex === null, reference = sectionIndex === 'reference';
    const sectionTitle = reference ? 'About this book' : sections[sectionIndex]?.name || sections[sectionIndex]?.title || 'Section';
    ctx.clear(overview ? title(p) : sectionTitle, p.id + ':' + (sectionIndex ?? 'contents'));
    if (!overview) ctx.node('p', title(p), ctx.main, 'notebook-name');
    const created = date(p);
    ctx.node('p', created === null ? 'Date unavailable' : new Date(created).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }), ctx.main, 'notebook-date');
    const options = ctx.node('details', undefined, ctx.main, 'notebook-options'); ctx.node('summary', 'Edit or delete notebook', options);
    const actions = ctx.node('div', undefined, options, 'actions');
    ctx.button('Edit notebook', () => edit(ctx, p), actions);
    ctx.shortcut && ctx.button('Add shortcut',()=>ctx.shortcut({type:'notebook',id:p.id,label:'Situation notebook'}),options);
    const favourite=ctx.button(isFavourite(p)?'★':'☆',async()=>{favourite.disabled=true;try{const latest=records(ctx).find(r=>r.id===p.id)||p,copy=M.clone(latest);copy.printFavourite=copy.favourite=!isFavourite(latest);const result=await ctx.save(copy,{base:latest.revision});if(accepted(result)&&favourite.isConnected){favourite.textContent=isFavourite(copy)?'★':'☆';favourite.setAttribute('aria-pressed',String(isFavourite(copy)));}}finally{favourite.disabled=false;}}, ctx.main,'favourite-star');favourite.setAttribute('aria-label','Favourite notebook');favourite.setAttribute('aria-pressed',String(isFavourite(p)));options.before(favourite);
    ctx.button('Delete notebook', () => deleteNotebook(ctx, p), actions);
    const navigation = ctx.node('details', undefined, ctx.main, 'notebook-contents'); navigation.open = sectionIndex === null; ctx.node('summary', 'Contents', navigation);
    const links = ctx.node('div', undefined, navigation, 'notebook-contents-links');
    if (notebook.frontMatter?.entityType === 'book') ctx.button('About this book', () => read(ctx, p, returnView, 'reference'), links);
    sections.forEach((section, i) => { if (!excludedSection(section)) ctx.button(section.name || section.title || 'Section ' + (i + 1), () => read(ctx, p, returnView, i), links); });
    if (overview) for (const text of [notebook.situation, notebook.context, notebook.details]) if (typeof text === 'string' && text.trim()) ctx.node('p', text, ctx.main, 'passage');
    const selected = overview ? sections : reference ? [] : sections.slice(sectionIndex, sectionIndex + 1);
    contents(ctx, { ...notebook, frontMatter: overview || reference ? notebook.frontMatter : undefined, sections: selected });
    if (!overview) ctx.button('Notebook contents', () => read(ctx, p, returnView));
  }
  function create(ctx, payload, draft) {
    let p = M.clone(draft?.payload || payload), base = draft?.base ?? payload.revision ?? 0, queue = Promise.resolve(), failure, busy = false, error, notice = '', screen;
    p.generation ||= { stage: content(p).sections?.length ? 'review' : 'input', lookup: false };
    p.generation.situation ??= content(p).situation || ''; p.generation.details ??= content(p).details || '';
    const current = () => screen?.isConnected && (!ctx.scopeAlive || ctx.scopeAlive());
    const retain = () => { p.text = p.name || content(p).title || p.generation?.situation || content(p).situation || 'Untitled notebook'; const copy = M.clone(p); queue = queue.catch(() => {}).then(() => ctx.rememberDraft(copy, base)).then(() => { failure = null; }, e => { failure = e; if (current()) error.textContent = 'This draft could not be saved. Keep the page open and retry.'; }); return queue; };
    const guard = () => { const token = ctx.screenToken?.(), previous = screen; return () => current() && screen === previous && (!ctx.screenToken || token === ctx.screenToken()); };
    const request = async (action, entity, selectedButton) => {
      if (busy) return; const visible = guard(); busy = true;
      const generationButtons = [...ctx.main.querySelectorAll('[data-generation-action]')];
      const originalLabel = selectedButton?.textContent;
      generationButtons.forEach(b => { b.disabled = true; });
      if (selectedButton) { selectedButton.textContent = action === 'detect' ? 'Checking details…' : entity?.type === 'book' ? 'Looking up book…' : 'Creating notebook…'; selectedButton.setAttribute('aria-busy', 'true'); }
      const progress = ctx.node('p', undefined, ctx.main, 'generation-progress'); progress.dataset.generationProgress = ''; progress.setAttribute('role', 'status');
      progress.textContent = 'Your request was received. ' + (action === 'detect' ? 'Checking the details…' : entity ? 'Looking up the confirmed details and creating your notebook…' : 'Creating your notebook…') + ' Please wait; you do not need to tap again.';
      try {
        await retain(); if (!visible() || failure) return;
        if (!navigator.onLine) { notice = 'No connection for a new notebook. Your situation and earlier results are kept.'; busy = false; render(); return; }
        const input = { action, situation: p.generation.situation, details: p.generation.details, ...(entity ? { entity, confirmed: true } : {}) };
        ctx.message(action === 'detect' ? 'Looking for a specific book, place or event…' : entity ? 'Looking up the confirmed details and creating your notebook…' : 'Creating your notebook…');
        const result = await ctx.generateSituation(input); if (!visible()) return;
        if (action === 'detect') {
          M.insist(result?.success === true && Array.isArray(result.entities) && result.entities.length <= 10 && result.entities.every(e => ['book', 'place', 'event', 'organization'].includes(e.type) && typeof e.name === 'string' && e.name.trim() && typeof e.description === 'string'), 'Invalid details response');
          p.generation.entities = M.clone(result.entities);
          if (!result.entities.length) { busy = false; return await request('generate'); }
          p.generation.stage = 'confirm';
        } else {
          // A second generation gets an independent draft; earlier results remain recoverable.
          const generatedEnvelope = validateGeneration(result);
          if (p.generation.hasResults) { p = { ...ctx.newPayload('notebook', 'notebooks', 'Untitled notebook'), generation: M.clone(p.generation) }; base = 0; }
          p.notebook = generatedEnvelope; const generated = content(p); generated.situation = input.situation; if (input.details) generated.details = input.details;
          p.name = p.notebook.title || generated.title || ''; p.generation.stage = 'review'; p.generation.hasResults = true;
        }
        notice = ''; await retain(); if (!visible() || failure) return; busy = false; render();
        ctx.message(p.generation.stage === 'confirm' ? 'Confirm the named detail before lookup.' : 'Notebook ready to review.');
      } catch { if (visible()) { notice = 'Notebook could not be generated. Your situation and earlier results are kept. Try again.'; busy = false; render(); } }
      finally { busy = false; generationButtons.forEach(b => { b.disabled = false; }); progress.remove(); if (selectedButton) { selectedButton.textContent = originalLabel; selectedButton.removeAttribute('aria-busy'); } }
    };
    function render() {
      const stage = p.generation.stage, nb = content(p);
      ctx.clear(stage === 'review' ? 'Review notebook' : stage === 'confirm' ? 'Confirm details' : 'Create notebook'); screen = ctx.main.firstChild;
      error = ctx.node('p', notice, ctx.main); error.dataset.generationError = ''; error.setAttribute('role', 'alert');
      const field = (labelText, value, update, multiline = false) => { const label = ctx.node('label', labelText, ctx.main), input = ctx.node(multiline ? 'textarea' : 'input', undefined, ctx.main); input.id = 'generation-' + labelText.toLowerCase().replace(/\W+/g, '-'); label.htmlFor = input.id; input.value = value || ''; input.oninput = () => { update(input.value); retain(); }; return input; };
      const action = (label, fn) => { const b = ctx.button(label, () => fn(b), ctx.main, 'primary'); b.dataset.generationAction = ''; b.disabled = busy; return b; };
      if (stage === 'input') {
        const picks = ctx.node('section', undefined, ctx.main); picks.dataset.situationPicks = 'true'; ctx.node('p', 'Pick a situation or describe your own:', picks);
        let situation, checkbox;
        for (const [name, text] of [['Book club', 'Book club meeting to discuss [book title]'], ['Doctor visit', 'Doctor appointment to discuss [your health concern]'], ['Restaurant', 'Dining at [restaurant name or type]'], ['Grocery shopping', 'Shopping at [store name or type]'], ['Art gallery / museum', 'Visit to [gallery or museum name]']]) ctx.button(name, () => { p.generation.situation = text; situation.value = text; if (name === 'Book club') { p.generation.lookup = true; checkbox.checked = true; } situation.focus(); const start = text.indexOf('['); situation.setSelectionRange(start, text.indexOf(']') + 1); retain(); }, picks);
        situation = field('Describe the situation', p.generation.situation, v => { p.generation.situation = v; }, true); situation.maxLength = 2000; situation.classList.add('situation-input');
        const optional = ctx.node('details', undefined, ctx.main); optional.open = !!p.generation.details; ctx.node('summary', 'Add context (optional)', optional);
        const context = field('Context (optional)', p.generation.details, v => { p.generation.details = v; }, true); context.maxLength = 10000; optional.append(context.previousElementSibling, context);
        const label = ctx.node('label', undefined, ctx.main, 'check-row'); checkbox = ctx.node('input', undefined, label); checkbox.type = 'checkbox'; checkbox.checked = p.generation.lookup; ctx.node('span', 'Look up specific details online', label); checkbox.onchange = () => { p.generation.lookup = checkbox.checked; retain(); };
        ctx.node('p', 'For a named book, place or event. You will confirm the name before online lookup.', ctx.main);
        action('Create My Notebook', button => { if (p.generation.situation.trim().length < 5 || /\[[^\]]+\]/.test(p.generation.situation)) { error.textContent = 'Describe the situation and replace any words in brackets.'; situation.focus(); return; } return request(p.generation.lookup ? 'detect' : 'generate', undefined, button); });
        if (p.generation.hasResults) ctx.button('Review earlier results', async () => { const visible = guard(); p.generation.stage = 'review'; await retain(); if (!failure && visible()) render(); });
        ctx.button('Write notebook myself', async () => { const visible = guard(); if (!p.generation.hasResults) { nb.situation = p.generation.situation; nb.details = p.generation.details; } delete p.generation; await retain(); if (!failure && visible()) edit(ctx, p, { base, payload: p }); });
      } else if (stage === 'confirm') {
        for (const entity of p.generation.entities || []) {
          ctx.node('p', 'We found a specific ' + (entity.type === 'organization' ? 'organisation' : entity.type), ctx.main);
          ctx.node('h2', entity.name, ctx.main); ctx.node('p', entity.description, ctx.main);
          if (entity.author) ctx.node('p', 'Author: ' + entity.author, ctx.main);
          ctx.node('p', 'Would you like vocabulary and details about this ' + (entity.type === 'organization' ? 'organisation' : entity.type) + '?', ctx.main);
          action(entity.type === 'book' ? 'Yes, look up this book' : 'Yes, look up ' + entity.name, button => request('generate', entity, button));
        }
        action('No, use general vocabulary', button => request('generate', undefined, button));
        ctx.button('Change situation', async () => { const visible = guard(); p.generation.stage = 'input'; await retain(); if (!failure && visible()) render(); });
      } else {
        contents(ctx, nb);
        ctx.button('Edit notebook contents', async () => { const visible = guard(); await retain(); if (!failure && visible()) edit(ctx, p, { base, payload: p }, edited => { p = edited; render(); }); });
        const name = field('Notebook name', p.name || nb.title, v => { p.name = v; nb.title = v; });
        action('Save notebook', async () => { const visible = guard(); if (!name.value.trim()) { error.textContent = 'Give this notebook a name before saving.'; name.focus(); return; } p.name = name.value.trim(); await retain(); if (!failure && visible()) { const result = await ctx.save(p, { base }); if (accepted(result) && visible()) read(ctx, p); } });
        ctx.button('Change situation', async () => { const visible = guard(); p.generation.stage = 'input'; await retain(); if (!failure && visible()) render(); });
      }
    }
    render();
  }
  function edit(ctx, payload, draft, review) {
    const source = draft || Object.values(ctx.drafts()).find(d => d.id === payload.id && d.state === 'draft');
    let edited = M.clone(source?.payload || payload), pending = Promise.resolve(), failure;
    const base = source?.base ?? payload.revision ?? 0;
    ctx.clear(base ? 'Edit notebook' : 'Create notebook');
    const screen = ctx.main.firstChild, notebook = content(edited), form = ctx.node('form', undefined, ctx.main);
    function remember() {
      edited.text = title(edited); const copy = M.clone(edited);
      pending = pending.catch(() => {}).then(() => ctx.rememberDraft(copy, base)).then(() => { failure = null; }, error => { failure = error; ctx.report(error); });
      return pending;
    }
    function field(parent, labelText, value, update, multiline = false) {
      const label = ctx.node('label', labelText, parent), input = ctx.node(multiline ? 'textarea' : 'input', undefined, parent);
      input.id = 'notebook-field-' + form.querySelectorAll('input,textarea').length; label.htmlFor = input.id;
      input.value = value || ''; input.oninput = () => { update(input.value); remember(); }; return input;
    }
    const name = field(form, 'Notebook name', edited.name || edited.notebook.title || notebook.title || '', value => { edited.name = value; edited.notebook.title = value; notebook.title = value; });
    field(form, 'Describe the situation', notebook.situation || '', value => { notebook.situation = value; }, true);
    field(form, 'Context (optional)', notebook.context || '', value => { notebook.context = value; }, true);
    function frontFields(parent, key, path) {
      const value = parent[key];
      if (typeof value === 'string') field(form, 'Front matter: ' + (path.join(' / ') || 'passage'), value, next => { parent[key] = next; }, true);
      else if (Array.isArray(value) || M.object(value)) for (const child of Object.keys(value)) if (!/guide|photo|alphabet|image|sources?|provenance/i.test(child)) frontFields(value, child, [...path, child]);
    }
    if (notebook.frontMatter !== undefined) frontFields(notebook, 'frontMatter', []);
    const area = ctx.node('section', undefined, form); notebook.sections ||= [];
    function sectionFields(section, index) {
      if (excludedSection(section)) return;
      const row = ctx.node('section', undefined, area); ctx.node('h2', 'Section ' + (index + 1), row);
      field(row, 'Section name', section.name || section.title || '', value => { if (section.name === undefined && section.title !== undefined) section.title = value; else section.name = value; });
      if (section.text !== undefined) field(row, 'Section passage', section.text, value => { section.text = value; }, true);
      if (section.context !== undefined) field(row, 'Section context', section.context, value => { section.context = value; }, true);
      for (const key of ['words', 'items', 'phrases', 'messages']) {
        (section[key] || []).forEach((item, i) => {
          const textKey = typeof item === 'string' ? null : ['text', 'word', 'message', 'phrase'].find(k => typeof item[k] === 'string');
          if (textKey === undefined) { ctx.node('p', 'This saved item needs its original editor. It is retained.', row); return; }
          field(row, key + ' ' + (i + 1), textKey === null ? item : item[textKey], value => { if (textKey === null) section[key][i] = value; else item[textKey] = value; }, key !== 'words');
          if (typeof item?.context === 'string') field(row, key + ' ' + (i + 1) + ' context', item.context, value => { item.context = value; }, true);
        });
        ctx.button('Add ' + (key === 'words' ? 'word' : key === 'items' ? 'item' : key === 'phrases' ? 'phrase' : 'message'), () => {
          (section[key] ||= []).push({ text: '' }); area.replaceChildren(); notebook.sections.forEach(sectionFields); remember();
        }, row);
      }
    }
    notebook.sections.forEach(sectionFields);
    ctx.button('Add section', () => { notebook.sections.push({ id: crypto.randomUUID(), name: '', words: [], messages: [] }); area.replaceChildren(); notebook.sections.forEach(sectionFields); remember(); }, form);
    const save = ctx.node('button', review ? 'Done editing' : 'Save notebook', form); save.type = 'submit';
    form.onsubmit = async event => {
      event.preventDefault(); save.disabled = true;
      try {
        await remember(); if (failure) throw failure;
        if (!screen.isConnected || ctx.scopeAlive && !ctx.scopeAlive()) return;
        if (review) { review(edited); return; }
        M.insist(name.value.trim(), 'Give this notebook a name before saving.');
        const result = await ctx.save(edited, { base });
        if (accepted(result) && ctx.main.contains(screen)) read(ctx, edited);
      } catch (error) { ctx.report(error); } finally { save.disabled = false; }
    };
  }
  return { validateGeneration, content, title, date, printOrder, printChoices, records, list, read, edit, create };
});
