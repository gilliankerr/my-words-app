function validateDatabaseTarget(env) {
  if (env.DATABASE_URL) throw new Error('Reject inherited application DATABASE_URL');
  if (!env.NEXT_TEST_DATABASE_URL) throw new Error('An explicit disposable target is required');
  const url = new URL(env.NEXT_TEST_DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Target must be loopback PostgreSQL');
  if (!/^\/cn_next_disposable_[a-z0-9_]+$/.test(url.pathname)) throw new Error('Disposable database-name marker missing');
  if (url.search || url.hash) throw new Error('Connection overrides are forbidden');
  if (!url.username || !url.password) throw new Error('Explicit separate test credentials are required; no PG credential fallback');
  return env.NEXT_TEST_DATABASE_URL;
}
async function verifyDatabaseTarget(pool, env = process.env) {
  const connectionString = validateDatabaseTarget(env);
  const actual = (await pool.query('SELECT current_database() AS name, host(inet_server_addr()) AS host, rolsuper AS superuser, rolbypassrls AS bypassrls FROM pg_roles WHERE rolname = current_user')).rows[0];
  if (!actual || actual.name !== new URL(connectionString).pathname.slice(1) || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(actual.host) || actual.superuser !== false || actual.bypassrls !== false) throw new Error('Unexpected disposable target or privileged test role');
  return actual;
}
module.exports = { validateDatabaseTarget, verifyDatabaseTarget };
