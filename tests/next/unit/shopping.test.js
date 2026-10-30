const { randomUUID } = require('node:crypto');
const M = require('../../../app-next/js/model');
const B = require('../../../app-next/js/book-records');
const { makeFixtures } = require('../fixtures');
const { MemoryRepository } = require('../harness/memory-repository');
const { WorkspaceService } = require('../../../server/next/workspace-service');
const request = (payload, base = 0, action = 'edit', extra = {}) => ({ payload, recordId: payload.id, base, action, operation: randomUUID(), ...extra });
function setup() { const f = makeFixtures(); return { w: f.workspaces.demo, service: new WorkspaceService(new MemoryRepository(f.workspaces)) }; }
test('shopping changes are recoverable and preserve metadata without publishing a new book', async () => {
  const { w, service } = setup();
  const payload = { ...B.addition('shopping', 'shopping-list', 'Lentils', randomUUID()), quantity: 'Two tins', future: { retain: true } };
  const added = await service.save('demo', 'reader', request(payload));
  const ticked = await service.save('demo', 'reader', request({ ...added.latest.payload, checked: true }, 1));
  const removed = await service.save('demo', 'reader', request(ticked.latest.payload, 2, 'remove'));
  const restored = await service.save('demo', 'reader', request(removed.latest.payload, 3, 'restore', { target: 2 }));
  expect(restored.latest.payload).toMatchObject({ checked: true, tombstone: false, quantity: 'Two tins', future: { retain: true } });
  expect((await service.read('demo', 'reader')).edition.id).toBe(w.edition.id);
  await expect(service.save('demo', 'outsider', request(payload))).rejects.toMatchObject({ status: 403 });
  await expect(service.save('demo', 'reader', request(B.addition('page', 'personal', 'Cannot edit book', randomUUID())))).rejects.toMatchObject({ status: 403 });
});
test('Clear all atomically unticks existing items, preserves both stale versions and retries without duplicate revisions', async () => {
  const { w, service } = setup();
  const a = B.addition('shopping', 'shopping-list', 'Apples', randomUUID()), b = B.addition('shopping', 'shopping-list', 'Lentils', randomUUID());
  await service.save('demo', 'alex', request({ ...a, checked: true })); await service.save('demo', 'robin', request({ ...b, checked: true }));
  const stale = { action: 'clear-shopping', expected: { [a.id]: 1, [b.id]: 1 }, operation: randomUUID() };
  await service.save('demo', 'reader', request({ ...a, checked: false }, 1));
  const conflict = await service.save('demo', 'reader', stale);
  expect(conflict.outcome).toBe('conflict');
  const before = await service.read('demo', 'reader'); expect(B.latest(before.records[b.id]).payload.checked).toBe(true);
  const fresh = { ...stale, expected: { [a.id]: 2, [b.id]: 1 }, operation: randomUUID() };
  const cleared = await service.save('demo', 'reader', fresh); expect(cleared.outcome).toBe('accepted');
  expect(await service.save('demo', 'reader', fresh)).toEqual(cleared);
  const after = await service.read('demo', 'reader');
  expect([a, b].map(p => B.latest(after.records[p.id]).payload.checked)).toEqual([false, false]);
  expect(B.latest(after.records[b.id]).payload.text).toBe('Lentils'); expect(after.edition.id).toBe(w.edition.id);
  expect(after.shoppingConflicts[0].expected).toEqual(stale.expected);
  expect(M.validatePackage(JSON.stringify(M.exportPackage(after)), 'demo', 'owner').workspace.shoppingConflicts).toEqual(after.shoppingConflicts);
});
