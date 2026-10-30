import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { pathPolylinePoints, polylineLength, projectOntoPolyline } from "../src/app/map-geometry.ts";
import { preparedPoints } from "../src/app/map-geometry-data.ts";
import { regionalDashboardData } from "../src/app/regional-data.ts";
import {
  REGIONAL_IMPACT_OVERLAY_WIDTH,
  REGIONAL_MAP_VIEWBOX,
  REGIONAL_OVERLAP_INDICATOR_EDGE_GAP,
  REGIONAL_OVERLAP_INDICATOR_SCALE,
  REGIONAL_OVERLAY_UNIT,
  REGIONAL_TRAIN_MARKER_LANE_OFFSET,
  authoredRegionalCorridorPathData,
  continuousRegionalOverlayRunPath,
  corridorSegmentPath,
  expandedRegionalCollisionBox,
  regionalAnchorDot,
  regionalAnchorPoint,
  regionalCollisionIntersectionArea,
  regionalOverlapBadgeAnchor,
  regionalRoutePathIds,
  regionalStation,
  regionalStationImpactAnchors,
  regionalStationLabelHover,
  regionalStationLabelPolygon,
  regionalStationPillShape,
  regionalTrainMarkerFrame,
  resolvedRegionalSegmentPath,
  squaredPointDistance,
} from "../src/app/regional-map-geometry.ts";

// The prepared GO/UP geometry the map ships with (scripts/prepare-map-geometry.mjs).
const geometry = JSON.parse(readFileSync(new URL("../src/app/map-geometry/regional.json", import.meta.url), "utf8"));
const segments = regionalDashboardData.networkSegments;
const segment = (id) => segments.find((candidate) => candidate.id === id);
const route = (pathId) => preparedPoints(geometry.lines.find((line) => line.id === pathId).points);
const distance = (a, b) => Math.sqrt(squaredPointDistance(a, b));

