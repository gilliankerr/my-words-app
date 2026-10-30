const fs = require('node:fs');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const M = require('../../../app-next/js/model');
const B = require('../../../app-next/js/book-records');
const { makeFixtures } = require('../fixtures');
const { MemoryRepository } = require('../harness/memory-repository');
const { WorkspaceService } = require('../../../server/next/workspace-service');
const context = { NextModel: M, crypto: { randomUUID } };
vm.createContext(context); vm.runInContext(fs.readFileSync('app-next/js/sync.js', 'utf8'), context);

function harness(action = 'edit', mutate = x => x, id = 'e6f89c93-0c18-49e9-9aaf-9134fa14b72d') {
  const fixture = makeFixtures(), service = new WorkspaceService(new MemoryRepository(fixture.workspaces));
  const base = fixture.workspaces.demo.records[id];
  const payload = { ...M.clone(B.latest(base).payload), text: 'New complete wording', future: { paragraphStyle: 'keep', next: ['retained'] } };
  const operation = { recordId: id, base: 1, payload, action, operation: randomUUID() };
  let saved = { snapshot: M.exportPackage(fixture.workspaces.demo).workspace, baselines: {}, drafts: { [id]: { id, base: 1, payload: M.clone(payload), operation: operation.operation, state: 'waiting' } }, outbox: [operation], outcomes: {} };
  const calls = [];
  const store = {
    downloadVersion: async () => null,
    read: async () => M.clone(saved),
    update: async (_, __, fn) => { const next = fn(M.clone(saved)); M.validateWorkspace(next.snapshot); saved = next; return M.clone(saved); },
    receive: async (_, snapshot) => { M.validateWorkspace(snapshot); saved.snapshot = M.clone(snapshot); return M.clone(saved); }
  };
  const repo = {
    session: async () => ({ actor: 'alex' }),
    request: async (path, body) => {
      if (path.endsWith('/operations')) { calls.push(M.clone(body)); return mutate(await service.save('demo', 'alex', body)); }
      if (path.endsWith('/receipts')) return { success: true };
      return service.read('demo', 'alex');
    }
  };
  return { id, operation, service, calls, store, repo, sync: new context.NextSync(store, repo, 'alex', 'demo', 'device'), read: () => M.clone(saved), change: fn => { saved = fn(M.clone(saved)); } };
}

test.each([
  ['future fields', r => { delete r.latest.payload.future; }],
  ['original source', r => { delete r.latest.payload.originals; }],
  ['identity kind', r => { r.latest.payload.kind = 'note'; }],
  ['unexpected field', r => { r.latest.payload.invented = 'Unknown receipt mutation'; }],
  ['wrong base', r => { r.latest.base = 0; }],
  ['wrong revision', r => { r.revision = 7; r.latest.number = 7; }],
  ['wrong author', r => { r.latest.author = 'robin'; }],
  ['wrong action', r => { r.latest.action = 'remove'; }],
  ['missing timestamp', r => { delete r.latest.at; }],
  ['empty edition', r => { r.edition = ''; }]
])('malformed accepted save (%s) preserves the exact local envelope, draft and original retry', async (_, change) => {
  const h = harness('edit', result => { const copy = M.clone(result); change(copy); return copy; });
  const before = M.canonical(h.read());
  await expect(h.sync.send()).rejects.toThrow(/Invalid/);
  expect(M.canonical(h.read())).toBe(before);
  expect(h.calls).toEqual([h.operation]);
});

test.each(['edit', 'remove', 'resurrect'])('legitimate complete %s acknowledgement preserves full envelope', async action => {
  const h = harness(action); await h.sync.send();
  const result = h.read(); expect(result.outbox).toEqual([]);
  const current = B.latest(result.snapshot.records[h.id]);
  expect(current).toMatchObject({ number: 2, base: 1, author: 'alex', operation: h.operation.operation, action });
  expect(current.payload).toEqual({ ...M.preserve(result.snapshot.records[h.id].revisions[0].payload, h.operation.payload), tombstone: action === 'remove' });
});

