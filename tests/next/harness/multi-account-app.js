const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { randomUUID } = require('node:crypto');
const bcrypt = require('bcrypt');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { createApp } = require('../../../server/next/app');
const { MultiAccountAdapter } = require('../../../server/next/multi-account-adapter');
const { initialBook } = require('../../../server/next/private-local');
const { MemoryRepository } = require('./memory-repository');
const { RevisionRepository } = require('../../../server/next/revision-repository');
const { validateDatabaseTarget, verifyDatabaseTarget } = require('./database');
const { loopbackTLS } = require('./loopback-tls');
async function openMultiAccount({ database = false, synthetic = false } = {}) {
  const schema = 'next_browser_' + randomUUID().replaceAll('-', '');
  const accounts = [101, 102].map(id => ({ id, username: 'household-' + id, password: 'fictional-browser-password-' + id, workspace: (synthetic ? 'synthetic-' : 'browser-') + id }));
  const users = await Promise.all(accounts.map(async account => ({ id: account.id, username: account.username, password_hash: await bcrypt.hash(account.password, 4) })));
  const books = await Promise.all(accounts.map(account => initialBook(String(account.id), account.workspace)));
  for (const book of books) book.members = { [book.owner]: 'manager' };
  let pool, admin, repository, sessionStore, server, app, created = false;
  const close = async () => {
    try { if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }
    finally {
      sessionStore?.close?.(); if (pool) await pool.end();
      if (admin) { try { if (created) { await verifyDatabaseTarget(admin); await admin.query('DROP SCHEMA "' + schema + '" CASCADE'); } } finally { await admin.end(); } }
    }
  };
  try {
    if (database) {
      const { Pool } = require('pg'); const connectionString = validateDatabaseTarget(process.env);
      admin = new Pool({ connectionString }); await verifyDatabaseTarget(admin);
      await admin.query('CREATE SCHEMA "' + schema + '"'); created = true;
      pool = new Pool({ connectionString, options: '-c search_path=' + schema }); await verifyDatabaseTarget(pool);
      await pool.query('CREATE TABLE users(id integer PRIMARY KEY,username text UNIQUE NOT NULL,password_hash text NOT NULL)');
      await pool.query('CREATE TABLE user_sessions(sid varchar PRIMARY KEY,sess json NOT NULL,expire timestamp(6) NOT NULL)');
      await pool.query(fs.readFileSync(path.join(__dirname, '../../../server/next/schema.sql'), 'utf8'));
      for (const user of users) await pool.query('INSERT INTO users VALUES($1,$2,$3)', [user.id, user.username, user.password_hash]);
      for (const book of books) await pool.query('INSERT INTO next_workspaces VALUES($1,$2,$3::jsonb)', [book.id, Number(book.owner), JSON.stringify(book)]);
      repository = new RevisionRepository(pool); sessionStore = new PgSession({ pool, tableName: 'user_sessions', createTableIfMissing: false });
    } else { repository = new MemoryRepository(Object.fromEntries(books.map(book => [book.id, book]))); sessionStore = new session.MemoryStore(); }
    const lookup = database ? pool : { query: async (sql, [id]) => ({ rows: books.filter(book => Number(book.owner) === id).map(book => ({ id: book.id, owner_id: id, owner: book.owner })) }) };
    const authentication = new MultiAccountAdapter({ pool: lookup, users: {
      findUserByUsername: async name => database ? (await pool.query('SELECT * FROM users WHERE username=$1', [name])).rows[0] : users.find(user => user.username === name),
      findUserById: async id => database ? (await pool.query('SELECT * FROM users WHERE id=$1', [id])).rows[0] : users.find(user => user.id === id),
      verifyPassword: (password, hash) => bcrypt.compare(password, hash)
    } });
    server = https.createServer(loopbackTLS(), (req, res) => app(req, res));
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = 'https://127.0.0.1:' + server.address().port;
    app = createApp({ repository, authentication, mode: 'multi-account', sessionStore, sessionSecret: 'fictional-browser-session-secret-at-least-32', productionOrigin: origin, trustProxy: 0 });
    return { origin, accounts, close, pool, repository };
  } catch (error) { await close(); throw error; }
}
module.exports = { openMultiAccount };
