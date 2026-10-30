const fs = require('node:fs');
const { test, expect } = require('@playwright/test');
const { makeFixtures } = require('../fixtures');

test('book theme category labels do not repeat beneath words in reading or booklet output', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const payload = { id: 'theme-labels', kind: 'notebook', name: 'Synthetic book discussion', notebook: { sections: [{ name: 'KEY THEMES & CONCEPTS', type: 'word-grid', words: [
      { text: 'Historical fiction', context: 'Genre and literary discussion' },
      { text: 'Enslavement', context: 'Book themes and concepts' },
      { text: 'provenance', context: "An artwork’s history of ownership." }
    ] }] } };
    const before = JSON.stringify(payload), main = document.getElementById('main');
    const node = (tag, text, parent, cls) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; parent?.append(el); return el; };
    NextNotebooks.read({ main, node, clear: name => { main.replaceChildren(); node('h1', name, main); }, records: () => [payload], button: (text, fn, parent = main) => { const b = node('button', text, parent); b.onclick = fn; return b; } }, payload);
    const reading = main.textContent;
    let printed;
    const generate = ReferenceLibraryPDF.prototype.generateBookletFromDOM;
    ReferenceLibraryPDF.prototype.generateBookletFromDOM = function () { printed = this.source.printRoot.textContent; return generate.call(this); };
    try {
      const r = await NextPrintAdapter.buildNotebook(payload);
      return { reading, printed, unchanged: before === JSON.stringify(payload), pdf: r.pdf.output('datauristring').split(',')[1] };
    } finally { ReferenceLibraryPDF.prototype.generateBookletFromDOM = generate; }
  });
  for (const text of [result.reading, result.printed]) {
    expect(text).not.toContain('Genre and literary discussion');
    expect(text).not.toContain('Book themes and concepts');
    for (const retained of ['Historical fiction', 'Enslavement', 'provenance', 'An artwork’s history of ownership.']) expect(text).toContain(retained);
  }
  expect(result.unchanged).toBe(true);
  fs.mkdirSync('test-results/next/prints', { recursive: true });
  fs.writeFileSync('test-results/next/prints/theme-labels-booklet.pdf', Buffer.from(result.pdf, 'base64'));
});

test('Communication booklet preserves vocabulary usage headings while excluding separate app sections', async ({ page }) => {
  const f = makeFixtures(), edition = structuredClone(f.workspaces.demo.edition);
  edition.content.pages = [{ id: 'mapped', name: 'Personal page', text: 'Complete mapped personal passage', sourceFields: [{ key: 'example', value: 'Complete mapped personal passage' }] }];
  edition.content.templateFields = { example: 'Complete mapped personal passage' }; edition.content.templatePageBindings = { example: 'mapped' };
  edition.content.legacySources = { original: 'Retained fictional original, excluded from current print' };
  edition.content.contacts = [{ id: 'friend', name: 'Fictional friend', phone: '555-0100', groups: ['Fictional Friends'], aliases: ['Fictional nickname'], legacySource: { table: 'contacts' } }];
  edition.content.custom.home = [{ text: 'Fictional personal word', usage: 'Personal clue grouping' }];
  await page.goto('/');
  const result = await page.evaluate(async ({ edition, master, hash }) => {
    const currentSections = NextBook.communicationCategories(NextBook.project(edition, master, hash)).filter(c => c.words.length);
    const expected = currentSections.map(c => ({ title: c.name, words: c.words.map(w => w.text) }));
    const generate = ReferenceLibraryPDF.prototype.generateBookletFromDOM; let text, headings;
    let actual;
    ReferenceLibraryPDF.prototype.generateBookletFromDOM = function () { text = this.source.printRoot.textContent; headings = [...this.source.printRoot.querySelectorAll('.subsection-header')].map(h => h.textContent); actual = [...this.source.printRoot.querySelectorAll('section')].map(s => ({ title: s.querySelector('h2').textContent, words: [...s.querySelectorAll('li')].map(li => li.textContent) })); return generate.call(this); };
    try { const r = await NextPrintAdapter.build(edition, master, hash, 'booklet', { compactCommunicationBook: true }); return { text, headings, expected, actual, pages: r.pages, pdf: r.pdf.output('datauristring').split(',')[1] }; }
    finally { ReferenceLibraryPDF.prototype.generateBookletFromDOM = generate; }
  }, { edition, master: f.master, hash: f.masterHash });
  expect(result.text).not.toContain('Complete mapped personal passage'); expect(result.text).not.toContain('Fictional Friends'); expect(result.text).not.toContain('Fictional nickname'); expect(result.text).not.toContain('555-0100');
  expect(result.text).not.toContain('Retained fictional original');
  expect(result.actual).toEqual(result.expected);
  const usage = f.master.categories.flatMap(c => c.words).find(w => typeof w.usage === 'string' && w.usage.trim()).usage;
  expect(result.headings).toContain(usage);
  expect(result.headings).toContain('Personal clue grouping');
  fs.writeFileSync('test-results/next/prints/communication-grouped-booklet.pdf', Buffer.from(result.pdf, 'base64'));
});

