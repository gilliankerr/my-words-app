importScripts('/js/symbol-catalogue.js', '/js/dictionary.js');
const CACHE = 'cn-next-public-shell-v88';
const STAGED = 'cn-next-staged-app-update';
let pictureAssets;
function allowedPictures(cache) {
  if (!pictureAssets) pictureAssets = (async () => {
    const manifest = await cache.match('/assets/dictionary/manifest.json');
    if (!manifest) { pictureAssets = undefined; return new Set(); }
    return new Set(NextDictionary.assets(await manifest.json()));
  })().catch(error => { pictureAssets = undefined; throw error; });
  return pictureAssets;
}
const PUBLIC = ["/privacy.html", "/js/privacy.js", "/licence.txt", '/assets/dictionary/MULBERRY-LICENSE.txt', '/js/home-collections.js', '/js/app-update.js', '/js/boot.js', '/assets/app/my-words.svg', '/assets/app/my-words-180.png', '/assets/app/my-words-192.png', '/assets/app/my-words-512.png', '/', '/index.html', '/editor.html', '/css/trial.css', '/css/expression.css', '/css/word-groups.css', '/css/dictionary.css', '/js/runtime-config.js', '/js/model.js', '/js/book-records.js', '/js/book-editor.js', '/js/shopping.js', '/js/local-store.js', '/js/repository.js', '/js/sync.js', '/js/expression.js', '/js/word-groups.js', '/js/symbol-catalogue.js', '/js/dictionary-view.js', '/js/dictionary-editor.js', '/js/dictionary.js', '/js/discovery.js', '/js/notebooks.js', '/js/trial.js', '/js/print-adapter.js', '/manifest.webmanifest', '/master.json', '/lib/jspdf.umd.min.js', '/lib/reference-library-pdf.js', '/lib/booklet-imposer.js'];
self.addEventListener('install', event => event.waitUntil((async () => {
  const response = await fetch('/assets/dictionary/manifest.json', { cache: 'no-store' }); if (!response.ok) throw new Error('Public picture manifest unavailable');
  const index = await response.json(), cache = await caches.open(CACHE);
  const assets = [...PUBLIC, ...NextDictionary.assets(index)];
  const hashes = new Map((index.symbols || []).map(symbol => [symbol.asset, symbol.sha256]));
  // Activate only after the complete catalogue succeeds, using bounded batches.
  for (let start = 0; start < assets.length; start += 32) {
    const network = [];
    await Promise.all(assets.slice(start, start + 32).map(async url => {
      if (/^[a-f0-9]{64}$/.test(hashes.get(url) || '')) {
        try {
          const previous = await caches.match(url);
          if (previous?.ok) {
            const digest = await crypto.subtle.digest('SHA-256', await previous.clone().arrayBuffer());
            const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
            if (hash === hashes.get(url)) { await cache.put(url, previous); return; }
          }
        } catch { /* A missing/corrupt old picture falls back to the current public file. */ }
      }
      network.push(new Request(url, { cache: 'reload' }));
    }));
    if (network.length) await cache.addAll(network);
  }
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  if (event.data?.type === 'MY_WORDS_UPDATE_READY') event.waitUntil((async () => {
    const readers = event.data.readers ? (await self.clients.matchAll({ includeUncontrolled: true })).map(client => new URL(client.url).searchParams.get('update')).filter(Boolean) : undefined;
    event.ports[0]?.postMessage({ type: 'MY_WORDS_UPDATE_READY', cache: CACHE, ...(readers ? { readers } : {}) });
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method === 'GET' && url.origin === self.location.origin && /^[a-f0-9-]{36}$/.test(url.searchParams.get('update') || '') && (PUBLIC.includes(url.pathname) || url.pathname === '/js/app-update.js')) {
    event.respondWith((async () => (await (await caches.open(STAGED)).match(event.request)) || fetch(event.request))()); return;
  }
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.search || (!PUBLIC.includes(url.pathname) && !url.pathname.startsWith('/assets/dictionary/'))) return;
  event.respondWith((async () => { const cache = await caches.open(CACHE);
    if (!PUBLIC.includes(url.pathname) && !(await allowedPictures(cache)).has(url.pathname)) return fetch(event.request);
    return await cache.match(url.pathname) || fetch(event.request);
  })());
});
