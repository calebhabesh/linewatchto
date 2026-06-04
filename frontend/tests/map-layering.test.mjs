import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const transitMapSource = readFileSync(new URL("../src/app/transit-map.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const interactiveMapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");

describe("asset-backed map layering", () => {
  it("renders a station and label layer above alert overlays", () => {
    assert.match(transitMapSource, /className="asset-label-frame"/);
    assert.match(globalCss, /\.asset-label-frame/);
    assert.match(globalCss, /\.asset-label-frame svg #line-1/);
  });

  it("renders station hit targets above disruption overlays", () => {
    assert.match(interactiveMapSource, /aria-label="Station hit targets"/);
    assert.match(interactiveMapSource, /station-hit-target/);
    assert.match(interactiveMapSource, /onSelectStationId/);
    assert.ok(
      interactiveMapSource.indexOf('aria-label="Station hit targets"') <
        interactiveMapSource.indexOf('aria-label="Station impact rings"'),
      "station rings must render after station hit targets so ring strokes remain clickable",
    );
  });

  it("renders animated visual effects for delays, closures, and station impacts", () => {
    assert.match(interactiveMapSource, /<pattern id="suspension-hash"/);
    assert.match(interactiveMapSource, /className="rsz-chevron"/);
    assert.match(interactiveMapSource, /d="M -12 -10 L 8 0 L -12 10"/);
    assert.match(globalCss, /@keyframes chevron-slide/);
    assert.match(interactiveMapSource, /mask=\{\`url\(#\$\{segment\.id\}-mask\)\`\}/);
    assert.match(interactiveMapSource, /className="asset-alert-path delay-candy pointer-events-none"/);
    assert.match(interactiveMapSource, /style=\{\{\s*pointerEvents:\s*"none",\s*stroke:\s*chevronBg\s*\}\}/);
    assert.match(interactiveMapSource, /className="asset-alert-path suspension-candy pointer-events-none"/);
    assert.match(interactiveMapSource, /style=\{\{\s*pointerEvents:\s*"none",\s*stroke:\s*"url\(#suspension-hash\)"\s*\}\}/);
    assert.match(globalCss, /@keyframes station-selected-pulse/);

    const mapGeometrySource = readFileSync(new URL("../src/app/map-geometry.ts", import.meta.url), "utf8");

    assert.match(interactiveMapSource, /readSvgGeometry/);
    assert.match(interactiveMapSource, /resolveNetworkSegmentPath/);
    assert.match(mapGeometrySource, /segment\.travelDirection \?\? "bidirectional"/);
    assert.match(mapGeometrySource, /segment\.guidePathReversed/);
    assert.match(mapGeometrySource, /getAttribute\("inkscape:label"\) === "non-linear-guides-layer"/);
    assert.match(interactiveMapSource, /travelDirection !== "reverse"/);
    assert.match(interactiveMapSource, /travelDirection !== "forward"/);
    assert.match(interactiveMapSource, /reducedMotion \? null : \(/);
    assert.match(globalCss, /\.motion-paused \.asset-alert-path-glow/);
    assert.match(globalCss, /prefers-reduced-motion:\s*reduce/);
    assert.match(interactiveMapSource, /segment\.impacts/);
    assert.match(interactiveMapSource, /composeNetworkSegmentPath/);
    assert.doesNotMatch(interactiveMapSource, /renderedOverlaySegments\.flatMap/);
    assert.match(interactiveMapSource, /stationNodeImpacts/);
    assert.match(interactiveMapSource, /pointerEvents="stroke"/);
    assert.match(interactiveMapSource, /onSelectImpact\(\{ kind: impact\.kind, id: impact\.cardId \}\)/);
    assert.match(interactiveMapSource, /feTurbulence/);
    assert.match(globalCss, /\.delay-static-path/);

    assert.match(interactiveMapSource, /data-map-highlight-id/);
    assert.match(interactiveMapSource, /map-selection-flash/);
    assert.match(interactiveMapSource, /setTimeout\([^,]+,\s*2500\s*\)/);
  });

  it("does not render a selected planned closure twice when it is already an active impact", () => {
    assert.match(interactiveMapSource, /shouldRenderPlannedPreviewLayer/);
    assert.match(
      interactiveMapSource,
      /impact\.kind === "planned-closure" && impact\.cardId === selectedClosure\.id/,
    );
    assert.match(globalCss, /\.connected-corridor \.asset-alert-path/);
  });

  it("renders directional suspension lanes", () => {
    assert.match(interactiveMapSource, /AnimatedSuspensionLane/);
    assert.match(interactiveMapSource, /circle cx="12" cy="12" r="10\.5"/);
    assert.match(interactiveMapSource, /stroke="#ffffff"/);
  });

  it("prioritizes active disruption overlays by type and renders planned previews underneath", () => {
    assert.match(interactiveMapSource, /function getImpactPriority\(/);
    assert.match(interactiveMapSource, /case "suspension":\s*return 4;/);
    assert.match(interactiveMapSource, /case "planned-closure":\s*return 3;/);
    assert.match(interactiveMapSource, /case "delay":\s*return 2;/);
    assert.match(interactiveMapSource, /case "reduced-speed-zone":\s*return 1;/);

    assert.match(
      interactiveMapSource,
      /\.sort\(\(a, b\) => getImpactPriority\(a\.impact\.kind\) - getImpactPriority\(b\.impact\.kind\)\)/
    );

    const disruptionOverlaysStart = interactiveMapSource.indexOf('aria-label="Disruption overlays"');
    const plannedPreviewLayersIndex = interactiveMapSource.indexOf('plannedPreviewLayers.map', disruptionOverlaysStart);
    const renderedImpactLayersIndex = interactiveMapSource.indexOf('renderedImpactLayers.map', disruptionOverlaysStart);
    
    assert.ok(plannedPreviewLayersIndex > -1, "plannedPreviewLayers must be inside disruption overlays group");
    assert.ok(renderedImpactLayersIndex > -1, "renderedImpactLayers must be inside disruption overlays group");
    assert.ok(
      plannedPreviewLayersIndex < renderedImpactLayersIndex,
      "plannedPreviewLayers must render before renderedImpactLayers so that active overlays render on top"
    );
  });

  it("renders collision-aware floating badges for segments with overlapping alert types", () => {
    assert.match(interactiveMapSource, /overlapBadgeSegments/);
    assert.match(interactiveMapSource, /aria-label="Overlapping alert badges"/);
    assert.match(interactiveMapSource, /data-overlap-segment-id=\{badge\.segmentId\}/);
    assert.match(interactiveMapSource, /data-overlap-kind=\{kind\}/);
    assert.match(interactiveMapSource, /data-overlap-collision-avoided/);
    assert.match(interactiveMapSource, /getUniqueImpactKinds/);
    assert.match(interactiveMapSource, /chooseNonIntersectingBadgePosition/);
    assert.match(interactiveMapSource, /collectMapCollisionBoxes/);
    assert.match(interactiveMapSource, /pathCorridorCollisionBoxes/);
    assert.match(interactiveMapSource, /pathMidpointFrame/);
    assert.match(interactiveMapSource, /const frame = pathMidpointFrame\(segment\.pathD\)/);
    assert.match(interactiveMapSource, /chooseNonIntersectingBadgePosition\(frame\.point, size, occupiedBoxes, frame\)/);
    assert.match(interactiveMapSource, /OVERLAY_CORRIDOR_COLLISION_RADIUS/);
    assert.match(interactiveMapSource, /const OVERLAY_CORRIDOR_COLLISION_RADIUS = 54;/);
    assert.match(interactiveMapSource, /const OVERLAP_BADGE_EDGE_GAP = 8;/);
    assert.match(interactiveMapSource, /overlayCollisionBoxes/);
    assert.match(interactiveMapSource, /function overlapBadgePositionCandidates\(size: OverlapBadgeSize, frame\?: PathFrame \| null\)/);
    assert.match(interactiveMapSource, /normalOffsetForBadge\(frame\.normal, size\)/);
    assert.match(interactiveMapSource, /getBBox\(\)/);
    assert.doesNotMatch(interactiveMapSource, /const OVERLAP_BADGE_POSITION_CANDIDATES/);
    assert.match(interactiveMapSource, /boxesIntersect/);
    assert.match(globalCss, /\.overlap-indicator-pill/);
    assert.match(globalCss, /\.overlap-indicator-badge\.planned-closure/);
    assert.match(globalCss, /\.overlap-indicator-badge\.reduced-speed-zone/);
    assert.match(globalCss, /\.overlap-indicator-glyph/);
    assert.doesNotMatch(globalCss, /\.overlap-side-rail/);
  });
});