test('dense retained legacy sections generate a complete frozen booklet without Guide or alphabet grids', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const sections = [
      { name: 'Recognisable words', type: 'objects', words: Array.from({ length: 140 }, (_, i) => 'Fictional long recognised word ' + i), fontSizes: { word: 18 } },
      { name: 'Complete questions', type: 'questions', items: Array.from({ length: 30 }, (_, i) => 'Complete fictional question ' + i + '. ' + 'Please give me time to finish my thought. '.repeat(3)) },
      { name: 'Guide', type: 'partner-guide', content: [{ text: 'EXCLUDED_GUIDE_WORDING' }] },
      { name: 'Alphabet grid', type: 'word-grid', words: ['EXCLUDED_ALPHABET_WORDING'] }
    ];
    const raw = { id: 15, user_id: 41, title: 'Fictional dense retained notebook', situation: 'A fictional conversation', template_used: 'discussion', content: { sections, situationType: 'discussion' }, is_edited: false, created_at: '2026-10-07', updated_at: '2026-10-07', local_id: null, sync_version: 1 };
    const payload = { id: 'fictional-print', notebook: { ...NextModel.clone(raw), ...NextModel.clone(raw.content), legacyRow: NextModel.clone(raw) } }, before = JSON.stringify(payload);
    let text, headingCount;
    const generate = ReferenceLibraryPDF.prototype.generateBookletFromDOM;
    ReferenceLibraryPDF.prototype.generateBookletFromDOM = function () {
      text = this.source.printRoot.textContent; headingCount = this.source.printRoot.querySelectorAll('.section-header').length;
      return generate.call(this);
    };
    try {
      const result = await NextPrintAdapter.buildNotebook(payload);
      return { pages: result.pages, sheets: result.sheets, text, headingCount, unchanged: before === JSON.stringify(payload), pdf: result.pdf.output('datauristring').split(',')[1] };
    } finally { ReferenceLibraryPDF.prototype.generateBookletFromDOM = generate; }
  });
  expect(result.unchanged).toBe(true); expect(result.headingCount).toBe(3);
  expect(result.text).toContain('Fictional long recognised word 139'); expect(result.text).toContain('Complete fictional question 29.');
  expect(result.text).not.toContain('EXCLUDED_'); expect(result.pages % 2).toBe(0); expect(result.sheets).toBe(result.pages / 2);
  fs.mkdirSync('test-results/next/prints', { recursive: true });
  fs.writeFileSync('test-results/next/prints/notebook-mapping-booklet.pdf', Buffer.from(result.pdf, 'base64'));
});

test('complete item context and emphasis render as safe text in the print source', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const payload = { id: 'fictional-context', notebook: { title: 'Fictional context', sections: [{ name: 'Discussion', type: 'discussion', words: [{ text: 'A complete word', context: '<img src=x onerror=alert(1)>Complete context', highlight: true }], items: ['A complete saved item.'] }] } };
    const generate = ReferenceLibraryPDF.prototype.generateBookletFromDOM;
    let text, highlighted, images;
    ReferenceLibraryPDF.prototype.generateBookletFromDOM = function () {
      const root = this.source.printRoot; text = root.textContent; images = root.querySelectorAll('img').length;
      highlighted = [...root.querySelectorAll('[data-highlight="true"]')].map(item => item.textContent);
      return generate.call(this);
    };
    try { await NextPrintAdapter.buildNotebook(payload); return { text, highlighted, images }; }
    finally { ReferenceLibraryPDF.prototype.generateBookletFromDOM = generate; }
  });
  expect(result.text).toContain('<img src=x onerror=alert(1)>Complete context'); expect(result.text).toContain('A complete saved item.');
  expect(result.highlighted).toEqual(['A complete word\n<img src=x onerror=alert(1)>Complete context']); expect(result.images).toBe(0);
});
