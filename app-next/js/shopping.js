(function (root) {
  'use strict';
  const sessions = new Map();
  const helpers = new Set(['Communication phrase', 'Staff question', 'Store location']);
  function catalogueItems(ui, data) {
    const saved = items(data), removed = items(data, true), used = new Set();
    const result = [];
    for (const source of ui.catalogue || []) {
      const word = { ...source, usage: source.usage || source.original?.usage };
      if (word.hidden || word.tombstone || word.archived || helpers.has(word.usage)) continue;
      const match = [...saved, ...removed].find(p => p.shoppingSourceId === word.id || !p.shoppingSourceId && p.text.toLocaleLowerCase('en-CA') === word.text.toLocaleLowerCase('en-CA'));
      if (match) { used.add(match.id); if (!match.tombstone) result.push({ ...match, usage: match.usage || word.usage }); }
      else result.push({ ...word, catalogueChoice: true, checked: false });
    }
    return [...result, ...saved.filter(p => !used.has(p.id))];
  }
  function items(data, deleted = false) {
    const records = { ...data.baselines, ...data.snapshot.records };
    const result = Object.values(records).filter(r => NextBook.latest(r).payload.kind === 'shopping').map(r => {
      const pending = data.drafts[r.id]; const payload = pending && pending.state !== 'accepted' ? pending.payload : NextBook.latest(r).payload;
      const reset = data.outbox.some(o => o.action === 'clear-shopping' && o.expected[r.id] !== undefined);
      return { ...NextModel.clone(payload), ...(reset ? { checked: false } : {}), revision: r.current };
    });
    return result.filter(p => !!p.tombstone === deleted);
  }
  function render(ui, data, editMode = false) {
    const key = ui.scopeKey || 'shopping';
    const state = sessions.get(key) || { query: '', category: 'All items' }; sessions.set(key, state);
    state.ticks ||= new Map();
    const tickKey = p => p.shoppingSourceId || p.id;
    ui.clear(editMode ? 'Edit shopping list' : 'Shopping list');
    const filters = ui.node('div', undefined, ui.main, 'shopping-filters');
    const findLabel = ui.node('label', 'Find an item', filters), find = ui.node('input', undefined, filters); findLabel.htmlFor = find.id = 'shopping-query'; find.type = 'search'; find.value = state.query;
    const categoryLabel = ui.node('label', 'Category', filters), category = ui.node('select', undefined, filters); categoryLabel.htmlFor = category.id = 'shopping-category';
    const list = catalogueItems(ui, data).map(p => state.ticks.has(tickKey(p)) ? { ...p, checked: state.ticks.get(tickKey(p)).checked } : p);
    for (const name of ['All items', ...new Set(list.map(p => p.usage || 'My items'))]) { const option = ui.node('option', name, category); option.value = name; }
    category.value = state.category;
    const adding = ui.node('details', undefined, ui.main); ui.node('summary', 'Add an item', adding);
    const form = ui.node('form', undefined, adding); const label = ui.node('label', 'Add item', form); label.htmlFor = 'new-shopping-item';
    const input = ui.node('input', undefined, form); input.id = 'new-shopping-item'; input.maxLength = 40000;
    const submit = ui.node('button', 'Add item', form); submit.type = 'submit';
    form.onsubmit = event => { event.preventDefault(); if (input.value.trim()) ui.add(input.value).catch(ui.report); };
    const area = ui.node('section', undefined, ui.main); area.setAttribute('aria-label', 'Shopping items');
    if (!list.length) ui.node('p', 'Your list is empty. Add an item above.', ui.main);
    function draw() {
      area.replaceChildren(); const groups = new Map();
      for (const p of list.filter(p => (state.category === 'All items' || (p.usage || 'My items') === state.category) && p.text.toLocaleLowerCase('en-CA').includes(state.query.toLocaleLowerCase('en-CA').trim()))) { const name = p.usage || 'My items'; if (!groups.has(name)) groups.set(name, []); groups.get(name).push(p); }
      for (const [name, entries] of groups) {
        const section = ui.node('section', undefined, area, 'shopping-group'); ui.node('h2', name, section); const grid = ui.node('div', undefined, section, 'shopping-grid');
        for (const p of entries) {
      const row = ui.node('section', undefined, grid, 'shopping-item'); row.dataset.shopping = p.id;
      const label = ui.node('label', undefined, row, 'check-row' + (p.checked ? ' bought' : '')); const box = ui.node('input', undefined, label); box.type = 'checkbox'; box.checked = !!p.checked;
      ui.node('span', p.text, label); box.onchange = () => {
        const id = tickKey(p), pending = { checked: box.checked };
        state.ticks.set(id, pending); p.checked = pending.checked;
        label.classList.toggle('bought', pending.checked);
        ui.tick(p, pending.checked).catch(ui.report).finally(() => {
          if (state.ticks.get(id) === pending) state.ticks.delete(id);
        });
      };
      if (editMode && !p.catalogueChoice) { ui.button('Edit', () => ui.edit(p), row); ui.button('Delete', () => ui.remove(p), row); }
        }
      }
      if (!groups.size && list.length) ui.node('p', 'No matching items. Clear the search or choose another category.', area);
    }
    find.oninput = () => { state.query = find.value; draw(); }; category.onchange = () => { state.category = category.value; draw(); }; draw();
    const helperSection = ui.node('details', undefined, ui.main); ui.node('summary', 'Words to use while shopping', helperSection);
    const helperGrid = ui.node('div', undefined, helperSection, 'words');
    for (const p of (ui.catalogue || []).filter(p => helpers.has(p.usage) && !p.hidden && !p.tombstone)) ui.button(p.text, () => ui.showWord(p.text), helperGrid);
    if (editMode) {
      const deleted = ui.node('details', undefined, ui.main); ui.node('summary', 'Deleted items', deleted);
      for (const p of items(data, true)) { const row = ui.node('section', undefined, deleted, 'item-card'); row.dataset.shopping = p.id; ui.node('p', p.text, row); ui.button('Restore', () => ui.restore(p), row); }
      ui.button('Done', () => ui.show(false));
    } else {
      ui.button('Clear all', async () => {
        const before = items(data).filter(p => p.checked);
        if (await ui.clearAll()) { state.undo = before; await ui.show(false); }
      });
      if (state.undo?.length) ui.button('Undo clear', async () => {
        if (await ui.undoClear(state.undo)) { state.undo = null; await ui.show(false); }
      });
      ui.button('Edit list', () => ui.show(true));
    }
    if (data.outbox.length) { const recovery = ui.node('details', undefined, ui.main); ui.node('summary', 'Changes waiting to sync', recovery); ui.node('p', 'Saved on this device. Other devices will update when connected.', recovery); ui.button('Sync now', ui.retry, recovery); }
    if (Object.values(data.outcomes).some(o => o.action === 'clear-shopping' && o.outcome === 'conflict' && !o.resolved)) ui.node('p', 'The list changed on another device. Clear all was not applied. Review the list, then choose Clear all again.', ui.main, 'notice');
  }
  root.NextShopping = { items, catalogueItems, render };
})(globalThis);
