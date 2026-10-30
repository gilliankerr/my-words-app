const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { validateDatabaseTarget, verifyDatabaseTarget } = require('../harness/database');
const { RevisionRepository } = require('../../../server/next/revision-repository');
const { WorkspaceService } = require('../../../server/next/workspace-service');
const { makeFixtures } = require('../fixtures');
const B = require('../../../app-next/js/book-records');
const run = process.env.NEXT_TEST_DATABASE_URL ? describe : describe.skip;
run('REAL disposable PostgreSQL transactions (requires explicit target)', () => {
  let pool, service, workspace, id;
  beforeAll(async () => {
    const connectionString = validateDatabaseTarget(process.env);
    const { Pool } = require('pg'); pool = new Pool({ connectionString, max: 4 });
    await verifyDatabaseTarget(pool);
    await pool.query(fs.readFileSync(path.join(__dirname, '../schema.sql'), 'utf8'));
    service = new WorkspaceService(new RevisionRepository(pool));
  });
  beforeEach(async () => {
    workspace = makeFixtures().workspaces.demo; id = 'test-' + randomUUID(); workspace.id = id;
    workspace.edition.workspace = id; workspace.editions['edition-seed'].workspace = id;
    await pool.query('INSERT INTO next_workspaces(id,state) VALUES($1,$2::jsonb)', [id, JSON.stringify(workspace)]);
  });
  afterEach(async () => { if (pool && id) await pool.query('DELETE FROM next_workspaces WHERE id=$1', [id]); });
  afterAll(async () => { if (pool) await pool.end(); });
  const operation = text => ({ recordId: 'b4420c84-a4cc-4b47-9d9e-bd6bd6dd4b53', base: 1, operation: randomUUID(), payload: { ...workspace.records['b4420c84-a4cc-4b47-9d9e-bd6bd6dd4b53'].revisions[0].payload, text } });
  test('simultaneous connections accept one CAS and preserve the competing proposal idempotently', async () => {
    const a = operation('First connection'), b = operation('Second connection');
    const results = await Promise.all([service.save(id, 'alex', a), service.save(id, 'robin', b)]);
    expect(results.map(r => r.outcome).sort()).toEqual(['accepted', 'conflict']);
    const state = await service.read(id, 'reader'); expect(state.records['b4420c84-a4cc-4b47-9d9e-bd6bd6dd4b53'].current).toBe(2); expect(state.conflicts).toHaveLength(1);
    expect(await service.save(id, 'alex', a)).toEqual(results[0]);
    expect(await service.save(id, 'robin', b)).toEqual(results[1]);
    expect((await service.read(id, 'reader')).conflicts).toHaveLength(1);
  });
  test('revocation holding the workspace lock makes a concurrently queued save fail', async () => {
    const connection = await pool.connect();
    try {
      await connection.query('BEGIN');
      const row = await connection.query('SELECT state FROM next_workspaces WHERE id=$1 FOR UPDATE', [id]);
      delete row.rows[0].state.members.alex;
      const pending = service.save(id, 'alex', operation('Must never commit')).then(() => 'accepted', e => e.status);
      // Prove the other connection is actually blocked before revocation commits.
      const deadline = Date.now() + 5000;
      let waiting = false;
      while (Date.now() < deadline) {
        const activity = await pool.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND usename=current_user AND wait_event_type='Lock' AND query LIKE 'SELECT state FROM next_workspaces%'");
        if (activity.rows[0].count > 0) { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      await connection.query('UPDATE next_workspaces SET state=$2::jsonb WHERE id=$1', [id, JSON.stringify(row.rows[0].state)]);
      await connection.query('COMMIT');
      expect(await pending).toBe(403); expect((await service.read(id, 'reader')).records['b4420c84-a4cc-4b47-9d9e-bd6bd6dd4b53'].current).toBe(1);
    } finally { await connection.query('ROLLBACK'); connection.release(); }
  });
  test('a transaction throwing after in-memory mutation rolls back the complete JSON envelope', async () => {
    const repo = new RevisionRepository(pool);
    const before = (await pool.query('SELECT state FROM next_workspaces WHERE id=$1', [id])).rows[0].state;
    await expect(repo.transaction(id, w => { w.records['b4420c84-a4cc-4b47-9d9e-bd6bd6dd4b53'].current = 500; throw new Error('Deliberate rollback'); })).rejects.toThrow('Deliberate rollback');
    expect((await pool.query('SELECT state FROM next_workspaces WHERE id=$1', [id])).rows[0].state).toEqual(before);
  });
  test('generic metadata promotion, independent shopping additions and stale clear-all survive a fresh pool', async () => {
    const f = makeFixtures(), source = B.catalogue(workspace.edition, f.master, f.masterHash).find(p => p.category === 'home');
    const op = (payload, base = 0) => ({ recordId: payload.id, payload, base, operation: randomUUID() });
    const request = op({ ...source, highlight: true, future: { note: 'Fictional provenance' } }, 1);
    const result = await service.save(id, 'alex', request); expect(result.outcome).toBe('accepted'); expect(await service.save(id, 'alex', request)).toEqual(result);
    const stale = await service.save(id, 'robin', op({ ...source, hidden: true }, 1)); expect(stale.outcome).toBe('conflict'); expect(stale.latest.payload.highlight).toBe(true);
    const a = B.addition('shopping', 'shopping-list', 'Fictional apples', randomUUID()), b = B.addition('shopping', 'shopping-list', 'Fictional lentils', randomUUID());
    await Promise.all([service.save(id, 'reader', op({ ...a, checked: true })), service.save(id, 'alex', op({ ...b, checked: true }))]);
    await service.save(id, 'reader', op({ ...a, checked: false }, 1));
    const reset = { action: 'clear-shopping', expected: { [a.id]: 1, [b.id]: 1 }, operation: randomUUID() };
    expect((await service.save(id, 'reader', reset)).outcome).toBe('conflict');
    const { Pool } = require('pg'), reopened = new Pool({ connectionString: validateDatabaseTarget(process.env) });
    try { const durable = await new WorkspaceService(new RevisionRepository(reopened)).read(id, 'reader'); expect(durable.edition.id).toBe(result.edition); expect(durable.records[source.id].revisions.at(-1).payload.future).toEqual({ note: 'Fictional provenance' }); expect(B.latest(durable.records[b.id]).payload.checked).toBe(true); expect(durable.shoppingConflicts[0].expected).toEqual(reset.expected); } finally { await reopened.end(); }
  });
});
