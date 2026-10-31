/*
 * Content parity (plan 11): the same dashboard data through TTC's and GO/UP's
 * content adapters draws the same overlays. Both run over the drop-in fixture
 * geometry (plan 10 phase 6); GO/UP's copy names its routes the way GO/UP's
 * artwork does (`regional-route-<code>-path`), so its corridor rules run.
 * Outputs are normalised to what a rider sees (visual state, order, corridor
 * shape, badge members, sizes relative to the dot, labels), not keys or
 * formatting. A case marked `todo` is a known divergence, named by its audit
 * item in docs/refactor-plan/11-full-map-parity.md; later phases turn them
 * into plain cases.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import dropInGeometry from "./fixtures/drop-in-map/drop-in-map.json" with { type: "json" };
import { ttcMapContent, TTC_TRAIN_MARKER_PLACEMENT } from "../src/app/ttc-map-content.ts";
import { regionalMapContent, regionalTrainMarkerPlacement } from "../src/app/regional-map-content.ts";
import { REGIONAL_OVERLAY_UNIT } from "../src/app/regional-map-geometry.ts";
import { CONNECTOR_STATION_CLEARANCE } from "../src/components/map-overlays/overlay-obstacles.ts";

const ttcGeometry = dropInGeometry;
const regionalGeometry = {
  ...dropInGeometry,
  lines: dropInGeometry.lines.map((line) => ({ ...line, id: `regional-route-${line.id.replace("line-", "")}-path` })),
};

// --- Fixture network: line A Alder–Birch–Cedar, line B Dogwood–Birch–Elm (bends at Birch).

const STATIONS = [
  { id: "alder", name: "Alder", x: 200, y: 600, lineIds: ["line-a"] },
  { id: "birch", name: "Birch", x: 1000, y: 600, lineIds: ["line-a", "line-b"], interchange: true },
  { id: "cedar", name: "Cedar", x: 1800, y: 600, lineIds: ["line-a"] },
  { id: "dogwood", name: "Dogwood", x: 1000, y: 180, lineIds: ["line-b"] },
  { id: "elm", name: "Elm", x: 1400, y: 1000, lineIds: ["line-b"] },
];
// One list both adapters read: TTC's station summaries (mapX/mapY) and the
// network's stations (x/y).
const stations = STATIONS.map(({ id, name, x, y, lineIds, interchange = false }) => ({
  id, name, x, y, mapX: x, mapY: y, interchange, lineIds, hasActiveImpact: false, accessStatus: "normal",
}));
const stationById = new Map(STATIONS.map((station) => [station.id, station]));
const dotRadius = (stationId) => (
  dropInGeometry.stations.find((station) => station.id === `station-${stationId}`).anchors[0].radius
);

const A1 = "line-a-alder-birch";
const A2 = "line-a-birch-cedar";
const B1 = "line-b-dogwood-birch";
const B2 = "line-b-birch-elm";
const SEGMENTS = [["line-a", "alder", "birch"], ["line-a", "birch", "cedar"], ["line-b", "dogwood", "birch"], ["line-b", "birch", "elm"]];

const impact = (kind, cardId, travelDirection = "bidirectional") => ({
  kind, cardId, travelDirection, sourceAlertIds: [cardId],
});

function networkSegments(impactsBySegment = {}) {
  return SEGMENTS.map(([lineId, from, to]) => {
    const a = stationById.get(from);
    const b = stationById.get(to);
    const id = `${lineId}-${from}-${to}`;
    const impacts = impactsBySegment[id] ?? [];
    return {
      id,
      lineId,
      label: `${a.name} to ${b.name}`,
      stationAId: from,
      stationBId: to,
      stationAAnchorId: `station-${from}`,
      stationBAnchorId: `station-${to}`,
      pathD: `M ${a.x} ${a.y} L ${b.x} ${b.y}`,
      overlay: impacts.some((item) => item.kind === "suspension") ? "suspension" : impacts.length ? "delay" : "clear",
      impacts,
    };
  });
}

const activeAlert = (id, lineId, severity, title, affectedSegmentIds, extra = {}) => ({
  id, lineId, lineNumber: lineId.replace("line-", "").toUpperCase(), title, severity, location: "",
  description: "", affectedSegmentIds, shuttle: false, source: "Fixture", ...extra,
});
const delay = (id, lineId, title, affectedSegmentIds, extra = {}) => ({
  id, lineId, lineNumber: lineId.replace("line-", "").toUpperCase(), title, location: "", description: "",
  affectedSegmentIds, source: "Fixture", ...extra,
});
const rsz = (id, lineId, affectedSegmentIds, extra = {}) => ({
  id, lineId, lineNumber: lineId.replace("line-", "").toUpperCase(), title: "Reduced speed", location: "",
  description: "", affectedSegmentIds, source: "Fixture", ...extra,
});
const plannedClosure = (id, lineId, title, previewSegmentIds, extra = {}) => ({
  id, lineId, lineNumber: lineId.replace("line-", "").toUpperCase(), title, window: "Sat", location: "",
  description: "", previewSegmentIds, shuttle: false, source: "Fixture", timingStatus: "upcoming", ...extra,
});

/** The same input for both adapters (TTC also reads `mapStations`). */
function scenario(overrides = {}) {
  return {
    networkSegments: networkSegments(),
    activeAlerts: [],
    delays: [],
    reducedSpeedZones: [],
    plannedClosures: [],
    stationNodeImpacts: [],
    mapStations: stations,
    stations,
    selection: null,
    commutePathPreview: null,
    ...overrides,
  };
}