test('a deliberately saved later payload chains after the unchanged original retry', async () => {
  const h = harness(); const desired = { ...h.operation.payload, text: 'Later deliberate save', future: { paragraphStyle: 'keep', next: ['retained'], later: true } };
  h.change(v => { v.drafts[h.id].payload = desired; return v; });
  await h.sync.send();
  expect(h.calls).toHaveLength(2); expect(h.calls[0]).toEqual(h.operation);
  expect(h.calls[1]).toMatchObject({ base: 2, payload: desired, action: 'edit' });
  expect(h.calls[1].operation).not.toBe(h.operation.operation);
  expect(B.latest(h.read().snapshot.records[h.id]).payload.text).toBe(desired.text);
});

test('an unsaved editor draft attached to a pending operation never auto-submits or disappears', async () => {
  const h = harness(); const input = { ...h.operation.payload, text: 'Unfinished personal wording' };
  h.change(v => { v.drafts[h.id] = { ...v.drafts[h.id], state: 'draft', payload: input }; return v; });
  await h.sync.send();
  expect(h.calls).toEqual([h.operation]);
  expect(h.read().drafts[h.id]).toMatchObject({ state: 'draft', payload: input });
});

test('a lifecycle acknowledgement retains attached unfinished wording without publishing it', async () => {
  const h = harness('remove'); const draft = { id: h.id, base: 1, state: 'draft', payload: { ...h.operation.payload, text: 'Unfinished edit before removal' } };
  h.change(v => { v.retainedDrafts = { [h.id]: draft }; return v; });
  await h.sync.send(); expect(h.calls).toEqual([h.operation]);
  expect(h.read().drafts[h.id]).toEqual(draft); expect(h.read().retainedDrafts).toEqual({});
});

test.each(['undo', 'restore'])('a genuine %s receipt restores the complete historical target envelope', async action => {
  const h = harness('remove'); await h.sync.send();
  const current = B.latest(h.read().snapshot.records[h.id]);
  const operation = { recordId: h.id, base: 2, target: action === 'undo' ? 2 : 1, action, payload: current.payload, operation: randomUUID() };
  h.change(v => { v.outbox = [operation]; v.drafts[h.id] = { id: h.id, base: 2, payload: current.payload, operation: operation.operation, state: 'waiting' }; return v; });
  await h.sync.send();
  expect(B.latest(h.read().snapshot.records[h.id]).payload).toEqual(h.read().snapshot.records[h.id].revisions[0].payload);
  expect(h.calls).toHaveLength(2);
});

test('an omitted immutable binding cannot acknowledge a source word', async () => {
  const h = harness('edit', result => { const copy = M.clone(result); delete copy.latest.payload.binding; return copy; }, 'b4420c84-a4cc-4b47-9d9e-bd6bd6dd4b53');
  const before = M.canonical(h.read()); await expect(h.sync.send()).rejects.toThrow(/Invalid/); expect(M.canonical(h.read())).toBe(before);
});

test('retry after an incomplete success response keeps its original operation and accepts one server revision', async () => {
  let malformed = true;
  const h = harness('edit', result => { const copy = M.clone(result); if (malformed) delete copy.latest.payload.future; return copy; });
  const before = M.canonical(h.read()); await expect(h.sync.send()).rejects.toThrow(/Invalid/); expect(M.canonical(h.read())).toBe(before);
  malformed = false; await h.sync.send();
  expect(h.calls).toEqual([h.operation, h.operation]); expect(h.read().snapshot.records[h.id].current).toBe(2);
  expect(h.read().snapshot.records[h.id].revisions).toHaveLength(2); expect(h.read().outbox).toEqual([]);
});

