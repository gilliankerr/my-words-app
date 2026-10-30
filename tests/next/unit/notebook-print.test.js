const P = require('../../../app-next/js/print-adapter');
const M = require('../../../app-next/js/model');
test('book lookup evidence and complete reference card have an explicit saved print mapping', () => {
  const payload = { notebook: { title: 'Fictional book', sections: [{ name: 'Themes', words: ['Housing'] }], frontMatter: { entityType: 'book', entityName: 'Fictional book', content: { title: 'Fictional book', author: 'Fictional author', summary: 'Complete summary.', mainCharacters: ['Person — description'], themes: ['Housing'], discussionStarters: ['What changed?'] } }, lookup: { entity: { type: 'book', name: 'Fictional book' }, context: 'Retained search evidence', annotations: [{ type: 'url_citation', url_citation: { title: 'Publisher', url: 'https://example.invalid/book' } }], confirmed: true } } };
  const original = structuredClone(payload);
  expect(P.notebookPrintModel(payload).lookup).toEqual(payload.notebook.lookup);
  expect(payload).toEqual(original);
});
test('known generated book-club text types retain their complete word and phrase lists', () => {
  for (const type of ['communication-repair', 'pointable-vocabulary', 'nonfiction-events-and-actions-vocabulary', 'discussion-phrases', 'discussion-questions', 'passage-sharing', 'discussion-leadership', 'family-and-friends-conversation']) {
    const p = { notebook: { title: 'Fictional saved book', sections: [{ name: 'Complete text', type, items: ['Complete retained wording'] }] } };
    expect(P.notebookPrintModel(p).sections[0]).toEqual(p.notebook.sections[0]);
  }
});

function saved() {
  const sections = [
    { name: 'Objects', type: 'objects', words: ['Reading glasses', 'Élodie’s notebook'], fontSizes: { word: 18 } },
    { name: 'Questions', type: 'questions', items: ['Could you explain the ending?', 'Please give me time.'] },
    { name: 'Guide', type: 'partner-guide', content: [{ text: 'Excluded opaque guide' }] }
  ];
  const raw = { id: 12, user_id: 41, title: 'Fictional saved book', situation: 'A fictional discussion', template_used: 'discussion', content: { sections, situationType: 'discussion' }, is_edited: false, created_at: '2026-10-07', updated_at: '2026-10-07', local_id: null, sync_version: 1 };
  return { id: 'fictional-notebook', name: raw.title, notebook: { ...M.clone(raw), ...M.clone(raw.content), legacyRow: M.clone(raw) } };
}
test('complete legacy notebook print mapping retains words/items/order and excludes only owner exclusions', () => {
  const p = saved(), before = M.canonical(p), mapped = P.notebookPrintModel(p);
  expect(mapped.sections.map(s => s.name)).toEqual(['Objects', 'Questions']);
  expect(mapped.sections[0].words).toEqual(['Reading glasses', 'Élodie’s notebook']);
  expect(mapped.sections[1].items).toEqual(['Could you explain the ending?', 'Please give me time.']);
  expect(mapped.situation).toBe('A fictional discussion');
  expect(M.canonical(p)).toBe(before);
});
test('latest edited sections print while their original legacy mirrors remain retained', () => {
  const p = saved(); p.notebook.sections[1].items[0] = 'My edited complete question.';
  expect(P.notebookPrintModel(p).sections[1].items[0]).toBe('My edited complete question.');
  expect(p.notebook.legacyRow.content.sections[1].items[0]).toBe('Could you explain the ending?');
});
test.each(['root', 'content', 'section', 'item'])('meaningful unmapped %s fields still block output', scope => {
  const p = saved();
  if (scope === 'root') p.notebook.instructions = 'Must not disappear';
  if (scope === 'content') p.notebook.content.instructions = 'Must not disappear';
  if (scope === 'section') p.notebook.sections[0].diagram = { label: 'Must not disappear' };
  if (scope === 'item') p.notebook.sections[0].words[0] = { text: 'Word', dosage: 'Must not disappear' };
  expect(() => P.notebookPrintModel(p)).toThrow(/print mapping/i);
});
test('a mismatched preserved content mirror cannot be silently suppressed', () => {
  const p = saved(); p.notebook.content.sections[0].words.push('Unmapped extra wording');
  expect(() => P.notebookPrintModel(p)).toThrow(/print mapping/i);
});
test('modern context, usage and emphasis are carried to print; unsupported types remain blocked', () => {
  const p = { id: 'modern', notebook: { sections: [{ name: 'Discussion', type: 'discussion', messages: [{ text: 'Complete opinion', context: 'Complete context', usage: ['Opinion'], highlight: true }] }] } };
  expect(P.notebookPrintModel(p).sections[0].messages[0]).toEqual(p.notebook.sections[0].messages[0]);
  p.notebook.sections[0].type = 'future-diagram';
  expect(() => P.notebookPrintModel(p)).toThrow(/print mapping/i);
});
test.each([
  { data: { sections: [{ name: 'Body', text: 'Body' }] }, instructions: 'Must print' },
  { sections: [{ name: 'Body', text: 'Body' }], context: { text: 'Must print' } },
  { sections: [{ name: 'Body', words: [{ text: 'Word', message: 'Complete sentence' }] }] }
])('reviewed unmapped wrapping/context/wording cannot silently disappear', notebook => {
  expect(() => P.notebookPrintModel({ notebook })).toThrow(/print mapping/i);
});
