const { RevisionRepository } = require('../../../server/next/revision-repository');
const { WorkspaceService } = require('../../../server/next/workspace-service');
const { makeFixtures } = require('../fixtures');

test('workspace reading preserves the full envelope without rewriting it or taking a write lock', async () => {
  const workspace = makeFixtures().workspaces.demo;
  const pool = { query: jest.fn(async () => ({ rows: [{ state: workspace }] })), connect: jest.fn(() => { throw Error('Read must not open a write transaction'); }) };
  const service = new WorkspaceService(new RevisionRepository(pool));
  const saved = await service.read('demo', 'owner');
  expect(saved.records).toEqual(workspace.records);
  expect(saved.editions).toEqual(workspace.editions);
  expect(saved.content).toEqual(workspace.content);
  expect(saved.members).toBeUndefined();
  expect(pool.query).toHaveBeenCalledTimes(1);
  expect(pool.query.mock.calls[0]).toEqual(['SELECT state FROM next_workspaces WHERE id = $1', ['demo']]);
  await expect(service.read('demo', 'outsider')).rejects.toMatchObject({ status: 403 });
  pool.query.mockResolvedValueOnce({ rows: [] });
  await expect(service.read('missing', 'owner')).rejects.toMatchObject({ status: 403 });
});
