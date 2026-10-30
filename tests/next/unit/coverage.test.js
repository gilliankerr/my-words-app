const M = require('../../../app-next/js/model');
const { makeFixtures } = require('../fixtures');
let P; beforeAll(() => { try { P = require('../../../app-next/js/print-adapter'); } catch {} });
test('User Communication book excludes standalone personal records, Notes and Shopping List without deleting sources', () => {
  const f = makeFixtures(), e = M.clone(f.workspaces.demo.edition), before = M.canonical(e);
  const inventory = P.coverage(e, f.master, f.masterHash, { compactCommunicationBook: true });
  expect(inventory.included.some(p => ['page', 'note', 'person', 'group'].includes(p.kind) && p.category !== 'front' || ['notes', 'shopping-list'].includes(p.category))).toBe(false);
  expect(inventory.included.some(p => p.category === 'shopping')).toBe(true);
  expect(inventory.omitted.some(p => p.reason === 'Separate app section')).toBe(true);
  expect(M.canonical(e)).toBe(before);
});
test('retained import provenance and uniquely placed original template fields do not block current-page printing', () => {
  const f = makeFixtures(), e = M.clone(f.workspaces.demo.edition);
  e.content.legacySources = { notes: [{ text: 'Original source history' }] };
  e.content.legacyMapping = { targetOwner: 'review-only' };
  e.content.templateFields = { 'personal/example': 'Complete source wording' };
  e.content.templatePageBindings = { 'personal/example': 'basic' };
  e.content.pages = [{ id: 'basic', name: 'Basic info', text: 'Complete source wording', sourceFields: [{ key: 'personal/example', value: 'Complete source wording', sourceRows: [1] }], legacySource: { table: 'original-source' } }];
  e.content.contacts[0].legacySource = { table: 'contacts', ownerId: 41 };
  e.content.contacts[0].groups = ['Fictional Friends'];
  e.content.custom.home = [{ text: 'Personal word', legacySource: { table: 'original-source' } }];
  expect(P.coverage(e, f.master, f.masterHash, { compactCommunicationBook: true }).blocked).toEqual([]);
  e.content.pages[0].instructions = { text: 'Unmapped current instruction' };
  expect(P.coverage(e, f.master, f.masterHash, { compactCommunicationBook: true }).blocked).toContainEqual(expect.objectContaining({ path: 'pages.0.instructions.text' }));
});
test('a missing or inconsistent template-page source binding continues to block incomplete printing', () => {
  const f = makeFixtures(), e = M.clone(f.workspaces.demo.edition);
  e.content.templateFields = { example: 'Complete original wording' };
  e.content.templatePageBindings = { example: 'missing' };
  expect(P.coverage(e, f.master, f.masterHash, { compactCommunicationBook: true }).blocked).toContainEqual(expect.objectContaining({ path: 'templatePageBindings.example' }));
});
test('print inventory maps full contacts, personal passages, saved notes, fields and envelope text without mutating the book', () => {
  const f = makeFixtures(), e = M.clone(f.workspaces.demo.edition);
  e.content.contacts[0] = { id: 'c1', name: 'Fictional Morgan', phone: '555-0100', email: 'example@example.invalid', notes: 'Ring first' };
  e.content.notes.push({ id: 'n2', title: 'Practice note', text: 'Complete note passage' });
  e.content.templateFields = { dates: 'A fictional date passage' }; e.content.notebook.content.health = 'Complete fictional health passage';
  const before = M.canonical(e), inventory = P.coverage(e, f.master, f.masterHash);
  expect(inventory.blocked).toEqual([]);
  const texts = inventory.included.map(p => p.text).join('\n');
  for (const text of ['555-0100', 'example@example.invalid', 'Ring first', 'Complete note passage', 'A fictional date passage', 'Complete fictional health passage', 'preserve']) expect(texts).toContain(text);
  expect(inventory.omitted.some(p => p.reason === 'Archived')).toBe(true); expect(M.canonical(e)).toBe(before);
});
test('unsupported content blocks printing explicitly instead of producing an incomplete PDF', () => {
  const f = makeFixtures(), e = M.clone(f.workspaces.demo.edition);
  e.content.notebook.sections.push({ name: 'Unsupported clinical diagram', type: 'future-diagram', text: 'Meaningful source text' });
  expect(P.coverage(e, f.master, f.masterHash).blocked).toContainEqual(expect.objectContaining({ path: 'notebook.sections.1.type' }));
  expect(() => P.project(e, f.master, f.masterHash)).toThrow(/print mapping/i);
});
test('meaningful nested and saved-envelope fields cannot silently disappear from print coverage', () => {
  const f = makeFixtures(), e = M.clone(f.workspaces.demo.edition);
  e.content.notes.push({ id: 'nested', text: 'Visible fictional note', details: { text: 'Critical fictional instruction omitted' } });
  const page = Object.values(e.payloads).find(p => p.kind === 'page'); page.instructions = 'Another complete fictional instruction';
  const inventory = P.coverage(e, f.master, f.masterHash);
  expect(inventory.blocked).toContainEqual(expect.objectContaining({ path: 'notes.1.details.text' }));
  expect(inventory.blocked).toContainEqual(expect.objectContaining({ path: 'payloads.' + page.id + '.instructions' }));
});
test('ordinary notes, canonical people and saved groups print while display and Home state are explicitly omitted', () => {
  const f = makeFixtures(), e = M.clone(f.workspaces.demo.edition);
  e.payloads.note = { id: 'note', kind: 'note', category: 'notes', text: 'My complete saved message.', name: 'A question', favourite: true, favouriteOrder: 3, updatedAt: '2026-10-04' };
  e.payloads.person = { id: 'person', kind: 'person', category: 'people', text: 'Morgan', name: 'Morgan', context: 'Book club friend', groups: ['Friends'], aliases: ['Mo'] };
  e.payloads.group = { id: 'group', kind: 'group', category: 'quick-words', text: 'Waiting', name: 'Waiting', words: [{ text: 'Please give me time.', source: { id: 'kept-source' } }], selection: [0] };
  e.payloads.display = { id: 'display', kind: 'preference', category: 'display', text: 'Display choices', display: { sections: { home: { name: 'At home' } } } };
  const inventory = P.coverage(e, f.master, f.masterHash);
  expect(inventory.blocked).toEqual([]);
  expect(inventory.included.map(p => p.id)).toEqual(expect.arrayContaining(['note', 'person', 'group']));
  expect(inventory.omitted).toContainEqual(expect.objectContaining({ id: 'display', reason: 'Screen navigation and display choices' }));
});

test('User print exclusions retain opaque Guide and separate complete notebooks in the source', () => {
  const f = makeFixtures(), e = M.clone(f.workspaces.demo.edition);
  e.content.notebooks = [{ id: 'retained', title: 'Separate booklet', data: { sections: [{ name: 'Opinion', messages: ['An opinion'] }], unknown: 'retain' } }];
  const before = M.canonical(e), inventory = P.coverage(e, f.master, f.masterHash, { compactCommunicationBook: true });
  expect(inventory.blocked).toEqual([]);
  expect(inventory.included.some(p => p.category === 'guide' || p.kind === 'notebook')).toBe(false);
  expect(inventory.omitted).toEqual(expect.arrayContaining([expect.objectContaining({ category: 'guide', reason: 'Excluded by owner' }), expect.objectContaining({ kind: 'notebook', reason: 'Separate situation booklet' })]));
  expect(M.canonical(e)).toBe(before);
});
