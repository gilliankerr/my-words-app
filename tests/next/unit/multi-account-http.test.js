const session = require('express-session');
const bcrypt = require('bcrypt');
const { randomUUID } = require('node:crypto');
const { createApp } = require('../../../server/next/app');
const { MultiAccountAdapter } = require('../../../server/next/multi-account-adapter');
const { initialBook } = require('../../../server/next/private-local');
const { MemoryRepository } = require('../harness/memory-repository');
const M = require('../../../app-next/js/model');
const B = require('../../../app-next/js/book-records');

const origin = 'https://accounts.example.invalid';
const password = 'fictional-account-test-password';
let server, base, repository, users, mappings, generate, config;
beforeAll(async () => {
  users = [1, 2].map(id => ({ id, username: 'household-' + id, password_hash: bcrypt.hashSync(password + id, 4) }));
  const books = await Promise.all([initialBook('1', 'book-one'), initialBook('2', 'book-two')]);
  for (const book of books) book.members = { [book.owner]: 'manager' };
  mappings = books.map(book => ({ id: book.id, owner_id: Number(book.owner), owner: book.owner }));
  repository = new MemoryRepository(Object.fromEntries(books.map(book => [book.id, book])));
  const authentication = new MultiAccountAdapter({
    users: {
      findUserByUsername: async name => users.find(user => user.username === name),
      findUserById: async id => users.find(user => user.id === id),
      verifyPassword: (entered, hash) => bcrypt.compare(entered, hash)
    },
    pool: { query: async (sql, values) => ({ rows: mappings.filter(row => row.owner_id === values[0]).slice(0, 2) }) }
  });
  generate = jest.fn(async () => ({ fictional: true }));
  config = { repository, authentication, mode: 'multi-account', sessionStore: new session.MemoryStore(), sessionSecret: 'fictional-test-secret-at-least-32-characters', productionOrigin: origin, trustProxy: 1, quickWords: { generate }, situations: { generate, detect: generate } };
  server = createApp(config).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

async function guest() {
  const response = await fetch(base + '/api/session', { headers: { 'x-forwarded-proto': 'https' } });
  return { cookie: response.headers.get('set-cookie').split(';')[0], ...await response.json() };
}
function headers(client) { return { cookie: client.cookie, origin, 'x-forwarded-proto': 'https', 'x-next-csrf': client.csrf, 'content-type': 'application/json' }; }
async function signIn(client, name, entered, extra = {}) {
  return fetch(base + '/api/sign-in', { method: 'POST', headers: headers(client), body: JSON.stringify({ name, password: entered, ...extra }) });
}
async function login(id) {
  const visitor = await guest();
  const response = await signIn(visitor, 'household-' + id, password + id, { actor: '2', workspace: 'book-two' });
  expect(response.status).toBe(200);
  expect(response.headers.get('set-cookie')).toMatch(/Secure/);
  const info = await response.json();
  const client = { ...info, cookie: response.headers.get('set-cookie').split(';')[0] };
  expect(client.cookie).not.toBe(visitor.cookie);
  expect(client.actor).toBe(String(id));
  expect(client.workspace).toBe(id === 1 ? 'book-one' : 'book-two');
  return client;
}
const read = client => fetch(base + '/api/workspaces/' + client.workspace, { headers: headers(client) });
const send = (client, path, body = {}) => fetch(base + path, { method: 'POST', headers: headers(client), body: JSON.stringify(body) });

test('multi-account mode requires secure explicit configuration and a per-actor resolver', () => {
  for (const patch of [{ authentication: undefined }, { authentication: { verify() {}, active() {}, workspaceId: 'book-one' } }, { sessionStore: undefined }, { sessionSecret: undefined }, { productionOrigin: 'http://accounts.example.invalid' }, { trustProxy: undefined }]) {
    expect(() => createApp({ ...config, ...patch })).toThrow();
  }
});

test('two households and independent devices save and reopen only their own complete envelopes', async () => {
  const first = await login(1), second = await login(2), anotherDevice = await login(1);
  expect(anotherDevice.cookie).not.toBe(first.cookie);
  for (const client of [first, second]) {
    const payload = { ...B.addition('note', 'notes', 'Fictional private note for account ' + client.actor, randomUUID(), 'Practice note'), future: { retained: ['complete', client.actor] } };
    const saved = await send(client, '/api/workspaces/' + client.workspace + '/operations', { recordId: payload.id, base: 0, payload, operation: randomUUID() });
    expect(saved.status).toBe(200);
    expect((await saved.json()).outcome).toBe('accepted');
    const reopened = await read(client);
    expect(reopened.headers.get('cache-control')).toBe('no-store');
    const book = await reopened.json();
    expect(book.owner).toBe(client.actor);
    expect(book.records[payload.id].revisions.at(-1).payload).toEqual(payload);
  }
  expect(await (await read(anotherDevice)).json()).toEqual(await (await read(first)).json());
  expect(JSON.stringify(await (await read(first)).json())).not.toContain('Fictional private note for account 2');
  expect(JSON.stringify(await (await read(second)).json())).not.toContain('Fictional private note for account 1');
});

test('guessed foreign workspace routes deny reading, mutation, deletion, receipts, restore and paid generation', async () => {
  const first = await login(1), before = structuredClone(repository.states['book-two']);
  expect((await fetch(base + '/api/workspaces/book-two', { headers: headers(first) })).status).toBe(403);
  expect((await fetch(base + '/api/workspaces/book-two/restore-preview', { headers: headers(first) })).status).toBe(403);
  for (const action of ['operations', 'delete-notebooks', 'receipts', 'restore', 'quick-words', 'situation-generation', 'grants']) {
    const denied = await send(first, '/api/workspaces/book-two/' + action, { actor: '2', owner: '1', members: { '1': 'manager' }, action: 'generate' });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ error: 'Access denied' });
  }
  expect(generate).not.toHaveBeenCalled();
  expect(repository.states['book-two']).toEqual(before);
});

