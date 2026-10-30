// Real replacement assembly; fictional accounts in a fresh schema inside the
// explicitly authorised disposable loopback database. No legacy DB initialisers.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const { validateDatabaseTarget, verifyDatabaseTarget } = require('../harness/database');
const { createSharedAccountApp } = require('../../../server/next/shared-app');
const { makeFixtures } = require('../fixtures');
const M = require('../../../app-next/js/model');
const run = process.env.NEXT_TEST_DATABASE_URL ? describe : describe.skip;

run('REAL shared account, sessions and recovery in disposable PostgreSQL', () => {
  const schema = 'next_shared_' + randomUUID().replaceAll('-', '');
  const origin = 'https://shared.example.invalid';
  const secret = 'fictional-disposable-session-secret-at-least-32';
  const password = 'fictional-only-password';
  const workspaceId = 'shared-' + randomUUID();
  let admin, pool, connectionString, server, sessionStore, url, initial, schemaCreated = false;
  const headers = device => ({ cookie: device.cookie, origin, 'x-forwarded-proto': 'https', 'x-next-csrf': device.csrf, 'content-type': 'application/json' });
  const read = (device, destination = '') => fetch(url + '/api/workspaces/' + workspaceId + destination, { headers: headers(device) });
  const post = (device, destination, body, patch = {}) => fetch(url + '/api/workspaces/' + workspaceId + destination, { method: 'POST', headers: { ...headers(device), ...patch }, body: JSON.stringify(body) });
  async function start() {
    pool = new Pool({ connectionString, max: 5, options: '-c search_path=' + schema });
    await verifyDatabaseTarget(pool);
    const users = {
      findUserByEmail: async email => (await pool.query('SELECT * FROM users WHERE email=$1', [email])).rows[0],
      findUserById: async id => (await pool.query('SELECT * FROM users WHERE id=$1', [id])).rows[0],
      verifyPassword: (entered, hash) => bcrypt.compare(entered, hash)
    };
    const assembly = createSharedAccountApp({ pool, users, accountId: 41, workspaceId, origin, secret, trustProxy: 1 });
    sessionStore = assembly.sessionStore;
    server = assembly.app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    url = 'http://127.0.0.1:' + server.address().port;
  }
  async function stop() {
    if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    sessionStore?.close(); if (pool) await pool.end();
  }
  async function login(email = 'shared@example.invalid', entered = password) {
    const guest = await fetch(url + '/api/session', { headers: { 'x-forwarded-proto': 'https' } });
    const info = await guest.json(), guestCookie = guest.headers.get('set-cookie').split(';')[0];
    const response = await fetch(url + '/api/sign-in', { method: 'POST', headers: headers({ cookie: guestCookie, csrf: info.csrf }), body: JSON.stringify({ name: email, password: entered }) });
    const body = await response.json();
    return { status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0], guestCookie, ...body };
  }
  beforeAll(async () => {
    connectionString = validateDatabaseTarget(process.env);
    admin = new Pool({ connectionString }); await verifyDatabaseTarget(admin);
    // Generated identifier, never caller-supplied. No existing schema is reset.
    await admin.query('CREATE SCHEMA "' + schema + '"'); schemaCreated = true;
    const setup = await admin.connect();
    try {
      await setup.query('SET search_path TO "' + schema + '"');
      await setup.query('CREATE TABLE users(id integer PRIMARY KEY, email text UNIQUE NOT NULL, password_hash text NOT NULL)');
      await setup.query('CREATE TABLE user_sessions(sid varchar PRIMARY KEY, sess json NOT NULL, expire timestamp(6) NOT NULL)');
      await setup.query(fs.readFileSync(path.join(__dirname, '../../../server/next/schema.sql'), 'utf8'));
      const hash = await bcrypt.hash(password, 4);
      await setup.query('INSERT INTO users VALUES (41,$1,$2),(42,$3,$2)', ['shared@example.invalid', hash, 'outsider@example.invalid']);
      initial = M.clone(makeFixtures().workspaces.demo); initial.id = workspaceId; initial.owner = '41'; initial.members = { '41': 'manager' };
      initial.edition.workspace = workspaceId;
      for (const edition of Object.values(initial.editions)) edition.workspace = workspaceId;
      await setup.query('INSERT INTO next_workspaces(id,owner_id,state) VALUES($1,41,$2::jsonb)', [workspaceId, JSON.stringify(initial)]);
    } finally { setup.release(); }
    await start();
  }, 20000);
  afterAll(async () => {
    await stop();
    if (schemaCreated) { await verifyDatabaseTarget(admin); await admin.query('DROP SCHEMA "' + schema + '" CASCADE'); }
    if (admin) await admin.end();
  });
  test('independent shared sessions rotate, reject outsiders/CSRF and survive a server and pool restart', async () => {
    expect((await login('shared@example.invalid', 'wrong')).status).toBe(401);
    expect((await login('outsider@example.invalid')).status).toBe(401);
    const a = await login(), b = await login();
    expect(a.status).toBe(200); expect(b.status).toBe(200);
    expect(a.actor).toBe('41'); expect(b.actor).toBe('41');
    expect(a.cookie).not.toBe(a.guestCookie); expect(b.cookie).not.toBe(a.cookie);
    expect((await pool.query('SELECT count(*)::int AS count FROM user_sessions WHERE sess->>\'actor\'=\'41\'')).rows[0].count).toBe(2);
    expect((await post(a, '/restore', {}, { 'x-next-csrf': 'wrong' })).status).toBe(403);
    expect((await fetch(url + '/api/workspaces/other', { headers: headers(a) })).status).toBe(403);
    await stop(); await start();
    expect((await read(a)).status).toBe(200); expect((await read(b)).status).toBe(200);
    const out = await fetch(url + '/api/sign-out', { method: 'POST', headers: headers(a), body: '{}' });
    expect(out.status).toBe(200); expect((await read(a)).status).toBe(401); expect((await read(b)).status).toBe(200);
  }, 20000);
  test('same-account sessions retain competing complete edits and retry receipts after reconnect', async () => {
    const a = await login(), b = await login(), snapshot = await (await read(a)).json();
    const record = snapshot.records['e6f89c93-0c18-49e9-9aaf-9134fa14b72d'];
    const request = text => ({ recordId: record.id, base: record.current, operation: randomUUID(), payload: { ...M.clone(record.revisions.at(-1).payload), text } });
    const requests = [request('First fictional device'), request('Second fictional device')];
    const responses = await Promise.all([post(a, '/operations', requests[0]), post(b, '/operations', requests[1])]);
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    const results = await Promise.all(responses.map(r => r.json()));
    expect(results.map(r => r.outcome).sort()).toEqual(['accepted', 'conflict']);
    const conflict = results.find(r => r.outcome === 'conflict');
    expect(conflict.conflict.proposal.payload.originals).toEqual(record.revisions.at(-1).payload.originals);
    await stop(); await start();
    for (let i = 0; i < 2; i++) expect(await (await post(i ? b : a, '/operations', requests[i])).json()).toEqual(results[i]);
    const durable = await (await read(a)).json(); expect(durable.conflicts).toHaveLength(1);
    expect(durable.records[record.id].current).toBe(record.current + 1);
  }, 20000);
  test('restore locks the whole book, retains recovery, rejects old devices and retries unchanged after restart', async () => {
    const a = await login(), b = await login(), before = await (await read(a)).json();
    const preview = await (await read(a, '/restore-preview')).json();
    const body = { confirmed: true, expected: preview.fingerprint, operation: randomUUID(), text: JSON.stringify(M.exportPackage(initial)) };
    const response = await post(a, '/restore', body); expect(response.status).toBe(200);
    const restored = await response.json();
    expect(restored.workspace.privateEpoch).toBe(1);
    expect(restored.workspace.restoreBackups[0].package.workspace).toEqual(before);
    const record = Object.values(before.records)[0];
    const stale = { recordId: record.id, base: record.current, operation: randomUUID(), payload: record.revisions.at(-1).payload, privateEpoch: 0 };
    expect((await post(b, '/operations', stale)).status).toBe(409);
    await stop(); await start();
    expect(await (await post(a, '/restore', body)).json()).toEqual(restored);
    expect((await post(a, '/restore', { ...body, operation: randomUUID() })).status).toBe(409);
    expect(await (await read(b)).json()).toEqual(restored.workspace);
    const nextPreview = await (await read(a, '/restore-preview')).json();
    const second = await post(a, '/restore', { ...body, operation: randomUUID(), expected: nextPreview.fingerprint });
    expect(second.status).toBe(200); const again = await second.json();
    expect(again.workspace.privateEpoch).toBe(2); expect(again.workspace.restoreBackups).toHaveLength(2);
    expect(again.workspace.restoreBackups[0]).toEqual(restored.workspace.restoreBackups[0]);
  }, 20000);
  test('prepared schema rejects an owner mapping mismatch transactionally', async () => {
    const before = (await pool.query('SELECT state FROM next_workspaces WHERE id=$1', [workspaceId])).rows[0].state;
    await expect(pool.query('UPDATE next_workspaces SET owner_id=42 WHERE id=$1', [workspaceId])).rejects.toMatchObject({ code: '23514' });
    expect((await pool.query('SELECT state FROM next_workspaces WHERE id=$1', [workspaceId])).rows[0].state).toEqual(before);
  });
  test('a restore waiting for the workspace lock rechecks its fingerprint before any replacement', async () => {
    const device = await login(), preview = await (await read(device, '/restore-preview')).json();
    const connection = await pool.connect(); let pending;
    try {
      await connection.query('BEGIN');
      const state = (await connection.query('SELECT state FROM next_workspaces WHERE id=$1 FOR UPDATE', [workspaceId])).rows[0].state;
      const unchangedBackups = M.clone(state.restoreBackups);
      pending = post(device, '/restore', { confirmed: true, expected: preview.fingerprint, operation: randomUUID(), text: JSON.stringify(M.exportPackage(initial)) });
      const deadline = Date.now() + 5000; let waiting = false;
      while (Date.now() < deadline) {
        const activity = await pool.query("SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND usename=current_user AND wait_event_type='Lock' AND query LIKE 'SELECT state FROM next_workspaces%'");
        if (activity.rows[0].count) { waiting = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      state.future = { concurrent: 'Complete fictional change while restore waits' };
      await connection.query('UPDATE next_workspaces SET state=$2::jsonb WHERE id=$1', [workspaceId, JSON.stringify(state)]);
      await connection.query('COMMIT');
      expect((await pending).status).toBe(409);
      const retained = await (await read(device)).json();
      expect(retained.future).toEqual(state.future); expect(retained.restoreBackups).toEqual(unchangedBackups);
      expect(retained.privateEpoch).toBe(state.privateEpoch);
    } finally { await connection.query('ROLLBACK'); connection.release(); if (pending) await pending; }
  }, 10000);
});
