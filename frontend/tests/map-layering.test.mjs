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

  it("keeps upcoming closure previews persistent, static, and equal-width to active corridors", () => {
    assert.match(interactiveMapSource, /plannedClosures\.map\(\(closure\) =>/);
    assert.doesNotMatch(interactiveMapSource, /if \(!selectedClosure\) return \[\];/);
    assert.match(interactiveMapSource, /plannedPreviewSegmentIds/);
    assert.match(interactiveMapSource, /shouldRenderPlannedPreviewLayer\(segment, closure\)/);
    assert.match(globalCss, /\.asset-alert-path\.planned-preview\s*\{[^}]*opacity:\s*(?:0\.\d+|1(?:\.0)?);/s);
    assert.match(globalCss, /\.asset-alert-path\.planned-preview\s*\{[^}]*stroke:\s*var\(--planned\);[^}]*stroke-dasharray:\s*none;[^}]*stroke-width:\s*102;/s);
    assert.doesNotMatch(globalCss, /\.asset-alert-path\.planned-preview\s*\{[^}]*animation:/s);
    assert.doesNotMatch(globalCss, /\.asset-alert-path\.planned-preview\.selected\s*\{[^}]*stroke-width:\s*118;/s);
  });

  it("renders collision-aware floating badges for segments with overlapping alert types", () => {
    assert.match(interactiveMapSource, /overlapBadgeSegments/);
    assert.match(interactiveMapSource, /plannedPreviewImpactsForSegment\(segment, plannedClosures\)/);
    assert.match(interactiveMapSource, /groupOverlapBadgeSegments/);
    assert.match(interactiveMapSource, /overlapBadgeSignature/);
    assert.match(interactiveMapSource, /kind: "planned-closure"/);
    assert.match(interactiveMapSource, /aria-label="Overlapping alert badges"/);
    assert.match(interactiveMapSource, /data-overlap-segment-id=\{badge\.segmentId\}/);
    assert.match(interactiveMapSource, /data-overlap-kind=\{kind\}/);
    assert.match(interactiveMapSource, /data-overlap-collision-avoided/);
    assert.match(interactiveMapSource, /ImpactTypeIcon/);
    assert.match(interactiveMapSource, /OverlapKindIcon/);
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
    assert.match(interactiveMapSource, /radialBadgePositionCandidates/);
    assert.match(interactiveMapSource, /normalOffsetForBadge\(frame\.normal, size\)/);
    assert.match(interactiveMapSource, /transformedSvgBounds/);
    assert.match(interactiveMapSource, /getCTM\(\)/);
    assert.match(interactiveMapSource, /transformBoundsToRootCoordinates/);
    assert.match(interactiveMapSource, /"path"/);
    assert.match(interactiveMapSource, /isInjectedMapOverlayElement/);
    assert.match(interactiveMapSource, /mapCollisionBoxesForElementBounds/);
    assert.match(interactiveMapSource, /collectBaseRouteCollisionBoxes/);
    assert.match(interactiveMapSource, /BASE_ROUTE_COLLISION_RADIUS/);
    assert.match(interactiveMapSource, /isLargeMapComponentBounds/);
    assert.match(interactiveMapSource, /splitLargeMapComponentBounds/);
    assert.match(interactiveMapSource, /LARGE_MAP_COMPONENT_MAX_THICKNESS/);
    assert.doesNotMatch(interactiveMapSource, /if \(box\.width > 1200 \|\| box\.height > 1200\) return null;/);
    assert.match(interactiveMapSource, /scoreBadgeCandidate/);
    assert.match(interactiveMapSource, /"text"/);
    assert.match(interactiveMapSource, /"tspan"/);
    assert.doesNotMatch(interactiveMapSource, /const OVERLAP_BADGE_POSITION_CANDIDATES/);
    assert.match(interactiveMapSource, /boxesIntersect/);
    assert.match(globalCss, /\.overlap-indicator-pill/);
    assert.match(globalCss, /\.overlap-indicator-badge\.suspension/);
    assert.match(globalCss, /\.overlap-indicator-badge\.planned-closure/);
    assert.match(globalCss, /\.overlap-indicator-badge\.planned-closure\s*\{[^}]*stroke:\s*#3b82f6;/s);
    assert.match(globalCss, /\.overlap-indicator-badge\.delay\s*\{[^}]*stroke:\s*#f59e0b;/s);
    assert.match(globalCss, /\.overlap-indicator-type-icon\.delay\s*\{[^}]*color:\s*#f59e0b;/s);
    assert.doesNotMatch(globalCss, /\.overlap-indicator-badge\.delay\s*\{[^}]*#0ea5e9/s);
    assert.doesNotMatch(globalCss, /\.overlap-indicator-badge\.suspension,\s*\.overlap-indicator-badge\.planned-closure/);
    assert.match(globalCss, /\.overlap-indicator-badge\.reduced-speed-zone/);
    assert.match(globalCss, /\.overlap-indicator-type-icon/);
    assert.doesNotMatch(globalCss, /\.overlap-side-rail/);
  });
});
