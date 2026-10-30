const { createApp } = require('../../../server/next/app');
const { MemoryRepository } = require('../harness/memory-repository');
const { makeFixtures } = require('../fixtures');

let server, base, register;
beforeAll(async () => {
  register = jest.fn(async ({ username }) => ({ username, actor: 'private-id', workspace: 'private-workspace' }));
  server = createApp({ repository: new MemoryRepository(makeFixtures().workspaces), mode: 'memory-test', accountAccess: { register } }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
afterAll(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
async function guest() {
  const response = await fetch(base + '/api/session');
  return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: (await response.json()).csrf };
}
async function send(client, extra = {}, body = { username: 'new-reader', password: 'fictional-password-only' }) {
  return fetch(base + '/api/register', { method: 'POST', headers: { origin: base, cookie: client.cookie, 'x-next-csrf': client.csrf, 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) });
}
test('registration requires same-origin session CSRF and returns no workspace or session identity', async () => {
  const visitor = await guest();
  for (const headers of [{ origin: 'https://foreign.invalid' }, { 'x-next-csrf': '' }, { cookie: '' }]) expect((await send(visitor, headers)).status).toBe(403);
  expect(register).not.toHaveBeenCalled();
  const response = await send(visitor);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ success: true, username: 'new-reader' });
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect((await (await fetch(base + '/api/session', { headers: { cookie: visitor.cookie } })).json()).actor).toBeNull();
});
test('already signed-in users cannot register into their current session', async () => {
  const visitor = await guest();
  const login = await fetch(base + '/api/sign-in', { method: 'POST', headers: { origin: base, cookie: visitor.cookie, 'x-next-csrf': visitor.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'owner', password: 'owner-fictional-only' }) });
  const signedIn = { cookie: login.headers.get('set-cookie').split(';')[0], csrf: (await login.json()).csrf };
  const before = register.mock.calls.length;
  expect((await send(signedIn)).status).toBe(409);
  expect(register.mock.calls.length).toBe(before);
});
test('registration attempts are bounded before calling account creation', async () => {
  const visitor = await guest();
  // Earlier successful registration uses one of the 20 attempts for this address.
  for (let i = 0; i < 19; i++) expect((await send(visitor)).status).toBe(200);
  const before = register.mock.calls.length;
  const response = await send(visitor);
  expect(response.status).toBe(429);
  expect(register.mock.calls.length).toBe(before);
});
