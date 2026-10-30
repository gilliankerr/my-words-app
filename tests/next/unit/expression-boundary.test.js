const { randomUUID } = require('node:crypto');
const { makeFixtures } = require('../fixtures');
const { MemoryRepository } = require('../harness/memory-repository');
const { WorkspaceService } = require('../../../server/next/workspace-service');
const B = require('../../../app-next/js/book-records');
const M = require('../../../app-next/js/model');

describe('owned ordinary expression uses the complete revision boundary', () => {
  let f, service;
  beforeEach(() => { f = makeFixtures(); service = new WorkspaceService(new MemoryRepository(f.workspaces)); });
  const op = (p, base = 0, extra = {}) => ({ recordId: p.id, base, operation: randomUUID(), payload: p, ...extra });
  test.each([['note', 'notes'], ['person', 'people'], ['group', 'quick-words'], ['preference', 'dictionary']])('reader can deliberately create %s without changing Book vocabulary', async (kind, category) => {
    const p = { ...B.addition(kind, category, 'Complete retained wording', randomUUID()), future: { keep: [1, 2] }, ...(kind === 'group' ? { words: [{ text: 'Wait, please.' }], name: 'Waiting' } : {}) };
    const a = await service.save('demo', 'reader', op(p));
    expect(a.outcome).toBe('accepted'); expect(a.latest.payload.future).toEqual(p.future);
    const b = await service.save('demo', 'reader', op({ ...p, text: 'Deliberate correction' }, 1));
    expect(b.revision).toBe(2);
    expect(M.validatePackage(JSON.stringify(M.exportPackage(await service.read('demo', 'reader'))), 'demo', 'owner', f.master, f.masterHash)).toBeTruthy();
    const word = f.workspaces.demo.records['b4420c84-a4cc-4b47-9d9e-bd6bd6dd4b53'].revisions[0].payload;
    await expect(service.save('demo', 'reader', op(word, 1))).rejects.toMatchObject({ status: 403 });
  });
  test('source note keeps its immutable original and same-name contacts stay distinct', async () => {
    const source = B.sources(f.workspaces.demo.content).find(p => p.binding.path[0] === 'notes');
    const result = await service.save('demo', 'reader', op({ ...source, text: 'Complete corrected ordinary note', archived: false }, 1));
    expect(result.latest.payload.original).toEqual(source.original);
    const contacts = B.sources(f.workspaces.demo.content).filter(p => p.binding.path[0] === 'contacts');
    expect(contacts).toHaveLength(2); expect(contacts[0].id).not.toBe(contacts[1].id);
    await service.save('demo', 'reader', op({ ...contacts[0], text: 'Morgan\nFriend', groups: ['Friends', 'Book club'] }, 1));
    expect(B.project((await service.read('demo', 'reader')).edition, f.master, f.masterHash).pages.find(p => p.id === contacts[1].id).text).toBe('Morgan');
  });
  test('Home slots save independently and same-slot stale Undo cannot replace a newer assignment', async () => {
    const one = B.addition('preference', 'home-slot:1', 'Home favourite 1', randomUUID());
    const two = B.addition('preference', 'home-slot:2', 'Home favourite 2', randomUUID());
    await service.save('demo', 'reader', op({ ...one, groupId: 'a' }));
    await service.save('demo', 'reader', op({ ...two, groupId: 'b' }));
    const second = await service.save('demo', 'alex', op({ ...one, groupId: 'c' }, 1));
    await service.save('demo', 'robin', op({ ...one, groupId: 'd' }, 2));
    const stale = await service.save('demo', 'reader', op(one, second.revision, { action: 'undo', target: second.revision }));
    expect(stale.outcome).toBe('conflict'); expect(stale.latest.payload.groupId).toBe('d');
    expect((await service.read('demo', 'reader')).records[two.id].current).toBe(1);
  });
  test('invalid kind/category and malformed group cannot enter an owned envelope', async () => {
    const p = { id: randomUUID(), kind: 'note', category: 'phrases', text: 'Forgery', binding: { source: 'addition', category: 'phrases' } };
    await expect(service.save('demo', 'reader', op(p))).rejects.toMatchObject({ status: 400 });
    const group = { ...p, kind: 'group', category: 'quick-words', binding: { source: 'addition', category: 'quick-words' }, words: [{ text: '' }] };
    await expect(service.save('demo', 'reader', op(group))).rejects.toMatchObject({ status: 400 });
  });
  test('large retained source metadata and subsequent preference history have a restorable complete backup', async () => {
    const p = { ...B.addition('person', 'people', 'Morgan', randomUUID()), name: 'Morgan', sourceMetadata: 'retained-source-' + 'x'.repeat(2300000) };
    await service.save('demo', 'reader', op(p));
    const pref = B.addition('preference', 'display', 'Display choices', randomUUID());
    await service.save('demo', 'reader', op(pref));
    const text = JSON.stringify(M.exportPackage(await service.read('demo', 'reader')));
    expect(M.validatePackage(text, 'demo', 'owner', f.master, f.masterHash).workspace.records[p.id].revisions[1].payload.sourceMetadata).toBe(p.sourceMetadata);
  });
});
