(function (root, factory) {
  const api = factory();
  if (typeof module === 'object') module.exports = api;
  else root.NextModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const MAX_PACKAGE_BYTES = 64 * 1024 * 1024;
  function insist(test, message) { if (!test) throw new Error(message); }
  // Stable canonical serialisation also fingerprints the full built-in word, including usage.
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (object(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
    return JSON.stringify(value);
  }
  function preserve(base, candidate) {
    if (!object(base) || !object(candidate)) return clone(candidate);
    const result = clone(base);
    for (const [key, value] of Object.entries(candidate)) {
      insist(!['__proto__', 'prototype', 'constructor'].includes(key), 'Unsafe property');
      result[key] = object(value) && object(base[key]) ? preserve(base[key], value) : clone(value);
    }
    return result;
  }
  function bindingMatches(binding, master, hash) {
    if (!binding || binding.masterHash !== hash || binding.masterVersion !== master.version) return false;
    const section = master.categories.find(c => c.id === binding.category);
    return !!section && canonical(section.words[binding.locator]) === binding.fingerprint;
  }
  function projectBook(edition, master, hash) {
    const book = typeof module === 'object' ? require('./book-records') : globalThis.NextBook;
    return book.project(edition, master, hash).vocabulary;
  }
  function validateWorkspace(w) {
    insist(object(w) && typeof w.id === 'string' && typeof w.owner === 'string', 'Invalid workspace mapping');
    insist(object(w.records) && object(w.content) && Array.isArray(w.conflicts), 'Invalid workspace schema');
    insist(w.purgedNotebooks === undefined || object(w.purgedNotebooks) && Object.entries(w.purgedNotebooks).every(([id, mark]) => typeof id === 'string' && object(mark) && Number.isSafeInteger(mark.revision) && mark.revision > 0 && (mark.path === undefined || Array.isArray(mark.path) && mark.path.length === 2 && mark.path[0] === 'notebooks' && Number.isSafeInteger(mark.path[1]) && mark.path[1] >= 0)), 'Invalid notebook deletion receipt');
    insist(object(w.content.hidden) && object(w.content.custom) && Array.isArray(w.content.order) && w.content.order.length === 29 && new Set(w.content.order).size === 29, 'Invalid vocabulary order');
    insist(object(w.content.guide) && Array.isArray(w.content.guide.content), 'Missing owned Guide');
    const contentValid = c => object(c) && Array.isArray(c.rescue) && c.rescue.every(s => typeof s === 'string') && Array.isArray(c.diagrams) && object(c.notebook) && object(c.notebook.frontMatter) && object(c.preferences) && object(c.routes) && object(c.links) && Array.isArray(c.savedGroups) && Array.isArray(c.contacts) && Array.isArray(c.notes) && object(c.hidden) && object(c.custom) && Array.isArray(c.order) && object(c.guide) && Array.isArray(c.guide.content);
    insist(contentValid(w.content), 'Invalid complete workspace content');
    for (const [id, record] of Object.entries(w.records)) {
      insist(record.id === id && Number.isInteger(record.current) && Array.isArray(record.revisions), 'Invalid record revision');
      const numbers = new Set();
      for (const r of record.revisions) {
        insist(Number.isInteger(r.number) && !numbers.has(r.number) && object(r.payload) && r.payload.id === id && typeof r.payload.text === 'string' && typeof r.author === 'string', 'Invalid revision envelope');
        numbers.add(r.number);
      }
      insist(numbers.has(record.current), 'Missing current revision');
    }
    for (const c of w.conflicts) insist(w.records[c.recordId] && c.proposal?.payload?.id === c.recordId && w.records[c.recordId].revisions.some(r => r.number === c.base), 'Invalid conflict reference');
    insist(object(w.editions) && w.editions[w.edition?.id] && canonical(w.edition) === canonical(w.editions[w.edition.id]), 'Missing or inconsistent edition reference');
    for (const [id, e] of Object.entries(w.editions)) {
      insist(e.id === id && e.workspace === w.id && object(e.master) && typeof e.master.hash === 'string' && object(e.payloads) && object(e.revisions) && object(e.content), 'Invalid edition');
      insist(contentValid(e.content), 'Invalid complete edition content');
      insist(canonical(Object.keys(e.payloads).sort()) === canonical(Object.keys(e.revisions).sort()), 'Edition payload/revision mismatch');
      for (const [recordId, number] of Object.entries(e.revisions)) {
        const revision = w.records[recordId]?.revisions.find(r => r.number === number);
        insist(revision && canonical(revision.payload) === canonical(e.payloads[recordId]), 'Invalid edition revision reference');
      }
    }
    return w;
  }
  function rejectAuthority(value) {
    if (!object(value) && !Array.isArray(value)) return;
    const forbidden = /^(password|passwordHash|session|sessions|cookie|cookies|token|tokens|csrf|members|grants|operations|credentials)$/i;
    for (const [key, item] of Object.entries(value)) {
      insist(!forbidden.test(key), 'Package contains server authority or credentials');
      insist(!['__proto__', 'prototype', 'constructor'].includes(key), 'Unsafe property');
      rejectAuthority(item);
    }
  }
  function exportPackage(state) {
    const workspace = clone(state);
    delete workspace.members;
    delete workspace.operations;
    return { schema: 1, type: 'cn-next-workspace', workspace };
  }
  function validateDraftBundle(bundle, workspace, master, hash) {
    rejectAuthority(bundle);
    insist(bundle?.schema === 1 && bundle.type === 'cn-next-drafts' && typeof bundle.actor === 'string' && bundle.actor && bundle.workspace === workspace.id && object(bundle.drafts), 'Invalid draft owner mapping');
    const B = typeof module === 'object' ? require('./book-records') : globalThis.NextBook;
    const baselines = bundle.baselines || {};
    insist(object(baselines) && object(bundle.retainedDrafts || {}), 'Invalid draft sources');
    function payload(p, id) {
      insist(p?.id === id && ['phrase', 'page', 'shopping', 'note', 'person', 'group', 'notebook', 'preference', 'order'].includes(p.kind), 'Invalid draft envelope');
      insist(typeof p.text === 'string', 'Invalid draft wording');
      B.validatePayload({ ...p, text: p.text.trim() ? p.text : 'Unfinished wording' }, { draft: true }); if (master) B.checkBinding(p, workspace.edition, master, hash);
    }
    for (const [id, r] of Object.entries(baselines)) {
      insist(r.id === id && Number.isInteger(r.current) && Array.isArray(r.revisions) && r.revisions.some(v => v.number === r.current), 'Invalid draft source');
      const numbers = new Set();
      for (const v of r.revisions) { insist(Number.isInteger(v.number) && !numbers.has(v.number) && typeof v.author === 'string', 'Invalid source revision'); numbers.add(v.number); payload(v.payload, id); }
    }
    const record = id => workspace.records[id] || baselines[id];
    function reference(id, base, p) { insist(record(id)?.revisions.some(r => r.number === base), 'Invalid pending operation reference'); payload(p, id); }
    for (const drafts of [bundle.drafts, bundle.retainedDrafts || {}]) for (const [id, d] of Object.entries(drafts)) reference(id, d.base, d.payload);
    insist(Array.isArray(bundle.outbox || []), 'Invalid pending operations');
    const operations = new Set();
    for (const op of bundle.outbox || []) {
      insist(B.uuid.test(op.operation) && !operations.has(op.operation), 'Invalid pending operation key'); operations.add(op.operation);
      if (op.action === 'clear-shopping') { insist(object(op.expected), 'Invalid list reset'); for (const [id, base] of Object.entries(op.expected)) insist(record(id)?.revisions.some(r => r.number === base && r.payload.kind === 'shopping'), 'Invalid pending operation reference'); }
      else { insist(['edit', 'remove', 'resurrect', 'undo', 'restore', undefined].includes(op.action), 'Invalid pending action'); reference(op.recordId, op.base, op.payload); B.validatePayload(op.payload); }
    }
    return bundle;
  }
  function validatePackage(text, workspaceId, owner, master, hash) {
    insist(typeof text === 'string' && new TextEncoder().encode(text).length <= MAX_PACKAGE_BYTES, 'Backup exceeds the supported 64 MiB limit. Existing data is retained.');
    const pkg = JSON.parse(text);
    rejectAuthority(pkg);
    insist(pkg.schema === 1 && pkg.type === 'cn-next-workspace', 'Unsupported package schema');
    validateWorkspace(pkg.workspace);
    insist(pkg.workspace.id === workspaceId && pkg.workspace.owner === owner, 'Owner/workspace mapping requires explicit authorisation');
    if (master) {
      const ids = master.categories.map(c => c.id);
      const valid = c => c.order.length === ids.length && c.order.every(id => ids.includes(id)) && Object.keys(c.hidden).every(id => ids.includes(id)) && Object.values(c.hidden).every(a => Array.isArray(a) && a.every(Number.isInteger)) && Object.keys(c.custom).every(id => ids.includes(id)) && Object.values(c.custom).every(a => Array.isArray(a) && a.every(w => object(w) && typeof w.text === 'string'));
      insist(valid(pkg.workspace.content) && pkg.workspace.master.hash === hash && pkg.workspace.master.version === master.version, 'Master content binding mismatch');
      for (const e of Object.values(pkg.workspace.editions)) { insist(valid(e.content), 'Invalid edition category mapping'); projectBook(e, master, hash); }
    }
    if (pkg.recovery) validateDraftBundle(pkg.recovery, pkg.workspace, master, hash);
    return pkg;
  }
  function editEnvelope(payload, text) {
    insist(typeof text === 'string' && text.trim() && text.length <= 40000, 'Enter wording before saving.');
    return { ...clone(payload), text };
  }
  // Erase only explicitly confirmed notebook identities, including historical copies.
  // Source slots remain in place so other persistent source paths never shift.
  function eraseNotebookCopies(value, marks) {
    if (!object(value) && !Array.isArray(value)) return value;
    const ids = new Set(Object.keys(marks || {}));
    for (const field of ['records', 'payloads', 'revisions', 'drafts', 'retainedDrafts', 'baselines']) if (object(value[field])) for (const id of ids) delete value[field][id];
    for (const field of ['conflicts', 'outbox']) if (Array.isArray(value[field])) value[field] = value[field].filter(v => !ids.has(v.recordId) && !ids.has(v.id));
    for (const field of ['outcomes', 'operations']) if (object(value[field])) for (const [key, v] of Object.entries(value[field])) if (ids.has(v.recordId || v.result?.recordId)) delete value[field][key];
    if (Array.isArray(value.notebooks)) value.notebooks.forEach((n, index) => {
      const id = 'source:notebooks/' + encodeURIComponent(n?.id !== undefined ? '@' + n.id : index);
      if (ids.has(id)) value.notebooks[index] = null;
    });
    for (const [key, child] of Object.entries(value)) {
      if (key === 'purgedNotebooks' || key === 'purgeReceipts') continue;
      if (['backup', 'importedSource', 'text'].includes(key) && typeof child === 'string' && child.startsWith('{')) {
        try { const pkg = JSON.parse(child); if (pkg.type === 'cn-next-workspace' || pkg.type === 'cn-next-drafts') value[key] = JSON.stringify(eraseNotebookCopies(pkg, marks)); } catch {}
      } else if (object(child) || Array.isArray(child)) eraseNotebookCopies(child, marks);
    }
    return value;
  }
  // These generated category tags are not definitions or communication wording.
  // Keep them in saved envelopes, but do not repeat them beneath each word.
  function notebookItemContext(item) {
    const context = typeof item?.context === 'string' ? item.context : '';
    return /^(?:Genre and literary discussion|Book themes and concepts)$/i.test(context.trim()) ? '' : context;
  }
  return { clone, canonical, preserve, insist, object, MAX_PACKAGE_BYTES, bindingMatches, projectBook, validateWorkspace, exportPackage, validatePackage, validateDraftBundle, editEnvelope, rejectAuthority, eraseNotebookCopies, notebookItemContext };
});
