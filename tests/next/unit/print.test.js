const vm = require('node:vm');
const fs = require('node:fs');
const { jsPDF } = require('../../../js/lib/jspdf.umd.min.js');
let PDF;
test('current Communication book contents stays on its first page in two columns with final page references', () => {
  const sections = Array.from({ length: 25 }, (_, i) => ({ id: 'topic-' + i, querySelector: () => ({ textContent: 'Complete topic ' + i }) }));
  const generator = new PDF('letter', { compact: true, tableOfContents: true, printRoot: { querySelectorAll: () => sections }, title: 'Communication book', guide: { content: [] }, revisedDate: '2026-10-07', rescue: [], noNetwork: true });
  generator.pageWidth = 396; generator.pageHeight = 612; generator.margins = { top: 32, bottom: 40, left: 32, right: 32 }; generator.contentWidth = 332; generator.initDocument();
  generator.sectionPageNumbers = Object.fromEntries(sections.map((s, i) => [s.id, i + 2]));
  const drawn = []; generator.doc.text = (text, x, y) => drawn.push({ text, x, y, page: generator.currentPage });
  generator.addTitlePage();
  expect(drawn.filter(p => p.text.startsWith('Complete topic'))).toHaveLength(25);
  expect(drawn.every(p => p.page === 1)).toBe(true);
  expect(new Set(drawn.filter(p => p.text.startsWith('Complete topic')).map(p => p.x)).size).toBe(2);
  expect(drawn.some(p => p.text === '26')).toBe(true);
  expect(generator.currentPage).toBe(2);
});
test('compact source booklet uses original dense vocabulary rows and has no cover instruction', () => {
  const generator = new PDF('letter', { compact: true, printRoot: {}, title: 'Fictional booklet', guide: { content: [] }, revisedDate: '2026-10-07', rescue: [], excludeRescueHeading: true, noNetwork: true }); generator.initDocument();
  generator.fontSize.body = 9;
  const drawn = []; generator.doc.text = text => drawn.push(text); generator.addTitlePage();
  expect(drawn.join(' ')).not.toContain('Point to words. Add notes by hand.');
  const y = generator.currentY; generator.addSourcePhraseItems(['One', 'Two', 'Three', 'Four', 'Five', 'Six'].map(text => ({ text })));
  expect(generator.currentY - y).toBeLessThanOrEqual(32);
});
test('source cover instructions describe pointing and handwriting without promising absent shopping boxes', () => {
  const generator = new PDF('letter', { printRoot: {}, title: 'Fictional booklet', guide: { content: [] }, revisedDate: '2026-10-07', rescue: [], excludeRescueHeading: true, noNetwork: true }); generator.initDocument();
  const drawn = []; generator.doc.text = text => drawn.push(text); generator.addTitlePage();
  expect(drawn.join(' ')).not.toMatch(/shopping boxes/);
});
test('a long saved passage begins below its heading and continues without losing words', () => {
  const generator = new PDF('letter', { printRoot: {}, guide: { content: [] }, revisedDate: '2026-10-07', noNetwork: true }); generator.initDocument();
  generator.pageWidth = 396; generator.pageHeight = 612; generator.contentWidth = 332; generator.currentY = 420;
  const passage = 'Complete fictional passage remains readable. '.repeat(80), item = { dataset: { passage: 'true' }, textContent: passage };
  const container = { querySelector: selector => selector === '.phrase-list li' ? item : null };
  const drawn = []; generator.doc.text = text => drawn.push({ text, page: generator.currentPage, size: generator.doc.getFontSize() });
  generator.addSectionHeader('Saved passage', generator.sourceFirstRowHeight(container, true));
  generator.addSourcePhraseItems([{ text: passage, passage: true }]);
  const first = drawn.find(x => x.size === 16 && x.text.startsWith('Complete fictional'));
  expect(first.page).toBe(drawn.find(x => x.text === 'Saved passage' && x.size === 18).page);
  expect(drawn.filter(x => x.size === 16).map(x => x.text).join(' ').replace(/\s+/g, ' ').trim()).toBe(passage.trim());
});
test('source section headings stay with their first choice rather than orphaning at a page bottom', () => {
  const generator = new PDF('letter', { printRoot: {}, guide: { content: [] }, revisedDate: '2026-10-07', noNetwork: true }); generator.initDocument();
  generator.pageWidth = 396; generator.pageHeight = 612; generator.contentWidth = 316; generator.currentY = generator.pageHeight - generator.margins.bottom - 70;
  const drawn = []; generator.doc.text = text => drawn.push({ text, page: generator.currentPage, size: generator.doc.getFontSize() });
  generator.addSectionHeader('Complete section'); generator.addSourcePhraseItems([{ text: 'First choice' }]);
  expect(drawn.find(x => x.text === 'Complete section' && x.size === 18).page).toBe(drawn.find(x => x.text === 'First choice').page);
});
test('a decorative star retains the complete readable word in the built-in PDF font', () => {
  const generator = new PDF('letter', { printRoot: {}, guide: { content: [] }, revisedDate: '2026-10-07', noNetwork: true }); generator.initDocument();
  const drawn = []; generator.doc.text = text => drawn.push(text);
  generator.addSourcePhraseItems([{ text: '★ Fictional complete word', highlight: true }]);
  generator.addSourceText('★ Fictional heading');
  expect(drawn).toContain('* Fictional complete word'); expect(drawn).toContain('* Fictional heading');
});
test('source subsection headings wrap and leave clear space above 16 point choices', () => {
  const generator = new PDF('letter', { printRoot: {}, guide: { content: [] }, revisedDate: '2026-10-07', noNetwork: true });
  generator.initDocument(); generator.pageWidth = 396; generator.pageHeight = 612; generator.contentWidth = 316;
  const text = []; generator.doc.text = (value, x, y) => text.push({ value, x, y, size: generator.doc.getFontSize() });
  generator.addSubsectionHeader('A complete long recognisable subsection heading that must wrap');
  generator.addSourcePhraseItems([{ text: 'First complete choice' }]);
  const body = text.find(t => t.value === 'First complete choice'), headings = text.filter(t => t !== body);
  expect(headings.length).toBeGreaterThan(1);
  expect(body.y - body.size * 1.1).toBeGreaterThanOrEqual(headings.at(-1).y + 7);
});
beforeAll(() => {
  const context = { window: {}, console, jspdf: { jsPDF }, fetch: () => { throw new Error('Forbidden legacy API'); } };
  vm.createContext(context); vm.runInContext(fs.readFileSync('js/reference-library-pdf.js', 'utf8'), context); PDF = context.window.ReferenceLibraryPDF;
});
test('explicit owned Guide/date and controlled root require no legacy network', async () => {
  const root = { querySelectorAll: () => [] };
  const guide = { name: 'Fictional owned Guide', content: [{ type: 'intro-paragraph', text: 'Please give me time.' }] };
  const generator = new PDF('letter', { printRoot: root, guide, revisedDate: '2026-10-03', noNetwork: true });
  await generator.fetchPartnerGuide(); await generator.fetchLastRevisedDate();
  expect(generator.partnerGuideContent.name).toBe('Fictional owned Guide');
  expect(generator.lastRevisedDate).toBe('2026-10-03');
  expect(generator.getSectionsInPdfOrder()).toEqual([]);
});
test.each(['letter', 'a5'])('source long phrases paginate at readable size without clipping (%s)', format => {
  const generator = new PDF(format, { printRoot: {}, guide: { content: [] }, revisedDate: '2026-10-03', noNetwork: true });
  generator.initDocument(); generator.currentY = generator.pageHeight - generator.margins.bottom - 2;
  generator.addPhraseList(['Élodie O’Connor-Smith needs a little more time. '.repeat(30)]);
  expect(generator.currentPage).toBeGreaterThan(1);
  expect(generator.currentY).toBeLessThanOrEqual(generator.pageHeight - generator.margins.bottom + 3);
  expect(generator.fontSize.body).toBeGreaterThanOrEqual(16);
});
test('source booklet revised-date footer leaves room for the logical page number', () => {
  const generator = new PDF('letter', { printRoot: {}, guide: { content: [] }, revisedDate: '2026-10-03', noNetwork: true });
  generator.initDocument(); generator.pageHeight = 612; generator.margins.bottom = 40; generator.lastRevisedDate = '2026-10-03';
  const baselines = [];
  generator.doc.text = (text, x, y) => baselines.push(y);
  generator.addDateLastRevised(); generator.addPageNumber();
  expect(Math.abs(baselines[0] - baselines[1])).toBeGreaterThanOrEqual(18);
});
test('source booklet continuation header stays above readable body text', async () => {
  const { BookletImposer } = require('../../../js/booklet-imposer');
  const generator = new PDF('letter', { printRoot: { querySelectorAll: () => [] }, guide: { name: 'Owned Guide', content: [] }, revisedDate: '2026-10-03', noNetwork: true, imposer: BookletImposer });
  await generator.generateBookletFromDOM();
  const text = [];
  generator.doc.text = (value, x, y) => text.push({ value, y, size: generator.doc.getFontSize() });
  generator.currentSectionName = 'Continuation'; generator.addPage();
  generator.addSourceText('First readable word', 16);
  const header = text.find(line => line.value === 'Continuation');
  const body = text.find(line => line.value === 'First readable word');
  // Helvetica ascenders can rise about 1.1 em above the baseline; reserve visible separation.
  expect(body.y - body.size * 1.1).toBeGreaterThanOrEqual(header.y + 7);
  expect(body.size).toBe(16);
});
test.each(['letter', 'a5'])('source continuation heading clears the running header (%s)', format => {
  const generator = new PDF(format, { printRoot: {}, guide: { content: [] }, revisedDate: '2026-10-03', noNetwork: true });
  generator.initDocument();
  const text = [];
  generator.doc.text = (value, x, y) => text.push({ value, y, size: generator.doc.getFontSize() });
  generator.currentSectionName = 'Personal Notes'; generator.addPage();
  generator.addSourceText('Personal Notes', 18, true);
  const header = text.find(line => line.value === 'Personal Notes' && line.size === 9);
  const heading = text.find(line => line.value === 'Personal Notes' && line.size === 18);
  expect(heading.y - heading.size * 1.1).toBeGreaterThanOrEqual(header.y + 7);
});
test.each(['letter', 'a5'])('grouped source words retain 16 point type and bounded emphasis (%s)', format => {
  const generator = new PDF(format, { printRoot: {}, guide: { content: [] }, revisedDate: '2026-10-03', noNetwork: true }); generator.initDocument();
  const boxes = [], texts = []; generator.doc.rect = (x, y, w, h) => boxes.push({ x, y, w, h }); generator.doc.text = (text, x, y) => texts.push({ text, x, y, size: generator.doc.getFontSize() });
  generator.addSourcePhraseItems([{ text: 'Apples', highlight: true }, { text: 'Lentils' }, { text: 'Élodie O’Connor-Smith needs a little more time. '.repeat(70), highlight: true }]);
  expect(texts.filter(t => t.text.includes('Apples'))[0].size).toBe(16);
  expect(boxes.length).toBeGreaterThan(1);
  for (const b of boxes) { expect(b.x).toBeGreaterThanOrEqual(generator.margins.left); expect(b.x + b.w).toBeLessThanOrEqual(generator.pageWidth - generator.margins.right + .1); expect(b.y).toBeGreaterThan(20); expect(b.y + b.h).toBeLessThanOrEqual(generator.pageHeight - generator.margins.bottom + .1); }
  expect(generator.currentPage).toBeGreaterThan(1);
});

test('explicit User source omits Guide and separate rescue heading without changing another source', async () => {
  const { BookletImposer } = require('../../../js/booklet-imposer');
  const generator = new PDF('letter', { printRoot: { querySelectorAll: () => [] }, guide: { name: 'Retained private guide', content: [{ type: 'intro-paragraph', text: 'Retained guide wording' }] }, revisedDate: '2026-10-06', noNetwork: true, excludeGuide: true, excludeRescueHeading: true, title: 'Fictional booklet', imposer: BookletImposer });
  const pdf = await generator.generateBookletFromDOM();
  const bytes = pdf.output();
  expect(bytes).not.toContain('Retained guide wording');
  expect(bytes).not.toContain('Rescue words');
  expect(pdf.getNumberOfPages() % 2).toBe(0);
});
