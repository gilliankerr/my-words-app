'use strict';

const bcrypt = require('bcrypt');
const { createHash, randomBytes } = require('node:crypto');
const { BetaAccounts } = require('../../../server/next/beta-accounts');
const { OwnedRevisionRepository } = require('../../../server/next/owned-revision-repository');

const origin = 'https://beta.example.invalid';
const token = randomBytes(32).toString('base64url');
const password = 'fictional-beta-password';
const invitation = overrides => ({ digest: createHash('sha256').update(token).digest('hex'), username: null, account_id: null, is_admin: false, expires_at: new Date(Date.now() + 60000), used_at: null, ...overrides });

function database(handle = () => ({ rows: [] })) {
  const calls = [];
  const query = async (sql, values = []) => {
    calls.push({ sql, values });
    return handle(sql.replace(/\s+/g, ' ').trim(), values);
  };
  const release = jest.fn();
  return { calls, release, pool: { query, connect: async () => ({ query, release }) } };
}

describe('bounded beta self-registration', () => {
  test('creates an ordinary account and its own default-only workspace atomically', async () => {
    const db = database(sql => {
      if (sql.includes('count(*)')) return { rows: [{ count: 0 }] };
      if (sql.startsWith('INSERT INTO users')) return { rows: [{ id: 41, username: 'new-reader', session_version: 0 }] };
      return { rows: [], rowCount: 1 };
    });
    const result = await new BetaAccounts({ pool: db.pool, origin }).register({ username: 'new-reader', password, is_admin: true, actor: '1', workspace: 'someone-elses-book' });
    expect(result).toEqual({ actor: '41', username: 'new-reader', workspace: expect.any(String), sessionVersion: 0 });
    const user = db.calls.find(call => call.sql.startsWith('INSERT INTO users'));
    expect(user.values[2]).toBe(false);
    expect(await bcrypt.compare(password, user.values[1])).toBe(true);
    const state = JSON.parse(db.calls.find(call => call.sql.startsWith('INSERT INTO next_workspaces')).values[2]);
    expect(state).toMatchObject({ id: result.workspace, owner: '41', members: { '41': 'manager' }, records: {}, content: { contacts: [], notes: [], custom: {}, savedGroups: [] } });
    expect(db.calls.some(call => /^(UPDATE|DELETE)/.test(call.sql))).toBe(false);
    expect(db.calls.at(-1).sql).toBe('COMMIT');
  });

  test.each([[12, 0], [11, 1]])('capacity includes accounts and unexpired reserved invitations (%i + %i)', async (count, pending) => {
    const db = database(sql => ({ rows: [{ count: sql.includes('beta_invitations') ? pending : count }] }));
    await expect(new BetaAccounts({ pool: db.pool, origin }).register({ username: 'new-reader', password })).rejects.toMatchObject({ status: 409 });
    expect(db.calls.some(call => sqlWrite(call.sql))).toBe(false);
    expect(db.calls.at(-1).sql).toBe('ROLLBACK');
  });

  test('invalid input is refused before database access', async () => {
    const db = database(), beta = new BetaAccounts({ pool: db.pool, origin });
    for (const input of [{ username: 'ab', password }, { username: 'new-reader', password: 'short' }, { username: 'new-reader', password: 'é'.repeat(37) }]) await expect(beta.register(input)).rejects.toMatchObject({ status: 400 });
    expect(db.calls).toEqual([]);
  });

  test('a reserved invitation username cannot be claimed by self-registration', async () => {
    const db = database(sql => {
      if (sql.includes('count(*)')) return { rows: [{ count: 1 }] };
      if (sql.includes('FROM beta_invitations') && sql.includes('username = $1')) return { rows: [{ digest: 'reserved' }] };
      if (sql.startsWith('INSERT INTO users')) return { rows: [{ id: 41, username: 'reserved-reader', session_version: 0 }] };
      return { rows: [], rowCount: 1 };
    });
    await expect(new BetaAccounts({ pool: db.pool, origin }).register({ username: 'reserved-reader', password })).rejects.toMatchObject({ status: 409 });
    expect(db.calls.some(call => sqlWrite(call.sql))).toBe(false);
  });
});
function sqlWrite(sql) { return /^(INSERT|UPDATE|DELETE)/.test(sql); }

