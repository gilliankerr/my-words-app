'use strict';
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { AccountAdapter } = require('./account-adapter');
const { RevisionRepository } = require('./revision-repository');
const { createApp } = require('./app');
const { QuickWordsService } = require('./quick-words-service');
const { SituationService } = require('./situation-service');

// Explicit assembly only. Importing this module neither connects to a database
// nor runs migrations. The existing service's password verifier is reused.
function createSharedAccountApp({ pool, users, accountId, workspaceId, origin, secret, trustProxy, generationClient, username }) {
  if (!pool?.connect || !pool?.query) throw new Error('An explicitly selected PostgreSQL pool is required.');
  const authentication = new AccountAdapter({ users, accountId, workspaceId, username });
  const repository = new RevisionRepository(pool);
  const sessionStore = new PgSession({ pool, tableName: 'user_sessions', createTableIfMissing: false });
  const readiness = async () => {
    const result = await pool.query("SELECT state->>'owner' AS owner FROM next_workspaces WHERE id = $1", [workspaceId]);
    if (result.rows.length !== 1 || result.rows[0].owner !== String(accountId) || !await authentication.active(String(accountId))) throw new Error('Not ready');
    await pool.query('SELECT 1 FROM user_sessions LIMIT 1');
  };
  const app = createApp({ repository, mode: 'shared-account', authentication, sessionStore, productionOrigin: origin, sessionSecret: secret, trustProxy, readiness, quickWords: new QuickWordsService({ client: generationClient }), situations: new SituationService({ client: generationClient }) });
  return { app, sessionStore };
}
module.exports = { createSharedAccountApp };