// Current service: a suspension over all of line A with a delay over the same
// stretch, a southbound reduced speed zone on Dogwood to Birch (so Birch, an
// interchange, points three ways), station-only delays at a regular dot
// (Alder) and a large interchange dot (Birch), and a commute from Alder to
// Cedar. Station badges at Alder and Birch explain the shared stretch.
const service = () => scenario({
  networkSegments: networkSegments({
    [A1]: [impact("suspension", "s1"), impact("delay", "d1")],
    [A2]: [impact("suspension", "s1"), impact("delay", "d1")],
    [B1]: [impact("reduced-speed-zone", "r1")],
  }),
  activeAlerts: [activeAlert("s1", "line-a", "suspension", "No service", [A1, A2], {
    displayDirection: "Eastbound and Westbound",
  })],
  delays: [
    delay("d1", "line-a", "Delay", [A1, A2]),
    delay("sd1", "line-a", "Station delay", [], { displayDirection: "Eastbound" }),
    delay("sd2", "line-b", "Interchange delay", []),
  ],
  reducedSpeedZones: [rsz("r1", "line-b", [B1], { displayDirection: "Southbound" })],
  stationNodeImpacts: [
    { stationId: "alder", kind: "delay", cardId: "sd1", title: "Station delay" },
    { stationId: "birch", kind: "delay", cardId: "sd2", title: "Interchange delay" },
  ],
  commutePathPreview: {
    id: "c1", commuteId: "commute-1", legId: "outbound", label: "Home", routeLabel: "Line A",
    segmentIds: [A1, A2], stationIds: ["alder", "birch", "cedar"],
  },
});

// A suspension and a delay sharing all of line A, with nothing else at its
// stations: one segment badge over two segments.
const overlap = () => scenario({
  networkSegments: networkSegments({
    [A1]: [impact("suspension", "s1"), impact("delay", "d1")],
    [A2]: [impact("suspension", "s1"), impact("delay", "d1")],
  }),
  activeAlerts: [activeAlert("s1", "line-a", "suspension", "No service", [A1, A2])],
  delays: [delay("d1", "line-a", "Delay", [A1, A2])],
});

// An upcoming planned closure on Birch to Elm, under a current delay there.
// TTC's backend sends upcoming closures as `plannedClosures` only; GO/UP's
// also lists them in the segment's impacts. Each encoding is one case.
const upcomingPlanned = ({ segmentImpact }) => scenario({
  networkSegments: networkSegments({
    [B2]: [impact("delay", "d2"), ...(segmentImpact ? [impact("planned-closure", "p1")] : [])],
  }),
  delays: [delay("d2", "line-b", "Delay", [B2])],
  plannedClosures: [plannedClosure("p1", "line-b", "Weekend closure", [B2], { location: "Birch to Elm" })],
});

