(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('./model') : root.NextModel, typeof module === 'object' ? require('./book-records') : root.NextBook);
  if (typeof module === 'object') module.exports = api; else root.NextPrintAdapter = api;
})(globalThis, function (M, B) {
  'use strict';
  function coverage(edition, master, hash, options = {}) {
    const items = B.catalogue(edition, master, hash), included = [], omitted = [], blocked = [];
    for (const p of items) {
      if (p.kind === 'notebook') { omitted.push({ ...p, reason: 'Separate situation booklet' }); continue; }
      if (options.compactCommunicationBook && p.category === 'guide') { omitted.push({ ...p, reason: 'Excluded by owner' }); continue; }
      if (options.compactCommunicationBook && (['page', 'note', 'person', 'group'].includes(p.kind) && p.category !== 'front' || ['notes', 'shopping-list'].includes(p.category) || /^(notebook:|group:)/.test(p.category))) { omitted.push({ ...p, reason: 'Separate app section' }); continue; }
      if (p.kind === 'order' || p.kind === 'shopping') continue;
      if (p.kind === 'preference') { omitted.push({ ...p, reason: 'Screen navigation and display choices' }); continue; }
      if (!['phrase', 'page', 'note', 'person', 'group'].includes(p.kind)) { blocked.push({ path: 'payloads.' + p.id, reason: 'Saved item kind needs a print mapping' }); continue; }
      if (p.hidden || p.tombstone || p.archived) omitted.push({ ...p, reason: p.tombstone ? 'Removed' : p.archived ? 'Archived' : 'Hidden' }); else included.push(p);
    }
    const paths = items.filter(p => p.binding?.source === 'content').map(p => ({ path: p.binding.path.join('.'), p }));
    const placedField = key => {
      const pages = (edition.content.pages || []).filter(page => page.id === edition.content.templatePageBindings?.[key]);
      return pages.length === 1 && typeof pages[0].text === 'string' && pages[0].text.trim() && pages[0].sourceFields?.filter(field => field.key === key && M.canonical(field.value) === M.canonical(edition.content.templateFields?.[key])).length === 1;
    };
    const metadata = new Set(['id', 'name', 'title', 'context', 'usage', 'created_at', 'updated_at', 'createdAt', 'updatedAt', 'kind']);
    function walk(value, path, mapped) {
      if (['preferences', 'routes', 'links', 'hidden', 'order', 'notebooks', 'legacySources', 'legacyMapping'].includes(path[0]) || options.compactCommunicationBook && path[0] === 'guide') return;
      if (path.at(-1) === 'legacySource' && M.object(value)) return;
      if (path[0] === 'pages' && path[2] === 'sourceFields') return;
      if (path[0] === 'templateFields' && placedField(path[1])) return;
      if (path[0] === 'templatePageBindings') {
        if (path.length === 1) { for (const key of Object.keys(value)) if (!placedField(key)) blocked.push({ path: 'templatePageBindings.' + key, reason: 'Personal-page source binding needs a print mapping' }); }
        return;
      }
      const key = path.join('.'); const source = paths.find(p => p.path === key); if (source) mapped = source.p;
      if (Array.isArray(value)) { value.forEach((v, i) => walk(v, [...path, i], mapped)); return; }
      if (M.object(value)) { Object.entries(value).forEach(([k, v]) => walk(v, [...path, k], mapped)); return; }
      if (typeof value !== 'string' || !value.trim()) return;
      const field = path.at(-1);
      if (field === 'type') { if (!['partner-guide', 'intro-paragraph', 'closing-text', 'guide-section'].includes(value)) blocked.push({ path: key, reason: 'Content type needs a print mapping' }); return; }
      if (metadata.has(field) || /^guide\.content\.\d+\.(text|subtitle|items\.\d+)$/.test(key)) return;
      if (mapped) {
        const sourcePath = mapped.binding.path.join('.');
        const relative = key.slice(sourcePath.length + 1).split('.');
        if (mapped.binding.path[0] === 'contacts' && ['groups', 'aliases'].includes(relative[0]) && relative.length === 2 && Array.isArray(mapped.original[relative[0]])) return;
        if (key === sourcePath || relative.length === 1 && (field === 'text' || B.wording(mapped.original).includes(value)) || Array.isArray(mapped.original) && relative.length === 1) return;
      }
      blocked.push({ path: key, reason: 'Saved content needs a print mapping' });
    }
    walk(edition.content, [], null);
    const payloadMetadata = new Set(['id', 'kind', 'category', 'text', 'name', 'title', 'binding', 'original', 'originals', 'future', 'usage', 'context', 'hidden', 'highlight', 'tombstone', 'archived', 'items', 'favourite', 'favouriteOrder', 'deletedFromArchived', 'updatedAt', 'createdAt', 'selection', 'composition', 'cue', 'provenance', 'situation', 'words', 'groups', 'aliases']);
    function extraText(value, path) {
      if (typeof value === 'string' && value.trim()) blocked.push({ path: path.join('.'), reason: 'Saved envelope content needs a print mapping' });
      else if (Array.isArray(value) || M.object(value)) Object.entries(value).forEach(([key, v]) => extraText(v, [...path, key]));
    }
    for (const p of Object.values(edition.payloads)) if (!['shopping', 'preference', 'notebook'].includes(p.kind) && !(options.compactCommunicationBook && p.category === 'guide') && !p.hidden && !p.archived && !p.tombstone) {
      for (const [key, value] of Object.entries(p)) if (!payloadMetadata.has(key)) extraText(value, ['payloads', p.id, key]);
      if (p.kind === 'group') for (const [index, word] of (p.words || []).entries()) for (const [key, value] of Object.entries(word)) if (!['text', 'source', 'original', 'future', 'usage', 'id', 'binding', 'kind', 'category', 'name', 'hidden', 'highlight', 'tombstone', 'archived'].includes(key)) extraText(value, ['payloads', p.id, 'words', index, key]);
    }
    const guide = items.find(p => p.category === 'guide');
    if (!options.compactCommunicationBook && (!guide || guide.hidden || guide.tombstone || guide.archived)) blocked.push({ path: 'guide', reason: 'The Communication Partner Guide must be included' });
    if (items.find(p => p.category === 'front')?.hidden) blocked.push({ path: 'notebook.frontMatter.title', reason: 'The book title must be included' });
    if (edition.content.diagrams.length) blocked.push({ path: 'diagrams', reason: 'Diagram layout needs a print mapping' });
    return { included, omitted, blocked };
  }
  const communicationCategories = (book, options = {}) => options.compactCommunicationBook ? B.communicationCategories(book) : [...book.vocabulary, ...book.extra];
  function project(edition, master, hash, options = {}) {
    const inventory = coverage(edition, master, hash, options);
    M.insist(!inventory.blocked.length, 'Print mapping needed: ' + inventory.blocked.map(b => b.path).join(', ') + '. Saved content is retained.');
    const book = B.project(edition, master, hash), printRoot = document.createElement('div');
    const section = (id, title) => { const s = document.createElement('section'); s.id = id; s.className = 'section'; const h = document.createElement('h2'); h.className = 'section-header'; h.textContent = title; s.append(h); printRoot.append(s); return s; };
    function phrases(parent, words, passage = false, label = '') {
      const sub = document.createElement('div'); sub.className = 'subsection'; const list = document.createElement('ul'); list.className = 'phrase-list';
      if (label) { const h = document.createElement('h3'); h.className = 'subsection-header'; h.textContent = label; sub.append(h); }
      for (const word of words) { const li = document.createElement('li'); const context = word.context ?? word.original?.context; li.textContent = typeof context === 'string' && context.trim() && !word.text.includes(context) ? word.text + '\n' + context : word.text; li.dataset.highlight = word.highlight ? 'true' : 'false'; li.dataset.passage = passage ? 'true' : 'false'; list.append(li); }
      sub.append(list); parent.append(sub);
    }
    for (const page of options.compactCommunicationBook ? [] : book.pages) {
      const person = page.kind === 'person' || page.binding?.path?.[0] === 'contacts';
      const extra = person ? [page.context, ...(page.aliases || page.original?.aliases || []), ...(page.groups || page.original?.groups || [])].filter(t => typeof t === 'string' && t && !page.text.includes(t)) : [];
      phrases(section('personal-' + page.id, page.title || page.name || 'Personal information'), [{ ...page, text: [page.text, ...extra].join('\n') }], true);
    }
    for (const category of communicationCategories(book, options)) {
      const words = [...category.words];
      if (words.length) {
        const parent = section(category.id, category.name), groups = [];
        for (const word of words) {
          const usage = word.usage ?? word.original?.usage ?? (word.binding?.path?.[0] === 'custom' ? 'Personal words' : '');
          const label = typeof usage === 'string' ? usage : Array.isArray(usage) ? usage.join(' · ') : '';
          if (groups.at(-1)?.label !== label) groups.push({ label, words: [] });
          groups.at(-1).words.push(word);
        }
        for (const group of groups) phrases(parent, group.words, false, group.label);
      }
    }
    if (options.shopping) phrases(section('trip-shopping', 'Shopping list — tick when bought'), options.shopping.items.map(p => ({ text: '□ ' + p.text })), true);
    return printRoot;
  }
  async function build(edition, master, hash, format = 'booklet', options = {}) {
    M.insist(['letter', 'a5', 'booklet'].includes(format), 'Unknown print format');
    const frozen = M.clone(edition), frozenOptions = M.clone(options), book = B.project(frozen, master, hash);
    const generator = new ReferenceLibraryPDF(format === 'booklet' ? 'letter' : format, { compact: frozenOptions.compactCommunicationBook === true, tableOfContents: frozenOptions.compactCommunicationBook === true, printRoot: project(frozen, master, hash, frozenOptions), guide: book.guide, excludeGuide: frozenOptions.compactCommunicationBook === true, excludeRescueHeading: frozenOptions.compactCommunicationBook === true, guideHighlight: !!book.items.find(p => p.category === 'guide')?.highlight, title: book.title, titleHighlight: !!book.items.find(p => p.category === 'front')?.highlight, revisedDate: frozen.at, noNetwork: true, editionLabel: frozen.id, rescue: frozenOptions.compactCommunicationBook ? [] : book.rescue.map(p => ({ text: p.text, highlight: p.highlight })), imposer: BookletImposer });
    const pdf = format === 'booklet' ? await generator.generateBookletFromDOM() : await generator.generateFromDOM();
    pdf.setProperties({ title: book.title, subject: 'Saved communication book: ' + frozen.id });
    return { pdf, edition: frozen, options: frozenOptions, format, logicalPages: generator.totalPages || generator.currentPage, pages: pdf.getNumberOfPages(), sheets: format === 'booklet' ? pdf.getNumberOfPages() / 2 : pdf.getNumberOfPages(), inventory: coverage(frozen, master, hash, frozenOptions) };
  }
  async function print(edition, master, hash, format, options) { const result = await build(edition, master, hash, format, options); result.pdf.save(`fictional-${format}-${edition.id}.pdf`); return result.pdf; }
  function notebookPrintModel(payload) {
    const envelope = M.clone(payload.notebook), notebook = envelope?.data || envelope;
    M.insist(M.object(notebook) && Array.isArray(notebook.sections) && notebook.sections.length, 'Save at least one notebook section before printing.');
    const rootKeys = new Set(['title', 'name', 'situation', 'context', 'details', 'frontMatter', 'lookup', 'sections', 'id', 'createdAt', 'created_at', 'updatedAt', 'updated_at', 'future', 'original', 'provenance', 'type', 'situationType', 'templateUsed']);
    if (envelope.data) M.insist(Object.keys(envelope).every(key => ['data', 'id', 'title', 'name', 'situation', 'context', 'details', 'createdAt', 'created_at', 'updatedAt', 'updated_at', 'future', 'original', 'provenance'].includes(key)), 'This notebook envelope needs a complete print mapping.');
    for (const source of [envelope, notebook]) for (const key of ['situation', 'context', 'details']) M.insist(source[key] === undefined || source[key] === null || typeof source[key] === 'string', 'This notebook context needs a print mapping.');
    const legacy = M.object(notebook.legacyRow) && M.object(notebook.content) && M.object(notebook.legacyRow.content);
    if (legacy) {
      // The mapper exposes current sections beside the immutable full database row.
      // Retained duplicate source content must be an exact known mirror, not a
      // catch-all permission to discard an arbitrary meaningful content field.
      const mirror = notebook.content;
      M.insist(Object.keys(mirror).every(key => ['sections', 'situationType'].includes(key)) &&
        (M.canonical(mirror) === M.canonical(notebook.legacyRow.content) || M.canonical(mirror) === M.canonical({ sections: notebook.sections, ...(notebook.situationType !== undefined ? { situationType: notebook.situationType } : {}) })), 'This notebook content needs a complete print mapping.');
      for (const key of ['user_id', 'template_used', 'content', 'is_edited', 'local_id', 'sync_version', 'legacyRow']) rootKeys.add(key);
    }
    M.insist(Object.keys(notebook).every(key => rootKeys.has(key)), 'This notebook has additional content that needs a print mapping. The full saved notebook is retained.');
    if (notebook.lookup) {
      const lookup = notebook.lookup;
      M.insist(M.object(lookup) && Object.keys(lookup).every(k => ['entity', 'query', 'context', 'annotations', 'confirmed', 'future', 'original'].includes(k)) && M.object(lookup.entity) && typeof lookup.context === 'string' && (lookup.query === undefined || typeof lookup.query === 'string') && Array.isArray(lookup.annotations) && lookup.annotations.every(a => M.object(a) && M.object(a.url_citation) && typeof a.url_citation.url === 'string' && /^https?:\/\//.test(a.url_citation.url) && (a.url_citation.title === undefined || typeof a.url_citation.title === 'string')), 'This notebook lookup evidence needs a complete print mapping.');
    }
    const known = new Set(['id', 'name', 'title', 'type', 'words', 'items', 'phrases', 'messages', 'text', 'context', 'description', 'future', 'original', 'hidden', 'archived', 'tombstone', 'fontSizes']);
    notebook.sections = notebook.sections.filter(saved => {
      M.insist(M.object(saved), 'This notebook section needs a print mapping.');
      const excluded = [saved.type, saved.id, saved.name, saved.title].some(value => typeof value === 'string' && /^(?:communication partner guide|partner guide|guide|alphabet(?: grid)?|spelling grid)$/i.test(value.replace(/[-_]/g, ' ').trim()));
      if (excluded || saved.hidden || saved.archived || saved.tombstone) return false;
      const modernTypes = ['word-grid', 'phrase-list', 'text', 'words', 'phrases', 'messages', 'discussion', 'general', 'vocabulary', 'communication-repair', 'pointable-vocabulary', 'nonfiction-events-and-actions-vocabulary', 'discussion-phrases', 'discussion-questions', 'discussion-choices', 'passage-sharing', 'discussion-leadership', 'family-and-friends-conversation'];
      M.insist(!saved.type || modernTypes.includes(saved.type) || legacy && /^[a-z][a-z0-9-]*$/.test(saved.type) && (Array.isArray(saved.words) || Array.isArray(saved.items)), 'This notebook section type needs a print mapping.');
      M.insist(Object.entries(saved).every(([key, value]) => known.has(key) || value === null || value === undefined), 'This notebook section needs a complete print mapping. Saved content is retained.');
      for (const key of ['context', 'description', 'text']) M.insist(saved[key] === undefined || saved[key] === null || typeof saved[key] === 'string', 'This notebook passage needs a print mapping.');
      M.insist(saved.fontSizes === undefined || M.object(saved.fontSizes) && Object.values(saved.fontSizes).every(value => typeof value === 'number' && Number.isFinite(value)), 'This notebook font information needs a print mapping.');
      for (const key of ['words', 'items', 'phrases', 'messages']) {
        M.insist(saved[key] === undefined || Array.isArray(saved[key]), 'This notebook list needs a print mapping.');
        for (const item of saved[key] || []) {
          M.insist(typeof item === 'string' || M.object(item) && Object.keys(item).every(key => ['text', 'word', 'message', 'phrase', 'id', 'usage', 'context', 'highlight', 'future', 'original', 'source', 'binding'].includes(key)), 'This notebook item has additional content that needs a print mapping.');
          M.insist(typeof (typeof item === 'string' ? item : item.text || item.word || item.message || item.phrase) === 'string', 'This notebook item needs a print mapping.');
          if (M.object(item)) {
            M.insist(item.context === undefined || typeof item.context === 'string', 'This notebook context needs a print mapping.');
            const aliases = ['text', 'word', 'message', 'phrase'].filter(key => item[key] !== undefined);
            M.insist(aliases.every(key => typeof item[key] === 'string') && new Set(aliases.map(key => item[key]).filter(Boolean)).size <= 1, 'This notebook wording needs a complete print mapping.');
            M.insist(item.usage === undefined || typeof item.usage === 'string' || Array.isArray(item.usage) && item.usage.every(value => typeof value === 'string'), 'This notebook usage needs a print mapping.');
          }
        }
      }
      return true;
    });
    return notebook;
  }
  async function buildNotebook(payload) {
    const frozen = M.clone(payload), envelope = frozen.notebook, notebook = notebookPrintModel(frozen);
    const printRoot = document.createElement('div');
    function section(title) {
      const row = document.createElement('section'); row.className = 'section'; row.id = 'notebook-section-' + printRoot.children.length;
      const heading = document.createElement('h2'); heading.className = 'section-header'; heading.textContent = title; row.append(heading); printRoot.append(row); return row;
    }
    function wording(parent, text, passage, highlight = false) {
      M.insist(typeof text === 'string', 'This notebook item needs a print mapping. The complete saved notebook is retained.');
      const sub = document.createElement('div'); sub.className = 'subsection';
      const list = document.createElement('ul'); list.className = 'phrase-list';
      const item = document.createElement('li'); item.textContent = text; item.dataset.passage = String(passage); if (highlight) item.dataset.highlight = 'true'; list.append(item); sub.append(list); parent.append(sub);
    }
    const context = [envelope.situation, envelope.context, envelope.details, notebook.situation, notebook.context, notebook.details].filter(t => typeof t === 'string' && t.trim());
    if (context.length) { const row = section('Context'); for (const text of [...new Set(context)]) wording(row, text, true); }
    const front = notebook.frontMatter || {};
    if (M.object(front.content) && front.entityType === 'book') {
      M.insist(Object.keys(front).every(k => ['content', 'entityType', 'entityName', 'future', 'original', 'provenance'].includes(k)), 'This notebook front matter needs a complete print mapping.');
      const labels = { title: 'Title', author: 'Author', summary: 'Summary', mainCharacters: 'People and characters', themes: 'Themes', discussionStarters: 'Discussion starters' };
      const orderedKeys = [...Object.keys(labels).filter(key => Object.prototype.hasOwnProperty.call(front.content, key)), ...Object.keys(front.content).filter(key => !Object.prototype.hasOwnProperty.call(labels, key))];
      for (const key of orderedKeys) {
        const value = front.content[key];
        if (['future', 'original', 'provenance'].includes(key)) continue;
        M.insist(typeof value === 'string' || Array.isArray(value) && value.every(s => typeof s === 'string'), 'This book reference field needs a complete print mapping.');
        const row = section(labels[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2'));
        for (const text of Array.isArray(value) ? value : [value]) if (text.trim()) wording(row, text, true);
      }
    } else {
      const fields = Object.entries(front).filter(([key, value]) => key !== 'title' && typeof value === 'string' && value.trim());
      M.insist(Object.entries(front).every(([key, value]) => ['future', 'original', 'provenance'].includes(key) || typeof value === 'string' || value === null), 'This notebook front matter needs a print mapping. Saved content is retained.');
      if (fields.length) { const row = section('About this notebook'); for (const [key, value] of fields) wording(row, key.replace(/([a-z])([A-Z])/g, '$1 $2') + ': ' + value, true); }
    }
    for (const saved of notebook.sections) {
      const row = section(saved.name || saved.title || 'Section');
      for (const text of [saved.context, saved.description, saved.text]) if (text !== undefined && text !== null) wording(row, text, true);
      const pointableItems = ['pointable-vocabulary', 'nonfiction-events-and-actions-vocabulary'].includes(saved.type);
      const wordEntries = [...(saved.words || []), ...(pointableItems ? saved.items || [] : [])];
      if (wordEntries.length) {
        const sub = document.createElement('div'); sub.className = 'subsection';
        const list = document.createElement('ul'); list.className = 'phrase-list';
        for (const item of wordEntries) { const li = document.createElement('li'); li.textContent = typeof item === 'string' ? item : [item.text || item.word || item.message || item.phrase, M.notebookItemContext(item), ...(typeof item.usage === 'string' ? [item.usage] : item.usage || [])].filter(Boolean).join('\n'); li.dataset.passage = 'false'; if (item.highlight) li.dataset.highlight = 'true'; list.append(li); }
        sub.append(list); row.append(sub);
      }
      for (const key of ['items', 'phrases', 'messages']) for (const item of (key === 'items' && pointableItems ? [] : saved[key] || [])) {
        const text = typeof item === 'string' ? item : item.text || item.word || item.message || item.phrase;
        wording(row, text, key !== 'words', item.highlight === true);
        const context = M.notebookItemContext(item); if (context.trim()) wording(row, context, true);
        for (const usage of typeof item.usage === 'string' ? [item.usage] : item.usage || []) if (usage.trim()) wording(row, usage, true);
      }
    }
    if (notebook.lookup?.annotations.length) {
      const row = section('Book lookup sources');
      for (const annotation of notebook.lookup.annotations) { const citation = annotation.url_citation; wording(row, [citation.title, citation.url].filter(Boolean).join('\n'), true); }
    }
    const title = frozen.name || envelope.title || notebook.title || 'Situation notebook';
    const at = frozen.updatedAt || envelope.updatedAt || envelope.updated_at || envelope.createdAt || envelope.created_at || notebook.createdAt || new Date().toISOString();
    const generator = new ReferenceLibraryPDF('letter', { compact: true, tableOfContents: true, printRoot, title, guide: { content: [] }, excludeGuide: true, excludeRescueHeading: true, revisedDate: at, noNetwork: true, editionLabel: frozen.id, rescue: [], imposer: BookletImposer });
    const pdf = await generator.generateBookletFromDOM(); pdf.setProperties({ title, subject: 'Saved situation notebook' });
    return { pdf, edition: { id: frozen.id, at }, notebook: frozen, format: 'booklet', pages: pdf.getNumberOfPages(), sheets: pdf.getNumberOfPages() / 2 };
  }
  function buildShopping(snapshot) {
    const frozen = M.clone(snapshot), pdf = new globalThis.jspdf.jsPDF({ unit: 'pt', format: 'letter' }); let y = 64;
    const heading = () => { pdf.setFont('helvetica', 'bold'); pdf.setFontSize(20); pdf.text('Shopping list', 48, 36); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(16); }; heading();
    for (const item of frozen.items) {
      M.insist(typeof item.text === 'string' && item.text.trim(), 'Invalid shopping print item');
      const lines = pdf.splitTextToSize(item.text, 470);
      for (let i = 0; i < lines.length; i++) { if (y + 36 > 744) { pdf.addPage(); heading(); y = 64; } if (!i) pdf.rect(48, y - 12, 14, 14); pdf.text(lines[i], 74, y); y += 24; }
      pdf.setDrawColor(140); pdf.line(74, y + 8, 560, y + 8); y += 34;
    }
    pdf.setProperties({ title: 'Shopping list', subject: 'Frozen shopping list · ' + frozen.at });
    return { pdf, snapshot: frozen, format: 'letter', pages: pdf.getNumberOfPages(), sheets: pdf.getNumberOfPages() };
  }
  return { coverage, project, communicationCategories, build, print, notebookPrintModel, buildNotebook, buildShopping };
});
