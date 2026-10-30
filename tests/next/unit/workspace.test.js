const { randomUUID } = require('node:crypto');
const { MemoryRepository } = require('../harness/memory-repository');
const { makeFixtures } = require('../fixtures');
const { WorkspaceService } = require('../../../server/next/workspace-service');
const { validateDatabaseTarget } = require('../harness/database');

describe('synthetic revision boundary (injected memory persistence)', () => {
  let service, repository, fixture;
  beforeEach(() => {
    fixture = makeFixtures();
    repository = new MemoryRepository(fixture.workspaces);
    service = new WorkspaceService(repository);
  });
  const request = (payload, base = 1) => ({ recordId: 'b4420c84-a4cc-4b47-9d9e-bd6bd6dd4b53', base, operation: randomUUID(), payload });
  test('stale simultaneous proposals retain both full envelopes and authenticated authors', async () => {
    const payload = structuredClone(fixture.workspaces.demo.records['b4420c84-a4cc-4b47-9d9e-bd6bd6dd4b53'].revisions[0].payload);
    const a = request({ ...payload, text: 'More time, please.' });
    const b = request({ ...payload, text: 'Please wait for me.' });
    const results = await Promise.all([service.save('demo', 'alex', a), service.save('demo', 'robin', b)]);
    expect(results.map(r => r.outcome).sort()).toEqual(['accepted', 'conflict']);
    const state = await service.read('demo', 'reader');
    expect(state.records['b4420c84-a4cc-4b47-9d9e-bd6bd6dd4b53'].current).toBe(2);
    expect(state.records['b4420c84-a4cc-4b47-9d9e-bd6bd6dd4b53'].revisions).toHaveLength(2);
    expect(state.conflicts[0].proposal.payload.text).toBe('Please wait for me.');
    expect(state.conflicts[0].proposal.payload.future.nested).toEqual(['keep', { colour: 'bleu' }]);
    expect(state.conflicts[0].author).toBe('robin');
    expect(await service.save('demo', 'alex', a)).toEqual(results[0]);
    await expect(service.save('demo', 'alex', { ...a, payload: b.payload })).rejects.toMatchObject({ status: 409 });
  });
  test('independent records save separately; empty input never erases saved wording', async () => {
    const state = await service.read('demo', 'alex');
    await service.save('demo', 'alex', request({ ...state.records['b4420c84-a4cc-4b47-9d9e-bd6bd6dd4b53'].revisions[0].payload, text: 'Wait.' }));
    const page = state.records['e6f89c93-0c18-49e9-9aaf-9134fa14b72d'].revisions[0].payload;
    expect((await service.save('demo', 'robin', { ...request({ ...page, text: 'First paragraph.\n\n• Second part.' }), recordId: 'e6f89c93-0c18-49e9-9aaf-9134fa14b72d' })).outcome).toBe('accepted');
    await expect(service.save('demo', 'alex', request({ ...page, text: '  ' }, 2))).rejects.toMatchObject({ status: 400 });
  });
  test('reader, unrelated actor, forged actor and revoked editor cannot mutate or disclose', async () => {
    const payload = fixture.workspaces.demo.records['b4420c84-a4cc-4b47-9d9e-bd6bd6dd4b53'].revisions[0].payload;
    await expect(service.read('demo', 'outsider')).rejects.toMatchObject({ status: 403 });
    await expect(service.save('demo', 'reader', request(payload))).rejects.toMatchObject({ status: 403 });
    await expect(service.grant('demo', 'alex', 'outsider', 'manager')).rejects.toMatchObject({ status: 403 });
    await service.grant('demo', 'owner', 'alex', null);
    await expect(service.save('demo', 'alex', { ...request(payload), actor: 'owner' })).rejects.toMatchObject({ status: 403 });
    await expect(service.receipt('demo', 'outsider', 'phone', 'x', false)).rejects.toMatchObject({ status: 403 });
  });
  test('tombstone and undo after another save conflict without resurrection', async () => {
    const payload = fixture.workspaces.demo.records['b4420c84-a4cc-4b47-9d9e-bd6bd6dd4b53'].revisions[0].payload;
    await service.save('demo', 'alex', { ...request(payload), action: 'remove' });
    const stale = await service.save('demo', 'robin', request({ ...payload, text: 'Offline edit' }));
    expect(stale.outcome).toBe('conflict');
    expect(stale.latest.payload.tombstone).toBe(true);
    const undone = await service.save('demo', 'robin', { ...request(payload, 1), action: 'undo', target: 2 });
    expect(undone.outcome).toBe('conflict');
    const restored = await service.save('demo', 'alex', { ...request(payload, 2), action: 'restore', target: 1 });
    expect(restored.latest.payload.tombstone).toBe(false);
    expect((await service.read('demo', 'reader')).records['b4420c84-a4cc-4b47-9d9e-bd6bd6dd4b53'].revisions).toHaveLength(3);
  });
  test('failed persistence rolls back pointer, history and idempotency result', async () => {
    repository.failNext = true;
    const payload = fixture.workspaces.demo.records['b4420c84-a4cc-4b47-9d9e-bd6bd6dd4b53'].revisions[0].payload;
    await expect(service.save('demo', 'alex', request({ ...payload, text: 'Unsaved' }))).rejects.toThrow('persistence');
    expect((await service.read('demo', 'reader')).records['b4420c84-a4cc-4b47-9d9e-bd6bd6dd4b53'].current).toBe(1);
  });
  test('undo of restoration restores the exact prior tombstone; reviewed resurrection keeps proposed wording', async () => {
    const payload = fixture.workspaces.demo.records['b4420c84-a4cc-4b47-9d9e-bd6bd6dd4b53'].revisions[0].payload;
    await service.save('demo', 'alex', { ...request(payload), action: 'remove' });
    await service.save('demo', 'alex', { ...request(payload, 2), action: 'restore', target: 1 });
    const inverse = await service.save('demo', 'alex', { ...request(payload, 3), action: 'undo', target: 3 });
    expect(inverse.latest.payload.tombstone).toBe(true);
    const candidate = await service.save('demo', 'alex', { ...request({ ...payload, text: 'Reviewed new wording' }, 4), action: 'resurrect' });
    expect(candidate.latest.payload.text).toBe('Reviewed new wording');
    expect(candidate.latest.payload.tombstone).toBe(false);
  });
  test('omitted unknown nested metadata is retained while explicit metadata edits survive', async () => {
    const payload = fixture.workspaces.demo.records['b4420c84-a4cc-4b47-9d9e-bd6bd6dd4b53'].revisions[0].payload;
    const partial = { ...payload, text: 'Correction', future: { additional: 'new metadata' } };
    const result = await service.save('demo', 'alex', request(partial));
    expect(result.latest.payload.future.nested).toEqual(['keep', { colour: 'bleu' }]);
    expect(result.latest.payload.future.additional).toBe('new metadata');
  });
  test('receipt is distinct from adoption and must refer to a real edition', async () => {
    const state = await service.read('demo', 'reader');
    await expect(service.receipt('demo', 'reader', 'phone', 'made-up', false)).rejects.toMatchObject({ status: 400 });
    await expect(service.receipt('demo', 'reader', 'phone', state.edition.id, true)).rejects.toMatchObject({ status: 409 });
    await service.receipt('demo', 'reader', 'phone', state.edition.id, false);
    expect((await service.read('demo', 'alex')).receipts['reader:phone'].adopted).toBeNull();
    await service.receipt('demo', 'reader', 'phone', state.edition.id, true);
    expect((await service.read('demo', 'alex')).receipts['reader:phone'].adopted).toBe(state.edition.id);
  });
});

