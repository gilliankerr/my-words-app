const E = require('../../../app-next/js/expression');

test('People categories reconcile legacy labels without rewriting stored memberships', () => {
  const p = { original: { groups: ['My family', 'My health team', 'Cottage', 'Emergency contact'], future: true }, favourite: true };
  expect(E.groups(p)).toEqual(['Family', 'Health team', 'Cottage', 'Emergency contact']);
  expect(E.personCategories(p)).toEqual(['Family', 'Health team', 'Cottage', 'Emergency contact', 'Favourites']);
  expect(p.original.groups[0]).toBe('My family');
  expect(E.peopleCategories.map(c => c.label)).toEqual(['Health team', 'Family', 'Friends', 'Neighbours', 'Cottage', 'Contractors', 'Other', 'Emergency contact', 'Book club', 'Favourites']);
});

const source = (area, id, text, extra = {}) => ({ id, kind: 'page', category: 'personal', text,
  binding: { source: 'content', path: [area, 0], fingerprint: 'unchanged' },
  original: { id, future: { untouched: true } }, ...extra });

test('expression identifies retained source envelopes and additions without using names as identity', () => {
  const records = [source('notes', 'a', 'One'), source('contacts', 'b', 'Pat'),
    { id: 'c', kind: 'note', category: 'notes', text: 'Two' },
    { id: 'd', kind: 'person', category: 'people', name: 'Pat', text: 'Another Pat' },
    { id: 'e', kind: 'phrase', category: 'notes', text: 'Generic notes vocabulary' }];
  expect(E.noteRecords(records).map(p => p.id)).toEqual(['a', 'c']);
  expect(E.peopleRecords(records).map(p => p.id)).toEqual(['b', 'd']);
});

test('search reaches every full eligible record before batching and normalises accents/punctuation', () => {
  const records = Array.from({ length: 500 }, (_, i) => ({ id: String(i), kind: 'note', category: 'notes', text: 'Untitled message ' + i }));
  records[486].text += ' '.repeat(1000) + 'Après l’école — rendez-vous';
  expect(E.search(records, 'apres ecole rendez vous').map(p => p.id)).toEqual(['486']);
  expect(E.search(records, '').slice(0, 20)).toHaveLength(20);
  const people = [{ id: 'one', text: 'A person', aliases: ['Émilie'], groups: ['Book club'], context: 'Neighbour' }];
  expect(E.search(people, 'emilie book neighbour')).toEqual(people);
});

test('note lifecycle preserves full envelopes and restores the prior archive state', () => {
  const record = source('notes', 'a', 'Complete message', { archived: true, future: { retained: ['yes'] } });
  const removed = E.change(record, { tombstone: true, deletedFromArchived: record.archived });
  const restored = E.restore(removed);
  expect(restored).toMatchObject({ id: 'a', kind: 'page', category: 'personal', archived: true, tombstone: false, future: record.future, original: record.original, binding: record.binding });
  expect(record).not.toHaveProperty('tombstone');
});

test('unfinished scope keeps private drafts separate and excludes archived/deleted attached drafts', () => {
  const records = [source('notes', 'active', 'Earlier wording'), source('notes', 'archived', 'Archived', { archived: true })];
  const drafts = [
    { id: 'active', state: 'writing', payload: E.change(records[0], { text: 'Unfinished change' }) },
    { id: 'archived', state: 'writing', payload: E.change(records[1], { text: 'Archived change', archived: false }) },
    { id: 'new', state: 'writing', payload: { id: 'new', kind: 'note', category: 'notes', text: '' } },
    { id: 'waiting', state: 'waiting', payload: { id: 'waiting', kind: 'note', category: 'notes', text: 'Saved locally' } }
  ];
  expect(E.unfinished(drafts, records).map(d => d.id)).toEqual(['active', 'new']);
});

test('favourite order is deliberate and reading cannot reorder it', () => {
  const records = [{ id: 'a', favourite: true, favouriteOrder: 9 }, { id: 'b', favourite: true, favouriteOrder: 2 }, { id: 'c', favourite: false }];
  expect(E.favourites(records).map(p => p.id)).toEqual(['b', 'a']);
  const moved = E.moveFavourite(records, 'a', -1);
  expect(E.favourites([records[1], moved]).map(p => p.id)).toEqual(['a', 'b']);
  expect(records[0].favouriteOrder).toBe(9);
});

test('unknown legacy photo metadata survives expression edits without a photo API', () => {
  const person = source('contacts', 'a', 'Pat', { photo: 'legacy opaque value', unknown: { photo: 'another preserved value' } });
  const edited = E.change(person, { name: 'Pa' });
  expect(edited.photo).toBe(person.photo); expect(edited.unknown).toEqual(person.unknown);
  expect(edited.original).toEqual(person.original); expect(E.validPhoto).toBeUndefined();
});
