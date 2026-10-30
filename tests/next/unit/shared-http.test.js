const session = require('express-session');
const { createApp } = require('../../../server/next/app');
const { MemoryRepository } = require('../harness/memory-repository');
const { makeFixtures } = require('../fixtures');

let server, url;
const origin = 'https://shared.example.invalid';
const authentication = { workspaceId: 'demo', verify: jest.fn(async (name, password) => name === 'shared@example.invalid' && password === 'correct' ? 'owner' : null), active: jest.fn(async actor => actor === 'owner') };
const options = () => ({ repository: new MemoryRepository(makeFixtures().workspaces), mode: 'shared-account', authentication, productionOrigin: origin, sessionSecret: 'test-only-secret-that-is-at-least-32-characters', sessionStore: new session.MemoryStore(), trustProxy: 1 });
beforeAll(async () => { server = createApp(options()).listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); url = 'http://127.0.0.1:' + server.address().port; });
afterAll(() => new Promise(resolve => server.close(resolve)));
async function guest() {
  const r = await fetch(url + '/api/session', { headers: { 'x-forwarded-proto': 'https' } });
  return { cookie: r.headers.get('set-cookie')?.split(';')[0], csrf: (await r.json()).csrf };
}
async function login(g, name = 'shared@example.invalid', requestOrigin = origin) {
  const r = await fetch(url + '/api/sign-in', { method: 'POST', headers: { 'x-forwarded-proto': 'https', cookie: g.cookie, origin: requestOrigin, 'x-next-csrf': g.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ name, password: 'correct' }) });
  return r;
}
test('shared mode fails closed without durable session configuration and an exact HTTPS origin', () => {
  for (const patch of [{ authentication: undefined }, { sessionStore: undefined }, { sessionSecret: undefined }, { productionOrigin: 'http://shared.example.invalid' }, { trustProxy: undefined }]) expect(() => createApp({ ...options(), ...patch })).toThrow();
  expect(() => createApp({ ...options(), mode: 'production' })).toThrow();
});

test('household service does not expose beta registration or join pages', async () => {
  const visitor = await guest();
  const response = await fetch(url + '/api/register', { method: 'POST', headers: { cookie: visitor.cookie, origin, 'x-next-csrf': visitor.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ username: 'new-reader', password: 'fictional-password-only' }) });
  expect(response.status).toBe(404);
  expect((await fetch(url + '/join.html')).status).toBe(404);
});

test('failed session destruction cannot report a successful sign-out', async () => {
  const config = options();
  const destroy = jest.spyOn(config.sessionStore, 'destroy');
  const local = createApp(config).listen(0, '127.0.0.1');
  await new Promise(resolve => local.once('listening', resolve));
  const base = 'http://127.0.0.1:' + local.address().port;
  try {
    const guestResponse = await fetch(base + '/api/session', { headers: { 'x-forwarded-proto': 'https' } });
    const guestCookie = guestResponse.headers.get('set-cookie').split(';')[0];
    const guestInfo = await guestResponse.json();
    const signedIn = await fetch(base + '/api/sign-in', { method: 'POST', headers: { 'x-forwarded-proto': 'https', cookie: guestCookie, origin, 'x-next-csrf': guestInfo.csrf, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'shared@example.invalid', password: 'correct' }) });
    expect(signedIn.status).toBe(200);
    const cookie = signedIn.headers.get('set-cookie').split(';')[0], { csrf } = await signedIn.json();
    destroy.mockImplementationOnce((id, callback) => callback(new Error('Private session-store failure')));
    const headers = { cookie, origin, 'x-next-csrf': csrf, 'content-type': 'application/json' };
    const response = await fetch(base + '/api/sign-out', { method: 'POST', headers, body: '{}' });
    expect(response.status).toBe(500);
    expect(await response.json()).not.toEqual({ success: true });
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(destroy).toHaveBeenCalled();
    expect((await fetch(base + '/api/workspaces/demo', { headers: { cookie } })).status).toBe(200);
    const retry = await fetch(base + '/api/sign-out', { method: 'POST', headers, body: '{}' });
    expect(await retry.json()).toEqual({ success: true });
    expect((await fetch(base + '/api/workspaces/demo', { headers: { cookie } })).status).toBe(401);
  } finally { destroy.mockRestore(); await new Promise(resolve => local.close(resolve)); }
});
test('separate device sessions share one owned workspace, rotate on login, and deny grants and outsiders', async () => {
  const g = await guest(); expect(g.cookie).toBeDefined();
  const a = await login(g); expect(a.status).toBe(200);
  expect(a.headers.get('set-cookie')).toMatch(/Secure/);
  const info = await a.json(); expect(info.workspace).toBe('demo');
  const cookie = a.headers.get('set-cookie').split(';')[0]; expect(cookie).not.toBe(g.cookie);
  const b = await login(await guest()); expect(b.status).toBe(200);
  expect(b.headers.get('set-cookie').split(';')[0]).not.toBe(cookie);
  expect((await b.json()).actor).toBe(info.actor);
  expect((await fetch(url + '/api/workspaces/demo', { headers: { cookie } })).status).toBe(200);
  expect((await fetch(url + '/api/workspaces/other', { headers: { cookie } })).status).toBe(403);
  expect((await fetch(url + '/api/workspaces/demo/grants', { method: 'POST', headers: { cookie, origin, 'x-next-csrf': info.csrf, 'content-type': 'application/json' }, body: '{}' })).status).toBe(404);
  expect((await login(await guest(), 'owner')).status).toBe(401);
  expect((await login(await guest(), 'shared@example.invalid', 'https://unrelated.example.invalid')).status).toBe(403);
  authentication.active.mockResolvedValueOnce(false);
  expect((await fetch(url + '/api/workspaces/demo', { headers: { cookie } })).status).toBe(401);
});

