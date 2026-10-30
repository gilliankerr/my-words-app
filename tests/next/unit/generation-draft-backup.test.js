const { randomUUID } = require('node:crypto');
const M = require('../../../app-next/js/model');
const B = require('../../../app-next/js/book-records');
const { makeFixtures } = require('../fixtures');
test('clue-only rapid drafts export and restore without manufacturing a word bank', () => {
  const workspace = makeFixtures().workspaces.demo, id = randomUUID();
  const payload = { ...B.addition('group', 'quick-words', 'Quick words', id), words: [], selection: [], rapid: { entry: 'Unfinished synthetic clue', keywords: '', originalWordCount: 0, clueHistory: [] } };
  const bundle = { schema: 1, type: 'cn-next-drafts', actor: 'owner', workspace: 'demo', baselines: { [id]: { id, current: 0, revisions: [{ number: 0, base: 0, payload: { ...structuredClone(payload), tombstone: true }, author: 'owner' }] } }, drafts: { [id]: { id, base: 0, payload, state: 'draft' } }, outbox: [] };
  const original = M.canonical(bundle);
  expect(M.validateDraftBundle(bundle, workspace)).toBe(bundle); expect(M.canonical(bundle)).toBe(original);
  expect(() => B.validatePayload(payload)).toThrow(/word group/);
  bundle.outbox.push({ operation: randomUUID(), recordId: id, base: 0, payload });
  expect(() => M.validateDraftBundle(bundle, workspace)).toThrow(/word group/);
});
