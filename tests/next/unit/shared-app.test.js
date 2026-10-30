const { createSharedAccountApp } = require('../../../server/next/shared-app');

test('shared assembly checks actual selected tables and ownership without exposing account details', async () => {
  const pool = { connect: jest.fn(), query: jest.fn(async sql => ({ rows: sql.includes('next_workspaces') ? [{ owner: '41' }] : [] })) };
  const users = { findUserByEmail: jest.fn(), verifyPassword: jest.fn(), findUserById: jest.fn(async () => ({ id: 41 })) };
  const { app, sessionStore } = createSharedAccountApp({ pool, users, accountId: 41, workspaceId: 'owned', origin: 'https://example.invalid', secret: 'test-only-long-secret-with-32-characters', trustProxy: 1 });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try {
    const url = 'http://127.0.0.1:' + server.address().port + '/health/ready';
    const ready = await fetch(url); expect(ready.status).toBe(200); expect(await ready.json()).toEqual({ ready: true });
    expect(pool.query).toHaveBeenCalledWith('SELECT 1 FROM user_sessions LIMIT 1');
    pool.query.mockResolvedValueOnce({ rows: [{ owner: '42' }] });
    const wrongOwner = await fetch(url); expect(wrongOwner.status).toBe(503); expect(await wrongOwner.json()).toEqual({ ready: false });
    pool.query.mockRejectedValueOnce(new Error('private database failure'));
    const unavailable = await fetch(url); expect(unavailable.status).toBe(503); expect(await unavailable.text()).not.toContain('private');
    expect(pool.connect).not.toHaveBeenCalled();
  } finally { await new Promise(resolve => server.close(resolve)); sessionStore.close(); }
});

test('shared assembly never imports a fallback production pool', () => {
  expect(() => createSharedAccountApp({})).toThrow(/explicitly selected/i);
});
