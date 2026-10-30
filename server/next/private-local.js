// Private loopback persistence. No application DB, fixture accounts or private static files.
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, randomBytes, scryptSync, timingSafeEqual, createHash } = require('node:crypto');
const vm = require('node:vm');
const M = require('../../app-next/js/model');
const root = path.resolve(__dirname, '../..');
function validatePrivateDirectory(directory) {
  if (!path.isAbsolute(directory)) throw new Error('Private storage requires an absolute directory.');
  const resolved = path.resolve(directory), relative = path.relative(root, resolved);
  if (!relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('Private storage must stay outside the repository.');
  return resolved;
}
async function initialBook(actor, id) {
  const bytes = await fs.readFile(path.join(root, 'data/reference-library.json'));
  const master = JSON.parse(bytes), hash = createHash('sha256').update(bytes).digest('hex');
  // Use the existing generator's default Guide rather than another default source.
  const context = { window: {} };
  vm.runInNewContext(await fs.readFile(path.join(root, 'js/reference-library-pdf.js'), 'utf8'), context);
  const guide = M.clone(context.window.ReferenceLibraryPDF.prototype.getDefaultPartnerGuide());
  const content = { order: master.categories.map(c => c.id), hidden: {}, custom: {}, preferences: {}, routes: {}, links: {}, savedGroups: [], contacts: [], notes: [],
    notebook: { frontMatter: {}, content: {}, sections: [] }, rescue: ['Please give me time.', 'That is not what I mean.'], diagrams: [], guide };
  const edition = { id: randomUUID(), workspace: id, at: new Date().toISOString(), master: { version: master.version, hash }, revisions: {}, payloads: {}, content: M.clone(content) };
  return { id, owner: actor, name: 'Communication book', privateEpoch: 0, records: {}, content, master: edition.master, conflicts: [], receipts: {}, editions: { [edition.id]: edition }, edition,
    members: { [actor]: 'editor' }, operations: {} };
}
class PrivateLocalRepository {
  static async open(directory) {
    directory = validatePrivateDirectory(directory);
    await fs.mkdir(directory, { recursive: true });
    validatePrivateDirectory(await fs.realpath(directory));
    const repository = new PrivateLocalRepository(directory);
    try { repository.lock = await fs.open(path.join(directory, 'writer.lock'), 'wx', 0o600); }
    catch { throw new Error('Private storage is already open, or its writer lock needs review after an interrupted shutdown.'); }
    try {
      await repository.lock.writeFile(String(process.pid));
      try {
        repository.state = JSON.parse(await fs.readFile(repository.file, 'utf8'));
        M.insist(repository.state.version === 1 && M.object(repository.state.account), 'Invalid private storage');
        M.insist(/^[a-f0-9]{32}$/.test(repository.state.account.salt) && /^[a-f0-9]{64}$/.test(repository.state.account.hash), 'Invalid private sign-in');
        M.validateWorkspace(repository.state.workspace);
        M.insist(repository.state.workspace.owner === repository.state.account.actor && Object.keys(repository.state.workspace.members).length === 1 && repository.state.workspace.members[repository.state.account.actor] === 'editor', 'Invalid private ownership');
      } catch (e) { if (e.code !== 'ENOENT') throw e; repository.state = null; }
      return repository;
    } catch (e) { await repository.close(); throw e; }
  }
  constructor(directory) { this.directory = directory; this.file = path.join(directory, 'private-book.json'); this.queue = Promise.resolve(); }
  get configured() { return !!this.state; }
  get workspaceId() { return this.state?.workspace.id || null; }
  fingerprint() { return createHash('sha256').update(M.canonical(this.state.workspace)).digest('hex'); }
  enqueue(work) { const task = this.queue.then(work); this.queue = task.catch(() => {}); return task; }
  async persist(candidate) {
    // Preserve prior bytes externally before replacement; a failed write never promotes RAM state.
    if (this.state) {
      const recovery = path.join(this.directory, 'recovery'); await fs.mkdir(recovery, { recursive: true });
      const prior = await fs.readFile(this.file);
      const backup = await fs.open(path.join(recovery, `${Date.now()}-${randomUUID()}.json`), 'wx', 0o600);
      try { await backup.writeFile(prior); await backup.sync(); } finally { await backup.close(); }
    }
    const temporary = path.join(this.directory, `.pending-${randomUUID()}.json`);
    const handle = await fs.open(temporary, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(candidate)); await handle.sync(); } finally { await handle.close(); }
    try { await fs.rename(temporary, this.file); }
    catch (e) { await fs.unlink(temporary).catch(() => {}); throw e; }
    this.state = candidate;
  }
  setup(password) {
    return this.enqueue(async () => {
      M.insist(!this.configured, 'Private book is already configured.');
      M.insist(typeof password === 'string' && password.length >= 12 && password.length <= 200, 'Choose a password with 12 to 200 characters.');
      const actor = randomUUID(), salt = randomBytes(16), workspace = await initialBook(actor, randomUUID());
      await this.persist({ version: 1, account: { actor, salt: salt.toString('hex'), hash: scryptSync(password, salt, 32).toString('hex') }, workspace });
      return actor;
    });
  }
  async verify(name, password) {
    const account = this.state?.account;
    const hash = scryptSync(typeof password === 'string' ? password.slice(0, 200) : '', account ? Buffer.from(account.salt, 'hex') : Buffer.alloc(16), 32);
    return account && timingSafeEqual(hash, Buffer.from(account.hash, 'hex')) ? account.actor : null;
  }
  restore(actor, text, expected, confirmed, rebind = false) {
    return this.enqueue(async () => {
      if (!this.state || actor !== this.state.account.actor) { const error = new Error('Access denied'); error.status = 403; throw error; }
      M.insist(confirmed === true, 'Restore requires explicit confirmation.');
      if (expected !== this.fingerprint()) { const error = new Error('The saved book changed. Review the current book before restoring.'); error.status = 409; throw error; }
      const source = JSON.parse(text);
      const bytes = await fs.readFile(path.join(root, 'data/reference-library.json'));
      const master = JSON.parse(bytes), hash = createHash('sha256').update(bytes).digest('hex');
      const pkg = M.validatePackage(text, source.workspace?.id, source.workspace?.owner, master, hash);
      M.insist(!pkg.activeEdition || pkg.workspace.editions[pkg.activeEdition], 'Invalid adopted edition reference');
      const changesMapping = pkg.workspace.id !== this.workspaceId || pkg.workspace.owner !== actor;
      M.insist(!changesMapping || rebind === true, 'Owner/workspace mapping requires explicit authorisation.');
      const workspace = M.clone(pkg.workspace);
      workspace.id = this.workspaceId; workspace.owner = actor;
      workspace.privateEpoch = (this.state.workspace.privateEpoch || 0) + 1;
      for (const edition of Object.values(workspace.editions)) edition.workspace = this.workspaceId;
      workspace.edition = M.clone(workspace.editions[workspace.edition.id]);
      // Imported history/provenance stays attributable to its original authors; access is local.
      workspace.members = { [actor]: 'editor' }; workspace.operations = {};
      M.validateWorkspace(workspace);
      const recovery = path.join(this.directory, 'recovery'); await fs.mkdir(recovery, { recursive: true });
      const original = await fs.open(path.join(recovery, `${Date.now()}-${randomUUID()}-import.json`), 'wx', 0o600);
      try { await original.writeFile(text); await original.sync(); } finally { await original.close(); }
      await this.persist({ ...M.clone(this.state), workspace, restorations: [...(this.state.restorations || []), { at: new Date().toISOString(), sourceWorkspace: pkg.workspace.id, sourceOwner: pkg.workspace.owner, mapped: changesMapping }] });
      return { ...M.exportPackage(workspace), ...(pkg.activeEdition ? { activeEdition: pkg.activeEdition } : {}) };
    });
  }
  checkOperation(workspace, actor, operation) {
    if ((operation.privateEpoch ?? 0) !== (workspace.privateEpoch || 0)) {
      const error = new Error('The book was restored. Your waiting changes are retained. Export them and review the restored book before saving again.'); error.status = 409; throw error;
    }
  }
  transaction(id, work) {
    return this.enqueue(async () => {
      if (!this.state || id !== this.workspaceId) { const error = new Error('Access denied'); error.status = 403; throw error; }
      const candidate = M.clone(this.state), before = M.canonical(candidate.workspace);
      const result = await work(candidate.workspace);
      M.validateWorkspace(candidate.workspace);
      if (M.canonical(candidate.workspace) !== before) await this.persist(candidate);
      return M.clone(result);
    });
  }
  async close() {
    await this.queue;
    if (this.lock) { await this.lock.close(); this.lock = null; await fs.unlink(path.join(this.directory, 'writer.lock')); }
  }
}
module.exports = { PrivateLocalRepository, validatePrivateDirectory, initialBook };
