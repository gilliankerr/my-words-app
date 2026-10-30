const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const M = require('../../../app-next/js/model');
const { makeFixtures } = require('../fixtures');

// A transaction transport double only; browser regressions use real IndexedDB.
function harness() {
  const context = { NextModel: M, crypto: webcrypto, location: { origin: 'https://synthetic.invalid' }, IDBKeyRange: { bound: (lower, upper) => ({ lower, upper }) } };
  vm.createContext(context);
  for (const name of ['local-store', 'sync']) vm.runInContext(fs.readFileSync('app-next/js/' + name + '.js', 'utf8'), context);
  const scopes = new Map();
  const store = new context.NextLocalStore();
  store.transact = (_, __, work) => new Promise((resolve, reject) => {
    let pending = 0, value, failed = false;
    const finish = () => queueMicrotask(() => { if (!pending && !failed) resolve(value); });
    const request = fn => {
      const req = {}; pending++;
      queueMicrotask(() => {
        if (failed) return;
        try { req.onsuccess?.({ target: { result: fn() } }); } catch (e) { failed = true; reject(e); }
        pending--; finish();
      });
      return req;
    };
    const os = {
      get: key => request(() => scopes.has(key) ? M.clone(scopes.get(key)) : undefined),
      put: (v, key) => scopes.set(key, M.clone(v)), delete: key => scopes.delete(key),
      openCursor: range => {
        const keys = [...scopes.keys()].filter(key => key >= range.lower && key <= range.upper).sort();
        const req = {}; let index = 0;
        const advance = () => {
          const next = request(() => {
            const key = keys[index++];
            return key === undefined ? null : { key, value: M.clone(scopes.get(key)), delete: () => scopes.delete(key), update: v => scopes.set(key, M.clone(v)), continue: advance };
          });
          next.onsuccess = e => req.onsuccess?.(e);
        };
        advance(); return req;
      }
    };
    try { work(os, v => { value = v; }, e => { failed = true; reject(e); }); finish(); } catch (e) { failed = true; reject(e); }
  });
  const snapshot = M.exportPackage(makeFixtures().workspaces.demo).workspace;
  const sync = repository => new context.NextSync(store, repository, 'owner', 'demo', 'synthetic-device');
  return { store, snapshot, sync };
}

test('a pre-removal download cannot recreate the removed local namespace', async () => {
  const h = harness();
  let release, started;
  const waiting = new Promise(resolve => { release = resolve; });
  const requested = new Promise(resolve => { started = resolve; });
  const pending = h.sync({ request: async path => {
    if (path.endsWith('/receipts')) return { success: true };
    started(); return waiting;
  } }).download();
  await requested; await h.store.remove('owner', 'demo', true);
  release(h.snapshot);
  await expect(pending).rejects.toThrow(/removed.*local|local.*removed/i);
  expect(await h.store.read('owner', 'demo')).toBeNull();
});

test('a deliberate new download after local removal is accepted without reviving an older one', async () => {
  const h = harness();
  await h.store.remove('owner', 'demo', true);
  await h.sync({ request: async path => path.endsWith('/receipts') ? { success: true } : h.snapshot }).download();
  expect((await h.store.read('owner', 'demo')).snapshot.owner).toBe('owner');
});

test('direct deliberate receive remains usable before and after explicit local removal', async () => {
  const h = harness();
  await h.store.receive('owner', h.snapshot);
  expect((await h.store.read('owner', 'demo')).snapshot.owner).toBe('owner');
  await h.store.remove('owner', 'demo', true);
  await h.store.receive('owner', h.snapshot);
  expect((await h.store.read('owner', 'demo')).snapshot.owner).toBe('owner');
});

test('a pre-removal restore notification cannot add held recovery to a fresh local copy', async () => {
  const h = harness(); await h.store.receive('owner', h.snapshot);
  const update = h.store.update;
  let release, started;
  const waiting = new Promise(resolve => { release = resolve; });
  const notified = new Promise(resolve => { started = resolve; });
  h.store.update = async function (...args) { started(); await waiting; return update.apply(this, args); };
  const incoming = { ...M.clone(h.snapshot), privateEpoch: 1 };
  const pending = h.sync({ request: async () => incoming }).download().catch(error => error.message);
  await notified; h.store.update = update;
  await h.store.remove('owner', 'demo', true); await h.store.receive('owner', h.snapshot);
  release(); await pending;
  const fresh = await h.store.read('owner', 'demo');
  expect(fresh.pendingRestoration).toBeUndefined();
  expect(fresh.restoreHold).toBeUndefined();
});

test('a delayed notebook sweep cannot change a fresh copy after removal between receive transactions', async () => {
  const h = harness(); await h.store.receive('owner', h.snapshot);
  const erase = h.store.eraseNotebooks;
  let release, started;
  const waiting = new Promise(resolve => { release = resolve; });
  const sweeping = new Promise(resolve => { started = resolve; });
  h.store.eraseNotebooks = async function (...args) { started(); await waiting; return erase.apply(this, args); };
  const incoming = { ...M.clone(h.snapshot), purgedNotebooks: { 'synthetic-removed-notebook': { revision: 1 } } };
  const pending = h.sync({ request: async path => path.endsWith('/receipts') ? { success: true } : incoming }).download().catch(error => error.message);
  await sweeping; h.store.eraseNotebooks = erase;
  await h.store.remove('owner', 'demo', true); await h.store.receive('owner', h.snapshot);
  release(); await pending;
  expect((await h.store.read('owner', 'demo')).snapshot.purgedNotebooks).toBeUndefined();
});
