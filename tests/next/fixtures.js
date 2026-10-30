const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../../app-next/js/model');
function makeFixtures() {
  const bytes = fs.readFileSync(path.join(__dirname, '../../data/reference-library.json'));
  const master = JSON.parse(bytes);
  const masterHash = createHash('sha256').update(bytes).digest('hex');
  const phrase = { id: 'b4420c84-a4cc-4b47-9d9e-bd6bd6dd4b53', kind: 'phrase', text: 'I need a little more time.', tombstone: false,
    binding: { masterVersion: master.version, masterHash, category: 'phrases', locator: 0, fingerprint: M.canonical(master.categories.find(c => c.id === 'phrases').words[0]) },
    original: M.clone(master.categories.find(c => c.id === 'phrases').words[0]), future: { nested: ['keep', { colour: 'bleu' }] } };
  const page = { id: 'e6f89c93-0c18-49e9-9aaf-9134fa14b72d', kind: 'page', name: 'Basic info', text: 'Fictional practice page\n\nMy name is Morgan.\nI enjoy the garden and the library.\n\nPlease give me time.\n• I can point to words.\n• Ask before helping.', tombstone: false,
    originals: { templateFields: { fictional_basic_info: 'Original fictional passage' }, sourceKeys: ['fictional_basic_info'], wording: 'Original fictional passage' }, future: { paragraphStyle: 'keep' } };
  const content = { order: master.categories.map(c => c.id), hidden: { family: [0] }, custom: { family: [{ id: 'person-a', text: 'Élodie O’Connor-Smith' }, { id: 'person-b', text: 'Élodie O’Connor-Smith', context: 'Fictional neighbour' }] },
    preferences: { readableSize: 20, compact: false }, routes: { start: 'book', optionalInstall: false }, links: { book: ['e6f89c93-0c18-49e9-9aaf-9134fa14b72d'], personal: ['e6f89c93-0c18-49e9-9aaf-9134fa14b72d'] },
    savedGroups: [{ id: 'group-demo', words: ['Thank you', 'Thank you'], snapshot: true }], contacts: [{ id: 'c1', name: 'Morgan' }, { id: 'c2', name: 'Morgan' }], notes: [{ id: 'note-preserved', text: 'Fictional note', archived: true }],
    notebook: { id: 'notebook-demo', title: 'Fictional book', frontMatter: { title: 'Fictional book', future: { keep: true } }, content: { futureEnvelope: ['preserve'] }, sections: [{ name: 'Dense practice words', words: master.categories.find(c => c.id === 'food').words }], unknown: { retained: true } },
    rescue: ['Please wait.', 'That is not what I mean.'], diagrams: [],
    guide: { name: 'Communication Partner Guide', type: 'partner-guide', content: [
      { type: 'intro-paragraph', text: 'This is a fictional practice book. Please give me time to find words.' },
      { type: 'guide-section', subtitle: 'When we talk', items: ['Let me point or show a page.', 'Ask before offering help.', 'Check that you understood me.'] },
      { type: 'closing-text', text: 'Thank you for listening.' }
    ], fontSizes: { title: 17, subtitle: 15, body: 13, intro: 13, closing: 12 } } };
  const records = Object.fromEntries([phrase, page].map(payload => [payload.id, { id: payload.id, current: 1, revisions: [{ number: 1, base: 0, payload, author: 'owner', at: '2026-10-03T12:00:00.000Z', operation: 'seed' }] }]));
  const edition = { id: 'edition-seed', workspace: 'demo', at: '2026-10-03T12:00:00.000Z', master: { version: master.version, hash: masterHash }, revisions: { 'b4420c84-a4cc-4b47-9d9e-bd6bd6dd4b53': 1, 'e6f89c93-0c18-49e9-9aaf-9134fa14b72d': 1 }, payloads: { 'b4420c84-a4cc-4b47-9d9e-bd6bd6dd4b53': phrase, 'e6f89c93-0c18-49e9-9aaf-9134fa14b72d': page }, content };
  const workspace = { id: 'demo', owner: 'owner', name: 'Morgan’s fictional workspace', records, content, master: edition.master, conflicts: [], receipts: {}, editions: { [edition.id]: edition }, edition, members: { owner: 'manager', alex: 'editor', robin: 'editor', reader: 'reader' }, operations: {} };
  const other = M.clone(workspace); other.id = 'other'; other.owner = 'outsider'; other.members = { outsider: 'manager' }; other.edition.workspace = 'other'; other.editions['edition-seed'].workspace = 'other';
  return { master, masterHash, workspaces: { demo: workspace, other }, actors: ['owner', 'alex', 'robin', 'reader', 'outsider'] };
}
module.exports = { makeFixtures };
