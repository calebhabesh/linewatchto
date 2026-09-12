import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dashboardDataFromApi } from '../src/app/dashboard-adapter.ts';
import * as fixture from '../src/app/linewatch-data.ts';
import { readDashboardSnapshot, saveDashboardSnapshot, snapshotDashboard, snapshotKey, snapshotNotice, SNAPSHOT_RETENTION_MS } from '../src/app/dashboard-snapshot.ts';
const data = dashboardDataFromApi({ map: { stations: fixture.stations, segments: fixture.networkSegments, stationNodeImpacts: fixture.stationNodeImpacts }, status: { generatedAt: { ...fixture.generatedAt, live: true }, lines: fixture.lineStatuses }, activeAlerts: fixture.activeAlerts, delays: fixture.delays, reducedSpeedZones: fixture.reducedSpeedZones, plannedClosures: fixture.plannedClosures, performance: fixture.ttcPerformanceSnapshot });
function storage() { const rows = new Map(); return { getItem: k => rows.get(k) ?? null, setItem: (k,v) => rows.set(k,v), removeItem: k => rows.delete(k) }; }
test('real snapshots survive reopening, preserve source timing, and isolate networks', () => {
 const s=storage(); saveDashboardSnapshot(s, data, 1000);
 assert.deepEqual(readDashboardSnapshot(s,'ttc',2000).data.generatedAt, data.generatedAt);
 assert.equal(readDashboardSnapshot(s,'regional',2000),null);
 assert.equal(readDashboardSnapshot(s,'ttc',2000).savedAt,1000);
});
test('fixtures, unavailable responses and displayed snapshots cannot replace real data', () => {
 const s=storage(); saveDashboardSnapshot(s,data,1000);
 for(const bad of [{...data,dataSource:'fallback'}, {...data,availability:'unavailable'}, snapshotDashboard(data,1000,'offline')]) assert.equal(saveDashboardSnapshot(s,bad,2000),null);
 assert.equal(readDashboardSnapshot(s,'ttc',3000).savedAt,1000);
});
test('corrupt, incompatible, expired and future-dated snapshots are discarded', () => {
 const s=storage();
 for(const value of ['oops',JSON.stringify({version:2}),JSON.stringify({version:1,savedAt:1,data:{}})]) { s.setItem(snapshotKey('ttc'),value); assert.equal(readDashboardSnapshot(s,'ttc',2000),null); }
 saveDashboardSnapshot(s,data,1000); assert.equal(readDashboardSnapshot(s,'ttc',1000+SNAPSHOT_RETENTION_MS+1),null);
 saveDashboardSnapshot(s,data,1000); assert.equal(readDashboardSnapshot(s,'ttc',999),null);
});
test('storage denial does not break the dashboard', () => {
 const s={getItem(){throw Error()},setItem(){throw Error()},removeItem(){throw Error()}};
 assert.equal(readDashboardSnapshot(s,'ttc'),null); assert.ok(saveDashboardSnapshot(s,data));
});
test('offline view retains notices but cannot claim live or normal service or demo impacts', () => {
 const view=snapshotDashboard(data,1000,'offline');
 assert.equal(view.generatedAt.live,false); assert.deepEqual(view.activeAlerts,data.activeAlerts);
 assert.ok(view.lineStatuses.every(l=>l.status==='ready' && l.statusLabel==='Current status unknown'));
 assert.deepEqual(view.commuteImpacts,[]);
 const empty=snapshotDashboard(data,null,'offline');
 assert.deepEqual(empty.activeAlerts,[]); assert.ok(empty.networkSegments.every(s=>s.overlay==='clear' && s.impacts.length===0));
 assert.match(snapshotNotice(view.snapshot,121000),/Saved 2 min ago/);
 assert.match(snapshotNotice(empty.snapshot,121000),/No saved dashboard/);
});
test('persistence excludes incidental and personal fields', () => {
 const s=storage(); saveDashboardSnapshot(s,{...data,account:{email:'private'},arrivals:[{}]},1000);
 const raw=s.getItem(snapshotKey('ttc')); assert.doesNotMatch(raw,/private|"account"|"arrivals"/);
});

test('retained station-only impacts survive a storage round trip', () => {
 const s=storage();
 const withRing={...data,stationNodeImpacts:[{stationId:'bloor-yonge',kind:'suspension',cardId:'test-alert',title:'Station closed'}]};
 saveDashboardSnapshot(s,withRing,1000);
 assert.deepEqual(readDashboardSnapshot(s,'ttc',2000).data.stationNodeImpacts,withRing.stationNodeImpacts);
});