// A planned closure in effect now on Birch to Cedar, as TTC's backend sends
// it: in the segment's impacts and marked current. (GO/UP's backend sends a
// current closure as a suspension.)
const currentPlanned = (overrides = {}) => scenario({
  networkSegments: networkSegments({ [A2]: [impact("planned-closure", "p2")] }),
  plannedClosures: [plannedClosure("p2", "line-a", "Early closure", [A2], {
    location: "Birch to Cedar", activeNow: true, timingStatus: "active-now",
  })],
  ...overrides,
});

// A line-wide alert with no listed segments.
const lineWide = () => scenario({
  activeAlerts: [activeAlert("w1", "line-b", "suspension", "No service on line B", [])],
});

// A one-direction delay over all of line A, listed Cedar-end first.
const directional = () => scenario({
  networkSegments: networkSegments({
    [A1]: [impact("delay", "d3", "forward")],
    [A2]: [impact("delay", "d3", "forward")],
  }),
  delays: [delay("d3", "line-a", "Eastbound delay", [A2, A1])],
});

const ttc = (input) => ttcMapContent(ttcGeometry, input);
const regional = (input) => regionalMapContent(regionalGeometry, input);

// --- Normalisation

const round = (value) => Math.round(value * 10) / 10;

/** A path as its subpaths' corner points: formatting and collinear midpoints dropped. */
function pathShape(pathD) {
  if (!pathD) return [];
  assert.doesNotMatch(pathD, /[ACQSTHVZ]/i, "fixture paths are straight lines");
  return pathD.split(/(?=M)/).map((subpath) => {
    const numbers = subpath.match(/-?\d+(?:\.\d+)?/g).map(Number);
    const points = [];
    for (let index = 0; index < numbers.length; index += 2) {
      const point = [round(numbers[index]), round(numbers[index + 1])];
      const last = points.at(-1);
      if (!last || last[0] !== point[0] || last[1] !== point[1]) points.push(point);
    }
    return points.filter((point, index) => {
      if (index === 0 || index === points.length - 1) return true;
      const [a, b] = [points[index - 1], points[index + 1]];
      return Math.abs((point[0] - a[0]) * (b[1] - a[1]) - (point[1] - a[1]) * (b[0] - a[0])) > 1e-6;
    });
  });
}

/** A corridor's subpaths, each drawn the same either way along it. */
function corridorShape(pathD) {
  return pathShape(pathD)
    .map((points) => {
      const forward = JSON.stringify(points);
      const backward = JSON.stringify([...points].reverse());
      return forward < backward ? forward : backward;
    })
    .sort();
}

const visualStates = (content) => content.lineAlerts
  .map((alert) => [alert.kind, alert.impactId, alert.visualState])
  .sort((a, b) => a.join().localeCompare(b.join()));
const paintOrder = (content) => content.lineAlerts.map((alert) => `${alert.kind}:${alert.impactId}`);
const corridors = (content) => content.lineAlerts
  .map((alert) => ({
    impact: `${alert.kind}:${alert.impactId}`,
    lineId: alert.lineId,
    segmentIds: [...alert.segmentIds].sort(),
    shape: corridorShape(alert.pathD),
  }))
  .sort((a, b) => a.impact.localeCompare(b.impact));
/** Where a directional alert's chevrons head: from one end of its corridor to the other. */
const travel = (content) => content.lineAlerts.map((alert) => {
  const points = pathShape(alert.pathD).flat();
  const ends = [points[0], points.at(-1)];
  return {
    impact: `${alert.kind}:${alert.impactId}`,
    heads: alert.travelDirection === "bidirectional" ? "both ways"
      : alert.travelDirection === "reverse" ? ends.reverse() : ends,
  };
});
const lineLabels = (content) => content.lineAlerts.map((alert) => alert.label).sort();
const selected = (content) => content.selectedLineAlerts.map((alert) => ({
  impact: `${alert.kind}:${alert.impactId}`,
  shape: corridorShape(alert.pathD),
}));
const badges = (content) => content.overlapBadges
  .map((badge) => ({
    at: badge.stationPoint ? "station" : "segment",
    label: badge.label,
    impacts: badge.impacts.map((item) => `${item.kind}:${item.cardId}`).sort(),
  }))
  .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const stationAlertLabels = (content) => content.stationAlerts.map((alert) => [alert.stationId, alert.label]).sort();
