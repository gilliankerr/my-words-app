(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('./model') : root.NextModel);
  if (typeof module === 'object') module.exports = api;
  else root.NextBook = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  const { clone, canonical, insist, object } = M;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const label = key => String(key).replace(/[_-]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
  const at = (value, path) => path.reduce((v, key) => v?.[key], value);
  const latest = record => record.revisions.find(r => r.number === record.current);
  function currentEdition(workspace) {
    return { ...clone(workspace.edition), payloads: Object.fromEntries(Object.values(workspace.records).map(r => [r.id, clone(latest(r).payload)])) };
  }
  function wording(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value) && value.every(v => typeof v === 'string')) return value.join('\n');
    if (!object(value)) return '';
    if (typeof value.text === 'string') return value.text;
    return Object.entries(value).filter(([k, v]) => typeof v === 'string' && !['id', 'created_at', 'updated_at', 'createdAt', 'updatedAt', 'type', 'kind'].includes(k))
      .map(([k, v]) => k === 'name' ? v : label(k) + ': ' + v).join('\n');
  }
  function guideText(guide) {
    return (guide.content || []).map(b => b.type === 'guide-section' ? [b.subtitle, ...(b.items || []).map(s => '• ' + s)].join('\n') : b.text || '').join('\n\n');
  }
  function orderPayload(category, items = []) {
    return { id: 'order:' + category, kind: 'order', category, text: category === 'sections' ? 'Book section order' : 'Word order', items: clone(items), binding: { source: 'order', category }, tombstone: false };
  }
  function addition(kind, category, text, id, name) {
    insist(uuid.test(id) && ['phrase', 'page', 'shopping', 'note', 'person', 'group', 'notebook', 'preference'].includes(kind), 'Invalid new item identity');
    return { id, kind, category, text, ...(name ? { name } : {}), binding: { source: 'addition', category }, hidden: false, highlight: false, tombstone: false, ...(kind === 'shopping' ? { checked: false } : {}) };
  }
  function sources(content) {
    const result = [];
    function add(path, category, name, kind = 'page', text) {
      const value = at(content, path);
      if (value === undefined) return;
      text = text === undefined ? wording(value) : text;
      if (!text.trim()) return;
      const sourceKey = object(value) && value.id !== undefined ? [...path.slice(0, -1), '@' + value.id] : path;
      const id = 'source:' + sourceKey.map(v => encodeURIComponent(v)).join('/');
      insist(!result.some(p => p.id === id), 'Duplicate source identity needs review');
      result.push({ id, kind, category, name, text, original: clone(value), binding: { source: 'content', path: clone(path), fingerprint: canonical(value) },
        hidden: !!value?.hidden, tombstone: !!value?.tombstone, highlight: !!value?.highlight, archived: !!value?.archived });
    }
    for (const [category, words] of Object.entries(content.custom)) words.forEach((w, i) => add(['custom', category, i], category, w.text, 'phrase'));
    (content.pages || []).forEach((p, i) => add(['pages', i], 'personal', p.name || 'Personal page'));
    (content.notebooks || []).forEach((n, i) => {
      if (!n) return;
      add(['notebooks', i], 'notebooks', n.title || n.data?.title || 'Untitled notebook', 'notebook', n.title || n.data?.title || 'Untitled notebook');
      result[result.length - 1].notebook = clone(n);
    });
    content.contacts.forEach((p, i) => add(['contacts', i], 'personal', p.name || 'Contact'));
    content.notes.forEach((p, i) => add(['notes', i], 'personal', p.title || 'Notes'));
    for (const key of Object.keys(content.templateFields || {})) {
      const pageId = content.templatePageBindings?.[key];
      const placed = (content.pages || []).some(page => page.id === pageId && page.sourceFields?.some(field => field.key === key));
      if (!placed) add(['templateFields', key], 'personal', label(key));
    }
    for (const key of Object.keys(content.notebook.frontMatter)) if (key !== 'title' && typeof content.notebook.frontMatter[key] === 'string') add(['notebook', 'frontMatter', key], 'personal', label(key));
    if (content.notebook.frontMatter.title) add(['notebook', 'frontMatter', 'title'], 'front', 'Book title');
    content.rescue.forEach((p, i) => add(['rescue', i], 'rescue', 'Rescue words', 'phrase'));
    (content.notebook.sections || []).forEach((s, n) => {
      const field = s.words ? 'words' : 'phrases';
      (s[field] || []).forEach((p, i) => add(['notebook', 'sections', n, field, i], 'notebook:' + n, s.name || 'Notebook words', 'phrase'));
      if (s.text) add(['notebook', 'sections', n, 'text'], 'personal', s.name || 'Notebook passage');
    });
    content.savedGroups.forEach((s, n) => (s.words || []).forEach((p, i) => add(['savedGroups', n, 'words', i], 'group:' + s.id, s.name || 'Saved word group', 'phrase')));
    for (const [key, value] of Object.entries(content.notebook.content || {})) if (typeof value === 'string' || (Array.isArray(value) && value.every(s => typeof s === 'string'))) add(['notebook', 'content', key], 'personal', label(key));
    add(['guide'], 'guide', content.guide.name || 'Communication Partner Guide', 'page', guideText(content.guide));
    return result;
  }
  function checkBinding(payload, edition, master, hash) {
    const b = payload.binding;
    if (!b) return; // Existing standalone personal passages are retained.
    if (b.masterHash) insist(M.bindingMatches(b, master, hash), 'Source binding needs review; saved wording retained.');
    else if (b.source === 'content') insist(Array.isArray(b.path) && canonical(at(edition.content, b.path)) === b.fingerprint, 'Source binding needs review; saved wording retained.');
    else if (b.source === 'addition') insist(b.category === payload.category, 'Invalid addition binding');
    else insist(b.source === 'order' && b.category === payload.category, 'Unknown source binding needs review');
  }
  function catalogue(edition, master, hash) {
    insist(edition.master.hash === hash && edition.master.version === master.version, 'Master binding unavailable; retain the saved edition.');
    const overlays = Object.values(edition.payloads);
    overlays.forEach(p => checkBinding(p, edition, master, hash));
    const byBinding = new Map();
    for (const p of overlays) {
      const key = canonical(p.binding);
      if (!byBinding.has(key)) byBinding.set(key, []);
      byBinding.get(key).push(p);
    }
    const result = [];
    for (const c of master.categories) c.words.forEach((w, i) => {
      const binding = { masterVersion: master.version, masterHash: hash, category: c.id, locator: i, fingerprint: canonical(w) };
      const saved = byBinding.get(canonical(binding)) || [];
      insist(saved.length <= 1, 'Duplicate word bindings need review');
      result.push({ ...clone(w), id: 'word:' + c.id + ':' + i + ':' + hash, kind: 'phrase', category: c.id, name: c.name, binding, original: clone(w), hidden: (edition.content.hidden[c.id] || []).includes(i), highlight: false, tombstone: false, ...clone(saved[0] || {}), category: c.id });
    });
    for (const p of sources(edition.content)) {
      const saved = byBinding.get(canonical(p.binding)) || [];
      insist(saved.length <= 1, 'Duplicate source bindings need review');
      result.push({ ...p, ...clone(saved[0] || {}) });
    }
    const included = new Set(result.map(p => p.id));
    for (const p of overlays) if (!included.has(p.id)) { result.push({ category: p.kind === 'page' ? 'personal' : p.binding?.category, ...clone(p) }); included.add(p.id); }
    return result;
  }
  function baseline(workspace, id, master, hash) {
    const blank = { ...workspace.edition, content: workspace.content, payloads: {} };
    const payload = catalogue(blank, master, hash).find(p => p.id === id);
    return payload ? { id, current: 1, revisions: [{ number: 1, base: 0, payload, author: workspace.owner, at: workspace.edition.at, operation: 'source' }] } : null;
  }
  function sortItems(items, order) {
    const positions = new Map((order || []).map((id, i) => [id, i]));
    return items.sort((a, b) => (positions.get(a.id) ?? Infinity) - (positions.get(b.id) ?? Infinity));
  }
  function project(edition, master, hash, includeHidden = false) {
    const items = catalogue(edition, master, hash);
    const visible = p => includeHidden || (!p.hidden && !p.tombstone && !p.archived);
    const orders = items.filter(p => p.kind === 'order' && !p.tombstone);
    const order = category => orders.find(p => p.category === category)?.items;
    const vocabulary = master.categories.map(c => ({ ...clone(c), words: sortItems(items.filter(p => p.kind === 'phrase' && p.category === c.id && visible(p)), order(c.id)) }));
    const sectionOrder = order('sections') || edition.content.order;
    sortItems(vocabulary, sectionOrder);
    const pages = sortItems(items.filter(p => ['page', 'note', 'person'].includes(p.kind) && p.category !== 'guide' && visible(p)), order('personal'));
    const extra = [
      ...(edition.content.notebook.sections || []).flatMap((s, i) => s.words || s.phrases ? [{ id: 'notebook:' + i, name: s.name || 'Notebook words', words: [] }] : []),
      ...edition.content.savedGroups.map(g => ({ id: 'group:' + g.id, name: g.name || 'Saved word group', words: [] }))
    ];
    for (const p of items.filter(p => p.kind === 'phrase' && /^(notebook:|group:)/.test(p.category) && visible(p))) {
      let section = extra.find(s => s.id === p.category);
      if (!section) { section = { id: p.category, name: p.name, words: [] }; extra.push(section); }
      section.words.push(p);
    }
    for (const s of extra) sortItems(s.words, order(s.id));
    for (const p of items.filter(p => p.kind === 'group' && visible(p))) extra.push({ id: 'group:' + p.id, name: p.name || p.text, words: clone(p.words || []) });
    const guidePayload = items.find(p => p.category === 'guide');
    const guide = clone(edition.content.guide);
    if (guidePayload && edition.payloads[guidePayload.id]) { guide.name = guidePayload.name; guide.content = [{ type: 'intro-paragraph', text: guidePayload.text }]; }
    return { vocabulary, pages, extra, guide, title: items.find(p => p.category === 'front')?.text || edition.content.notebook.title || 'Communication book', rescue: items.filter(p => p.category === 'rescue' && visible(p)), items };
  }
  function communicationCategories(book) {
    const categories = clone(book.vocabulary);
    const family = categories.find(c => c.id === 'family'), people = categories.find(c => c.id === 'people');
    return categories.filter(c => !['notes', 'shopping-list'].includes(c.id) && !(c.id === 'people' && family)).map(c => {
      if (c.id === 'phrases') for (const repair of book.rescue) if (!c.words.some(w => w.text === repair.text)) c.words.push(clone(repair));
      if (c !== family || !people) return c;
      const unique = new Map();
      for (const word of [...people.words, ...family.words]) {
        const key = word.text.toLocaleLowerCase('en-CA') + '|' + (word.context || '');
        if (unique.has(key)) unique.get(key).highlight ||= word.highlight;
        else unique.set(key, clone(word));
      }
      return { ...c, name: 'People words', words: [...unique.values()] };
    });
  }
  function validatePayload(payload, options = {}) {
    insist(object(payload) && typeof payload.id === 'string' && typeof payload.text === 'string' && payload.text.trim() && payload.text.length <= 40000, 'Enter wording before saving.');
    M.rejectAuthority(payload);
    for (const key of ['highlight', 'hidden', 'tombstone', 'checked', 'archived']) insist(payload[key] === undefined || typeof payload[key] === 'boolean', 'Invalid item state');
    if (payload.kind === 'order') insist(Array.isArray(payload.items) && payload.items.length <= 10000 && payload.items.every(s => typeof s === 'string') && new Set(payload.items).size === payload.items.length, 'Invalid order');
    if (payload.kind === 'group') {
      const unfinished = options.draft === true && object(payload.rapid) && typeof payload.rapid.entry === 'string' && payload.rapid.entry.length <= 40000 && typeof payload.rapid.keywords === 'string' && payload.rapid.keywords.length <= 40000 && payload.rapid.originalWordCount === 0 && Array.isArray(payload.rapid.clueHistory) && payload.rapid.clueHistory.length === 0 && Array.isArray(payload.selection) && payload.selection.length === 0;
      insist(payload.category === 'quick-words' && Array.isArray(payload.words) && (payload.words.length > 0 || unfinished) && payload.words.length <= 2000 && payload.words.every(w => object(w) && typeof w.text === 'string' && w.text.trim() && w.text.length <= 40000), 'Invalid saved word group');
      insist(payload.selection === undefined || Array.isArray(payload.selection) && new Set(payload.selection).size === payload.selection.length && payload.selection.every(n => Number.isInteger(n) && n >= 0 && n < payload.words.length), 'Invalid group selection');
    }
    if (payload.kind === 'person') insist(payload.category === 'people' && (payload.groups === undefined || Array.isArray(payload.groups) && payload.groups.every(s => typeof s === 'string')) && (payload.aliases === undefined || Array.isArray(payload.aliases) && payload.aliases.every(s => typeof s === 'string')), 'Invalid person details');
    if (payload.kind === 'notebook') {
      const envelope = payload.notebook, notebook = envelope?.data || envelope;
      insist(payload.category === 'notebooks' && object(envelope) && object(notebook) && (notebook.sections === undefined || Array.isArray(notebook.sections)), 'Invalid complete notebook');
    }
    if (payload.kind === 'note') insist(payload.category === 'notes', 'Invalid note scope');
    if (payload.kind === 'preference') insist(['display', 'dictionary', 'home-slot:1', 'home-slot:2', 'shortcuts', 'book-highlights'].includes(payload.category), 'Invalid preference scope');
    if (payload.kind === 'preference' && payload.category === 'shortcuts') {
      const validTargets = targets => Array.isArray(targets) && targets.length <= 500 && targets.every(t => object(t) && ['destination', 'note', 'person', 'notebook', 'group', 'picture', 'book', 'shopping', 'personal'].includes(t.type) && typeof t.id === 'string' && t.id.length > 0 && t.id.length <= 40000 && typeof t.label === 'string' && t.label.length <= 40000 && (t.type !== 'destination' || ['quick-words','people','personal-information','notes','icons','book','notebooks','shopping'].includes(t.id))) && new Set(targets.map(t => t.type + ':' + t.id)).size === targets.length;
      insist(validTargets(payload.targets) && (payload.undoTargets === undefined || validTargets(payload.undoTargets)), 'Invalid shortcut choices');
    }
    if (payload.kind === 'preference' && payload.category === 'book-highlights') insist(object(payload.choices) && Object.entries(payload.choices).every(([id, selected]) => id.length > 0 && typeof selected === 'boolean'), 'Invalid book highlights');
    return payload;
  }
  return { catalogue, baseline, project, communicationCategories, sources, wording, guideText, addition, orderPayload, currentEdition, latest, sortItems, validatePayload, checkBinding, uuid };
});
