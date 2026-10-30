const path = require('node:path');
const fs = require('node:fs');
const file = path.resolve(__dirname, '../../../app-next/js/word-groups.js');
const G = fs.existsSync(file) ? require(file) : {};
const group = (id, name, words, extra = {}) => ({ id, kind: 'group', category: 'quick-words', name, words: words.map(text => ({ text })), text: words.join('\n'), revision: 2, ...extra });
test('saved group snapshots preserve complete wording, source envelopes and unknown metadata', () => {
  expect(typeof G.snapshotWords).toBe('function');
  const source = { id: 'word:health:0', text: 'Élodie’s complete and long phrase', binding: { locator: 0 }, future: { retained: true }, revision: 3 };
  const result = G.snapshotWords([source]);
  source.text = 'Changed'; source.future.retained = false;
  expect(result).toEqual([{ text: 'Élodie’s complete and long phrase', source: { id: 'word:health:0', text: 'Élodie’s complete and long phrase', binding: { locator: 0 }, future: { retained: true }, revision: 3 } }]);
});
test('local group search scans full phrases and situation names in stable saved order', () => {
  expect(typeof G.search).toBe('function');
  const values = [group('a', 'Earlier', ['whole phrase with a late clue']), group('b', 'Later', ['clue']), group('c', 'Clue hidden', ['clue'], { archived: true })];
  const ctx = { records: () => values, project: () => ({ extra: [] }) };
  expect(G.search(ctx, 'clue').map(p => p.id)).toEqual(['a', 'b']);
  expect(G.search(ctx, 'dentist').map(p => p.id)).toEqual([]);
  values[1].situation = 'Dentist visit';
  expect(G.search(ctx, 'dentist').map(p => p.id)).toEqual(['b']);
});
test('legacy lists receive stable distinct identities and existing wrappers prevent source refresh', () => {
  expect(typeof G.legacyId).toBe('function');
  expect(G.legacyId('group:a')).toMatch(/^[a-f0-9-]{36}$/);
  expect(G.legacyId('group:a')).toBe(G.legacyId('group:a'));
  expect(G.legacyId('group:a')).not.toBe(G.legacyId('group:b'));
  const saved = group(G.legacyId('group:a'), 'Saved', ['Old wording'], { provenance: { legacyGroup: 'group:a' } });
  const ctx = { records: () => [saved], project: () => ({ extra: [{ id: 'group:a', name: 'Source', words: [{ text: 'New wording' }] }] }) };
  expect(G.groups(ctx)).toEqual([saved]);
});
test('projection of maintained groups does not introduce a second legacy wrapper', () => {
  const saved = group('11111111-1111-4111-8111-111111111111', 'Maintained', ['Word']);
  const ctx = { records: () => [saved], project: () => ({ extra: [{ id: 'group:' + saved.id, name: saved.name, words: saved.words }] }) };
  expect(G.groups(ctx)).toEqual([saved]);
});
test('legacy group wrappers retain the complete original group beyond projection fields', () => {
  const original = { id: 'legacy', name: 'Source', situation: 'Visit', words: [{ text: 'Hello', futureWord: 9 }], cue: '☕', futureGroup: { kept: true } };
  const ctx = { records: () => [], project: () => ({ extra: [{ id: 'group:legacy', name: 'Source', words: [{ text: 'Hello' }] }], content: { savedGroups: [original] } }) };
  expect(G.groups(ctx)[0]).toMatchObject({ situation: 'Visit', cue: '☕', futureGroup: { kept: true }, provenance: { original } });
});
test('slots retain vacant first position and unavailable group assignments', () => {
  expect(typeof G.slots).toBe('function');
  const saved = group('g', 'Archived group', ['Word'], { archived: true });
  const second = { id: G.slotId(2), kind: 'preference', category: 'home-slot:2', groupId: 'g', groupLabel: 'Archived group', revision: 3, text: 'Home shortcut 2' };
  const values = G.slots({ records: () => [saved, second], project: () => ({ extra: [] }) });
  expect(values[0].groupId).toBeNull();
  expect(values[1]).toMatchObject({ groupId: 'g', available: false, revision: 3 });
});
test('removing and reopening Undo keeps group and rejects newer same-slot assignment', () => {
  expect(typeof G.changeSlot).toBe('function');
  const current = { id: G.slotId(1), kind: 'preference', category: 'home-slot:1', text: 'Home shortcut 1', groupId: 'a', groupLabel: 'First', revision: 4, future: { retained: true } };
  const removed = G.changeSlot(current, null);
  expect(removed).toMatchObject({ groupId: null, future: { retained: true }, undo: { previousGroupId: 'a', expectedRevision: 5 } });
  expect(removed.revision).toBeUndefined();
  const reopened = JSON.parse(JSON.stringify({ ...removed, revision: 5 }));
  expect(G.undoSlot(reopened)).toMatchObject({ groupId: 'a', future: { retained: true }, undo: null });
  expect(() => G.undoSlot({ ...reopened, revision: 6, groupId: 'new' })).toThrow(/changed/);
});
test('removing a group word preserves the other selected words and their selection order', () => {
  expect(typeof G.removeWord).toBe('function');
  const p = group('g', 'Group', ['First', 'Second', 'Third'], { selection: [2, 0, 1], future: { keep: true } });
  expect(G.removeWord(p, 1)).toMatchObject({ words: [{ text: 'First' }, { text: 'Third' }], selection: [1, 0], future: { keep: true } });
  expect(p.words).toHaveLength(3);
});
test('an unambiguous offline shortcut inverse remains usable while later pending replacements cannot undo', () => {
  const initial = { id: G.slotId(1), kind: 'preference', category: 'home-slot:1', text: 'Home shortcut 1', groupId: 'old', groupLabel: 'Old', revision: 4 };
  const removed = { ...G.changeSlot(initial, null), revision: 5, waiting: true };
  expect(G.undoSlot(removed)).toMatchObject({ groupId: 'old', undo: null });
  const later = { ...G.changeSlot(removed, { id: 'new', name: 'New' }), revision: 5, waiting: true };
  expect(() => G.undoSlot(later)).toThrow(/changed/);
});
