const M = require('../../../app-next/js/model');
const { makeFixtures } = require('../fixtures');

test('pinned binding never retargets duplicate or reordered master wording', () => {
  const f = makeFixtures();
  const edition = f.workspaces.demo.edition;
  const phrase = edition.payloads['b4420c84-a4cc-4b47-9d9e-bd6bd6dd4b53'];
  expect(M.bindingMatches(phrase.binding, f.master, f.masterHash)).toBe(true);
  const changed = structuredClone(f.master);
  changed.categories.find(c => c.id === 'phrases').words.reverse();
  expect(M.bindingMatches(phrase.binding, changed, 'other-hash')).toBe(false);
  expect(() => M.projectBook(edition, changed, 'other-hash')).toThrow('binding');
});
test('full export validation preserves unknown content, originals and complete history', () => {
  const f = makeFixtures();
  const pkg = M.exportPackage(f.workspaces.demo);
  const restored = M.validatePackage(JSON.stringify(pkg), 'demo', 'owner');
  expect(restored.workspace.content.notebook.frontMatter).toEqual({ title: 'Fictional book', future: { keep: true } });
  expect(restored.workspace.records['e6f89c93-0c18-49e9-9aaf-9134fa14b72d'].revisions[0].payload.originals.templateFields).toEqual({ fictional_basic_info: 'Original fictional passage' });
  expect(restored.workspace.content.savedGroups[0].words).toEqual(['Thank you', 'Thank you']);
  expect(() => M.validatePackage(JSON.stringify(pkg), 'other', 'owner')).toThrow('mapping');
  const bad = structuredClone(pkg);
  bad.workspace.records['e6f89c93-0c18-49e9-9aaf-9134fa14b72d'].current = 99;
  expect(() => M.validatePackage(JSON.stringify(bad), 'demo', 'owner')).toThrow('revision');
  bad.workspace.records['e6f89c93-0c18-49e9-9aaf-9134fa14b72d'].current = 1;
  bad.workspace.session = { token: 'forged' };
  expect(() => M.validatePackage(JSON.stringify(bad), 'demo', 'owner')).toThrow('authority');
});
test('book projection respects hidden words/custom separation/order and canonical page placement', () => {
  const f = makeFixtures();
  const projection = M.projectBook(f.workspaces.demo.edition, f.master, f.masterHash);
  expect(projection.map(c => c.id)).toEqual(f.master.categories.map(c => c.id));
  expect(projection.find(c => c.id === 'phrases').words[0].text).toBe('I need a little more time.');
  expect(projection.find(c => c.id === 'family').words.some(w => w.text === 'Husband')).toBe(false);
  expect(projection.find(c => c.id === 'family').words.at(-1).text).toBe('Élodie O’Connor-Smith');
  expect(f.master.categories[0].words[0].text).toBe('Husband');
});
test('removing an overlay does not shift hidden master locators', () => {
  const f = makeFixtures(); const e = f.workspaces.demo.edition;
  e.payloads['b4420c84-a4cc-4b47-9d9e-bd6bd6dd4b53'].tombstone = true; e.content.hidden.phrases = [1];
  expect(M.projectBook(e, f.master, f.masterHash).find(c => c.id === 'phrases').words.some(w => w.text === 'Thanks')).toBe(false);
});
test('restore rejects missing required edition inputs before any mutation', () => {
  const pkg = M.exportPackage(makeFixtures().workspaces.demo); delete pkg.workspace.content.rescue;
  expect(() => M.validatePackage(JSON.stringify(pkg), 'demo', 'owner')).toThrow('content');
});
