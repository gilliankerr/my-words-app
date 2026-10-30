'use strict';

// Explicitly injected database; importing this module cannot connect or migrate.
const bcrypt = require('bcrypt');
const { createHash, randomBytes, randomUUID } = require('node:crypto');
const { initialBook } = require('./private-local');

const maxAccounts = 12, invitationHours = 48;
function failure(status, message) { const error = new Error(message); error.status = status; return error; }
function accountId(actor) {
  if (typeof actor !== 'string' || !/^[1-9]\d*$/.test(actor)) return null;
  const id = Number(actor);
  return Number.isSafeInteger(id) ? id : null;
}
function username(value) {
  if (typeof value !== 'string') throw failure(400, 'Choose a username with 3 to 40 letters, numbers, hyphens or underscores.');
  const name = value.trim().toLowerCase();
  if (!/^[a-z0-9_-]{3,40}$/.test(name)) throw failure(400, 'Choose a username with 3 to 40 letters, numbers, hyphens or underscores.');
  return name;
}
function tokenDigest(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token) || Buffer.from(token, 'base64url').toString('base64url') !== token) throw failure(400, 'Open the complete invitation link.');
  return createHash('sha256').update(token).digest('hex');
}

class BetaAccounts {
  constructor({ pool, origin } = {}) {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password || typeof pool?.query !== 'function' || typeof pool?.connect !== 'function') throw new Error('Beta accounts require an explicit HTTPS origin and database pool.');
    this.pool = pool;
    this.origin = origin;
    this.lookups = {
      findUserByUsername: async name => (await pool.query('SELECT id, username, password_hash, session_version FROM users WHERE username = $1', [name])).rows[0],
      findUserById: async id => Number.isSafeInteger(id) && id > 0 ? (await pool.query('SELECT id, username, password_hash, session_version FROM users WHERE id = $1', [id])).rows[0] : undefined,
      verifyPassword: (entered, hash) => bcrypt.compare(entered, hash)
    };
  }
  get users() { return this.lookups; }
  async version(actor) {
    const id = accountId(actor);
    if (id === null) return null;
    const row = (await this.pool.query('SELECT id, session_version FROM users WHERE id = $1', [id])).rows[0];
    return row?.id === id && Number.isSafeInteger(row.session_version) && row.session_version >= 0 ? row.session_version : null;
  }
  async active(actor, sessionVersion) {
    return Number.isSafeInteger(sessionVersion) && sessionVersion >= 0 && await this.version(actor) === sessionVersion;
  }
  async admin(client, actor) {
    const id = accountId(actor);
    if (id === null) throw failure(403, 'Access denied');
    const row = (await client.query('SELECT id, is_admin FROM users WHERE id = $1', [id])).rows[0];
    if (row?.id !== id || row.is_admin !== true) throw failure(403, 'Access denied');
  }
  async summary(actor) {
    await this.admin(this.pool, actor);
    const rows = (await this.pool.query('SELECT username FROM users ORDER BY username')).rows;
    return { admin: true, accounts: rows.map(row => ({ username: row.username })), accountCount: rows.length };
  }
  async transaction(work) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Serialise capacity checks and competing redemptions across app instances.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('mywords-beta-accounts'))");
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') throw failure(409, 'That username is already in use. Choose another username.');
      throw error;
    } finally { client.release(); }
  }
  async invite(actor, options = {}) {
    // Canonical identity is checked before connecting; privileges are rechecked
    // against current database state inside the transaction.
    if (accountId(actor) === null) throw failure(403, 'Access denied');
    const name = options.username == null || options.username === '' ? null : username(options.username);
    const recovery = options.recoveryFor != null && options.recoveryFor !== '';
    const target = recovery ? username(options.recoveryFor) : null;
    if (recovery && name !== null && name !== target) throw failure(400, 'Recovery must keep the existing username.');
    return this.transaction(async client => {
      await this.admin(client, actor);
      let account = null;
      if (recovery) {
        account = (await client.query('SELECT id, username FROM users WHERE username = $1 FOR UPDATE', [target])).rows[0];
        if (!account) throw failure(404, 'Account not found.');
      } else {
        const count = (await client.query('SELECT count(*)::int AS count FROM users')).rows[0].count;
        const pending = (await client.query('SELECT count(*)::int AS count FROM beta_invitations WHERE account_id IS NULL AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP')).rows[0].count;
        if (count + pending >= maxAccounts) throw failure(409, 'The invited beta is full.');
        if (name !== null && (await client.query('SELECT id FROM users WHERE username = $1', [name])).rows.length) throw failure(409, 'That username is already in use. Choose another username.');
      }
      const raw = randomBytes(32).toString('base64url'), digest = tokenDigest(raw);
      const expiresAt = new Date(Date.now() + invitationHours * 60 * 60 * 1000).toISOString();
      await client.query('INSERT INTO beta_invitations(digest, username, account_id, is_admin, expires_at) VALUES($1,$2,$3,$4,$5)', [digest, account?.username || name, account?.id || null, false, expiresAt]);
      return { url: this.origin + '/join.html#token=' + raw, expiresAt, username: account?.username || name, recovery };
    });
  }
  async register({ username: entered, password } = {}) {
    const name = username(entered);
    const bytes = typeof password === 'string' ? Buffer.byteLength(password, 'utf8') : 0;
    if (bytes < 12 || bytes > 72) throw failure(400, 'Choose a password with 12 to 72 bytes.');
    const hash = await bcrypt.hash(password, 12);
    return this.transaction(async client => {
      const count = (await client.query('SELECT count(*)::int AS count FROM users')).rows[0].count;
      const pending = (await client.query('SELECT count(*)::int AS count FROM beta_invitations WHERE account_id IS NULL AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP')).rows[0].count;
      if (count + pending >= maxAccounts) throw failure(409, 'The beta is full. All 12 places are taken or reserved.');
      const reserved = (await client.query('SELECT digest FROM beta_invitations WHERE username = $1 AND account_id IS NULL AND used_at IS NULL AND expires_at > CURRENT_TIMESTAMP LIMIT 1', [name])).rows.length;
      if (reserved) throw failure(409, 'That username is already in use or reserved. Choose another username.');
      const account = (await client.query('INSERT INTO users(username, password_hash, is_admin) VALUES($1,$2,$3) RETURNING id, username, session_version', [name, hash, false])).rows[0];
      const workspace = randomUUID();
      const book = await initialBook(String(account.id), workspace);
      book.members = { [String(account.id)]: 'manager' };
      await client.query('INSERT INTO next_workspaces(id, owner_id, state) VALUES($1,$2,$3::jsonb)', [workspace, account.id, JSON.stringify(book)]);
      return { actor: String(account.id), username: account.username, workspace, sessionVersion: account.session_version };
    });
  }
  async activate({ token, username: entered, password } = {}) {
    const digest = tokenDigest(token), name = username(entered);
    const bytes = typeof password === 'string' ? Buffer.byteLength(password, 'utf8') : 0;
    if (bytes < 12 || bytes > 72) throw failure(400, 'Choose a password with 12 to 72 bytes.');
    const hash = await bcrypt.hash(password, 12);
    return this.transaction(async client => {
      const invitation = (await client.query('SELECT digest, username, account_id, is_admin, expires_at, used_at FROM beta_invitations WHERE digest = $1 FOR UPDATE', [digest])).rows[0];
      if (!invitation || invitation.used_at !== null || !Number.isFinite(new Date(invitation.expires_at).getTime()) || new Date(invitation.expires_at).getTime() <= Date.now()) throw failure(410, 'This link has expired or has already been used. Ask for a new link.');
      if (invitation.username !== null && invitation.username !== name) throw failure(400, 'Use the username assigned to this link.');
      let account, workspace;
      if (invitation.account_id !== null) {
        account = (await client.query('SELECT id, username, session_version FROM users WHERE id = $1 FOR UPDATE', [invitation.account_id])).rows[0];
        if (!account || account.username !== name) throw failure(410, 'This link is no longer available. Ask for a new link.');
        const owned = (await client.query("SELECT id, owner_id, state->>'owner' AS owner FROM next_workspaces WHERE owner_id = $1 LIMIT 2", [account.id])).rows;
        if (owned.length !== 1 || owned[0].owner_id !== account.id || owned[0].owner !== String(account.id)) throw failure(403, 'Access denied');
        workspace = owned[0].id;
        account = (await client.query('UPDATE users SET password_hash = $2, session_version = session_version + 1 WHERE id = $1 RETURNING id, username, session_version', [account.id, hash])).rows[0];
        await client.query("DELETE FROM user_sessions WHERE sess->>'actor' = $1", [String(account.id)]);
      } else {
        const count = (await client.query('SELECT count(*)::int AS count FROM users')).rows[0].count;
        if (count >= maxAccounts) throw failure(409, 'The invited beta is full.');
        account = (await client.query('INSERT INTO users(username, password_hash, is_admin) VALUES($1,$2,$3) RETURNING id, username, session_version', [name, hash, invitation.is_admin === true])).rows[0];
        workspace = randomUUID();
        const book = await initialBook(String(account.id), workspace);
        book.members = { [String(account.id)]: 'manager' };
        await client.query('INSERT INTO next_workspaces(id, owner_id, state) VALUES($1,$2,$3::jsonb)', [workspace, account.id, JSON.stringify(book)]);
      }
      const used = await client.query('UPDATE beta_invitations SET used_at = CURRENT_TIMESTAMP WHERE digest = $1 AND used_at IS NULL', [digest]);
      if (used.rowCount !== 1) throw failure(410, 'This link has already been used. Ask for a new link.');
      // The transaction's advisory lock serialises recovery issuance/redemption;
      // a successful reset must also retire every earlier link for this account.
      if (invitation.account_id !== null) await client.query('UPDATE beta_invitations SET used_at = CURRENT_TIMESTAMP WHERE account_id = $1 AND used_at IS NULL', [account.id]);
      return { actor: String(account.id), username: account.username, workspace, sessionVersion: account.session_version };
    });
  }
}

module.exports = { BetaAccounts };
