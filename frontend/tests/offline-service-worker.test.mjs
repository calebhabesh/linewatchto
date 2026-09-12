import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
const source=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
function worker(fetcher, entries=new Map(), build="local") {
 const listeners=new Map(), writes=[];
 const cache={match:async key=>entries.get(typeof key==='string'?key:key.url)?.clone(),addAll:async()=>{},put:async(key,response)=>{writes.push(key);entries.set(key,response)}};
 const context={URL,Response,Request,AbortSignal,Promise,fetch:fetcher,caches:{match:cache.match,open:async()=>cache},self:{location:new URL(`https://linewatch.test/sw.js?build=${build}`),addEventListener:(name,fn)=>listeners.set(name,fn)}};
 const methods=runInNewContext(source+';({networkFirstNavigation,networkFirstStatic,cacheOfflineDashboard,APP_SHELL_CACHE,STATIC_CACHE})',context);
 return {...methods,listeners,entries,writes,cache};
}
test('offline and 503 dashboard navigations use only the public bootstrap',async()=>{
 for(const fetcher of [async()=>{throw Error('offline')},async()=>new Response('',{status:503})]) {
  const w=worker(fetcher,new Map([['/offline',new Response('public shell')],['/offline.html',new Response('offline page')]]));
  assert.equal(await (await w.networkFirstNavigation(new Request('https://linewatch.test/'))).text(),'public shell');
  for(const path of ['/account','/?token=secret','/api/auth/me']) assert.equal(await(await w.networkFirstNavigation(new Request('https://linewatch.test'+path))).text(),'offline page');
  assert.equal(w.writes.length,0);
 }
});
test('successful and not-found pages are not replaced or persisted',async()=>{
 for(const status of [200,404]){ const w=worker(async()=>new Response('online',{status})); assert.equal((await w.networkFirstNavigation(new Request('https://linewatch.test/'))).status,status); assert.equal(w.writes.length,0); }
});
test('API reads remain network only even with an available cached response',async()=>{
 const w=worker(async()=>{throw Error('offline')},new Map([['/api/dashboard',new Response('old API')]]));
 let result; w.listeners.get('fetch')({request:{url:'https://linewatch.test/api/dashboard',method:'GET'},respondWith:p=>{result=p}});
 await assert.rejects(result,/offline/); assert.equal(w.writes.length,0);
});
test('uncached raster variants fall back to compact installed maps only offline',async()=>{
 const w=worker(async()=>{throw Error('offline')},new Map([['/assets/linewatch/raster-maps/regional-labels-dark-mobile.png',new Response('map')]]));
 assert.equal(await(await w.networkFirstStatic(new Request('https://linewatch.test/assets/linewatch/raster-maps/regional-labels-dark-balanced.png?v=release'))).text(),'map');
});
test('failed bootstrap dependencies prevent committing a partial shell',async()=>{
 const w=worker(async()=>new Response('<script src="/_next/static/chunk.js"></script>',{headers:{'content-type':'text/html'}}));
 w.cache.addAll=async()=>{throw Error('chunk unavailable')};
 await assert.rejects(w.cacheOfflineDashboard(w.cache),/chunk unavailable/); assert.equal(w.writes.length,0);
});
test('storage quota failures do not discard successful static responses',async()=>{
 const w=worker(async()=>new Response('asset')); w.cache.put=async()=>{throw Error('quota')};
 assert.equal(await(await w.networkFirstStatic(new Request('https://linewatch.test/assets/icon.svg'))).text(),'asset');
});

test('release builds install into separate cache namespaces', () => {
 const before=worker(async()=>new Response(''),new Map(),'release-a');
 const after=worker(async()=>new Response(''),new Map(),'release-b');
 assert.notEqual(before.APP_SHELL_CACHE,after.APP_SHELL_CACHE);
 assert.notEqual(before.STATIC_CACHE,after.STATIC_CACHE);
});
test('HTTP failures on static assets can use the installed icon fallback',async()=>{
 const w=worker(async()=>new Response('',{status:503}),new Map([['/assets/linewatch/line-4-legend.svg',new Response('icon')]]));
 assert.equal(await(await w.networkFirstStatic(new Request('https://linewatch.test/assets/linewatch/line-4-legend.svg?v=3'))).text(),'icon');
});
