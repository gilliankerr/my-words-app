(function (root) {
  'use strict';
  // Only public application files enter this cache. Owned content stays in IndexedDB.
  const STAGED = 'cn-next-staged-app-update';
  let active;
  function cancel() { active?.abort(); }
  function bounded(promise, signal) {
    return new Promise((resolve, reject) => {
      const abort = () => reject(new Error('Update interrupted'));
      if (signal.aborted) return abort();
      signal.addEventListener('abort', abort, { once: true });
      Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
  }
  function workerReady(worker, signal, readers = false) {
    if (!worker) return Promise.resolve(false);
    return bounded(new Promise(resolve => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => { channel.port1.close(); resolve(false); }, 250);
      channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); resolve(event.data?.type === 'MY_WORDS_UPDATE_READY' ? readers ? event.data.readers : event.data.cache : false); };
      worker.postMessage({ type: 'MY_WORDS_UPDATE_READY', readers }, [channel.port2]);
    }), signal);
  }
  async function pruneStaged(cache, signal) {
    const readers = await workerReady(navigator.serviceWorker.controller, signal, true);
    if (!Array.isArray(readers)) return; // Do not guess which other tabs still need a generation.
    const keys = await bounded(cache.keys(), signal);
    const pages = keys.filter(key => new URL(key.url).pathname === '/editor.html');
    const completed = pages.map(key => new URL(key.url).searchParams.get('update'));
    const keep = new Set([...completed.slice(-2), ...readers]);
    for (const key of pages) {
      const pendingAt = Number((await cache.match(key)).headers.get('X-My-Words-Pending-At'));
      if (pendingAt && Date.now() - pendingAt < 300000) keep.add(new URL(key.url).searchParams.get('update'));
    }
    for (const key of keys) {
      const token = new URL(key.url).searchParams.get('update');
      // In-flight generations have no published page yet; leave them alone.
      if (completed.includes(token) && !keep.has(token)) await bounded(cache.delete(key), signal);
    }
  }
  async function run(options) {
    if (active) return;
    const { button, status, isCurrent, flush } = options;
    if (!navigator.onLine) { status.textContent = 'Connect to the internet to update. Your saved words are still available.'; return; }
    const controller = active = new AbortController(), signal = controller.signal;
    const timer = setTimeout(() => controller.abort(), 30000);
    let stagingCache, stagingToken, navigated = false; const writes = [];
    const guard = () => { if (signal.aborted || !isCurrent()) throw new Error('Update interrupted'); };
    button.disabled = true;
    try {
      status.textContent = 'Saving unfinished work before updating…';
      await bounded(flush(), signal); guard();
      status.textContent = 'Loading the current app. Keep this page open…';
      const response = await fetch('/editor.html?fresh=1', { cache: 'no-store', signal }); guard();
      if (!response.ok) throw new Error('Current page unavailable');
      const document = new DOMParser().parseFromString(await response.text(), 'text/html');
      const elements = [...document.querySelectorAll('script[src], link[rel="stylesheet"]')];
      if (!document.getElementById('main') || !elements.some(e => new URL(e.src, location.origin).pathname === '/js/trial.js')) throw new Error('Invalid current page');
      const token = stagingToken = crypto.randomUUID(), navigation = '/editor.html?fresh=1&update=' + token;
      const resources = await Promise.all(elements.map(async element => {
        const attribute = element.tagName === 'SCRIPT' ? 'src' : 'href';
        const url = new URL(element.getAttribute(attribute), location.origin);
        if (url.origin !== location.origin || !/^\/(js|css|lib)\//.test(url.pathname) || !url.searchParams.has('fresh')) throw new Error('Invalid public file');
        url.searchParams.set('update', token); element.setAttribute(attribute, url.pathname + url.search);
        const file = await fetch(url, { cache: 'no-store', signal });
        if (!file.ok) throw new Error('Current file unavailable');
        // Consume the full response before navigation; a broken stream must fail here.
        const bytes = await file.arrayBuffer();
        const headers = new Headers(file.headers); headers.delete('content-length'); headers.delete('content-encoding');
        return [url.href, new Response(bytes, { headers })];
      })); guard();
      if (!('serviceWorker' in navigator)) throw new Error('Offline preparation unavailable');
      status.textContent = 'Current files loaded. Preparing offline use…';
      const workerResponse = await fetch('/sw.js?fresh=' + token, { cache: 'no-store', signal });
      if (!workerResponse.ok) throw new Error('Current offline files unavailable');
      const expectedCache = (await workerResponse.text()).match(/const CACHE = '(cn-next-public-shell-v\d+)'/)?.[1];
      if (!expectedCache) throw new Error('Invalid current offline version');
      const registration = await bounded(navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }), signal);
      await bounded(registration.update(), signal);
      while ((await workerReady(navigator.serviceWorker.controller, signal)) !== expectedCache) {
        guard(); await bounded(new Promise(resolve => setTimeout(resolve, 200)), signal);
      }
      guard();
      const cache = stagingCache = await bounded(caches.open(STAGED), signal);
      const put = async (url, file) => { const write = cache.put(url, file); writes.push(write); await bounded(write, signal); guard(); };
      for (const [url, file] of resources) await put(url, file);
      const headers = new Headers(response.headers); headers.delete('content-length'); headers.delete('content-encoding');
      headers.set('X-My-Words-Cache', expectedCache);
      // A published page may still be awaiting navigation in another tab.
      headers.set('X-My-Words-Pending-At', String(Date.now()));
      // Publish the navigation response last, after every script/style is durable.
      await put(navigation, new Response('<!doctype html>\n' + document.documentElement.outerHTML, { headers }));
      await pruneStaged(cache, signal);
      guard(); location.assign(navigation); navigated = true;
    } catch {
      if (isCurrent()) status.textContent = 'The app could not load the update. Your saved work is kept. Check your connection and try again.';
      // Remove only this failed attempt's temporary public files after writes settle.
      if (stagingCache && !navigated) Promise.allSettled(writes).then(async () => {
        for (const key of await stagingCache.keys()) if (new URL(key.url).searchParams.get('update') === stagingToken) await stagingCache.delete(key);
      }).catch(() => {});
    } finally {
      clearTimeout(timer); if (active === controller) active = null; button.disabled = false;
    }
  }
  async function loadedStatus(status) {
    if (!new URLSearchParams(location.search).has('update')) return;
    status.textContent = 'Current app loaded. Checking offline preparation…';
    try {
      const cache = await caches.open(STAGED), page = await cache.match(location.href);
      const ready = await workerReady(navigator.serviceWorker.controller, new AbortController().signal);
      if (!status.isConnected || status.textContent !== 'Current app loaded. Checking offline preparation…') return;
      if (page && ready === page.headers.get('X-My-Words-Cache')) {
        const headers = new Headers(page.headers); headers.delete('X-My-Words-Pending-At');
        await cache.put(location.href, new Response(await page.arrayBuffer(), { headers }));
        if (status.textContent === 'Current app loaded. Checking offline preparation…') status.textContent = 'Current app loaded. Saved work kept. Ready for offline use.';
      }
      else status.textContent = 'Current app loaded. Offline preparation has not been confirmed. Keep the app online.';
    } catch { status.textContent = 'Current app loaded. Offline preparation has not been confirmed. Keep the app online.'; }
  }
  root.NextAppUpdate = { run, cancel, loadedStatus };
})(globalThis);
