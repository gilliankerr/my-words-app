const { randomUUID } = require('node:crypto');
const B = require('../../../app-next/js/book-records');
const { WorkspaceService } = require('../../../server/next/workspace-service');
const { MemoryRepository } = require('../harness/memory-repository');
const { makeFixtures } = require('../fixtures');
const N = require('../../../app-next/js/notebooks');

test('owned situation notebook revisions preserve the complete envelope and stale same-account editing', async () => {
  const fixture = makeFixtures(), service = new WorkspaceService(new MemoryRepository(fixture.workspaces));
  const payload = B.addition('notebook', 'notebooks', 'Book club', randomUUID(), 'Book club');
  payload.notebook = { title: 'Book club', createdAt: '2026-10-06T12:00:00Z', sections: [{ id: 'opinions', name: 'Opinions', words: [{ text: 'Remarkable', usage: ['Opinion'], unknown: 'retain' }], messages: ['I enjoyed the ending.'], context: 'An adult conversation', future: { retain: true } }], frontMatter: { unknown: ['retain'] }, future: { retain: true } };
  const save = (p, base) => service.save('demo', 'owner', { recordId: p.id, base, operation: randomUUID(), payload: p });
  expect((await save(payload, 0)).outcome).toBe('accepted');
  const edited = structuredClone(payload); edited.notebook.sections[0].messages[0] = 'The ending surprised me.';
  expect((await save(edited, 1)).outcome).toBe('accepted');
  expect((await save({ ...payload, name: 'Other device' }, 1)).outcome).toBe('conflict');
  const state = await service.read('demo', 'owner');
  expect(B.latest(state.records[payload.id]).payload.notebook).toEqual(edited.notebook);
  expect(state.conflicts[0].proposal.payload.notebook).toEqual(payload.notebook);
  await expect(service.read('demo', 'outsider')).rejects.toMatchObject({ status: 403 });
});

test('Settings print choices put explicit stars first, then creation dates, without mutating reading order', () => {
  const record = (id, createdAt, printFavourite = false) => ({ id, kind: 'notebook', notebook: { title: id, createdAt, sections: [] }, printFavourite });
  const records = [record('old', '2024-02-01'), record('new', '2026-10-06'), record('star', '2020-01-01', true), record('unknown', 'not a date')];
  const before = structuredClone(records);
  expect(N.printOrder(records).map(p => p.id)).toEqual(['star', 'new', 'old', 'unknown']);
  expect(records).toEqual(before);
  expect(N.date(records[3])).toBeNull();
});

test('communication collection puts favourites first and newest creation next, retaining unknown dates last', () => {
  const records = [
    { id: 'old', kind: 'notebook', notebook: { createdAt: '2020-01-01' } },
    { id: 'new', kind: 'notebook', notebook: { data: { createdAt: '2026-10-07' } } },
    { id: 'favourite', kind: 'notebook', favourite: true, notebook: { createdAt: '2019-01-01' } },
    { id: 'unknown', kind: 'notebook', notebook: {} }
  ];
  expect(N.records({ records: () => records }).map(p => p.id)).toEqual(['favourite', 'new', 'old', 'unknown']);
  expect(records.map(p => p.id)).toEqual(['old', 'new', 'favourite', 'unknown']);
});

test('existing notebook sources retain envelope identity without reducing sections to generic words', () => {
  const content = makeFixtures().workspaces.demo.content;
  content.notebooks = [{ id: 21, title: 'Retained notebook', data: { sections: [{ name: 'Thoughts', messages: ['A complete opinion.'], future: 'keep' }], future: ['keep'] }, unknown: 'keep' }];
  const source = B.sources(content).find(p => p.kind === 'notebook');
  expect(source.notebook).toEqual(content.notebooks[0]);
  expect(source.original).toEqual(content.notebooks[0]);
  expect(source.binding.path).toEqual(['notebooks', 0]);
});
