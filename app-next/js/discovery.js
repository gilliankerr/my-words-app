(function (root, factory) {
  const api = factory(); if (typeof module === 'object') module.exports = api; else root.NextDiscovery = api;
})(globalThis, function () {
  'use strict';
  const normalise = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en-CA').replace(/[’']/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const excludedPersonal = p => p.kind === 'page' && ['food and diet', 'important dates'].includes(normalise(p.name || p.original?.name || p.original?.title));
  function destination(p) {
    if (excludedPersonal(p)) return null;
    if (p.category === 'guide' || p.binding?.path?.[0] === 'guide' || p.type === 'partner-guide') return null;
    const source = p.binding?.path?.[0];
    if (p.kind === 'note' || source === 'notes') return 'Notes';
    if (p.kind === 'person' || source === 'contacts') return 'People';
    if (p.kind === 'group') return 'Quick words';
    if (p.kind === 'symbol') return 'Icons';
    if (p.kind === 'page') return 'Personal information';
    if (p.kind === 'phrase') return 'Communication book';
    return null;
  }
  const order = ['Notes', 'People', 'Quick words', 'Icons', 'Communication book', 'Personal information'];
  function medical(p) {
    if (p.medical === true || p.original?.medical === true) return true;
    return /medical|medication|medicine|allerg|diagnos|health|insurance/i.test([p.category, p.name, ...(p.binding?.path || [])].join(' '));
  }
  function search(records, query) {
    const terms = normalise(query).split(' ').filter(Boolean); if (!terms.length) return [];
    const text = p => normalise([p.name, p.title, p.situation, ...(p.aliases || []), ...(p.groups || []), p.context, p.text,
      ...(p.words || []).map(w => typeof w === 'string' ? w : w.text), p.keywords].filter(Boolean).join(' '));
    return records.filter(p => destination(p) && !p.hidden && !p.archived && !p.tombstone && terms.every(t => text(p).includes(t)))
      .sort((a, b) => order.indexOf(destination(a)) - order.indexOf(destination(b)) || Number(normalise(b.text || b.name) === normalise(query)) - Number(normalise(a.text || a.name) === normalise(query)));
  }
  const paths = {
    home: 'M3 11 12 3l9 8M5 9v12h5v-7h4v7h5V9', shirt: 'M8 3 3 6l2 6 3-2v11h8V10l3 2 2-6-5-3c0 4-8 4-8 0',
    utensils: 'M4 3v7h6V3M7 3v18M19 3c-5 4-5 9 0 9V3m0 9v9', car: 'M4 13l2-7h12l2 7M3 13h18v7H3v-7M6 16h1m10 0h1M5 20v2m14-2v2',
    train: 'M6 3h12v16H6V3m0 9h12M9 6h6M9 16h.1m6 0h.1M8 19l-2 3m10-3 2 3', clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m0 4v6l4 3',
    users: 'M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 21v-2a6 6 0 0 1 12 0v2m3-17a4 4 0 0 1 0 8m1 3a5 5 0 0 1 4 5',
    clipboard: 'M8 3h8v4H8V3M8 5H4v17h16V5h-4M8 12h8m-8 5h8', heart: 'M12 21 3 12C-3 3 8-1 12 6c4-7 15-3 9 6l-9 9',
    'message-circle': 'M3 4h18v13H8l-5 4V4m5 5h8m-8 4h5', 'circle-help': 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m-3 7c0-4 6-4 6 0 0 2-3 2-3 5m0 3h.1',
    'alert-triangle': 'M12 2 1 21h22L12 2m0 6v6m0 3h.1', 'map-pin': 'M12 22 5 12a8 8 0 1 1 14 0l-7 10m0-17a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
    smartphone: 'M6 2h12v20H6V2m0 3h12m-9 14h6', briefcase: 'M8 6V2h8v4M2 6h20v15H2V6m0 7h20m-10-3v6',
    'shopping-cart': 'M2 3h3l3 13h11l3-10H6m3 14h.1m9 0h.1', 'list-checks': 'M3 5l2 2 3-4m3 2h10M3 13l2 2 3-4m3 2h10M3 21l2 2 3-4m3 2h10',
    person: 'M12 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4M4 10h16m-8-3v9m-4 6 4-6 4 6',
    'heart-pulse': 'M12 21 3 12C-3 3 8-1 12 6c4-7 15-3 9 6l-9 9M3 12h5l2-4 4 8 2-4h5',
    stethoscope: 'M3 3v5a5 5 0 0 0 10 0V3M8 13v3a5 5 0 0 0 10 0v-4m0-4a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
    wave: 'M4 14V8m4 6V3m4 11V2m4 12V5m4 7v5c0 7-16 7-16 0v-3', calculator: 'M4 2h16v20H4V2m3 4h10v4H7V6m0 8h2m6 0h2m-10 4h2m6 0h2',
    'cloud-sun': 'M14 6a4 4 0 0 1 7 4M17 1v2m6 2-2 2M3 20h16c6 0 5-8 0-8-1-7-11-6-12 0-6-1-7 8-4 8',
    palette: 'M12 2C-2 2-2 22 12 22c6 0-2-7 3-7h3c9 0 4-13-6-13M7 7h.1m5-2h.1m5 3h.1M5 12h.1',
    'graduation-cap': 'M1 8 12 2l11 6-11 6L1 8m4 3v7c4 4 10 4 14 0v-7m4-3v10',
    'puzzle-piece': 'M3 3h6c-2 6 8 6 6 0h6v6c-6-2-6 8 0 6v6h-6c2-6-8-6-6 0H3v-6c6 2 6-8 0-6V3',
    zap: 'M13 2 3 14h8l-1 8 11-13h-8V2', type: 'M3 4h18m-9 0v17m-5 0h10'
  };
  paths['users-round'] = paths.users;
  function cue(parent, icon, textOnly = false) {
    if (textOnly || !paths[icon]) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.classList.add('section-cue');
    const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', paths[icon]); svg.append(path); parent.prepend(svg);
  }
  return { excludedPersonal, normalise, search, destination, medical, cue, order };
});