// Anchor ids are TTC's station ids and GO/UP's artwork ids (`station-…`);
// they key nothing a rider sees, so the prefix is dropped.
const anchorStation = (anchorId) => anchorId.replace(/^station-/, "");
const stationAlertAnchors = (content) => content.stationAlerts
  .map((alert) => [alert.stationId, alert.anchors.map((anchor) => [
    anchorStation(anchor.id), round(anchor.center.x), round(anchor.center.y),
  ])])
  .sort();
/** Station alert sizes as ratios of the station's authored dot radius. */
const stationAlertSizes = (content) => content.stationAlerts
  .map((alert) => ({
    stationId: alert.stationId,
    anchors: alert.anchors.map((anchor) => ({
      core: round(anchor.coreRadius / dotRadius(alert.stationId) * 100) / 100,
      ring: round(anchor.ringRadius / dotRadius(alert.stationId) * 100) / 100,
    })),
  }))
  .sort((a, b) => a.stationId.localeCompare(b.stationId));
const glyphDirections = (content) => content.stationDirectionGlyphs
  .map((glyph) => [anchorStation(glyph.anchorId), JSON.stringify(glyph.direction)])
  .sort();
const glyphSizes = (content) => content.stationDirectionGlyphs
  .map((glyph) => [anchorStation(glyph.anchorId), round(glyph.radius / dotRadius(anchorStation(glyph.anchorId)) * 100) / 100])
  .sort();
const commuteEnds = (content) => content.commutePreview && {
  label: content.commutePreview.label,
  ends: content.commutePreview.endpoints.map((end) => [end.role, end.stationId, round(end.center.x), round(end.center.y)]),
};
const commuteRoute = (content) => corridorShape(content.commutePreview?.pathD);
const commuteSizes = (content) => content.commutePreview?.endpoints.map((end) => ({
  stationId: end.stationId,
  dot: round(end.dotRadius / dotRadius(end.stationId) * 100) / 100,
  flash: round(end.flashRadius / dotRadius(end.stationId) * 100) / 100,
}));
/** The ring a badge connector keeps clear of at each dot (its clearance, in overlay units, taken off), as a ratio of the dot. */
const badgeStationDots = (content, unit) => content.badgePlacement.stationDots
  .map((dot) => {
    const station = STATIONS.find((item) => item.x === dot.center.x && item.y === dot.center.y);
    const ring = dot.radius - CONNECTOR_STATION_CLEARANCE * unit;
    return [station.id, round(ring / dotRadius(station.id) * 100) / 100];
  })
  .sort();

/** Asserts both adapters draw `input` the same, by `normalise`. */
function same(input, normalise) {
  const input2 = typeof input === "function" ? input() : input;
  assert.deepEqual(normalise(regional(input2)), normalise(ttc(input2)));
}

// --- Cases

describe("map content parity: line alerts", () => {
  it("draws each current kind in the same visual state", () => same(service, visualStates));
  it("paints the same alerts in the same order, the most severe last", () => same(service, paintOrder));
  it("composes each alert's corridor to the same shape", () => same(service, corridors));
  it("labels line alerts the same", () => same(service, lineLabels));
  it("emphasizes the same corridor for a selection", () => (
    same(scenario({ ...service(), selection: { kind: "suspension", id: "s1" } }), selected)
  ));
  it("heads a directional alert the same way along its corridor", () => same(directional, travel));

  it("draws a current planned closure as current service (red)", { todo: "item 1: GO/UP draws it planned-preview blue" }, () => {
    same(currentPlanned, visualStates);
    assert.deepEqual(visualStates(ttc(currentPlanned())).map(([, , state]) => state), ["suspension"]);
  });
  it("draws an upcoming planned closure listed only in planned closures as a blue preview", {
    todo: "item 1: GO/UP draws previews only from segment impacts, so it draws nothing",
  }, () => {
    same(upcomingPlanned({ segmentImpact: false }), visualStates);
  });
  it("draws an upcoming planned closure listed in segment impacts as a blue preview", {
    todo: "item 1: TTC treats any segment planned-closure impact as current and draws it red",
  }, () => {
    same(upcomingPlanned({ segmentImpact: true }), visualStates);
    assert.ok(visualStates(ttc(upcomingPlanned({ segmentImpact: true }))).some(([kind, , state]) => (
      kind === "planned-closure" && state === "planned-preview"
    )));
  });
  it("paints a planned preview under current alerts", () => same(upcomingPlanned({ segmentImpact: true }), paintOrder));
  it("labels a planned preview the same", { todo: "item 6: TTC names the closure, GO/UP the kind" }, () => {
    same(upcomingPlanned({ segmentImpact: false }), lineLabels);
  });
  it("previews a selected current planned closure the same", { todo: "item 1: TTC adds a preview layer, GO/UP does not" }, () => {
    same(currentPlanned({ selection: { kind: "planned-closure", id: "p2" } }), visualStates);
  });
  it("draws a line-wide alert without listed segments over the same corridor", {
    todo: "item 3: GO/UP draws the authored route, TTC draws nothing",
  }, () => {
    same(lineWide, corridors);
  });
});

