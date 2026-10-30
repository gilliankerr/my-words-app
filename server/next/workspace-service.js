const { randomUUID } = require('node:crypto');
const M = require('../../app-next/js/model');
const B = require('../../app-next/js/book-records');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const masterBytes = readFileSync(require('node:path').join(__dirname, '../../data/reference-library.json'));
const master = JSON.parse(masterBytes), masterHash = createHash('sha256').update(masterBytes).digest('hex');
function fail(status, message = 'Access denied') { const e = new Error(message); e.status = status; throw e; }
function access(w, actor, write = false, manage = false) {
  const role = w.members[actor];
  if (!role || (write && role === 'reader') || (manage && role !== 'manager')) fail(403);
  return role;
}
class WorkspaceService {
  constructor(repository) { this.repository = repository; }
  read(id, actor) {
    const read = this.repository.read || this.repository.transaction;
    return read.call(this.repository, id, w => { access(w, actor); return M.exportPackage(w).workspace; });
  }
  restoreFingerprint(w) { return createHash('sha256').update(M.canonical(M.exportPackage(w))).digest('hex'); }
  restorePreview(id, actor) {
    return this.repository.transaction(id, w => {
      access(w, actor); if (w.owner !== actor) fail(403);
      return { fingerprint: this.restoreFingerprint(w), epoch: w.privateEpoch || 0, records: Object.keys(w.records).length, edition: w.edition.id };
    });
  }
  restoreShared(id, actor, req = {}) {
    return this.repository.transaction(id, w => {
      access(w, actor); if (w.owner !== actor) fail(403);
      if (req.confirmed !== true || !B.uuid.test(req.operation || '') || typeof req.text !== 'string' || Buffer.byteLength(req.text) > M.MAX_PACKAGE_BYTES || !/^[a-f0-9]{64}$/.test(req.expected || '')) fail(400, 'Select an owned backup and confirm the replacement preview.');
      const key = actor + ':' + req.operation, fingerprint = createHash('sha256').update(M.canonical(req)).digest('hex');
      const prior = w.restoreReceipts?.[key];
      if (prior) {
        if (prior.fingerprint !== fingerprint || prior.epoch !== (w.privateEpoch || 0)) fail(409, 'This restore request changed or a newer restore exists. Review the saved book.');
        return M.exportPackage(w);
      }
      if (req.expected !== this.restoreFingerprint(w)) fail(409, 'The saved shared book changed. Review a new preview before restoring.');
      let pkg;
      try { pkg = M.validatePackage(req.text, id, actor, master, masterHash); }
      catch { fail(400, 'This backup is invalid or belongs to another account or workspace. Saved content is retained.'); }
      const backup = M.exportPackage(w); delete backup.workspace.restoreBackups; delete backup.workspace.restoreReceipts;
      const next = M.clone(pkg.workspace), epoch = (w.privateEpoch || 0) + 1;
      M.eraseNotebookCopies(next, w.purgedNotebooks);
      next.purgedNotebooks = { ...(next.purgedNotebooks || {}), ...(w.purgedNotebooks || {}) };
      next.privateEpoch = epoch; next.members = M.clone(w.members); next.operations = {};
      next.restoreReceipts = { ...(w.restoreReceipts || {}), [key]: { fingerprint, epoch } };
      next.restoreBackups = [...M.clone(w.restoreBackups || []), { id: req.operation, at: new Date().toISOString(), package: backup, importedSource: req.text }];
      M.eraseNotebookCopies(next, next.purgedNotebooks);
      M.validateWorkspace(next);
      if (Buffer.byteLength(JSON.stringify(M.exportPackage(next))) > M.MAX_PACKAGE_BYTES) fail(400, 'The restore and recovery copies exceed the backup limit. Saved content is retained.');
      // The repository's existing workspace row lock covers fingerprint comparison,
      // recovery retention and replacement as one commit. No live migration is needed.
      for (const field of Object.keys(w)) delete w[field]; Object.assign(w, next);
      return M.exportPackage(w);
    });
  }
  save(id, actor, req) {
    return this.repository.transaction(id, w => {
      const role = access(w, actor);
      if (w.purgedNotebooks?.[req.recordId]) fail(410, 'This notebook was permanently deleted. It cannot be restored or saved again.');
      if ((req.privateEpoch ?? 0) !== (w.privateEpoch || 0)) fail(409, 'The shared book was restored. Your waiting changes are retained. Review the restored book before saving again.');
      this.repository.checkOperation?.(w, actor, req);
      if (req.action === 'clear-shopping') return this.clearShopping(w, actor, req);
      // Ordinary expression is available to the reader; Book preparation remains a separate capability.
      // Decide using the retained identity, never a forged submitted kind.
      const retained = w.records[req.recordId] ? B.latest(w.records[req.recordId]).payload : B.baseline(w, req.recordId, master, masterHash)?.revisions[0]?.payload;
      const allowed = retained || req.payload;
      if (role === 'reader' && !(['shopping', 'note', 'person', 'group', 'notebook', 'preference'].includes(allowed?.kind) || allowed?.kind === 'page' && (allowed.category === 'personal' && ['contacts', 'notes', 'pages', 'templateFields'].includes(allowed.binding?.path?.[0]) || !allowed.binding))) fail(403);
      if (!Number.isInteger(req.base) || !B.uuid.test(req.operation || '') || !['edit', 'remove', 'restore', 'undo', 'resurrect'].includes(req.action || 'edit')) fail(400, 'Invalid operation');
      const fingerprint = M.canonical(req);
      const key = actor + ':' + req.operation;
      if (w.operations[key]) {
        if (w.operations[key].fingerprint !== fingerprint) fail(409, 'Operation key already used');
        return w.operations[key].result;
      }
      let record = w.records[req.recordId], created = false;
      if (!record) {
        try {
          if (req.base === 0 && B.uuid.test(req.recordId) && req.payload?.binding?.source === 'addition') {
            B.validatePayload(req.payload);
            const category = req.payload.category;
            const extraScope = /^notebook:\d+$/.test(category) && w.content.notebook.sections[Number(category.slice(9))] || w.content.savedGroups.some(g => 'group:' + g.id === category);
            const validScope = req.payload.kind === 'page' ? category === 'personal' : req.payload.kind === 'shopping' ? category === 'shopping-list' : req.payload.kind === 'note' ? category === 'notes' : req.payload.kind === 'person' ? category === 'people' : req.payload.kind === 'group' ? category === 'quick-words' : req.payload.kind === 'notebook' ? category === 'notebooks' : req.payload.kind === 'preference' ? ['display', 'dictionary', 'home-slot:1', 'home-slot:2', 'shortcuts', 'book-highlights'].includes(category) : req.payload.kind === 'phrase' && (master.categories.some(c => c.id === category) || extraScope);
            if (!validScope || req.payload.binding.category !== category) fail(400, 'Invalid addition');
            if (req.payload.kind === 'preference' && Object.values(w.records).some(r => B.latest(r).payload.kind === 'preference' && B.latest(r).payload.category === category)) fail(409, 'Preference identity already exists. Refresh before changing it.');
            const initial = { ...M.clone(req.payload), tombstone: true };
            record = { id: req.recordId, current: 0, revisions: [{ number: 0, base: 0, payload: initial, author: actor, at: new Date().toISOString(), operation: 'new' }] };
            created = true;
          } else if (req.recordId === 'order:' + req.payload?.category && req.payload?.kind === 'order') {
            const category = req.payload.category;
            const items = B.catalogue(B.currentEdition(w), master, masterHash);
            const valid = category === 'sections' ? master.categories.map(c => c.id) : items.filter(p => p.category === category && p.kind !== 'order').map(p => p.id);
            if (!valid.length) fail(400, 'Unknown order scope');
            const payload = B.orderPayload(category, valid);
            record = { id: payload.id, current: 1, revisions: [{ number: 1, base: 0, payload, author: w.owner, at: w.edition.at, operation: 'source' }] };
          } else record = B.baseline(w, req.recordId, master, masterHash);
        } catch (error) { fail(400, error.status ? error.message : 'Source binding needs review.'); }
        if (!record) fail(400, 'Unknown item');
        w.records[req.recordId] = record;
      }
      const latest = record.revisions.find(r => r.number === record.current);
      const base = record.revisions.find(r => r.number === req.base);
      if (!base) fail(400, 'Unknown base revision');
      let payload;
      const action = req.action || 'edit';
      if (action === 'undo' || action === 'restore') {
        const target = record.revisions.find(r => r.number === req.target);
        if (!target) fail(400, 'Unknown earlier version');
        const source = action === 'undo' ? record.revisions.find(r => r.number === target.base) : target;
        if (!source) fail(400, 'No inverse revision');
        payload = M.clone(source.payload);
        if (action === 'restore') payload.tombstone = false;
      } else {
        try { payload = M.editEnvelope(base.payload, req.payload?.text); } catch { fail(400, 'Enter wording before saving.'); }
        // All unknown fields from the submitted complete envelope must survive; immutable binding/id cannot change.
        if (!M.object(req.payload) || req.payload.id !== record.id || M.canonical(req.payload.binding) !== M.canonical(base.payload.binding) || req.payload.kind !== base.payload.kind || req.payload.category !== base.payload.category) fail(400, 'Invalid record identity');
        payload = M.preserve(base.payload, req.payload);
        payload.tombstone = action === 'remove';
      }
      try {
        B.validatePayload(payload);
        B.checkBinding(payload, w.edition, master, masterHash);
        if (req.payload?.original !== undefined && base.payload.original !== undefined && M.canonical(req.payload.original) !== M.canonical(base.payload.original)) fail(400, 'Original source is immutable');
        if (payload.kind === 'order') {
          const items = B.catalogue(B.currentEdition(w), master, masterHash);
          const valid = payload.category === 'sections' ? master.categories.map(c => c.id) : items.filter(p => p.category === payload.category && p.kind !== 'order').map(p => p.id);
          if (payload.items.some(id => !valid.includes(id))) fail(400, 'Unknown item in order');
        }
      } catch (error) { fail(400, error.status ? error.message : error.message); }
      const proposal = { payload, action, target: req.target || null };
      let result;
      if (record.current !== req.base || (action === 'undo' && record.current !== req.target) || (latest.payload.tombstone && action === 'edit' && !created)) {
        const conflict = { id: randomUUID(), recordId: record.id, base: req.base, latest: record.current, proposal, author: actor, operation: req.operation, at: new Date().toISOString() };
        w.conflicts.push(conflict);
        result = { outcome: 'conflict', workspace: id, recordId: record.id, operation: req.operation, revision: latest.number, latest, conflict };
      } else {
        const revision = { number: record.current + 1, base: req.base, payload, author: actor, at: new Date().toISOString(), operation: req.operation, action };
        record.revisions.push(revision); record.current = revision.number;
        if (!['shopping', 'preference'].includes(payload.kind)) {
          const edition = { id: randomUUID(), workspace: id, at: revision.at, master: M.clone(w.master), revisions: {}, payloads: {}, content: M.clone(w.content) };
          for (const [rid, r] of Object.entries(w.records)) if (B.latest(r).payload.kind !== 'shopping') { edition.revisions[rid] = r.current; edition.payloads[rid] = M.clone(B.latest(r).payload); }
          w.edition = edition; w.editions[edition.id] = edition;
        }
        // Fail transactionally before accepting data that cannot be backed up and restored.
        if (Buffer.byteLength(JSON.stringify(M.exportPackage(w))) > M.MAX_PACKAGE_BYTES) fail(400, 'This change would exceed the backup limit. Keep the local draft and export it before making more changes.');
        result = { outcome: 'accepted', workspace: id, recordId: record.id, operation: req.operation, revision: revision.number, latest: revision, edition: w.edition.id };
      }
      w.operations[key] = { fingerprint, result };
      return result;
    });
  }
  purgeNotebooks(id, actor, req = {}) {
    return this.repository.transaction(id, w => {
      access(w, actor);
      if (req.confirmed !== true || !B.uuid.test(req.operation || '') || !M.object(req.expected) || !Object.keys(req.expected).length || Object.keys(req.expected).length > 500 || !Object.values(req.expected).every(v => Number.isSafeInteger(v) && v > 0)) fail(400, 'Select notebooks and confirm permanent deletion.');
      if ((req.privateEpoch || 0) !== (w.privateEpoch || 0)) fail(409, 'The shared book changed. Review the notebooks before deleting.');
      const key = actor + ':' + req.operation, fingerprint = M.canonical(req);
      const prior = w.purgeReceipts?.[key];
      if (prior) { if (prior.fingerprint !== fingerprint) fail(409, 'Deletion request changed. Review it again.'); return M.clone(prior.result); }
      const marks = {};
      for (const [rid, revision] of Object.entries(req.expected)) {
        const r = w.records[rid] || B.baseline(w, rid, master, masterHash);
        if (!r || r.current !== revision || B.latest(r).payload.kind !== 'notebook') fail(409, 'A selected notebook changed. Nothing was deleted. Review the selection again.');
        const p = B.latest(r).payload;
        marks[rid] = { revision, ...(p.binding?.source === 'content' ? { path: M.clone(p.binding.path) } : {}) };
      }
      M.eraseNotebookCopies(w, marks);
      w.purgedNotebooks = { ...(w.purgedNotebooks || {}), ...marks };
      const result = { success: true, workspace: id, operation: req.operation, deleted: marks };
      (w.purgeReceipts ||= {})[key] = { fingerprint, result };
      M.validateWorkspace(w);
      return result;
    });
  }
  clearShopping(w, actor, req) {
    if (!B.uuid.test(req.operation || '') || !M.object(req.expected) || !Object.entries(req.expected).every(([id, revision]) => Number.isInteger(revision) && revision > 0 && w.records[id] && B.latest(w.records[id]).payload.kind === 'shopping' && w.records[id].revisions.some(r => r.number === revision))) fail(400, 'Invalid list reset');
    const key = actor + ':' + req.operation, fingerprint = M.canonical(req);
    if (w.operations[key]) { if (w.operations[key].fingerprint !== fingerprint) fail(409, 'Operation key already used'); return w.operations[key].result; }
    const current = Object.fromEntries(Object.values(w.records).filter(r => B.latest(r).payload.kind === 'shopping' && !B.latest(r).payload.tombstone).map(r => [r.id, r.current]));
    let result;
    if (M.canonical(current) !== M.canonical(req.expected)) {
      const conflict = { id: randomUUID(), expected: M.clone(req.expected), current, author: actor, operation: req.operation, at: new Date().toISOString() };
      (w.shoppingConflicts ||= []).push(conflict);
      result = { outcome: 'conflict', workspace: w.id, operation: req.operation, action: 'clear-shopping', conflict, expected: M.clone(req.expected) };
    } else {
      const revisions = {};
      for (const [id, base] of Object.entries(req.expected)) {
        const r = w.records[id]; const revision = { number: base + 1, base, payload: { ...M.clone(B.latest(r).payload), checked: false }, author: actor, at: new Date().toISOString(), operation: req.operation, action: 'clear-shopping' };
        r.current = revision.number; r.revisions.push(revision); revisions[id] = revision;
      }
      result = { outcome: 'accepted', workspace: w.id, operation: req.operation, action: 'clear-shopping', expected: M.clone(req.expected), revisions, edition: w.edition.id };
    }
    w.operations[key] = { fingerprint, result }; return result;
  }
  grant(id, actor, target, role) {
    return this.repository.transaction(id, w => {
      access(w, actor, true, true);
      if (target === w.owner || !['alex', 'robin', 'reader', 'outsider'].includes(target) || ![null, 'reader', 'editor', 'manager'].includes(role)) fail(400, 'Invalid grant');
      if (role) w.members[target] = role; else delete w.members[target];
      return { success: true };
    });
  }
  receipt(id, actor, device, edition, adopt) {
    return this.repository.transaction(id, w => {
      access(w, actor);
      if (!w.editions[edition] || !/^[a-zA-Z0-9-]{1,80}$/.test(device)) fail(400, 'Invalid receipt');
      const key = actor + ':' + device;
      const current = w.receipts[key] || { received: [], adopted: null };
      if (adopt && !current.received.includes(edition)) fail(409, 'Store edition before adoption');
      if (!adopt && !current.received.includes(edition)) current.received.push(edition);
      if (adopt) current.adopted = edition;
      w.receipts[key] = current;
      return { success: true, edition, adopted: current.adopted };
    });
  }
}
module.exports = { WorkspaceService, access, fail };
