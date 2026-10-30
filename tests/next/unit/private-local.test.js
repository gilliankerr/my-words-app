const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { PrivateLocalRepository, validatePrivateDirectory } = require('../../../server/next/private-local');
const { WorkspaceService } = require('../../../server/next/workspace-service');
const M = require('../../../app-next/js/model');
const B = require('../../../app-next/js/book-records');

let directory, repository;
beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-private-fictional-')); repository = await PrivateLocalRepository.open(directory); });
afterEach(async () => { await repository?.close(); await fs.rm(directory, { recursive: true, force: true }); });
test('private storage refuses repository paths and a second writer', async () => {
  expect(() => validatePrivateDirectory(path.resolve('tmp/private'))).toThrow(/outside/);
  expect(() => validatePrivateDirectory('relative')).toThrow(/absolute/);
  await expect(PrivateLocalRepository.open(directory)).rejects.toThrow(/already open/);
});
test('one-time setup creates a generated owner and complete non-fictional book; restart preserves it', async () => {
  expect(repository.configured).toBe(false);
  await expect(repository.setup('short')).rejects.toThrow(/12/);
  const actor = await repository.setup('fictional-test-passphrase');
  expect(actor).not.toBe('owner');
  expect(await repository.verify('', 'owner-fictional-only')).toBe(null);
  expect(await repository.verify('', 'fictional-test-passphrase')).toBe(actor);
  await expect(repository.setup('another-test-passphrase')).rejects.toThrow(/already/);
  const service = new WorkspaceService(repository);
  const state = await service.read(repository.workspaceId, actor);
  M.validateWorkspace(state);
  expect(JSON.stringify(state)).not.toMatch(/Morgan|fictional|Élodie/);
  await expect(service.read(repository.workspaceId, 'alex')).rejects.toMatchObject({ status: 403 });
  const id = repository.workspaceId;
  await repository.close(); repository = await PrivateLocalRepository.open(directory);
  expect(repository.workspaceId).toBe(id);
  expect(await repository.verify('', 'fictional-test-passphrase')).toBe(actor);
  expect(await new WorkspaceService(repository).read(id, actor)).toEqual(state);
});
test('durable transactions retain unknown envelopes, retry identity and a restorable prior file', async () => {
  const actor = await repository.setup('fictional-test-passphrase'), id = repository.workspaceId;
  const service = new WorkspaceService(repository);
  const payload = { ...B.addition('page', 'personal', 'Fictional complete passage', randomUUID(), 'Personal page'), future: { value: ['preserve'] } };
  const operation = { recordId: payload.id, base: 0, payload, operation: randomUUID(), action: 'edit' };
  const accepted = await service.save(id, actor, operation);
  await repository.close(); repository = await PrivateLocalRepository.open(directory);
  const restarted = new WorkspaceService(repository);
  expect(await restarted.save(id, actor, operation)).toEqual(accepted);
  expect((await restarted.read(id, actor)).records[payload.id].revisions.at(-1).payload.future).toEqual(payload.future);
  const backups = await fs.readdir(path.join(directory, 'recovery'));
  expect(backups.length).toBeGreaterThan(0);
  expect(JSON.parse(await fs.readFile(path.join(directory, 'recovery', backups[0]), 'utf8')).version).toBe(1);
  const before = await fs.readFile(path.join(directory, 'private-book.json'), 'utf8');
  await expect(repository.transaction(id, w => { w.content.notes.push({ text: 'Must roll back' }); throw new Error('stop'); })).rejects.toThrow('stop');
  expect(await fs.readFile(path.join(directory, 'private-book.json'), 'utf8')).toBe(before);
});
test('corrupt existing bytes fail closed without creating an empty book', async () => {
  await repository.close();
  await fs.writeFile(path.join(directory, 'private-book.json'), '{broken');
  await expect(PrivateLocalRepository.open(directory)).rejects.toThrow();
  expect(await fs.readFile(path.join(directory, 'private-book.json'), 'utf8')).toBe('{broken');
});
test('confirmed restore is durable, guards concurrent changes, and explicitly recovers into fresh ownership', async () => {
  const actor = await repository.setup('fictional-test-passphrase'), id = repository.workspaceId;
  const service = new WorkspaceService(repository);
  const source = M.exportPackage(await service.read(id, actor));
  source.workspace.content.notes.push({ id: 'restored-note', text: 'Fictional restored note', future: { retain: true } });
  source.workspace.edition.content = M.clone(source.workspace.content); source.workspace.editions[source.workspace.edition.id] = M.clone(source.workspace.edition);
  const expected = repository.fingerprint();
  await expect(repository.restore(actor, JSON.stringify(source), expected, false)).rejects.toThrow(/confirm/);
  await repository.restore(actor, JSON.stringify(source), expected, true);
  await expect(repository.restore(actor, JSON.stringify(source), expected, true)).rejects.toMatchObject({ status: 409 });
  await repository.close(); repository = await PrivateLocalRepository.open(directory);
  expect((await new WorkspaceService(repository).read(id, actor)).content.notes[0].future).toEqual({ retain: true });
  const otherDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'cn-private-recovery-fictional-'));
  const fresh = await PrivateLocalRepository.open(otherDirectory);
  try {
    const newActor = await fresh.setup('another-fictional-passphrase');
    await expect(fresh.restore(newActor, JSON.stringify(source), fresh.fingerprint(), true, false)).rejects.toThrow(/mapping/);
    await fresh.restore(newActor, JSON.stringify(source), fresh.fingerprint(), true, true);
    const restored = await new WorkspaceService(fresh).read(fresh.workspaceId, newActor);
    expect(restored.owner).toBe(newActor); expect(restored.content).toEqual(source.workspace.content);
    expect(restored.edition.workspace).toBe(fresh.workspaceId);
    expect(fresh.state.restorations.at(-1).sourceOwner).toBe(actor);
    await expect(new WorkspaceService(fresh).read(fresh.workspaceId, actor)).rejects.toMatchObject({ status: 403 });
  } finally { await fresh.close(); await fs.rm(otherDirectory, { recursive: true, force: true }); }
});
