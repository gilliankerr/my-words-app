// Explicitly injected pool only; no production connection, migration discovery or environment fallback.
class RevisionRepository {
  constructor(pool) { this.pool = pool; }
  async read(id, fn) {
    // A committed PostgreSQL snapshot suffices for reading. Mutations still use
    // transaction() and the workspace row lock; reads never rewrite owned data.
    const result = await this.pool.query('SELECT state FROM next_workspaces WHERE id = $1', [id]);
    if (!result.rows[0]) { const e = new Error('Access denied'); e.status = 403; throw e; }
    return fn(result.rows[0].state);
  }
  async transaction(id, fn) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Grant/revoke and revision acceptance take the same workspace lock.
      const result = await client.query('SELECT state FROM next_workspaces WHERE id = $1 FOR UPDATE', [id]);
      if (!result.rows[0]) { const e = new Error('Access denied'); e.status = 403; throw e; }
      const state = result.rows[0].state;
      const response = await fn(state);
      await client.query('UPDATE next_workspaces SET state = $2::jsonb WHERE id = $1', [id, JSON.stringify(state)]);
      await client.query('COMMIT');
      return response;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}
module.exports = { RevisionRepository };
