const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const path = require('node:path');
const fs = require('node:fs');
const { randomBytes, scryptSync, timingSafeEqual } = require('node:crypto');
const { WorkspaceService } = require('./workspace-service');
const root = path.resolve(__dirname, '../..');
const assets = new Map([
  ['/js/app-update.js', 'app-next/js/app-update.js'],
  ['/assets/app/my-words.svg', 'app-next/assets/app/my-words.svg'],
  ...[180, 192, 512].map(size => [`/assets/app/my-words-${size}.png`, `app-next/assets/app/my-words-${size}.png`]),
  ['/', 'app-next/index.html'], ['/index.html', 'app-next/index.html'], ['/editor.html', 'app-next/editor.html'],
  ['/privacy.html', 'app-next/privacy.html'], ['/js/privacy.js', 'app-next/js/privacy.js'], ['/licence.txt', 'LICENSE'],
  ['/assets/dictionary/MULBERRY-LICENSE.txt', 'app-next/assets/dictionary/MULBERRY-LICENSE.txt'],
  ['/js/boot.js', 'app-next/js/boot.js'], ['/js/home-collections.js', 'app-next/js/home-collections.js'],
  ['/css/trial.css', 'app-next/css/trial.css'], ['/js/model.js', 'app-next/js/model.js'], ['/js/local-store.js', 'app-next/js/local-store.js'],
  ['/js/repository.js', 'app-next/js/repository.js'], ['/js/sync.js', 'app-next/js/sync.js'], ['/js/trial.js', 'app-next/js/trial.js'], ['/js/print-adapter.js', 'app-next/js/print-adapter.js'],
  ['/js/book-records.js', 'app-next/js/book-records.js'], ['/js/book-editor.js', 'app-next/js/book-editor.js'],
  ['/js/notebooks.js', 'app-next/js/notebooks.js'],
  ['/js/shopping.js', 'app-next/js/shopping.js'],
  ['/js/symbol-catalogue.js', 'app-next/js/symbol-catalogue.js'], ['/js/dictionary-view.js', 'app-next/js/dictionary-view.js'], ['/js/dictionary-editor.js', 'app-next/js/dictionary-editor.js'],
  ['/js/expression.js', 'app-next/js/expression.js'], ['/js/word-groups.js', 'app-next/js/word-groups.js'], ['/js/dictionary.js', 'app-next/js/dictionary.js'], ['/js/discovery.js', 'app-next/js/discovery.js'],
  ['/css/expression.css', 'app-next/css/expression.css'], ['/css/word-groups.css', 'app-next/css/word-groups.css'], ['/css/dictionary.css', 'app-next/css/dictionary.css'],
  ['/sw.js', 'app-next/sw.js'], ['/manifest.webmanifest', 'app-next/manifest.webmanifest'], ['/master.json', 'data/reference-library.json'],
  ['/lib/jspdf.umd.min.js', 'js/lib/jspdf.umd.min.js'], ['/lib/reference-library-pdf.js', 'js/reference-library-pdf.js'], ['/lib/booklet-imposer.js', 'js/booklet-imposer.js']
]);
const dictionary = require('../../app-next/js/dictionary');
const dictionaryIndex = require('../../app-next/assets/dictionary/manifest.json');
for (const url of dictionary.assets(dictionaryIndex)) assets.set(url, 'app-next' + url);
function createApp({ repository, mode, sessionStore, authentication, privateOrigin, sessionSecret, productionOrigin, trustProxy, readiness, quickWords, situations, accountAccess }) {
  const multiAccount = mode === 'multi-account';
  const sharedAccount = mode === 'shared-account' || multiAccount;
  if (!['shared-account', 'multi-account', 'private-local', 'memory-test', 'isolated-postgres'].includes(mode)) throw new Error('Choose an explicit application mode.');
  if (sharedAccount) {
    let origin; try { origin = new URL(productionOrigin); } catch {}
    if (typeof authentication?.verify !== 'function' || typeof authentication?.active !== 'function' || (multiAccount ? typeof authentication.workspaceFor !== 'function' : !authentication.workspaceId) || !sessionStore || typeof sessionSecret !== 'string' || sessionSecret.length < 32 || !origin || origin.protocol !== 'https:' || origin.origin !== productionOrigin || !Number.isInteger(trustProxy) || trustProxy < 0 || trustProxy > 3) throw new Error('Account mode requires explicit authentication, sessions, workspace resolution, secret, HTTPS origin and proxy configuration.');
  } else sessionSecret ||= randomBytes(32).toString('hex');
  const privateLocal = mode === 'private-local';
  if (privateLocal && (!authentication || !/^http:\/\/127\.0\.0\.1:\d+$/.test(privateOrigin || ''))) throw new Error('Private mode requires authentication and a fixed loopback origin.');
  const app = express();
  const publicAssets = new Map(assets);
  const service = new WorkspaceService(repository);
  // Fixture credentials exist only in the two explicitly isolated test modes.
  const accounts = new Map((privateLocal || sharedAccount ? [] : ['owner', 'alex', 'robin', 'reader', 'outsider']).map(name => {
    const salt = randomBytes(16); return [name, { salt, hash: scryptSync(`${name}-fictional-only`, salt, 32) }];
  }));
  app.disable('x-powered-by');
  if (sharedAccount) app.set('trust proxy', trustProxy);
  if (privateLocal) app.use((req, res, next) => req.get('host') === new URL(privateOrigin).host ? next() : res.sendStatus(403));
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], workerSrc: ["'self'"], frameSrc: ["'self'", 'blob:'], objectSrc: ["'none'"], upgradeInsecureRequests: null } } }));
  // Backup text is JSON-encoded again in a restore request; allow escaping overhead.
  const ordinaryJson = express.json({ limit: '4mb', strict: true });
  const restoreJson = express.json({ limit: '140mb', strict: true });
  // Parse large shared backups only after session, CSRF and workspace ownership checks.
  // Match Express's case-insensitive, optional-trailing-slash route aliases too.
  app.use((req, res, next) => sharedAccount && /^\/api\/workspaces\/[^/]+\/restore\/?$/i.test(req.path) ? next() : (privateLocal ? restoreJson : ordinaryJson)(req, res, next));
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  const cookieName = sharedAccount ? 'cn_account_sid' : privateLocal ? 'cn_private_local_sid' : 'cn_next_synthetic_sid';
  app.use('/api', session({ name: cookieName, secret: sessionSecret, store: sessionStore, resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'strict', secure: sharedAccount, maxAge: (sharedAccount ? 30 * 24 : 4) * 60 * 60 * 1000 } }));
  const workspaceFor = actor => multiAccount ? authentication.workspaceFor(actor) : authentication.workspaceId;
  if (sharedAccount) app.use('/api', async (req, res, next) => {
    try {
      if (req.session.actor) {
        const active = await authentication.active(req.session.actor, req.session.accountVersion);
        req.accountWorkspace = active ? await workspaceFor(req.session.actor) : null;
        if (!req.accountWorkspace) {
          await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
          res.clearCookie(cookieName); return res.status(401).json({ error: 'Sign in to continue. Local work is retained.' });
        }
      }
      next();
    } catch (error) { next(error); }
  });
  const info = req => ({ actor: req.session.actor || null, csrf: req.session.csrf, mode, ...(sharedAccount ? { workspace: req.session.actor ? req.accountWorkspace : null } : {}), ...(privateLocal ? { setup: !authentication.configured, workspace: req.session.actor ? authentication.workspaceId : null } : {}) });
  app.get('/api/session', (req, res) => {
    req.session.csrf ||= randomBytes(24).toString('hex'); res.json(info(req));
  });
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD'].includes(req.method)) return next();
    const expected = productionOrigin || privateOrigin || `http://${req.headers.host}`;
    const token = req.get('x-next-csrf');
    if (req.get('origin') !== expected || !token || !req.session.csrf || token.length !== req.session.csrf.length || !timingSafeEqual(Buffer.from(token), Buffer.from(req.session.csrf))) return res.status(403).json({ error: 'Request denied' });
    next();
  });
  const failures = new Map();
  if (accountAccess) {
    for (const [url, file] of [['/join.html', 'join.html'], ['/beta.html', 'beta.html'], ['/js/beta-access.js', 'js/beta-access.js']]) publicAssets.set(url, 'app-next/' + file);
    const activations = new Map();
    const registrations = new Map();
    if (typeof accountAccess.register === 'function') app.post('/api/register', async (req, res) => {
      if (req.session.actor) return res.status(409).json({ error: 'You are already signed in. Open Home and sign out before creating another account.' });
      const now = Date.now(), recent = registrations.get(req.ip);
      const attempts = recent && now - recent.start < 3600000 ? recent : { start: now, count: 0 };
      if (attempts.count >= 20) return res.status(429).json({ error: 'Please wait before trying to register again.' });
      attempts.count++; registrations.set(req.ip, attempts);
      if (registrations.size > 1000) for (const [key, entry] of registrations) if (now - entry.start >= 3600000) registrations.delete(key);
      const result = await accountAccess.register(req.body);
      res.json({ success: true, username: result.username });
    });
    app.post('/api/activate', async (req, res) => {
      const now = Date.now(), recent = activations.get(req.ip);
      const attempts = recent && now - recent.start < 3600000 ? recent : { start: now, count: 0 };
      if (attempts.count >= 10) return res.status(429).json({ error: 'Please wait before trying this invitation again.' });
      attempts.count++; activations.set(req.ip, attempts);
      if (activations.size > 1000) for (const [key, entry] of activations) if (now - entry.start >= 3600000) activations.delete(key);
      const result = await accountAccess.activate(req.body); res.json({ success: true, username: result.username });
    });
    app.get('/api/beta', async (req, res) => res.json(await accountAccess.summary(req.session.actor)));
    app.post('/api/beta/invitations', async (req, res) => { const result = await accountAccess.invite(req.session.actor, req.body); res.json({ ...result, kind: result.recovery ? 'recovery' : 'invitation' }); });
  }
  async function establish(req, res, actor, verifiedVersion) {
    if (sharedAccount) {
      req.accountWorkspace = await workspaceFor(actor);
      if (!req.accountWorkspace) return res.status(401).json({ error: 'Sign-in details not recognised.' });
    }
    const version = authentication?.version ? await authentication.version(actor) : undefined;
    if (verifiedVersion !== undefined && verifiedVersion !== version) return res.status(401).json({ error: 'Sign-in details changed. Sign in again.' });
    await new Promise((resolve, reject) => req.session.regenerate(e => e ? reject(e) : resolve()));
    req.session.actor = actor; req.session.csrf = randomBytes(24).toString('hex');
    if (version !== undefined) req.session.accountVersion = version;
    res.json(info(req));
  }
  app.post('/api/setup', async (req, res, next) => {
    if (!privateLocal) return res.sendStatus(404);
    if (authentication.configured) return res.status(409).json({ error: 'Private book is already configured.' });
    if (typeof req.body.password !== 'string' || req.body.password.length < 12 || req.body.password.length > 200) return res.status(400).json({ error: 'Choose a password with 12 to 200 characters.' });
    try { await establish(req, res, await authentication.setup(req.body.password)); } catch (e) { next(e); }
  });
  app.post('/api/sign-in', async (req, res, next) => {
    try {
      const key = req.ip;
      const recent = (failures.get(key) || []).filter(t => Date.now() - t < 60000);
      if (recent.length >= 20) return res.status(429).json({ error: 'Please wait before signing in again.' });
      const password = typeof req.body.password === 'string' && req.body.password.length <= 200 ? req.body.password : '';
      let actor, verifiedVersion;
      if (privateLocal || sharedAccount) {
        const verified = await authentication.verify(req.body.name, password);
        if (verified && typeof verified === 'object') { actor = verified.actor; verifiedVersion = verified.version; }
        else actor = verified;
      }
      else {
        const account = accounts.get(req.body.name);
        const calculated = scryptSync(password, account?.salt || Buffer.alloc(16), 32);
        actor = account && timingSafeEqual(calculated, account.hash) ? req.body.name : null;
      }
      if (!actor) { failures.set(key, [...recent, Date.now()]); return res.status(401).json({ error: 'Sign-in details not recognised.' }); }
      await establish(req, res, actor, verifiedVersion);
    } catch (e) { next(e); }
  });
  app.post('/api/sign-out', (req, res, next) => req.session.destroy(error => {
    if (error) return next(error);
    res.clearCookie(cookieName); res.json({ success: true });
  }));
  app.get('/api/private-state', (req, res) => {
    if (!privateLocal) return res.sendStatus(404);
    if (req.session.actor !== authentication.state?.account.actor || !req.session.actor) return res.status(403).json({ error: 'Access denied' });
    res.json({ fingerprint: authentication.fingerprint(), savedAt: authentication.state.workspace.edition.at });
  });
  app.post('/api/restore-private-book', async (req, res, next) => {
    if (!privateLocal) return res.sendStatus(404);
    if (!req.session.actor) return res.status(401).json({ error: 'Sign in to restore this book' });
    try {
      if (typeof req.body.text !== 'string' || Buffer.byteLength(req.body.text) > require('../../app-next/js/model').MAX_PACKAGE_BYTES || req.body.confirmed !== true) return res.status(400).json({ error: 'Select a valid backup and confirm restoration.' });
      res.json(await authentication.restore(req.session.actor, req.body.text, req.body.expected, req.body.confirmed, req.body.rebind === true));
    } catch (e) { next(e); }
  });
  app.use('/api/workspaces', (req, res, next) => req.session.actor ? next() : res.status(401).json({ error: 'Sign in to send changes' }));
  if (repository.runAs) app.use('/api/workspaces', (req, res, next) => repository.runAs(req.session.actor, next));
  if (sharedAccount) app.use('/api/workspaces/:id', (req, res, next) => req.params.id === req.accountWorkspace ? next() : res.status(403).json({ error: 'Access denied' }));
  app.get('/api/workspaces/:id', async (req, res) => res.json(await service.read(req.params.id, req.session.actor)));
  app.get('/api/workspaces/:id/restore-preview', async (req, res) => {
    if (!sharedAccount) return res.sendStatus(404);
    res.json(await service.restorePreview(req.params.id, req.session.actor));
  });
  app.post('/api/workspaces/:id/restore', restoreJson, async (req, res) => {
    if (!sharedAccount) return res.sendStatus(404);
    res.json(await service.restoreShared(req.params.id, req.session.actor, req.body));
  });
  const generationCounts = new Map();
  app.post('/api/workspaces/:id/quick-words', async (req, res, next) => {
    try {
      await service.read(req.params.id, req.session.actor);
      if (!quickWords?.generate) return res.status(503).json({ error: 'New words are unavailable. Your entry and earlier words are kept.' });
      if (accountAccess?.reserveGeneration) await accountAccess.reserveGeneration(req.session.actor);
      const key = req.session.actor;
      const now = Date.now(), prior = generationCounts.get(key);
      const current = prior && now - prior.start < 3600000 ? prior : { start: now, count: 0, busy: false };
      if (current.busy || current.count >= 60) return res.status(429).json({ error: 'Please wait before getting more words. Your earlier words are kept.' });
      current.count++; current.busy = true; generationCounts.set(key, current);
      try { res.json(await quickWords.generate(req.body)); }
      catch (error) { res.status(error.status === 400 ? 400 : 503).json({ error: error.status === 400 ? 'Enter a topic and valid selected clues.' : 'Words could not be generated. Your entry and earlier words are kept. Try again.' }); }
      finally { current.busy = false; }
    } catch (error) { next(error); }
  });
  app.post('/api/workspaces/:id/situation-generation', async (req, res, next) => {
    try {
      await service.read(req.params.id, req.session.actor);
      if (!situations || !['detect', 'generate'].includes(req.body.action)) return res.status(503).json({ error: 'Notebook generation is unavailable. Your situation is kept.' });
      if (accountAccess?.reserveGeneration) await accountAccess.reserveGeneration(req.session.actor);
      const key = 'situation:' + req.session.actor, now = Date.now(), prior = generationCounts.get(key);
      const current = prior && now - prior.start < 3600000 ? prior : { start: now, count: 0, busy: false };
      if (current.busy || current.count >= 40) return res.status(429).json({ error: 'Please wait before creating another notebook. Your situation is kept.' });
      current.count++; current.busy = true; generationCounts.set(key, current);
      try { res.json(await situations[req.body.action](req.body)); }
      catch (error) { res.status(error.status === 400 ? 400 : 503).json({ error: error.status === 400 ? 'Check the situation and confirm any named detail.' : 'Notebook could not be generated. Your situation and earlier results are kept. Try again.' }); }
      finally { current.busy = false; }
    } catch (error) { next(error); }
  });
  app.post('/api/workspaces/:id/operations', async (req, res) => res.json(await service.save(req.params.id, req.session.actor, req.body)));
  app.post('/api/workspaces/:id/delete-notebooks', async (req, res) => res.json(await service.purgeNotebooks(req.params.id, req.session.actor, req.body)));
  app.post('/api/workspaces/:id/receipts', async (req, res) => res.json(await service.receipt(req.params.id, req.session.actor, req.body.device, req.body.edition, req.body.adopt === true)));
  app.post('/api/workspaces/:id/grants', async (req, res) => privateLocal || sharedAccount ? res.sendStatus(404) : res.json(await service.grant(req.params.id, req.session.actor, req.body.target, req.body.role)));
  // Public mode only; no account, workspace, credentials or personal values in the shell cache.
  if (sharedAccount && readiness) app.get('/health/ready', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { await readiness(); res.json({ ready: true }); } catch { res.status(503).json({ ready: false }); }
  });
  app.get('/js/runtime-config.js', (req, res) => res.type('application/javascript').send(`globalThis.NextRuntime = ${JSON.stringify({ privateLocal, sharedAccount, ...(accountAccess ? { invitedBeta: true } : {}), ...(multiAccount ? { multiAccount: true } : {}), ...(sharedAccount && !multiAccount && authentication.username ? { username: authentication.username } : {}) })};`));
  app.use((req, res, next) => {
    const file = publicAssets.get(req.path);
    if (!file || !['GET', 'HEAD'].includes(req.method)) return res.sendStatus(404);
    if (req.query.fresh === '1' && ['/', '/index.html', '/editor.html'].includes(req.path)) {
      // The existing worker bypasses URLs with a query. Fetch current public
      // code without clearing IndexedDB, drafts, sessions or cached reading data.
      const token = randomBytes(16).toString('hex');
      const html = fs.readFileSync(path.join(root, file), 'utf8').replace(/(src|href)="(\/(?:js|css|lib)\/[^"?]+)"/g, `$1="$2?fresh=${token}"`);
      return res.set('Cache-Control', 'no-store').type('html').send(html);
    }
    if (req.query.fresh !== undefined) res.set('Cache-Control', 'no-store');
    else if (req.path === '/sw.js') res.set('Cache-Control', 'no-cache');
    if (req.path === '/licence.txt') res.type('text/plain; charset=utf-8');
    res.sendFile(path.join(root, file), error => error && next(error));
  });
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({ error: [400, 409, 410, 429].includes(err.status) ? err.message : err.status === 403 ? 'Access denied' : 'Unable to complete request. Your local work is retained.' });
  });
  return app;
}
module.exports = { createApp, assets };
