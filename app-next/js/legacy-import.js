(function (root, factory) {
  const api = factory(typeof module === 'object' ? require('./model') : root.NextModel);
  if (typeof module === 'object') module.exports = api; else root.NextLegacyImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (M) {
  'use strict';
  const keys = ['notebooks', 'autosaves', 'library', 'contacts', 'contactCategories', 'quickWords'];
  const { clone, object, insist, canonical } = M;
  function validateSource(source) {
    insist(object(source) && source.format === 'communication-notes-owned-source' && source.version === 1 && source.readOnly === true && source.ownerVerified === true && Number.isSafeInteger(source.ownerId), 'An independently verified owner-scoped source is required.');
    M.rejectAuthority(source);
    for (const key of keys) {
      insist(Array.isArray(source[key]), 'Incomplete source table collection.');
      const ids = new Set();
      for (const row of source[key]) {
        insist(object(row) && Number(row.user_id) === source.ownerId, 'Mixed owner source is not permitted.');
        insist(row.id !== undefined && !ids.has(String(row.id)), 'Duplicate source identity requires review.'); ids.add(String(row.id));
      }
    }
    insist(object(source.sharedGuide) && source.sharedGuide.scope === 'shared-printing-dependency' && Array.isArray(source.sharedGuide.rows), 'Shared printing dependency must remain explicitly labelled.');
    return source;
  }
  function prepare(source, options) {
    validateSource(source);
    insist(options?.reviewed === true && typeof options.workspaceId === 'string' && options.workspaceId && typeof options.owner === 'string' && options.owner, 'Explicit reviewed target owner/workspace mapping is required.');
    const master = options.master;
    insist(object(master) && Array.isArray(master.categories) && master.categories.length === 29 && typeof options.masterHash === 'string' && /^[a-f0-9]{64}$/i.test(options.masterHash), 'The exact current master and hash are required.');
    const blockers = [], mappings = [], unmapped = [];
    const block = (code, collection, count = 1) => { blockers.push({ code, collection, count }); };
    const content = { order: master.categories.map(c => c.id), hidden: {}, custom: {}, preferences: {}, routes: {}, links: {}, contacts: [], notes: [], pages: [], savedGroups: [], templateFields: {}, rescue: [], diagrams: [],
      notebook: { frontMatter: {}, content: {}, sections: [] }, notebooks: [],
      guide: { name: 'Communication Partner Guide', content: [] },
      legacySources: clone(source), legacyMapping: { sourceOwnerId: source.ownerId, targetOwner: options.owner, reviewed: true, sourceIdsPreserved: true } };
    const known = new Map(master.categories.map(c => [c.id, c]));
    for (const row of source.notebooks) {
      insist(object(row.content), 'Notebook content must remain a complete object envelope.');
      const envelope = clone(row.content), notebook = envelope.data || envelope;
      insist(object(notebook) && (notebook.sections === undefined || Array.isArray(notebook.sections)), 'Invalid saved notebook sections.');
      content.notebooks.push({ ...clone(row), ...envelope, id: row.id, title: row.title || notebook.title || 'Untitled notebook', situation: row.situation || notebook.situation || '', legacyRow: clone(row) });
      mappings.push({ table: 'notebooks', id: row.id, destination: 'notebooks', envelopeRetained: true });
    }
    const fieldSources = new Map();
    for (const row of source.library) {
      const section = known.get(row.section_id);
      insist(Array.isArray(row.words), 'Malformed library words require source repair.');
      if (row.section_id === '_template_fields' && !row.is_custom_section && row.words.length === 0) {
        mappings.push({ table: 'reference_library_custom', id: row.id, destination: 'templateFields', sourceSectionId: row.section_id });
      } else if (!section || row.is_custom_section) {
        block(row.section_id === 'activities' ? 'RETIRED_SECTION_REVIEW_REQUIRED' : 'CUSTOM_SECTION_REVIEW_REQUIRED', 'library');
        unmapped.push({ table: 'reference_library_custom', id: row.id, reason: 'unsupported-section' });
      } else {
        const words = row.words.map((w, index) => typeof w === 'string' && w.trim() ? { text: w, legacySource: { table: 'reference_library_custom', id: row.id, index } } : w).filter(w => object(w) && typeof w.text === 'string' && w.text.trim());
        if (words.length !== row.words.length) block('WORD_SHAPE_REVIEW_REQUIRED', 'library', row.words.length - words.length);
        content.custom[row.section_id] = clone(words);
        mappings.push({ table: 'reference_library_custom', id: row.id, destination: 'custom', sourceSectionId: row.section_id });
        if (row.section_name && row.section_name !== section.name || row.section_icon && row.section_icon !== section.icon) block('SECTION_PRESENTATION_REVIEW_REQUIRED', 'library');
        const hidden = row.hidden_words || [];
        insist(Array.isArray(hidden), 'Malformed hidden choices require source repair.');
        content.hidden[row.section_id] = [];
        for (const hiddenWord of hidden) {
          const matches = section.words.map((word, index) => ({ word, index })).filter(entry => typeof hiddenWord === 'string' && entry.word.text === hiddenWord);
          if (matches.length === 1) content.hidden[row.section_id].push(matches[0].index);
          else { block('HIDDEN_WORD_BINDING_REVIEW_REQUIRED', 'library'); unmapped.push({ table: 'reference_library_custom', id: row.id, reason: 'ambiguous-hidden-word' }); }
        }
        content.hidden[row.section_id] = [...new Set(content.hidden[row.section_id])];
      }
      if (row.template_fields !== undefined) {
        insist(object(row.template_fields), 'Malformed template fields require source repair.');
        for (const [key, value] of Object.entries(row.template_fields)) {
          const entries = fieldSources.get(key) || []; entries.push({ id: row.id, value: clone(value) }); fieldSources.set(key, entries);
        }
      }
    }
    for (const [key, entries] of fieldSources) {
      if (entries.every(entry => canonical(entry.value) === canonical(entries[0].value))) content.templateFields[key] = clone(entries[0].value);
      else { block('TEMPLATE_FIELD_CONFLICT_REVIEW_REQUIRED', 'library', entries.length); unmapped.push({ table: 'reference_library_custom', ids: entries.map(e => e.id), sourceKey: key, reason: 'different-wording-same-key' }); }
    }
    if (options.templatePages !== undefined) {
      insist(Array.isArray(options.templatePages), 'Explicit personal-page placements are required.');
      const pageIds = new Set(), placed = new Set(); content.templatePageBindings = {};
      for (const page of options.templatePages) {
        insist(object(page) && typeof page.id === 'string' && page.id && !pageIds.has(page.id) && typeof page.name === 'string' && page.name.trim() && typeof page.medical === 'boolean' && Array.isArray(page.fields) && page.fields.length, 'Invalid personal-page placement.'); pageIds.add(page.id);
        const sourceFields = page.fields.map(key => {
          insist(typeof key === 'string' && !placed.has(key) && Object.prototype.hasOwnProperty.call(content.templateFields, key) && typeof content.templateFields[key] === 'string' && content.templateFields[key].trim(), 'Personal-page fields must have complete, uniquely placed source wording.'); placed.add(key);
          insist(!/medical|medication|medicine|allerg|diagnos|health|insurance/i.test(key) || page.medical === true, 'Medical source wording requires deliberate medical reveal.');
          content.templatePageBindings[key] = page.id;
          return { key, value: clone(content.templateFields[key]), sourceRows: fieldSources.get(key).map(entry => entry.id) };
        });
        content.pages.push({ id: page.id, name: page.name, medical: page.medical, text: [...new Set(sourceFields.map(field => field.value))].join('\n\n'), sourceFields, legacySource: { table: 'reference_library_custom', ownerId: source.ownerId } });
        mappings.push({ table: 'reference_library_custom', destination: 'pages', pageId: page.id, sourceKeys: clone(page.fields) });
      }
    }
    const unplaced = Object.keys(content.templateFields).filter(key => !content.templatePageBindings?.[key]);
    if (unplaced.length) block('PERSONAL_PAGE_PLACEMENT_REVIEW_REQUIRED', 'templateFields', unplaced.length);
    const categories = new Map(source.contactCategories.map(row => [String(row.id), row]));
    content.contacts = source.contacts.map(row => {
      const category = row.category_id === null || row.category_id === undefined ? null : categories.get(String(row.category_id));
      if (row.category_id !== null && row.category_id !== undefined && !category) block('CONTACT_CATEGORY_REVIEW_REQUIRED', 'contacts');
      mappings.push({ table: 'contacts', id: row.id, destination: 'contacts' });
      // Keep full original fields. Category membership is a source relation, not a
      // name-based merge or an inferred clinical/emergency assignment.
      return { ...clone(row), ...(row.groups === undefined && category ? { groups: [category.name] } : {}), legacySource: { table: 'contacts', ownerId: source.ownerId, id: row.id } };
    });
    content.savedGroups = source.quickWords.map(row => {
      insist(Array.isArray(row.words) && (row.selected_words === undefined || Array.isArray(row.selected_words)), 'Malformed saved words require source repair.');
      mappings.push({ table: 'saved_quick_words', id: row.id, destination: 'savedGroups' });
      if (row.selected_words?.length) block('SAVED_SELECTION_REVIEW_REQUIRED', 'quickWords', row.selected_words.length);
      return { ...clone(row), legacySource: { table: 'saved_quick_words', ownerId: source.ownerId, id: row.id } };
    });
    if (options.notebookId !== undefined) {
      const selected = source.notebooks.find(row => String(row.id) === String(options.notebookId));
      insist(selected, 'The requested saved notebook is unavailable. All source notebooks are retained.');
      {
        insist(object(selected.content), 'Notebook content must remain a complete object envelope.');
        const envelope = clone(selected.content);
        if (envelope.frontMatter !== undefined) insist(object(envelope.frontMatter), 'Invalid saved front matter.');
        if (envelope.sections !== undefined) insist(Array.isArray(envelope.sections), 'Invalid saved notebook sections.');
        content.notebook = { ...envelope, id: selected.id, title: selected.title, situation: selected.situation,
          frontMatter: clone(envelope.frontMatter || {}), sections: clone(envelope.sections || []), content: envelope, legacyRow: clone(selected) };
        mappings.push({ table: 'notebooks', id: selected.id, destination: 'notebook' });
        if (source.notebooks.length > 1) block('OTHER_NOTEBOOKS_NAVIGATION_REVIEW_REQUIRED', 'notebooks', source.notebooks.length - 1);
      }
    }
    if (source.autosaves.length) block('AUTOSAVE_REVIEW_REQUIRED', 'autosaves', source.autosaves.length);
    const guideRows = source.sharedGuide.rows;
    if (options.excludeGuide === true) {
      content.legacyMapping.guide = 'explicit-exclusion-source-retained';
    } else if (options.reviewedGuide) {
      insist(object(options.reviewedGuide) && Array.isArray(options.reviewedGuide.content), 'Reviewed Guide must contain complete print blocks.');
      content.guide = clone(options.reviewedGuide);
      content.legacyMapping.guide = 'explicit-reviewed-blocks';
    } else if (options.acceptSharedGuide === true && guideRows.length === 1 && !guideRows[0].markdown_content && object(guideRows[0].content) && Array.isArray(guideRows[0].content.content)) {
      content.guide = { ...clone(guideRows[0].content), fontSizes: clone(guideRows[0].font_sizes || {}) };
      content.legacyMapping.guide = 'explicit-adoption-shared-source';
    } else {
      block(guideRows.some(row => row.markdown_content) ? 'GUIDE_MARKDOWN_REVIEW_REQUIRED' : 'GUIDE_ADOPTION_REVIEW_REQUIRED', 'sharedGuide');
      unmapped.push({ table: 'partner_guide_settings', reason: 'shared-guide-needs-explicit-reviewed-print-blocks' });
    }
    for (const missing of source.unavailable || []) block('SOURCE_UNAVAILABLE_REVIEW_REQUIRED', missing);
    block('RESCUE_AND_DIAGRAM_REVIEW_REQUIRED', 'printingInputs');
    if (options.masterReviewed !== true) block('SOURCE_MASTER_BINDING_REVIEW_REQUIRED', 'master');
    // No input supplies membership, credential/session authority or server operations.
    // This package is a review candidate; the guarded restore process is a separate action.
    const at = source.capturedAt || '1970-01-01T00:00:00.000Z', editionId = 'legacy-reviewed-candidate';
    const edition = { id: editionId, workspace: options.workspaceId, at, master: { version: master.version, hash: options.masterHash }, revisions: {}, payloads: {}, content: clone(content) };
    const workspace = { id: options.workspaceId, owner: options.owner, name: 'Communication book', records: {}, content, master: clone(edition.master), conflicts: [], receipts: {}, editions: { [editionId]: edition }, edition: clone(edition),
      sourceProvenance: { provider: 'legacy-owner-scoped-export', ownerId: source.ownerId, capturedAt: source.capturedAt, reviewed: true } };
    M.validateWorkspace(workspace);
    const candidate = { schema: 1, type: 'cn-next-workspace', workspace, activeEdition: editionId };
    return { format: 'communication-notes-legacy-mapping-review', version: 1, automaticImport: false, readyForImport: false, sourceOwnerId: source.ownerId, originalSource: clone(source), candidate, blockers, mappings, unmapped };
  }
  function counts(workspace) {
    const content = workspace?.content || {};
    return { notebooks: content.notebooks?.length || 0, people: content.contacts?.length || 0, savedGroups: content.savedGroups?.length || 0, notes: content.notes?.length || 0,
      customWords: Object.values(content.custom || {}).reduce((sum, words) => sum + words.length, 0), hiddenChoices: Object.values(content.hidden || {}).reduce((sum, words) => sum + words.length, 0),
      templateFields: Object.keys(content.templateFields || {}).length, autosavesRetained: content.legacySources?.autosaves?.length || 0, guideBlocks: content.guide?.content?.length || 0 };
  }
  function preview(review, existingWorkspace) {
    insist(review?.format === 'communication-notes-legacy-mapping-review', 'Mapping review required.');
    const next = counts(review.candidate.workspace), before = counts(existingWorkspace);
    return { automaticImport: false, readyForImport: false, counts: next,
      differences: Object.fromEntries(Object.keys(next).map(key => [key, { before: before[key], candidate: next[key], change: next[key] - before[key] }])),
      blockers: review.blockers.map(block => ({ code: block.code, count: block.count })), unmappedRecords: review.unmapped.length,
      sourceRetained: true, ownerMappingRequiresConfirmation: true };
  }
  function auditCorrections(review, ledger, master, hash) {
    insist(review?.format === 'communication-notes-legacy-mapping-review' && ledger?.format === 'communication-notes-owned-word-revisions' && ledger.version === 1 && ledger.ownerVerified === true && ledger.ownerId === review.sourceOwnerId, 'The correction ledger must match the verified source owner.');
    insist(ledger.masterFingerprint === hash && review.candidate.workspace.master.hash === hash, 'The correction ledger must match the exact reviewed master.');
    M.rejectAuthority(ledger);
    insist(Array.isArray(ledger.entries) && ledger.entries.length <= 10000 && Array.isArray(ledger.personalChanges || []), 'Invalid correction ledger.');
    const B = typeof module === 'object' ? require('./book-records') : globalThis.NextBook;
    const items = B.catalogue(review.candidate.workspace.edition, master, hash).filter(p => p.kind === 'phrase');
    const normalise = value => typeof value === 'string' ? value.normalize('NFKC').trim().toLocaleLowerCase() : '';
    const ids = new Set();
    const entries = ledger.entries.map(entry => {
      insist(object(entry) && typeof entry.id === 'string' && entry.id && !ids.has(entry.id) && Array.isArray(entry.sources), 'Duplicate or invalid correction identity.'); ids.add(entry.id);
      const result = { id: entry.id, ledgerEntry: clone(entry), status: 'pending', matches: [] };
      if (entry.status === 'resolved') { result.status = 'previously-resolved'; return result; }
      if (entry.status !== 'active' || entry.operation === 'review') { result.reason = 'owner-review-required'; return result; }
      if (!master.categories.some(c => c.id === entry.sectionId) || !['add', 'delete', 'emphasize', 'delete-section', 'delete-group'].includes(entry.operation)) { result.reason = 'scope-or-operation-review-required'; return result; }
      if (!['delete-section', 'delete-group'].includes(entry.operation) && !normalise(entry.text)) { result.reason = 'wording-review-required'; return result; }
      if (entry.operation === 'delete-group' && !normalise(entry.usage)) { result.reason = 'group-review-required'; return result; }
      const matches = items.filter(p => p.category === entry.sectionId && (entry.operation === 'delete-section' || (entry.operation === 'delete-group' || normalise(p.text) === normalise(entry.text)) && (!entry.usage || normalise(p.usage) === normalise(entry.usage))));
      result.matches = matches.map(p => ({ id: p.id, text: p.text, binding: clone(p.binding), original: clone(p.original), ...(p.usage ? { usage: p.usage } : {}) }));
      if (entry.operation === 'add') { result.status = 'proposed'; result.action = matches.length ? 'retain-existing-word' : 'add-personal-word'; }
      else if (!matches.length || entry.operation === 'delete' && matches.length > 1) result.reason = matches.length ? 'ambiguous-word-binding' : 'word-not-found';
      else { result.status = 'proposed'; result.action = entry.operation === 'emphasize' ? 'highlight' : 'hide-personal-choice'; }
      return result;
    });
    const personalChanges = (ledger.personalChanges || []).map(entry => { insist(object(entry) && typeof entry.id === 'string' && entry.id && !ids.has(entry.id) && Array.isArray(entry.sources), 'Duplicate or invalid correction identity.'); ids.add(entry.id); return { id: entry.id, status: 'placement-required', ledgerEntry: clone(entry) }; });
    return { format: 'communication-notes-correction-coverage-review', version: 1, sourceOwnerId: review.sourceOwnerId, masterFingerprint: hash, automaticImport: false, readyForImport: false, originalLedger: clone(ledger), entries, personalChanges, sourceRetained: true };
  }
  return { validateSource, prepare, preview, auditCorrections };
});