describe("regional map geometry", () => {
  it("draws GO/UP overlays at its rail's width, in the root view box", () => {
    assert.equal(REGIONAL_OVERLAY_UNIT, 196 / 96);
    assert.deepEqual(geometry.viewBox, REGIONAL_MAP_VIEWBOX);
  });

  describe("stations", () => {
    it("finds a station's dots, and an alert's platform at a junction", () => {
      const bloor = regionalStation(geometry, "bloor");
      assert.deepEqual(bloor.anchors.map((anchor) => anchor.id), ["station-bloor-ki", "station-bloor-up"]);
      assert.deepEqual(regionalStationImpactAnchors(bloor, "regional-up").map((anchor) => anchor.id), ["station-bloor-up"]);
      // A line without a platform of its own keeps every dot.
      assert.equal(regionalStationImpactAnchors(bloor, "regional-lw").length, 2);
      assert.equal(regionalStation(geometry, "bloor-ki"), null);
    });

    it("resolves segment anchors to dots, and a junction group to its first dot", () => {
      const ki = regionalAnchorDot(geometry, "station-bloor-ki");
      assert.equal(ki.id, "station-bloor-ki");
      assert.deepEqual(regionalAnchorPoint(geometry, "station-bloor-ki"), { x: ki.point.x, y: ki.point.y });
      assert.equal(regionalAnchorDot(geometry, "station-bloor").id, "station-bloor-ki");
      assert.equal(regionalAnchorPoint(geometry, "station-missing"), null);
    });

    it("keeps Union's pill and its authored outline, and no other station's", () => {
      const union = regionalStationPillShape(geometry, "station-union");
      assert.equal(union.shape.tag, "rect");
      assert.ok(union.shape.strokeWidth > 0);
      assert.equal(regionalStationPillShape(geometry, "station-pickering"), undefined);
      // Bloor's connector bars are rects, but not pills.
      assert.equal(regionalStationPillShape(geometry, "rect6-2"), undefined);
    });
  });

  describe("segment corridors", () => {
    it("follows the authored route for every GO/UP segment, from station A to station B", () => {
      for (const candidate of segments) {
        const points = pathPolylinePoints(corridorSegmentPath(geometry, candidate) ?? "");
        assert.ok(points.length > 1, `${candidate.id} has no corridor`);
        const routes = regionalRoutePathIds(candidate.lineId).map(route);
        const offRoute = (point) => Math.min(...routes.map((points) => projectOntoPolyline(points, point).gap));
        assert.ok(points.every((point) => offRoute(point) < 0.01), `${candidate.id} leaves its route`);
        const start = regionalAnchorPoint(geometry, candidate.stationAAnchorId);
        const end = regionalAnchorPoint(geometry, candidate.stationBAnchorId);
        assert.ok(distance(points[0], start) < distance(points.at(-1), start), `${candidate.id} runs backwards`);
        assert.ok(distance(points.at(-1), end) < 150, `${candidate.id} stops short of ${candidate.stationBId}`);
      }
    });

    it("joins Lakeshore West's main line and Hamilton branch at the junction", () => {
      const toHamilton = pathPolylinePoints(corridorSegmentPath(geometry, segment("segment-lw-aldershot-hamilton")));
      const main = route("regional-route-lw-main-path");
      const branch = route("regional-route-lw-branch-path");
      const onMain = toHamilton.filter((point) => projectOntoPolyline(main, point).gap < 0.01);
      const onBranch = toHamilton.filter((point) => projectOntoPolyline(branch, point).gap < 0.01);
      assert.ok(onMain.length > 0 && onBranch.length > 0);
      // One continuous rail, not a chord between the stations.
      for (let index = 1; index < toHamilton.length; index++) {
        const midpoint = {
          x: (toHamilton[index - 1].x + toHamilton[index].x) / 2,
          y: (toHamilton[index - 1].y + toHamilton[index].y) / 2,
        };
        assert.ok(Math.min(projectOntoPolyline(main, midpoint).gap, projectOntoPolyline(branch, midpoint).gap) < 0.01);
      }
    });

    it("falls back to the chord between stations when a line has no authored route", () => {
      const chord = { ...segment("segment-ki-union-bloor"), lineId: "regional-zz", guidePathId: undefined };
      assert.equal(corridorSegmentPath(geometry, chord), null);
      const [start, end] = pathPolylinePoints(resolvedRegionalSegmentPath(geometry, chord));
      assert.deepEqual(start, regionalAnchorPoint(geometry, "station-union"));
      assert.deepEqual(end, regionalAnchorPoint(geometry, "station-bloor-ki"));
    });

    it("draws a whole line as one subpath per authored route path", () => {
      assert.equal(authoredRegionalCorridorPathData(geometry, "regional-lw").match(/M/g).length, 2);
      assert.equal(authoredRegionalCorridorPathData(geometry, "regional-up").match(/M/g).length, 2);
      assert.equal(authoredRegionalCorridorPathData(geometry, "regional-zz"), null);
    });

    it("joins a linear run into one path between its end stations, and keeps a branching run's pieces", () => {
      const run = ["segment-ki-union-bloor", "segment-ki-bloor-mount-dennis", "segment-ki-mount-dennis-weston"].map(segment);
      const joined = continuousRegionalOverlayRunPath(geometry, { segments: run, pathD: "M 0 0" });
      assert.equal(joined.match(/M/g).length, 1);
      assert.equal(joined, corridorSegmentPath(geometry, {
        ...run[0],
        stationBId: "weston",
        stationBAnchorId: "station-weston-ki",
      }));
      const branching = ["segment-lw-burlington-aldershot", "segment-lw-aldershot-west-harbour", "segment-lw-aldershot-hamilton"].map(segment);
      assert.equal(continuousRegionalOverlayRunPath(geometry, { segments: branching, pathD: "M 0 0" }), null);
    });
  });

  describe("train markers", () => {
    const upSegment = segment("segment-up-mount-dennis-weston");
    const marker = (overrides) => ({
      segmentId: upSegment.id,
      fromStationId: "mount-dennis",
      toStationId: "weston",
      nextStationId: "weston",
      progress: 0.5,
      travelDirection: "forward",
      ...overrides,
    });

    it("places a marker beside its corridor, in its lane, facing its direction of travel", () => {
      const corridor = pathPolylinePoints(corridorSegmentPath(geometry, upSegment));
      const westbound = regionalTrainMarkerFrame(geometry, upSegment, marker());
      const eastbound = regionalTrainMarkerFrame(geometry, upSegment, marker({
        fromStationId: "weston", toStationId: "mount-dennis", nextStationId: "mount-dennis",
      }));
      const gap = (frame) => projectOntoPolyline(corridor, frame.point).gap;
      assert.ok(Math.abs(gap(westbound) - REGIONAL_TRAIN_MARKER_LANE_OFFSET) < 1);
      assert.ok(Math.abs(gap(eastbound) - REGIONAL_TRAIN_MARKER_LANE_OFFSET) < 1);
      // Opposite directions take opposite lanes and headings.
      assert.ok(distance(westbound.point, eastbound.point) > REGIONAL_TRAIN_MARKER_LANE_OFFSET);
      assert.ok(Math.abs(Math.abs(westbound.angle - eastbound.angle) - 180) < 1);
    });

    it("moves from the departing station toward the next one", () => {
      const corridor = pathPolylinePoints(corridorSegmentPath(geometry, upSegment));
      const along = (progress) => projectOntoPolyline(corridor, regionalTrainMarkerFrame(geometry, upSegment, marker({ progress })).point).along;
      assert.ok(along(0.1) < along(0.5) && along(0.5) < along(0.9));
      assert.ok(Math.abs(along(0.5) - polylineLength(corridor) / 2) < 1);
    });

    it("draws no marker on a segment without a corridor", () => {
      assert.equal(regionalTrainMarkerFrame(geometry, { ...upSegment, lineId: "regional-zz" }, marker()), null);
    });
  });

  describe("station names", () => {
    it("lifts a hovered name with room up to the next name, inside its bounds", () => {
      const label = regionalStationLabelPolygon(geometry, "pickering");
      const hover = regionalStationLabelHover(geometry, "pickering");
      const corners = hover.polygonPoints.split(" ").map((pair) => pair.split(",").map(Number));
      assert.equal(corners.length, 4);
      for (const [x, y] of corners) {
        assert.ok(x >= hover.bounds.x && x <= hover.bounds.x + hover.bounds.width);
        assert.ok(y >= hover.bounds.y && y <= hover.bounds.y + hover.bounds.height);
      }
      const labelCenter = {
        x: label.reduce((sum, point) => sum + point.x, 0) / 4,
        y: label.reduce((sum, point) => sum + point.y, 0) / 4,
      };
      assert.ok(distance(hover.center, labelCenter) < 0.01);
      assert.equal(regionalStationLabelHover(geometry, "missing"), null);
      assert.equal(regionalStationLabelHover(geometry, null), null);
    });
  });

  describe("overlap badges", () => {
    it("starts a segment's badge beside its middle, on the side toward the map's centre", () => {
      const size = { width: 135, height: 135 };
      const { anchor, position } = regionalOverlapBadgeAnchor(geometry, segment("segment-le-pickering-ajax"), size);
      const center = {
        x: REGIONAL_MAP_VIEWBOX.x + REGIONAL_MAP_VIEWBOX.width / 2,
        y: REGIONAL_MAP_VIEWBOX.y + REGIONAL_MAP_VIEWBOX.height / 2,
      };
      const mirrored = { x: 2 * anchor.x - position.x, y: 2 * anchor.y - position.y };
      assert.ok(squaredPointDistance(position, center) < squaredPointDistance(mirrored, center));
      const offset = distance(anchor, position);
      assert.ok(offset >= REGIONAL_IMPACT_OVERLAY_WIDTH / 2 + REGIONAL_OVERLAP_INDICATOR_EDGE_GAP);
      assert.ok(offset <= REGIONAL_IMPACT_OVERLAY_WIDTH / 2 + REGIONAL_OVERLAP_INDICATOR_EDGE_GAP
        + Math.hypot(size.width, size.height) / 2 * REGIONAL_OVERLAP_INDICATOR_SCALE);
    });

    it("pads and intersects collision boxes", () => {
      assert.deepEqual(
        expandedRegionalCollisionBox({ x: 10, y: 20, width: 30, height: 40 }, { leading: 1, trailing: 2, y: 3 }),
        { x: 9, y: 17, width: 33, height: 46 },
      );
      assert.equal(regionalCollisionIntersectionArea({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 }), 25);
      assert.equal(regionalCollisionIntersectionArea({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 0, width: 10, height: 10 }), 0);
    });
  });
});
