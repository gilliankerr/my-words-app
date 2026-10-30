const fs = require('node:fs'), path = require('node:path'), https = require('node:https');
const { randomBytes, createHash, randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { chromium, expect: browserExpect } = require('@playwright/test');
const { validateDatabaseTarget, verifyDatabaseTarget } = require('../harness/database');
const { loopbackTLS } = require('../harness/loopback-tls');
const { createBetaApp } = require('../../../server/next/beta-preview');
const { accountJourney } = require('../harness/account-journey');
const run = process.env.NEXT_TEST_DATABASE_URL ? describe : describe.skip;
run('REAL invited beta HTTP/browser on disposable PostgreSQL', () => {
  const schema = 'next_beta_http_' + randomUUID().replaceAll('-', '');
  const token = randomBytes(32).toString('base64url'), password = 'fictional-http-beta-password';
  let pool, admin, server, store, browser, ownerContext, origin, app, owner, second, made = false;
  const config = { project: 'fictional', environment: 'fictional', service: 'fictional', secret: 'fictional-http-beta-session-secret-at-least-32' };
  async function post(context, route, body) {
    const session = await (await context.request.get(origin + '/api/session')).json();
    return context.request.post(origin + route, { headers: { origin, 'x-next-csrf': session.csrf }, data: body });
  }
  beforeAll(async () => {
    const connectionString = validateDatabaseTarget(process.env); admin = new Pool({ connectionString }); await verifyDatabaseTarget(admin);
    await admin.query('CREATE SCHEMA "' + schema + '"'); made = true;
    pool = new Pool({ connectionString, options: '-c search_path=' + schema }); await verifyDatabaseTarget(pool);
    await pool.query('CREATE TABLE users(id serial PRIMARY KEY,username text UNIQUE NOT NULL,password_hash text NOT NULL,is_admin boolean NOT NULL DEFAULT false,session_version integer NOT NULL DEFAULT 0)');
    await pool.query('CREATE TABLE beta_invitations(digest text PRIMARY KEY,username text,account_id integer REFERENCES users(id),is_admin boolean NOT NULL DEFAULT false,expires_at timestamptz NOT NULL,used_at timestamptz)');
    await pool.query('CREATE TABLE user_sessions(sid varchar PRIMARY KEY,sess json NOT NULL,expire timestamp(6) NOT NULL)');
    await pool.query('CREATE TABLE beta_generation_usage(day date,account_id integer,calls integer,PRIMARY KEY(day,account_id))');
    await pool.query(fs.readFileSync(path.join(__dirname, '../../../server/next/schema.sql'), 'utf8'));
    await pool.query('CREATE UNIQUE INDEX beta_http_owner ON next_workspaces(owner_id)');
    await pool.query("INSERT INTO beta_invitations(digest,is_admin,expires_at) VALUES($1,true,now()+interval '1 day')", [createHash('sha256').update(token).digest('hex')]);
    server = https.createServer(loopbackTLS(), (req, res) => app(req, res));
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    origin = config.origin = 'https://127.0.0.1:' + server.address().port;
    const assembly = createBetaApp({ pool, config }); app = assembly.app; store = assembly.sessionStore;
    browser = await chromium.launch({ args: ['--ignore-certificate-errors'] });
    ownerContext = await browser.newContext({ ignoreHTTPSErrors: true });
  }, 30000);
  afterAll(async () => {
    await browser?.close(); if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    store?.close(); if (pool) await pool.end();
    if (admin) { try { if (made) { await verifyDatabaseTarget(admin); await admin.query('DROP SCHEMA "' + schema + '" CASCADE'); } } finally { await admin.end(); } }
  });
  test('actual join page creates the organiser, who can invite a separate account', async () => {
    const page = await ownerContext.newPage(); page.setDefaultTimeout(5000); await page.goto(origin + '/join.html#token=' + token);
    await browserExpect(page).toHaveURL(origin + '/join.html?access=private-link');
    await page.getByLabel('Username', { exact: true }).fill('organiser');
    await page.getByLabel('New password', { exact: true }).fill(password);
    await page.getByLabel('Confirm password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Set password', exact: true }).click();
    await browserExpect(page.locator('#beta-status')).toContainText('ready');
    // Follow the user's actual sign-in form; an APIRequestContext login alone
    // did not establish the rendered browser session in this loopback harness.
    await page.getByRole('link', { name: 'Sign in', exact: true }).click();
    await page.getByLabel('Username', { exact: true }).fill('organiser');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByRole('link', { name: 'Invite someone', exact: true }).click();
    owner = await (await ownerContext.request.get(origin + '/api/session')).json();
    await page.getByText('Choose their username (optional)', { exact: true }).click();
    await page.getByLabel('Username (optional)', { exact: true }).fill('practice-two');
    await page.getByRole('button', { name: 'Create invitation link', exact: true }).click();
    await browserExpect(page.locator('#private-link')).not.toHaveValue('');
    const raw = new URLSearchParams(new URL(await page.locator('#private-link').inputValue()).hash.slice(1)).get('token');
    const other = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      expect((await post(other, '/api/activate', { token: raw, username: 'practice-two', password })).status()).toBe(200);
      const used = await post(other, '/api/activate', { token: raw, username: 'practice-two', password });
      expect(used.status()).toBe(410); expect((await used.json()).error).toMatch(/expired|already been used/);
      const result = await post(other, '/api/sign-in', { name: 'practice-two', password }); expect(result.status()).toBe(200); second = await result.json();
      expect((await other.request.get(origin + '/api/beta')).status()).toBe(403);
      expect((await other.request.get(origin + '/api/workspaces/' + owner.workspace)).status()).toBe(403);
      expect((await post(other, '/api/workspaces/' + owner.workspace + '/restore', {})).status()).toBe(403);
    } finally { await other.close(); }
  }, 20000);
  test('real beta accounts keep saves, offline drafts and exports separate', async () => {
    await accountJourney(browser, { origin, accounts: [{ id: Number(owner.actor), username: 'organiser', password, workspace: owner.workspace }, { id: Number(second.actor), username: 'practice-two', password, workspace: second.workspace }] });
  }, 45000);

  test('the bare join page creates a private account that can sign in and cannot open other content', async () => {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      const page = await context.newPage(); page.setDefaultTimeout(6000);
      await page.goto(origin + '/join.html');
      await page.getByLabel('Username', { exact: true }).fill('self-reader');
      await page.getByLabel('New password', { exact: true }).fill(password);
      await browserExpect(page.getByLabel('Confirm password', { exact: true })).toBeHidden();
      await page.getByRole('button', { name: 'Create account', exact: true }).click();
      await browserExpect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
      const ownSession = await (await context.request.get(origin + '/api/session')).json();
      expect(await page.evaluate(() => sessionStorage.getItem('mywords-join-session'))).toBeNull();
      expect(ownSession.workspace).not.toBe(owner.workspace);
      expect(ownSession.workspace).not.toBe(second.workspace);
      const saved = await (await context.request.get(origin + '/api/workspaces/' + ownSession.workspace)).json();
      expect(saved.records).toEqual({});
      expect(saved.owner).toBe(ownSession.actor);
      expect((await context.request.get(origin + '/api/workspaces/' + owner.workspace)).status()).toBe(403);
      expect((await post(context, '/api/workspaces/' + second.workspace + '/restore', {})).status()).toBe(403);
      expect((await context.request.get(origin + '/api/beta')).status()).toBe(403);
      expect((await post(context, '/api/register', { username: 'another-reader', password })).status()).toBe(409);
      // A different account remembered on this device must still require a
      // deliberate sign-in, preserving the new account's complete local copy.
      const beforeLocal = await page.evaluate(async current => {
        const local = await new NextLocalStore().open();
        try { return (await local.read(current.actor, current.workspace)).snapshot; }
        finally { local.db.close(); }
      }, ownSession);
      // A signup intended for another account must not fall back to an older
      // remembered account if the server session changes before navigation.
      await page.evaluate(other => sessionStorage.setItem('mywords-join-session', JSON.stringify({ actor: other.actor, workspace: other.workspace })), owner);
      await page.reload();
      await browserExpect(page.getByLabel('Username', { exact: true })).toBeVisible();
      await browserExpect(page.getByRole('heading', { name: 'Home', exact: true })).toHaveCount(0);
      await page.evaluate(async other => {
        const local = await new NextLocalStore().open();
        try { await local.identity({ actor: other.actor, workspace: other.workspace, device: 'fictional-other-device' }); }
        finally { local.db.close(); }
      }, owner);
      await page.reload();
      await browserExpect(page.getByLabel('Username', { exact: true })).toBeVisible();
      await browserExpect(page.getByRole('heading', { name: 'Home', exact: true })).toHaveCount(0);
      await page.reload();
      await browserExpect(page.getByLabel('Username', { exact: true })).toBeVisible();
      await browserExpect(page.getByRole('heading', { name: 'Home', exact: true })).toHaveCount(0);
      expect(await page.evaluate(async current => {
        const local = await new NextLocalStore().open();
        try { return { identity: await local.identity(), snapshot: (await local.read(current.actor, current.workspace)).snapshot }; }
        finally { local.db.close(); }
      }, ownSession)).toEqual({ identity: null, snapshot: beforeLocal });
    } finally { await context.close(); }
  }, 20000);
  test('organiser recovery invalidates old sessions and retains the whole workspace', async () => {
    const before = await (await ownerContext.request.get(origin + '/api/workspaces/' + owner.workspace)).json();
    const link = await (await post(ownerContext, '/api/beta/invitations', { recoveryFor: 'organiser' })).json();
    const raw = new URLSearchParams(new URL(link.url).hash.slice(1)).get('token');
    const recovering = await browser.newContext({ ignoreHTTPSErrors: true });
    try {
      expect((await post(recovering, '/api/activate', { token: raw, username: 'organiser', password: password + '-new' })).status()).toBe(200);
      expect((await ownerContext.request.get(origin + '/api/workspaces/' + owner.workspace)).status()).toBe(401);
      expect((await post(recovering, '/api/sign-in', { name: 'organiser', password: password + '-new' })).status()).toBe(200);
      expect(await (await recovering.request.get(origin + '/api/workspaces/' + owner.workspace)).json()).toEqual(before);
    } finally { await recovering.close(); }
  }, 15000);
});