describe('invitation and recovery boundaries', () => {
  test('activation creates only master defaults and consumes the digest in the same transaction', async () => {
    const db = database(sql => {
      if (sql.includes('FROM beta_invitations') && sql.includes('FOR UPDATE')) return { rows: [invitation({ username: 'practice-one' })] };
      if (sql.includes('count(*)')) return { rows: [{ count: 0 }] };
      if (sql.startsWith('INSERT INTO users')) return { rows: [{ id: 41, username: 'practice-one', session_version: 0 }] };
      return { rows: [], rowCount: 1 };
    });
    const accounts = new BetaAccounts({ pool: db.pool, origin });
    const result = await accounts.activate({ token, username: 'practice-one', password });
    expect(result).toEqual({ actor: '41', username: 'practice-one', workspace: expect.any(String), sessionVersion: 0 });
    const user = db.calls.find(call => call.sql.startsWith('INSERT INTO users'));
    expect(user.values[0]).toBe('practice-one');
    expect(await bcrypt.compare(password, user.values[1])).toBe(true);
    expect(bcrypt.getRounds(user.values[1])).toBe(12);
    expect(user.values[2]).toBe(false);
    const stored = db.calls.find(call => call.sql.startsWith('INSERT INTO next_workspaces'));
    const state = JSON.parse(stored.values[2]);
    expect(state).toMatchObject({ id: result.workspace, owner: '41', records: {}, members: { '41': 'manager' }, content: { contacts: [], notes: [], custom: {}, savedGroups: [] } });
    expect(db.calls.some(call => call.values.includes(token))).toBe(false);
    expect(db.calls.find(call => call.sql.startsWith('UPDATE beta_invitations')).values[0]).toBe(invitation().digest);
    expect(db.calls.at(-1).sql).toBe('COMMIT');
    expect(db.release).toHaveBeenCalledTimes(1);
  });

  test.each([
    { token: 'not-a-link', username: 'practice-one', password },
    { token, username: 'ab', password },
    { token, username: 'word/name', password },
    { token, username: 'practice-one', password: 'short' },
    { token, username: 'practice-one', password: 'é'.repeat(37) }
  ])('invalid activation input cannot open a transaction (%j)', async input => {
    const db = database();
    await expect(new BetaAccounts({ pool: db.pool, origin }).activate(input)).rejects.toMatchObject({ status: 400 });
    expect(db.calls).toEqual([]);
  });

  test.each([null, invitation({ used_at: new Date() }), invitation({ expires_at: new Date(0) })])('missing, used or expired links do not create an account', async row => {
    const db = database(sql => ({ rows: sql.includes('FROM beta_invitations') ? row ? [row] : [] : [] }));
    await expect(new BetaAccounts({ pool: db.pool, origin }).activate({ token, username: 'practice-one', password })).rejects.toMatchObject({ status: 410 });
    expect(db.calls.filter(call => /^(INSERT|UPDATE|DELETE)/.test(call.sql))).toEqual([]);
    expect(db.calls.at(-1).sql).toBe('ROLLBACK');
  });

  test('a workspace failure rolls back account creation and invitation consumption', async () => {
    const db = database(sql => {
      if (sql.includes('FROM beta_invitations')) return { rows: [invitation()] };
      if (sql.includes('count(*)')) return { rows: [{ count: 0 }] };
      if (sql.startsWith('INSERT INTO users')) return { rows: [{ id: 41, username: 'practice-one', session_version: 0 }] };
      if (sql.startsWith('INSERT INTO next_workspaces')) throw new Error('Fictional write failure');
      return { rows: [] };
    });
    await expect(new BetaAccounts({ pool: db.pool, origin }).activate({ token, username: 'practice-one', password })).rejects.toThrow('Fictional write failure');
    expect(db.calls.at(-1).sql).toBe('ROLLBACK');
    expect(db.calls.some(call => call.sql.startsWith('UPDATE beta_invitations'))).toBe(false);
  });

  test('admin invitation creation stores only a digest and cannot grant another admin', async () => {
    const db = database(sql => {
      if (sql.includes('FROM users WHERE id')) return { rows: [{ id: 1, is_admin: true }] };
      if (sql.includes('count(*)')) return { rows: [{ count: 1 }] };
      return { rows: [], rowCount: 1 };
    });
    const result = await new BetaAccounts({ pool: db.pool, origin }).invite('1', { username: 'practice-two', is_admin: true });
    const url = new URL(result.url);
    expect(url.origin + url.pathname).toBe(origin + '/join.html');
    expect(url.search).toBe('');
    const raw = new URLSearchParams(url.hash.slice(1)).get('token');
    expect(Buffer.from(raw, 'base64url')).toHaveLength(32);
    const inserted = db.calls.find(call => call.sql.startsWith('INSERT INTO beta_invitations'));
    expect(inserted.values).toContain(createHash('sha256').update(raw).digest('hex'));
    expect(inserted.values).not.toContain(raw);
    expect(inserted.values).toContain(false);
    expect(result).toMatchObject({ username: 'practice-two', recovery: false, expiresAt: expect.any(String) });
  });

  test('only a current administrator may view usernames or issue links', async () => {
    const db = database(() => ({ rows: [{ id: 2, username: 'practice-two', is_admin: false }] }));
    const accounts = new BetaAccounts({ pool: db.pool, origin });
    await expect(accounts.summary('2')).rejects.toMatchObject({ status: 403 });
    await expect(accounts.invite('2', {})).rejects.toMatchObject({ status: 403 });
    for (const actor of ['01', '0', '-1', '9007199254740992', 1, null]) {
      await expect(accounts.summary(actor)).rejects.toMatchObject({ status: 403 });
    }
    expect(db.calls.some(call => call.sql.startsWith('INSERT'))).toBe(false);
  });

  test('recovery rotates the password/version, revokes target sessions and invalidates all target recovery links', async () => {
    const db = database(sql => {
      if (sql.includes('FROM beta_invitations')) return { rows: [invitation({ username: 'practice-two', account_id: 42 })] };
      if (sql.includes('FROM users WHERE id')) return { rows: [{ id: 42, username: 'practice-two', session_version: 3 }] };
      if (sql.startsWith('UPDATE users')) return { rows: [{ id: 42, username: 'practice-two', session_version: 4 }], rowCount: 1 };
      if (sql.includes('FROM next_workspaces')) return { rows: [{ id: 'existing-workspace', owner_id: 42, owner: '42' }] };
      return { rows: [], rowCount: 1 };
    });
    const result = await new BetaAccounts({ pool: db.pool, origin }).activate({ token, username: 'practice-two', password });
    expect(result).toEqual({ actor: '42', username: 'practice-two', workspace: 'existing-workspace', sessionVersion: 4 });
    expect(db.calls.filter(call => /^(INSERT|UPDATE|DELETE).*next_workspaces/.test(call.sql))).toEqual([]);
    expect(db.calls.find(call => call.sql.startsWith('DELETE FROM user_sessions')).values).toEqual(['42']);
    expect(db.calls.find(call => call.sql.startsWith('UPDATE users')).sql).toMatch(/session_version\s*=\s*session_version\s*\+\s*1/);
    const invalidate = db.calls.find(call => call.sql.startsWith('UPDATE beta_invitations') && /WHERE account_id\s*=\s*\$1 AND used_at IS NULL/.test(call.sql));
    expect(invalidate).toBeDefined();
    expect(invalidate.values).toEqual([42]);
    expect(db.calls.at(-1).sql).toBe('COMMIT');
  });

  test('a failure invalidating outstanding recovery links refuses success and rolls back the transaction', async () => {
    const db = database(sql => {
      if (sql.includes('FROM beta_invitations')) return { rows: [invitation({ username: 'practice-two', account_id: 42 })] };
      if (sql.includes('FROM users WHERE id')) return { rows: [{ id: 42, username: 'practice-two', session_version: 3 }] };
      if (sql.startsWith('UPDATE users')) return { rows: [{ id: 42, username: 'practice-two', session_version: 4 }], rowCount: 1 };
      if (sql.includes('FROM next_workspaces')) return { rows: [{ id: 'existing-workspace', owner_id: 42, owner: '42' }] };
      if (sql.startsWith('UPDATE beta_invitations') && /WHERE account_id/.test(sql)) throw new Error('Fictional invalidation failure');
      return { rows: [], rowCount: 1 };
    });
    await expect(new BetaAccounts({ pool: db.pool, origin }).activate({ token, username: 'practice-two', password })).rejects.toThrow('Fictional invalidation failure');
    expect(db.calls.at(-1).sql).toBe('ROLLBACK');
  });

  test('the session version check refuses old, missing and noncanonical identities', async () => {
    const db = database(() => ({ rows: [{ id: 42, username: 'practice-two', session_version: 4 }] }));
    const accounts = new BetaAccounts({ pool: db.pool, origin });
    expect(await accounts.active('42', 4)).toBe(true);
    expect(await accounts.active('42', 3)).toBe(false);
    expect(await accounts.active('42')).toBe(false);
    expect(await accounts.active('042', 4)).toBe(false);
    expect(await accounts.version('42')).toBe(4);
    expect(await accounts.version('042')).toBeNull();
    expect(await accounts.users.findUserById(42)).toMatchObject({ id: 42 });
    expect(await accounts.users.findUserById('42')).toBeUndefined();
  });
});

