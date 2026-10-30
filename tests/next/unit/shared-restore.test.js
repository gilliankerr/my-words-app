const { randomUUID } = require('node:crypto');
const { WorkspaceService } = require('../../../server/next/workspace-service');
const { MemoryRepository } = require('../harness/memory-repository');
const { makeFixtures } = require('../fixtures');
const M = require('../../../app-next/js/model');
test('owned shared restoration is revision-checked, backed up, retry-safe and rejects old-device operations', async () => {
  const fixtures = makeFixtures(), repository = new MemoryRepository(fixtures.workspaces), service = new WorkspaceService(repository);
  const source = M.exportPackage(fixtures.workspaces.demo); source.workspace.future = { complete: ['retained'] };
  const preview = await service.restorePreview('demo', 'owner');
  const request = { text: JSON.stringify(source), confirmed: true, expected: preview.fingerprint, operation: randomUUID() };
  await expect(service.restoreShared('demo', 'alex', request)).rejects.toMatchObject({ status: 403 });
  await expect(service.restoreShared('demo', 'owner', { ...request, confirmed: false })).rejects.toMatchObject({ status: 400 });
  const restored = await service.restoreShared('demo', 'owner', request);
  expect(restored.workspace.future).toEqual(source.workspace.future); expect(restored.workspace.privateEpoch).toBe(1);
  expect(restored.workspace.restoreBackups).toHaveLength(1); expect(restored.workspace.restoreBackups[0].package).toEqual(M.exportPackage(fixtures.workspaces.demo));
  expect(await service.restoreShared('demo', 'owner', request)).toEqual(restored);
  await expect(service.restoreShared('demo', 'owner', { ...request, text: request.text + ' ' })).rejects.toMatchObject({ status: 409 });
  const record = Object.values(source.workspace.records)[0], payload = M.clone(record.revisions.find(r => r.number === record.current).payload);
  await expect(service.save('demo', 'owner', { recordId: record.id, payload, base: record.current, operation: randomUUID(), privateEpoch: 0 })).rejects.toMatchObject({ status: 409 });
  expect((await service.read('demo', 'owner')).restoreBackups).toHaveLength(1);
});
test('malformed or stale restore proposals leave complete owned state unchanged', async () => {
  const fixtures = makeFixtures(), service = new WorkspaceService(new MemoryRepository(fixtures.workspaces));
  const source = M.exportPackage(fixtures.workspaces.demo), before = M.canonical(await service.read('demo', 'owner'));
  const preview = await service.restorePreview('demo', 'owner');
  for (const request of [{ text: '{}', expected: preview.fingerprint }, { text: JSON.stringify(source), expected: '0'.repeat(64) }]) {
    await expect(service.restoreShared('demo', 'owner', { ...request, confirmed: true, operation: randomUUID() })).rejects.toMatchObject({ status: expect.any(Number) });
    expect(M.canonical(await service.read('demo', 'owner'))).toBe(before);
  }
});
