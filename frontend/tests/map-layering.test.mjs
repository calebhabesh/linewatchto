import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const transitMapSource = readFileSync(new URL("../src/app/transit-map.tsx", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const interactiveMapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");

function cssBlockFor(selector) {
  const start = globalCss.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} block must exist`);

  const end = globalCss.indexOf("\n}", start);
  assert.ok(end > start, `${selector} block must close`);

  return globalCss.slice(start, end + 2);
}

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

  it("pins station hit targets to the authored station-dot outlines", () => {
    assert.match(
      interactiveMapSource,
      /const hitRadius = selection[\s\S]*?hasMultipleVisualAnchors \? 34 : isLarge \? 46 : 32[\s\S]*?hasMultipleVisualAnchors \? 45 : isLarge \? 66 : 41;/,
    );
  });

  it("renders a stronger station hover halo outside the clickable dot", () => {
    assert.match(
      interactiveMapSource,
      /const hoverRadius = usesIndependentSpadinaHover \? 34 : isLarge \? 72 : 48;/,
    );
    assert.match(interactiveMapSource, /className=\{`station-hover-indicator/);
    assert.match(interactiveMapSource, /r=\{hoverRadius\}/);
    assert.match(
      globalCss,
      /\.station-hover-indicator\.active\s*\{[^}]*fill:\s*rgb\(var\(--station-selection-accent-rgb\)\s*\/\s*30%\);[^}]*stroke:\s*var\(--station-selection-accent\);[^}]*stroke-width:\s*8;/s,
    );
    assert.match(globalCss, /--station-selection-accent:\s*var\(--color-logo-blue\);/);
    assert.match(globalCss, /--station-selection-accent-rgb:\s*129 201 255;/);
    assert.match(globalCss, /\.station-selected-indicator\s*\{[^}]*fill:\s*var\(--station-selection-accent\);/s);
    assert.match(globalCss, /\.station-impact-hover-priority\s*\{[^}]*stroke:\s*var\(--station-selection-accent\);/s);
    assert.match(globalCss, /@keyframes station-selected-pulse\s*\{[\s\S]*?0%,[\s\S]*?opacity:\s*1;[\s\S]*?50%\s*\{[^}]*opacity:\s*1;/s);
    assert.match(globalCss, /\.station-selection-flash\s*\{[^}]*fill:\s*var\(--station-selection-accent\);/s);
  });

  it("uses a larger screen-sized hit stroke without making disruption visuals thicker", () => {
    assert.match(interactiveMapSource, /className="map-segment-hit-target"/);
    assert.match(interactiveMapSource, /vectorEffect="non-scaling-stroke"/);
    assert.match(globalCss, /\.map-segment-hit-target\s*\{[^}]*stroke-width:\s*96px;/s);
    assert.match(
      globalCss,
      /@media \(pointer:\s*coarse\)[\s\S]*?\.map-segment-hit-target\s*\{[^}]*stroke-width:\s*96px;/,
    );
  });

  it("provides segment press feedback without adding map instructions", () => {
    assert.doesNotMatch(interactiveMapSource, /map-interaction-hint/);
    assert.doesNotMatch(interactiveMapSource, /Tap affected sections/);
    assert.match(globalCss, /\.overlay-segment-group:has\(\.map-segment-hit-target:active\)/);
  });

  it("adds a crisp desktop hover boundary and eases in planned-closure highlights", () => {
    assert.match(interactiveMapSource, /className=\{`asset-alert-path-hover-boundary \$\{visualState\}`\}/);
    assert.match(
      globalCss,
      /@media \(hover:\s*hover\) and \(pointer:\s*fine\) \{[\s\S]*?\.asset-alert-path-hover-boundary\s*\{[^}]*transition:/,
    );
    assert.match(
      globalCss,
      /\.asset-alert-path-hover-boundary\s*\{[^}]*stroke-width:\s*120;[\s\S]*?\.overlay-segment-group:has\(\.map-segment-hit-target:hover\) \.asset-alert-path-hover-boundary,[\s\S]*?opacity:\s*0\.94;/,
    );
    assert.match(
      globalCss,
      /\.asset-alert-path-glow\.interactive-glow\.planned-preview\s*\{[^}]*display:\s*block;[^}]*transition:/s,
    );
  });

  it("repaints the mouse-hover highlight above overlapping disruption corridors", () => {
    assert.match(interactiveMapSource, /const \[hoveredOverlayHighlight, setHoveredOverlayHighlight\]/);
    assert.match(interactiveMapSource, /const \[hoveredOverlayForeground, setHoveredOverlayForeground\]/);
    assert.match(interactiveMapSource, /onHoverHighlightChange=\{setHoveredOverlayHighlight\}/);
    assert.match(
      interactiveMapSource,
      /<g aria-hidden="true" className="hover-priority-overlay">[\s\S]*?data-hover-foreground-impact[\s\S]*?<OverlaySegment[\s\S]*?hover-priority-glow[\s\S]*?hover-priority-boundary[\s\S]*?Top Layer: Stations/,
    );
    assert.match(
      interactiveMapSource,
      /id="hover-priority-boundary-ring-mask"[\s\S]*?stroke="white"[\s\S]*?strokeWidth="120"[\s\S]*?stroke="black"[\s\S]*?strokeWidth="102"/,
    );
    assert.match(interactiveMapSource, /mask="url\(#hover-priority-boundary-ring-mask\)"/);
    assert.match(interactiveMapSource, /event\.pointerType !== "mouse" \|\| exiting/);
    assert.match(
      globalCss,
      /\.asset-alert-path-glow\.hover-priority-glow\s*\{[^}]*display:\s*block;[^}]*opacity:\s*0\.55;/s,
    );
    assert.match(globalCss, /@keyframes hover-priority-boundary-in/);
  });

  it("renders animated visual effects for delays, closures, and station impacts", () => {
    assert.match(interactiveMapSource, /<pattern id="badge-suspension-hash"/);
    assert.match(interactiveMapSource, /className="rsz-chevron"/);
    assert.match(interactiveMapSource, /d="M -12 -10 L 8 0 L -12 10"/);
    assert.match(globalCss, /@keyframes chevron-slide/);
    assert.match(interactiveMapSource, /mask=\{\`url\(#\$\{overlaySegmentId\}-mask\)\`\}/);
    assert.match(interactiveMapSource, /className="asset-alert-path delay-candy pointer-events-none"/);
    assert.match(interactiveMapSource, /style=\{\{\s*pointerEvents:\s*"none",\s*stroke:\s*chevronBg\s*\}\}/);
    assert.match(interactiveMapSource, /SuspensionNoEntryLane/);
    assert.match(interactiveMapSource, /className="asset-alert-path suspension-candy suspension-solid pointer-events-none"/);
    assert.match(globalCss, /@keyframes station-selected-pulse/);
    assert.match(globalCss, /@keyframes aura-pulse/);
    assert.match(globalCss, /\.asset-alert-path-glow\.delay\s*\{[^}]*animation:\s*aura-pulse 1\.2s infinite alternate ease-in-out;/s);
    assert.match(globalCss, /\.linewatch-shell\.mobile-performance-mode \.asset-alert-path-glow,[\s\S]*animation:\s*none\s*!important;/s);

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
    assert.match(interactiveMapSource, /stationImpactDirectionForImpact/);
    assert.match(interactiveMapSource, /stationImpactDirectionForStationImpacts/);
    assert.match(interactiveMapSource, /aria-label="Station impact direction glyphs"/);
    assert.match(interactiveMapSource, /<StationImpactDirectionGlyph/);
    assert.match(interactiveMapSource, /stationImpactEffectRadius\(isLarge\)/);
    assert.match(interactiveMapSource, /return isLargeStation \? 48 : 26;/);
    assert.match(interactiveMapSource, /stationImpactDirectionBadgeRadius\(isLarge\)/);
    assert.match(interactiveMapSource, /return isLargeStation \? 40 : 24;/);
    assert.match(interactiveMapSource, /stationImpactRingRadius\(isLarge\)/);
    assert.match(interactiveMapSource, /return isLargeStation \? 56 : 38;/);
    assert.match(interactiveMapSource, /FOUR_WAY_STATION_IMPACT_ARROW_SCALE = 0\.94/);
    assert.match(interactiveMapSource, /direction === "four-way" \? radius \* FOUR_WAY_STATION_IMPACT_ARROW_SCALE : radius/);
    assert.match(interactiveMapSource, /stationImpactDirectionMetrics\(pathMetricsRadius\)/);
    assert.match(interactiveMapSource, /Math\.round\(radius \* 0\.75\)/);
    assert.match(interactiveMapSource, /stationImpactDirectionCenteredPartPath/);
    assert.match(interactiveMapSource, /stationImpactDirectionSpokePartPath/);
    assert.match(interactiveMapSource, /metrics\.extent/);
    assert.match(interactiveMapSource, /metrics\.headInset/);
    assert.match(interactiveMapSource, /direction === "four-way"/);
    assert.match(globalCss, /\.station-impact-direction-badge/);
    assert.match(globalCss, /\.station-impact-direction-arrow/);
    assert.match(interactiveMapSource, /feTurbulence/);
    assert.match(globalCss, /\.delay-static-path/);

    assert.match(interactiveMapSource, /data-map-highlight-id/);
    assert.match(interactiveMapSource, /map-selection-flash/);
    assert.match(interactiveMapSource, /setTimeout\([^,]+,\s*2500\s*\)/);
  });

  it("renders reduced speed zone chevron glyphs without a clipping mask", () => {
    const rszStart = interactiveMapSource.indexOf('{visualState === "reduced-speed-zone"');
    const suspensionStart = interactiveMapSource.indexOf('{visualState === "suspension"', rszStart);
    const rszBlock = interactiveMapSource.slice(rszStart, suspensionStart);

    assert.ok(rszStart > -1, "reduced speed zone overlay branch must exist");
    assert.ok(suspensionStart > rszStart, "suspension branch should follow reduced speed zone branch");
    assert.match(rszBlock, /<AnimatedChevronLane/);
    assert.match(rszBlock, /className="rsz-chevron-lanes"/);
    assert.doesNotMatch(rszBlock, /className="rsz-chevron-mask-path/);
    assert.doesNotMatch(rszBlock, /<g\s+mask=\{`url\(#\$\{segment\.id\}-mask\)`\}/);
    assert.match(globalCss, /\.rsz-chevron-lanes\s*\{[^}]*overflow:\s*visible;/s);
  });

  it("rotates delay hourglass glyphs with the sampled path tangent", () => {
    const laneStart = interactiveMapSource.indexOf("function AnimatedHourglassLane(");
    const laneEnd = interactiveMapSource.indexOf("function OverlaySegment(", laneStart);
    const laneBlock = interactiveMapSource.slice(laneStart, laneEnd);

    assert.ok(laneStart > -1, "AnimatedHourglassLane must exist");
    assert.ok(laneEnd > laneStart, "AnimatedHourglassLane block must end before OverlaySegment");
    assert.doesNotMatch(
      laneBlock,
      /Math\.abs\(i\)\s*%\s*2\s*===\s*0\s*\?\s*""\s*:\s*` rotate\(\$\{angle\}\)`/,
    );
    assert.match(
      laneBlock,
      /`translate\(\$\{p\.x \+ offsetX\} \$\{p\.y \+ offsetY\}\) rotate\(\$\{angle\}\)`/,
    );
  });

  it("keeps all pulse and glow animations on one shared phase", () => {
    assert.match(globalCss, /--map-pulse-offset/);
    assert.match(globalCss, /\.asset-alert-path-glow\s*\{[^}]*animation-delay:\s*var\(--map-pulse-offset\);/s);
    assert.match(globalCss, /\.asset-alert-path\.delay-candy\s*\{[^}]*animation-delay:\s*var\(--map-pulse-offset\);/s);
    assert.match(globalCss, /\.asset-alert-path\.suspension-candy\s*\{[^}]*animation-delay:\s*var\(--map-pulse-offset\);/s);
    assert.match(globalCss, /\.delay-hourglass-mask-path,\s*\.suspension-mask-path\s*\{[^}]*animation-delay:\s*var\(--map-pulse-offset\);/s);
    assert.match(globalCss, /\.station-impact-ring\s*\{[^}]*animation-delay:\s*var\(--map-pulse-offset\);/s);
    assert.match(globalCss, /\.station-impact-dot-red-glow\s*\{[^}]*animation-delay:\s*var\(--map-pulse-offset\);/s);
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
    const laneStart = interactiveMapSource.indexOf("function AnimatedSuspensionLane(");
    const laneEnd = interactiveMapSource.indexOf("function SuspensionNoEntryGlyph(", laneStart);
    const laneBlock = interactiveMapSource.slice(laneStart, laneEnd);

    assert.ok(laneStart > -1, "AnimatedSuspensionLane must exist");
    assert.ok(laneEnd > laneStart, "AnimatedSuspensionLane block should end before the no-entry glyph helper");
    assert.match(interactiveMapSource, /AnimatedSuspensionLane/);
    assert.match(interactiveMapSource, /circle cx="12" cy="12" r="10\.5"/);
    assert.match(interactiveMapSource, /stroke="#ffffff"/);
    assert.match(laneBlock, /data-suspension-symbol=\{isNoEntry \? "no-entry" : "direction-arrow"\}/);
    assert.match(laneBlock, /const shouldRotate = group\.dataset\.suspensionSymbol !== "no-entry";/);
    assert.match(laneBlock, /shouldRotate\s*\?\s*`translate\(\$\{p\.x \+ offsetX\} \$\{p\.y \+ offsetY\}\) rotate\(\$\{resolvedAngle\}\)`/);
    assert.match(laneBlock, /:\s*`translate\(\$\{p\.x \+ offsetX\} \$\{p\.y \+ offsetY\}\)`/);
  });

  it("renders bidirectional suspension marks as evenly spaced no-entry icons", () => {
    const branchStart = interactiveMapSource.indexOf('{visualState === "suspension"');
    const suspensionStart = interactiveMapSource.indexOf('travelDirection === "bidirectional" ? (', branchStart);
    const suspensionEnd = interactiveMapSource.indexOf(') : (', suspensionStart);
    const suspensionBlock = interactiveMapSource.slice(suspensionStart, suspensionEnd);

    assert.ok(branchStart > -1, "suspension overlay branch must exist");
    assert.ok(suspensionStart > -1, "bidirectional suspension overlay branch must exist");
    assert.ok(suspensionEnd > suspensionStart, "bidirectional suspension branch should end before one-way branch");
    assert.match(suspensionBlock, /<SuspensionNoEntryLane/);
    assert.match(suspensionBlock, /mask=\{`url\(#\$\{overlaySegmentId\}-suspension-static-mask\)`\}/);
    assert.doesNotMatch(suspensionBlock, /stroke:\s*"url\(#suspension-hash\)"/);
    assert.doesNotMatch(suspensionBlock, /d="M -14 -14 L 10 0 L -14 14"/);
    assert.doesNotMatch(interactiveMapSource, /fixedStripePathDForPath/);
    assert.match(interactiveMapSource, /className="suspension-no-entry-lane"/);
    assert.match(interactiveMapSource, /className=\{\`suspension-no-entry-glyph/);
    assert.match(interactiveMapSource, /function SuspensionNoEntryGlyph\(\{[\s\S]*scale = 2\.2,/);
    assert.match(suspensionBlock, /step=\{88\}/);
    assert.match(interactiveMapSource, /<SuspensionNoEntryGlyph scale=\{2\.65\} \/>/);
    assert.doesNotMatch(interactiveMapSource, /rotate\(\$\{point\.angle\}\)/);
    assert.match(interactiveMapSource, /transform=\{`translate\(\$\{point\.x\} \$\{point\.y\}\)`\}/);
    assert.match(interactiveMapSource, /circle cx="12" cy="12" r="10\.5"/);
    assert.match(interactiveMapSource, /line x1="19\.64" y1="4\.36" x2="4\.36" y2="19\.64"/);
    assert.doesNotMatch(interactiveMapSource, /d="M 0 -58 L 0 58"/);
    assert.match(globalCss, /\.suspension-no-entry-lane\s*\{[^}]*pointer-events:\s*none;/s);
    assert.match(globalCss, /\.suspension-no-entry-glyph\s*\{[^}]*pointer-events:\s*none;/s);
    assert.doesNotMatch(globalCss, /\.suspension-crossbar/);
    assert.doesNotMatch(globalCss, /\.suspension-through-line-rail/);
    assert.doesNotMatch(globalCss, /\.suspension-through-line-core/);
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
    const plannedPreviewLayersIndex = interactiveMapSource.indexOf('retainedPlannedPreviewLayers.map', disruptionOverlaysStart);
    const renderedImpactLayersIndex = interactiveMapSource.indexOf('retainedImpactLayers.map', disruptionOverlaysStart);
    
    assert.ok(plannedPreviewLayersIndex > -1, "retainedPlannedPreviewLayers must be inside disruption overlays group");
    assert.ok(renderedImpactLayersIndex > -1, "retainedImpactLayers must be inside disruption overlays group");
    assert.ok(
      plannedPreviewLayersIndex < renderedImpactLayersIndex,
      "retainedPlannedPreviewLayers must render before retainedImpactLayers so that active overlays render on top"
    );
  });

  it("renders the selected disruption emphasis above every disruption corridor", () => {
    const disruptionOverlaysStart = interactiveMapSource.indexOf('aria-label="Disruption overlays"');
    const impactLayersIndex = interactiveMapSource.indexOf("retainedImpactLayers.map", disruptionOverlaysStart);
    const selectedEmphasisIndex = interactiveMapSource.indexOf(
      'aria-label="Selected disruption emphasis"',
      disruptionOverlaysStart,
    );
    const stationLayerIndex = interactiveMapSource.indexOf(
      "dangerouslySetInnerHTML={{ __html: svgParts?.part2",
      disruptionOverlaysStart,
    );

    assert.ok(selectedEmphasisIndex > impactLayersIndex, "selected emphasis must render after all disruption corridors");
    assert.ok(stationLayerIndex > selectedEmphasisIndex, "station art must remain above the selected emphasis");
    assert.match(interactiveMapSource, /data-selected-impact-emphasis=\{selectedImpactEmphasis\.id\}/);
    assert.match(interactiveMapSource, /function SelectedImpactEmphasis\(/);
    assert.match(interactiveMapSource, /className=\{`asset-alert-path map-selection-flash pointer-events-none/);
    assert.match(
      interactiveMapSource,
      /data-selected-commute-impact-overlay=\{selectedImpactEmphasis\.id\}[\s\S]*?<OverlaySegment[\s\S]*?impact=\{selectedImpactEmphasis\.impact\}[\s\S]*?idSuffix="-commute-focus"/,
    );
    assert.match(
      interactiveMapSource,
      /retainedImpactLayers\.map[\s\S]*?commutePreviewLayer &&[\s\S]*?selectedImpactEmphasis\?\.impact\?\.kind === impact\.kind &&[\s\S]*?selectedImpactEmphasis\.impact\.cardId === impact\.cardId[\s\S]*?return null;/,
    );
    assert.match(
      interactiveMapSource,
      /retainedPlannedPreviewLayers\.map[\s\S]*?commutePreviewLayer &&[\s\S]*?selectedImpactEmphasis\?\.plannedClosure\?\.id === closure\.id[\s\S]*?return null;/,
    );
    assert.doesNotMatch(globalCss, /commute-impact-focus/);
    assert.doesNotMatch(
      globalCss,
      /\[data-selected-commute-impact-overlay\] \.asset-alert-path\.planned-preview\.selected\s*\{/,
    );
    assert.match(
      globalCss,
      /\[data-selected-commute-impact-overlay\] \.asset-alert-path-glow\.interactive-glow\.planned-preview\.selected\s*\{[^}]*display:\s*block;[^}]*stroke:\s*#f8fafc;[^}]*filter:\s*blur\(6px\);/,
    );
    assert.match(
      globalCss,
      /@media \(max-width:\s*767px\) \{[\s\S]*?\[data-selected-commute-impact-overlay\] \.asset-alert-path-glow\s*\{[^}]*display:\s*none;[^}]*\}/,
    );
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \[data-selected-commute-impact-overlay\] \.asset-alert-path-glow\s*\{[^}]*display:\s*none;[^}]*\}/,
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
    assert.match(interactiveMapSource, /groupOverlapBadgeSegments\(renderedOverlaySegments, overlapPlannedClosures\)/);
    assert.match(interactiveMapSource, /groupOverlapBadgeSegments/);
    assert.match(interactiveMapSource, /overlapBadgeSignature/);
    assert.match(interactiveMapSource, /kind: "planned-closure"/);
    assert.match(interactiveMapSource, /aria-label="Overlapping alert badges"/);
    assert.match(interactiveMapSource, /data-overlap-segment-id=\{badge\.segmentId\}/);
    assert.match(interactiveMapSource, /data-overlap-kind=\{kind\}/);
    assert.match(interactiveMapSource, /data-overlap-kind-count=\{count\}/);
    assert.match(interactiveMapSource, /data-overlap-collision-avoided/);
    assert.match(interactiveMapSource, /ImpactTypeIcon/);
    assert.match(interactiveMapSource, /OverlapKindIcon/);
    assert.match(interactiveMapSource, /OverlapKindCountBadge/);
    assert.match(interactiveMapSource, /overlapBadgeKindCounts\(badge\.impacts\)/);
    assert.match(interactiveMapSource, /hasOverlappingImpacts\(impacts\)/);
    assert.match(interactiveMapSource, /overlapBadgeVisualItemCount\(overlapBadgeKindCounts\(group\.impacts\)\)/);
    assert.match(interactiveMapSource, /const isSingleKindOverlap = kindCounts\.length === 1 && \(kindCounts\[0\]\?\.count \?\? 0\) > 1;/);
    assert.match(interactiveMapSource, /const isSingleVisualItem = totalItems === 1;/);
    assert.match(interactiveMapSource, /isSingleVisualItem \? \(/);
    assert.match(interactiveMapSource, /<circle\s+className="overlap-indicator-pill"/);
    assert.match(interactiveMapSource, /if \(impactKindCount === 1\)/);
    assert.match(interactiveMapSource, /const badgeRadius = OVERLAP_BADGE_CIRCLE_RADIUS;/);
    assert.match(interactiveMapSource, /const iconSize = 44;/);
    assert.match(interactiveMapSource, /const OVERLAP_BADGE_CIRCLE_RADIUS = 35;/);
    assert.match(interactiveMapSource, /const OVERLAP_BADGE_ITEM_GAP = 10;/);
    assert.match(interactiveMapSource, /const OVERLAP_BADGE_ITEM_SPACING = OVERLAP_BADGE_CIRCLE_RADIUS \* 2 \+ OVERLAP_BADGE_ITEM_GAP;/);
    assert.match(interactiveMapSource, /const spacing = OVERLAP_BADGE_ITEM_SPACING;/);
    assert.match(interactiveMapSource, /getUniqueImpactKinds/);
    assert.doesNotMatch(interactiveMapSource, /if \(impactKinds\.length <= 1\) continue;/);
    assert.match(interactiveMapSource, /chooseNonIntersectingBadgePosition/);
    assert.match(interactiveMapSource, /alignedOverlapBadgePositionCandidates/);
    assert.match(interactiveMapSource, /collectMapCollisionBoxes/);
    assert.match(interactiveMapSource, /pathCorridorCollisionBoxes/);
    assert.match(interactiveMapSource, /pathMidpointFrame/);
    assert.match(interactiveMapSource, /const frame = pathMidpointFrame\(segment\.pathD\)/);
    assert.match(
      interactiveMapSource,
      /chooseNonIntersectingBadgePosition\(frame\.point, size, occupiedBoxes, frame, placedBadges\)/,
    );
    assert.match(interactiveMapSource, /OVERLAY_CORRIDOR_COLLISION_RADIUS/);
    assert.match(interactiveMapSource, /const OVERLAY_CORRIDOR_COLLISION_RADIUS = 54;/);
    assert.match(interactiveMapSource, /const OVERLAP_BADGE_EDGE_GAP = 8;/);
    assert.match(interactiveMapSource, /const OVERLAP_INDICATOR_SCALE = 1\.5;/);
    assert.match(interactiveMapSource, /width: OVERLAP_BADGE_PILL_THICKNESS \* OVERLAP_INDICATOR_SCALE,/);
    assert.match(interactiveMapSource, /\(totalItems - 1\) \* OVERLAP_BADGE_ITEM_SPACING \+ OVERLAP_BADGE_PILL_THICKNESS/);
    assert.match(interactiveMapSource, /height: OVERLAP_BADGE_PILL_THICKNESS \* OVERLAP_INDICATOR_SCALE/);
    assert.match(interactiveMapSource, /<g transform=\{`scale\(\$\{OVERLAP_INDICATOR_SCALE\}\)`\}>/);
    assert.match(interactiveMapSource, /overlayCollisionBoxes/);
    assert.match(
      interactiveMapSource,
      /const collisionBoxesByImpact = useMemo[\s\S]*?stationOverlapProtectedBox\(anchor\.point\)/,
    );
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
    assert.match(globalCss, /\.overlap-indicator-badge\.delay\s*\{[^}]*stroke:\s*#FEEC41;/s);
    assert.match(globalCss, /\.overlap-indicator-type-icon\.delay\s*\{[^}]*color:\s*#FEEC41;/s);
    assert.match(globalCss, /\.overlap-indicator-count-badge\s*\{[^}]*fill:\s*#ef4444;/s);
    assert.match(globalCss, /\.overlap-indicator-count-text\s*\{[^}]*fill:\s*#ffffff;/s);
    assert.match(interactiveMapSource, /const radius = large \? 26 : 18;/);
    assert.match(interactiveMapSource, /const offset = large \? 35 : 28;/);
    assert.match(interactiveMapSource, /key=\{`\$\{kind\}-count`\}/);
    assert.match(globalCss, /\.overlap-indicator-count-text\.large\s*\{[^}]*font-size:\s*32px;/s);
    assert.match(globalCss, /\.overlap-indicator-count-text\.mixed\s*\{[^}]*font-size:\s*22px;/s);
    assert.doesNotMatch(globalCss, /\.overlap-indicator-badge\.delay\s*\{[^}]*#0ea5e9/s);
    assert.doesNotMatch(globalCss, /\.overlap-indicator-badge\.suspension,\s*\.overlap-indicator-badge\.planned-closure/);
    assert.match(globalCss, /\.overlap-indicator-badge\.reduced-speed-zone\s*\{[^}]*var\(--impact-rsz\)/s);
    assert.match(globalCss, /\.overlap-indicator-type-icon\.reduced-speed-zone\s*\{[^}]*var\(--impact-rsz\)/s);
    assert.match(interactiveMapSource, /const RSZ_IMPACT_COLOR = "#F59E0B";/);
    assert.doesNotMatch(globalCss, /\.overlap-side-rail/);
  });

  it("expands every overlap badge into an explicit in-map impact chooser", () => {
    assert.match(interactiveMapSource, /expandedOverlapBadgeId/);
    assert.match(interactiveMapSource, /data-overlap-chooser/);
    assert.match(interactiveMapSource, /data-overlap-choice-kind=\{impact\.kind\}/);
    assert.match(interactiveMapSource, /data-overlap-choice-id=\{impact\.cardId\}/);
    assert.match(interactiveMapSource, /aria-expanded=\{isOpen\}/);
    assert.match(interactiveMapSource, /Choose Alert/);
    assert.match(interactiveMapSource, /getSelectedImpactDetails/);
    assert.match(interactiveMapSource, /chooseOverlapChooserPosition/);
    assert.match(interactiveMapSource, /chooserPosition/);
    assert.match(interactiveMapSource, /MAP_SVG_TO_CSS_SCALE/);
    assert.match(interactiveMapSource, /overlapChooserScreenLayout/);
    assert.match(
      interactiveMapSource,
      /overlapChooserScreenLayout\([\s\S]*?chooserKeepoutBoxes,[\s\S]*?overlayCollisionBoxes/,
    );
    assert.match(interactiveMapSource, /CHOOSER_KEEPOUT_SELECTOR/);
    assert.match(interactiveMapSource, /chooserKeepoutBoxes/);
    assert.match(interactiveMapSource, /\.desktop-status-capsule-anchor/);
    assert.match(interactiveMapSource, /\.desktop-map-control-rail/);
    assert.match(interactiveMapSource, /\.desktop-map-legend/);
    assert.match(interactiveMapSource, /\.desktop-status-chip-row-container/);
    assert.doesNotMatch(interactiveMapSource, /mapViewportSize\.width > OVERLAP_CHOOSER_MOBILE_BREAKPOINT/);
    assert.match(interactiveMapSource, /chooserKeepoutEdgeCandidates/);
    assert.match(interactiveMapSource, /boundedChooserViewportCandidates/);
    assert.doesNotMatch(interactiveMapSource, /for \(let y = minimumY; y <= maximumY; y \+= step\)/);
    assert.match(interactiveMapSource, /onHoverImpact/);
    assert.match(interactiveMapSource, /data-hover-priority-impact=\{hoveredOverlayHighlight\.key\}/);
    assert.match(interactiveMapSource, /onPointerEnter=\{\(event\) => \{/);
    assert.match(interactiveMapSource, /onFocus=\{\(\) => onHoverImpact\(impact\)\}/);
    assert.match(interactiveMapSource, /setHoveredOverlayForeground\(\{[\s\S]*?impact: renderedImpact\.impact/);
    assert.match(interactiveMapSource, /const OVERLAP_CHOOSER_TARGET_GAP = 16;/);
    assert.match(interactiveMapSource, /const OVERLAP_CHOOSER_GAP_DEVIATION_WEIGHT = 4;/);
    assert.match(interactiveMapSource, /OVERLAP_CHOOSER_MOBILE_BREAKPOINT/);
    assert.match(interactiveMapSource, /OVERLAP_CHOOSER_MOBILE_WIDTH/);
    assert.match(interactiveMapSource, /const isMobile = viewportWidth <= OVERLAP_CHOOSER_MOBILE_BREAKPOINT/);
    assert.match(globalCss, /@media \(max-width: 640px\)[\s\S]*?\.overlap-chooser-list\s*\{[^}]*grid-auto-rows:\s*max-content;/);
    assert.match(globalCss, /@media \(max-width: 640px\)[\s\S]*?\.overlap-chooser-choice\s*\{[^}]*min-height:\s*82px;/);
    assert.match(interactiveMapSource, /protectedBoxesForImpacts\([\s\S]*?group\.impacts,[\s\S]*?collisionBoxesByImpact/);
    assert.match(interactiveMapSource, /boundsContainingBoxes/);
    assert.match(interactiveMapSource, /const representedProtectedBoxes = badge\.protectedBoxes\.map/);
    assert.match(interactiveMapSource, /const alertOverlayProtectedBoxes = mapAlertOverlayBoxes\.map/);
    assert.match(interactiveMapSource, /const hardBlockedBoxes = \[\.\.\.representedProtectedBoxes, \.\.\.hardKeepoutBoxes\]/);
    assert.match(
      interactiveMapSource,
      /scoreChooserScreenCandidate\([\s\S]*?representedProtectedBoxes,[\s\S]*?alertOverlayProtectedBoxes/,
    );
    assert.match(interactiveMapSource, /nearestProtectedBoxesToPoint/);
    assert.match(interactiveMapSource, /minimumBoundsGap/);
    assert.match(interactiveMapSource, /MAX_SOFT_OVERLAY_DISTANCE_PENALTY/);
    assert.match(interactiveMapSource, /const viewportCandidates = boundedChooserViewportCandidates/);
    assert.match(interactiveMapSource, /reduce<\{ position: MapPoint; score: number \} \| null>/);
    assert.match(interactiveMapSource, /chooserCenterAvoidsProtectedBoxes/);
    assert.match(interactiveMapSource, /chooserCenterFitsViewport/);
    assert.match(interactiveMapSource, /candidatesForGap/);
    assert.match(interactiveMapSource, /overlap-chooser-portal/);
    assert.match(interactiveMapSource, /formatOverlapChooserLocation/);
    assert.match(interactiveMapSource, /overlap-chooser-header-count/);
    assert.match(interactiveMapSource, /badge\.impacts\.length/);
    assert.match(interactiveMapSource, /transformOrigin:/);
    assert.match(interactiveMapSource, /surfaceRef\.current\?\.animate/);
    assert.match(interactiveMapSource, /<OverlapChooser[\s\S]*?key=\{expandedOverlapBadge\.segmentId\}/);
    assert.match(interactiveMapSource, /compactMotion/);
    assert.match(interactiveMapSource, /duration:\s*380/);
    assert.match(interactiveMapSource, /duration:\s*200/);
    assert.match(interactiveMapSource, /duration:\s*650/);
    assert.match(interactiveMapSource, /const close = async/);
    assert.match(interactiveMapSource, /duration:\s*220/);
    assert.match(interactiveMapSource, /animation\?\.finished/);
    assert.match(interactiveMapSource, /borderRadius:\s*"999px"/);
    assert.match(
      interactiveMapSource,
      /translate\(\$\{initialAnchorOffset\.x\}px, \$\{initialAnchorOffset\.y\}px\) scale\(0\.12, 0\.06\)/,
    );
    assert.match(
      interactiveMapSource,
      /translate\(\$\{layout\.anchorOffsetX\}px, \$\{layout\.anchorOffsetY\}px\) scale\(0\.12, 0\.06\)/,
    );
    assert.match(interactiveMapSource, /details\.displayDirection/);
    assert.match(interactiveMapSource, /return "Planned Closure"/);
    assert.doesNotMatch(interactiveMapSource, /overlap-chooser-choice-action/);
    assert.doesNotMatch(interactiveMapSource, /details\?\.title \?\? labelForImpactKind/);
    assert.match(globalCss, /\.overlap-chooser-surface/);
    assert.match(globalCss, /\.overlap-chooser-portal\s*\{[^}]*position:\s*absolute;[^}]*z-index:\s*45;/s);
    assert.match(globalCss, /@keyframes overlap-chooser-enter/);
    assert.match(globalCss, /border-radius:\s*50%/);
    assert.match(globalCss, /scale\(1\.04,\s*0\.96\)/);
    assert.match(globalCss, /\.overlap-chooser-header-count/);
    assert.match(globalCss, /\.overlap-chooser-choice\s*\{[^}]*border-left-width:\s*2px;/s);
    assert.match(globalCss, /\.overlap-chooser-list\s*\{[^}]*margin-right:\s*-6px;[^}]*padding-right:\s*6px;/s);
    assert.match(globalCss, /\.overlap-chooser-choice\.reduced-speed-zone\s*\{[^}]*rgba\(245,\s*158,\s*11,\s*0\.42\)/s);
    assert.match(globalCss, /\.motion-paused \.overlap-chooser-surface/);
    assert.match(globalCss, /@media \(max-width:\s*640px\)\s*\{[\s\S]*?\.overlap-chooser-choice-copy strong\s*\{[^}]*font-size:\s*15px;/s);
    assert.match(globalCss, /@media \(max-width:\s*640px\)\s*\{[\s\S]*?\.overlap-chooser-object\.open \.overlap-chooser-surface\s*\{[^}]*animation:\s*none;/s);
    assert.doesNotMatch(interactiveMapSource, /selectPrimaryImpact/);
  });

  it("keeps the overlap chooser open when a map pan produces a click", () => {
    assert.match(
      interactiveMapSource,
      /onClick=\{\(\) => \{\s*if \(shouldSuppressMapClick\(\)\) return;\s*setExpandedOverlapBadgeId\(null\);\s*\}\}/s,
    );
  });

  it("keeps selected alert hover corridors continuous above map artwork", () => {
    assert.match(interactiveMapSource, /function OverlayInteractionTarget/);
    assert.match(interactiveMapSource, /aria-label="Disruption overlay interaction targets"/);
    assert.match(interactiveMapSource, /selectionActive=\{Boolean\(selection\)\}/);
    assert.match(interactiveMapSource, /const hitRadius = selection/);
    assert.match(interactiveMapSource, /renderInteractionTarget=\{false\}/);
    assert.match(globalCss, /\.map-segment-hit-target\.selection-context\s*\{[^}]*stroke-width:\s*190px;/s);
  });

  it("retains disappearing map overlays long enough to fade out", () => {
    assert.match(interactiveMapSource, /useRetainedMapLayers/);
    assert.match(interactiveMapSource, /map-layer-exiting/);
    assert.match(globalCss, /\.map-layer-exiting/);
    assert.match(interactiveMapSource, /items\.length === 0 && previous\.some\(\(layer\) => !layer\.exiting\)/);
  });

  it("uses resolved SVG station centers for station flashes and hit targets", () => {
    assert.match(interactiveMapSource, /stationCenterPoints/);
    assert.match(interactiveMapSource, /stationPointFor/);
    assert.match(interactiveMapSource, /readSvgStationCenters/);
  });

  it("keeps alert and station focus flash elements wired for mobile-safe animation", () => {
    assert.match(interactiveMapSource, /flashSelection/);
    assert.match(interactiveMapSource, /flashStationId/);
    assert.match(interactiveMapSource, /data-map-highlight-id=\{flashSelection\.id\}/);
    assert.match(interactiveMapSource, /data-map-highlight-id=\{station\.id\}/);
    assert.match(interactiveMapSource, /className={`asset-alert-path map-selection-flash pointer-events-none \$\{[\s\S]*?fast \? "fast" : "latent"[\s\S]*?\}`}/);
    assert.match(interactiveMapSource, /className={`station-selection-flash \$\{[\s\S]*?isStationFastFlashing[\s\S]*?\}`}/);
    assert.match(globalCss, /@keyframes map-selection-flash/);
    assert.match(globalCss, /@keyframes station-selection-flash/);
    assert.match(interactiveMapSource, /aria-label="Station impact foreground highlights"/);
    assert.match(interactiveMapSource, /data-station-impact-selection-id=\{impact\.cardId\}/);
    assert.match(interactiveMapSource, /data-station-impact-hover-id=\{impact\.cardId\}/);
    assert.match(interactiveMapSource, /data-station-selection-foreground=\{station\.id\}/);
    assert.match(interactiveMapSource, /station-impact-hover-priority/);
    assert.match(
      interactiveMapSource,
      /station-selected-indicator[\s\S]*?foreground-flash-active/,
    );
    assert.match(
      globalCss,
      /@media \(min-width:\s*768px\) \{[\s\S]*?\.station-selected-indicator\.foreground-flash-active\s*\{[^}]*animation:\s*none;[^}]*opacity:\s*0;/,
    );
    const impactRingsIndex = interactiveMapSource.indexOf('aria-label="Station impact rings"');
    const foregroundHighlightsIndex = interactiveMapSource.indexOf('aria-label="Station impact foreground highlights"');
    const directionGlyphsIndex = interactiveMapSource.indexOf('aria-label="Station impact direction glyphs"');
    assert.ok(impactRingsIndex < directionGlyphsIndex);
    assert.ok(directionGlyphsIndex < foregroundHighlightsIndex);
  });

  it("softens desktop map selection highlights when motion is reduced", () => {
    assert.match(
      globalCss,
      /@media \(min-width:\s*768px\) \{[\s\S]*?\.motion-paused \.asset-alert-path\.map-selection-flash\.fast,[\s\S]*?opacity:\s*0\.55;/,
    );
    assert.match(
      globalCss,
      /@media \(min-width:\s*768px\) and \(prefers-reduced-motion:\s*reduce\) \{[\s\S]*?\.asset-alert-path\.map-selection-flash\s*\{[\s\S]*?opacity:\s*0\.55;/,
    );
  });

  it("keeps reduced-motion mobile selection highlights at the standard mobile opacity", () => {
    assert.match(
      globalCss,
      /\.linewatch-shell\.mobile-performance-mode \.asset-alert-path\.map-selection-flash\s*\{[^}]*opacity:\s*0\.7;/,
    );
    assert.match(
      globalCss,
      /\.motion-paused\.linewatch-shell\.mobile-performance-mode \.station-selection-flash,\s*\.motion-paused\.linewatch-shell\.mobile-performance-mode \.asset-alert-path\.map-selection-flash\s*\{[^}]*opacity:\s*0\.7;/,
    );
  });

  it("renders selected saved commute paths above disruption corridors but below stations", () => {
    assert.match(interactiveMapSource, /commutePathPreview/);
    assert.match(interactiveMapSource, /aria-label="Saved commute route preview"/);
    assert.match(interactiveMapSource, /CommutePathOverlay/);
    assert.match(interactiveMapSource, /data-commute-path-preview/);
    assert.match(interactiveMapSource, /className="asset-alert-path-glow commute-path-preview-glow"/);
    assert.match(interactiveMapSource, /className="asset-alert-path commute-path-preview-path"/);
    assert.match(globalCss, /\.commute-path-preview-path/);
    assert.match(globalCss, /\.commute-path-preview-chip/);
    assert.match(
      globalCss,
      /\n\.commute-path-preview-path\s*\{(?=[^}]*stroke-width:\s*102;)(?=[^}]*opacity:\s*0\.72;)(?=[^}]*animation:\s*candy-pulse 1\.2s infinite alternate ease-in-out;)[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\n\.commute-path-preview-glow\s*\{(?=[^}]*stroke-width:\s*155;)(?=[^}]*animation:\s*aura-pulse 1\.2s infinite alternate ease-in-out;)[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.station-commute-green-flash\s*\{(?=[^}]*animation:\s*station-commute-green-flash-anim 1\.2s infinite alternate ease-in-out;)(?=[^}]*animation-delay:\s*var\(--map-pulse-offset\);)[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.motion-paused \.commute-path-preview-path\s*\{[^}]*animation:\s*none\s*!important;[^}]*stroke-width:\s*102[^}]*opacity:\s*0\.72 !important;/s,
    );
    assert.match(
      globalCss,
      /@media \(prefers-reduced-motion:\s*reduce\) \{[\s\S]*?\.commute-path-preview-path\s*\{[^}]*animation:\s*none\s*!important;[^}]*stroke-width:\s*102[^}]*opacity:\s*0\.72 !important;/,
    );
    assert.match(
      globalCss,
      /@media \(prefers-reduced-motion:\s*reduce\) \{[\s\S]*?\.station-commute-green-flash[\s\S]*?animation:\s*none\s*!important;/,
    );
    assert.match(
      globalCss,
      /@media \(max-width:\s*767px\) \{[\s\S]*?\.station-commute-green-flash\s*\{(?=[^}]*fill:\s*#4ade80\s*!important;)(?=[^}]*stroke-width:\s*3\.5\s*!important;)(?=[^}]*transform:\s*scale\(1\.4\);)[^}]*\}/,
    );

    const impactLayerIndex = interactiveMapSource.indexOf("retainedImpactLayers.map");
    const previewGroupIndex = interactiveMapSource.indexOf('aria-label="Saved commute route preview"', impactLayerIndex);
    const selectedImpactIndex = interactiveMapSource.indexOf('aria-label="Selected disruption emphasis"', previewGroupIndex);
    const stationLayerIndex = interactiveMapSource.indexOf("svgParts?.part2", selectedImpactIndex);

    assert.ok(previewGroupIndex > -1, "saved commute preview group must exist");
    assert.ok(
      previewGroupIndex > impactLayerIndex,
      "the explicitly selected commute route must render above general disruption corridors",
    );
    assert.ok(
      selectedImpactIndex > previewGroupIndex,
      "a specifically selected commute disruption must render above the saved route",
    );
    assert.ok(
      stationLayerIndex > previewGroupIndex,
      "station dots and labels must remain above the selected commute route",
    );
  });

  it("renders the TTC map copyright notice as a quiet manually positioned viewport overlay", () => {
    const attributionBlock = cssBlockFor(".map-attribution-notice");
    const desktopFontSize = attributionBlock.match(/font-size:\s*(\d+)px;/);

    assert.match(interactiveMapSource, /aria-label="TTC map copyright notice"/);
    assert.match(interactiveMapSource, /© 2026 Toronto Transit Commission 02\/26 - Map not to scale/);
    assert.match(interactiveMapSource, /map-attribution-notice/);
    assert.match(attributionBlock, /position:\s*absolute;/);
    assert.match(attributionBlock, /right:\s*(?!;)[^;]+;/);
    assert.match(attributionBlock, /bottom:\s*(?!;)[^;]+;/);
    assert.match(attributionBlock, /border:\s*none;/);
    assert.ok(desktopFontSize, "desktop map attribution should declare a pixel font size");
    assert.ok(Number(desktopFontSize[1]) >= 13, "desktop map attribution should stay larger than the old small caption");
    assert.doesNotMatch(globalCss, /\.dark \.map-attribution-notice\s*\{[^}]*border-color:/s);
    assert.doesNotMatch(globalCss, /\.linewatch-shell\.high-contrast \.map-attribution-notice\s*\{[^}]*border-color:/s);
    assert.match(globalCss, /@media \(max-width:\s*767px\)\s*\{\s*\.map-attribution-notice\s*\{\s*display:\s*none;/);
    assert.match(globalCss, /\.linewatch-shell\.high-contrast \.map-attribution-notice/);
  });

  it("renders Spadina as two synchronized visual anchors for one station control", () => {
    assert.match(interactiveMapSource, /stationVisualCenterIds/);
    assert.match(interactiveMapSource, /stationVisualAnchorsFor/);
    assert.match(interactiveMapSource, /data-station-id=\{station\.id\}/);
    assert.match(interactiveMapSource, /data-station-anchor-id=\{anchorId\}/);
    assert.match(interactiveMapSource, /data-station-primary-target=\{anchorIndex === 0 \? "true" : "false"\}/);
    assert.match(interactiveMapSource, /data-station-hover-id=\{station\.id\}/);
    assert.match(interactiveMapSource, /data-station-selected-id=\{station\.id\}/);
    assert.match(interactiveMapSource, /tabIndex=\{anchorIndex === 0 \? 0 : -1\}/);
    assert.match(interactiveMapSource, /event\.pointerType !== "mouse"/);
    assert.match(globalCss, /\.station-hover-indicator/);
    assert.match(globalCss, /\.station-hit-target\.multi-anchor:hover/);
  });

  it("renders separate non-intersecting hover highlights over Spadina's two visual anchors", () => {
    assert.match(interactiveMapSource, /const usesIndependentSpadinaHover = station\.id === "spadina" && visualAnchors\.length === 2;/);
    assert.match(interactiveMapSource, /const hoverRadius = usesIndependentSpadinaHover \? 34/);
    assert.doesNotMatch(interactiveMapSource, /data-station-hover-capsule-id/);
  });

  it("keeps estimated train markers opt-in and suppresses them while subway is closed", () => {
    const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
    const moreSheetSource = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");
    const visualPreferencesSource = readFileSync(new URL("../src/app/visual-preferences.ts", import.meta.url), "utf8");

    assert.match(visualPreferencesSource, /linewatch-estimated-trains-enabled-v1/);
    assert.match(shellSource, /readVisualPreferencesFromStorage/);
    assert.match(shellSource, /getEstimatedTrainMarkers/);
    assert.match(shellSource, /estimatedTrainMarkerRefreshMs/);
    assert.match(shellSource, /const estimatedTrainMarkersVisible = estimatedTrainsEnabled && subwayOperatingState\.status === "open";/);
    assert.match(shellSource, /let trainMarkerRefreshInFlight = false;/);
    assert.match(shellSource, /if \(trainMarkerRefreshInFlight\) \{\s*return;\s*\}/);
    assert.match(shellSource, /trainMarkerRefreshInFlight = true;/);
    assert.match(shellSource, /trainMarkerRefreshInFlight = false;/);
    assert.match(shellSource, /if \(!estimatedTrainMarkersVisible \|\| document\.visibilityState !== "visible"\)/);
    assert.match(shellSource, /estimatedTrainsEnabled=\{estimatedTrainMarkersVisible\}/);
    assert.match(shellSource, /estimatedTrainMarkers=\{estimatedTrainMarkersVisible \? estimatedTrainSnapshot\.markers : \[\]\}/);
    assert.match(shellSource, /Live Train Markers/);
    assert.match(moreSheetSource, /Live Train Markers/);
    assert.doesNotMatch(shellSource, /Live Train Locations/);
    assert.doesNotMatch(moreSheetSource, /Live Train Locations/);
  });

  it("renders estimated train markers above station dots with directional high-contrast styling", () => {
    assert.match(interactiveMapSource, /aria-label="Estimated train markers"/);
    assert.match(interactiveMapSource, /function EstimatedTrainMarkerLayer/);
    assert.match(interactiveMapSource, /visualTravelDirection\(\{ \.\.\.segment, travelDirection: marker\.travelDirection \}\)/);
    assert.match(interactiveMapSource, /pathFrameAtProgress/);
    assert.match(interactiveMapSource, /estimatedTrainMarkerRenderKey\(marker\)/);
    assert.match(interactiveMapSource, /data-train-marker-line-id=\{marker\.lineId\}/);
    assert.match(interactiveMapSource, /data-train-marker-direction=\{marker\.direction\}/);
    assert.match(interactiveMapSource, /estimated-train-marker-arrow/);
    assert.match(globalCss, /\.estimated-train-marker-core/);
    assert.match(globalCss, /\.estimated-train-marker-arrow/);
    assert.match(globalCss, /\.estimated-train-marker-layer\[data-muted="true"\]/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-performance-mode \.estimated-train-marker-halo/);
    assert.match(interactiveMapSource, /pathMetricCache/);
    assert.doesNotMatch(interactiveMapSource, /estimated-train-marker-mobile-dot/);
    assert.match(interactiveMapSource, /<TrainMarkerGlyph \/>/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-performance-mode \.estimated-train-marker\s*\{[^}]*filter:\s*none\s*!important;/s);
    assert.match(globalCss, /\.linewatch-shell\.mobile-performance-mode \.estimated-train-marker-outline\s*\{[^}]*stroke:\s*#050505;/s);
    assert.match(globalCss, /\.linewatch-shell\.mobile-performance-mode \.estimated-train-marker-core\s*\{[^}]*stroke:\s*#050505;/s);
    assert.match(globalCss, /\.linewatch-shell\.mobile-performance-mode \.estimated-train-marker-window/);

    const overlayIndex = interactiveMapSource.indexOf('aria-label="Disruption overlays"');
    const trainIndex = interactiveMapSource.indexOf('aria-label="Estimated train markers"');
    const stationLayerIndex = interactiveMapSource.indexOf("{/* Top Layer: Stations (layer6) and text */}");
    const badgeIndex = interactiveMapSource.indexOf('aria-label="Overlapping alert badges"');

    assert.ok(overlayIndex > -1);
    assert.ok(stationLayerIndex > overlayIndex);
    assert.ok(trainIndex > stationLayerIndex);
    assert.ok(badgeIndex > trainIndex);
  });
});
