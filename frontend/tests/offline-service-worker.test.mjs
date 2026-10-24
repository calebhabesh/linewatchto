import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
const source=readFileSync(new URL('../public/sw.js',import.meta.url),'utf8');
function worker(fetcher, entries=new Map(), build="local") {
 const listeners=new Map(), writes=[];
 const cache={match:async key=>entries.get(typeof key==='string'?key:key.url)?.clone(),addAll:async()=>{},put:async(key,response)=>{writes.push(key);entries.set(key,response)}};
 const context={URL,Response,Request,AbortSignal,Promise,fetch:fetcher,caches:{match:cache.match,open:async()=>cache},self:{location:new URL(`https://linewatch.test/sw.js?build=${build}`),addEventListener:(name,fn)=>listeners.set(name,fn)}};
 const methods=runInNewContext(source+';({networkFirstNavigation,networkFirstStatic,cacheOfflineDashboard,cachedLaunchNavigation,APP_SHELL_CACHE,STATIC_CACHE,LAUNCH_SHELL_KEY})',context);
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
 assert.equal(before.STATIC_CACHE,after.STATIC_CACHE);
});
test('HTTP failures on static assets can use the installed icon fallback',async()=>{
 const w=worker(async()=>new Response('',{status:503}),new Map([['/assets/linewatch/line-4-legend.svg',new Response('icon')]]));
 assert.equal(await(await w.networkFirstStatic(new Request('https://linewatch.test/assets/linewatch/line-4-legend.svg?v=3'))).text(),'icon');
});

const html=(body,init={})=>new Response(body,{...init,headers:{'content-type':'text/html',...init.headers}});
function launchEvent(path='/'){ const pending=[]; return {event:{request:new Request('https://linewatch.test'+path),waitUntil:p=>pending.push(p)},pending}; }
test('installed-app launches paint the cached start page and refresh it in the background',async()=>{
 let release; const network=new Promise(r=>{release=r});
 const w=worker(()=>network,new Map([['/__linewatch/launch-shell',html('cached start')]]));
 const {event,pending}=launchEvent();
 assert.equal(await(await w.cachedLaunchNavigation(event)).text(),'cached start');
 release(html('fresh start')); await Promise.all(pending);
 assert.deepEqual(w.writes,[w.LAUNCH_SHELL_KEY]);
 assert.equal(await w.entries.get(w.LAUNCH_SHELL_KEY).text(),'fresh start');
});
test('the first launch uses the network and keeps only cacheable start pages',async()=>{
 const w=worker(async()=>html('network start'));
 const {event,pending}=launchEvent();
 assert.equal(await(await w.cachedLaunchNavigation(event)).text(),'network start'); await Promise.all(pending);
 assert.deepEqual(w.writes,[w.LAUNCH_SHELL_KEY]);
 const redirected=html('login'); Object.defineProperty(redirected,'redirected',{value:true});
 for(const response of [html('',{status:500}),new Response('{}',{headers:{'content-type':'application/json'}}),redirected]){
  const rejected=worker(async()=>response,new Map([['/offline',new Response('public shell')]]));
  const launch=launchEvent(); await rejected.cachedLaunchNavigation(launch.event); await Promise.all(launch.pending);
  assert.equal(rejected.writes.length,0);
 }
});
test('offline launches prefer the cached start page over the generic bootstrap',async()=>{
 const w=worker(async()=>{throw Error('offline')},new Map([['/__linewatch/launch-shell',html('cached start')],['/offline',new Response('public shell')]]));
 assert.equal(await(await w.networkFirstNavigation(new Request('https://linewatch.test/'))).text(),'cached start');
 const empty=worker(async()=>{throw Error('offline')},new Map([['/offline',new Response('public shell')]]));
 const {event,pending}=launchEvent();
 assert.equal(await(await empty.cachedLaunchNavigation(event)).text(),'public shell'); await Promise.allSettled(pending);
});
test('deep links and other pages never use or replace the cached start page',async()=>{
 for(const path of ['/?impact=line-1','/?token=secret','/account']){
  const w=worker(async()=>html('network '+path),new Map([['/__linewatch/launch-shell',html('cached start')]]));
  const listeners=w.listeners; const original=listeners.get('fetch');
  let result; original({request:{url:'https://linewatch.test'+path,method:'GET',mode:'navigate'},respondWith:p=>{result=p},waitUntil:()=>{}});
  assert.equal(await(await result).text(),'network '+path); assert.equal(w.writes.length,0);
 }
});
test('preference changes refresh the cached start page with current cookies',async()=>{
 const requests=[]; const w=worker(async(url,init)=>{requests.push([url,init]);return html('new prefs')});
 const pending=[]; w.listeners.get('message')({data:{type:'linewatch-refresh-launch-shell'},waitUntil:p=>pending.push(p)});
 await Promise.all(pending);
 assert.equal(requests[0][0],'/'); assert.equal(requests[0][1].credentials,'same-origin');
 assert.deepEqual(w.writes,[w.LAUNCH_SHELL_KEY]);
});
test('launch shell refreshes acknowledge the requesting page after storing the start page',async()=>{
 const w=worker(async()=>html('new build'));
 const acks=[]; const pending=[];
 w.listeners.get('message')({data:{type:'linewatch-refresh-launch-shell'},ports:[{postMessage:message=>acks.push(JSON.stringify([message,w.writes]))}],waitUntil:p=>pending.push(p)});
 await Promise.all(pending);
 assert.deepEqual(acks,[JSON.stringify([{type:'linewatch-refresh-launch-shell-ack'},[w.LAUNCH_SHELL_KEY]])]);
});
