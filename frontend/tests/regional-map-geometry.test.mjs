import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  REGIONAL_MAP_VIEWBOX,
  REGIONAL_IMPACT_OVERLAY_WIDTH,
  REGIONAL_OVERLAP_INDICATOR_SCALE,
  REGIONAL_OVERLAP_INDICATOR_EDGE_GAP,
  REGIONAL_STATION_IMPACT_EFFECT_RADIUS_RATIO,
  REGIONAL_STATION_IMPACT_BADGE_RADIUS_RATIO,
  REGIONAL_TRAIN_MARKER_LANE_OFFSET,
  squaredPointDistance,
  applySvgTransform,
  pointInRegionalStationsLayer,
  pointInSvgRootCoordinates,
  pointFromSvgRootCoordinates,
  pointInRegionalStationsCoordinates,
  readRegionalStationAnchorPoint,
  svgAnchorPoint,
  svgAnchorPointInRootCoordinates,
  regionalStationVisualAnchors,
  regionalStationImpactAnchors,
  regionalRoutePathIds,
  regionalRouteMetric,
  regionalRouteMetricInRoot,
  closestRouteDistance,
  routePointsBetween,
  pathDataForPoints,
  corridorSegmentPath,
  corridorSegmentPathInRootCoordinates,
  authoredRegionalCorridorPathData,
  resolvedRegionalSegmentPath,
  continuousRegionalOverlayRunPath,
  regionalTrainMarkerFrame,
  regionalHoverMaskBounds,
  regionalBadgeCollisionBox,
  expandedRegionalCollisionBox,
  regionalCollisionIntersectionArea,
  clampRegionalOverlapBadgePosition,
  regionalOverlapBadgePositionCandidates,
} from "../src/app/regional-map-geometry.ts";

function createMockSvgNode({
  nodeName = "g",
  id = "",
  transform = null,
  attributes = {},
  dataset = {},
  parent = null,
  children = [],
} = {}) {
  const node = {
    nodeName,
    tagName: nodeName,
    id,
    dataset: { ...dataset },
    parentElement: parent,
    children: [],
    getAttribute(name) {
      if (name === "id") return this.id || null;
      if (name === "transform") return this.transform;
      return attributes[name] ?? null;
    },
    setAttribute(name, value) {
      if (name === "id") this.id = String(value);
      if (name === "transform") this.transform = String(value);
      attributes[name] = String(value);
    },
    removeAttribute(name) {
      delete attributes[name];
      if (name === "id") this.id = "";
      if (name === "transform") this.transform = null;
    },
    matches(selector) {
      const parts = selector.split(",").map((s) => s.trim().toLowerCase());
      return parts.includes(this.nodeName.toLowerCase());
    },
    cloneNode(deep) {
      const cloned = createMockSvgNode({
        nodeName: this.nodeName,
        id: this.id,
        transform: this.transform,
        attributes: { ...attributes },
        dataset: { ...this.dataset },
      });
      if (deep) {
        for (const child of this.children) {
          const childClone = child.cloneNode(true);
          childClone.parentElement = cloned;
          cloned.children.push(childClone);
        }
      }
      return cloned;
    },
    querySelector(selector) {
      for (const child of this.children) {
        if (selector.startsWith("#") && child.id === selector.slice(1)) return child;
        if (child.matches?.(selector)) return child;
        const found = child.querySelector?.(selector);
        if (found) return found;
      }
      return null;
    },
    querySelectorAll(selector) {
      const results = [];
      const parts = selector.split(",").map((s) => s.trim().toLowerCase());
      const check = (n) => {
        for (const child of n.children) {
          if (parts.includes(child.nodeName.toLowerCase())) results.push(child);
          else if (selector.startsWith("#") && child.id === selector.slice(1)) results.push(child);
          check(child);
        }
      };
      check(this);
      return results;
    },
  };
  node.transform = transform;
  for (const child of children) {
    child.parentElement = node;
    node.children.push(child);
  }
  return node;
}

function parsePolylinePointsFromD(d) {
  if (!d) return [];
  const coords = d.match(/[-+]?\d*\.?\d+/g)?.map(Number) ?? [];
  const points = [];
  for (let i = 0; i + 1 < coords.length; i += 2) {
    points.push({ x: coords[i], y: coords[i + 1] });
  }
  return points;
}