describe("map content parity: overlap badges", () => {
  it("badges alerts that meet at a station the same", () => same(service, badges));
  it("badges alerts that share a stretch with the same members", () => {
    const members = (content) => badges(content).map(({ at, impacts }) => ({ at, impacts }));
    same(overlap, members);
    assert.equal(badges(ttc(overlap())).length, 1);
  });
  it("labels a badge over several segments the same", {
    todo: "item 6: TTC labels it 'Alder to Birch through Birch to Cedar', GO/UP 'Alder to Cedar'",
  }, () => same(overlap, badges));
  it("includes an upcoming planned preview in its stretch's badge", {
    todo: "item 4: GO/UP groups segment impacts only",
  }, () => {
    same(upcomingPlanned({ segmentImpact: false }), badges);
    assert.ok(badges(ttc(upcomingPlanned({ segmentImpact: false }))).some((badge) => badge.impacts.includes("planned-closure:p1")));
  });
  it("keeps badge connectors off station dots by the same margin, relative to the dot", {
    todo: "item 5: TTC uses fixed ring radii, GO/UP each dot's radius",
  }, () => {
    assert.deepEqual(badgeStationDots(regional(service()), REGIONAL_OVERLAY_UNIT), badgeStationDots(ttc(service()), 1));
  });
});

describe("map content parity: station alerts", () => {
  it("places station alerts on the same dots", () => same(service, stationAlertAnchors));
  it("labels station alerts the same", () => same(service, stationAlertLabels));
  it("sizes station alerts the same relative to their dot", {
    todo: "item 5: TTC uses fixed radii by LARGE_TERMINAL_IDS and interchange, GO/UP ratios of the dot",
  }, () => same(service, stationAlertSizes));
  it("points station and interchange arrows the same ways", () => {
    same(service, glyphDirections);
    assert.equal(glyphDirections(ttc(service())).length, 2, "Alder's and Birch's arrows");
  });
  it("sizes direction arrows the same relative to their dot", { todo: "item 5: fixed radii vs dot ratios" }, () => (
    same(service, glyphSizes)
  ));
});

describe("map content parity: commute preview", () => {
  it("previews the same commute ends", () => same(service, commuteEnds));
  it("draws the commute route as one path", {
    todo: "item 3: TTC composes one path, GO/UP joins one subpath per segment",
  }, () => same(service, commuteRoute));
  it("sizes the endpoints the same relative to their dot", {
    todo: "item 7: TTC uses fixed radii (34, 38/48/33), GO/UP ratios of the dot",
  }, () => same(service, commuteSizes));
});

describe("map content parity: train markers", () => {
  const marker = {
    id: "t1", lineId: "line-a", segmentId: A1, direction: "Eastbound", nextStationId: "birch",
    progress: 0.5, travelDirection: "forward",
  };
  it("labels an estimated train the same way", {
    todo: "item 7: per-network label formats (TTC 'Line 1 … estimated train near …', GO/UP '… toward …; schematic …')",
  }, () => {
    assert.equal(regionalTrainMarkerPlacement(regionalGeometry).label(marker), TTC_TRAIN_MARKER_PLACEMENT.label(marker));
  });
});
