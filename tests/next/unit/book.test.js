const { randomUUID } = require('node:crypto');
const M = require('../../../app-next/js/model');
const { makeFixtures } = require('../fixtures');
const { MemoryRepository } = require('../harness/memory-repository');
const { WorkspaceService } = require('../../../server/next/workspace-service');
let B;
beforeAll(() => { try { B = require('../../../app-next/js/book-records'); } catch {} });
function environment() {
  const f = makeFixtures(), w = f.workspaces.demo;
  const repository = new MemoryRepository(f.workspaces);
  return { ...f, w, repository, service: new WorkspaceService(repository) };
}
const op = (payload, base = 1) => ({ recordId: payload.id, payload, base, operation: randomUUID() });

test('a complete valid book without either M1 fixture UUID restores without losing its envelope', () => {
  const { w } = environment();
  w.records = {}; w.edition.payloads = {}; w.edition.revisions = {};
  w.editions[w.edition.id] = M.clone(w.edition);
  const restored = M.validatePackage(JSON.stringify(M.exportPackage(w)), 'demo', 'owner');
  expect(restored.workspace.content.notebook.frontMatter.future).toEqual({ keep: true });
});

test('every master word and duplicate personal entry has a distinct editable source; projection preserves usage', () => {
  const { w, master, masterHash } = environment();
  const items = B.catalogue(w.edition, master, masterHash);
  const words = items.filter(p => p.binding?.masterHash);
  expect(words).toHaveLength(master.categories.reduce((n, c) => n + c.words.length, 0));
  expect(new Set(words.map(p => p.id)).size).toBe(words.length);
  const duplicates = items.filter(p => p.text === 'Élodie O’Connor-Smith');
  expect(duplicates).toHaveLength(2); expect(duplicates[0].id).not.toBe(duplicates[1].id);
  const source = words.find(p => p.category === 'home');
  expect(source.original).toEqual(master.categories.find(c => c.id === 'home').words[0]);
  const copied = M.clone(w.edition); copied.payloads[source.id] = { ...source, text: 'Reading lamp', highlight: true };
  const projected = B.project(copied, master, masterHash).vocabulary.find(c => c.id === 'home').words[0];
  expect(projected.text).toBe('Reading lamp'); expect(projected.highlight).toBe(true);
  expect(projected.original).toEqual(source.original);
  expect(w.edition.payloads[source.id]).toBeUndefined();
});

test('promoting any word is atomic, keeps metadata and retries the original operation idempotently', async () => {
  const { w, master, masterHash, service } = environment();
  const word = B.catalogue(w.edition, master, masterHash).find(p => p.category === 'home');
  const request = op({ ...word, highlight: true, future: { retained: ['fictional'] } });
  const result = await service.save('demo', 'alex', request);
  expect(result.outcome).toBe('accepted'); expect(result.latest.payload.highlight).toBe(true);
  expect(await service.save('demo', 'alex', request)).toEqual(result);
  const saved = await service.read('demo', 'reader');
  expect(saved.records[word.id].revisions).toHaveLength(2);
  expect(saved.edition.payloads[word.id].future).toEqual({ retained: ['fictional'] });
  expect(M.validatePackage(JSON.stringify(M.exportPackage(saved)), 'demo', 'owner', master, masterHash).workspace.id).toBe('demo');
});

test('stale highlight/text edits retain both metadata proposals without retargeting the source', async () => {
  const { w, master, masterHash, service } = environment();
  const word = B.catalogue(w.edition, master, masterHash).find(p => p.category === 'home');
  await service.save('demo', 'alex', op({ ...word, highlight: true }));
  const stale = await service.save('demo', 'robin', op({ ...word, text: 'A complete fictional phrase', hidden: true }));
  expect(stale.outcome).toBe('conflict'); expect(stale.latest.payload.highlight).toBe(true);
  expect(stale.conflict.proposal.payload.hidden).toBe(true);
  expect(stale.conflict.proposal.payload.text).toBe('A complete fictional phrase');
  await expect(service.save('demo', 'alex', op({ ...word, binding: { ...word.binding, fingerprint: 'wrong' } }, 2))).rejects.toMatchObject({ status: 400 });
  const changed = M.clone(master); changed.categories.find(c => c.id === 'home').words.reverse();
  expect(() => B.project(w.edition, changed, 'other-hash')).toThrow('binding');
});

