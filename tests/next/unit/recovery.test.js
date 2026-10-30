const M = require('../../../app-next/js/model');
const B = require('../../../app-next/js/book-records');
const { makeFixtures } = require('../fixtures');
const { randomUUID } = require('node:crypto');

function pending() {
  const f = makeFixtures(), id = randomUUID();
  const payload = { ...B.addition('note', 'notes', 'Waiting complete wording', id), future: { keep: ['untouched'] } };
  const baseline = { id, current: 0, revisions: [{ number: 0, base: 0, payload: { ...payload, tombstone: true }, author: 'alex', operation: 'new', at: new Date().toISOString() }] };
  const op = { recordId: id, base: 0, payload, operation: randomUUID() };
  const bundle = { schema: 1, type: 'cn-next-drafts', actor: 'alex', workspace: 'demo', baselines: { [id]: baseline }, drafts: { [id]: { id, base: 0, payload, state: 'waiting', operation: op.operation } }, retainedDrafts: { [id]: { id, base: 0, payload: { ...payload, text: 'Private unfinished wording' }, state: 'draft' } }, outbox: [op] };
  return { f, id, bundle };
}
test('complete pending and attached private drafts validate without dropping unknown fields', () => {
  const { f, bundle } = pending();
  expect(M.validateDraftBundle(bundle, f.workspaces.demo, f.master, f.masterHash)).toEqual(bundle);
  for (const mutate of [b => { b.drafts[Object.keys(b.drafts)[0]].base = 20; }, b => { b.outbox[0].payload.id = randomUUID(); }, b => { b.baselines[Object.keys(b.baselines)[0]].revisions[0].payload.kind = 'executable'; }]) {
    const bad = M.clone(bundle); mutate(bad);
    expect(() => M.validateDraftBundle(bad, f.workspaces.demo, f.master, f.masterHash)).toThrow();
  }
});
test('workspace backup retains submitted waiting work separately and rejects invalid recovery before replacement', () => {
  const { f, bundle } = pending();
  const pkg = { ...M.exportPackage(f.workspaces.demo), recovery: { ...bundle, retainedDrafts: {} } };
  expect(M.validatePackage(JSON.stringify(pkg), 'demo', 'owner', f.master, f.masterHash).recovery).toEqual(pkg.recovery);
  pkg.recovery.outbox[0].base = 99;
  expect(() => M.validatePackage(JSON.stringify(pkg), 'demo', 'owner', f.master, f.masterHash)).toThrow('reference');
});
