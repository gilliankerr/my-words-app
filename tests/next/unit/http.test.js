const { createApp } = require('../../../server/next/app');
const { MemoryRepository } = require('../harness/memory-repository');
const { makeFixtures } = require('../fixtures');
let server, origin;
beforeAll(async () => {
  server = createApp({ repository: new MemoryRepository(makeFixtures().workspaces), mode: 'memory-test' }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => new Promise(resolve => server.close(resolve)));
test('fresh recovery bypasses cached public scripts without clearing owned browser data', async () => {
  const response = await fetch(origin + '/?fresh=1');
  const html = await response.text();
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(html).toMatch(/\/js\/boot\.js\?fresh=[a-f0-9]+/);
  expect(html).toMatch(/\/js\/trial\.js\?fresh=[a-f0-9]+/);
  expect(html).toMatch(/\/css\/trial\.css\?fresh=[a-f0-9]+/);
  const second = await (await fetch(origin + '/?fresh=1')).text();
  expect(second.match(/\/js\/trial\.js\?fresh=([a-f0-9]+)/)[1]).not.toBe(html.match(/\/js\/trial\.js\?fresh=([a-f0-9]+)/)[1]);
  const asset = await fetch(origin + '/js/trial.js?fresh=test');
  expect(asset.headers.get('cache-control')).toBe('no-store');
  expect(html).not.toMatch(/(?:src|href)="\/(?:js|css|lib)\/[^"?]+"/);
  expect(response.headers.get('content-security-policy')).not.toContain('unsafe-inline');
});
test('My Words install metadata serves the open-book icons through the public allow-list', async () => {
  const manifest = await (await fetch(origin + '/manifest.webmanifest')).json();
  expect(manifest.name).toBe('My Words');
  expect(manifest.short_name).toBe('My Words');
  const sw = await (await fetch(origin + '/sw.js')).text();
  for (const size of [180, 192, 512]) {
    const path = `/assets/app/my-words-${size}.png`;
    const response = await fetch(origin + path);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('image/png');
    const png = Buffer.from(await response.arrayBuffer());
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
    expect(sw).toContain(path);
  }
  expect(manifest.icons).toEqual(expect.arrayContaining([192, 512].map(size => ({ src: `/assets/app/my-words-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' }))));
  for (const page of ['/', '/editor.html']) {
    const html = await (await fetch(origin + page)).text();
    expect(html).toContain('rel="apple-touch-icon" sizes="180x180" href="/assets/app/my-words-180.png"');
    expect(html).toContain('name="apple-mobile-web-app-title" content="My Words"');
  }
  expect((await fetch(origin + '/assets/app/unlisted.png')).status).toBe(404);
});
async function guest() {
  const response = await fetch(origin + '/api/session');
  return { cookie: response.headers.get('set-cookie').split(';')[0], token: (await response.json()).csrf };
}
test('independent authenticated sessions enforce role and exact-origin CSRF', async () => {
  const g = await guest();
  let r = await fetch(origin + '/api/sign-in', { method: 'POST', headers: { cookie: g.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'alex', password: 'alex-fictional-only' }) });
  expect(r.status).toBe(403);
  r = await fetch(origin + '/api/sign-in', { method: 'POST', headers: { cookie: g.cookie, origin, 'x-next-csrf': g.token, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'alex', password: 'alex-fictional-only' }) });
  expect(r.status).toBe(200);
  const cookie = r.headers.get('set-cookie').split(';')[0];
  expect((await r.json()).actor).toBe('alex');
  expect((await fetch(origin + '/api/workspaces/demo', { headers: { cookie } })).status).toBe(200);
  expect((await fetch(origin + '/api/workspaces/other', { headers: { cookie } })).status).toBe(403);
  expect((await fetch(origin + '/api/workspaces/demo', { headers: { cookie: (await guest()).cookie } })).status).toBe(401);
});
test.each(['/server.js', '/server/next/app.js', '/tests/next/fixtures.js', '/.env', '/.git/config', '/reports/compactCommunicationBook-interface-redesign-prompt.md', '/app-next/js/private-importer.js', '/exports/backup.json'])('exact asset allow-list denies %s', async path => {
  expect((await fetch(origin + path)).status).toBe(404);
});
test('descriptive artwork and offline credits are public; unlisted images and curation are not',async()=>{
  for(const url of ['/assets/dictionary/arasaac/27728_500.png','/assets/dictionary/ARASAAC-LICENSE.txt','/assets/dictionary/ARASAAC-CREDITS.txt','/js/symbol-catalogue.js','/js/dictionary-view.js','/js/dictionary-editor.js'])expect((await fetch(origin+url)).status).toBe(200);
  for(const url of ['/assets/dictionary/arasaac/999999999_500.png','/data/icon-curation.json','/tmp/icon-acquisition/all-en.json','/assets/dictionary/symbols/2555.svg'])expect((await fetch(origin+url)).status).toBe(404);
});
test('excluded picture artwork is outside the public allow-list',async()=>{
  const brief=require('../../../data/icon-curation.json');
  for(const c of brief.excludedConcepts)expect((await fetch(origin+'/assets/dictionary/arasaac/'+c.sourceId+'_500.png')).status).toBe(404);
});

test('public resources are served with meaningful CSP and API never cacheable', async () => {
  const r = await fetch(origin + '/');
  expect(r.status).toBe(200);
  expect(r.headers.get('content-security-policy')).toContain("script-src 'self'");
  expect(r.headers.get('content-security-policy')).not.toContain('unsafe-inline');
  expect((await fetch(origin + '/api/session')).headers.get('cache-control')).toBe('no-store');
});
