import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readMapViewport, saveMapViewport, mapViewportKey } from '../src/app/map-viewport-preference.ts';
const memory = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key,value), removeItem: key => data.delete(key) }; };
test('viewport round trips independently by network and preserves map center across screen sizes', () => {
 const storage=memory();const camera={x:-100,y:-200,scale:2};
 saveMapViewport(storage,'ttc',camera,{width:400,height:800},1);
 assert.deepEqual(readMapViewport(storage,'ttc',{width:400,height:800},1),camera);
 assert.equal(readMapViewport(storage,'regional',{width:400,height:800},1),null);
 assert.deepEqual(readMapViewport(storage,'ttc',{width:600,height:900},.5),{x:150,y:150,scale:1});
});
test('invalid storage is ignored and zoom respects camera limits',()=>{
 const storage=memory();for(const value of ['{','null','{}','{"version":2,"centerX":0,"centerY":0,"zoom":2}','{"version":1,"centerX":"0","centerY":0,"zoom":2}']) {
 storage.setItem(mapViewportKey('ttc'),value);assert.equal(readMapViewport(storage,'ttc',{width:400,height:800},1),null);
 }
 storage.setItem(mapViewportKey('ttc'),JSON.stringify({version:1,centerX:0,centerY:0,zoom:50}));
 assert.equal(readMapViewport(storage,'ttc',{width:400,height:800},1).scale,8);
 const blocked={getItem(){throw Error();},setItem(){throw Error();}};
 assert.equal(readMapViewport(blocked,'ttc',{width:400,height:800},1),null);
 assert.doesNotThrow(()=>saveMapViewport(blocked,'ttc',{x:0,y:0,scale:1},{width:400,height:800},1));
});
