const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../../../server/next/app');
const { PrivateLocalRepository } = require('../../../server/next/private-local');
let directory, repository, server, origin;
beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-private-http-'));
  repository = await PrivateLocalRepository.open(directory);
  server = createApp({ repository, authentication: repository, mode: 'private-local', privateOrigin: 'http://127.0.0.1:3178' }).listen(3178, '127.0.0.1');
  await new Promise(resolve => server.on('listening', resolve)); origin = 'http://127.0.0.1:3178';
});
afterAll(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await repository.close(); await fs.rm(directory, { recursive: true, force: true }); });
async function session() { const r = await fetch(origin + '/api/session'); return { cookie: r.headers.get('set-cookie').split(';')[0], info: await r.json() }; }
async function post(route, g, body, extra = {}) { return fetch(origin + '/api/' + route, { method: 'POST', headers: { cookie: g.cookie, origin, 'x-next-csrf': g.info.csrf, 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) }); }
test('private bootstrap is CSRF guarded, one-time, and cannot use synthetic credentials', async () => {
  const guest = await session(); expect(guest.info.setup).toBe(true);
  expect((await post('setup', guest, { password: 'fictional-test-passphrase' }, { origin: 'http://elsewhere.invalid' })).status).toBe(403);
  const setup = await post('setup', guest, { password: 'fictional-test-passphrase' }); expect(setup.status).toBe(200);
  const owner = { cookie: setup.headers.get('set-cookie').split(';')[0], info: await setup.json() };
  expect(owner.info.actor).toBe(repository.state.account.actor); expect(owner.info.workspace).toBe(repository.workspaceId);
  expect((await post('setup', owner, { password: 'another-test-passphrase' })).status).toBe(409);
  expect((await post('sign-in', await session(), { name: 'alex', password: 'alex-fictional-only' })).status).toBe(401);
  expect((await fetch(origin + '/api/workspaces/' + repository.workspaceId)).status).toBe(401);
  expect((await fetch(origin + '/api/workspaces/demo', { headers: { cookie: owner.cookie } })).status).toBe(403);
  expect((await post('workspaces/' + repository.workspaceId + '/grants', owner, { target: 'alex', role: 'editor' })).status).toBe(404);
  const signIn = await post('sign-in', await session(), { password: 'fictional-test-passphrase' }); expect(signIn.status).toBe(200);
  const current = await fetch(origin + '/api/private-state', { headers: { cookie: owner.cookie } });
  const currentInfo = await current.json();
  const backup = require('../../../app-next/js/model').exportPackage(repository.state.workspace);
  expect((await post('restore-private-book', owner, { text: JSON.stringify(backup), expected: currentInfo.fingerprint, confirmed: true }, { origin: 'http://elsewhere.invalid' })).status).toBe(403);
  expect((await post('restore-private-book', await session(), { text: JSON.stringify(backup), expected: currentInfo.fingerprint, confirmed: true })).status).toBe(401);
  expect((await post('restore-private-book', owner, { text: JSON.stringify(backup), expected: 'stale', confirmed: true })).status).toBe(409);
  expect((await post('restore-private-book', owner, { text: JSON.stringify(backup), expected: currentInfo.fingerprint, confirmed: true })).status).toBe(200);
  const id = require('node:crypto').randomUUID();
  const operation = { recordId: id, base: 0, operation: require('node:crypto').randomUUID(), action: 'edit', payload: require('../../../app-next/js/book-records').addition('page', 'personal', 'Fictional pending wording', id, 'Personal page') };
  expect((await post('workspaces/' + repository.workspaceId + '/operations', owner, operation)).status).toBe(409);
  expect((await post('workspaces/' + repository.workspaceId + '/operations', owner, { ...operation, privateEpoch: repository.state.workspace.privateEpoch })).status).toBe(200);
});
test('fixed loopback host rejects rebinding and private files are never public assets', async () => {
  // Node fetch replaces Host; raw HTTP verifies the actual rebinding request on the wire.
  const status = await new Promise((resolve, reject) => { require('node:http').get(origin + '/', { headers: { host: 'attacker.invalid:3178' } }, r => { r.resume(); resolve(r.statusCode); }).on('error', reject); });
  expect(status).toBe(403);
  for (const file of ['/private-book.json', '/recovery/', '/server/next/private-local.js', '/.git/config']) expect((await fetch(origin + file)).status).toBe(404);
  const runtime = await fetch(origin + '/js/runtime-config.js'); expect(await runtime.text()).toContain('"privateLocal":true');
  expect((await fetch(origin + '/api/session')).headers.get('cache-control')).toBe('no-store');
});
