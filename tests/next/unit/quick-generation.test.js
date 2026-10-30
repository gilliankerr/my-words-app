const G = require('../../../app-next/js/word-groups');
const original = Array.from({ length: 50 }, (_, i) => 'Word ' + i);
test('rapid results retain the original bank, repeat additions and chronological selection', () => {
  expect(typeof G.addGeneratedWords).toBe('function');
  const p = { words: original.map(text => ({ text })), selection: [49, 0], rapid: { originalWordCount: 50, clueHistory: [] }, future: { kept: true } };
  const first = G.addGeneratedWords(p, ['WORD 0', 'New clue', 'new clue', 'Other'], ['Word 49', 'Word 0']);
  const second = G.addGeneratedWords(first, ['New clue', 'Tangential'], ['New clue']);
  expect(second.words.slice(0, 50)).toEqual(p.words);
  expect(second.words.slice(50).map(w => w.text)).toEqual(['New clue', 'Other', 'Tangential']);
  expect(second.selection).toEqual([49, 0]);
  expect(second.rapid).toMatchObject({ originalWordCount: 50, moreBatchStart: 52, clueHistory: [['Word 49', 'Word 0'], ['New clue']] });
  expect(second.future).toEqual({ kept: true });
  expect(p.words).toHaveLength(50);
});
test('rapid word removal keeps original/fresh boundaries and batch identities through review edits', () => {
  const p = { words: [{ text: 'Original' }, { text: 'Earlier', quickBatch: 1 }, { text: 'Fresh', quickBatch: 2 }], selection: [2, 0], rapid: { originalWordCount: 1, moreBatchStart: 2, latestBatch: 2 } };
  expect(G.removeWord(p, 0)).toMatchObject({ selection: [1], rapid: { originalWordCount: 0, moreBatchStart: 1 }, words: [{ text: 'Earlier', quickBatch: 1 }, { text: 'Fresh', quickBatch: 2 }] });
  expect(G.addGeneratedWords(p, ['New'], ['Fresh']).words[3].quickBatch).toBe(3);
});
test('invalid generation responses cannot replace retained wording', () => {
  expect(typeof G.validateGeneratedWords).toBe('function');
  for (const value of [null, {}, { success: false, words: original }, { success: true, words: ['valid', {}] }, { success: true, words: [] }]) expect(() => G.validateGeneratedWords(value)).toThrow();
  expect(() => G.validateGeneratedWords({ success: true, words: ['one'] }, true)).toThrow();
  expect(G.validateGeneratedWords({ success: true, words: original }, true)).toEqual(original);
});
