const { AccountAdapter } = require('../../../server/next/account-adapter');

test('Shared username sign-in uses the same owned ID without an email lookup', async () => {
  const users = { findUserByUsername: jest.fn(async () => ({ id: 1, username: 'demo-user', password_hash: 'retained-hash' })), findUserByEmail: jest.fn(), findUserById: jest.fn(async () => ({ id: 1 })), verifyPassword: jest.fn(async (password, hash) => password === 'correct' && hash === 'retained-hash') };
  const adapter = new AccountAdapter({ users, accountId: 1, workspaceId: 'communication-book', username: 'demo-user' });
  expect(await adapter.verify(' demo-user ', 'correct')).toBe('1');
  expect(await adapter.verify('demo-user', 'wrong')).toBeNull();
  expect(await adapter.verify('other-user', 'correct')).toBeNull();
  expect(await adapter.verify('someone@example.invalid', 'correct')).toBeNull();
  expect(users.findUserByEmail).not.toHaveBeenCalled();
  expect(await adapter.active('1')).toBe(true);
});

function setup() {
  const users = {
    findUserByEmail: jest.fn(async email => email === 'shared@example.invalid' ? { id: 41, password_hash: 'retained-hash' } : { id: 42, password_hash: 'other-hash' }),
    verifyPassword: jest.fn(async (password, hash) => password === 'correct' && hash === 'retained-hash'),
    findUserById: jest.fn(async id => id === 41 ? { id: 41 } : null)
  };
  return { users, adapter: new AccountAdapter({ users, accountId: 41, workspaceId: 'owned-book' }) };
}

test('shared sign-in reuses account verification and returns the same owner identity for each device', async () => {
  const { users, adapter } = setup();
  expect(await adapter.verify(' SHARED@EXAMPLE.INVALID ', 'correct')).toBe('41');
  expect(await adapter.verify('shared@example.invalid', 'correct')).toBe('41');
  expect(users.findUserByEmail).toHaveBeenCalledWith('shared@example.invalid');
  expect(await adapter.verify('shared@example.invalid', 'incorrect')).toBeNull();
  expect(await adapter.verify('other@example.invalid', 'correct')).toBeNull();
  expect(await adapter.verify('owner', 'owner-fictional-only')).toBeNull();
});

test('disabled or mismatched accounts cannot use the shared workspace and configuration is explicit', async () => {
  const { users, adapter } = setup();
  expect(await adapter.active('41')).toBe(true);
  expect(await adapter.active('42')).toBe(false);
  users.findUserById.mockResolvedValue(null);
  expect(await adapter.active('41')).toBe(false);
  expect(() => new AccountAdapter({ users, workspaceId: 'book' })).toThrow();
  expect(() => new AccountAdapter({ users, accountId: 41 })).toThrow();
});