async function shoppingHarness(mutate = x => x) {
  const h = harness('edit', mutate), item = { ...B.addition('shopping', 'shopping-list', 'Fictional lentils', randomUUID()), checked: true, quantity: 'Two', future: { retain: ['all fields'] } };
  await h.service.save('demo', 'alex', { recordId: item.id, base: 0, payload: item, operation: randomUUID() });
  const snapshot = await h.service.read('demo', 'alex');
  const reset = { action: 'clear-shopping', expected: { [item.id]: 1 }, operation: randomUUID() };
  h.change(v => { v.snapshot = snapshot; v.outbox = [reset]; v.drafts = {}; return v; });
  return { ...h, item, reset };
}
test('an incomplete list-reset receipt retains every item envelope and its waiting operation', async () => {
  const h = await shoppingHarness(result => { const copy = M.clone(result); delete Object.values(copy.revisions)[0].payload.future; return copy; });
  const before = M.canonical(h.read()); await expect(h.sync.send()).rejects.toThrow(/Invalid/); expect(M.canonical(h.read())).toBe(before);
});
test('a legitimate list-reset receipt changes checked state only', async () => {
  const h = await shoppingHarness(); await h.sync.send();
  expect(B.latest(h.read().snapshot.records[h.item.id]).payload).toEqual({ ...h.item, checked: false }); expect(h.read().outbox).toEqual([]);
});
test.each(['omitted record', 'changed historical envelope', 'changed historical author', 'wrong owner', 'acknowledged rollback'])('a malformed same-epoch download (%s) cannot replace the saved bytes', async mutation => {
  const h = harness(); await h.sync.send(); const before = M.canonical(h.read());
  const originalRequest = h.repo.request;
  h.repo.request = async (path, body) => {
    const snapshot = await originalRequest(path, body);
    if (path !== 'workspaces/demo') return snapshot;
    if (mutation === 'wrong owner') snapshot.owner = 'another-owner';
    if (mutation === 'omitted record') { delete snapshot.records[h.id]; for (const edition of Object.values(snapshot.editions)) { delete edition.revisions[h.id]; delete edition.payloads[h.id]; } snapshot.edition = M.clone(snapshot.editions[snapshot.edition.id]); }
    if (mutation === 'changed historical envelope') { delete snapshot.records[h.id].revisions[0].payload.future; for (const edition of Object.values(snapshot.editions)) if (edition.revisions[h.id] === 1) delete edition.payloads[h.id].future; }
    if (mutation === 'changed historical author') snapshot.records[h.id].revisions[0].author = 'robin';
    if (mutation === 'acknowledged rollback') { snapshot.records[h.id].current = 1; snapshot.records[h.id].revisions.pop(); snapshot.edition = snapshot.editions['edition-seed']; delete snapshot.editions[Object.keys(snapshot.editions).find(id => id !== 'edition-seed')]; }
    return snapshot;
  };
  let error; await h.sync.download().catch(e => { error = e; });
  expect(error?.message || '').toMatch(/Invalid/); expect(M.canonical(h.read())).toBe(before);
});
test('an explicit private restore epoch may contain reviewed replacement history without stale receipt rejection', async () => {
  const h = harness(); await h.sync.send(); const replacement = M.exportPackage(makeFixtures().workspaces.demo).workspace;
  replacement.privateEpoch = 1;
  // The explicit local restore already committed the reviewed generation.
  h.change(value => { value.snapshot = M.clone(replacement); value.outcomes = {}; return value; });
  const request = h.repo.request; h.repo.request = async (path, body) => path === 'workspaces/demo' ? M.clone(replacement) : request(path, body);
  await h.sync.download(); await h.sync.download();
  expect(h.read().snapshot.privateEpoch).toBe(1); expect(h.read().snapshot.records[h.id].current).toBe(1);
});
test('an incomplete conflict proposal cannot retire the full waiting operation', async () => {
  const h = harness('edit', result => { const copy = M.clone(result); delete copy.conflict.proposal.payload.future; return copy; });
  await h.service.save('demo', 'robin', { ...h.operation, operation: randomUUID(), payload: { ...h.operation.payload, text: 'Other saved wording' } });
  const before = M.canonical(h.read()); let error; await h.sync.send().catch(e => { error = e; });
  expect(error?.message || '').toMatch(/Invalid/); expect(M.canonical(h.read())).toBe(before);
});
test('a genuine conflict retains the full proposal and the independent newer record', async () => {
  const h = harness(); await h.service.save('demo', 'robin', { ...h.operation, operation: randomUUID(), payload: { ...h.operation.payload, text: 'Other saved wording' } });
  await h.sync.send();
  expect(h.read().drafts[h.id]).toMatchObject({ state: 'conflict', payload: h.operation.payload });
  expect(B.latest(h.read().snapshot.records[h.id]).payload.text).toBe('Other saved wording');
});
test('new additions accept the authoritative creation baseline while preserving the exact acknowledged current envelope', async () => {
  const h = harness(), initial = B.addition('page', 'personal', 'New personal passage', randomUUID(), 'New passage');
  const payload = { ...initial, text: 'Final complete wording', future: { keep: true } };
  const operation = { recordId: initial.id, base: 0, operation: randomUUID(), action: 'edit', payload };
  h.change(v => {
    v.baselines[initial.id] = { id: initial.id, current: 0, revisions: [{ number: 0, base: 0, operation: 'new', author: 'alex', at: '2026-10-04T10:00:00.000Z', payload: { ...initial, tombstone: true } }] };
    v.outbox = [operation]; v.drafts = { [initial.id]: { id: initial.id, base: 0, payload, operation: operation.operation, state: 'waiting' } }; return v;
  });
  let error; await h.sync.send().catch(e => { error = e; }); expect(error?.message).toBeUndefined();
  const result = h.read(); expect(result.outbox).toEqual([]); expect(B.latest(result.snapshot.records[initial.id]).payload).toEqual(payload);
  expect(result.snapshot.records[initial.id].revisions[0].payload.text).toBe('Final complete wording');
  const before = M.canonical(result), request = h.repo.request;
  h.repo.request = async (path, body) => { const incoming = await request(path, body); if (path === 'workspaces/demo') incoming.records[initial.id].revisions[0].payload.text = 'Changed authoritative baseline'; return incoming; };
  await expect(h.sync.download()).rejects.toThrow(/Invalid/); expect(M.canonical(h.read())).toBe(before);
});

