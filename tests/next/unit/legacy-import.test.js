const L = require('../../../app-next/js/legacy-import');
const M = require('../../../app-next/js/model');
const B = require('../../../app-next/js/book-records');
const N = require('../../../app-next/js/notebooks');
const D = require('../../../app-next/js/discovery');
const { makeFixtures } = require('../fixtures');
function fixture() {
  const { master, masterHash } = makeFixtures();
  const source = { format: 'communication-notes-owned-source', version: 1, readOnly: true, ownerVerified: true, ownerId: 2, capturedAt: '2026-10-04T12:00:00.000Z',
    notebooks: [{ id: 8, user_id: 2, title: 'Fictional full notebook', situation: 'Fictional situation', content: { frontMatter: { future: ['retained'] }, sections: [], futureEnvelope: { keep: true } } }],
    autosaves: [{ id: 9, user_id: 2, content: { text: 'Fictional unfinished wording', unknown: true } }],
    library: [{ id: 10, user_id: 2, section_id: 'food', words: [{ id: 'legacy-word', text: 'Fictional food', future: { usage: true } }], hidden_words: [], template_fields: { 'notes/unassigned/0': 'Fictional tentative statement' } }],
    contacts: [{ id: 11, user_id: 2, name: 'Pat', category_id: 13, future: { preserve: true } }, { id: 12, user_id: 2, name: 'Pat', category_id: 13 }],
    contactCategories: [{ id: 13, user_id: 2, name: 'Fictional group' }],
    quickWords: [{ id: 14, user_id: 2, name: 'Fictional words', words: ['One', 'One', 'Two'], selected_words: ['One', 'Two', 'One'], future: ['keep'] }],
    sharedGuide: { scope: 'shared-printing-dependency', rows: [{ id: 1, content: { name: 'Communication Partner Guide', content: [{ type: 'intro-paragraph', text: 'Fictional guide' }] }, font_sizes: { body: 13 } }] },
    unavailable: ['browser-only-preferences-and-drafts'] };
  const options = { reviewed: true, workspaceId: 'target', owner: 'target-owner', notebookId: 8, master, masterHash, acceptSharedGuide: true };
  return { source, options };
}
test('review candidate retains complete originals, source identities and unassigned wording without guessing', () => {
  const { source, options } = fixture(), before = M.canonical(source), result = L.prepare(source, options);
  expect(M.canonical(source)).toBe(before); expect(result.originalSource).toEqual(source);
  const c = result.candidate.workspace.content;
  expect(c.notebook.frontMatter.future).toEqual(['retained']); expect(c.notebook.content.futureEnvelope).toEqual({ keep: true });
  expect(c.contacts.map(p => p.id)).toEqual([11, 12]); expect(c.contacts[0].future).toEqual({ preserve: true });
  expect(c.savedGroups[0].words).toEqual(['One', 'One', 'Two']); expect(c.savedGroups[0].selected_words).toEqual(['One', 'Two', 'One']);
  expect(c.templateFields['notes/unassigned/0']).toBe('Fictional tentative statement');
  expect(c.notes).toEqual([]); expect(c.pages).toEqual([]);
  expect(result.blockers.some(b => b.code === 'AUTOSAVE_REVIEW_REQUIRED')).toBe(true);
  expect(result.automaticImport).toBe(false);
  expect(() => M.validatePackage(JSON.stringify(result.candidate), 'target', 'target-owner', options.master, options.masterHash)).not.toThrow();
});
test('preview exposes counts and structural differences without private wording', () => {
  const { source, options } = fixture(), result = L.prepare(source, options), preview = L.preview(result);
  expect(preview.counts.notebooks).toBe(1); expect(preview.counts.people).toBe(2); expect(preview.counts.savedGroups).toBe(1);
  expect(JSON.stringify(preview)).not.toMatch(/Pat|tentative statement|Fictional/);
});

