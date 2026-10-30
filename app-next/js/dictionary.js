(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NextDictionary = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const MANIFEST = '/assets/dictionary/manifest.json';
  const PREFERENCE_ID = '0dd888b1-d479-4c56-93ea-cc64927ac0f1';
  const PAGE_SIZE = 24;
  const C = typeof module === 'object' && module.exports ? require('./symbol-catalogue') : globalThis.NextSymbolCatalogue;
  const clone = value => JSON.parse(JSON.stringify(value));
  const normalize = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  let cataloguePromise;
  const sessions = new Map();
  function validate(index) {
    if (index?.version === 2) return C.validate(index);
    if (index?.version !== 1 || !Array.isArray(index.categories) || !index.categories.length || !Array.isArray(index.symbols) || !index.symbols.length || index.licence !== 'CC BY-SA 4.0') throw new Error('Invalid picture index');
    if (index.categories.some(x => typeof x !== 'string' || !x.trim()) || new Set(index.categories).size !== index.categories.length) throw new Error('Invalid picture categories');
    const ids = new Set();
    for (const item of index.symbols) {
      if (!/^mulberry-\d+$/.test(item.id) || ids.has(item.id) || !index.categories.includes(item.group) || typeof item.label !== 'string' || !item.label.trim() || typeof item.keywords !== 'string' || typeof item.originalName !== 'string' || typeof item.originalCategory !== 'string' || item.asset !== `/assets/dictionary/symbols/${item.id.slice(9)}.svg` || !/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error('Invalid picture record');
      if (/^country\b/i.test(item.originalCategory) || /^(flag|country)_/i.test(item.originalName)) throw new Error('Excluded picture collection');
      ids.add(item.id);
    }
    return index;
  }
  function validateSVG(svg) {
    const passiveTags = new Set(['svg', 'g', 'path', 'circle', 'rect', 'ellipse', 'line', 'polyline', 'polygon', 'style', 'defs', 'use', 'title', 'desc', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop']);
    if (!/<svg\b/i.test(svg) || /<!DOCTYPE|<!ENTITY|<\?xml-stylesheet|\\|\bon[a-z]+\s*=/i.test(svg) || /@import|@font-face|(?:expression|javascript)\s*[:(]|url\(\s*["']?\s*(?!#)[^\s)"']/i.test(svg)) throw new Error('Active or externally dependent SVG');
    for (const match of svg.matchAll(/<\s*\/?\s*([a-zA-Z][a-zA-Z0-9:_-]*)\b/g)) if (!passiveTags.has(match[1])) throw new Error('Active or externally dependent SVG');
    for (const match of svg.matchAll(/(?:xlink:)?href\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi)) if (!/^["']#[^"']+["']$/.test(match[1])) throw new Error('Active or externally dependent SVG');
    return svg;
  }
  function assets(index) { return index?.version === 2 ? C.assets(index) : [MANIFEST, '/assets/dictionary/MULBERRY-LICENSE.txt', ...validate(index).symbols.map(s => s.asset)]; }
  function search(index, query = '', group = 'All', aliases = {}) {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    return index.symbols.filter(item => (group === 'All' || item.group === group) && terms.every(term => normalize(`${item.label} ${item.keywords} ${item.originalName.replaceAll('_', ' ')} ${(Array.isArray(aliases[item.id]) ? aliases[item.id] : []).join(' ')}`).includes(term)));
  }
  function resolve(index, ids) { return ids.map(id => index.symbols.find(item => item.id === id)).filter(Boolean); }
  function preferences(payload) {
    const state = payload?.dictionary || {};
    return { ...state, favourites: Array.isArray(state.favourites) ? [...state.favourites] : [], selection: Array.isArray(state.selection) ? [...state.selection] : [], aliases: state.aliases && typeof state.aliases === 'object' ? state.aliases : {}, composition: state.composition === true };
  }
  function toggle(payload, field, id) {
    if (!['favourites', 'selection'].includes(field) || typeof id !== 'string') throw new Error('Invalid picture choice');
    const result = clone(payload), state = preferences(result);
    state[field] = state[field].includes(id) ? state[field].filter(x => x !== id) : [...state[field], id];
    result.dictionary = state;
    return result;
  }
  async function load() {
    if (!cataloguePromise) cataloguePromise = fetch(MANIFEST, { credentials: 'same-origin' }).then(response => { if (!response.ok) throw new Error('Pictures could not open. Retry opening pictures.'); return response.json(); }).then(validate).catch(error => { cataloguePromise = undefined; throw error; });
    return cataloguePromise;
  }
  function reset() {
    sessions.clear();
    globalThis.NextDictionaryView?.reset();
    if (typeof document !== 'undefined') for (const area of document.querySelectorAll('.dictionary-show')) area.remove();
  }
  function picture(ctx, item, parent, cls = 'dictionary-picture') {
    const image = ctx.node('img', undefined, parent, cls);
    image.alt = ''; image.src = item.asset; image.width = 120; image.height = 120; image.loading = 'lazy'; image.decoding = 'async';
    image.addEventListener('error', () => { image.remove(); parent.classList.add('dictionary-image-unavailable'); ctx.node('span', 'Picture unavailable', parent, 'dictionary-image-status'); }, { once: true });
    return image;
  }
  function show(ctx, items, returnFocus) {
    if (!items.length) return;
    ctx.showPage(items.length === 1 ? items[0].label : 'My message', area => {
      area.className = 'dictionary-show';
      const content = ctx.node('div', undefined, area, 'dictionary-show-pictures');
      for (const item of items) { const figure = ctx.node('figure', undefined, content); picture(ctx, item, figure); ctx.node('figcaption', item.messageText || item.label, figure); }
    });
  }
  async function render(ctx) {
    const requestToken = ctx.screenToken?.();
    const active = () => (!ctx.isCurrent || ctx.isCurrent()) && (!ctx.screenToken || requestToken === ctx.screenToken());
    const scope = ctx.scopeKey || ctx;
    let session = sessions.get(scope);
    if (!session) { session = { group: 'All', query: '', page: 0, queue: Promise.resolve(), error: '', attempt: null }; sessions.set(scope, session); }
    let index;
    try { index = await load(); }
    catch (error) { if (!active()) return; ctx.clear('Icons'); ctx.node('p', error.message, ctx.main, 'notice'); ctx.button('Retry opening pictures', () => render(ctx)); ctx.button('Home', ctx.home); return; }
    if (!active()) return;
    if(index.version===2)return NextDictionaryView.render(ctx,index);
    const current = () => {
      const record = ctx.records().find(p => p.kind === 'preference' && p.category === 'dictionary' && !p.tombstone);
      if (record) return clone(record);
      return { ...ctx.newPayload('preference', 'dictionary', 'Picture dictionary', 'Picture dictionary'), id: PREFERENCE_ID, dictionary: { favourites: [], selection: [], aliases: {}, composition: false } };
    };
    const change = (update, focusId) => {
      session.queue = session.queue.catch(() => {}).then(async () => {
        const payload = update(current()); session.attempt = payload;
        try {
          const result = await ctx.save(payload, { base: payload.revision ?? 0 });
          if (result?.outcome === 'conflict' || result?.conflict) return;
          if (!['accepted', 'waiting'].includes(result?.outcome)) throw new Error('This change could not be saved. Your choice is retained. Retry saving.');
          session.error = ''; session.attempt = null;
          await render(ctx);
          if (focusId) ctx.main.querySelector(`[data-dictionary-control="${focusId}"]`)?.focus({ preventScroll: true });
        } catch (error) { session.error = error.message || 'This change could not be saved. Your choice is retained. Retry saving.'; await render(ctx); }
      });
      return session.queue;
    };
    const scroll = window.scrollY;
    ctx.clear('Icons'); ctx.node('p', 'Picture dictionary', ctx.main);
    const prefs = preferences(current());
    if (session.error) {
      const notice = ctx.node('section', undefined, ctx.main, 'notice'); notice.setAttribute('role', 'alert'); ctx.node('p', session.error, notice);
      ctx.button('Retry saving pictures', () => change(() => clone(session.attempt)), notice);
    }
    const modes = ctx.node('section', undefined, ctx.main, 'dictionary-mode');
    ctx.node('p', prefs.composition ? 'Compose a message: choose pictures in order. Choose a selected picture again to remove it.' : 'Show one picture: choose its word to show it larger.', modes);
    const mode = ctx.button(prefs.composition ? 'Show one picture' : 'Compose a message', () => change(p => ({ ...p, dictionary: { ...preferences(p), composition: !prefs.composition } }), 'mode'), modes); mode.dataset.dictionaryControl = 'mode'; mode.setAttribute('aria-pressed', String(prefs.composition));
    const selected = ctx.node('section', undefined, ctx.main, 'dictionary-composition'); selected.hidden = !prefs.composition && !prefs.selection.length;
    ctx.node('h2', 'My message', selected);
    const knownSelected = resolve(index, prefs.selection);
    if (!prefs.selection.length) ctx.node('p', 'No pictures chosen.', selected);
    const chosen = ctx.node('ol', undefined, selected, 'dictionary-selected');
    for (const id of prefs.selection) {
      const item = index.symbols.find(s => s.id === id), li = ctx.node('li', undefined, chosen);
      if (item) { picture(ctx, item, li); ctx.node('span', item.label, li); const remove = ctx.button(`Remove ${item.label} from message`, () => change(p => toggle(p, 'selection', id)), li); remove.setAttribute('aria-label', `Remove ${item.label} from message`); }
      else ctx.node('span', 'Saved picture unavailable — kept for recovery.', li);
    }
    const showMessage = ctx.button('Show message', () => show(ctx, knownSelected, showMessage), selected); showMessage.disabled = !knownSelected.length;
    const keep = ctx.button('Keep message as a note', async () => { const captured = knownSelected.map(s => s.label).join(' · '); await ctx.keepNote(captured); }, selected); keep.disabled = !knownSelected.length;
    if (prefs.selection.length !== knownSelected.length) ctx.node('p', 'Unavailable saved pictures stay saved. Show and Keep use the available words above.', selected, 'notice');
    const searchForm = ctx.node('form', undefined, ctx.main, 'dictionary-search');
    const label = ctx.node('label', 'Search pictures', searchForm); label.htmlFor = 'dictionary-query';
    const input = ctx.node('input', undefined, searchForm); input.id = label.htmlFor; input.type = 'search'; input.value = session.query; input.maxLength = 1000;
    const scopeLabel = ctx.node('label', 'Search category', searchForm); scopeLabel.htmlFor = 'dictionary-scope';
    const select = ctx.node('select', undefined, searchForm); select.id = scopeLabel.htmlFor;
    for (const name of ['All', ...index.categories]) { const option = ctx.node('option', name === 'All' ? 'All everyday pictures' : name, select); option.value = name; }
    select.value = session.group;
    const submit = ctx.node('button', 'Search', searchForm); submit.type = 'submit';
    searchForm.addEventListener('submit', event => { event.preventDefault(); session.query = input.value; session.group = select.value; session.page = 0; render(ctx); });
    ctx.button('Clear search', () => { session.query = ''; session.group = 'All'; session.page = 0; return render(ctx); }, searchForm);
    function card(item, parent, area) {
      const container = ctx.node('article', undefined, parent, 'dictionary-card'); container.dataset.symbol = item.id;
      const choice = ctx.button('', () => prefs.composition ? change(p => toggle(p, 'selection', item.id), 'select:' + area + ':' + item.id) : show(ctx, [item], choice), container, 'dictionary-word');
      choice.dataset.dictionaryControl = 'select:' + area + ':' + item.id; picture(ctx, item, choice); ctx.node('span', item.label, choice);
      choice.setAttribute('aria-label', prefs.composition ? item.label : `Show ${item.label}`);
      if (prefs.composition) choice.setAttribute('aria-pressed', String(prefs.selection.includes(item.id)));
      if (prefs.selection.includes(item.id)) ctx.node('span', 'Selected', choice, 'dictionary-selection-label');
      const favourite = ctx.button(prefs.favourites.includes(item.id) ? '★' : '☆', () => change(p => toggle(p, 'favourites', item.id), 'favourite:' + area + ':' + item.id), container, 'favourite-star');
      favourite.dataset.dictionaryControl = 'favourite:' + area + ':' + item.id; favourite.setAttribute('aria-label', `${prefs.favourites.includes(item.id) ? 'Remove' : 'Save'} ${item.label} ${prefs.favourites.includes(item.id) ? 'from' : 'as'} favourite`);
      if (prefs.composition) ctx.button(`Show ${item.label}`, () => show(ctx, [item], document.activeElement), container);
    }
    const favouriteSection = ctx.node('section', undefined, ctx.main); ctx.node('h2', 'Favourites', favouriteSection);
    const favourites = resolve(index, prefs.favourites);
    if (!favourites.length) ctx.node('p', 'Star pictures to keep them here.', favouriteSection);
    const favouriteGrid = ctx.node('div', undefined, favouriteSection, 'dictionary-grid'); favouriteGrid.dataset.dictionaryFavourites = '';
    for (const item of favourites) card(item, favouriteGrid, 'favourites');
    if (favourites.length !== prefs.favourites.length) ctx.node('p', 'An unavailable favourite stays saved for recovery.', favouriteSection);
    const categories = ctx.node('section', undefined, ctx.main); ctx.node('h2', 'Categories', categories);
    const categoryGrid = ctx.node('div', undefined, categories, 'dictionary-category-grid');
    const cues = ['walk_,_to', 'coffee', 'house', 'shirt', 'doctor', 'bus', 'art'];
    for (const [n, name] of ['All', ...index.categories].entries()) {
      const category = ctx.button('', () => { session.group = name; session.query = ''; session.page = 0; return render(ctx); }, categoryGrid, 'dictionary-category');
      const cue = index.symbols.find(s => s.originalName === cues[n - 1] || (name !== 'All' && s.group === name && s.originalName.startsWith(cues[n - 1])));
      if (name === 'All') { const gallery = ctx.node('span', undefined, category, 'dictionary-category-cues'); for (const cueName of cues.slice(0, 4)) { const s = index.symbols.find(item => item.originalName === cueName); if (s) picture(ctx, s, gallery); } }
      else if (cue) picture(ctx, cue, category);
      ctx.node('span', name === 'All' ? 'All everyday pictures' : name, category); category.setAttribute('aria-pressed', String(session.group === name));
    }
    const results = search(index, session.query, session.group, prefs.aliases);
    session.page = Math.min(session.page, Math.max(0, Math.ceil(results.length / PAGE_SIZE) - 1));
    const resultSection = ctx.node('section', undefined, ctx.main); ctx.node('h2', session.query ? 'Search results' : session.group === 'All' ? 'All everyday pictures' : session.group, resultSection);
    const pageStatus = ctx.node('p', results.length ? `${results.length} pictures · Page ${session.page + 1} of ${Math.ceil(results.length / PAGE_SIZE)}` : 'No pictures found. Clear search or choose another category.', resultSection); pageStatus.setAttribute('role', 'status');
    const grid = ctx.node('div', undefined, resultSection, 'dictionary-grid'); grid.dataset.dictionaryResults = '';
    for (const item of results.slice(session.page * PAGE_SIZE, (session.page + 1) * PAGE_SIZE)) card(item, grid, 'results');
    const pagination = ctx.node('nav', undefined, resultSection, 'dictionary-pagination'); pagination.setAttribute('aria-label', 'Picture pages');
    const previous = ctx.button('Previous pictures', () => { session.page--; return render(ctx); }, pagination); previous.disabled = session.page === 0;
    const next = ctx.button('Next pictures', () => { session.page++; return render(ctx); }, pagination); next.disabled = (session.page + 1) * PAGE_SIZE >= results.length;
    const attribution = ctx.node('details', undefined, ctx.main, 'dictionary-attribution'); ctx.node('summary', 'Picture credits', attribution);
    ctx.node('p', `${index.provider}. ${index.copyright}. Original artwork, ${index.licence}.`, attribution);
    for (const [text, href] of [['Mulberry source', 'https://mulberrysymbols.org/'], ['CC BY-SA 4.0 licence', 'https://creativecommons.org/licenses/by-sa/4.0/'], ['Bundled licence', '/assets/dictionary/MULBERRY-LICENSE.txt']]) { const a = ctx.node('a', text, attribution); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    ctx.button('Home', ctx.home);
    window.scrollTo(0, scroll);
  }
  return { PREFERENCE_ID, MANIFEST, PAGE_SIZE, validate, validateSVG, assets, search, resolve, preferences, toggle, load, render, show, reset };
});
