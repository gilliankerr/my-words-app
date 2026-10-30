'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

function denied() { const error = new Error('Access denied'); error.status = 403; return error; }
function accountId(actor) {
  if (typeof actor !== 'string' || !/^[1-9]\d*$/.test(actor) || !Number.isSafeInteger(Number(actor))) throw denied();
  return Number(actor);
}

// The actor comes exclusively from authenticated middleware, never a body or URL.
// Each operation still restricts SQL rows and checks the complete stored envelope.
class OwnedRevisionRepository {
  constructor(pool) {
    if (typeof pool?.query !== 'function' || typeof pool?.connect !== 'function') throw new Error('An explicit database pool is required.');
    this.pool = pool;
    this.actors = new AsyncLocalStorage();
  }
  runAs(actor, next) { accountId(actor); return this.actors.run(actor, next); }
  context() { const actor = this.actors.getStore(); return { actor, id: accountId(actor) }; }
  check(state, id, actor) { if (!state || state.id !== id || state.owner !== actor) throw denied(); }
  async read(id, fn) {
    const owner = this.context();
    const result = await this.pool.query('SELECT state FROM next_workspaces WHERE id = $1 AND owner_id = $2', [id, owner.id]);
    const state = result.rows[0]?.state;
    this.check(state, id, owner.actor);
    return fn(state);
  }
  async transaction(id, fn) {
    const owner = this.context(), client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query('SELECT state FROM next_workspaces WHERE id = $1 AND owner_id = $2 FOR UPDATE', [id, owner.id]);
      const state = result.rows[0]?.state;
      this.check(state, id, owner.actor);
      const response = await fn(state);
      this.check(state, id, owner.actor);
      const saved = await client.query('UPDATE next_workspaces SET state = $2::jsonb WHERE id = $1 AND owner_id = $3', [id, JSON.stringify(state), owner.id]);
      if (saved.rowCount !== 1) throw denied();
      await client.query('COMMIT');
      return response;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}

module.exports = { OwnedRevisionRepository };