test('all saved legacy notebooks expose complete readable envelopes with distinct source identities', () => {
  const { source, options } = fixture();
  source.notebooks[0].content.sections = [{ name: 'Discussion', words: [{ text: 'Complete synthetic phrase', context: 'Kept context', future: 3 }] }];
  source.notebooks.push({ ...structuredClone(source.notebooks[0]), id: 18, title: source.notebooks[0].title });
  const result = L.prepare(source, options), saved = B.sources(result.candidate.workspace.content).filter(p => p.kind === 'notebook');
  expect(saved).toHaveLength(2); expect(new Set(saved.map(p => p.id)).size).toBe(2);
  for (const p of saved) {
    expect(N.content(p).sections[0].words[0]).toEqual(source.notebooks[0].content.sections[0].words[0]);
    expect(N.content(p).futureEnvelope).toEqual({ keep: true });
    expect(p.notebook.legacyRow).toEqual(source.notebooks.find(n => n.id === p.notebook.id));
  }
  expect(result.originalSource).toEqual(source); expect(result.readyForImport).toBe(false);
});

test('User review can explicitly exclude the shared Guide while retaining its opaque source', () => {
  const { source, options } = fixture();
  source.library.push({ id: 16, user_id: 2, section_id: '_template_fields', words: [], template_fields: { 'personal-info/example/0': 'Synthetic personal passage' } });
  const result = L.prepare(source, { ...options, acceptSharedGuide: false, excludeGuide: true });
  expect(result.candidate.workspace.content.guide.content).toEqual([]);
  expect(result.originalSource.sharedGuide).toEqual(source.sharedGuide);
  for (const code of ['GUIDE_ADOPTION_REVIEW_REQUIRED', 'CUSTOM_SECTION_REVIEW_REQUIRED']) expect(result.blockers.map(b => b.code)).not.toContain(code);
  expect(result.candidate.workspace.content.templateFields['personal-info/example/0']).toBe('Synthetic personal passage');
  expect(result.readyForImport).toBe(false);
});

test('legacy string vocabulary becomes readable personal overlays with original strings retained', () => {
  const { source, options } = fixture(); source.library[0].words = ['Synthetic personal word', { text: 'Structured wording', future: 8 }];
  const result = L.prepare(source, options);
  expect(result.candidate.workspace.content.custom.food.map(w => w.text)).toEqual(['Synthetic personal word', 'Structured wording']);
  expect(result.candidate.workspace.content.custom.food[1].future).toBe(8);
  expect(result.originalSource.library[0].words).toEqual(source.library[0].words);
  expect(result.blockers.map(b => b.code)).not.toContain('WORD_SHAPE_REVIEW_REQUIRED');
});

test('the default Communication book uses the master and overlays, keeping every saved notebook in its collection', () => {
  const { source, options } = fixture(); delete options.notebookId;
  const result = L.prepare(source, options);
  expect(result.candidate.workspace.content.notebook.sections).toEqual([]);
  expect(result.candidate.workspace.content.notebooks).toHaveLength(1);
  expect(result.blockers.map(b => b.code)).not.toContain('NOTEBOOK_CHOICE_REQUIRED');
  expect(() => L.prepare(source, { ...options, notebookId: 999 })).toThrow(/notebook/i);
});

test('correction coverage binds to the owner and exact master, preserves uncertain sources, and never applies proposals', () => {
  const { source, options } = fixture(), review = L.prepare(source, options), word = options.master.categories.find(c => c.id === 'food').words[0];
  const ledger = { format: 'communication-notes-owned-word-revisions', version: 1, ownerVerified: true, ownerId: 2, masterFingerprint: options.masterHash, entries: [
    { id: 'confirmed', status: 'active', operation: 'emphasize', sectionId: 'food', text: word.text, sources: [{ kind: 'scan', file: 'synthetic.pdf', pdfPage: 1 }] },
    { id: 'uncertain', status: 'active', operation: 'review', text: 'Unclear synthetic wording', sources: [{ kind: 'scan', file: 'synthetic.pdf', pdfPage: 2 }] },
    { id: 'missing', status: 'active', operation: 'delete', sectionId: 'food', text: 'Missing synthetic wording', sources: [] },
    { id: 'resolved', status: 'resolved', operation: 'review', resolution: { retained: true }, sources: [] }
  ], personalChanges: [{ id: 'personal', target: 'basic', operation: 'set-field', label: 'Synthetic field', value: 'Synthetic value', sources: [] }] };
  const original = M.canonical(review), audit = L.auditCorrections(review, ledger, options.master, options.masterHash);
  expect(M.canonical(review)).toBe(original); expect(audit.entries[0].status).toBe('proposed'); expect(audit.entries[0].matches.length).toBeGreaterThan(0);
  expect(audit.entries.find(e => e.id === 'uncertain').status).toBe('pending'); expect(audit.entries.find(e => e.id === 'missing').status).toBe('pending');
  expect(audit.entries.find(e => e.id === 'resolved').ledgerEntry.resolution).toEqual({ retained: true });
  expect(audit.personalChanges[0].status).toBe('placement-required'); expect(audit.readyForImport).toBe(false);
  expect(() => L.auditCorrections(review, { ...ledger, ownerId: 3 }, options.master, options.masterHash)).toThrow();
  expect(() => L.auditCorrections(review, { ...ledger, masterFingerprint: '0'.repeat(64) }, options.master, options.masterHash)).toThrow();
});