test('another device restore holds the incoming book without replacing local reading, drafts or retries', async () => {
  const h = harness(), before = h.read();
  const preview = await h.service.restorePreview('demo', 'owner');
  await h.service.restoreShared('demo', 'owner', { text: JSON.stringify(M.exportPackage(makeFixtures().workspaces.demo)), confirmed: true, expected: preview.fingerprint, operation: randomUUID() });
  await expect(h.sync.download()).rejects.toThrow(/restored.*another device/i);
  const held = h.read();
  expect(held.snapshot).toEqual(before.snapshot); expect(held.drafts).toEqual(before.drafts); expect(held.outbox).toEqual(before.outbox);
  expect(held.pendingRestoration.privateEpoch).toBe(1); expect(held.restoreHold.reason).toBe('shared-restore');
  await expect(h.sync.send()).rejects.toThrow(/restoration needs attention/i);
  expect(h.calls).toEqual([]);
});

test('concurrent background send requests share one transmission and retain later local choices', async () => {
  const h = harness(); let release;
  const barrier = new Promise(resolve => { release = resolve; });
  const request = h.repo.request;
  let waiting; const started = new Promise(resolve => { waiting = resolve; });
  h.repo.request = async (path, body) => { if (path.endsWith('/operations')) { waiting(); await barrier; } return request(path, body); };
  const first = h.sync.send(), second = h.sync.send(); expect(second).toBe(first);
  await started;
  const desired = { ...h.operation.payload, text: 'Latest rapid choice', future: { retained: true } };
  h.change(value => { value.drafts[h.id].payload = desired; return value; });
  release(); await Promise.all([first, second]);
  expect(h.calls).toHaveLength(2); expect(h.calls[0]).toEqual(h.operation);
  expect(h.calls[1].base).toBe(2); expect(h.calls[1].payload).toEqual(desired);
  expect(B.latest(h.read().snapshot.records[h.id]).payload.text).toBe(desired.text);
  expect(h.read().outbox).toEqual([]);
});
