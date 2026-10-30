const { createApp } = require('../../../server/next/app');
const { MemoryRepository } = require('../harness/memory-repository');
const { makeFixtures } = require('../fixtures');
let server, base;
beforeAll(async () => {
  server = createApp({ repository: new MemoryRepository(makeFixtures().workspaces), mode: 'memory-test' }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve)); base = 'http://127.0.0.1:' + server.address().port;
});
afterAll(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
test('privacy and the actual MIT licence are available anonymously without exposing source files', async () => {
  const page = await fetch(base + '/privacy.html'); expect(page.status).toBe(200); expect(await page.text()).toContain('Privacy and development');
  const licence = await fetch(base + '/licence.txt'); expect(licence.status).toBe(200); expect(licence.headers.get('content-type')).toContain('text/plain'); expect(await licence.text()).toContain('MIT License');
  for (const route of ['/LICENSE', '/server/next/app.js', '/reports/mywords-privacy-review-prompt.md', '/api/contact']) expect((await fetch(base + route)).status).toBe(404);
});
test('every linked artwork notice is public readable text without opening the asset directory', async () => {
  const page = await (await fetch(base + '/privacy.html')).text();
  const notices = [...page.matchAll(/href="(\/assets\/dictionary\/[A-Z-]+\.txt)"/g)].map(match => match[1]);
  expect(notices).toContain('/assets/dictionary/MULBERRY-LICENSE.txt');
  for (const route of notices) {
    const response = await fetch(base + route);
    expect({ route, status: response.status }).toEqual({ route, status: 200 });
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(await response.text()).toMatch(/Creative Commons/i);
  }
  for (const route of ['/assets/dictionary/', '/assets/dictionary/unlisted.txt']) expect((await fetch(base + route)).status).toBe(404);
});
