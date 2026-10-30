let D; beforeAll(() => { try { D = require('../../../app-next/js/discovery'); } catch {} });
test('local search finds end-of-note wording among 500 and excludes hidden and recovery-only records', () => {
  const records = Array.from({ length: 500 }, (_, i) => ({ id: String(i), kind: 'note', text: 'A complete ordinary message '.repeat(100) + (i === 487 ? 'Élodie’s café — tomorrow' : 'something else') }));
  records.push({ id: 'hidden', kind: 'phrase', hidden: true, text: 'Élodie café' }, { id: 'old', kind: 'note', archived: true, text: 'Élodie café' }, { id: 'removed', kind: 'note', tombstone: true, text: 'Élodie café' });
  expect(D.search(records, 'elodie cafe').map(p => p.id)).toEqual(['487']);
});
test('personal-page titles, complete details and recognition clues are always searchable', () => {
  const p = { id: 'private', kind: 'page', name: 'Basic info', text: 'Personal identification detail', context: 'Hidden contextual detail', aliases: ['Sensitive alias'], groups: ['Private grouping'] };
  expect(D.search([p], 'identification')).toEqual([p]);
  for (const text of ['contextual', 'sensitive', 'grouping']) expect(D.search([p], text)).toEqual([p]);
  expect(D.search([p, {...p, id:'hidden-personal', hidden:true}], 'identification')).toEqual([p]);
  expect(D.search([p], 'basic')).toEqual([p]);
});
test('all clue words and aliases match without altering canonical wording or stable destination grouping', () => {
  const group = { id: 'g', kind: 'group', name: 'Outdoors', words: [{ text: 'Walk in the garden' }], text: 'Outdoors' };
  const person = { id: 'p', kind: 'person', text: 'Morgan', aliases: ['Mo'], groups: ['Book club'], context: 'Garden friend' };
  const note = { id: 'n', kind: 'note', text: 'Garden' };
  const before = JSON.stringify([group, person, note]);
  expect(D.search([group, person, note], 'garden').map(p => p.id)).toEqual(['n', 'p', 'g']);
  expect(D.search([person], 'mo club')).toEqual([person]);
  expect(D.search([group], 'walk ocean')).toEqual([]);
  expect(JSON.stringify([group, person, note])).toBe(before);
});

test('excluded personal sections stay in stored records and remain outside search', () => {
  const D = require('../../../app-next/js/discovery');
  const records = ['Food and diet', 'Important dates', 'Basic info'].map(name => ({kind: 'page', name, text: 'Fictional retained details'}));
  expect(D.search(records, 'important')).toEqual([]);
  expect(D.search(records, 'basic')).toEqual([records[2]]);
  expect(records).toHaveLength(3); expect(records[0].text).toBe('Fictional retained details');
});
