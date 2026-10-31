import assert from "node:assert/strict";
import { describe, it } from "node:test";
import geometry from "../src/app/map-geometry/regional.json" with { type: "json" };
import { regionalDashboardDataForScenario } from "../src/app/regional-data.ts";
import { regionalMapContent, regionalStationAlertImpacts } from "../src/app/regional-map-content.ts";
import { regionalLineAlerts } from "../src/app/regional-line-alerts.ts";
import { regionalStationAlerts } from "../src/app/regional-station-alerts.ts";
import { regionalOverlapBadges, regionalPlacedOverlapBadges } from "../src/app/regional-map-overlays.ts";
import { REGIONAL_MAP_VIEWBOX, REGIONAL_OVERLAY_UNIT } from "../src/app/regional-map-geometry.ts";
import { placeMapOverlapBadges } from "../src/app/map-content.ts";

const data = regionalDashboardDataForScenario("all-impact-types");
const input = (overrides = {}) => ({
  networkSegments: data.networkSegments,
  activeAlerts: data.activeAlerts,
  delays: data.delays,
  reducedSpeedZones: data.reducedSpeedZones,
  plannedClosures: data.plannedClosures,
  stationNodeImpacts: data.stationNodeImpacts,
  stations: data.stations,
  selection: null,
  commutePathPreview: null,
  ...overrides,
});

describe("GO/UP map content", () => {
  it("draws what the regional adapters build", () => {
    const content = regionalMapContent(geometry, input());
    const stationAlertImpacts = regionalStationAlertImpacts(input());
    assert.deepEqual(content.lineAlerts, regionalLineAlerts(geometry, {
      activeAlerts: data.activeAlerts,
      networkSegments: data.networkSegments,
      stationNodeImpacts: data.stationNodeImpacts,
    }));
    const station = regionalStationAlerts(geometry, { ...input(), stationNodeImpacts: stationAlertImpacts }, REGIONAL_OVERLAY_UNIT);
    assert.deepEqual(content.stationAlerts, station.alerts);
    assert.deepEqual(content.stationDirectionGlyphs, station.glyphs);
    assert.deepEqual(
      content.overlapBadges,
      regionalOverlapBadges(geometry, data.networkSegments, { stationNodeImpacts: stationAlertImpacts, stations: data.stations }),
    );
    assert.deepEqual([...content.outlinePathsByImpact.keys()].sort(), [...new Set(
      content.lineAlerts.map((alert) => `${alert.kind}:${alert.impactId}`),
    )].sort());
  });

  it("draws a station-only planned advisory as a station alert, once", () => {
    const content = regionalMapContent(geometry, input());
    assert.deepEqual(content.stationAlerts.map((alert) => alert.key), [
      "delay:regional-demo-bloor-station-delay:bloor",
      "planned-closure:regional-station-only-planned:pickering",
    ]);
    const twice = regionalStationAlertImpacts(input({
      stationNodeImpacts: [...data.stationNodeImpacts, ...data.stationNodeImpacts],
    }));
    assert.equal(twice.length, regionalStationAlertImpacts(input()).length);
  });

  it("emphasizes the selected line alert", () => {
    const content = regionalMapContent(geometry, input({ selection: { kind: "suspension", id: "regional-demo-suspension" } }));
    assert.deepEqual(content.selectedLineAlerts.map((alert) => alert.impactId), ["regional-demo-suspension"]);
    assert.deepEqual(regionalMapContent(geometry, input()).selectedLineAlerts, []);
  });

  it("places badges at GO/UP's scale, as its own placement does", () => {
    const content = regionalMapContent(geometry, input());
    assert.equal(content.badgePlacement.badgeScale, 2);
    assert.equal(regionalMapContent(geometry, input()).badgePlacement, content.badgePlacement);
    const placed = placeMapOverlapBadges(content, { unit: REGIONAL_OVERLAY_UNIT, mapBounds: REGIONAL_MAP_VIEWBOX });
    assert.deepEqual(placed.map((badge) => badge.label), ["Union to Niagara Falls", "Pickering"]);
    assert.deepEqual(
      placed.map((badge) => badge.position),
      regionalPlacedOverlapBadges(geometry, content.overlapBadges, content.lineAlerts, content.stationAlerts)
        .map((badge) => badge.position),
    );
  });
});
