const session = require('express-session');
const { createApp } = require('../../../server/next/app');
const { MemoryRepository } = require('../harness/memory-repository');
const { makeFixtures } = require('../fixtures');
let server, base;
const generate = jest.fn(async () => ({ success: true, words: Array.from({ length: 50 }, (_, i) => 'Synthetic ' + i) }));
const situationGenerate = jest.fn(async () => ({ success: true, notebook: { title: 'Synthetic', sections: [{ name: 'Discussion', words: ['Word'] }] } }));
beforeAll(async () => {
  server = createApp({ repository: new MemoryRepository(makeFixtures().workspaces), mode: 'shared-account', authentication: { workspaceId: 'demo', active: async a => a === 'owner', verify: async () => 'owner' }, sessionStore: new session.MemoryStore(), productionOrigin: 'https://shared.example.invalid', sessionSecret: 'synthetic-secret-at-least-32-characters', trustProxy: 1, quickWords: { generate }, situations: { generate: situationGenerate, detect: async () => ({ success: true, entities: [] }) } }).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r)); base = 'http://127.0.0.1:' + server.address().port;
});
afterAll(() => new Promise(r => server.close(r)));
test('generation requires authentication, CSRF and the owned workspace; errors never echo provider content', async () => {
  const guest = await fetch(base + '/api/session', { headers: { 'x-forwarded-proto': 'https' } });
  let cookie = guest.headers.get('set-cookie').split(';')[0], csrf = (await guest.json()).csrf;
  const post = (path, body, token = csrf) => fetch(base + path, { method: 'POST', headers: { cookie, 'x-forwarded-proto': 'https', origin: 'https://shared.example.invalid', 'x-next-csrf': token, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  expect((await post('/api/workspaces/demo/quick-words', { keywords: 'synthetic topic' })).status).toBe(401);
  expect((await post('/api/workspaces/demo/situation-generation', { action: 'generate', situation: 'Synthetic situation' })).status).toBe(401);
  const login = await post('/api/sign-in', {}); cookie = login.headers.get('set-cookie').split(';')[0]; csrf = (await login.json()).csrf;
  expect((await post('/api/workspaces/demo/quick-words', { keywords: 'synthetic topic' }, 'bad')).status).toBe(403);
  expect((await post('/api/workspaces/other/quick-words', { keywords: 'synthetic topic' })).status).toBe(403);
  expect((await post('/api/workspaces/demo/situation-generation', { action: 'generate', situation: 'Synthetic situation' }, 'bad')).status).toBe(403);
  expect((await post('/api/workspaces/other/situation-generation', { action: 'generate', situation: 'Synthetic situation' })).status).toBe(403);
  const notebook = await post('/api/workspaces/demo/situation-generation', { action: 'generate', situation: 'Synthetic situation' }); expect(notebook.status).toBe(200); expect(notebook.headers.get('cache-control')).toBe('no-store');
  situationGenerate.mockRejectedValueOnce(new Error('PRIVATE PROVIDER ERROR'));
  const unavailable = await post('/api/workspaces/demo/situation-generation', { action: 'generate', situation: 'Synthetic situation' }); expect(unavailable.status).toBe(503); expect(await unavailable.text()).not.toContain('PRIVATE');
  const result = await post('/api/workspaces/demo/quick-words', { keywords: 'synthetic topic' }); expect(result.status).toBe(200); expect((await result.json()).words).toHaveLength(50);
  generate.mockRejectedValueOnce(new Error('sensitive provider body'));
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  const failed = await post('/api/workspaces/demo/quick-words', { keywords: 'synthetic topic' }); expect(failed.status).toBe(503); expect(JSON.stringify(await failed.json())).not.toContain('sensitive'); expect(log).not.toHaveBeenCalled(); log.mockRestore();
});
test('focused completion uses the existing model policy and validates output without raw error leakage', async () => {
const { QuickWordsService } = require('../../../server/next/quick-words-service');


  const complete = jest.fn(async () => ({ choices: [{ message: { content: JSON.stringify({ transactional: Array.from({ length: 20 }, (_, i) => 'Item ' + i), conversational: Array.from({ length: 20 }, (_, i) => 'Phrase ' + i), repair: Array.from({ length: 10 }, (_, i) => 'Repair ' + i) }) } }] }));
  const service = new QuickWordsService({ client: {}, complete });
  expect((await service.generate({ keywords: 'synthetic topic' })).words).toHaveLength(50);
  expect(complete.mock.calls[0][2]).toEqual({ json: true, model: 'anthropic/claude-haiku-5.5', reasoningEffort: 'low' });
  complete.mockResolvedValueOnce({ choices: [{ message: { content: '{bad private output' } }] });
  await expect(service.generate({ keywords: 'topic', clues: ['tangential', 'clue'], existingWords: ['Old'] })).rejects.toThrow('Words could not be generated');
  await expect(service.generate({ keywords: {}, clues: [] })).rejects.toThrow('Enter a topic');
});

test('generation requests contextual interpretation of imperfect clues and preserves the entered abbreviation', async () => {
  const { QuickWordsService } = require('../../../server/next/quick-words-service');
  const complete = jest.fn(async () => ({ choices: [{ message: { content: JSON.stringify({ words: Array.from({ length: 50 }, (_, i) => 'Word ' + i) }) } }] }));
  await new QuickWordsService({ client: {}, complete }).generate({ keywords: 'Dentist pain bld' });
  const request = complete.mock.calls[0][1];
  // JSON mode plus explicit numbered slots avoids costly schema compilation.
  expect(request.response_format).toBeUndefined();
  expect(request.messages[1].content).toContain('Required output keys under words: word01,word02');
  expect(request.messages[1].content).toContain('word49,word50');
  expect(request.messages[0].content).toMatch(/abbreviations/i);
  expect(request.messages[0].content).toMatch(/misspellings/i);
  expect(request.messages[0].content).toMatch(/context/i);
  expect(request.messages[1].content).toContain('"keywords":"Dentist pain bld"');
});

test('fixed named output slots yield 50 initial words and 40 additional words', async () => {
  const { QuickWordsService } = require('../../../server/next/quick-words-service');
  const complete = jest.fn(async (_, request) => {
    const keys = /Required output keys under words: ([^\n]+)/.exec(request.messages[1].content)[1].split(',');
    return { choices: [{ message: { content: JSON.stringify({ words: Object.fromEntries(keys.map((key, i) => [key, 'Choice ' + i])) }) } }] };
  });
  const service = new QuickWordsService({ client: {}, complete });
  const first = await service.generate({ keywords: 'Synthetic' });
  expect(first.words).toHaveLength(50);
  const more = await service.generate({ keywords: 'Synthetic', clues: ['Clue'], existingWords: first.words });
  expect(more.words).toHaveLength(40);
});

test('the installed SDK receives a bounded timeout without automatic paid retries', async () => {
  const { QuickWordsService } = require('../../../server/next/quick-words-service');
  const create = jest.fn(async () => ({ choices: [{ message: { content: JSON.stringify({ words: Array.from({ length: 50 }, (_, i) => 'Word ' + i) }) } }] }));
  await new QuickWordsService({ client: { chat: { completions: { create } } } }).generate({ keywords: 'Synthetic topic' });
  expect(create.mock.calls[0][1]).toEqual({ timeout: 45000, maxRetries: 0 });
});
