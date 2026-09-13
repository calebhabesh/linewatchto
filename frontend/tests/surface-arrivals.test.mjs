import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildPinnedSurfaceGroups,
  filterActiveSurfaceArrivals,
  formatSurfaceArrivalClockTime,
  formatSurfaceArrivalTileLabel,
  getSurfaceArrivalDelayMinutes,
  getSurfaceArrivalGroupBayKey,
  getSurfaceArrivals,
  groupSurfaceArrivals,
  groupSurfaceArrivalsByBay,
  isSurfaceArrivalDue,
  isSurfaceArrivalExpired,
  parseSurfaceRouteDetails,
  shouldUseDetailedSurfaceArrivalCountdown,
  SURFACE_ARRIVAL_COUNTDOWN_TICK_MS,
  surfaceArrivalLabel,
  surfaceSourceSummary,
} from "../src/app/surface-arrivals.ts";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const row = (overrides = {}) => ({
  agency: "TTC",
  mode: "streetcar",
  route: "504",
  routeName: "King",
  destination: "Dundas West Station",
  minutes: 5,
  predictedAt: "2026-08-14T12:05:00Z",
  scheduledAt: "2026-08-14T12:04:00Z",
  bayPlatform: "Bay 7",
  stopName: "Broadview Station at Bay 7",
  tripId: "trip-1",
  source: "TTC GTFS-RT bus and streetcar trip updates",
  status: "live",
  ...overrides,
});

