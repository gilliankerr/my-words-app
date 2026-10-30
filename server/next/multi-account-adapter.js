'use strict';

// Opt-in multi-account foundation. Importing this module does not open a pool,
// create accounts, run migrations or change the deployed shared-account assembly.
const bcrypt = require('bcrypt');
const { randomBytes } = require('node:crypto');

function accountId(actor) {
  if (typeof actor !== 'string' || !/^[1-9]\d*$/.test(actor)) return null;
  const id = Number(actor);
  return Number.isSafeInteger(id) ? id : null;
}

class MultiAccountAdapter {
  constructor({ users, pool } = {}) {
    if (typeof users?.findUserByUsername !== 'function' || typeof users?.findUserById !== 'function' || typeof users?.verifyPassword !== 'function' || typeof pool?.query !== 'function') {
      throw new Error('Multi-account authentication requires explicit user and workspace lookups.');
    }
    this.users = users;
    this.pool = pool;
    this.dummyHash = bcrypt.hashSync(randomBytes(32).toString('hex'), 10);
  }

  async verify(name, password) {
    if (typeof name !== 'string' || name.length > 254 || typeof password !== 'string' || password.length > 200) return null;
    const user = await this.users.findUserByUsername(name.trim().toLowerCase());
    const valid = await this.users.verifyPassword(password, user?.password_hash || this.dummyHash);
    return valid && Number.isSafeInteger(user?.id) && user.id > 0 ? String(user.id) : null;
  }

  async active(actor) {
    const id = accountId(actor);
    return id !== null && (await this.users.findUserById(id))?.id === id;
  }

  async workspaceFor(actor) {
    const id = accountId(actor);
    if (id === null) return null;
    const result = await this.pool.query("SELECT id, owner_id, state->>'owner' AS owner FROM next_workspaces WHERE owner_id = $1 LIMIT 2", [id]);
    const row = result.rows[0];
    return result.rows.length === 1 && row.owner_id === id && row.owner === actor && typeof row.id === 'string' && row.id.trim() ? row.id : null;
  }
}

module.exports = { MultiAccountAdapter };
