'use strict';

// Real SQL ownership lookup, revision transactions and durable sessions. This
// exercises the HTTP boundary, not repository-level tenant scope or PostgreSQL RLS.
// No application credentials, legacy initialisers or production assembly.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const bcrypt = require('bcrypt');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const { validateDatabaseTarget, verifyDatabaseTarget } = require('../harness/database');
const { createApp } = require('../../../server/next/app');
const { MultiAccountAdapter } = require('../../../server/next/multi-account-adapter');
const { RevisionRepository } = require('../../../server/next/revision-repository');
const { initialBook } = require('../../../server/next/private-local');
const M = require('../../../app-next/js/model');
const B = require('../../../app-next/js/book-records');
const syntheticProfile = require('../fixtures/synthetic-profile.json');
const run = process.env.NEXT_TEST_DATABASE_URL ? describe : describe.skip;

run('REAL multi-account ownership and sessions in guarded disposable PostgreSQL', () => {
  const schema = 'next_multi_' + randomUUID().replaceAll('-', '');
  const origin = 'https://multi-account.example.invalid';
  const secret = 'fictional-multi-account-session-secret-at-least-32';
  const accounts = [101, 102].map(id => ({ id, name: 'fictional-household-' + id, password: 'fictional-only-password-' + id, workspace: 'book-' + randomUUID() }));
  let connectionString, admin, pool, server, sessionStore, base, schemaCreated = false;
  const headers = device => ({ cookie: device.cookie, origin, 'x-forwarded-proto': 'https', 'x-next-csrf': device.csrf, 'content-type': 'application/json' });
  const read = (device, workspace = device.workspace, suffix = '') => fetch(base + '/api/workspaces/' + workspace + suffix, { headers: headers(device) });
  const post = (device, suffix, body, workspace = device.workspace) => fetch(base + '/api/workspaces/' + workspace + suffix, { method: 'POST', headers: headers(device), body: JSON.stringify(body) });
  const operation = payload => ({ recordId: payload.id, base: 0, operation: randomUUID(), payload });

  async function start() {
    pool = new Pool({ connectionString, max: 5, options: '-c search_path=' + schema });
    await verifyDatabaseTarget(pool);
    const users = {
      findUserByUsername: async name => (await pool.query('SELECT * FROM users WHERE username=$1', [name])).rows[0],
      findUserById: async id => (await pool.query('SELECT * FROM users WHERE id=$1', [id])).rows[0],
      verifyPassword: (entered, hash) => bcrypt.compare(entered, hash)
    };
    sessionStore = new PgSession({ pool, tableName: 'user_sessions', createTableIfMissing: false });
    const authentication = new MultiAccountAdapter({ users, pool });
    const app = createApp({ repository: new RevisionRepository(pool), authentication, mode: 'multi-account', sessionStore, sessionSecret: secret, productionOrigin: origin, trustProxy: 1 });
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    base = 'http://127.0.0.1:' + server.address().port;
  }
  async function stop() {
    if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    sessionStore?.close();
    if (pool) { await pool.end(); pool = null; }
  }
  async function login(account) {
    const guest = await fetch(base + '/api/session', { headers: { 'x-forwarded-proto': 'https' } });
    expect(guest.status).toBe(200);
    const info = await guest.json(), cookie = guest.headers.get('set-cookie').split(';')[0];
    const response = await fetch(base + '/api/sign-in', { method: 'POST', headers: headers({ cookie, csrf: info.csrf }), body: JSON.stringify({ name: account.name, password: account.password, actor: String(accounts[1].id), workspace: accounts[1].workspace }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toMatch(/Secure/);
    const device = { ...await response.json(), cookie: response.headers.get('set-cookie').split(';')[0] };
    expect(device.cookie).not.toBe(cookie);
    expect(device.actor).toBe(String(account.id));
    expect(device.workspace).toBe(account.workspace);
    return device;
  }
  beforeAll(async () => {
    connectionString = validateDatabaseTarget(process.env);
    admin = new Pool({ connectionString });
    await verifyDatabaseTarget(admin);
    await admin.query('CREATE SCHEMA "' + schema + '"'); schemaCreated = true;
    const setup = await admin.connect();
    try {
      await setup.query('SET search_path TO "' + schema + '"');
      await setup.query('CREATE TABLE users(id integer PRIMARY KEY, username text UNIQUE NOT NULL, password_hash text NOT NULL)');
      await setup.query('CREATE TABLE user_sessions(sid varchar PRIMARY KEY, sess json NOT NULL, expire timestamp(6) NOT NULL)');
      await setup.query(fs.readFileSync(path.join(__dirname, '../../../server/next/schema.sql'), 'utf8'));
      for (const account of accounts) {
        await setup.query('INSERT INTO users VALUES($1,$2,$3)', [account.id, account.name, await bcrypt.hash(account.password, 4)]);
        const book = await initialBook(String(account.id), account.workspace);
        book.members = { [book.owner]: 'manager' };
        await setup.query('INSERT INTO next_workspaces(id,owner_id,state) VALUES($1,$2,$3::jsonb)', [book.id, account.id, JSON.stringify(book)]);
      }
    } finally { setup.release(); }
    await start();
  }, 20000);
  afterAll(async () => {
    try {
      await stop();
      if (schemaCreated) { await verifyDatabaseTarget(admin); await admin.query('DROP SCHEMA "' + schema + '" CASCADE'); }
    } finally { if (admin) await admin.end(); }
  });

  test('two owners retain separate full envelopes and independent durable sessions across app/pool restart', async () => {
    const first = await login(accounts[0]), second = await login(accounts[1]), another = await login(accounts[0]);
    expect(another.cookie).not.toBe(first.cookie);
    const saved = new Map();
    for (const device of [first, second]) {
      const payload = { ...B.addition('note', 'notes', 'Fictional private wording ' + device.actor, randomUUID(), 'Practice note'), future: { preserved: [device.actor, { nested: true }] } };
      const request = operation(payload);
      const response = await post(device, '/operations', request);
      expect(response.status).toBe(200);
      const receipt = await response.json(); expect(receipt.outcome).toBe('accepted');
      const reopened = await read(device); expect(reopened.headers.get('cache-control')).toBe('no-store');
      const book = await reopened.json();
      expect(book.owner).toBe(device.actor);
      expect(book.records[payload.id].revisions.at(-1).payload).toEqual(payload);
      saved.set(device.actor, { request, receipt, book });
    }
    expect((await pool.query("SELECT count(*)::int AS count FROM user_sessions WHERE sess->>'actor' = ANY($1::text[])", [accounts.map(a => String(a.id))])).rows[0].count).toBe(3);
    await stop(); await start();
    for (const device of [first, second, another]) {
      expect(await (await read(device)).json()).toEqual(saved.get(device.actor).book);
      expect(await (await post(device, '/operations', saved.get(device.actor).request)).json()).toEqual(saved.get(device.actor).receipt);
    }
    expect(saved.get(first.actor).book.records[saved.get(second.actor).request.recordId]).toBeUndefined();
    expect(saved.get(second.actor).book.records[saved.get(first.actor).request.recordId]).toBeUndefined();
    const out = await fetch(base + '/api/sign-out', { method: 'POST', headers: headers(first), body: '{}' });
    expect(out.status).toBe(200);
    expect((await read(first)).status).toBe(401);
    expect((await read(another)).status).toBe(200);
    expect((await read(second)).status).toBe(200);
  }, 20000);

  test('a complete fictional user profile saves, exports and survives restart without entering the other account', async () => {
    const first = await login(accounts[0]), second = await login(accounts[1]);
    const foreignBefore = await (await read(second)).json();
    const fixture = syntheticProfile;
    const create = (kind, category, text, name) => ({ ...B.addition(kind, category, text, randomUUID(), name), future: structuredClone(fixture.future) });
    const payloads = [
      create('page', 'personal', fixture.personalMessage, fixture.name),
      create('note', 'notes', fixture.note, 'At the café'),
      { ...create('person', 'people', fixture.contact.name, fixture.contact.name), ...fixture.contact },
      create('shopping', 'shopping-list', fixture.shopping),
      { ...create('group', 'quick-words', fixture.group.name, fixture.group.name), words: fixture.group.words }
    ];
    for (const payload of payloads) {
      const response = await post(first, '/operations', operation(payload));
      expect(response.status).toBe(200);
      expect((await response.json()).outcome).toBe('accepted');
    }
    await stop(); await start();
    const saved = await (await read(first)).json();
    for (const payload of payloads) expect(B.latest(saved.records[payload.id]).payload).toEqual(payload);
    const masterBytes = fs.readFileSync(path.join(__dirname, '../../../data/reference-library.json'));
    const exported = M.exportPackage(saved);
    const imported = M.validatePackage(JSON.stringify(exported), saved.id, first.actor, JSON.parse(masterBytes), saved.master.hash);
    expect(imported.workspace).toEqual(exported.workspace);
    expect(await (await read(second)).json()).toEqual(foreignBefore);
    const sqlState = (await pool.query('SELECT state FROM next_workspaces WHERE id=$1', [first.workspace])).rows[0].state;
    for (const payload of payloads) expect(B.latest(sqlState.records[payload.id]).payload).toEqual(payload);
  }, 20000);

  test('foreign routes and backup restore are denied without changing either SQL envelope', async () => {
    const first = await login(accounts[0]), second = await login(accounts[1]);
    const before = await Promise.all([first, second].map(async device => (await pool.query('SELECT state FROM next_workspaces WHERE id=$1', [device.workspace])).rows[0].state));
    for (const [device, foreign] of [[first, second], [second, first]]) {
      expect((await read(device, foreign.workspace)).status).toBe(403);
      expect((await read(device, foreign.workspace, '/restore-preview')).status).toBe(403);
      for (const suffix of ['/operations', '/delete-notebooks', '/receipts', '/restore']) {
        expect((await post(device, suffix, { actor: foreign.actor, confirmed: true }, foreign.workspace)).status).toBe(403);
      }
      const malformed = await fetch(base + '/API/workspaces/' + foreign.workspace + '/Restore/', { method: 'POST', headers: headers(device), body: '{malformed-fictional-backup' });
      expect(malformed.status).toBe(403);
      const preview = await (await read(device, device.workspace, '/restore-preview')).json();
      const imported = M.exportPackage(before[foreign === second ? 1 : 0]);
      expect((await post(device, '/restore', { confirmed: true, expected: preview.fingerprint, operation: randomUUID(), text: JSON.stringify(imported) })).status).toBe(400);
    }
    for (let i = 0; i < accounts.length; i++) {
      expect((await pool.query('SELECT state FROM next_workspaces WHERE id=$1', [accounts[i].workspace])).rows[0].state).toEqual(before[i]);
    }
  }, 20000);

  test('competing owner devices preserve conflict/retry history while the other owner stays unchanged', async () => {
    const first = await login(accounts[0]), another = await login(accounts[0]), second = await login(accounts[1]);
    const foreignBefore = await (await read(second)).json();
    const payload = { ...B.addition('note', 'notes', 'Fictional starting wording', randomUUID(), 'Practice note'), future: { preserved: true } };
    expect((await post(first, '/operations', operation(payload))).status).toBe(200);
    const requests = ['First device', 'Competing device'].map(text => ({ ...operation({ ...payload, text }), base: 1 }));
    const responses = await Promise.all([post(first, '/operations', requests[0]), post(another, '/operations', requests[1])]);
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    const receipts = await Promise.all(responses.map(r => r.json()));
    expect(receipts.map(r => r.outcome).sort()).toEqual(['accepted', 'conflict']);
    await stop(); await start();
    for (let i = 0; i < requests.length; i++) expect(await (await post(first, '/operations', requests[i])).json()).toEqual(receipts[i]);
    const book = await (await read(first)).json();
    expect(book.records[payload.id].current).toBe(2);
    expect(book.conflicts).toHaveLength(1);
    expect(book.records[payload.id].revisions.at(-1).payload.future).toEqual({ preserved: true });
    expect(await (await read(second)).json()).toEqual(foreignBefore);
    const preview = await (await read(first, first.workspace, '/restore-preview')).json();
    const request = { confirmed: true, expected: preview.fingerprint, operation: randomUUID(), text: JSON.stringify(M.exportPackage(book)) };
    const restoredResponse = await post(first, '/restore', request); expect(restoredResponse.status).toBe(200);
    const restored = await restoredResponse.json();
    expect(restored.workspace.privateEpoch).toBe(1);
    expect(restored.workspace.restoreBackups[0].package.workspace).toEqual(book);
    expect((await post(another, '/operations', { ...requests[0], operation: randomUUID(), privateEpoch: 0 })).status).toBe(409);
    await stop(); await start();
    expect(await (await post(first, '/restore', request)).json()).toEqual(restored);
    expect(await (await read(second)).json()).toEqual(foreignBefore);
  }, 20000);

  test('transaction failure and owner-column mismatch roll back without changing either household', async () => {
    const before = await pool.query('SELECT id,state FROM next_workspaces ORDER BY id');
    const repository = new RevisionRepository(pool);
    await expect(repository.transaction(accounts[0].workspace, book => { book.future = { incomplete: true }; throw new Error('Deliberate fictional rollback'); })).rejects.toThrow('Deliberate fictional rollback');
    await expect(pool.query('UPDATE next_workspaces SET owner_id=$2 WHERE id=$1', [accounts[0].workspace, accounts[1].id])).rejects.toMatchObject({ code: '23514' });
    expect((await pool.query('SELECT id,state FROM next_workspaces ORDER BY id')).rows).toEqual(before.rows);
  });
});
