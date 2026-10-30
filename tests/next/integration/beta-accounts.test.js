'use strict';

// Real SQL only in an explicitly guarded, disposable loopback database. No
// application service, production pool, email, paid AI or browser lifecycle.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomBytes, randomUUID } = require('node:crypto');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const { validateDatabaseTarget, verifyDatabaseTarget } = require('../harness/database');
const { BetaAccounts } = require('../../../server/next/beta-accounts');
const { OwnedRevisionRepository } = require('../../../server/next/owned-revision-repository');
const { WorkspaceService } = require('../../../server/next/workspace-service');
const B = require('../../../app-next/js/book-records');

const run = process.env.NEXT_TEST_DATABASE_URL ? describe : describe.skip;

run('REAL invite beta accounts in guarded disposable PostgreSQL', () => {
  const schema = 'next_beta_' + randomUUID().replaceAll('-', '');
  const origin = 'https://beta.example.invalid';
  const password = 'fictional-beta-password';
  let adminPool, pool, beta, owner, schemaCreated = false;
  const rawToken = result => new URLSearchParams(new URL(result.url).hash.slice(1)).get('token');
  async function seedInvitation({ username = null, accountId = null, isAdmin = false, expiresAt = new Date(Date.now() + 60000) } = {}) {
    const token = randomBytes(32).toString('base64url');
    await pool.query('INSERT INTO beta_invitations(digest,username,account_id,is_admin,expires_at) VALUES($1,$2,$3,$4,$5)', [createHash('sha256').update(token).digest('hex'), username, accountId, isAdmin, expiresAt]);
    return token;
  }
  async function join(username) {
    const invitation = await beta.invite(owner.actor, { username });
    return beta.activate({ token: rawToken(invitation), username, password });
  }
  beforeAll(async () => {
    const connectionString = validateDatabaseTarget(process.env);
    adminPool = new Pool({ connectionString });
    await verifyDatabaseTarget(adminPool);
    await adminPool.query('CREATE SCHEMA "' + schema + '"'); schemaCreated = true;
    pool = new Pool({ connectionString, max: 5, options: '-c search_path=' + schema });
    await verifyDatabaseTarget(pool);
    await pool.query('CREATE TABLE users(id serial PRIMARY KEY,username text UNIQUE NOT NULL,password_hash text NOT NULL,is_admin boolean NOT NULL DEFAULT false,session_version integer NOT NULL DEFAULT 0)');
    await pool.query('CREATE TABLE beta_invitations(digest text PRIMARY KEY,username text,account_id integer REFERENCES users(id),is_admin boolean NOT NULL DEFAULT false,expires_at timestamptz NOT NULL,used_at timestamptz)');
    await pool.query('CREATE TABLE user_sessions(sid varchar PRIMARY KEY,sess json NOT NULL,expire timestamp(6) NOT NULL)');
    await pool.query(fs.readFileSync(path.join(__dirname, '../../../server/next/schema.sql'), 'utf8'));
    await pool.query('CREATE UNIQUE INDEX beta_one_workspace_per_owner ON next_workspaces(owner_id)');
    beta = new BetaAccounts({ pool, origin });
  }, 20000);
  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE beta_invitations,next_workspaces,user_sessions,users RESTART IDENTITY CASCADE');
    owner = await beta.activate({ token: await seedInvitation({ username: 'practice-owner', isAdmin: true }), username: 'practice-owner', password });
  });
  afterAll(async () => {
    try {
      if (pool) await pool.end();
      if (schemaCreated) { await verifyDatabaseTarget(adminPool); await adminPool.query('DROP SCHEMA "' + schema + '" CASCADE'); }
    } finally { if (adminPool) await adminPool.end(); }
  });

  test('a new invite creates separate blank personal content and only the seeded administrator can invite', async () => {
    const second = await join('practice-two');
    const saved = (await pool.query('SELECT id,owner_id,state FROM next_workspaces ORDER BY owner_id')).rows;
    expect(saved).toHaveLength(2);
    expect(saved[0].id).not.toBe(saved[1].id);
    expect(saved[1]).toMatchObject({ id: second.workspace, owner_id: Number(second.actor), state: { owner: second.actor, records: {}, content: { contacts: [], notes: [], custom: {}, savedGroups: [] }, members: { [second.actor]: 'manager' } } });
    const user = (await pool.query('SELECT * FROM users WHERE id=$1', [Number(second.actor)])).rows[0];
    expect(user.is_admin).toBe(false);
    expect(user.password_hash).not.toContain(password);
    expect(await bcrypt.compare(password, user.password_hash)).toBe(true);
    expect(bcrypt.getRounds(user.password_hash)).toBe(12);
    expect(await beta.summary(owner.actor)).toEqual({ admin: true, accounts: [{ username: 'practice-owner' }, { username: 'practice-two' }], accountCount: 2 });
    await expect(beta.summary(second.actor)).rejects.toMatchObject({ status: 403 });
    await expect(beta.invite(second.actor, { username: 'practice-three' })).rejects.toMatchObject({ status: 403 });
  });

  test('concurrent use of the same link creates exactly one complete account/workspace', async () => {
    const token = rawToken(await beta.invite(owner.actor, {}));
    const results = await Promise.allSettled(['practice-a', 'practice-b'].map(username => beta.activate({ token, username, password })));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected').reason.status).toBe(410);
    expect((await pool.query('SELECT count(*)::int AS count FROM users')).rows[0].count).toBe(2);
    expect((await pool.query('SELECT count(*)::int AS count FROM next_workspaces')).rows[0].count).toBe(2);
    expect((await pool.query('SELECT used_at FROM beta_invitations WHERE digest=$1', [createHash('sha256').update(token).digest('hex')])).rows[0].used_at).toBeInstanceOf(Date);
  });

  test('duplicate username rolls back without burning a valid invitation', async () => {
    await join('practice-two');
    const token = rawToken(await beta.invite(owner.actor, {}));
    await expect(beta.activate({ token, username: 'practice-two', password })).rejects.toMatchObject({ status: 409 });
    expect((await pool.query('SELECT used_at FROM beta_invitations WHERE digest=$1', [createHash('sha256').update(token).digest('hex')])).rows[0].used_at).toBeNull();
    const third = await beta.activate({ token, username: 'practice-three', password });
    expect(third.username).toBe('practice-three');
    expect((await pool.query('SELECT count(*)::int AS count FROM users')).rows[0].count).toBe(3);
  });

  test('workspace persistence failure cannot leave a partial account or consumed link', async () => {
    const token = rawToken(await beta.invite(owner.actor, { username: 'practice-two' }));
    await pool.query("CREATE FUNCTION reject_beta_workspace() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fictional persistence failure'; END $$");
    await pool.query('CREATE TRIGGER reject_beta_workspace BEFORE INSERT ON next_workspaces FOR EACH ROW EXECUTE FUNCTION reject_beta_workspace()');
    try {
      await expect(beta.activate({ token, username: 'practice-two', password })).rejects.toThrow('Fictional persistence failure');
      expect((await pool.query("SELECT id FROM users WHERE username='practice-two'")).rows).toEqual([]);
      expect((await pool.query('SELECT used_at FROM beta_invitations WHERE digest=$1', [createHash('sha256').update(token).digest('hex')])).rows[0].used_at).toBeNull();
    } finally {
      await pool.query('DROP TRIGGER reject_beta_workspace ON next_workspaces');
      await pool.query('DROP FUNCTION reject_beta_workspace()');
    }
    expect((await beta.activate({ token, username: 'practice-two', password })).username).toBe('practice-two');
  });

  test('recovery rejects older links while preserving complete saved history, unrelated links and sessions', async () => {
    const second = await join('practice-two');
    const repository = new OwnedRevisionRepository(pool);
    const service = new WorkspaceService(repository);
    const payload = { ...B.addition('note', 'notes', 'Fictional first wording', randomUUID(), 'Practice note'), future: { nested: ['retained'] } };
    await repository.runAs(second.actor, () => service.save(second.workspace, second.actor, { recordId: payload.id, base: 0, operation: randomUUID(), payload }));
    await repository.runAs(second.actor, () => service.save(second.workspace, second.actor, { recordId: payload.id, base: 1, operation: randomUUID(), payload: { ...payload, text: 'Fictional revised wording' } }));
    await repository.runAs(second.actor, () => repository.transaction(second.workspace, state => { state.future = { unknown: ['retained', { nested: true }] }; }));
    const before = (await pool.query('SELECT id,owner_id,state FROM next_workspaces ORDER BY owner_id')).rows;
    expect(before[1].state.records[payload.id].revisions).toHaveLength(3);
    await pool.query('INSERT INTO user_sessions(sid,sess,expire) VALUES($1,$2::json,$3),($4,$5::json,$3)', ['owner-device', JSON.stringify({ actor: owner.actor, sessionVersion: 0 }), new Date(Date.now() + 60000), 'second-device', JSON.stringify({ actor: second.actor, sessionVersion: 0 })]);
    const older = await beta.invite(owner.actor, { recoveryFor: 'practice-two' });
    const recovery = await beta.invite(owner.actor, { recoveryFor: 'practice-two' });
    const unrelatedRecovery = await beta.invite(owner.actor, { recoveryFor: 'practice-owner' });
    const unrelatedInvite = await beta.invite(owner.actor, { username: 'practice-three' });
    const unrelatedBefore = (await pool.query('SELECT * FROM beta_invitations WHERE account_id IS DISTINCT FROM $1 ORDER BY digest', [Number(second.actor)])).rows;
    const newPassword = 'fictional-replacement-password';
    const result = await beta.activate({ token: rawToken(recovery), username: 'practice-two', password: newPassword });
    expect(result).toEqual({ ...second, sessionVersion: 1 });
    expect((await pool.query('SELECT id,owner_id,state FROM next_workspaces ORDER BY owner_id')).rows).toEqual(before);
    expect((await pool.query('SELECT sid FROM user_sessions ORDER BY sid')).rows).toEqual([{ sid: 'owner-device' }]);
    expect(await beta.active(second.actor, 0)).toBe(false);
    expect(await beta.active(second.actor, 1)).toBe(true);
    expect(await beta.active(owner.actor, 0)).toBe(true);
    const current = await beta.users.findUserByUsername('practice-two');
    expect(await bcrypt.compare(password, current.password_hash)).toBe(false);
    expect(await bcrypt.compare(newPassword, current.password_hash)).toBe(true);
    await expect(beta.activate({ token: rawToken(recovery), username: 'practice-two', password })).rejects.toMatchObject({ status: 410 });
    await expect(beta.activate({ token: rawToken(older), username: 'practice-two', password })).rejects.toMatchObject({ status: 410 });
    expect((await pool.query('SELECT * FROM beta_invitations WHERE account_id IS DISTINCT FROM $1 ORDER BY digest', [Number(second.actor)])).rows).toEqual(unrelatedBefore);
    expect((await beta.activate({ token: rawToken(unrelatedRecovery), username: 'practice-owner', password })).actor).toBe(owner.actor);
    expect((await beta.activate({ token: rawToken(unrelatedInvite), username: 'practice-three', password })).username).toBe('practice-three');
  });

  test('concurrent recovery links for one account allow exactly one password reset', async () => {
    const second = await join('practice-two');
    const links = await Promise.all([1, 2].map(() => beta.invite(owner.actor, { recoveryFor: 'practice-two' })));
    const passwords = ['fictional-first-replacement', 'fictional-second-replacement'];
    const before = (await pool.query('SELECT id,owner_id,state FROM next_workspaces ORDER BY owner_id')).rows;
    const results = await Promise.allSettled(links.map((link, i) => beta.activate({ token: rawToken(link), username: 'practice-two', password: passwords[i] })));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected').reason.status).toBe(410);
    expect(await beta.version(second.actor)).toBe(1);
    const current = await beta.users.findUserByUsername('practice-two');
    for (let i = 0; i < results.length; i++) expect(await bcrypt.compare(passwords[i], current.password_hash)).toBe(results[i].status === 'fulfilled');
    expect((await pool.query('SELECT id,owner_id,state FROM next_workspaces ORDER BY owner_id')).rows).toEqual(before);
  });

  test('failure invalidating an older recovery link rolls back the password, sessions and all link consumption', async () => {
    const second = await join('practice-two');
    const older = await beta.invite(owner.actor, { recoveryFor: 'practice-two' });
    const recovery = await beta.invite(owner.actor, { recoveryFor: 'practice-two' });
    await pool.query('INSERT INTO user_sessions(sid,sess,expire) VALUES($1,$2::json,$3)', ['second-device', JSON.stringify({ actor: second.actor, sessionVersion: 0 }), new Date(Date.now() + 60000)]);
    const tables = { users: 'id', user_sessions: 'sid', beta_invitations: 'digest', next_workspaces: 'id' };
    const before = {};
    for (const [table, key] of Object.entries(tables)) before[table] = (await pool.query('SELECT * FROM ' + table + ' ORDER BY ' + key)).rows;
    const olderDigest = createHash('sha256').update(rawToken(older)).digest('hex');
    await pool.query("CREATE FUNCTION reject_recovery_invalidation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fictional invalidation failure'; END $$");
    // Digest is generated in this disposable fixture, never a live link or SQL input.
    await pool.query("CREATE TRIGGER reject_recovery_invalidation BEFORE UPDATE ON beta_invitations FOR EACH ROW WHEN (OLD.digest = '" + olderDigest + "') EXECUTE FUNCTION reject_recovery_invalidation()");
    try {
      await expect(beta.activate({ token: rawToken(recovery), username: 'practice-two', password: 'fictional-replacement-password' })).rejects.toThrow('Fictional invalidation failure');
      for (const [table, key] of Object.entries(tables)) expect((await pool.query('SELECT * FROM ' + table + ' ORDER BY ' + key)).rows).toEqual(before[table]);
      expect(await beta.active(second.actor, 0)).toBe(true);
      expect(await beta.users.verifyPassword(password, (await beta.users.findUserByUsername('practice-two')).password_hash)).toBe(true);
    } finally {
      await pool.query('DROP TRIGGER reject_recovery_invalidation ON beta_invitations');
      await pool.query('DROP FUNCTION reject_recovery_invalidation()');
    }
    expect((await beta.activate({ token: rawToken(recovery), username: 'practice-two', password })).sessionVersion).toBe(1);
    await expect(beta.activate({ token: rawToken(older), username: 'practice-two', password })).rejects.toMatchObject({ status: 410 });
  });

  test('a recovery link cannot rename or target another account', async () => {
    const second = await join('practice-two');
    const recovery = await beta.invite(owner.actor, { recoveryFor: 'practice-two' });
    await expect(beta.activate({ token: rawToken(recovery), username: 'practice-owner', password })).rejects.toMatchObject({ status: 400 });
    expect(await beta.version(second.actor)).toBe(0);
    await expect(beta.invite(owner.actor, { recoveryFor: 'practice-two', username: 'another-name' })).rejects.toMatchObject({ status: 400 });
    const restored = await beta.activate({ token: rawToken(recovery), username: 'practice-two', password });
    expect(restored.actor).toBe(second.actor);
  });

  test('repository reads and writes deny foreign ownership even if the envelope grants a foreign manager role', async () => {
    const second = await join('practice-two'), repository = new OwnedRevisionRepository(pool);
    await repository.runAs(owner.actor, () => repository.transaction(owner.workspace, state => { state.members[second.actor] = 'manager'; state.future = { preserved: true }; }));
    const before = (await pool.query('SELECT id,state FROM next_workspaces ORDER BY id')).rows;
    await expect(repository.runAs(second.actor, () => repository.read(owner.workspace, state => state))).rejects.toMatchObject({ status: 403 });
    await expect(repository.runAs(second.actor, () => repository.transaction(owner.workspace, state => { state.future = 'forbidden'; }))).rejects.toMatchObject({ status: 403 });
    await expect(repository.runAs(owner.actor, () => repository.transaction(owner.workspace, state => { state.future = 'unfinished'; throw new Error('Fictional rollback'); }))).rejects.toThrow('Fictional rollback');
    expect((await pool.query('SELECT id,state FROM next_workspaces ORDER BY id')).rows).toEqual(before);
    await expect(repository.read(owner.workspace, state => state)).rejects.toMatchObject({ status: 403 });
  });

  test('capacity counts pending invitations and full activation never exceeds twelve accounts', async () => {
    const hash = await bcrypt.hash(password, 4);
    for (let i = 0; i < 10; i++) await pool.query('INSERT INTO users(username,password_hash) VALUES($1,$2)', ['capacity-' + i, hash]);
    const invitation = await beta.invite(owner.actor, { username: 'practice-last' });
    await expect(beta.invite(owner.actor, {})).rejects.toMatchObject({ status: 409 });
    await beta.activate({ token: rawToken(invitation), username: 'practice-last', password });
    const extra = await seedInvitation();
    await expect(beta.activate({ token: extra, username: 'practice-extra', password })).rejects.toMatchObject({ status: 409 });
    expect((await pool.query('SELECT count(*)::int AS count FROM users')).rows[0].count).toBe(12);
    await expect(beta.invite(owner.actor, {})).rejects.toMatchObject({ status: 409 });
  });

  test('expired links fail without creating any owned data', async () => {
    const token = await seedInvitation({ username: 'practice-two', expiresAt: new Date(0) });
    await expect(beta.activate({ token, username: 'practice-two', password })).rejects.toMatchObject({ status: 410 });
    expect((await pool.query('SELECT count(*)::int AS count FROM users')).rows[0].count).toBe(1);
    expect((await pool.query('SELECT count(*)::int AS count FROM next_workspaces')).rows[0].count).toBe(1);
  });

  test('self-registration creates only private defaults and cannot select identity or admin privileges', async () => {
    const second = await beta.register({ username: 'self-reader', password, is_admin: true, actor: owner.actor, workspace: owner.workspace });
    expect(second.workspace).not.toBe(owner.workspace);
    const user = (await pool.query('SELECT is_admin FROM users WHERE id=$1', [Number(second.actor)])).rows[0];
    expect(user.is_admin).toBe(false);
    const repository = new OwnedRevisionRepository(pool);
    const own = await repository.runAs(second.actor, () => repository.read(second.workspace, state => state));
    expect(own).toMatchObject({ owner: second.actor, members: { [second.actor]: 'manager' }, records: {}, content: { contacts: [], notes: [], custom: {}, savedGroups: [] } });
    await expect(repository.runAs(second.actor, () => repository.read(owner.workspace, state => state))).rejects.toMatchObject({ status: 403 });
    await expect(repository.runAs(owner.actor, () => repository.read(second.workspace, state => state))).rejects.toMatchObject({ status: 403 });
    await expect(beta.invite(second.actor)).rejects.toMatchObject({ status: 403 });
    await expect(beta.register({ username: 'self-reader', password })).rejects.toMatchObject({ status: 409 });
    expect((await pool.query('SELECT count(*)::int AS count FROM users')).rows[0].count).toBe(2);
  });

  test('concurrent self-registrations cannot exceed twelve or take a reserved invitation place', async () => {
    for (let i = 0; i < 10; i++) await pool.query('INSERT INTO users(username,password_hash) VALUES($1,$2)', ['capacity-' + i, 'fictional-unused-hash']);
    const reserved = await beta.invite(owner.actor, { username: 'reserved-reader' });
    await expect(beta.register({ username: 'self-reader', password })).rejects.toMatchObject({ status: 409 });
    // Expire only this disposable fixture invitation, then race for the last slot.
    await pool.query('UPDATE beta_invitations SET expires_at=$1 WHERE digest=$2', [new Date(0), createHash('sha256').update(rawToken(reserved)).digest('hex')]);
    const results = await Promise.allSettled(['last-one', 'last-two'].map(username => beta.register({ username, password })));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected').reason.status).toBe(409);
    expect((await pool.query('SELECT count(*)::int AS count FROM users')).rows[0].count).toBe(12);
  });

  test('failed workspace creation rolls self-registration back completely', async () => {
    await pool.query("CREATE FUNCTION reject_registration_workspace() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fictional persistence failure'; END $$");
    await pool.query('CREATE TRIGGER reject_registration_workspace BEFORE INSERT ON next_workspaces FOR EACH ROW EXECUTE FUNCTION reject_registration_workspace()');
    try {
      await expect(beta.register({ username: 'self-reader', password })).rejects.toThrow('Fictional persistence failure');
      expect((await pool.query("SELECT id FROM users WHERE username='self-reader'")).rows).toEqual([]);
    } finally {
      await pool.query('DROP TRIGGER reject_registration_workspace ON next_workspaces');
      await pool.query('DROP FUNCTION reject_registration_workspace()');
    }
    expect((await beta.register({ username: 'self-reader', password })).username).toBe('self-reader');
  });

  test('self-registration cannot take the username reserved by an existing invitation', async () => {
    const reserved = await beta.invite(owner.actor, { username: 'reserved-reader' });
    await expect(beta.register({ username: 'reserved-reader', password })).rejects.toMatchObject({ status: 409 });
    const invited = await beta.activate({ token: rawToken(reserved), username: 'reserved-reader', password });
    expect(invited.username).toBe('reserved-reader');
    expect((await pool.query('SELECT count(*)::int AS count FROM users')).rows[0].count).toBe(2);
  });
});
