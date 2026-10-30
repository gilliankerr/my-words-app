const N = require('../../../app-next/js/notebooks');
const sample = () => ({ title: 'Synthetic meeting', sections: [{ name: 'Discussion', words: ['Useful word'], items: [{ text: 'A complete thought.', context: 'Retained context', future: 7 }] }], frontMatter: { content: { summary: 'Complete summary' } }, future: { retained: true } });
test('book generation follows targeted search, separate reference card, then grounded plain vocabulary', async () => {
  const { SituationService } = require('../../../server/next/situation-service');
  const card = { title: 'Synthetic book', author: 'Fictional author', summary: 'Verified summary.', mainCharacters: ['Verified person'], themes: ['Housing'], discussionStarters: ['What changed?'], future: { retained: true } };
  const reply = value => ({ choices: [{ message: { content: typeof value === 'string' ? value : JSON.stringify(value) } }] });
  const complete = jest.fn().mockResolvedValueOnce(reply('Verified book context with specific people, places, housing and nonfiction arguments.')).mockResolvedValueOnce(reply(card)).mockResolvedValueOnce(reply(sample()));
  const result = await new SituationService({ client: {}, complete }).generate({ situation: 'Book club discussing Synthetic book by Fictional author', details: 'Private preparation note', entity: { type: 'book', name: 'Synthetic book', author: 'Fictional author' }, confirmed: true });
  expect(complete).toHaveBeenCalledTimes(3);
  expect(complete.mock.calls[0][2]).toEqual({ online: true });
  const search = complete.mock.calls[0][1].messages.map(m => m.content).join('\n');
  expect(search).toContain('"Synthetic book" by Fictional author book summary characters plot themes');
  expect(search).not.toContain('Private preparation note');
  expect(complete.mock.calls[1][2]).toEqual({ json: true });
  expect(complete.mock.calls[2][1].messages[1].content).toContain('Verified book context');
  expect(complete.mock.calls[2][1].messages[1].content).toContain('Do not prefix');
  expect(complete.mock.calls[2][1].messages[1].content).not.toMatch(/AT LEAST 550-650|Label them clearly/);
  expect(result.notebook.frontMatter.content).toEqual(card);
  expect(result.notebook.future).toEqual({ retained: true });
});
test('generated notebooks retain the full envelope and reject incomplete or malformed wording', () => {
  expect(typeof N.validateGeneration).toBe('function');
  const notebook = sample(); expect(N.validateGeneration({ success: true, notebook })).toEqual(notebook);
  for (const result of [null, { success: false, notebook }, { success: true, notebook: { title: 'Incomplete' } }, { success: true, notebook: { sections: [{ name: 'Bad', words: [{}] }] } }]) expect(() => N.validateGeneration(result)).toThrow();
  for (const name of ['Communication Partner Guide', 'Alphabet grid']) expect(() => N.validateGeneration({ success: true, notebook: { sections: [{ name, words: ['Excluded structure'] }] } })).toThrow();
});
test('situation service reuses policy/templates, confirms online lookup and never leaks provider errors', async () => {
  const { SituationService } = require('../../../server/next/situation-service');
  const response = content => ({ choices: [{ message: { content: JSON.stringify(content) } }] });
  const complete = jest.fn(async () => response(sample()));
  const service = new SituationService({ client: {}, complete });
  expect((await service.generate({ situation: 'A synthetic discussion', details: 'Private synthetic clue' })).notebook.future).toEqual({ retained: true });
  expect(complete.mock.calls[0][2]).toEqual({ json: true });
  expect(complete.mock.calls[0][1].messages[0].content).not.toContain('Intact comprehension');
  await expect(service.generate({ situation: 'A synthetic discussion', entity: { name: 'Synthetic book', type: 'book' } })).rejects.toMatchObject({ status: 400 });
  complete.mockResolvedValueOnce(response({ entities: [{ name: 'Synthetic book', type: 'book', description: 'A fictional book' }] }));
  expect((await service.detect({ situation: 'Book club discussing Synthetic book' })).entities).toHaveLength(1);
  complete.mockResolvedValueOnce({ choices: [{ message: { content: 'Synthetic book details with some characters and themes for the fixture.' } }] });
  complete.mockResolvedValueOnce(response({ title: 'Synthetic book', author: 'Fictional author', summary: 'A complete synthetic plot summary.', mainCharacters: ['Fictional character — brief description'], themes: ['Fictional theme'], discussionStarters: ['What did you think?'] }));
  complete.mockResolvedValueOnce(response({ ...sample(), frontMatter: { content: { title: 'Synthetic book', author: 'Fictional author', summary: 'A complete synthetic plot summary.', mainCharacters: ['Fictional character — brief description'], themes: ['Fictional theme'], discussionStarters: ['What did you think?'] } } }));
  await service.generate({ situation: 'Book club discussing Synthetic book', entity: { name: 'Synthetic book', type: 'book' }, confirmed: true });
  expect(complete.mock.calls.at(-3)[2]).toEqual({ online: true });
  complete.mockRejectedValueOnce(new Error('PRIVATE RAW PROVIDER BODY'));
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  await expect(service.generate({ situation: 'A synthetic discussion' })).rejects.toThrow('Notebook could not be generated'); expect(log).not.toHaveBeenCalled(); log.mockRestore();
});