test('shared restore routes require session, owner workspace, CSRF, current preview and exact retry identity', async () => {
  const M = require('../../../app-next/js/model'), { randomUUID } = require('node:crypto');
  expect((await fetch(url + '/api/workspaces/demo/restore-preview')).status).toBe(401);
  const signed = await login(await guest()), cookie = signed.headers.get('set-cookie').split(';')[0], info = await signed.json();
  const headers = { cookie, origin, 'x-next-csrf': info.csrf, 'content-type': 'application/json' };
  expect((await fetch(url + '/api/workspaces/other/restore-preview', { headers: { cookie } })).status).toBe(403);
  const previewResponse = await fetch(url + '/api/workspaces/demo/restore-preview', { headers: { cookie } });
  expect(previewResponse.status).toBe(200); expect(previewResponse.headers.get('cache-control')).toBe('no-store');
  const preview = await previewResponse.json(), before = await (await fetch(url + '/api/workspaces/demo', { headers: { cookie } })).json();
  const body = JSON.stringify({ text: JSON.stringify(M.exportPackage(makeFixtures().workspaces.demo)), expected: preview.fingerprint, confirmed: true, operation: randomUUID() });
  const send = (requestHeaders, text = body) => fetch(url + '/api/workspaces/demo/restore', { method: 'POST', headers: requestHeaders, body: text });
  expect((await send({ ...headers, 'x-next-csrf': 'wrong' })).status).toBe(403);
  expect((await send(headers, JSON.stringify({ ...JSON.parse(body), confirmed: false }))).status).toBe(400);
  const accepted = await send(headers); expect(accepted.status).toBe(200);
  const restored = await accepted.json(); expect(restored.workspace.privateEpoch).toBe(1);
  expect(restored.workspace.restoreBackups[0].package.workspace).toEqual(before);
  expect(await (await send(headers)).json()).toEqual(restored);
  expect((await send(headers, JSON.stringify({ ...JSON.parse(body), operation: randomUUID() }))).status).toBe(409);
  const record = Object.values(before.records)[0];
  const stale = await fetch(url + '/api/workspaces/demo/operations', { method: 'POST', headers, body: JSON.stringify({ recordId: record.id, base: record.current, payload: record.revisions.find(r => r.number === record.current).payload, operation: randomUUID(), privateEpoch: 0 }) });
  expect(stale.status).toBe(409);
});

test.each(['/api/workspaces/other/restore', '/api/workspaces/other/restore/', '/API/workspaces/other/restore', '/api/workspaces/other/Restore'])(
  'shared restore alias %s checks ownership before parsing an untrusted body', async path => {
    const signed = await login(await guest()), info = await signed.json();
    const headers = { cookie: signed.headers.get('set-cookie').split(';')[0], origin, 'x-next-csrf': info.csrf, 'content-type': 'application/json' };
    const response = await fetch(url + path, { method: 'POST', headers, body: '{malformed-fictional-backup' });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Access denied' });
  }
);
