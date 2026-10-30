const { makeFixtures } = require('../fixtures');
const B = require('../../../app-next/js/book-records');

test('large saved vocabulary checks each overlay binding a bounded number of times', () => {
  const { master, masterHash, workspaces } = makeFixtures();
  const edition = workspaces.demo.edition;
  const originals = B.catalogue(edition, master, masterHash);
  let reads = 0;
  for (const p of originals.slice(0, 500)) {
    const binding = p.binding;
    edition.payloads[p.id] = { ...p, text: p.text + ' saved', future: { kept: true } };
    Object.defineProperty(edition.payloads[p.id], 'binding', { enumerable: true, get: () => { reads++; return binding; } });
  }
  const result = B.catalogue(edition, master, masterHash);
  expect(result).toHaveLength(originals.length);
  expect(result[0].text).toBe(originals[0].text + ' saved');
  expect(result[0].future).toEqual({ kept: true });
  expect(reads).toBeLessThan(5000);
});

test('indexed lookup still refuses duplicate vocabulary and source bindings', () => {
  const { master, masterHash, workspaces } = makeFixtures();
  const edition = workspaces.demo.edition;
  for (const source of ['master', 'content']) {
    const p = B.catalogue({ ...edition, payloads: {} }, master, masterHash).find(p => source === 'master' ? p.binding.masterHash : p.binding.source === 'content');
    const duplicate = { ...p, id: 'duplicate' };
    expect(() => B.catalogue({ ...edition, payloads: { [p.id]: p, duplicate } }, master, masterHash)).toThrow(/Duplicate.*bindings/);
  }
});
