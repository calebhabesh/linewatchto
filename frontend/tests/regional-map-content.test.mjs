import assert from "node:assert/strict";
import { describe, it } from "node:test";
import geometry from "../src/app/map-geometry/regional.json" with { type: "json" };
import { regionalDashboardDataForScenario } from "../src/app/regional-data.ts";
import { regionalMapContent, regionalStationAlertImpacts } from "../src/app/regional-map-content.ts";
import { mapLineAlerts } from "../src/app/map-corridors.ts";
import { mapImpactContext } from "../src/app/map-content-rules.ts";
import { regionalStationAlerts } from "../src/app/regional-station-alerts.ts";
import { regionalOverlapBadges, regionalPlacedOverlapBadges } from "../src/app/regional-map-overlays.ts";
import { REGIONAL_MAP_VIEWBOX, REGIONAL_OVERLAY_UNIT, regionalDrawnSegments } from "../src/app/regional-map-geometry.ts";
import { placeMapOverlapBadges, reuseMapContent } from "../src/app/map-content.ts";

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

// A poll returns fresh copies, and every ingestion run restamps `updatedAt`.
const restamped = (items, updatedAt) => items.map((item) => ({ ...item, updatedAt }));
const polled = (updatedAt) => input({
  activeAlerts: restamped(data.activeAlerts, updatedAt),
  delays: restamped(data.delays, updatedAt),
  reducedSpeedZones: restamped(data.reducedSpeedZones, updatedAt),
  plannedClosures: restamped(data.plannedClosures, updatedAt),
  networkSegments: data.networkSegments.map((segment) => ({ ...segment })),
});

describe("GO/UP map content", () => {
  it("keeps what it draws when a poll only restamps the data", () => {
    const before = regionalMapContent(geometry, polled("2026-10-23T21:03:36Z"));
    const after = regionalMapContent(geometry, polled("2026-10-23T21:07:37Z"));
    assert.equal(reuseMapContent(before, after), before);
  });

  it("redraws when what it draws changes", () => {
    const before = regionalMapContent(geometry, polled("2026-10-23T21:03:36Z"));
    const after = regionalMapContent(geometry, input({ stationNodeImpacts: [] }));
    assert.notEqual(reuseMapContent(before, after), before);
  });

  it("draws what the shared builders and the regional adapters build", () => {
    const content = regionalMapContent(geometry, input());
    const stationAlertImpacts = regionalStationAlertImpacts(input());
    const context = mapImpactContext(regionalDrawnSegments(geometry, data.networkSegments), data);
    assert.deepEqual(content.lineAlerts, mapLineAlerts(context, {
      activeAlerts: data.activeAlerts,
      stationNodeImpacts: data.stationNodeImpacts,
      selection: null,
    }).lineAlerts);
    const station = regionalStationAlerts(geometry, { ...input(), stationNodeImpacts: stationAlertImpacts }, REGIONAL_OVERLAY_UNIT);
    assert.deepEqual(content.stationAlerts, station.alerts);
    assert.deepEqual(content.stationDirectionGlyphs, station.glyphs);
    assert.deepEqual(
      content.overlapBadges,
      regionalOverlapBadges(
        geometry,
        data.networkSegments,
        { stationNodeImpacts: stationAlertImpacts, stations: data.stations },
        { activeAlerts: data.activeAlerts, delays: data.delays, plannedClosures: data.plannedClosures },
      ),
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

  it("draws no station rings or station badges for station lists a line closure already shows", () => {
    // Nov. 7-8 in production: Stouffville closed by two line notices, and
    // two station-list notices covering every stop on it.
    const clear = regionalDashboardDataForScenario("none");
    const template = data.activeAlerts.find((alert) => alert.severity === "suspension");
    const card = (id) => ({ ...template, id, lineId: "regional-st", lineNumber: "ST", affectedSegmentIds: [] });
    const lineCards = ["regional-go-530060-st", "regional-go-530377-st"];
    const stouffville = clear.networkSegments.filter((segment) => segment.lineId === "regional-st");
    const stops = [...new Set(stouffville.flatMap((segment) => [segment.stationAId, segment.stationBId]))]
      .filter((stationId) => stationId !== "union");
    const nov7 = input({
      networkSegments: clear.networkSegments.map((segment) => (segment.lineId === "regional-st"
        ? {
            ...segment,
            overlay: "suspension",
            impacts: lineCards.map((cardId) => ({
              kind: "suspension", cardId, travelDirection: "bidirectional", sourceAlertIds: [cardId],
            })),
          }
        : segment)),
      activeAlerts: [...lineCards, "regional-go-531887-st", "regional-go-531889-st"].map(card),
      delays: [],
      reducedSpeedZones: [],
      plannedClosures: [],
      stationNodeImpacts: stops.map((stationId, index) => ({
        stationId,
        kind: "suspension",
        cardId: index < 3 ? "regional-go-531889-st" : "regional-go-531887-st",
        title: "Stouffville Line Service Adjustments Nov. 7-8",
      })),
    });
    assert.ok(stops.length >= 9);

    const content = regionalMapContent(geometry, nov7);
    assert.deepEqual(content.stationAlerts, []);
    assert.deepEqual(
      [...new Set(content.lineAlerts.map((alert) => alert.impactId))].sort(),
      lineCards,
      "a hidden station list is still station-only, never drawn along the line",
    );
    assert.deepEqual(
      content.overlapBadges.map((badge) => badge.label),
      ["Union to Old Elm"],
      "the two line notices share one badge; no stop gets its own",
    );

    const selected = regionalMapContent(geometry, { ...nov7, selection: { kind: "suspension", id: "regional-go-531889-st" } });
    assert.equal(selected.stationAlerts.length, 3, "selecting a station list draws its stops");
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