describe('repository-level account ownership', () => {
  test('an actor is required before every read or write', async () => {
    const db = database(), repository = new OwnedRevisionRepository(db.pool);
    await expect(repository.read('book', () => {})).rejects.toMatchObject({ status: 403 });
    await expect(repository.transaction('book', () => {})).rejects.toMatchObject({ status: 403 });
    for (const actor of ['01', 1, null, '9007199254740992']) expect(() => repository.runAs(actor, () => {})).toThrow('Access denied');
    expect(db.calls).toEqual([]);
  });

  test('each SQL lookup and update includes owner scope, retaining unknown envelope fields', async () => {
    const original = { id: 'book', owner: '2', future: { nested: ['retained'] } };
    const db = database(sql => ({ rows: sql.startsWith('SELECT') ? [{ state: structuredClone(original) }] : [], rowCount: 1 }));
    const repository = new OwnedRevisionRepository(db.pool);
    expect(await repository.runAs('2', () => repository.read('book', state => state.future))).toEqual({ nested: ['retained'] });
    await repository.runAs('2', () => repository.transaction('book', state => { state.extra = true; }));
    for (const call of db.calls.filter(call => /^(SELECT|UPDATE)/.test(call.sql))) {
      expect(call.sql).toMatch(/owner_id\s*=\s*\$/);
      expect(call.values).toContain(2);
    }
    const update = db.calls.find(call => call.sql.startsWith('UPDATE'));
    expect(JSON.parse(update.values[1])).toEqual({ ...original, extra: true });
  });

  test('inconsistent or changed envelope ownership fails closed and rolls back', async () => {
    const db = database(sql => ({ rows: sql.startsWith('SELECT') ? [{ state: { id: 'book', owner: '2' } }] : [] }));
    const repository = new OwnedRevisionRepository(db.pool);
    await expect(repository.runAs('1', () => repository.read('book', state => state))).rejects.toMatchObject({ status: 403 });
    await expect(repository.runAs('2', () => repository.transaction('book', state => { state.owner = '1'; }))).rejects.toMatchObject({ status: 403 });
    expect(db.calls.some(call => call.sql.startsWith('UPDATE'))).toBe(false);
    expect(db.calls.at(-1).sql).toBe('ROLLBACK');
  });

  test('concurrent async requests retain their own actor scope', async () => {
    const db = database((sql, values) => ({ rows: [{ state: { id: values[0], owner: String(values[1]) } }] }));
    const repository = new OwnedRevisionRepository(db.pool);
    const results = await Promise.all(['1', '2'].map(actor => repository.runAs(actor, async () => {
      await Promise.resolve();
      return repository.read('book-' + actor, state => state.owner);
    })));
    expect(results).toEqual(['1', '2']);
  });
});
