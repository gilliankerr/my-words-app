(function (root) {
  const M = root.NextModel;
  function expectedPayload(data, operation) {
    const record = data.snapshot.records[operation.recordId] || data.baselines?.[operation.recordId];
    const base = record?.revisions.find(r => r.number === operation.base);
    M.insist(base, 'Invalid local save base. Proposal remains waiting to sync.');
    const action = operation.action || 'edit';
    if (action === 'undo' || action === 'restore') {
      const target = record.revisions.find(r => r.number === operation.target);
      const source = action === 'undo' ? record.revisions.find(r => r.number === target?.base) : target;
      M.insist(source, 'Invalid local restoration target. Proposal remains waiting to sync.');
      const payload = M.clone(source.payload); if (action === 'restore') payload.tombstone = false;
      return payload;
    }
    M.insist(operation.payload?.id === operation.recordId && operation.payload.kind === base.payload.kind && operation.payload.category === base.payload.category && M.canonical(operation.payload.binding) === M.canonical(base.payload.binding), 'Invalid local save identity. Proposal remains waiting to sync.');
    const payload = M.preserve(base.payload, operation.payload);
    payload.tombstone = action === 'remove';
    return payload;
  }
  function acceptedRevision(revision, base, operation, action, actor, payload) {
    return M.object(revision) && revision.number === base + 1 && revision.base === base && revision.author === actor && revision.operation === operation && revision.action === action && typeof revision.at === 'string' && Number.isFinite(Date.parse(revision.at)) && M.canonical(revision.payload) === M.canonical(payload);
  }
  function sameHistory(saved, incoming) {
    // A client-created baseline has a local timestamp; the server stamps its own baseline.
    const comparison = ['source', 'new'].includes(saved.operation) ? { ...incoming, at: saved.at } : incoming;
    return M.canonical(saved) === M.canonical(comparison);
  }
  class Sync {
    constructor(store, repository, actor, workspace, device) { Object.assign(this, { store, repository, actor, workspace, device }); }
    async download() {
      const downloadVersion = await this.store.downloadVersion(this.actor, this.workspace);
      const snapshot = await this.repository.request(`workspaces/${this.workspace}`);
      M.insist(snapshot.id === this.workspace, 'Unexpected workspace response');
      M.validateWorkspace(snapshot);
      const previous = await this.store.read(this.actor, this.workspace);
      if (previous) {
        M.insist(snapshot.owner === previous.snapshot.owner, 'Invalid workspace owner. Saved data and waiting changes are retained.');
        const incomingEpoch = snapshot.privateEpoch || 0, localEpoch = previous.snapshot.privateEpoch || 0;
        M.insist(Number.isSafeInteger(incomingEpoch) && incomingEpoch >= localEpoch, 'Invalid restoration history. Saved data and waiting changes are retained.');
        if (incomingEpoch !== localEpoch) {
          // A restored book has a different revision history. Keep the local reading
          // copy and every draft/retry until explicit review and local adoption.
          await this.store.update(this.actor, this.workspace, value => {
            M.insist((value.snapshot.privateEpoch || 0) === localEpoch, 'Local restoration changed. Review the saved book again.');
            value.pendingRestoration = M.clone(snapshot);
            value.restoreHold = { ...value.restoreHold, reason: value.restoreHold?.request ? 'shared-restore-request' : 'shared-restore', epoch: incomingEpoch, edition: snapshot.edition.id };
            return value;
          }, undefined, downloadVersion);
          throw new Error('The shared book was restored on another device. Your local book and unfinished changes are retained. Review the restored book before sending.');
        }
        // Within a restore epoch, acknowledged history is immutable.
        if ((snapshot.privateEpoch || 0) === (previous.snapshot.privateEpoch || 0)) {
          for (const [id, record] of Object.entries(previous.snapshot.records)) {
            if (snapshot.purgedNotebooks?.[id] && !snapshot.records[id]) continue;
            const incoming = snapshot.records[id];
            M.insist(incoming && incoming.current >= record.current && record.revisions.every(revision => {
              // Revision zero is an unacknowledged local creation placeholder until first receipt/download.
              const placeholder = revision.number === 0 && revision.operation === 'new' && previous.baselines?.[id]?.revisions.some(r => M.canonical(r) === M.canonical(revision));
              return placeholder || incoming.revisions.some(r => r.number === revision.number && sameHistory(revision, r));
            }), 'Invalid workspace history. Saved data and waiting changes are retained.');
          }
          for (const outcome of Object.values(previous.outcomes || {})) if (outcome.outcome === 'accepted') {
            const receipts = outcome.latest ? { [outcome.recordId]: outcome.latest } : outcome.revisions || {};
            for (const [id, revision] of Object.entries(receipts)) {
              if (snapshot.purgedNotebooks?.[id] && !snapshot.records[id]) continue;
              // Receipts from an earlier explicit restore epoch no longer describe canonical history.
              const retained = previous.snapshot.records[id]?.revisions.find(r => r.number === revision.number && M.canonical(r) === M.canonical(revision));
              if (retained) M.insist(snapshot.records[id]?.revisions.some(r => r.number === revision.number && M.canonical(r) === M.canonical(revision)), 'Invalid acknowledged history. Saved data and waiting changes are retained.');
            }
          }
        }
      }
      const data = await this.store.receive(this.actor, snapshot, downloadVersion);
      // Receipt can only follow a completed durable transaction.
      await this.repository.request(`workspaces/${this.workspace}/receipts`, { device: this.device, edition: snapshot.edition.id, adopt: false });
      return data;
    }
    send() {
      if (!this.sending) this.sending = this.sendPending().finally(() => { this.sending = null; });
      return this.sending;
    }
    async sendPending() {
      const session = await this.repository.session();
      M.insist(session.actor === this.actor, 'Sign in to the account that owns these waiting changes.');
      let data = await this.store.read(this.actor, this.workspace);
      M.insist(!data.restoreHold, 'Book restoration needs attention. Waiting changes are held. Restore the backup again before sending.');
      while (data.outbox.length) {
        const operation = data.outbox[0];
        let result;
        try { result = await this.repository.request(`workspaces/${this.workspace}/operations`, operation); }
        catch (error) {
          if (error.status !== 410) throw error;
          await this.download(); data = await this.store.read(this.actor, this.workspace);
          M.insist(data.snapshot.purgedNotebooks?.[operation.recordId] && !data.outbox.some(o => o.operation === operation.operation), 'Deletion receipt unavailable. Waiting change retained.');
          continue;
        }
        if (operation.action === 'clear-shopping') {
          M.insist(result.workspace === this.workspace && result.operation === operation.operation && result.action === operation.action && M.canonical(result.expected) === M.canonical(operation.expected) && ['accepted', 'conflict'].includes(result.outcome), 'Invalid list reset response. Reset remains waiting.');
          if (result.outcome === 'accepted') {
            M.insist(typeof result.edition === 'string' && result.edition.trim() && M.object(result.revisions) && M.canonical(Object.keys(result.revisions).sort()) === M.canonical(Object.keys(operation.expected).sort()) && Object.entries(result.revisions).every(([id, r]) => {
              const base = data.snapshot.records[id]?.revisions.find(v => v.number === operation.expected[id]);
              const existing = data.snapshot.records[id]?.revisions.find(v => v.number === r.number);
              return base?.payload.kind === 'shopping' && acceptedRevision(r, operation.expected[id], operation.operation, 'clear-shopping', this.actor, { ...M.clone(base.payload), checked: false }) && (!existing || M.canonical(existing) === M.canonical(r));
            }), 'Invalid list reset revisions. Complete items and reset remain waiting.');
          }
          else M.insist(result.conflict && M.canonical(result.conflict.expected) === M.canonical(operation.expected), 'Invalid list reset conflict');
          data = await this.store.update(this.actor, this.workspace, value => {
            value.outbox = value.outbox.filter(op => op.operation !== operation.operation); value.outcomes[operation.operation] = result;
            if (result.outcome === 'accepted') for (const o of Object.values(value.outcomes)) if (o.action === 'clear-shopping' && o.outcome === 'conflict') o.resolved = true;
            if (result.outcome === 'accepted') for (const [id, revision] of Object.entries(result.revisions)) { const r = value.snapshot.records[id]; if (!r.revisions.some(v => v.number === revision.number)) r.revisions.push(M.clone(revision)); r.current = Math.max(r.current, revision.number); }
            return value;
          }); continue;
        }
        M.insist(result.workspace === this.workspace && result.recordId === operation.recordId && result.operation === operation.operation && ['accepted', 'conflict'].includes(result.outcome) && Number.isInteger(result.revision) && result.latest?.number === result.revision && result.latest?.payload?.id === operation.recordId && typeof result.latest.payload.text === 'string', 'Invalid save response. Proposal remains waiting to sync.');
        if (result.outcome === 'accepted') {
          const payload = expectedPayload(data, operation);
          M.insist(typeof result.edition === 'string' && result.edition.trim() && result.revision === operation.base + 1 && acceptedRevision(result.latest, operation.base, operation.operation, operation.action || 'edit', this.actor, payload), 'Invalid accepted revision. Complete proposal remains waiting to sync.');
          const existing = data.snapshot.records[operation.recordId]?.revisions.find(r => r.number === result.revision);
          M.insist(!existing || M.canonical(existing) === M.canonical(result.latest), 'Invalid accepted history. Complete proposal remains waiting to sync.');
        }
        else {
          const conflict = result.conflict, payload = expectedPayload(data, operation);
          M.insist(conflict && typeof conflict.id === 'string' && conflict.id && conflict.recordId === operation.recordId && conflict.base === operation.base && conflict.latest === result.revision && conflict.author === this.actor && conflict.operation === operation.operation && typeof conflict.at === 'string' && Number.isFinite(Date.parse(conflict.at)) && conflict.proposal?.action === (operation.action || 'edit') && conflict.proposal.target === (operation.target || null) && M.canonical(conflict.proposal.payload) === M.canonical(payload) && result.latest.payload.kind === payload.kind && result.latest.payload.category === payload.category && M.canonical(result.latest.payload.binding) === M.canonical(payload.binding), 'Invalid conflict response. Complete proposal remains waiting to sync.');
        }
        data = await this.store.update(this.actor, this.workspace, value => {
          value.outbox = value.outbox.filter(op => op.operation !== operation.operation); value.outcomes[operation.operation] = result;
          if (result.outcome === 'accepted') {
            for (const o of Object.values(value.outcomes)) if (o.recordId === operation.recordId && o.outcome === 'conflict') o.resolved = true;
            const record = value.snapshot.records[operation.recordId] ||= M.clone(value.baselines[operation.recordId]);
            if (!record.revisions.some(r => r.number === result.revision)) record.revisions.push(M.clone(result.latest));
            record.current = Math.max(record.current, result.revision);
          }
          const draft = value.drafts[operation.recordId]; if (draft?.operation === operation.operation && draft.state === 'waiting') {
            draft.state = result.outcome;
            if (result.outcome === 'accepted') {
              const desired = M.clone(draft.payload); draft.base = result.revision; draft.payload = M.clone(result.latest.payload);
              // A later local tick never rewrites the original retry operation. Send it only after that operation is acknowledged.
              if (M.canonical(desired) !== M.canonical(operation.payload) && !['undo', 'restore'].includes(operation.action)) {
                draft.payload = desired; draft.state = 'waiting'; draft.operation = crypto.randomUUID();
                value.outbox.push({ recordId: operation.recordId, base: result.revision, operation: draft.operation, payload: desired, action: desired.tombstone ? 'remove' : result.latest.payload.tombstone ? 'resurrect' : 'edit', ...(operation.privateEpoch !== undefined ? { privateEpoch: operation.privateEpoch } : {}) });
              }
              if (draft.state === 'accepted' && value.retainedDrafts?.[operation.recordId]) { value.drafts[operation.recordId] = M.clone(value.retainedDrafts[operation.recordId]); delete value.retainedDrafts[operation.recordId]; }
            }
          }
          return value;
        });
      }
      await this.download(); return this.store.read(this.actor, this.workspace);
    }
    async adopt() {
      const data = await this.store.update(this.actor, this.workspace, value => { if (value.pending) { value.active = value.pending; value.pending = null; } return value; });
      // Local adoption succeeds offline. Remote acknowledgement is retried at a later boundary.
      try { await this.repository.request(`workspaces/${this.workspace}/receipts`, { device: this.device, edition: data.active, adopt: true }); } catch {}
      return data;
    }
  }
  root.NextSync = Sync;
})(globalThis);