test('whole contact passages, dates and template content stay editable with unknown fields and original wording', () => {
  const { w, master, masterHash } = environment();
  w.edition.content.contacts[0] = { id: 'c1', name: 'Morgan', phone: '555-0101', email: 'morgan@example.invalid', notes: 'Fictional contact', future: { retain: true } };
  w.edition.content.pages = [{ id: 'health-fictional', name: 'Health info', text: 'Practice passage\n\n• Check this wording.' }];
  w.edition.content.templateFields = { fictional_dates: 'A fictional birthday: 1 January' };
  const items = B.catalogue(w.edition, master, masterHash);
  const contact = items.find(p => p.binding?.path?.[0] === 'contacts' && p.original?.id === 'c1');
  expect(contact.text).toContain('555-0101'); expect(contact.text).toContain('morgan@example.invalid');
  expect(contact.original.future).toEqual({ retain: true });
  expect(items.some(p => p.name === 'Health info' && p.text.includes('• Check'))).toBe(true);
  expect(items.some(p => p.text.includes('A fictional birthday'))).toBe(true);
});

test('explicit ordering and hide remain separate from highlight and never lose a later addition', async () => {
  const { w, master, masterHash, service } = environment();
  const items = B.catalogue(w.edition, master, masterHash).filter(p => p.category === 'home' && p.kind === 'phrase');
  const order = B.orderPayload('home', items.map(p => p.id));
  await service.save('demo', 'alex', op({ ...order, items: [items[1].id, items[0].id] }));
  const addition = B.addition('phrase', 'home', 'Fictional new household word', randomUUID());
  await service.save('demo', 'alex', op(addition, 0));
  const saved = await service.read('demo', 'reader');
  const section = B.project(saved.edition, master, masterHash).vocabulary.find(c => c.id === 'home');
  expect(section.words[0].id).toBe(items[1].id); expect(section.words[1].id).toBe(items[0].id);
  expect(section.words.at(-1).text).toBe('Fictional new household word');
  const stale = await service.save('demo', 'robin', op({ ...order, items: [items[0].id, items[1].id] }));
  expect(stale.outcome).toBe('conflict');
});

test('reader/outsider cannot add records and failed persistence cannot leave a promoted baseline behind', async () => {
  const { w, master, masterHash, service, repository } = environment();
  const payload = B.catalogue(w.edition, master, masterHash).find(p => p.category === 'home');
  await expect(service.save('demo', 'reader', op(payload))).rejects.toMatchObject({ status: 403 });
  await expect(service.save('demo', 'outsider', op(payload))).rejects.toMatchObject({ status: 403 });
  repository.failNext = true;
  await expect(service.save('demo', 'alex', op({ ...payload, highlight: true }))).rejects.toThrow('persistence');
  expect((await service.read('demo', 'alex')).records[payload.id]).toBeUndefined();
});
test('notebook and saved-group additions use existing verified scopes and reject invented scopes', async () => {
  const { service, master, masterHash } = environment();
  for (const category of ['notebook:0', 'group:group-demo']) {
    const p = B.addition('phrase', category, 'Fictional retained section addition', randomUUID());
    expect((await service.save('demo', 'alex', op(p, 0))).outcome).toBe('accepted');
    expect(B.project((await service.read('demo', 'reader')).edition, master, masterHash).extra.find(s => s.id === category).words.some(w => w.id === p.id)).toBe(true);
  }
  await expect(service.save('demo', 'alex', op(B.addition('phrase', 'notebook:unknown', 'Rejected fictional scope', randomUUID()), 0))).rejects.toMatchObject({ status: 400 });
});
