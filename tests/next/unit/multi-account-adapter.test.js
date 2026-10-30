const bcrypt = require('bcrypt');
const { MultiAccountAdapter } = require('../../../server/next/multi-account-adapter');

// All users, passwords and workspace IDs in this suite are fictional.
function setup() {
  const rows = [
    { id: 1, username: 'household-one', password_hash: bcrypt.hashSync('fictional-first-password', 4) },
    { id: 2, username: 'household-two', password_hash: bcrypt.hashSync('fictional-second-password', 4) }
  ];
  const users = {
    findUserByUsername: async name => rows.find(row => row.username === name),
    findUserById: async id => rows.find(row => row.id === id),
    verifyPassword: (password, hash) => bcrypt.compare(password, hash)
  };
  const pool = { query: jest.fn(async (sql, values) => ({ rows: [{ id: 'book-' + values[0], owner_id: values[0], owner: String(values[0]) }] })) };
  return { rows, users, pool, adapter: new MultiAccountAdapter({ users, pool }) };
}

test('separate username/password pairs retain their numeric identities and private workspace mapping', async () => {
  const { adapter } = setup();
  expect(await adapter.verify(' HOUSEHOLD-ONE ', 'fictional-first-password')).toBe('1');
  expect(await adapter.verify('household-two', 'fictional-second-password')).toBe('2');
  expect(await adapter.workspaceFor('1')).toBe('book-1');
  expect(await adapter.workspaceFor('2')).toBe('book-2');
  expect(await adapter.verify('household-one', 'fictional-second-password')).toBeNull();
  expect(await adapter.verify('unknown', 'fictional-first-password')).toBeNull();
  expect(await adapter.verify({ username: 'household-one' }, 'fictional-first-password')).toBeNull();
  expect(await adapter.verify('household-one', 'x'.repeat(201))).toBeNull();
});

test('missing accounts and non-canonical numeric actors cannot remain active or select a workspace', async () => {
  const { adapter, rows, pool } = setup();
  expect(await adapter.active('1')).toBe(true);
  rows.splice(0, 1);
  expect(await adapter.active('1')).toBe(false);
  for (const actor of ['01', '0', '-1', '1.0', '1 OR 1=1', '9007199254740992', 1, null]) {
    expect(await adapter.active(actor)).toBe(false);
    expect(await adapter.workspaceFor(actor)).toBeNull();
  }
  expect(pool.query).not.toHaveBeenCalled();
});

test.each([
  [],
  [{ id: 'first', owner_id: 1, owner: '1' }, { id: 'second', owner_id: 1, owner: '1' }],
  [{ id: 'foreign', owner_id: 2, owner: '2' }],
  [{ id: 'mismatch', owner_id: 1, owner: '2' }],
  [{ id: '', owner_id: 1, owner: '1' }]
].map(rows => [rows]))('missing, ambiguous or inconsistent ownership fails closed (%j)', async rowSet => {
  const { adapter, pool } = setup();
  pool.query.mockResolvedValue({ rows: rowSet });
  expect(await adapter.workspaceFor('1')).toBeNull();
});

test('workspace resolution uses a parameterised owner lookup and never falls back on database failure', async () => {
  const { adapter, pool } = setup();
  expect(await adapter.workspaceFor('2')).toBe('book-2');
  expect(pool.query).toHaveBeenCalledWith(expect.stringMatching(/WHERE owner_id = \$1 LIMIT 2/), [2]);
  pool.query.mockRejectedValue(new Error('Fictional database unavailable'));
  await expect(adapter.workspaceFor('2')).rejects.toThrow('Fictional database unavailable');
});

test('multi-account authentication requires explicitly injected lookup, verification and database dependencies', () => {
  const { users, pool } = setup();
  for (const options of [{}, { users }, { pool }, { users: { ...users, findUserByUsername: undefined }, pool }, { users: { ...users, verifyPassword: undefined }, pool }]) {
    expect(() => new MultiAccountAdapter(options)).toThrow();
  }
});