test('confirmed book lookup requires and preserves the designed reference card', async () => {
  const { SituationService } = require('../../../server/next/situation-service');
  const card = { title: 'Synthetic book', author: 'Fictional author', summary: 'A complete synthetic plot summary.', mainCharacters: ['Fictional character — brief description'], themes: ['Fictional theme'], discussionStarters: ['What did you think?'], future: { retained: true } };
  const response = value => ({ choices: [{ message: { content: typeof value === 'string' ? value : JSON.stringify(value) } }] });
  const complete = jest.fn().mockResolvedValueOnce(response('Verified synthetic context describing a fictional book, its author and characters.')).mockResolvedValueOnce(response(card)).mockResolvedValueOnce(response({ ...sample(), frontMatter: { content: card, futureOuter: 9 } }));
  const service = new SituationService({ client: {}, complete });
  const input = { situation: 'Book club discussing Synthetic book by Fictional author', entity: { type: 'book', name: 'Synthetic book', author: 'Fictional author' }, confirmed: true };
  const result = await service.generate(input);
  expect(result.notebook.frontMatter).toMatchObject({ entityType: 'book', entityName: 'Synthetic book', content: card, futureOuter: 9 });
  expect(complete.mock.calls[1][1].messages[1].content).toContain('discussionStarters');
  expect(complete.mock.calls[2][1].messages[1].content).not.toMatch(/Intact comprehension|MILD stage PPA/i);
  expect(complete.mock.calls[2][1].messages[1].content).toContain('THIS IS A BOOK CLUB DISCUSSION');
  expect(complete.mock.calls[0][1].messages[1].content).toContain('"Synthetic book" by Fictional author');
  complete.mockResolvedValueOnce(response('Verified synthetic context describing a fictional book, its author and characters.')).mockResolvedValueOnce(response(sample()));
  await expect(service.generate(input)).rejects.toThrow('Notebook could not be generated');
});

test('new book-club output rejects repeated metadata tags and keeps earlier results on failure', async () => {
  const { SituationService } = require('../../../server/next/situation-service');
  const card = { title: 'Synthetic book', author: 'Fictional author', summary: 'A verified summary.', mainCharacters: ['Actual person'], themes: ['Housing'], discussionStarters: ['What changed?'] };
  for (const tag of ['Genre term:', 'Book theme:', 'Book concept:', 'Related discussion concept:']) {
    const response = value => ({ choices: [{ message: { content: typeof value === 'string' ? value : JSON.stringify(value) } }] });
    const complete = jest.fn().mockResolvedValueOnce(response('Verified context about this book with people, issues, places and discussion topics.')).mockResolvedValueOnce(response(card)).mockResolvedValueOnce(response({ ...sample(), sections: [{ name: 'Themes', items: [tag + ' generic term'] }] }));
    await expect(new SituationService({ client: {}, complete }).generate({ situation: 'Book club discussing Synthetic book by Fictional author', entity: { type: 'book', name: 'Synthetic book', author: 'Fictional author' }, confirmed: true })).rejects.toThrow('Notebook could not be generated');
    expect(complete).toHaveBeenCalledTimes(3);
  }
});
