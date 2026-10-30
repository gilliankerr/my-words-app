(function (root) {
  'use strict';
  const M = root.NextModel;
  class LocalStore {
    async open() {
      this.db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(root.NextRuntime?.privateLocal ? 'cn-private-local-v1' : root.NextRuntime?.sharedAccount ? 'cn-owned-account-v1' : 'cn-next-synthetic-v1', 1);
        req.onupgradeneeded = () => { req.result.createObjectStore('scopes'); req.result.createObjectStore('meta'); };
        req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
      });
      return this;
    }
    key(actor, workspace) { return `schema1:${location.origin}:${actor || 'guest'}:${workspace}`; }
    transact(store, mode, work) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(store, mode); const os = tx.objectStore(store);
        let value, failed;
        tx.oncomplete = () => resolve(value); tx.onabort = () => reject(failed || tx.error || new Error('Storage failed; export your input and retry.'));
        tx.onerror = () => {};
        try { work(os, v => { value = v; }, error => { failed = error; tx.abort(); }); } catch (e) { failed = e; tx.abort(); }
      });
    }
    async identity(value) {
      if (arguments.length) return this.transact('meta', 'readwrite', (os, done) => { os.put(value, 'authorised'); done(value); });
      return this.transact('meta', 'readonly', (os, done) => { os.get('authorised').onsuccess = e => done(e.target.result || null); });
    }
    validate(data, actor, workspace) {
      M.insist(data?.schema === 1 && data.actor === actor && data.workspace === workspace && M.object(data.drafts) && Array.isArray(data.outbox), 'Corrupt local store. Mutation blocked; recover from an export.');
      M.validateWorkspace(data.snapshot);
      M.insist(data.baselines === undefined || M.object(data.baselines), 'Corrupt unfinished item sources');
      for (const [id, r] of Object.entries(data.baselines || {})) M.insist(r.id === id && Number.isInteger(r.current) && Array.isArray(r.revisions) && r.revisions.every(v => Number.isInteger(v.number) && v.payload?.id === id && typeof v.payload.text === 'string'), 'Corrupt unfinished source');
      const record = id => data.snapshot.records[id] || data.baselines?.[id];
      for (const [id, draft] of Object.entries(data.drafts)) M.insist(record(id) && draft.payload?.id === id && typeof draft.payload.text === 'string' && record(id).revisions.some(r => r.number === draft.base), 'Corrupt draft reference; mutation blocked');
      for (const [id, draft] of Object.entries(data.retainedDrafts || {})) M.insist(record(id) && draft.payload?.id === id && typeof draft.payload.text === 'string' && record(id).revisions.some(r => r.number === draft.base), 'Corrupt retained draft; mutation blocked');
      for (const operation of data.outbox) {
        if (operation.action === 'clear-shopping') { M.insist(M.object(operation.expected), 'Corrupt list reset'); continue; }
        M.insist(record(operation.recordId) && operation.payload?.id === operation.recordId && typeof operation.payload.text === 'string' && record(operation.recordId).revisions.some(r => r.number === operation.base), 'Corrupt pending operation; mutation blocked');
      }
      M.insist(data.snapshot.editions[data.active] && (!data.pending || data.snapshot.editions[data.pending]), 'Corrupt edition pointer');
      return data;
    }
    resolve(os, key, callback, fail) {
      os.get(key).onsuccess = e => {
        const root = e.target.result;
        if (!root?.pointer) return callback(root, key);
        if (typeof root.pointer !== 'string' || !root.pointer.startsWith(key + ':generation:')) return fail(new Error('Corrupt namespace pointer; mutation blocked'));
        os.get(root.pointer).onsuccess = item => {
          if (!item.target.result) return fail(new Error('Missing canonical generation; mutation blocked'));
          callback(item.target.result, root.pointer);
        };
      };
    }
    read(actor, workspace) {
      return this.transact('scopes', 'readonly', (os, done, fail) => {
        this.resolve(os, this.key(actor, workspace), value => { try { done(value ? this.validate(value, actor, workspace) : null); } catch (error) { fail(error); } }, fail);
      });
    }
    downloadVersion(actor, workspace) {
      return this.transact('scopes', 'readonly', (os, done) => {
        os.get(this.key(actor, workspace) + ':removal').onsuccess = e => done(e.target.result || null);
      });
    }
    update(actor, workspace, fn, initial, downloadVersion) {
      const guardedDownload = arguments.length > 4;
      return this.transact('scopes', 'readwrite', (os, done, fail) => {
        const key = this.key(actor, workspace);
        const update = () => this.resolve(os, key, (existing, canonicalKey) => {
          try {
            const value = existing ? this.validate(existing, actor, workspace) : initial;
            M.insist(value, 'Download or restore this workspace first.');
            const next = fn(M.clone(value)); this.validate(next, actor, workspace);
            os.put(next, canonicalKey); done(next);
          } catch (error) { fail(error); }
        }, fail);
        // Check removal and write the received snapshot in the same transaction.
        // A durable marker also rejects old downloads held by another tab/store.
        if (guardedDownload) os.get(key + ':removal').onsuccess = e => {
          try { M.insist((e.target.result || null) === downloadVersion, 'This local copy was removed. Sign in again to download it.'); update(); }
          catch (error) { fail(error); }
        };
        else update();
      });
    }
    async receive(actor, snapshot, downloadVersion) {
      M.validateWorkspace(snapshot);
      // Preserve immediate direct receives; network callers pass their pre-GET version.
      if (arguments.length < 3) downloadVersion = await this.downloadVersion(actor, snapshot.id);
      const initial = { schema: 1, actor, workspace: snapshot.id, snapshot, active: snapshot.edition.id, pending: null, drafts: {}, outbox: [], outcomes: {}, locked: false, generation: crypto.randomUUID(), backup: null };
      const received = await this.update(actor, snapshot.id, data => {
        // Preserve old editions and pinned view while downloading a durable new snapshot.
        snapshot = M.clone(snapshot); snapshot.editions = { ...data.snapshot.editions, ...snapshot.editions };
        M.eraseNotebookCopies(data, snapshot.purgedNotebooks);
        M.eraseNotebookCopies(snapshot, snapshot.purgedNotebooks);
        data.snapshot = snapshot; data.pending = data.active === snapshot.edition.id ? null : snapshot.edition.id;
        data.locked = false; return data;
      }, initial, downloadVersion);
      return Object.keys(snapshot.purgedNotebooks || {}).length ? this.eraseNotebooks(actor, snapshot.id, snapshot.purgedNotebooks, downloadVersion) : received;
    }
    async eraseNotebooks(actor, workspace, marks, downloadVersion) {
      const guardedDownload = arguments.length > 3;
      const key = this.key(actor, workspace);
      await this.transact('scopes', 'readwrite', (os, done, fail) => {
        const erase = () => { os.openCursor(IDBKeyRange.bound(key, key + '\uffff')).onsuccess = e => {
          const cursor = e.target.result;
          if (!cursor) return done(true);
          if (cursor.key === key || String(cursor.key).startsWith(key + ':generation:')) {
            const value = cursor.value;
            if (value.snapshot) try {
              M.eraseNotebookCopies(value, marks);
              value.snapshot.purgedNotebooks = { ...(value.snapshot.purgedNotebooks || {}), ...M.clone(marks) };
              this.validate(value, actor, workspace); cursor.update(value);
            } catch (error) { return fail(error); }
          }
          cursor.continue();
        }; };
        if (guardedDownload) os.get(key + ':removal').onsuccess = e => {
          try { M.insist((e.target.result || null) === downloadVersion, 'This local copy was removed. Sign in again to download it.'); erase(); }
          catch (error) { fail(error); }
        };
        else erase();
      });
      return this.read(actor, workspace);
    }
    restore(actor, workspace, owner, text, confirmed, master, hash, options = {}) {
      const pkg = M.validatePackage(text, workspace, owner, master, hash);
      M.insist(!pkg.activeEdition || pkg.workspace.editions[pkg.activeEdition], 'Invalid adopted edition reference');
      M.insist(confirmed, 'Preview and confirm replacement first.');
      const initial = { schema: 1, actor, workspace, drafts: {}, outbox: [], outcomes: {}, active: pkg.workspace.edition.id, pending: null, snapshot: pkg.workspace, locked: false };
      return this.transact('scopes', 'readwrite', (os, done, fail) => {
        const key = this.key(actor, workspace);
        this.resolve(os, key, existing => {
          try {
            const data = existing ? this.validate(existing, actor, workspace) : initial;
            const generation = crypto.randomUUID();
            const next = { ...M.clone(data), generation, snapshot: pkg.workspace, active: pkg.activeEdition || pkg.workspace.edition.id, pending: null, backup: JSON.stringify(M.exportPackage(data.snapshot)) };
            const deletions = { ...(pkg.workspace.purgedNotebooks || {}), ...(data.snapshot.purgedNotebooks || {}) };
            M.eraseNotebookCopies(next, deletions); next.snapshot.purgedNotebooks = deletions;
            // Repeated restores must not replace earlier unfinished-work recovery.
            if (data.backup || data.draftBackup || data.importedRecovery) next.priorRestoreRecovery = [...M.clone(data.priorRestoreRecovery || []), { at: new Date().toISOString(), backup: data.backup || null, draftBackup: M.clone(data.draftBackup || null), importedRecovery: M.clone(data.importedRecovery || null) }];
            if (pkg.recovery || options.recovery) next.importedRecovery = M.clone(pkg.recovery || options.recovery);
            if (options.suspendDrafts) {
              next.draftBackup = { baselines: M.clone(data.baselines || {}), drafts: M.clone(data.drafts), retainedDrafts: M.clone(data.retainedDrafts || {}), outbox: M.clone(data.outbox) };
              next.baselines = {}; next.drafts = {}; next.retainedDrafts = {}; next.outbox = []; next.outcomes = {};
              delete next.restoreHold; delete next.pendingRestoration;
            }
            this.validate(next, actor, workspace);
            const freshKey = key + ':generation:' + generation;
            // Staging and pointer switch share a transaction: either both persist, or neither does.
            os.put(next, freshKey);
            os.put({ schema: 1, actor, workspace, pointer: freshKey }, key);
            done(next);
          } catch (error) { fail(error); }
        }, fail);
      });
    }
    remove(actor, workspace, confirmed) {
      M.insist(confirmed, 'Export a backup and confirm local removal first.');
      return this.transact('scopes', 'readwrite', (os, done) => {
        const key = this.key(actor, workspace); os.delete(key);
        // Retain only an opaque removal version, never the removed content.
        os.put(crypto.randomUUID(), key + ':removal');
        const prefix = key + ':generation:';
        os.openCursor(IDBKeyRange.bound(prefix, prefix + '\uffff')).onsuccess = e => { const cursor = e.target.result; if (cursor) { cursor.delete(); cursor.continue(); } else done(true); };
      });
    }
  }
  root.NextLocalStore = LocalStore;
})(globalThis);
