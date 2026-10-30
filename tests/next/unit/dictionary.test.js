const D = require('../../../app-next/js/dictionary');
test('passive SVG and explicit asset paths reject code, foreign resources, country maps and malformed IDs', () => {
  const index = { version: 1, licence: 'CC BY-SA 4.0', categories: ['Objects'], symbols: [{ id: 'mulberry-1', group: 'Objects', label: 'Example', keywords: 'fictional', originalName: 'example', originalCategory: 'Objects', asset: '/assets/dictionary/symbols/1.svg', sha256: 'a'.repeat(64) }] };
  for (const patch of [{ asset: '/reports/private.svg' }, { asset: 'https://example.org/image.svg' }, { id: '../private' }, { originalCategory: 'Country Maps' }, { originalName: 'flag_Canada' }]) {
    expect(() => D.validate({ ...index, symbols: [{ ...index.symbols[0], ...patch }] })).toThrow();
  }
  for (const svg of ['<svg onload="alert(1)"/>', '<svg><script/></svg>', '<svg><foreignObject/></svg>', '<svg><image href="https://example.org"/></svg>', '<svg><style>@import "remote.css"</style></svg>', '<svg><style>.a{fill:url(https://example.org)}</style></svg>', '<!DOCTYPE svg><svg/>', '<svg><animate attributeName="href" to="https://example.org"/></svg>', '<svg><use href=https://example.org /></svg>', '<?xml-stylesheet href="https://example.org/style"?><svg/>', '<svg><script:script/></svg>', '<svg><style>@\\69mport "remote.css"</style></svg>']) expect(() => D.validateSVG(svg)).toThrow();
  expect(() => D.validateSVG('<svg><use href="#shape"/><path fill="url(#paint)"/></svg>')).not.toThrow();
});
test('favourite and selection mutations preserve unknown saved identities and future envelope fields in order', () => {
  const payload = { id: D.PREFERENCE_ID, kind: 'preference', category: 'dictionary', text: 'Picture dictionary', future: { private: 'retained' }, dictionary: { future: { keep: true }, favourites: ['mulberry-2556', 'future-picture', 'mulberry-2555'], selection: ['future-picture', 'mulberry-2555'], aliases: { 'future-picture': ['Later'] } } };
  const changed = D.toggle(payload, 'favourites', 'mulberry-2556');
  expect(changed.dictionary.favourites).toEqual(['future-picture', 'mulberry-2555']);
  expect(changed.future).toEqual(payload.future);
  expect(changed.dictionary.future).toEqual(payload.dictionary.future);
  expect(changed.dictionary.aliases).toEqual(payload.dictionary.aliases);
  const selected = D.toggle(changed, 'selection', 'mulberry-2556');
  expect(selected.dictionary.selection).toEqual(['future-picture', 'mulberry-2555', 'mulberry-2556']);
  expect(payload.dictionary.favourites).toHaveLength(3);
});
