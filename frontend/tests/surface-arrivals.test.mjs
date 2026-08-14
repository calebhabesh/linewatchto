import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  getSurfaceArrivals,
  groupSurfaceArrivals,
  surfaceArrivalLabel,
  surfaceSourceSummary,
} from "../src/app/surface-arrivals.ts";

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
    assert.match(section, /useSubwayOperatingState/);
    assert.match(section, /useRegionalRailOperatingState/);
    assert.match(section, /Subway Closed/);
    assert.match(section, /LRT Closed/);
    assert.match(section, /GO & UP Rail Closed/);
    assert.match(section, /Arrivals Not Available/);
    assert.match(section, /data-surface-connections-closed/);
    assert.match(section, /<Bus size=\{20\}[\s\S]*?<span[^>]*>Surface Connections<\/span>/);
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

  it("groups only identical route, destination, and published bay rows", () => {
    const groups = groupSurfaceArrivals([
      row(),
      row({ tripId: "trip-2", predictedAt: "2026-08-14T12:10:00Z" }),
      row({ tripId: "trip-3", bayPlatform: "", stopName: "Broadview Station" }),
    ]);
    assert.equal(groups.length, 2);
    assert.equal(groups.find((group) => group.bayPlatform === "Bay 7").arrivals.length, 2);
  });

  it("updates minute labels from the absolute prediction time", () => {
    assert.equal(surfaceArrivalLabel(row(), Date.parse("2026-08-14T12:01:00Z")), "4 min");
    assert.equal(surfaceArrivalLabel(row(), Date.parse("2026-08-14T12:05:00Z")), "Due");
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
});
