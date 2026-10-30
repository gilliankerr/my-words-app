const { verifyDatabaseTarget } = require('../harness/database');

const env = { NEXT_TEST_DATABASE_URL: 'postgres://fiction:fiction@127.0.0.1/cn_next_disposable_guard' };
test.each([
  { name: 'cn_next_disposable_other', host: '127.0.0.1', superuser: false, bypassrls: false },
  { name: 'cn_next_disposable_guard', host: '192.0.2.1', superuser: false, bypassrls: false },
  { name: 'cn_next_disposable_guard', host: '127.0.0.1', superuser: true, bypassrls: false },
  { name: 'cn_next_disposable_guard', host: '127.0.0.1', superuser: false, bypassrls: true }
])('connected database guard refuses mismatched or privileged targets', async actual => {
  const pool = { query: jest.fn(async () => ({ rows: [actual] })) };
  await expect(verifyDatabaseTarget(pool, env)).rejects.toThrow(/disposable target/i);
  expect(pool.query).toHaveBeenCalledTimes(1);
  expect(pool.query.mock.calls[0][0]).toMatch(/^SELECT/);
});

test('connected database guard accepts only the exact loopback target with an unprivileged role', async () => {
  const actual = { name: 'cn_next_disposable_guard', host: '127.0.0.1', superuser: false, bypassrls: false };
  expect(await verifyDatabaseTarget({ query: async () => ({ rows: [actual] }) }, env)).toEqual(actual);
});