test.each([
  [{ DATABASE_URL: 'postgres://localhost/production' }, 'inherited'],
  [{ NEXT_TEST_DATABASE_URL: 'postgres://example.com/cn_next_disposable_test' }, 'loopback'],
  [{ NEXT_TEST_DATABASE_URL: 'postgres://localhost/main' }, 'marker'],
  [{ NEXT_TEST_DATABASE_URL: 'postgres://test@localhost/cn_next_disposable_guard' }, 'credentials'],
  [{ NEXT_TEST_DATABASE_URL: 'postgres://:test@localhost/cn_next_disposable_guard' }, 'credentials'],
  [{ NEXT_TEST_DATABASE_URL: 'postgres://test:test@localhost/cn_next_disposable_guard?host=remote' }, 'overrides'],
  [{ NEXT_TEST_DATABASE_URL: 'postgres://test:test@localhost/cn_next_disposable_guard#override' }, 'overrides'],
  [{}, 'explicit']
])('DB guard fails closed before connecting (%s)', (env, error) => {
  expect(() => validateDatabaseTarget(env)).toThrow(error);
});

test('two devices using the same account still retain a stale complete proposal', async () => {
  const fixture = makeFixtures(), repository = new MemoryRepository(fixture.workspaces), service = new WorkspaceService(repository);
  const id = 'e6f89c93-0c18-49e9-9aaf-9134fa14b72d', payload = fixture.workspaces.demo.records[id].revisions[0].payload;
  const change = text => ({ recordId: id, base: 1, operation: randomUUID(), payload: { ...structuredClone(payload), text } });
  const a = change('First device wording'), b = change('Second device wording');
  const results = await Promise.all([service.save('demo', 'owner', a), service.save('demo', 'owner', b)]);
  expect(results.map(r => r.outcome).sort()).toEqual(['accepted', 'conflict']);
  const stored = await service.read('demo', 'owner');
  expect(stored.conflicts[0].proposal.payload.text).toBe('Second device wording');
  expect(stored.conflicts[0].proposal.payload.future).toEqual(payload.future);
  expect(await service.save('demo', 'owner', b)).toEqual(results[1]);
});
