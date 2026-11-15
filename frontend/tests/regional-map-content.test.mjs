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

  describe("station overlap badges at connector stations", () => {
    // Nov. 14-15 in production: Kitchener suspended Union to Mount Dennis and
    // UP Express suspended end to end. KI and UP run on separate drawn tracks
    // with a dot each at Bloor, Mount Dennis and Weston; only Union's pill is shared.
    const clear = regionalDashboardDataForScenario("none");
    const template = data.activeAlerts.find((alert) => alert.severity === "suspension");
    const suspension = (cardId) => ({
      kind: "suspension", cardId, travelDirection: "bidirectional", sourceAlertIds: [cardId],
    });
    const card = (id, lineNumber) => ({
      ...template, id, lineId: `regional-${lineNumber.toLowerCase()}`, lineNumber, affectedSegmentIds: [],
    });
    const closures = (extra = {}) => input({
      networkSegments: clear.networkSegments.map((segment) => {
        const kiClosed = extra.kiClosed ?? ["segment-ki-union-bloor", "segment-ki-bloor-mount-dennis"];
        const impacts = [
          ...(kiClosed.includes(segment.id) ? [suspension("ki-union-mount-dennis")] : []),
          ...(segment.lineId === "regional-up" ? [suspension("up-entire-line")] : []),
          ...(extra.impacts?.(segment) ?? []),
        ];
        return impacts.length > 0 ? { ...segment, overlay: "suspension", impacts } : segment;
      }),
      activeAlerts: [card("ki-union-mount-dennis", "KI"), card("up-entire-line", "UP"), ...(extra.activeAlerts ?? [])],
      delays: [],
      reducedSpeedZones: [],
      plannedClosures: [],
      stationNodeImpacts: extra.stationNodeImpacts ?? [],
    });
    const stationBadges = (content) => content.overlapBadges
      .filter((badge) => badge.markerId.startsWith("regional-overlap-station-"))
      .map((badge) => ({ label: badge.label, cards: badge.impacts.map((impact) => impact.cardId).sort() }));

    it("gives KI and UP alerts that meet at Bloor and Mount Dennis no badge; Union keeps one", () => {
      assert.deepEqual(stationBadges(regionalMapContent(geometry, closures())), [
        { label: "Union", cards: ["ki-union-mount-dennis", "up-entire-line"] },
      ]);
    });

    it("nestles Union's badge in the middle of the gap beside the pill, its connector meeting the pill", () => {
      const content = regionalMapContent(geometry, closures());
      const union = placeMapOverlapBadges(content, { unit: REGIONAL_OVERLAY_UNIT, mapBounds: REGIONAL_MAP_VIEWBOX })
        .find((badge) => badge.label === "Union");
      // East of the pill, Stouffville and Lakeshore East end with the widest gap between them.
      const endY = (id) => geometry.lines.find((line) => line.id === id).points[1];
      const gapMiddle = (endY("regional-route-st-path") + endY("regional-route-le-path")) / 2;
      const pill = geometry.stations.find((station) => station.id === "station-union").anchors[0];
      const pillEdge = pill.x + pill.radius + pill.outline / 2;
      assert.ok(Math.abs(union.position.y - gapMiddle) <= 10, `badge centred between ST and LE (y ${union.position.y}, gap ${gapMiddle})`);
      assert.ok(union.position.x > pillEdge, "badge sits east of the pill");
      assert.ok(union.connector, "the badge has a connector");
      assert.ok(Math.abs(union.connector.to.x - pillEdge) <= 1, "the connector ends on the pill's edge");
      assert.ok(Math.abs(union.connector.to.y - union.position.y) <= 2, "the connector runs straight to the pill");
      assert.ok(union.affectedOutlines.length > 0, "its chooser still keeps the alerts' overlays uncovered");
    });

    it("badges two alerts that meet on the same line's dot, beside that dot", () => {
      // KI suspended Union to Bloor and delayed Bloor to Mount Dennis: they meet
      // on Bloor's KI dot. UP's suspension through Bloor is on its own dot.
      const content = regionalMapContent(geometry, closures({
        kiClosed: ["segment-ki-union-bloor"],
        impacts: (segment) => (segment.id === "segment-ki-bloor-mount-dennis"
          ? [{ ...suspension("ki-bloor-mount-dennis-delay"), kind: "delay" }]
          : []),
        activeAlerts: [{ ...card("ki-bloor-mount-dennis-delay", "KI"), severity: "delay" }],
      }));
      assert.deepEqual(stationBadges(content), [
        { label: "Bloor", cards: ["ki-bloor-mount-dennis-delay", "ki-union-mount-dennis"] },
        { label: "Union", cards: ["ki-union-mount-dennis", "up-entire-line"] },
      ]);
      const bloor = content.overlapBadges.find((badge) => badge.label === "Bloor");
      const kiDot = geometry.stations.find((station) => station.id === "station-bloor")
        .anchors.find((anchor) => anchor.id === "station-bloor-ki");
      assert.deepEqual(bloor.anchor, { x: kiDot.x, y: kiDot.y }, "the badge sits on the KI dot, not between KI and UP");
    });

    it("joins both lines at a station alert whose line is unknown, which rings both dots", () => {
      const content = regionalMapContent(geometry, closures({
        stationNodeImpacts: [{ stationId: "mount-dennis", kind: "delay", cardId: "mount-dennis-notice", title: "Station notice" }],
      }));
      assert.deepEqual(stationBadges(content).find((badge) => badge.label === "Mount Dennis")?.cards, [
        "ki-union-mount-dennis", "mount-dennis-notice", "up-entire-line",
      ]);
    });
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
