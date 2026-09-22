import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
 MAP_VIEWPORT_MAX_AGE_MS,
 readMapViewport,
 saveMapViewport,
 mapViewportKey,
 readGeographicMapViewport,
 saveGeographicMapViewport,
} from '../src/app/map-viewport-preference.ts';
const memory = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key,value), removeItem: key => data.delete(key) }; };
test('viewport round trips independently by network and preserves map center across screen sizes', () => {
 const storage=memory();const camera={x:-100,y:-200,scale:2};
 saveMapViewport(storage,'ttc',camera,{width:400,height:800},1);
 assert.deepEqual(readMapViewport(storage,'ttc',{width:400,height:800},1),camera);
 assert.equal(readMapViewport(storage,'regional',{width:400,height:800},1),null);
 assert.deepEqual(readMapViewport(storage,'ttc',{width:600,height:900},.5),{x:150,y:150,scale:1});
});
test('invalid storage is ignored and zoom respects camera limits',()=>{
 const now=1_700_000_000_000;
 const storage=memory();for(const value of ['{','null','{}','{"version":2,"centerX":0,"centerY":0,"zoom":2}','{"version":2,"centerX":"0","centerY":0,"zoom":2,"savedAt":1700000000000}']) {
 storage.setItem(mapViewportKey('ttc'),value);assert.equal(readMapViewport(storage,'ttc',{width:400,height:800},1,now),null);
 }
 storage.setItem(mapViewportKey('ttc'),JSON.stringify({version:2,centerX:0,centerY:0,zoom:50,savedAt:now}));
 assert.equal(readMapViewport(storage,'ttc',{width:400,height:800},1,now).scale,8);
 const blocked={getItem(){throw Error();},setItem(){throw Error();}};
 assert.equal(readMapViewport(blocked,'ttc',{width:400,height:800},1),null);
 assert.doesNotThrow(()=>saveMapViewport(blocked,'ttc',{x:0,y:0,scale:1},{width:400,height:800},1));
});
test('saved mobile cameras expire after twelve hours',()=>{
 const storage=memory();
 const savedAt=1_700_000_000_000;
 saveMapViewport(storage,'ttc',{x:-100,y:-200,scale:2},{width:400,height:800},1,savedAt);
 assert.ok(readMapViewport(storage,'ttc',{width:400,height:800},1,savedAt + MAP_VIEWPORT_MAX_AGE_MS));
 assert.equal(readMapViewport(storage,'ttc',{width:400,height:800},1,savedAt + MAP_VIEWPORT_MAX_AGE_MS + 1),null);

 saveGeographicMapViewport(storage,'regional',{lng:-79.38,lat:43.65,zoom:12},savedAt);
 assert.deepEqual(
  readGeographicMapViewport(storage,'regional',savedAt + MAP_VIEWPORT_MAX_AGE_MS),
  {lng:-79.38,lat:43.65,zoom:12},
 );
 assert.equal(
  readGeographicMapViewport(storage,'regional',savedAt + MAP_VIEWPORT_MAX_AGE_MS + 1),
  null,
 );
});
