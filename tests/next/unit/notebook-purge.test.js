const { randomUUID } = require('node:crypto');
const M = require('../../../app-next/js/model');
const B = require('../../../app-next/js/book-records');
const { WorkspaceService } = require('../../../server/next/workspace-service');
const { MemoryRepository } = require('../harness/memory-repository');
const { makeFixtures } = require('../fixtures');

test('confirmed bulk deletion erases notebook revisions, editions and receipts atomically and blocks stale recreation', async () => {
  const repository = new MemoryRepository(makeFixtures().workspaces), service = new WorkspaceService(repository);
  const p = B.addition('notebook', 'notebooks', 'Private fixture wording', randomUUID(), 'Private fixture');
  p.notebook = { title: p.name, sections: [{ name: 'Private', words: ['Secret fixture'] }] };
  await service.save('demo', 'reader', { recordId: p.id, base: 0, operation: randomUUID(), payload: p });
  const request = { confirmed: true, expected: { [p.id]: 1 }, operation: randomUUID(), privateEpoch: 0 };
  await expect(service.purgeNotebooks('demo', 'outsider', request)).rejects.toMatchObject({ status: 403 });
  await expect(service.purgeNotebooks('demo', 'reader', { ...request, confirmed: false })).rejects.toMatchObject({ status: 400 });
  await expect(service.purgeNotebooks('demo', 'reader', { ...request, expected: { [p.id]: 2 } })).rejects.toMatchObject({ status: 409 });
  repository.failNext = true;
  await expect(service.purgeNotebooks('demo', 'reader', request)).rejects.toThrow('Test persistence failed');
  expect((await service.read('demo', 'reader')).records[p.id]).toBeDefined();
  const result = await service.purgeNotebooks('demo', 'reader', request);
  expect(await service.purgeNotebooks('demo', 'reader', request)).toEqual(result);
  const state = await service.read('demo', 'reader');
  M.validateWorkspace(state);
  expect(JSON.stringify(repository.states.demo)).not.toMatch(/Private fixture|Secret fixture/);
  expect(state.records[p.id]).toBeUndefined();
  await expect(service.save('demo', 'reader', { recordId: p.id, base: 0, operation: randomUUID(), payload: p })).rejects.toMatchObject({ status: 410 });
});

test('a bulk request checks every revision before deleting and keeps unrelated content', async () => {
  const repository = new MemoryRepository(makeFixtures().workspaces), service = new WorkspaceService(repository);
  const payloads = ['Delete fixture', 'Keep fixture'].map(name => ({ ...B.addition('notebook', 'notebooks', name, randomUUID(), name), notebook: { title: name, sections: [] } }));
  for (const p of payloads) await service.save('demo', 'reader', { recordId: p.id, base: 0, operation: randomUUID(), payload: p });
  await expect(service.purgeNotebooks('demo', 'reader', { confirmed: true, expected: { [payloads[0].id]: 1, [payloads[1].id]: 2 }, operation: randomUUID() })).rejects.toMatchObject({ status: 409 });
  expect(Object.keys((await service.read('demo', 'reader')).records)).toEqual(expect.arrayContaining(payloads.map(p => p.id)));
  const before = M.clone(repository.states.demo.records[payloads[1].id]);
  await service.purgeNotebooks('demo', 'reader', { confirmed: true, expected: { [payloads[0].id]: 1 }, operation: randomUUID() });
  expect(repository.states.demo.records[payloads[1].id]).toEqual(before);
});

test('source notebook purge keeps other persistent source indices and scrubs restore copies', async () => {
  const fixture = makeFixtures();
  fixture.workspaces.demo.content.notebooks = [{ id: 11, title: 'Secret source fixture', sections: [] }, { id: 12, title: 'Keep source', sections: [] }];
  const repository = new MemoryRepository(fixture.workspaces), service = new WorkspaceService(repository);
  const p = B.sources(fixture.workspaces.demo.content).find(p => p.kind === 'notebook');
  repository.states.demo.restoreBackups = [{ package: M.exportPackage(repository.states.demo), importedSource: JSON.stringify(M.exportPackage(repository.states.demo)) }];
  await service.purgeNotebooks('demo', 'reader', { confirmed: true, expected: { [p.id]: 1 }, operation: randomUUID() });
  const state = await service.read('demo', 'reader');
  expect(JSON.stringify(state)).not.toContain('Secret source fixture');
  expect(state.content.notebooks[1].title).toBe('Keep source');
  expect(B.sources(state.content).filter(p => p.kind === 'notebook').map(p => p.name)).toEqual(['Keep source']);
  M.validateWorkspace(state);
});
