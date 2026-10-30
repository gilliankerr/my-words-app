(function (root) {
  'use strict';
  const B = root.NextBook;
  function sections(ui, edition, master, hash) {
    ui.clear('Edit book');
    ui.node('p', 'Choose the section or personal page you want to change.', ui.main);
    const grid = ui.node('div', undefined, ui.main, 'grid');
    for (const s of B.project(edition, master, hash).vocabulary) ui.button(s.name, () => ui.section(s.id), grid);
    for (const [id, name] of [['personal', 'Personal pages'], ['front', 'Book title'], ['rescue', 'Rescue words'], ['guide', 'Communication Partner Guide']]) {
      if (ui.compactCommunicationBook && ['rescue', 'guide'].includes(id)) continue;
      ui.button(name, () => ui.section(id), grid);
    }
    for (const s of B.project(edition, master, hash).extra) ui.button(s.name, () => ui.section(s.id), grid);
    const options = ui.node('details', undefined, ui.main); ui.node('summary', 'More options', options);
    ui.node('p', 'Move book sections. The words in each section stay together.', options);
    for (const [i, s] of B.project(edition, master, hash).vocabulary.entries()) {
      const row = ui.node('div', undefined, options, 'actions'); ui.node('span', s.name, row);
      const ids = B.project(edition, master, hash).vocabulary.map(c => c.id);
      if (i) ui.button('Move up', () => ui.move('sections', ids, s.id, -1), row);
      if (i < ids.length - 1) ui.button('Move down', () => ui.move('sections', ids, s.id, 1), row);
    }
    ui.button('Return', ui.home);
  }
  function section(ui, edition, master, hash, category) {
    if (ui.compactCommunicationBook && ['rescue', 'guide'].includes(category)) return ui.sections();
    const p = B.project(edition, master, hash, true);
    const s = p.vocabulary.find(s => s.id === category) || p.extra.find(s => s.id === category);
    const items = s?.words || p.items.filter(p => p.category === category && p.kind !== 'order' && p.kind !== 'shopping');
    if (category === 'personal') B.sortItems(items, p.items.find(p => p.kind === 'order' && p.category === category)?.items);
    ui.clear(s?.name || ({ personal: 'Personal pages', front: 'Book title', rescue: 'Rescue words', guide: 'Communication Partner Guide' })[category]);
    ui.button('Return to sections', ui.sections);
    if (s || category === 'personal') ui.button(s ? 'Add word or phrase' : 'Add personal page', () => ui.add(s ? 'phrase' : 'page', category));
    for (const [i, item] of items.entries()) {
      const row = ui.node('section', undefined, ui.main, 'item-card'); row.dataset.item = item.id;
      if (item.kind === 'page') ui.node('h2', item.name || 'Personal page', row);
      ui.node('div', item.text, row, 'word-preview' + (item.highlight ? ' highlighted' : ''));
      if (item.tombstone || item.hidden || item.archived) ui.node('p', item.tombstone ? 'Removed — recoverable' : item.archived ? 'Archived — not printed' : 'Hidden — not in the book', row, 'item-status');
      else if (item.highlight) ui.node('p', 'Highlighted', row, 'item-status');
      ui.button('Edit', () => ui.edit(item), row);
      const options = ui.node('details', undefined, row); ui.node('summary', 'More options', options);
      if (i) ui.button('Move up', () => ui.move(category, items.map(p => p.id), item.id, -1), options);
      if (i < items.length - 1) ui.button('Move down', () => ui.move(category, items.map(p => p.id), item.id, 1), options);
      if (ui.hasHistory(item.id)) ui.button('Earlier versions', () => ui.history(item.id), options);
    }
    ui.button('Return', ui.home);
  }
  root.NextBookEditor = { sections, section };
})(globalThis);