describe("surface station arrivals", () => {
  it("mounts the independently refreshed section in both station map modes", () => {
    const ttc = readFileSync(new URL("../src/components/StationDetailPanel.tsx", import.meta.url), "utf8");
    const regional = readFileSync(new URL("../src/components/RegionalStationDetailPanel.tsx", import.meta.url), "utf8");
    const section = readFileSync(new URL("../src/components/SurfaceConnectionsSection.tsx", import.meta.url), "utf8");
    assert.match(ttc, /SurfaceConnectionsSection networkId="ttc"/);
    assert.match(regional, /SurfaceConnectionsSection networkId="regional"/);
    assert.match(section, /data-station-section="surface-connections"/);
    assert.match(section, /Bay and platform labels are source-published and are never inferred by proximity/);
    assert.match(section, /<Bus size=\{20\}[\s\S]*?<span[^>]*>Surface Connections<\/span>/);
    assert.match(section, /<Bus size=\{18\}[\s\S]*?<strong[^>]*>[\s\S]*?Surface Connections/);
    assert.match(section, /ArrivalLinePinButton/);
    assert.match(section, /getSurfaceArrivalDelayMinutes/);
    assert.match(section, /<ArrivalDelayBadge delayMinutes=\{delayMinutes\}/);
    assert.match(section, /scheduledClockTime/);
    assert.match(section, /station-arrival-line-divider/);
    assert.match(section, /data-pinned-route/);
    assert.equal(SURFACE_ARRIVAL_COUNTDOWN_TICK_MS, 3000);
    assert.match(section, /window\.setInterval\(\(\) => setTick\(Date\.now\(\)\), SURFACE_ARRIVAL_COUNTDOWN_TICK_MS\)/);
  });

  it("uses network-scoped same-origin station endpoints", async () => {
    const paths = [];
    const fetcher = async (url) => {
      paths.push(url);
      return { ok: true, json: async () => ({ arrivals: [] }) };
    };
    await getSurfaceArrivals("ttc", "broadview", { fetcher });
    await getSurfaceArrivals("regional", "bramalea", { fetcher });
    assert.deepEqual(paths, [
      "/api/stations/broadview/surface-connections",
      "/api/regional/stations/bramalea/surface-connections",
    ]);
  });

  it("preserves all station surface connections even when arrivals expire or are outside window", () => {
    const all = [
      row({ route: "504", destination: "Dundas West Station", bayPlatform: "Bay 7", tripId: "t-1" }),
      row({ route: "32", destination: "Eglinton Station", bayPlatform: "Bay 2", tripId: "t-2" }),
    ];
    const active = [
      row({ route: "504", destination: "Dundas West Station", bayPlatform: "Bay 7", tripId: "t-1" }),
    ]; // 32 has no active arrivals right now

    const groups = groupSurfaceArrivals(all, active);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].route, "504");
    assert.equal(groups[0].arrivals.length, 1);
    assert.equal(groups[1].route, "32");
    assert.equal(groups[1].arrivals.length, 0);
  });


  it("cleans redundant route numbers and prefixes, formatting condensed route name and standalone destination", () => {
    const r1 = parseSurfaceRouteDetails({
      mode: "bus",
      route: "935",
      routeName: "Jane Express",
      destination: "North - 935 Jane Express towards Pioneer Village Station",
      bayPlatform: "Bay 4",
    }, "ttc");
    assert.equal(r1.displayRouteName, "Jane Express");
    assert.equal(r1.destinationTarget, "To Pioneer Village Station");
    assert.equal(r1.direction, "North");
    assert.equal(r1.metaSubtitle, "TTC Bus · North · Bay 4");

    const r2 = parseSurfaceRouteDetails({
      mode: "bus",
      route: "27",
      routeName: "Jane South",
      destination: "North - 27 Jane South towards Mount Dennis Station",
      bayPlatform: "Bay 5",
    }, "ttc");
    assert.equal(r2.displayRouteName, "Jane South");
    assert.equal(r2.destinationTarget, "To Mount Dennis Station");
    assert.equal(r2.direction, "North");
    assert.equal(r2.metaSubtitle, "TTC Bus · North · Bay 5");

    const r3 = parseSurfaceRouteDetails({
      mode: "bus",
      route: "149",
      routeName: "Etobicoke-Bloor",
      destination: "West - 149 Etobicoke-Bloor towards Highway 407 Station",
      bayPlatform: "Bay 2",
    }, "ttc");
    assert.equal(r3.displayRouteName, "Etobicoke-Bloor");
    assert.equal(r3.destinationTarget, "To Highway 407 Station");
    assert.equal(r3.direction, "West");
    assert.equal(r3.metaSubtitle, "TTC Bus · West · Bay 2");

    const r4 = parseSurfaceRouteDetails({
      mode: "bus",
      route: "26",
      routeName: "Dupont",
      destination: "East - 26 Dupont towards St George Station",
      bayPlatform: "Bay 3",
    }, "ttc");
    assert.equal(r4.displayRouteName, "Dupont");
    assert.equal(r4.destinationTarget, "To St George Station");
    assert.equal(r4.direction, "East");
    assert.equal(r4.metaSubtitle, "TTC Bus · East · Bay 3");

    const r5 = parseSurfaceRouteDetails({
      mode: "bus",
      route: "31",
      routeName: "Georgetown",
      destination: "North - 31 Guelph",
      bayPlatform: "5",
    }, "regional");
    assert.equal(r5.displayRouteName, "Georgetown");
    assert.equal(r5.destinationTarget, "To Guelph");
    assert.equal(r5.direction, "North");
    assert.equal(r5.metaSubtitle, "GO Bus · North · Bay 5");

    const r6 = parseSurfaceRouteDetails({
      mode: "streetcar",
      route: "510",
      routeName: "Spadina",
      destination: "South - 510 Spadina towards Union Station",
      bayPlatform: "Streetcar Platform",
    }, "ttc");
    assert.equal(r6.displayRouteName, "Spadina");
    assert.equal(r6.destinationTarget, "To Union Station");
    assert.equal(r6.direction, "South");
    assert.equal(r6.metaSubtitle, "TTC Streetcar · South · Platform");
  });

  it("groups arrivals by bus bays and prioritizes starred/pinned routes", () => {
    const groups = groupSurfaceArrivals([
      row({ route: "935", bayPlatform: "Bay 4", predictedAt: "2026-08-14T12:02:00Z" }),
      row({ route: "27", bayPlatform: "Bay 5", predictedAt: "2026-08-14T12:07:00Z" }),
      row({ route: "149", bayPlatform: "Bay 2", predictedAt: "2026-08-14T12:09:00Z" }),
      row({ route: "26", bayPlatform: "Bay 3", predictedAt: "2026-08-14T12:19:00Z" }),
      row({ route: "55", bayPlatform: "Bay 2", predictedAt: "2026-08-14T12:24:00Z" }),
    ]);

    // Natural numeric bay order: Bay 2, Bay 3, Bay 4, Bay 5
    const naturalBays = groupSurfaceArrivalsByBay(groups, []);
    assert.equal(naturalBays.length, 4);
    assert.equal(naturalBays[0].bayLabel, "Bay 2");
    assert.equal(naturalBays[0].bayKey, "Bay 2");
    assert.equal(naturalBays[0].groups.length, 2);
    assert.equal(naturalBays[1].bayLabel, "Bay 3");
    assert.equal(naturalBays[2].bayLabel, "Bay 4");
    assert.equal(naturalBays[3].bayLabel, "Bay 5");

    // getSurfaceArrivalGroupBayKey helper normalizes numbers and unspecified platforms
    assert.equal(getSurfaceArrivalGroupBayKey({ bayPlatform: "2" }), "Bay 2");
    assert.equal(getSurfaceArrivalGroupBayKey({ bayPlatform: "Bay 2" }), "Bay 2");
    assert.equal(getSurfaceArrivalGroupBayKey({ bayPlatform: "Platform" }), "Platform");
    assert.equal(getSurfaceArrivalGroupBayKey({ bayPlatform: "" }), "unspecified");

    // When Route 935 in Bay 4 is starred, Bay 4 floats to the top
    const pinnedBays = groupSurfaceArrivalsByBay(groups, ["surface:935"]);
    assert.equal(pinnedBays[0].bayLabel, "Bay 4");
    assert.equal(pinnedBays[0].groups[0].route, "935");
    assert.equal(pinnedBays[1].bayLabel, "Bay 2");
  });

  it("formats countdown ranges and clock times like trains", () => {
    const now = Date.parse("2026-08-14T12:00:00Z");
    const soonArrival = row({ predictedAt: "2026-08-14T12:01:15Z" }); // 75 seconds away

    assert.equal(shouldUseDetailedSurfaceArrivalCountdown(soonArrival, now), true);
    assert.equal(
      formatSurfaceArrivalTileLabel(soonArrival, { detailedCountdown: true, now }),
      "1:15 - 2:15",
    );

    const laterArrival = row({ predictedAt: "2026-08-14T12:08:00Z" });
    assert.equal(shouldUseDetailedSurfaceArrivalCountdown(laterArrival, now), false);
    assert.equal(formatSurfaceArrivalTileLabel(laterArrival, { now }), "8m");

    const clock = formatSurfaceArrivalClockTime("2026-08-14T12:05:00Z");
    assert.match(clock, /8:05\s*AM/i); // America/Toronto is UTC-4 in summer
  });

  it("removes DUE arrival cards after the bus departure threshold so tiles move forward", () => {
    const arrivalTime = Date.parse("2026-08-14T12:00:00Z");
    const arr1 = row({ tripId: "trip-1", predictedAt: "2026-08-14T12:00:00Z" });
    const arr2 = row({ tripId: "trip-2", predictedAt: "2026-08-14T12:14:00Z" });

    // At exact arrival time: Due, not expired
    assert.equal(isSurfaceArrivalDue(arr1, arrivalTime), true);
    assert.equal(isSurfaceArrivalExpired(arr1, arrivalTime), false);
    assert.equal(filterActiveSurfaceArrivals([arr1, arr2], arrivalTime).length, 2);

    // 60 seconds after arrival: Still Due (boarding), not expired
    assert.equal(isSurfaceArrivalExpired(arr1, arrivalTime + 60_000), false);
    assert.equal(filterActiveSurfaceArrivals([arr1, arr2], arrivalTime + 60_000).length, 2);

    // 95 seconds after arrival (> 90s grace threshold): Expired and pruned, advancing arr2 to front!
    assert.equal(isSurfaceArrivalExpired(arr1, arrivalTime + 95_000), true);
    const remaining = filterActiveSurfaceArrivals([arr1, arr2], arrivalTime + 95_000);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].tripId, "trip-2");
  });

  it("updates minute labels from the absolute prediction time", () => {
    assert.equal(surfaceArrivalLabel(row(), Date.parse("2026-08-14T12:01:00Z")), "4 min");
    assert.equal(surfaceArrivalLabel(row(), Date.parse("2026-08-14T12:05:00Z")), "Due");
  });

  it("shows source-backed surface delays only inside the 30-minute arrival window", () => {
    const now = Date.parse("2026-08-14T12:00:00Z");
    assert.equal(getSurfaceArrivalDelayMinutes(row({
      predictedAt: "2026-08-14T12:20:00Z",
      scheduledAt: "2026-08-14T12:14:00Z",
    }), now), 6);
    assert.equal(getSurfaceArrivalDelayMinutes(row({
      predictedAt: "2026-08-14T12:20:00Z",
      scheduledAt: "2026-08-14T12:19:00Z",
    }), now), null);
    assert.equal(getSurfaceArrivalDelayMinutes(row({
      predictedAt: "2026-08-14T13:00:00Z",
      scheduledAt: "2026-08-14T12:45:00Z",
    }), now), null);
    assert.equal(getSurfaceArrivalDelayMinutes(row({ status: "scheduled" }), now), null);
    assert.equal(getSurfaceArrivalDelayMinutes(row({ scheduledAt: null }), now), null);
    assert.equal(getSurfaceArrivalDelayMinutes(row({
      agency: "GO Transit",
      predictedAt: "2026-08-14T12:20:00Z",
      scheduledAt: "2026-08-14T12:05:00Z",
    }), now), null);
    assert.equal(getSurfaceArrivalDelayMinutes(row({
      agency: "GO Transit",
      predictedAt: "2026-08-14T12:20:00Z",
      scheduledAt: "2026-08-14T12:04:00Z",
    }), now), 16);
  });

  it("does not describe route-only placeholders as scheduled departures", () => {
    const placeholder = row({ status: "scheduled", scheduledAt: null, predictedAt: null, minutes: null });
    assert.equal(surfaceSourceSummary({
      networkId: "ttc", availability: "available", arrivals: [placeholder],
    }), "Route connections · predictions unavailable");
    assert.equal(surfaceSourceSummary({
      networkId: "ttc", availability: "available", arrivals: [row(), placeholder],
    }), "TTC live surface estimates");
  });

  it("distinguishes mixed GO Bus data from TTC live estimates", () => {
    assert.equal(surfaceSourceSummary({
      networkId: "regional",
      availability: "available",
      arrivals: [row({ agency: "GO Transit", mode: "bus" }), row({ status: "scheduled" })],
    }), "Live estimates + scheduled departures");
    assert.equal(surfaceSourceSummary({
      networkId: "ttc",
      availability: "available",
      arrivals: [row()],
    }), "TTC live surface estimates");
  });

  it("builds pinned surface groups including empty placeholders for starred routes with no arrivals", () => {
    const active = groupSurfaceArrivals([
      row({ route: "504", routeName: "King", destination: "Dundas West Station", bayPlatform: "Bay 7" }),
    ]);
    const snapshotArrivals = [
      row({ route: "504", routeName: "King", destination: "Dundas West Station", bayPlatform: "Bay 7" }),
      row({ route: "935", routeName: "Jane Express", destination: "Pioneer Village Station", bayPlatform: "Bay 4" }),
    ];

    // Case 1: Pinned active route 504 + pinned off-peak route 935 with snapshot history
    const pinned1 = buildPinnedSurfaceGroups(active, snapshotArrivals, ["surface:504", "surface:935"], "ttc");
    assert.equal(pinned1.length, 2);
    assert.equal(pinned1[0].route, "504");
    assert.equal(pinned1[0].arrivals.length, 1);
    assert.equal(pinned1[1].route, "935");
    assert.equal(pinned1[1].routeName, "Jane Express");
    assert.equal(pinned1[1].bayPlatform, "Bay 4");
    assert.equal(pinned1[1].arrivals.length, 0);

    // Case 2: Pinned route that was never observed in snapshot
    const pinned2 = buildPinnedSurfaceGroups([], [], ["surface:999"], "ttc");
    assert.equal(pinned2.length, 1);
    assert.equal(pinned2[0].route, "999");
    assert.equal(pinned2[0].routeName, "Route 999");
    assert.equal(pinned2[0].arrivals.length, 0);

    // Case 3: Rapid transit pins like "line-1" and "regional-lakeshore-west" are ignored
    const pinned3 = buildPinnedSurfaceGroups(active, snapshotArrivals, ["line-1", "regional-lakeshore-west"], "ttc");
    assert.equal(pinned3.length, 0);
  });

  it("integrates SurfaceConnectionsSection in MyStationsPanel and renders collapsed pinned routes", () => {
    const myStations = readFileSync(new URL("../src/components/MyStationsPanel.tsx", import.meta.url), "utf8");
    const section = readFileSync(new URL("../src/components/SurfaceConnectionsSection.tsx", import.meta.url), "utf8");
    const css = readAppStylesheet();

    assert.match(myStations, /SurfaceConnectionsSection[^>]*networkId="ttc"/);
    assert.match(myStations, /SurfaceConnectionsSection[^>]*networkId="regional"/);
    assert.match(section, /surface-connections-collapsed-pinned/);
    assert.match(section, /saved-station-arrival-group/);
    assert.match(section, /saved-station-arrival-direction/);
    assert.match(section, /saved-station-arrival-source/);
    assert.match(section, /saved-station-arrival-times/);
    assert.match(css, /\.surface-connections-details\[open\] \.surface-connections-collapsed-pinned\s*\{[^}]*display:\s*none;/s);
    assert.match(css, /\.saved-station-rich-content \.surface-connections-details\s*\{[^}]*margin-top:\s*0;/s);
  });
});
