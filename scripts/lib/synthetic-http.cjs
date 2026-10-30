'use strict';
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const B = require('../../app-next/js/book-records');
const M = require('../../app-next/js/model');
async function login(ctx, id) {
  const origin = ctx.state.origin;
  const request = async (pathname, body, client) => {
    const response = await ctx.fetch(origin + pathname, { signal: AbortSignal.timeout(15000), method: body ? 'POST' : 'GET', headers: { ...(client?.cookie ? { cookie: client.cookie } : {}), ...(body ? { origin, 'content-type': 'application/json', 'x-next-csrf': client?.csrf || '' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return response;
  };
  const guest = await request('/api/session'); assert.equal(guest.status, 200, 'Synthetic guest session failed');
  const before = { ...await guest.json(), cookie: guest.headers.get('set-cookie')?.split(';')[0] };
  const response = await request('/api/sign-in', { name: 'household-' + id, password: ctx.secrets.login + '-' + id }, before);
  assert.equal(response.status, 200, 'Synthetic login failed');
  const client = { ...await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  assert.ok(client.actor === String(id) && client.workspace === 'synthetic-' + id && client.cookie && client.cookie !== before.cookie, 'Synthetic session identity mismatch');
  client.request = (suffix = '', body, workspace = client.workspace) => request('/api/workspaces/' + workspace + suffix, body, client);
  return client;
}
async function httpJourney(ctx) {
  const [first, second] = await Promise.all([login(ctx, 101), login(ctx, 102)]);
  const secondBefore = await (await second.request()).json();
  const payload = { ...B.addition('note', 'notes', 'Fictional hosted verification ' + randomUUID(), randomUUID(), 'Synthetic verification'), future: { synthetic: true, retained: ['complete'] } };
  const operation = { recordId: payload.id, base: 0, payload, operation: randomUUID() };
  const response = await first.request('/operations', operation); assert.equal(response.status, 200);
  assert.equal((await response.json()).outcome, 'accepted');
  const snapshot = await (await first.request()).json();
  assert.equal(M.canonical(snapshot.records[payload.id].revisions.at(-1).payload), M.canonical(payload));
  M.validatePackage(JSON.stringify(M.exportPackage(snapshot)), first.workspace, first.actor);
  for (const suffix of ['', '/restore-preview']) assert.equal((await first.request(suffix, undefined, second.workspace)).status, 403);
  for (const suffix of ['/operations', '/receipts', '/delete-notebooks', '/restore', '/quick-words', '/situation-generation']) assert.equal((await first.request(suffix, { ...operation, action: 'generate' }, second.workspace)).status, 403);
  assert.equal(M.canonical(await (await second.request()).json()), M.canonical(secondBefore));
  const preview = await (await first.request('/restore-preview')).json();
  const restore = { text: JSON.stringify(M.exportPackage(snapshot)), expected: preview.fingerprint, confirmed: true, operation: randomUUID() };
  const restored = await first.request('/restore', restore); assert.equal(restored.status, 200);
  const receipt = await restored.json(); assert.equal(receipt.workspace.owner, first.actor);
  assert.equal(M.canonical(await (await first.request('/restore', restore)).json()), M.canonical(receipt));
  assert.equal((await first.request('/quick-words', { topic: 'Fictional unavailable generation' })).status, 503);
  for (const pathname of ['/api/workspaces/' + first.workspace, '/.git/config', '/AGENTS.md', '/server/next/synthetic-preview.js', '/backups/', '/reports/']) {
    const anonymous = await ctx.fetch(ctx.state.origin + pathname, { signal: AbortSignal.timeout(10000) });
    assert.equal(anonymous.status, pathname.startsWith('/api/') ? 401 : 404);
  }
}
module.exports = { login, httpJourney };
