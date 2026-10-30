'use strict';
// Explicit invited-beta assembly. Imports do not connect or mutate any database.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { MultiAccountAdapter } = require('./multi-account-adapter');
const { createApp } = require('./app');
function validateConfig(env) {
  for (const key of ['PROJECT', 'ENVIRONMENT', 'SERVICE']) if (!env['BETA_' + key + '_ID'] || env['BETA_' + key + '_ID'] !== env['OPERATOR_' + key + '_ID']) throw new Error('Select the explicit operator project, environment and service.');
  let origin; try { origin = new URL(env.BETA_ORIGIN); } catch {}
  if (!origin || origin.protocol !== 'https:' || origin.origin !== env.BETA_ORIGIN || origin.username || origin.password || env.NEXT_TEST_DATABASE_URL) throw new Error('Use the explicit HTTPS origin and isolated environment.');
  let url; try { url = new URL(env.DATABASE_URL); } catch {}
  if (!url || !['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || !url.password || url.search || url.hash || url.pathname.length < 2) throw new Error('An explicit dedicated beta database is required.');
  if (typeof env.BETA_SESSION_SECRET !== 'string' || env.BETA_SESSION_SECRET.length < 32 || !/^[A-Za-z0-9_-]{43}$/.test(env.BETA_OWNER_INVITE || '') || Buffer.from(env.BETA_OWNER_INVITE, 'base64url').toString('base64url') !== env.BETA_OWNER_INVITE) throw new Error('Separate beta session and one-time owner invitation secrets are required.');
  return { project: env.BETA_PROJECT_ID, environment: env.BETA_ENVIRONMENT_ID, service: env.BETA_SERVICE_ID, origin: env.BETA_ORIGIN, secret: env.BETA_SESSION_SECRET, ownerDigest: createHash('sha256').update(env.BETA_OWNER_INVITE).digest('hex') };
}
async function verifyDatabase(queryable, config) {
  const row = (await queryable.query('SELECT project,environment,service,version FROM beta_installation WHERE id=1')).rows[0];
  if (!row || row.project !== config.project || row.environment !== config.environment || row.service !== config.service || row.version !== 1) throw new Error('Beta database identity mismatch.');
  await queryable.query('SELECT 1 FROM user_sessions LIMIT 1');
  await queryable.query('SELECT 1 FROM next_workspaces LIMIT 1');
}
async function prepareDatabase(pool, config) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock(971337107)');
    const tables = (await client.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') AND schemaname NOT LIKE 'pg_%'")).rows;
    if (tables.some(t => t.schemaname === 'public' && t.tablename === 'beta_installation')) await verifyDatabase(client, config);
    else {
      if (tables.length) throw new Error('Refusing a populated unmarked beta database.');
      await client.query('CREATE TABLE users(id serial PRIMARY KEY,username text UNIQUE NOT NULL,password_hash text NOT NULL,is_admin boolean NOT NULL DEFAULT false,session_version integer NOT NULL DEFAULT 0)');
      await client.query('CREATE TABLE user_sessions(sid varchar PRIMARY KEY,sess json NOT NULL,expire timestamp(6) NOT NULL)');
      await client.query('CREATE INDEX beta_session_expiry ON user_sessions(expire)');
      const schema = (await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8')).replace(/^BEGIN;\r?$/m, '').replace(/^COMMIT;\r?$/m, '');
      await client.query(schema); await client.query('CREATE UNIQUE INDEX beta_one_owned_workspace ON next_workspaces(owner_id)');
      await client.query('CREATE TABLE beta_invitations(digest text PRIMARY KEY,username text,account_id integer REFERENCES users(id),is_admin boolean NOT NULL DEFAULT false,expires_at timestamptz NOT NULL,used_at timestamptz)');
      await client.query('CREATE TABLE beta_installation(id integer PRIMARY KEY CHECK(id=1),project text NOT NULL,environment text NOT NULL,service text NOT NULL,version integer NOT NULL)');
      await client.query('CREATE TABLE beta_generation_usage(day date NOT NULL,account_id integer NOT NULL,calls integer NOT NULL,PRIMARY KEY(day,account_id))');
      await client.query("INSERT INTO beta_invitations(digest,is_admin,expires_at) VALUES($1,true,now()+interval '7 days')", [config.ownerDigest]);
      await client.query('INSERT INTO beta_installation VALUES(1,$1,$2,$3,1)', [config.project, config.environment, config.service]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
function quota(pool) {
  return async actor => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN'); await client.query('SELECT pg_advisory_xact_lock(971337108)');
      const total = (await client.query('SELECT COALESCE(sum(calls),0)::int AS calls FROM beta_generation_usage WHERE day=current_date')).rows[0].calls;
      const own = (await client.query('SELECT calls FROM beta_generation_usage WHERE day=current_date AND account_id=$1', [Number(actor)])).rows[0]?.calls || 0;
      if (total >= 50 || own >= 10) { const error = new Error('Today’s beta generation allowance is used. Your saved words remain available.'); error.status = 429; throw error; }
      await client.query('INSERT INTO beta_generation_usage VALUES(current_date,$1,1) ON CONFLICT(day,account_id) DO UPDATE SET calls=beta_generation_usage.calls+1', [Number(actor)]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  };
}
function createBetaApp({ pool, config, generationClient }) {
  const { BetaAccounts } = require('./beta-accounts');
  const { OwnedRevisionRepository } = require('./owned-revision-repository');
  const access = new BetaAccounts({ pool, origin: config.origin });
  access.reserveGeneration = quota(pool);
  const authentication = new MultiAccountAdapter({ pool, users: access.users });
  authentication.verify = async (name, password) => {
    if (typeof name !== 'string' || name.length > 254 || typeof password !== 'string' || Buffer.byteLength(password) > 72) return null;
    const user = await access.users.findUserByUsername(name.trim().toLowerCase());
    const valid = await access.users.verifyPassword(password, user?.password_hash || authentication.dummyHash);
    return valid && Number.isSafeInteger(user?.id) ? { actor: String(user.id), version: user.session_version } : null;
  };
  authentication.active = access.active.bind(access); authentication.version = access.version.bind(access);
  const sessionStore = new PgSession({ pool, tableName: 'user_sessions', createTableIfMissing: false });
  const app = createApp({ repository: new OwnedRevisionRepository(pool), mode: 'multi-account', authentication, sessionStore, sessionSecret: config.secret, productionOrigin: config.origin, trustProxy: 1, readiness: () => verifyDatabase(pool, config), accountAccess: access,
    ...(generationClient ? { quickWords: new (require('./quick-words-service').QuickWordsService)({ client: generationClient }), situations: new (require('./situation-service').SituationService)({ client: generationClient }) } : {}) });
  return { app, sessionStore };
}
async function start(env = process.env) {
  const config = validateConfig(env), { Pool } = require('pg');
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 6, options: '-c search_path=public' });
  let sessionStore;
  try {
    await prepareDatabase(pool, config);
    const generationClient = env.OPENROUTER_API_KEY ? new (require('openai'))({ apiKey: env.OPENROUTER_API_KEY, baseURL: 'https://openrouter.ai/api/v1' }) : undefined;
    const assembly = createBetaApp({ pool, config, generationClient }); sessionStore = assembly.sessionStore;
    const server = assembly.app.listen(Number(env.PORT || 8080), '0.0.0.0');
    const close = () => { server.closeIdleConnections(); server.close(async () => { sessionStore.close(); await pool.end(); }); };
    process.once('SIGTERM', close); process.once('SIGINT', close);
    return { server, pool, close };
  } catch (error) { sessionStore?.close(); await pool.end(); throw error; }
}
if (require.main === module) start().catch(() => { process.stderr.write('Invited beta startup refused; check staging identity/database configuration.\n'); process.exitCode = 1; });
module.exports = { validateConfig, prepareDatabase, createBetaApp, quota };