function createMockPath({
  id = "",
  points = [{ x: 0, y: 0 }, { x: 100, y: 0 }],
  transform = null,
  parent = null,
} = {}) {
  const node = createMockSvgNode({
    nodeName: "path",
    id,
    transform,
    parent,
    attributes: { d: pathDataForPoints(points) },
  });

  const getPoints = () => {
    const d = node.getAttribute("d");
    const parsed = parsePolylinePointsFromD(d);
    return parsed.length >= 2 ? parsed : points;
  };

  node.getTotalLength = () => {
    const pts = getPoints();
    let sum = 0;
    for (let i = 1; i < pts.length; i++) {
      sum += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    return sum;
  };

  node.getPointAtLength = (distance) => {
    const pts = getPoints();
    const lengths = pts.slice(1).map((pt, i) => Math.hypot(pt.x - pts[i].x, pt.y - pts[i].y));
    const totalLength = lengths.reduce((sum, len) => sum + len, 0);
    const target = Math.max(0, Math.min(totalLength, distance));
    let walked = 0;
    for (let i = 1; i < pts.length; i++) {
      const segLen = lengths[i - 1];
      if (walked + segLen >= target) {
        const progress = segLen <= 0 ? 0 : (target - walked) / segLen;
        return {
          x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * progress,
          y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * progress,
        };
      }
      walked += segLen;
    }
    return pts[pts.length - 1];
  };

  return node;
}

function createMockDocument(elementsById = {}) {
  return {
    getElementById: (id) => elementsById[id] ?? null,
    createElementNS: (_ns, tag) => {
      if (tag === "path") {
        return createMockPath();
      }
      return createMockSvgNode({ nodeName: tag });
    },
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

describe("regional map geometry", () => {
  describe("constants and pure point math", () => {
    it("exports standard regional dimensions and layout ratios", () => {
      assert.equal(REGIONAL_MAP_VIEWBOX.width, 17036.959);
      assert.equal(REGIONAL_MAP_VIEWBOX.height, 9031.6719);
      assert.equal(REGIONAL_IMPACT_OVERLAY_WIDTH, 196);
      assert.equal(REGIONAL_OVERLAP_INDICATOR_SCALE, 2.5);
      assert.equal(REGIONAL_OVERLAP_INDICATOR_EDGE_GAP, 88);
      assert.equal(REGIONAL_STATION_IMPACT_EFFECT_RADIUS_RATIO, 0.9);
      assert.equal(REGIONAL_STATION_IMPACT_BADGE_RADIUS_RATIO, 0.72);
      assert.equal(REGIONAL_TRAIN_MARKER_LANE_OFFSET, 44);
    });

    it("computes squared Euclidean distance accurately", () => {
      assert.equal(squaredPointDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 25);
      assert.equal(squaredPointDistance({ x: 10, y: 20 }, { x: 10, y: 20 }), 0);
      assert.equal(squaredPointDistance({ x: -5, y: -2 }, { x: -2, y: 2 }), 25);
    });
  });

  describe("SVG transform parsing and point transformations", () => {
    it("handles identity, null, and empty transforms", () => {
      const origin = { x: 50, y: 75 };
      assert.deepEqual(applySvgTransform(origin, null), origin);
      assert.deepEqual(applySvgTransform(origin, ""), origin);
      assert.deepEqual(applySvgTransform(origin, "unknown()"), origin);
    });

    it("applies translate(x, y) and single-argument translate(x)", () => {
      const pt = { x: 10, y: 20 };
      assert.deepEqual(applySvgTransform(pt, "translate(15, 25)"), { x: 25, y: 45 });
      assert.deepEqual(applySvgTransform(pt, "translate(30)"), { x: 40, y: 20 });
      assert.deepEqual(applySvgTransform(pt, "translate(-5, -10)"), { x: 5, y: 10 });
    });

    it("applies scale(s) and scale(sx, sy)", () => {
      const pt = { x: 10, y: 20 };
      assert.deepEqual(applySvgTransform(pt, "scale(2)"), { x: 20, y: 40 });
      assert.deepEqual(applySvgTransform(pt, "scale(3, 4)"), { x: 30, y: 80 });
    });

    it("applies rotate(deg) around origin and around a pivot point", () => {
      const pt = { x: 10, y: 0 };
      const rotated90 = applySvgTransform(pt, "rotate(90)");
      assert.ok(Math.abs(rotated90.x - 0) < 1e-6);
      assert.ok(Math.abs(rotated90.y - 10) < 1e-6);

      const pivotPt = { x: 15, y: 10 };
      const rotatedAroundPivot = applySvgTransform(pivotPt, "rotate(90, 10, 10)");
      assert.ok(Math.abs(rotatedAroundPivot.x - 10) < 1e-6);
      assert.ok(Math.abs(rotatedAroundPivot.y - 15) < 1e-6);
    });

    it("applies matrix(a, b, c, d, e, f)", () => {
      const pt = { x: 10, y: 20 };
      assert.deepEqual(applySvgTransform(pt, "matrix(1, 0, 0, 1, 5, 7)"), { x: 15, y: 27 });
      assert.deepEqual(applySvgTransform(pt, "matrix(2, 0, 0, 2, 3, 4)"), { x: 23, y: 44 });
    });

    it("composes chained transforms in sequential order", () => {
      const pt = { x: 10, y: 20 };
      const transformed = applySvgTransform(pt, "translate(10, 10) scale(2)");
      assert.deepEqual(transformed, { x: 40, y: 60 });
    });
  });

  describe("DOM transform hierarchy and coordinate space conversions", () => {
    it("maps point through ancestor transforms up to root SVG and into stations layer", () => {
      const svgRoot = createMockSvgNode({ nodeName: "svg" });
      const stationsLayer = createMockSvgNode({
        nodeName: "g",
        id: "regional-stations-layer",
        transform: "translate(100, 200)",
        parent: svgRoot,
      });
      const subLayer = createMockSvgNode({
        nodeName: "g",
        transform: "scale(2)",
        parent: stationsLayer,
      });
      const element = createMockSvgNode({
        nodeName: "g",
        transform: "translate(10, 20)",
        parent: subLayer,
      });

      const rootPoint = pointInSvgRootCoordinates(element, { x: 5, y: 5 });
      assert.deepEqual(rootPoint, { x: 130, y: 250 });

      const layerPoint = pointInRegionalStationsLayer(element, { x: 5, y: 5 });
      // Stops at stationsLayer: in element: (15, 25), in subLayer: (30, 50)
      assert.deepEqual(layerPoint, { x: 30, y: 50 });
    });

    it("inverts root coordinates back to local coordinates", () => {
      const svgRoot = createMockSvgNode({ nodeName: "svg" });
      const layer = createMockSvgNode({
        nodeName: "g",
        transform: "translate(500, 300)",
        parent: svgRoot,
      });

      const localPoint = { x: 120, y: 80 };
      const rootPoint = pointInSvgRootCoordinates(layer, localPoint);
      assert.deepEqual(rootPoint, { x: 620, y: 380 });

      const inverted = pointFromSvgRootCoordinates(layer, rootPoint);
      assert.ok(Math.abs(inverted.x - localPoint.x) < 1e-4);
      assert.ok(Math.abs(inverted.y - localPoint.y) < 1e-4);
    });

    it("converts points between arbitrary layers via root", () => {
      const svgRoot = createMockSvgNode({ nodeName: "svg" });
      const layerA = createMockSvgNode({
        nodeName: "g",
        transform: "translate(100, 100)",
        parent: svgRoot,
      });
      const layerB = createMockSvgNode({
        nodeName: "g",
        transform: "translate(250, 400)",
        parent: svgRoot,
      });

      const ptInA = { x: 50, y: 50 };
      const ptInB = pointInRegionalStationsCoordinates(ptInA, layerA, layerB);
      assert.ok(Math.abs(ptInB.x - (-100)) < 1e-4);
      assert.ok(Math.abs(ptInB.y - (-250)) < 1e-4);
    });
  });

  describe("station anchor resolution", () => {
    it("reads circle and ellipse anchor coordinates including local transforms", () => {
      const svgRoot = createMockSvgNode({ nodeName: "svg" });
      const stationsLayer = createMockSvgNode({
        nodeName: "g",
        id: "regional-stations-layer",
        parent: svgRoot,
      });
      const circle = createMockSvgNode({
        nodeName: "circle",
        id: "station-danforth-dot",
        attributes: { cx: "200", cy: "300", r: "15" },
        transform: "translate(10, -5)",
        parent: stationsLayer,
      });
      stationsLayer.children.push(circle);
      svgRoot.children.push(stationsLayer);

      const mockDoc = createMockDocument({
        "regional-stations-layer": stationsLayer,
        "station-danforth-dot": circle,
        "station-danforth": circle,
      });

      const anchor = readRegionalStationAnchorPoint(mockDoc, "station-danforth-dot");
      assert.deepEqual(anchor, { x: 210, y: 295 });

      const resolvedAnchor = svgAnchorPoint(mockDoc, "station-danforth-dot");
      assert.deepEqual(resolvedAnchor, { x: 210, y: 295 });

      const rootAnchor = svgAnchorPointInRootCoordinates(mockDoc, "station-danforth-dot");
      assert.deepEqual(rootAnchor, { x: 210, y: 295 });
    });

    it("resolves route-specific anchors for multi-corridor interchanges", () => {
      const svgRoot = createMockSvgNode({ nodeName: "svg" });
      const stationsLayer = createMockSvgNode({
        nodeName: "g",
        id: "regional-stations-layer",
        parent: svgRoot,
      });
      const stationGroup = createMockSvgNode({
        nodeName: "g",
        id: "station-bloor",
        parent: stationsLayer,
      });
      const kiCircle = createMockSvgNode({
        nodeName: "circle",
        id: "station-bloor-ki",
        attributes: { cx: "400", cy: "500", r: "12" },
        parent: stationGroup,
      });
      const upCircle = createMockSvgNode({
        nodeName: "circle",
        id: "station-bloor-up",
        attributes: { cx: "420", cy: "500", r: "12" },
        parent: stationGroup,
      });
      stationGroup.children.push(kiCircle, upCircle);
      stationsLayer.children.push(stationGroup);
      svgRoot.children.push(stationsLayer);

      const visualAnchors = regionalStationVisualAnchors(stationGroup);
      assert.equal(visualAnchors.length, 2);

      const kiAnchors = regionalStationImpactAnchors(stationGroup, "KI");
      assert.equal(kiAnchors.length, 1);
      assert.equal(kiAnchors[0].id, "station-bloor-ki");
      assert.deepEqual(kiAnchors[0].point, { x: 400, y: 500 });

      const upAnchors = regionalStationImpactAnchors(stationGroup, "regional-up");
      assert.equal(upAnchors.length, 1);
      assert.equal(upAnchors[0].id, "station-bloor-up");
      assert.deepEqual(upAnchors[0].point, { x: 420, y: 500 });

      // Unmatched line falls back to all anchors
      const fallbackAnchors = regionalStationImpactAnchors(stationGroup, "LW");
      assert.equal(fallbackAnchors.length, 2);
    });
  });

  describe("route path mapping and corridor paths", () => {
    it("maps line codes to their authored SVG path identifiers", () => {
      assert.deepEqual(regionalRoutePathIds("LW"), [
        "regional-route-lw-main-path",
        "regional-route-lw-branch-path",
      ]);
      assert.deepEqual(regionalRoutePathIds("line-lw"), [
        "regional-route-lw-main-path",
        "regional-route-lw-branch-path",
      ]);
      assert.deepEqual(regionalRoutePathIds("UP"), [
        "regional-route-up-path",
        "regional-route-up-airport-path",
      ]);
      assert.deepEqual(regionalRoutePathIds("KI"), ["regional-route-ki-path"]);
      assert.deepEqual(regionalRoutePathIds("LE"), ["regional-route-le-path"]);
      assert.deepEqual(regionalRoutePathIds("MI"), ["regional-route-mi-path"]);
      assert.deepEqual(regionalRoutePathIds("RH"), ["regional-route-rh-path"]);
      assert.deepEqual(regionalRoutePathIds("BR"), ["regional-route-br-path"]);
      assert.deepEqual(regionalRoutePathIds("ST"), ["regional-route-st-path"]);
    });

    it("samples points along a route metric and computes distances", () => {
      const svgRoot = createMockSvgNode({ nodeName: "svg" });
      const stationsLayer = createMockSvgNode({
        nodeName: "g",
        id: "regional-stations-layer",
        parent: svgRoot,
      });
      const path = createMockPath({
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
        parent: stationsLayer,
      });
      stationsLayer.children.push(path);
      svgRoot.children.push(stationsLayer);

      const metric = regionalRouteMetric(path, stationsLayer);
      assert.notEqual(metric, null);
      assert.equal(metric.length, 200);

      const rootMetric = regionalRouteMetricInRoot(path);
      assert.notEqual(rootMetric, null);
      assert.equal(rootMetric.length, 200);

      const closest = closestRouteDistance(metric, { x: 50, y: 2 });
      assert.ok(Math.abs(closest.distance - 50) < 1);

      const sampled = routePointsBetween(metric, 10, 90);
      assert.ok(sampled.length >= 2);
      assert.ok(Math.abs(sampled[0].x - 10) < 1);
      assert.ok(Math.abs(sampled.at(-1).x - 90) < 1);
    });

    it("resolves corridor segment paths in both layer and root spaces", () => {
      const svgRoot = createMockSvgNode({ nodeName: "svg" });
      const stationsLayer = createMockSvgNode({
        nodeName: "g",
        id: "regional-stations-layer",
        parent: svgRoot,
      });
      const path = createMockPath({
        id: "regional-route-le-path",
        points: [{ x: 100, y: 100 }, { x: 500, y: 100 }],
        parent: stationsLayer,
      });
      const danforthDot = createMockSvgNode({
        nodeName: "circle",
        id: "station-danforth",
        attributes: { cx: "100", cy: "100", r: "10" },
        parent: stationsLayer,
      });
      const scarboroughDot = createMockSvgNode({
        nodeName: "circle",
        id: "station-scarborough",
        attributes: { cx: "500", cy: "100", r: "10" },
        parent: stationsLayer,
      });
      stationsLayer.children.push(path, danforthDot, scarboroughDot);
      svgRoot.children.push(stationsLayer);

      const mockDoc = createMockDocument({
        "regional-stations-layer": stationsLayer,
        "regional-route-le-path": path,
        "station-danforth": danforthDot,
        "station-scarborough": scarboroughDot,
      });

      const segment = {
        id: "le-danforth-scarborough",
        lineId: "LE",
        stationAId: "danforth",
        stationBId: "scarborough",
        stationAAnchorId: "station-danforth",
        stationBAnchorId: "station-scarborough",
        guidePathId: "regional-route-le-path",
      };

      const pathD = corridorSegmentPath(mockDoc, segment);
      assert.notEqual(pathD, null);

      const rootPathD = corridorSegmentPathInRootCoordinates(mockDoc, segment);
      assert.notEqual(rootPathD, null);

      const authoredD = authoredRegionalCorridorPathData(mockDoc, segment.lineId);
      assert.notEqual(authoredD, null);

      const resolvedD = resolvedRegionalSegmentPath(mockDoc, segment);
      assert.notEqual(resolvedD, null);
    });

    it("joins continuous regional overlay runs and preserves authored path data", () => {
      const mockDoc = createMockDocument();

      const runSingle = {
        segments: [{ id: "seg-1", stationAId: "A", stationBId: "B" }],
        pathD: "M 0 0 L 100 0",
      };
      assert.equal(continuousRegionalOverlayRunPath(mockDoc, runSingle), "M 0 0 L 100 0");

      const runCycle = {
        segments: [
          { id: "seg-1", stationAId: "A", stationBId: "B" },
          { id: "seg-2", stationAId: "B", stationBId: "C" },
          { id: "seg-3", stationAId: "C", stationBId: "A" },
        ],
        pathD: "M 0 0 L 100 0 M 100 0 L 100 100 M 100 100 L 0 0",
      };
      assert.equal(continuousRegionalOverlayRunPath(mockDoc, runCycle), null);
    });
  });

  describe("train marker frames", () => {
    it("calculates marker point and angle offset along corridor", () => {
      const svgRoot = createMockSvgNode({ nodeName: "svg" });
      const stationsLayer = createMockSvgNode({
        nodeName: "g",
        id: "regional-stations-layer",
        parent: svgRoot,
      });
      const path = createMockPath({
        id: "regional-route-le-path",
        points: [{ x: 100, y: 100 }, { x: 500, y: 100 }],
        parent: stationsLayer,
      });
      const danforthDot = createMockSvgNode({
        nodeName: "circle",
        id: "station-danforth",
        attributes: { cx: "100", cy: "100", r: "10" },
        parent: stationsLayer,
      });
      const scarboroughDot = createMockSvgNode({
        nodeName: "circle",
        id: "station-scarborough",
        attributes: { cx: "500", cy: "100", r: "10" },
        parent: stationsLayer,
      });
      stationsLayer.children.push(path, danforthDot, scarboroughDot);
      svgRoot.children.push(stationsLayer);

      const mockDoc = createMockDocument({
        "regional-stations-layer": stationsLayer,
        "regional-route-le-path": path,
        "station-danforth": danforthDot,
        "station-scarborough": scarboroughDot,
      });

      const segment = {
        id: "le-danforth-scarborough",
        lineId: "LE",
        stationAId: "danforth",
        stationBId: "scarborough",
        stationAAnchorId: "station-danforth",
        stationBAnchorId: "station-scarborough",
        guidePathId: "regional-route-le-path",
      };

      const marker = {
        id: "marker-1",
        lineId: "LE",
        direction: "Eastbound",
        travelDirection: "forward",
        segmentId: segment.id,
        fromStationId: "danforth",
        toStationId: "scarborough",
        nextStationId: "scarborough",
        progress: 0.5,
        segmentTravelSeconds: 300,
        predictedAt: new Date().toISOString(),
      };

      const frame = regionalTrainMarkerFrame(mockDoc, segment, marker);
      assert.notEqual(frame, null);
      assert.ok(Math.abs(frame.point.x - 300) < 1);
      assert.ok(Math.abs(Math.abs(frame.point.y - 100) - REGIONAL_TRAIN_MARKER_LANE_OFFSET) < 1e-3);
    });
  });

  describe("hover mask bounds", () => {
    it("converts root viewBox into local layer coordinates", () => {
      const svgRoot = createMockSvgNode({ nodeName: "svg" });
      const layer = createMockSvgNode({
        nodeName: "g",
        transform: "translate(-1894.5755, 276.53711)",
        parent: svgRoot,
      });
      svgRoot.children.push(layer);

      const bounds = regionalHoverMaskBounds(layer, REGIONAL_MAP_VIEWBOX);
      assert.ok(bounds.x > REGIONAL_MAP_VIEWBOX.x);
      assert.ok(bounds.y < REGIONAL_MAP_VIEWBOX.y);
      assert.ok(Math.abs(bounds.width - REGIONAL_MAP_VIEWBOX.width) < 1);
      assert.ok(Math.abs(bounds.height - REGIONAL_MAP_VIEWBOX.height) < 1);
    });
  });

  describe("overlap badge collision geometry", () => {
    it("creates expanded collision boxes and checks intersection areas", () => {
      const box = { x: 100, y: 100, width: 50, height: 50 };
      const padded = expandedRegionalCollisionBox(box, 10);
      assert.deepEqual(padded, { x: 90, y: 90, width: 70, height: 70 });

      const badgeBox = regionalBadgeCollisionBox({ x: 100, y: 100 }, { width: 40, height: 20 });
      assert.equal(badgeBox.width, 40 * REGIONAL_OVERLAP_INDICATOR_SCALE);
      assert.equal(badgeBox.height, 20 * REGIONAL_OVERLAP_INDICATOR_SCALE);

      const disjointBox = { x: 200, y: 200, width: 50, height: 50 };
      assert.equal(regionalCollisionIntersectionArea(box, disjointBox), 0);

      const overlappingBox = { x: 120, y: 120, width: 50, height: 50 };
      assert.equal(regionalCollisionIntersectionArea(box, overlappingBox), 900);
    });

    it("clamps badge position within viewBox bounds including margin", () => {
      const size = { width: 60, height: 40 };
      const outOfBoundsLeft = { x: -300, y: 500 };
      const clamped = clampRegionalOverlapBadgePosition(outOfBoundsLeft, size);
      assert.ok(clamped.x >= REGIONAL_MAP_VIEWBOX.x);

      const outOfBoundsBottom = { x: 500, y: 15000 };
      const clampedBottom = clampRegionalOverlapBadgePosition(outOfBoundsBottom, size);
      assert.ok(clampedBottom.y <= REGIONAL_MAP_VIEWBOX.y + REGIONAL_MAP_VIEWBOX.height);
    });

    it("generates candidates along distance scales and angular offsets", () => {
      const badge = {
        anchor: { x: 500, y: 500 },
        preferredVector: { x: 40, y: 0 },
      };

      const candidates = regionalOverlapBadgePositionCandidates(badge);
      assert.equal(candidates.length, 144);
      assert.ok(Math.abs(candidates[0].x - 540) < 1e-6);
      assert.ok(Math.abs(candidates[0].y - 500) < 1e-6);
    });
  });
});
