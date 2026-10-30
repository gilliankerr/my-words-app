'use strict';

// Reuse the existing email lookup and password verifier. Inject the service so
// isolated tests never import the production database connection.
class AccountAdapter {
  constructor({ users, accountId, workspaceId, username }) {
    if (!users || !Number.isSafeInteger(accountId) || accountId < 1 || typeof workspaceId !== 'string' || !workspaceId.trim()) {
      throw new Error('Shared authentication requires an explicit account and workspace.');
    }
    this.users = users;
    this.accountId = accountId;
    this.workspaceId = workspaceId;
    this.actor = String(accountId);
    if (username !== undefined && ((typeof username !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(username)) || typeof users.findUserByUsername !== 'function')) throw new Error('Username authentication requires the explicit shared username and lookup.');
    this.username = username;
    this.dummyHash = require('bcrypt').hashSync(require('node:crypto').randomBytes(32).toString('hex'), 10);
  }
  async verify(name, password) {
    if (typeof name !== 'string' || name.length > 254 || typeof password !== 'string' || password.length > 200) return null;
    const login = name.trim().toLowerCase();
    const user = this.username ? (login === this.username ? await this.users.findUserByUsername(login) : null) : await this.users.findUserByEmail(login);
    const valid = await this.users.verifyPassword(password, user?.password_hash || this.dummyHash);
    return valid && user?.id === this.accountId ? this.actor : null;
  }
  async active(actor) {
    if (actor !== this.actor) return false;
    const user = await this.users.findUserById(this.accountId);
    return user?.id === this.accountId;
  }
}
module.exports = { AccountAdapter };
