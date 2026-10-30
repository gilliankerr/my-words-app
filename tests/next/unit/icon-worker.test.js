const vm=require('node:vm'),fs=require('node:fs');
test('the linked Mulberry licence is readable from the public cache while unrelated files stay outside it', async () => {
  const events = {}, licence = { text: 'Creative Commons Attribution-ShareAlike 4.0' };
  const cache = { match: async path => path === '/assets/dictionary/MULBERRY-LICENSE.txt' ? licence : undefined };
  const network = jest.fn(async () => ({ network: true }));
  const context = { importScripts() {}, URL, NextDictionary: { assets: () => [] }, caches: { open: async () => cache }, fetch: network,
    self: { location: { origin: 'https://test.invalid' }, addEventListener: (name, fn) => { events[name] = fn; } } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../../../app-next/sw.js'), 'utf8'), context);
  const request = path => { let result; events.fetch({ request: { method: 'GET', url: 'https://test.invalid' + path }, respondWith: value => { result = value; } }); return result; };
  expect(await request('/assets/dictionary/MULBERRY-LICENSE.txt')).toBe(licence);
  expect(network).not.toHaveBeenCalled();
  expect(await request('/assets/dictionary/unlisted.txt')).toEqual({ network: true });
  expect(request('/api/workspaces/demo')).toBeUndefined();
  expect(request('/server/next/app.js')).toBeUndefined();
});
test('staged updates only serve explicit public files, never owned API responses', async () => {
  const events = {}, response = { staged: true }, match = jest.fn(async () => response);
  const context = { importScripts() {}, URL, caches: { open: async () => ({ match }) }, fetch: jest.fn(), self: { location: { origin: 'https://test.invalid' }, addEventListener: (name, fn) => { events[name] = fn; } } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../../../app-next/sw.js'), 'utf8'), context);
  const token = '12345678-1234-1234-1234-123456789abc';
  const request = path => { let result; events.fetch({ request: { method: 'GET', url: 'https://test.invalid' + path }, respondWith: value => { result = value; } }); return result; };
  expect(await request('/editor.html?fresh=1&update=' + token)).toBe(response);
  expect(await request('/js/trial.js?fresh=abc&update=' + token)).toBe(response);
  expect(request('/api/workspaces/demo?update=' + token)).toBeUndefined();
  expect(request('/server/next/app.js?update=' + token)).toBeUndefined();
  expect(match).toHaveBeenCalledTimes(2);
});

test('failed offline installation never activates an incomplete catalogue and reloads public HTTP caches', async () => {
  const events = {}, batches = [], skipWaiting = jest.fn();
  const context = { importScripts() {}, URL, Request: class { constructor(url, options) { this.url = url; this.cache = options.cache; } },
    NextDictionary: { assets: () => ['/assets/dictionary/manifest.json', '/assets/dictionary/fixture.png'] },
    fetch: jest.fn(async () => ({ ok: true, json: async () => ({}) })), caches: { match: async () => undefined, open: async () => ({ addAll: async batch => { batches.push(batch); throw new Error('Synthetic interrupted download'); } }) },
    self: { skipWaiting, location: { origin: 'https://test.invalid' }, addEventListener: (name, fn) => { events[name] = fn; } } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../../../app-next/sw.js'), 'utf8'), context);
  let installation; events.install({ waitUntil: task => { installation = task; } });
  await expect(installation).rejects.toThrow('Synthetic interrupted download');
  expect(skipWaiting).not.toHaveBeenCalled();
  expect(batches[0].every(request => request.cache === 'reload')).toBe(true);
});

test('returning worker reuses only hash-matching pictures and fetches changed artwork/code fresh', async () => {
  const { webcrypto } = require('node:crypto');
  const picture = new TextEncoder().encode('Synthetic verified artwork');
  const hash = Buffer.from(await webcrypto.subtle.digest('SHA-256', picture)).toString('hex');
  const events = {}, requests = [], put = jest.fn(async () => {}), skipWaiting = jest.fn();
  const index = { symbols: [{ asset: '/assets/dictionary/same.png', sha256: hash }, { asset: '/assets/dictionary/changed.png', sha256: 'f'.repeat(64) }] };
  const context = { importScripts() {}, URL, crypto: webcrypto, Request: class { constructor(url, options) { this.url = url; this.cache = options.cache; } },
    NextDictionary: { assets: () => index.symbols.map(s => s.asset) }, fetch: async () => ({ ok: true, json: async () => index }),
    caches: { match: async () => new Response(picture), open: async () => ({ put, addAll: async batch => { requests.push(...batch); } }) },
    self: { skipWaiting, location: { origin: 'https://test.invalid' }, addEventListener: (name, fn) => { events[name] = fn; } } };
  vm.runInNewContext(fs.readFileSync(require.resolve('../../../app-next/sw.js'), 'utf8'), context);
  let task; events.install({ waitUntil: value => { task = value; } }); await task;
  expect(put.mock.calls.map(call => call[0])).toEqual(['/assets/dictionary/same.png']);
  expect(requests.some(request => request.url === '/assets/dictionary/same.png')).toBe(false);
  expect(requests.some(request => request.url === '/assets/dictionary/changed.png' && request.cache === 'reload')).toBe(true);
  expect(requests.some(request => request.url === '/js/trial.js' && request.cache === 'reload')).toBe(true);
  expect(skipWaiting).toHaveBeenCalledTimes(1);
});
test('worker validates its catalogue once while keeping unlisted artwork outside cache serving',async()=>{
  const index=require('../../../app-next/assets/dictionary/manifest.json'),events={},json=jest.fn(async()=>index);
  const cache={match:jest.fn(async p=>p==='/assets/dictionary/manifest.json'?{json}:p===index.symbols[0].asset?{cached:true}:undefined)};
  const network=jest.fn(async()=>({network:true}));
  const context={importScripts(){},URL,NextDictionary:require('../../../app-next/js/dictionary'),caches:{open:async()=>cache},fetch:network,self:{location:{origin:'https://test.invalid'},addEventListener:(name,fn)=>events[name]=fn}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../../../app-next/sw.js'),'utf8'),context);
  function request(path){let result;events.fetch({request:{method:'GET',url:'https://test.invalid'+path},respondWith:p=>result=p});return result;}
  const responses=await Promise.all([request(index.symbols[0].asset),request(index.symbols[0].asset),request('/assets/dictionary/unlisted.png')]);
  expect(responses).toEqual([{cached:true},{cached:true},{network:true}]);expect(json).toHaveBeenCalledTimes(1);expect(network).toHaveBeenCalledTimes(1);
});