test.each(['/api/workspaces/book-two/restore', '/api/workspaces/book-two/restore/', '/API/workspaces/book-two/restore', '/api/workspaces/book-two/Restore'])(
  'restore alias %s checks account ownership before parsing an untrusted body', async path => {
    const first = await login(1), before = structuredClone(repository.states);
    const response = await fetch(base + path, { method: 'POST', headers: headers(first), body: '{malformed-fictional-backup' });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Access denied' });
    expect(repository.states).toEqual(before);
  }
);

test('foreign backups cannot replace the owned book, while an owned restore retains recovery and retry identity', async () => {
  const first = await login(1), second = await login(2);
  const before = await (await read(first)).json();
  const preview = await (await fetch(base + '/api/workspaces/book-one/restore-preview', { headers: headers(first) })).json();
  const operation = randomUUID();
  const request = { text: JSON.stringify(M.exportPackage(await (await read(second)).json())), expected: preview.fingerprint, operation, confirmed: true };
  expect((await send(first, '/api/workspaces/book-one/restore', request)).status).toBe(400);
  expect(await (await read(first)).json()).toEqual(before);
  request.text = JSON.stringify(M.exportPackage(before));
  const accepted = await send(first, '/api/workspaces/book-one/restore', request);
  expect(accepted.status).toBe(200);
  const restored = await accepted.json();
  expect(restored.workspace.privateEpoch).toBe(1);
  expect(restored.workspace.restoreBackups[0].package.workspace).toEqual(before);
  expect(await (await send(first, '/api/workspaces/book-one/restore', request)).json()).toEqual(restored);
});

test('synthetic users, public setup, permission grants and cross-origin or missing-CSRF requests remain blocked', async () => {
  const visitor = await guest();
  expect((await signIn(visitor, 'owner', 'owner-fictional-only')).status).toBe(401);
  expect((await signIn(visitor, 'household-1', password + '2')).status).toBe(401);
  const first = await login(1);
  for (const endpoint of ['/api/setup', '/api/register', '/api/workspaces/book-one/grants']) expect((await send(first, endpoint)).status).toBe(404);
  for (const patch of [{ origin: 'https://foreign.example.invalid' }, { 'x-next-csrf': '' }]) {
    expect((await fetch(base + '/api/workspaces/book-one/operations', { method: 'POST', headers: { ...headers(first), ...patch }, body: '{}' })).status).toBe(403);
  }
  expect((await read(await guest())).status).toBe(401);
  const runtime = await (await fetch(base + '/js/runtime-config.js')).text();
  expect(runtime).not.toMatch(/household|book-one|book-two|password_hash/);
});

test('a changed or ambiguous workspace mapping revokes the session instead of trusting its old scope', async () => {
  const first = await login(1), original = mappings[0];
  mappings.push({ id: 'another-book', owner_id: 1, owner: '1' });
  try { expect((await read(first)).status).toBe(401); }
  finally { mappings.pop(); }
  expect((await read(first)).status).toBe(401);
  mappings[0] = { ...original, owner: '2' };
  try { expect((await signIn(await guest(), 'household-1', password + '1')).status).toBe(401); }
  finally { mappings[0] = original; }
});

test('removed accounts lose access on their next request and logout invalidates its own session only', async () => {
  const first = await login(1), second = await login(2), firstUser = users.shift();
  try { expect((await read(first)).status).toBe(401); }
  finally { users.unshift(firstUser); }
  expect((await read(first)).status).toBe(401);
  expect((await read(second)).status).toBe(200);
  expect((await send(second, '/api/sign-out')).status).toBe(200);
  expect((await read(second)).status).toBe(401);
});