test('explicit personal-page placement preserves complete fields and keeps medical passages behind reveal', () => {
  const { source, options } = fixture();
  source.library[0].template_fields = { 'personal-info/identity/0': 'First synthetic line\nSecond line', 'medical/medications/0': 'Synthetic retained wording', 'emergency/copy/0': 'First synthetic line\nSecond line' };
  const mapping = [{ id: 'basic', name: 'About me', medical: false, fields: ['personal-info/identity/0', 'emergency/copy/0'] }, { id: 'health', name: 'Private passage', medical: true, fields: ['medical/medications/0'] }];
  const result = L.prepare(source, { ...options, templatePages: mapping }), c = result.candidate.workspace.content, pages = B.sources(c).filter(p => p.binding.path[0] === 'pages');
  expect(pages).toHaveLength(2); expect(pages[0].text).toBe('First synthetic line\nSecond line'); expect(D.medical(pages[1])).toBe(true);
  expect(B.sources(c).filter(p => p.binding.path[0] === 'templateFields')).toHaveLength(0);
  expect(c.templateFields).toEqual(source.library[0].template_fields); expect(c.pages[0].sourceFields).toHaveLength(2);
  expect(result.blockers.map(b => b.code)).not.toContain('PERSONAL_PAGE_PLACEMENT_REVIEW_REQUIRED'); expect(result.readyForImport).toBe(false);
  expect(() => L.prepare(source, { ...options, templatePages: [{ ...mapping[0], fields: ['missing/key'] }] })).toThrow();
  expect(() => L.prepare(source, { ...options, templatePages: [mapping[0], { ...mapping[1], fields: mapping[0].fields }] })).toThrow();
  expect(() => L.prepare(source, { ...options, templatePages: [{ ...mapping[1], medical: false }] })).toThrow(/medical/i);
});
test('unreviewed, mixed-owner or duplicate source identities are rejected before mapping', () => {
  const { source, options } = fixture();
  expect(() => L.prepare(source, { ...options, reviewed: false })).toThrow();
  source.contacts[1].user_id = 3; expect(() => L.prepare(source, options)).toThrow();
  source.contacts[1].user_id = 2; source.contacts[1].id = source.contacts[0].id;
  expect(() => L.prepare(source, options)).toThrow();
});
test('ambiguous hidden words, unknown sections and shared markdown remain explicit blockers', () => {
  const { source, options } = fixture();
  source.library.push({ id: 15, user_id: 2, section_id: 'custom-unknown', words: [{ text: 'Unmapped' }], hidden_words: [] });
  source.library[0].hidden_words = ['Missing exact master word'];
  source.sharedGuide.rows[0].markdown_content = '# Different saved Guide';
  const result = L.prepare(source, options);
  expect(result.blockers.map(b => b.code)).toEqual(expect.arrayContaining(['CUSTOM_SECTION_REVIEW_REQUIRED', 'HIDDEN_WORD_BINDING_REVIEW_REQUIRED', 'GUIDE_MARKDOWN_REVIEW_REQUIRED']));
  expect(result.originalSource.library).toEqual(source.library); expect(result.readyForImport).toBe(false);
});
