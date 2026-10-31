import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";
import { getImpactPriority } from "../src/app/map-alert-selector.ts";
import { readShellSource } from "./helpers/shell-source.mjs";

const globalCss = readAppStylesheet();
const lineAlertOverlaysSource = readFileSync(new URL("../src/components/map-overlays/LineAlertOverlays.tsx", import.meta.url), "utf8");
// The shared overlay layer both maps draw alerts with (components/map-overlays).
const sharedOverlaySource = [
  "map-overlays/LineAlertOverlays.tsx",
  "map-overlays/GlyphLanes.tsx",
  "map-overlays/line-alert-model.ts",
  "map-overlays/overlay-hover.ts",
  "map-overlays/overlay-plane.ts",
  "map-overlays/preview-outline.ts",
  "map-overlays/StationAlertOverlays.tsx",
  "map-overlays/station-alert-model.ts",
  "map-overlays/map-hover-controller.ts",
  "map-overlays/selection-intro.ts",
  "map-overlays/CommutePreviewOverlays.tsx",
  "map-overlays/commute-preview-model.ts",
  "map-overlays/pulse-sync.ts",
  "map-overlays/overlay-obstacles.ts",
].map((name) => readFileSync(new URL(`../src/components/${name}`, import.meta.url), "utf8")).join("\n");
// TTC's renderer together with the shared layer it renders overlays with.
const interactiveMapSource = [
  readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8"),
  // The shared station layer, memoized per station.
  readFileSync(new URL("../src/components/MapStationLayers.tsx", import.meta.url), "utf8"),
  sharedOverlaySource,
].join("\n");
const ttcGlyphLanesSource = readFileSync(new URL("../src/components/map-overlays/GlyphLanes.tsx", import.meta.url), "utf8");
const ttcMapObstaclesSource = readFileSync(new URL("../src/components/ttc-map-obstacles.ts", import.meta.url), "utf8");
const ttcTrainMarkerLayerSource = readFileSync(new URL("../src/components/TtcTrainMarkerLayer.tsx", import.meta.url), "utf8");
// The TTC renderer and the modules split out of it; absence checks cover all of them.
const ttcMapRendererSource = [interactiveMapSource, ttcGlyphLanesSource, ttcMapObstaclesSource, ttcTrainMarkerLayerSource].join("\n");
const interactiveRegionalMapSource = readFileSync(new URL("../src/components/InteractiveRegionalMap.tsx", import.meta.url), "utf8");
const regionalStationLayersSource = readFileSync(new URL("../src/components/MapStationLayers.tsx", import.meta.url), "utf8");
const regionalAssetSource = readFileSync(new URL("../src/app/regional-map-asset.ts", import.meta.url), "utf8");
const regionalOverlaysSource = readFileSync(new URL("../src/app/regional-map-overlays.ts", import.meta.url), "utf8");
const ttcChooserPlacementSource = readFileSync(new URL("../src/components/map-chooser-placement.ts", import.meta.url), "utf8");
const chooserHookSource = readFileSync(new URL("../src/components/map-overlays/useMapOverlapChooser.ts", import.meta.url), "utf8");
const geographicMapSource = readFileSync(new URL("../src/components/GeographicNetworkMap.tsx", import.meta.url), "utf8");
const overlapChooserSource = readFileSync(new URL("../src/components/MapOverlapChooser.tsx", import.meta.url), "utf8");
const overlapIndicatorSource = readFileSync(new URL("../src/components/MapOverlapIndicator.tsx", import.meta.url), "utf8");
const overlapBadgesSource = readFileSync(new URL("../src/components/map-overlap-badges.ts", import.meta.url), "utf8");
const overlapSvgSource = readFileSync(new URL("../src/components/map-overlap-svg.ts", import.meta.url), "utf8");
const badgeLayoutSource = readFileSync(new URL("../src/components/map-overlays/overlap-badge-layout.ts", import.meta.url), "utf8");
const chooserKeepoutsSource = readFileSync(new URL("../src/components/map-chooser-keepouts.ts", import.meta.url), "utf8");
const plannedClosureIconSource = readFileSync(new URL("../src/components/PlannedClosureIcon.tsx", import.meta.url), "utf8");
const mapImpactNormalizationSource = readFileSync(new URL("../src/components/map-impact-normalization.ts", import.meta.url), "utf8");
const stationImpactDirectionSource = readFileSync(new URL("../src/components/station-impact-direction.ts", import.meta.url), "utf8");

function cssBlockFor(selector) {
  const start = globalCss.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} block must exist`);

  const end = globalCss.indexOf("\n}", start);
  assert.ok(end > start, `${selector} block must close`);

  return globalCss.slice(start, end + 2);
}

describe("asset-backed map layering", () => {
  it("keeps station-dot activation idempotent so repeated clicks cannot dismiss details", () => {
    // TTC's targets select themselves (MapStationLayers.tsx `select`).
    assert.match(interactiveMapSource, /select\.onSelectStationId\(station\.id\)/);
    assert.doesNotMatch(ttcMapRendererSource, /onSelectStationId\(selected \? null : station\.id\)/);
    assert.match(interactiveMapSource, /function capturePointer[\s\S]*setPointerCapture\(event\.pointerId\)/);
    assert.match(interactiveMapSource, /onPointerUp: \(event[^)]*\) => \{[\s\S]*select\.shouldSuppressMapClick\(\)[\s\S]*select\.onSelectStationId\(station\.id\)/);
    assert.match(interactiveMapSource, /if \(event\.detail !== 0 \|\| select\.shouldSuppressMapClick\(\)\) return/);
    assert.match(interactiveMapSource, /<MapStationTargets[\s\S]*?select=\{stationTargetSelect\}/);
  });

  it("renders a station and label layer above alert overlays", () => {
    assert.match(interactiveMapSource, /aria-label="Disruption overlays"/);
    assert.match(interactiveMapSource, /dangerouslySetInnerHTML=\{\{\s*__html:\s*svgParts\?\.part2/);
    assert.ok(
      interactiveMapSource.indexOf('aria-label="Disruption overlays"') <
        interactiveMapSource.indexOf("dangerouslySetInnerHTML={{ __html: svgParts?.part2"),
      "station and label layers must render above disruption overlays in the authored SVG plane",
    );
    assert.ok(
      interactiveMapSource.indexOf('plane="badges"') <
        interactiveMapSource.indexOf('aria-label="Disruption overlays"') &&
      interactiveMapSource.indexOf('aria-label="Disruption overlays"') <
        interactiveMapSource.indexOf('plane="foreground"') &&
      interactiveMapSource.indexOf('plane="foreground"') <
        interactiveMapSource.indexOf('plane="labels"'),
      "raster planes must stack badges underneath disruption overlays, with foreground stations and labels above",
    );
  });

  it("renders station hit targets above disruption overlays", () => {
    assert.match(interactiveMapSource, /aria-label="Station hit targets"/);
    assert.match(interactiveMapSource, /station-hit-target/);
    assert.match(interactiveMapSource, /onSelectStationId/);
    assert.ok(
      interactiveMapSource.indexOf('aria-label="Disruption overlay interaction targets"') <
        interactiveMapSource.indexOf("<MapStationTargets"),
      "station targets must receive pointer hits above disruption corridors",
    );
    assert.ok(
      interactiveMapSource.indexOf("<MapStationTargets") <
        interactiveMapSource.indexOf('aria-label="Station impact rings"'),
      "station rings must render after station hit targets so ring strokes remain clickable",
    );
  });

  it("derives pointer targets from authored station text bounds", () => {
    // Name boxes are prepared data (src/app/ttc-map-geometry.ts), padded for TTC.
    assert.match(interactiveMapSource, /ttcStationLabelPolygons\(TTC_GEOMETRY, stations\.map\(\(station\) => station\.id\)\)/);
    assert.match(interactiveMapSource, /data-station-label-id=\{stationId\}/);
    assert.match(interactiveMapSource, /<polygon/);
    assert.match(interactiveMapSource, /points=\{labelPoints\(points\)\}/);
    assert.match(interactiveMapSource, /className="station-label-hit-target"/);
    assert.match(interactiveMapSource, /focusable="false"/);
    assert.match(interactiveMapSource, /onClick: \(event[^)]*\) => \{[\s\S]*?interaction\.onSelectStationId\(stationId\)/);
    assert.match(interactiveMapSource, /<MapStationLabelTargets labels=\{stationLabelTargets\} interaction=\{stationLabelInteraction\} \/>/);
    assert.match(globalCss, /\.station-label-hit-target\s*\{[^}]*cursor:\s*pointer;[^}]*fill:\s*transparent;[^}]*outline:\s*none;[^}]*stroke:\s*transparent;/s);
    assert.match(interactiveMapSource, /station-label-hovered/);
    assert.match(interactiveMapSource, /station-label-hover-effect/);
    assert.match(
      interactiveMapSource,
      /Marker polling can[\s\S]*?useLayoutEffect\(\(\) => \{[\s\S]*?station-label-hover-effect-active[\s\S]*?\n  \}\);/,
      "station label hover classes should be reconciled after marker-driven React commits",
    );
    assert.ok(
      interactiveMapSource.indexOf('aria-label="Station impact rings"') <
        interactiveMapSource.indexOf("<MapStationLabelTargets"),
      "station-name targets must remain above station dots and impact rings",
    );
    assert.doesNotMatch(ttcMapRendererSource, /station-label-hover-clone/);
    assert.doesNotMatch(ttcMapRendererSource, /authoredFontSize \* 1\.025/);
    assert.match(globalCss, /\.station-label-hover-effect\s*\{[^}]*pointer-events:\s*none;[^}]*transform-box:\s*fill-box;/s);
    assert.match(
      globalCss,
      /#ttc-station-labels-layer \[data-station-label-for\]\s*\{[^}]*stroke:\s*#000000\s*!important;[^}]*stroke-width:\s*2px\s*!important;/s,
    );
    assert.match(
      globalCss,
      /\.dark \.ttc-svg-container #ttc-station-labels-layer \[data-station-label-for\]\s*\{[^}]*stroke:\s*#ffffff\s*!important;/s,
    );
    assert.doesNotMatch(
      globalCss,
      /#ttc-station-labels-layer \[data-station-label-for\][^{]*\{[^}]*(?:scale|transform-(?:box|origin)):/s,
    );
  });

  it("gives regional station names the TTC hover glow with a bounded fast reveal", () => {
    assert.match(regionalAssetSource, /dataset\.regionalStationLabelFor = stationId/);
    assert.match(interactiveRegionalMapSource, /raster-station-label-text-hover/);
    assert.doesNotMatch(interactiveRegionalMapSource, /regional-station-label-hover-clone/);
    // GO/UP's names share the station-name targets; its viewport handles their hover and taps.
    assert.match(interactiveRegionalMapSource, /<MapStationLabelTargets labels=\{stationLabelTargets\} \/>/);
    assert.match(regionalStationLayersSource, /data-station-label-id=\{stationId\}/);
    assert.match(interactiveRegionalMapSource, /regionalStationLabelHover/);
    assert.doesNotMatch(interactiveRegionalMapSource, /regional-raster-label-halo/);
    assert.match(
      globalCss,
      /\.station-label-hit-target\s*\{[^}]*fill:\s*transparent;[^}]*pointer-events:\s*all;/s,
      "regional station names should be targets over their complete text box instead of individual glyph outlines",
    );
    assert.match(
      globalCss,
      /\.station-label-hover-effect-active,[\s\S]*?\{[^}]*filter:\s*drop-shadow\(0 0 7px[^}]*transform:\s*scale\(1\.035\);/s,
    );
    assert.match(globalCss, /\.station-label-hover-effect\s*\{[^}]*transition:\s*transform 120ms ease, filter 120ms ease;/s);
    assert.match(globalCss, /\.station-label-hover-effect-active,[\s\S]*?\{[^}]*transition-delay:\s*0ms;/s);
    assert.match(interactiveRegionalMapSource, /x=\{hoveredStationLabel\.bounds\.x\}/);
    assert.doesNotMatch(globalCss, /@keyframes station-label-selection-(?:intro|breathe)/);
  });

  it("uses explicit SVG hit testing for station touch targets", () => {
    assert.match(
      globalCss,
      /\.station-hit-target :is\(circle, ellipse, rect\)\s*\{[^}]*fill:\s*transparent;[^}]*pointer-events:\s*all;[^}]*stroke-width:\s*calc\(2 \* var\(--station-hit-padding, 0px\)\);/s,
      "transparent station shapes must remain tappable in mobile SVG implementations",
    );
    assert.match(
      globalCss,
      /@media \(pointer:\s*coarse\) \{\s*\.station-hit-target :is\(circle, ellipse, rect\)\s*\{\s*stroke-width:\s*calc\(2 \* var\(--station-touch-hit-padding, 0px\)\);/,
      "touch pointers get the map's touch padding around each station",
    );
  });

  it("draws station targets, hover rings and selection from the artwork on both maps", () => {
    // Sizes are the artwork's (tests/map-station-artwork.test.mjs); the padding is manifest data.
    for (const mapSource of [interactiveMapSource, interactiveRegionalMapSource]) {
      assert.match(mapSource, /mapStationArtwork\((?:TTC|REGIONAL)_GEOMETRY/);
      assert.match(mapSource, /<MapStationHoverIndicators/);
      assert.match(mapSource, /hitPadding=\{(?:TTC|REGIONAL)_MANIFEST\.stationHitPadding\}/);
    }
    assert.doesNotMatch(ttcMapRendererSource, /const hitRadius|const hoverRadius/);
    // Hover rings sit under the station artwork, as on GO/UP.
    assert.ok(
      interactiveMapSource.indexOf("<MapStationHoverIndicators") <
        interactiveMapSource.indexOf("dangerouslySetInnerHTML={{ __html: svgParts?.part2"),
    );
    assert.match(interactiveMapSource, /className="station-hover-indicator"/);
    assert.match(interactiveMapSource, /setMapStationHovered\(mapRootRef\.current, stationId, hovered\)/);
    assert.match(
      globalCss,
      /\.station-hover-indicator\.active:not\(\[data-station-hover-selected="true"\]\) :is\(circle, rect, ellipse\)\s*\{[^}]*fill:\s*rgb\(var\(--station-selection-accent-rgb\)\s*\/\s*30%\);[^}]*stroke:\s*var\(--station-selection-accent\);[^}]*stroke-width:\s*calc\(10px \* var\(--map-overlay-unit, 1\)\);/s,
    );
    assert.match(globalCss, /--station-selection-accent:\s*var\(--color-logo-blue\);/);
    assert.match(globalCss, /--station-selection-accent-rgb:\s*129 201 255;/);
    assert.match(globalCss, /\.station-impact-hover-priority\s*\{[^}]*stroke:\s*var\(--station-selection-accent\);/s);
    assert.match(globalCss, /\.station-selection-flash\s*\{[^}]*fill:\s*var\(--station-selection-accent\);/s);
  });

  it("uses a larger screen-sized hit stroke without making disruption visuals thicker", () => {
    assert.match(interactiveMapSource, /className="map-segment-hit-target"/);
    assert.match(interactiveMapSource, /vectorEffect="non-scaling-stroke"/);
    assert.match(globalCss, /\.map-segment-hit-target\s*\{[^}]*stroke-width:\s*96px;/s);
    assert.match(
      globalCss,
      /@media \(pointer:\s*coarse\)[\s\S]*?\.map-segment-hit-target\s*\{[^}]*stroke-width:\s*144px;/,
    );
  });

  it("provides segment press feedback without adding map instructions", () => {
    assert.doesNotMatch(ttcMapRendererSource, /map-interaction-hint/);
    assert.doesNotMatch(ttcMapRendererSource, /Tap affected sections/);
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
      /\.asset-alert-path-hover-boundary\s*\{[^}]*stroke-width:\s*calc\(122\.5px \* var\(--map-overlay-unit, 1\)\);[\s\S]*?\.overlay-segment-group:has\(\.map-segment-hit-target:hover\) \.asset-alert-path-hover-boundary,[\s\S]*?opacity:\s*0\.94;/,
    );
    // No glow on hover or selection: the outline and the flash mark them.
    assert.doesNotMatch(globalCss, /\.interactive-glow[^{,]*\{[^}]*display:\s*block/s);
  });

  it("draws TTC alert rails as tubes wider than the line", () => {
    // TTC's 80-unit line shows a tube 8 units past each edge. Tubes have no
    // casing, so lines drawn edge to edge (St George) meet without a gap.
    assert.match(globalCss, /--map-alert-rail-width:\s*96px;/);
    assert.doesNotMatch(globalCss, /asset-alert-path-casing/);
    assert.doesNotMatch(interactiveMapSource, /asset-alert-path-casing/);
  });

  it("renders direction-aware planned closures with still calendar icons", () => {
    assert.match(ttcGlyphLanesSource, /import \{ PlannedClosureIcon \} from "\.\.\/PlannedClosureIcon"/);
    assert.match(ttcGlyphLanesSource, /function PlannedClosureIconLane\(/);
    assert.match(ttcGlyphLanesSource, /className="planned-closure-icon-lane"/);
    assert.match(ttcGlyphLanesSource, /<PlannedClosureIcon[\s\S]*?className="planned-closure-map-icon"/);
    assert.match(ttcGlyphLanesSource, /isDirectional \? Math\.round\(length \/ \(124 \* unit\)\) : Math\.floor\(length \/ \(112 \* unit\)\)/);
    assert.match(ttcGlyphLanesSource, /const step = length \/ count/);
    assert.match(ttcGlyphLanesSource, /const chevronDistance = \(distance \+ step \/ 2\) % length/);
    assert.match(plannedClosureIconSource, /<rect[\s\S]*?x="3"[\s\S]*?y="5"[\s\S]*?width="18"[\s\S]*?height="16"[\s\S]*?rx="3"/);
    assert.match(plannedClosureIconSource, /M3 9H21M12 12V15M12 18H12\.01M7 3V5M17 3V5/);
    assert.match(ttcGlyphLanesSource, /travelDirection === "bidirectional"[\s\S]*?planned-closure-map-icon planned-closure-map-icon--static/);
    assert.match(ttcGlyphLanesSource, /className="planned-closure-direction-chevron"/);
    assert.match(ttcGlyphLanesSource, /d="M -10 -13 L 10 0 L -10 13"/);
    assert.match(ttcGlyphLanesSource, /transform=\{`translate\(\$\{point\.chevronX\} \$\{point\.chevronY\}\) rotate\(\$\{staticAngle\}\)\$\{scaled\(unit\)\}`\}/);
    assert.match(ttcGlyphLanesSource, /x=\{-36\}[\s\S]*?y=\{-36\}[\s\S]*?width=\{72\}[\s\S]*?height=\{72\}/);
    assert.match(interactiveMapSource, /<PlannedClosureIconLane pathD=\{pathD\} travelDirection=\{travelDirection\} unit=\{unit\} \/>/);
    assert.match(interactiveMapSource, /closure\.travelDirection \?\? "bidirectional"/);
    assert.doesNotMatch(ttcMapRendererSource, /planned-preview-underlay/);
    assert.doesNotMatch(globalCss, /planned-preview-separator/);
    assert.match(globalCss, /--planned-preview-rail:\s*#f1f5f9;/);
    assert.match(globalCss, /--planned-preview-ink:\s*#087fff;/);
    assert.match(
      globalCss,
      /\.asset-alert-path\.planned-preview\s*\{[^}]*opacity:\s*1;[^}]*stroke:\s*var\(--planned-preview-rail\);[^}]*stroke-width:\s*calc\(var\(--map-alert-rail-width\) \* var\(--map-overlay-unit, 1\)\);/s,
    );
    assert.match(
      globalCss,
      /\.planned-closure-map-icon\s*\{[^}]*color:\s*var\(--planned-preview-ink\);/s,
    );
    assert.match(
      globalCss,
      /\.planned-closure-map-icon :is\(rect, path\)\s*\{[^}]*stroke:\s*var\(--planned-preview-ink\) !important;/s,
    );
    assert.match(
      globalCss,
      /\.planned-closure-direction-chevron\s*\{[^}]*stroke:\s*var\(--planned-preview-ink\);/s,
    );
    assert.match(
      globalCss,
      /\.linewatch-shell\.dark \.asset-alert-path-hover-boundary\.planned-preview\s*\{[^}]*stroke:\s*var\(--planned-preview-ink\);/s,
    );
    // Filtered icons re-filter on every zoom frame (map-renderer-parity.md rule 4).
    assert.doesNotMatch(
      cssBlockFor(".planned-closure-map-icon"),
      /animation:|filter:/,
    );
  });

  it("repaints the mouse-hover highlight above overlapping disruption corridors", () => {
    assert.doesNotMatch(ttcMapRendererSource, /hoveredOverlayHighlight|hoveredOverlayForeground/);
    assert.match(interactiveMapSource, /installMapHoverController\(root, \{/);
    assert.match(interactiveMapSource, /element\.dataset\.mapImpactHovered = "true"/);
    assert.match(
      interactiveMapSource,
      /<MapLineAlertHoverOutlines[\s\S]*?aria-label="Disruption overlay interaction targets"/,
    );
    // One keyline helper draws every hover outline: masks of the outer edge,
    // the core cutout (the rail's edge), and the edge divider over the given paths.
    assert.match(
      interactiveMapSource,
      /maskStrokes\("map-impact-hover-outline-mask-outer", "white", width\(MAP_HOVER_OUTLINE_WIDTHS\.outer\)\)[\s\S]*?mask\(maskId, "map-impact-hover-outline-mask-cutout", width\(MAP_HOVER_OUTLINE_WIDTHS\.inner\)\)[\s\S]*?mask\(outerMaskId, "map-impact-hover-outline-mask-divider", width\(MAP_HOVER_OUTLINE_WIDTHS\.divider\)\)[\s\S]*?outlineStrokes\("map-impact-hover-outline-core", maskId[\s\S]*?outlineStrokes\("map-impact-hover-outline-edge", outerMaskId/,
    );
    assert.match(interactiveMapSource, /strokeWidth=\{strokeWidth\}\s*style=\{\{ strokeWidth \}\}/);
    assert.doesNotMatch(ttcMapRendererSource, /hover-priority-boundary-ring-mask/);
    // Hover follows a mouse pointer only.
    assert.match(interactiveMapSource, /if \(event\.pointerType !== "mouse" \|\| options\.isPointerGestureActive\?\.\(\)\) return;/);
    assert.match(
      globalCss,
      /\.map-impact-hover-foreground\[data-map-impact-hovered="true"\]\s*\{[^}]*display:\s*inline;/s,
    );
    assert.match(globalCss, /\.map-impact-hover-outline-core\s*\{[^}]*stroke:\s*rgba\(15,\s*23,\s*42,\s*0\.98\);/s);
    assert.match(globalCss, /\.map-impact-hover-outline-edge\s*\{[^}]*stroke:\s*rgba\(248,\s*250,\s*252,\s*0\.98\);[^}]*filter:\s*drop-shadow\(0 0 calc\(2\.9px \* var\(--map-overlay-unit, 1\)\)/s);
    assert.match(globalCss, /\.map-impact-hover-outline-mask-divider\s*\{[^}]*stroke:\s*black;[^}]*stroke-width:\s*calc\(108\.2px \* var\(--map-overlay-unit, 1\)\);/s);
    assert.match(globalCss, /\.map-impact-hover-outline-mask-cutout\s*\{[^}]*stroke:\s*black;[^}]*stroke-width:\s*calc\(var\(--map-alert-rail-width\) \* var\(--map-overlay-unit, 1\)\);/s);
    assert.doesNotMatch(ttcMapRendererSource, /ttc-impact-hover-rail/);
  });

  it("renders still visual effects for delays, closures, and station impacts", () => {
    assert.match(interactiveMapSource, /<pattern id="badge-suspension-hash"/);
    assert.match(ttcGlyphLanesSource, /className="rsz-chevron"/);
    assert.match(ttcGlyphLanesSource, /d="M -12 -10 L 8 0 L -12 10"/);
    assert.match(interactiveMapSource, /<HourglassGlyphLane/);
    assert.match(interactiveMapSource, /className="asset-alert-path delay-candy pointer-events-none"/);
    assert.match(interactiveMapSource, /style=\{\{\s*pointerEvents:\s*"none",\s*stroke:\s*RSZ_IMPACT_COLOR\s*\}\}/);
    assert.match(interactiveMapSource, /SuspensionNoEntryLane/);
    assert.match(interactiveMapSource, /className="asset-alert-path suspension-candy suspension-solid pointer-events-none"/);
    assert.match(globalCss, /@keyframes aura-pulse/);
    assert.doesNotMatch(globalCss, /\.asset-alert-path-glow\.(?:suspension|delay|reduced-speed-zone|delay-static)\s*\{[^}]*animation:(?!\s*none)/s);
    assert.doesNotMatch(globalCss, /\.delay-static-path\s*\{[^}]*animation:(?!\s*none)/s);
    assert.match(globalCss, /\.linewatch-shell\.mobile-performance-mode \.asset-alert-path-glow,[\s\S]*animation:\s*none\s*!important;/s);

    const mapGeometrySource = readFileSync(new URL("../src/app/map-geometry.ts", import.meta.url), "utf8");

    assert.match(interactiveMapSource, /const TTC_GUIDE_PATHS = ttcGuidePaths\(TTC_GEOMETRY\)/);
    assert.match(interactiveMapSource, /resolveNetworkSegmentPath/);
    assert.match(mapGeometrySource, /segment\.travelDirection \?\? "bidirectional"/);
    assert.match(mapGeometrySource, /segment\.guidePathReversed/);
    assert.match(interactiveMapSource, /travelDirection !== "reverse"/);
    assert.match(interactiveMapSource, /travelDirection !== "forward"/);
    assert.match(globalCss, /\.motion-paused \.asset-alert-path-glow/);
    assert.match(globalCss, /prefers-reduced-motion:\s*reduce/);
    assert.match(interactiveMapSource, /segment\.impacts/);
    assert.match(interactiveMapSource, /composeNetworkSegmentPath/);
    assert.match(interactiveMapSource, /stationNodeImpacts/);
    assert.match(interactiveMapSource, /pointerEvents=\{exiting \? "none" : "stroke"\}/);
    assert.match(overlapChooserSource, /onSelectImpact\(\{ kind: impact\.kind, id: impact\.cardId \}\)/);
    assert.match(interactiveMapSource, /stationImpactDirectionForImpact/);
    assert.match(interactiveMapSource, /stationImpactDirectionForStationImpacts/);
    assert.match(interactiveMapSource, /aria-label="Station impact direction glyphs"/);
    assert.match(interactiveMapSource, /<MapStationDirectionGlyphs/);
    assert.match(interactiveMapSource, /stationImpactEffectRadius\(isLarge\)/);
    assert.match(interactiveMapSource, /return isLargeStation \? 48 : 26;/);
    assert.match(interactiveMapSource, /stationImpactDirectionBadgeRadius\(isStationVisuallyLarge\(station\)\)/);
    assert.match(interactiveMapSource, /return isLargeStation \? 40 : 24;/);
    assert.match(interactiveMapSource, /stationImpactRingRadius\(isLarge\)/);
    assert.match(interactiveMapSource, /return isLargeStation \? 56 : 38;/);
    assert.match(stationImpactDirectionSource, /FOUR_WAY_STATION_IMPACT_ARROW_SCALE = 0\.94/);
    assert.match(stationImpactDirectionSource, /direction === "four-way" \? radius \* FOUR_WAY_STATION_IMPACT_ARROW_SCALE : radius/);
    assert.match(stationImpactDirectionSource, /stationImpactDirectionMetrics\(pathMetricsRadius\)/);
    assert.match(stationImpactDirectionSource, /Math\.round\(radius \* 0\.75\)/);
    assert.match(stationImpactDirectionSource, /stationImpactDirectionCenteredPartPath/);
    assert.match(stationImpactDirectionSource, /stationImpactDirectionSpokePartPath/);
    assert.match(stationImpactDirectionSource, /metrics\.extent/);
    assert.match(stationImpactDirectionSource, /metrics\.headInset/);
    assert.match(stationImpactDirectionSource, /direction === "four-way"/);
    assert.match(globalCss, /\.station-impact-direction-badge/);
    assert.match(globalCss, /\.station-impact-direction-arrow/);
    assert.match(interactiveMapSource, /feTurbulence/);
    assert.match(globalCss, /\.delay-static-path/);

    assert.match(interactiveMapSource, /data-map-highlight-id/);
    assert.match(interactiveMapSource, /map-selection-flash/);
    assert.doesNotMatch(ttcMapRendererSource, /isSelectionFastFlashing|isStationFastFlashing/);
  });

  it("does not flash a loading label while either map initializes", () => {
    assert.doesNotMatch(ttcMapRendererSource, /Loading TTC Map/i);
    assert.doesNotMatch(geographicMapSource, /Loading .*Geographic Map/i);
  });

  it("renders reduced speed zone chevron glyphs without a clipping mask", () => {
    const rszStart = interactiveMapSource.indexOf('{visualState === "reduced-speed-zone"');
    const suspensionStart = interactiveMapSource.indexOf('{visualState === "suspension"', rszStart);
    const rszBlock = interactiveMapSource.slice(rszStart, suspensionStart);

    assert.ok(rszStart > -1, "reduced speed zone overlay branch must exist");
    assert.ok(suspensionStart > rszStart, "suspension branch should follow reduced speed zone branch");
    assert.match(rszBlock, /<ChevronGlyphLane/);
    assert.match(rszBlock, /className="rsz-chevron-lanes"/);
    assert.doesNotMatch(rszBlock, /className="rsz-chevron-mask-path/);
    assert.doesNotMatch(rszBlock, /<g\s+mask=\{`url\(#\$\{segment\.id\}-mask\)`\}/);
    assert.match(globalCss, /\.rsz-chevron-lanes\s*\{[^}]*overflow:\s*visible;/s);
  });

  it("keeps every alert overlay still on both maps", () => {
    const laneStart = ttcGlyphLanesSource.indexOf("function GlyphLane(");
    const laneEnd = ttcGlyphLanesSource.indexOf("function SuspensionNoEntryGlyph(", laneStart);
    const laneBlock = ttcGlyphLanesSource.slice(laneStart, laneEnd);

    assert.ok(laneStart > -1, "GlyphLane must exist");
    assert.match(laneBlock, /transform=\{glyphLaneTransform\(metrics, index, shouldRotate, unit\)\}/);
    assert.match(ttcGlyphLanesSource, /function measureGlyphLane/);
    assert.match(ttcGlyphLanesSource, /const sampleCount = Math\.max\(2, Math\.ceil\(length \/ 12\)\)/);
    // No moving glyphs, alert pulses, or motion budget on either map.
    assert.doesNotMatch(ttcMapRendererSource, /<animateMotion|MAX_CONTINUOUSLY_ANIMATED_OVERLAY_LAYERS|data-map-overlay-motion-paused/);
    assert.doesNotMatch(regionalOverlaysSource, /animateMotion|MAX_CONTINUOUSLY_ANIMATED_OVERLAY_LAYERS/);
    assert.doesNotMatch(globalCss, /@keyframes (?:gold-ring-pulse|station-radar-core|station-radar-ping|regional-station-impact-fill-pulse|delay-static-shift)\b/);
    assert.doesNotMatch(globalCss, /\.regional-impact-aura\s*\{[^}]*animation:(?!\s*none)/s);
    assert.match(globalCss, /\.asset-alert-path-glow:not\(\.map-selection-attention\):not\(\.interactive-glow\):not\(\.commute-path-preview-glow\)\s*\{[^}]*display:\s*none !important;[^}]*animation:\s*none !important;[^}]*filter:\s*none !important;/s);
  });

  it("draws glyph lanes without a clip mask as long as the alert", () => {
    // Corridor-length masks held most of GO/UP's drawing-layer area at rest
    // and re-rastered at every zoom step (tile memory, page flicker). Glyphs
    // sit centred inside the tube, so nothing needs clipping.
    const tubeSource = lineAlertOverlaysSource.slice(
      lineAlertOverlaysSource.indexOf("export function MapLineAlertTube"),
      lineAlertOverlaysSource.indexOf("export function MapLineAlertLayer"),
    );
    assert.doesNotMatch(tubeSource, /<mask\b|\bmask=/);
    assert.doesNotMatch(globalCss, /map-glyph-lane-clip|delay-hourglass-mask-path|suspension-mask-path/);
    assert.equal((lineAlertOverlaysSource.match(/className="map-glyph-lane"/g) ?? []).length, 3);
  });

  it("leaves the pointer to alert targets: tubes and their hover copies never take it", () => {
    // GO/UP's SVG is interactive, so a tube that took the pointer made its
    // <use> hover copy, drawn above the targets, swallow presses and focus.
    assert.match(globalCss, /\n\.asset-alert-path\s*\{[^}]*pointer-events:\s*none;/s);
    assert.doesNotMatch(globalCss, /\n\.asset-alert-path\s*\{[^}]*cursor:\s*pointer/s);
    // A presentation attribute loses to any stylesheet rule; inline styles do not.
    assert.doesNotMatch(lineAlertOverlaysSource, /className=\{?[`"]asset-alert-path[^>]*pointerEvents="none"/s);
    assert.match(globalCss, /\.map-segment-hit-target\s*\{[^}]*pointer-events:\s*stroke;/s);
  });

  it("keeps the remaining pulses (commute preview, selected station) on one shared phase", () => {
    assert.match(globalCss, /--map-overlay-pulse-half-cycle:\s*1\.2s/);
    assert.match(globalCss, /--map-overlay-pulse-easing:\s*cubic-bezier\(0\.37, 0, 0\.63, 1\)/);
    assert.match(globalCss, /@keyframes map-overlay-rail-pulse\s*\{[\s\S]*var\(--map-overlay-rail-width\)[\s\S]*var\(--map-overlay-rail-pulse-width\)/);
    assert.match(globalCss, /--map-pulse-offset/);
    assert.match(interactiveMapSource, /SYNCHRONIZED_OVERLAY_PULSE_NAMES = new Set\(\[\s*"aura-pulse",\s*"map-overlay-rail-pulse",\s*"station-selected-pulse",\s*\]\)/);
    assert.match(interactiveMapSource, /root\.getAnimations\(\{ subtree: true \}\)/);
    assert.match(interactiveMapSource, /document\.timeline\?\.currentTime/);
    assert.match(interactiveMapSource, /--map-pulse-offset", "0ms"/);
    assert.match(interactiveMapSource, /animation\.currentTime = pulsePhaseMs/);
    assert.match(interactiveMapSource, /animation\.startTime = pulseCycleStartMs/);
    assert.match(interactiveMapSource, /requestAnimationFrame\(\(\) => synchronizeMapPulses\(root\)\)/);
    // Both maps run the same pulse clock.
    assert.match(interactiveMapSource, /useMapPulseSync\(mapRootRef, \{ paused: mapEffectMotionPaused/);
    assert.match(interactiveRegionalMapSource, /useMapPulseSync\(viewportRef, \{\s*paused: overlayMotionPaused/);
    assert.match(interactiveMapSource, /signature: `\$\{loadState\}::\$\{pulseSyncSignature\}`/);
    assert.doesNotMatch(globalCss, /\.asset-alert-path\.(?:delay-candy|suspension-candy|delay-static-base)\s*\{[^}]*map-overlay-rail-pulse/s);
    assert.doesNotMatch(globalCss, /@keyframes mask-size-pulse/);
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
    const laneStart = ttcGlyphLanesSource.indexOf("function SuspensionGlyphLane(");
    const laneEnd = ttcGlyphLanesSource.indexOf("function SuspensionNoEntryGlyph(", laneStart);
    const laneBlock = ttcGlyphLanesSource.slice(laneStart, laneEnd);

    assert.ok(laneStart > -1, "SuspensionGlyphLane must exist");
    assert.ok(laneEnd > laneStart, "SuspensionGlyphLane block should end before the no-entry glyph helper");
    assert.match(interactiveMapSource, /SuspensionGlyphLane/);
    assert.match(ttcGlyphLanesSource, /circle cx="12" cy="12" r="10\.5"/);
    assert.match(interactiveMapSource, /stroke="#ffffff"/);
    assert.match(laneBlock, /rotateGlyph=\{\(index\) => index % 2 !== 0\}/);
    assert.match(laneBlock, /renderGlyph=\{\(index\) => index % 2 === 0 \? \(/);
    assert.match(laneBlock, /<SuspensionNoEntryGlyph \/>/);
    assert.match(laneBlock, /d="M -14 -14 L 10 0 L -14 14"/);
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
    assert.doesNotMatch(suspensionBlock, /stroke:\s*"url\(#suspension-hash\)"/);
    assert.doesNotMatch(suspensionBlock, /d="M -14 -14 L 10 0 L -14 14"/);
    assert.doesNotMatch(ttcMapRendererSource, /fixedStripePathDForPath/);
    assert.match(ttcGlyphLanesSource, /className="suspension-no-entry-lane"/);
    assert.match(ttcGlyphLanesSource, /className=\{\`suspension-no-entry-glyph/);
    assert.match(ttcGlyphLanesSource, /function SuspensionNoEntryGlyph\(\{[\s\S]*scale = 2\.2,/);
    assert.match(suspensionBlock, /step=\{88\}/);
    assert.match(ttcGlyphLanesSource, /<SuspensionNoEntryGlyph scale=\{2\.65\} \/>/);
    assert.doesNotMatch(ttcMapRendererSource, /rotate\(\$\{point\.angle\}\)/);
    assert.match(ttcGlyphLanesSource, /transform=\{`translate\(\$\{point\.x\} \$\{point\.y\}\)\$\{scaled\(unit\)\}`\}/);
    assert.match(ttcGlyphLanesSource, /circle cx="12" cy="12" r="10\.5"/);
    assert.match(ttcGlyphLanesSource, /line x1="19\.64" y1="4\.36" x2="4\.36" y2="19\.64"/);
    assert.doesNotMatch(ttcMapRendererSource, /d="M 0 -58 L 0 58"/);
    assert.match(globalCss, /\.suspension-no-entry-lane\s*\{[^}]*pointer-events:\s*none;/s);
    assert.match(globalCss, /\.suspension-no-entry-glyph\s*\{[^}]*pointer-events:\s*none;/s);
    assert.doesNotMatch(globalCss, /\.suspension-crossbar/);
    assert.doesNotMatch(globalCss, /\.suspension-through-line-rail/);
    assert.doesNotMatch(globalCss, /\.suspension-through-line-core/);
  });

  it("renders current delays above planned closures while keeping suspensions highest", () => {
    assert.ok(getImpactPriority("suspension") > getImpactPriority("delay"));
    assert.ok(getImpactPriority("delay") > getImpactPriority("planned-closure"));
    assert.ok(getImpactPriority("reduced-speed-zone") > getImpactPriority("planned-closure"));
    assert.ok(getImpactPriority("planned-closure") > getImpactPriority("clear"));

    assert.match(interactiveMapSource, /import\s*\{[^}]*getImpactPriority[^}]*\}\s*from\s*"\.\.\/app\/map-alert-selector"/);
    assert.match(overlapChooserSource, /import\s*\{[^}]*getImpactPriority[^}]*\}\s*from\s*"\.\.\/app\/map-alert-selector"/);

    assert.match(
      interactiveMapSource,
      /\.sort\(\(a, b\) => getImpactPriority\(a\.impact\.kind\) - getImpactPriority\(b\.impact\.kind\)\)/
    );

    // One shared layer draws both maps' alerts: by kind priority, grouped by line.
    assert.match(sharedOverlaySource, /export function lineAlertPaintOrder[\s\S]*?getImpactPriority\(a\.kind\) - getImpactPriority\(b\.kind\)/);
    assert.match(sharedOverlaySource, /function groupByLine[\s\S]*?lineAlertPaintOrder\(alerts\)/);
    const disruptionOverlaysStart = interactiveMapSource.indexOf('aria-label="Disruption overlays"');
    assert.ok(interactiveMapSource.indexOf("<MapLineAlertLayer", disruptionOverlaysStart) > -1, "TTC draws line alerts with the shared layer");
    assert.match(interactiveRegionalMapSource, /<g id=\{REGIONAL_DYNAMIC_SEGMENT_LAYER_ID\}>\s*<MapLineAlertLayer/);
  });

  it("renders the selected disruption emphasis above every disruption corridor", () => {
    const disruptionOverlaysStart = interactiveMapSource.indexOf('aria-label="Disruption overlays"');
    const impactLayersIndex = interactiveMapSource.indexOf("<MapLineAlertLayer", disruptionOverlaysStart);
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
    assert.match(sharedOverlaySource, /data-selected-impact-emphasis=\{alert\.impactId\}/);
    assert.match(sharedOverlaySource, /export function MapLineAlertSelection\(/);
    assert.match(interactiveMapSource, /className=\{`asset-alert-path map-selection-flash map-selection-attention pointer-events-none\$\{introComplete \? " selection-intro-complete" : ""\}`\}/);
    // While a commute is previewed, the selected alert's whole tube repaints
    // over it instead, and the main layer leaves that alert out.
    assert.match(
      sharedOverlaySource,
      /data-selected-commute-impact-overlay=\{alert\.impactId\}[\s\S]*?<MapLineAlertTube[\s\S]*?idSuffix="-commute-focus"/,
    );
    assert.match(interactiveMapSource, /commutePreviewLayer && selectedLineAlert[\s\S]*?lineAlerts\.filter/);
    assert.match(interactiveRegionalMapSource, /commutePathPreview && selection[\s\S]*?lineAlerts\.filter\(\(alert\) => !isSelectedLineAlert\(alert, selection\)\)/);
    assert.doesNotMatch(globalCss, /commute-impact-focus/);
    assert.doesNotMatch(
      globalCss,
      /\[data-selected-commute-impact-overlay\] \.asset-alert-path\.planned-preview\.selected\s*\{/,
    );
    assert.doesNotMatch(
      globalCss,
      /\[data-selected-commute-impact-overlay\] \.asset-alert-path-glow\.interactive-glow\.planned-preview\.selected/,
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

  it("keeps upcoming closure previews persistent and static", () => {
    assert.match(interactiveMapSource, /plannedClosures\.map\(\(closure\) =>/);
    assert.doesNotMatch(ttcMapRendererSource, /if \(!selectedClosure\) return \[\];/);
    assert.match(interactiveMapSource, /plannedPreviewSegmentIds/);
    assert.match(interactiveMapSource, /shouldRenderPlannedPreviewLayer\(segment, closure\)/);
    assert.match(globalCss, /\.asset-alert-path\.planned-preview\s*\{[^}]*opacity:\s*(?:0\.\d+|1(?:\.0)?);/s);
    assert.match(globalCss, /\.asset-alert-path\.planned-preview\s*\{[^}]*stroke:\s*var\(--planned-preview-rail\);[^}]*stroke-dasharray:\s*none;[^}]*stroke-width:\s*calc\(var\(--map-alert-rail-width\) \* var\(--map-overlay-unit, 1\)\);/s);
    assert.doesNotMatch(globalCss, /\.asset-alert-path\.planned-preview\s*\{[^}]*animation:/s);
    assert.match(globalCss, /\.motion-paused \.asset-alert-path\.planned-preview/);
    assert.doesNotMatch(globalCss, /\.asset-alert-path\.planned-preview\.selected\s*\{[^}]*stroke-width:\s*118;/s);
  });

  it("renders collision-aware floating badges for segments with overlapping alert types", () => {
    assert.match(interactiveMapSource, /overlapBadgeSegments/);
    assert.match(interactiveMapSource, /closure\.activeNow \|\| closure\.timingStatus === "active-now"/);
    assert.match(interactiveMapSource, /normalizeActiveClosureMapImpact/);
    assert.match(mapImpactNormalizationSource, /kind: "suspension"/);
    assert.match(interactiveMapSource, /activeClosureImpactCardIds/);
    assert.match(interactiveMapSource, /plannedPreviewImpactsForSegment\(segment, plannedClosures\)/);
    assert.match(interactiveMapSource, /groupOverlapBadgeSegments\(renderedOverlaySegments, overlapPlannedClosures\)/);
    assert.match(interactiveMapSource, /groupOverlapBadgeSegments/);
    assert.match(interactiveMapSource, /overlapBadgeSignature/);
    assert.match(interactiveMapSource, /kind: "planned-closure"/);
    assert.match(interactiveMapSource, /aria-label="Overlapping alert badges"/);
    assert.match(overlapIndicatorSource, /data-overlap-segment-id=\{markerId\}/);
    assert.match(overlapIndicatorSource, /data-overlap-kind=\{kind\}/);
    assert.match(overlapIndicatorSource, /data-overlap-kind-count=\{count\}/);
    assert.match(overlapIndicatorSource, /data-overlap-collision-avoided/);
    assert.match(overlapIndicatorSource, /ImpactTypeIcon/);
    assert.match(overlapIndicatorSource, /OverlapKindIcon/);
    assert.match(overlapIndicatorSource, /OverlapKindCountBadge/);
    assert.match(overlapIndicatorSource, /overlapBadgeKindCounts\(impacts\)/);
    assert.match(interactiveMapSource, /hasOverlappingImpacts\(impacts\)/);
    assert.match(interactiveMapSource, /overlapBadgeVisualItemCount\(overlapBadgeKindCounts\(group\.impacts\)\)/);
    assert.match(overlapIndicatorSource, /const isSingleVisualItem = totalItems === 1;/);
    assert.match(overlapIndicatorSource, /isSingleVisualItem \? \(/);
    assert.match(overlapIndicatorSource, /<circle className="overlap-indicator-pill"/);
    assert.match(overlapBadgesSource, /if \(impactKindCount === 1\)/);
    assert.match(overlapIndicatorSource, /kind=\{kind\} size=\{44\}/);
    assert.match(overlapSvgSource, /export const OVERLAP_BADGE_CIRCLE_RADIUS = 35;/);
    assert.match(overlapSvgSource, /export const OVERLAP_BADGE_ITEM_GAP = 10;/);
    assert.match(overlapSvgSource, /OVERLAP_BADGE_CIRCLE_RADIUS \* 2 \+ OVERLAP_BADGE_ITEM_GAP/);
    // Badge geometry and impact helpers have one owner, shared by both maps.
    for (const source of [overlapIndicatorSource, overlapBadgesSource, ttcMapRendererSource]) {
      assert.doesNotMatch(source, /const OVERLAP_BADGE_CIRCLE_RADIUS =/);
    }
    assert.doesNotMatch(ttcMapRendererSource, /function (getUniqueImpactKinds|overlapBadgeSignature|activeImpactsForSegment|legacyImpactsForSegment)\b/);
    assert.match(interactiveMapSource, /getUniqueImpactKinds/);
    assert.doesNotMatch(ttcMapRendererSource, /if \(impactKinds\.length <= 1\) continue;/);
    // Both maps place badges with one layout (map-overlays/overlap-badge-layout.ts).
    assert.match(interactiveMapSource, /layoutMapOverlapBadges\(\{[\s\S]*?badgeScale: 1,/);
    assert.match(regionalOverlaysSource, /layoutMapOverlapBadges\(\{[\s\S]*?badgeScale: REGIONAL_BADGE_SCALE,/);
    assert.match(badgeLayoutSource, /placeOverlapBadges\(\{/);
    assert.match(badgeLayoutSource, /siblingGap: OVERLAP_BADGE_SIBLING_CLEARANCE \* badgeScale/);
    assert.match(badgeLayoutSource, /obstacleLayers: \[artwork\.obstacles, unalertedLines\(artwork, corridors\), alertObstacles\]/);
    // Artwork obstacles are prepared from the authored SVG, not measured.
    assert.match(interactiveMapSource, /const TTC_ARTWORK_OBSTACLES = ttcArtworkObstacles\(TTC_GEOMETRY\)/);
    assert.match(interactiveMapSource, /collectBaseRouteObstacles/);
    assert.match(interactiveMapSource, /#non-linear-guides-layer \{[\s\S]*?display: inline !important;[\s\S]*?visibility: hidden;/);
    assert.match(interactiveMapSource, /pathMidpointFrame/);
    assert.match(interactiveMapSource, /const frame = pathMidpointFrame\(segment\.pathD\)/);
    assert.match(overlapSvgSource, /export const OVERLAP_INDICATOR_SCALE = 1\.5;/);
    assert.match(overlapBadgesSource, /width: OVERLAP_BADGE_PILL_THICKNESS \* OVERLAP_INDICATOR_SCALE,/);
    assert.match(overlapBadgesSource, /\(totalItems - 1\) \* OVERLAP_BADGE_ITEM_SPACING \+ OVERLAP_BADGE_PILL_THICKNESS/);
    assert.match(overlapBadgesSource, /height: OVERLAP_BADGE_PILL_THICKNESS \* OVERLAP_INDICATOR_SCALE/);
    assert.match(overlapIndicatorSource, /<g transform=\{`scale\(\$\{OVERLAP_INDICATOR_SCALE\}\)`\}>/);
    assert.match(ttcMapObstaclesSource, /export function ttcArtworkObstacles\(geometry: PreparedMapGeometry\)/);
    assert.match(ttcMapObstaclesSource, /mapCollisionBoxesForElementBounds/);
    assert.match(ttcMapObstaclesSource, /BASE_ROUTE_COLLISION_RADIUS/);
    assert.match(ttcMapObstaclesSource, /isLargeMapComponentBounds/);
    assert.match(ttcMapObstaclesSource, /splitLargeMapComponentBounds/);
    assert.match(ttcMapObstaclesSource, /LARGE_MAP_COMPONENT_MAX_THICKNESS/);
    assert.doesNotMatch(ttcMapRendererSource, /if \(box\.width > 1200 \|\| box\.height > 1200\) return null;/);
    assert.doesNotMatch(ttcMapRendererSource, /const OVERLAP_BADGE_POSITION_CANDIDATES/);
    assert.match(globalCss, /\.overlap-indicator-pill/);
    assert.match(globalCss, /\.overlap-indicator-badge\.suspension/);
    assert.match(globalCss, /\.overlap-indicator-badge\.planned-closure/);
    assert.match(globalCss, /\.overlap-indicator-badge\.planned-closure\s*\{[^}]*stroke:\s*#3b82f6;/s);
    assert.match(globalCss, /\.overlap-indicator-badge\.delay\s*\{[^}]*stroke:\s*#FEEC41;/s);
    assert.match(globalCss, /\.overlap-indicator-type-icon\.delay\s*\{[^}]*color:\s*#FEEC41;/s);
    assert.match(globalCss, /\.overlap-indicator-count-badge\s*\{[^}]*fill:\s*#ef4444;/s);
    assert.match(globalCss, /\.overlap-indicator-vector-label\s*\{[^}]*fill:\s*#ffffff;/s);
    assert.match(overlapIndicatorSource, /function MapBadgeVectorLabel/);
    assert.doesNotMatch(overlapIndicatorSource, /<text(?:\s|>)/);
    assert.match(overlapIndicatorSource, /const radius = 18;/);
    assert.match(overlapIndicatorSource, /const offset = 28;/);
    assert.match(overlapIndicatorSource, /key=\{`\$\{kind\}-count`\}/);
    assert.match(overlapIndicatorSource, /targetHeight=\{22\}/);
    assert.match(overlapIndicatorSource, /maxWidth=\{radius \* 2 - 8\}/);
    assert.doesNotMatch(globalCss, /\.overlap-indicator-badge\.delay\s*\{[^}]*#0ea5e9/s);
    assert.doesNotMatch(globalCss, /\.overlap-indicator-badge\.suspension,\s*\.overlap-indicator-badge\.planned-closure/);
    assert.match(globalCss, /\.overlap-indicator-badge\.reduced-speed-zone\s*\{[^}]*var\(--impact-rsz\)/s);
    assert.match(globalCss, /\.overlap-indicator-type-icon\.reduced-speed-zone\s*\{[^}]*var\(--impact-rsz\)/s);
    assert.match(interactiveMapSource, /const RSZ_IMPACT_COLOR = "#F59E0B";/);
    assert.doesNotMatch(globalCss, /\.overlap-side-rail/);
  });

  it("expands every overlap badge into an explicit in-map impact chooser", () => {
    assert.match(interactiveMapSource, /expandedOverlapBadgeId/);
    // TTC renders the shared chooser, placed by the shared hook, as GO/UP does.
    assert.match(interactiveMapSource, /<MapOverlapChooser/);
    assert.doesNotMatch(interactiveMapSource, /function OverlapChooser\(/);
    assert.match(overlapChooserSource, /data-overlap-chooser/);
    assert.match(overlapChooserSource, /data-map-wheel-scroll-region/);
    assert.match(overlapChooserSource, /data-overlap-choice-kind=\{impact\.kind\}/);
    assert.match(overlapChooserSource, /data-overlap-choice-id=\{impact\.cardId\}/);
    assert.match(overlapIndicatorSource, /aria-expanded=\{isOpen\}/);
    assert.match(overlapChooserSource, /Choose Alert/);
    assert.match(overlapChooserSource, /getSelectedImpactDetails/);
    assert.match(ttcChooserPlacementSource, /MAP_SVG_TO_CSS_SCALE/);
    // Placement behaviour is covered in map-chooser-placement.test.mjs.
    assert.match(ttcChooserPlacementSource, /placeOverlapChooser\(/);
    assert.match(interactiveMapSource, /useMapOverlapChooser\(\{/);
    assert.match(chooserHookSource, /overlapChooserScreenLayout\([\s\S]*?keepouts,/);
    assert.match(chooserHookSource, /visibleMapChooserKeepouts/);
    assert.match(chooserHookSource, /observeMapChooserKeepouts\(update\)/);
    assert.match(chooserKeepoutsSource, /mutationChangesMapChooserKeepouts/);
    assert.match(chooserKeepoutsSource, /element\.checkVisibility/);
    assert.match(chooserKeepoutsSource, /for \(let current: Element \| null = element; current; current = current\.parentElement\)/);
    assert.match(chooserKeepoutsSource, /record\.type === "attributes"/);
    assert.match(chooserKeepoutsSource, /transitionrun/);
    assert.match(chooserKeepoutsSource, /window\.visualViewport/);
    assert.match(chooserKeepoutsSource, /\[data-map-chooser-keepout\]/);
    assert.match(chooserKeepoutsSource, /\.desktop-map-control-rail/);
    assert.match(chooserKeepoutsSource, /\.desktop-map-legend/);
    assert.match(chooserKeepoutsSource, /\.mobile-status-peek/);
    assert.match(chooserKeepoutsSource, /\.mobile-legend-pill/);
    assert.match(chooserKeepoutsSource, /\.mobile-my-stations-shortcut/);
    assert.doesNotMatch(ttcMapRendererSource, /mapViewportSize\.width > OVERLAP_CHOOSER_MOBILE_BREAKPOINT/);
    assert.match(overlapChooserSource, /useFollowedChooserPortal\(\{[\s\S]*?size: chooserSize,/);
    assert.match(overlapChooserSource, /width:\s*size\.width,[\s\S]*?height:\s*size\.height/);
    assert.doesNotMatch(ttcChooserPlacementSource, /for \(let y = minimumY; y <= maximumY; y \+= step\)/);
    assert.match(interactiveMapSource, /onHoverImpact/);
    assert.match(interactiveMapSource, /element\.dataset\.mapHoverOwner = identity\.activationKey/);
    assert.match(interactiveMapSource, /setExternalImpactsHovered/);
    // Chooser and badge previews only outline; they never raise artwork.
    assert.match(interactiveMapSource, /renderMapPreviewOutline\(/);
    assert.match(interactiveMapSource, /"station-rings"/);
    assert.match(ttcChooserPlacementSource, /OVERLAP_CHOOSER_MOBILE_BREAKPOINT/);
    assert.match(ttcChooserPlacementSource, /OVERLAP_CHOOSER_MOBILE_WIDTH/);
    assert.match(globalCss, /@media \(max-width: 640px\)[\s\S]*?\.overlap-chooser-list\s*\{[^}]*grid-auto-rows:\s*max-content;/);
    assert.match(globalCss, /@media \(max-width: 640px\)[\s\S]*?\.overlap-chooser-choice\s*\{[^}]*min-height:\s*82px;/);
    assert.match(overlapChooserSource, /overlap-chooser-portal/);
    assert.match(overlapChooserSource, /function formatLocation\(/);
    assert.match(overlapChooserSource, /overlap-chooser-header-count/);
    assert.match(overlapChooserSource, /impacts\.length/);
    assert.match(overlapChooserSource, /transformOrigin:/);
    assert.match(overlapChooserSource, /surfaceRef\.current\?\.animate/);
    assert.match(interactiveMapSource, /<MapOverlapChooser[\s\S]*?key=\{expandedOverlapBadge\.segmentId\}/);
    assert.match(overlapChooserSource, /const compactMotion = viewportSize\.width <= OVERLAP_CHOOSER_MOBILE_BREAKPOINT;/);
    assert.match(overlapChooserSource, /const close = async/);
    assert.match(overlapChooserSource, /animation\?\.finished/);
    assert.match(overlapChooserSource, /details\?\.displayDirection/);
    assert.match(overlapChooserSource, /return "Planned Advisory"/);
    assert.match(overlapChooserSource, /details\?\.closureDateLabel/);
    assert.match(overlapChooserSource, /overlap-chooser-choice-date/);
    assert.match(globalCss, /\.overlap-chooser-choice-date\s*\{[^}]*color:\s*#3b82f6;[^}]*font-size:\s*12px;/s);
    assert.doesNotMatch(ttcMapRendererSource, /overlap-chooser-choice-action/);
    assert.doesNotMatch(ttcMapRendererSource, /details\?\.title \?\? labelForImpactKind/);
    assert.match(globalCss, /\.overlap-chooser-surface/);
    assert.match(globalCss, /\.overlap-chooser-surface\s*\{[^}]*border:\s*none\s*!important;[^}]*height:\s*fit-content;/s);
    assert.match(globalCss, /\.overlap-chooser-portal\s*\{[^}]*position:\s*absolute;[^}]*z-index:\s*45;[^}]*height:\s*fit-content\s*!important;/s);
    assert.match(globalCss, /\.overlap-chooser-header-count/);
    assert.match(globalCss, /\.overlap-chooser-choice\s*\{[^}]*border-left-width:\s*2px;/s);
    assert.match(globalCss, /\.overlap-chooser-choice\s*\{[^}]*border:\s*none\s*!important;/s);
    assert.match(globalCss, /\.overlap-chooser-choice\.delay\s*\{[^}]*border-left:\s*2px solid rgba\(254,\s*236,\s*65,\s*0\.85\)\s*!important;/s);
    assert.match(globalCss, /\.overlap-chooser-choice\.planned-closure\s*\{[^}]*border-left:\s*2px solid rgba\(59,\s*130,\s*246,\s*0\.85\)\s*!important;/s);
    assert.match(globalCss, /\.overlap-chooser-list\s*\{[^}]*grid-auto-rows:\s*max-content;[^}]*margin-right:\s*-6px;[^}]*padding-right:\s*6px;/s);
    assert.match(globalCss, /\.overlap-chooser-choice\.reduced-speed-zone\s*\{[^}]*rgba\(245,\s*158,\s*11,\s*0\.42\)/s);
    assert.match(globalCss, /\.motion-paused \.overlap-chooser-surface/);
    assert.match(globalCss, /@media \(max-width:\s*640px\)\s*\{[\s\S]*?\.overlap-chooser-choice-copy strong\s*\{[^}]*font-size:\s*14px;/s);
    assert.match(globalCss, /@media \(max-width:\s*640px\)\s*\{[\s\S]*?\.overlap-chooser-object\.open \.overlap-chooser-surface\s*\{[^}]*animation:\s*none;/s);
    assert.doesNotMatch(ttcMapRendererSource, /selectPrimaryImpact/);
  });

  it("owns station-impact pointer activation before the map can retarget the click", () => {
    // The shared station-alert ring (map-overlays/StationAlertOverlays.tsx).
    assert.match(
      interactiveMapSource,
      /className: `station-impact-ring[\s\S]*?onPointerDown: \(event[^)]*\) => \{[\s\S]*?setPointerCapture\(event\.pointerId\)/,
    );
    assert.match(
      interactiveMapSource,
      /className: `station-impact-ring[\s\S]*?onPointerUp: \(event[^)]*\) => \{[\s\S]*?suppressNextMapClick\?\.\(\);\s*select\(\);/,
    );
    assert.match(interactiveMapSource, /<MapStationAlertRings[\s\S]*?onSelect=\{onSelectImpact\}/);
    assert.match(interactiveMapSource, /if \(exiting \|\| event\.detail !== 0 \|\| shouldSuppressMapClick\(\)\) return;/);
  });

  it("owns segment-overlay pointer activation before the first panel opening can retarget the click", () => {
    assert.match(
      interactiveMapSource,
      /function MapLineAlertTarget[\s\S]*?onPointerDown=\{\(event\) => \{[\s\S]*?setPointerCapture\(event\.pointerId\)/,
    );
    assert.match(
      interactiveMapSource,
      /function MapLineAlertTarget[\s\S]*?onPointerUp=\{\(event\) => \{[\s\S]*?select\(\)/,
    );
    assert.match(
      interactiveMapSource,
      /function MapLineAlertTarget[\s\S]*?event\.detail !== 0 \|\| shouldSuppressMapClick\(\)/,
    );
  });

  it("keeps selected alert hover corridors continuous above map artwork", () => {
    assert.match(interactiveMapSource, /function MapLineAlertTarget/);
    assert.match(interactiveMapSource, /aria-label="Disruption overlay interaction targets"/);
    assert.match(interactiveMapSource, /<MapLineAlertTargets/);
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
    assert.match(interactiveMapSource, /ttcStationCenters\(TTC_GEOMETRY, stationVisualCenterIds\(stations\)\)/);
  });

  it("keeps alert and station selections on one smooth attention-to-breathing animation lifecycle", () => {
    assert.match(interactiveMapSource, /data-map-highlight-id=\{alert\.impactId\}/);
    assert.match(interactiveMapSource, /data-map-highlight-id=\{station\.id\}/);
    assert.match(interactiveMapSource, /className=\{`asset-alert-path map-selection-flash map-selection-attention pointer-events-none\$\{introComplete \? " selection-intro-complete" : ""\}`\}/);
    assert.match(interactiveMapSource, /className=\{`station-selection-flash map-selection-attention\$\{introComplete \? " selection-intro-complete" : ""\}`\}/);
    assert.doesNotMatch(ttcMapRendererSource, /isSelectionFastFlashing|isStationFastFlashing/);
    assert.match(globalCss, /\.map-selection-attention\s*\{[^}]*animation-name:\s*var\(--selection-intro-name\),\s*var\(--selection-breathe-name\)/s);
    assert.match(globalCss, /animation-delay:\s*0s,\s*var\(--selection-intro-duration\)/);
    assert.match(globalCss, /--selection-breathe-duration:\s*1\.2s/);
    assert.match(globalCss, /@keyframes map-selection-path-intro[\s\S]*12\.5%[\s\S]*37\.5%[\s\S]*62\.5%[\s\S]*87\.5%/);
    assert.match(globalCss, /@keyframes map-selection-station-intro[\s\S]*12\.5%[\s\S]*37\.5%[\s\S]*62\.5%[\s\S]*87\.5%/);
    assert.match(globalCss, /@keyframes map-selection-path-intro/);
    assert.match(globalCss, /@keyframes map-selection-path-breathe/);
    assert.match(globalCss, /@keyframes map-selection-station-intro/);
    assert.match(globalCss, /@keyframes map-selection-station-breathe/);
    assert.match(globalCss, /:is\(\.map-gesture-active, \[data-map-gesture-active="true"\], \[data-map-zoom-active="true"\]\) \.map-selection-attention\s*\{[^}]*animation-play-state:\s*paused !important;/s);
    assert.doesNotMatch(
      globalCss,
      /\.map-gesture-active \.asset-alert-path\.map-selection-flash[^}]*animation:\s*none/s,
    );
    // Both maps draw the selected-station marker with the same intro state.
    for (const mapSource of [interactiveMapSource, interactiveRegionalMapSource]) {
      assert.match(mapSource, /<MapStationSelection[\s\S]*?introComplete=\{selectionIntroComplete\}/);
    }
    assert.match(globalCss, /\.map-selection-attention\.selection-intro-complete\s*\{[^}]*animation-name:\s*var\(--selection-breathe-name\);/s);
    assert.match(interactiveMapSource, /aria-label="Station impact foreground highlights"/);
    assert.match(interactiveMapSource, /data-station-impact-selection-id=\{alert\.impactId\}/);
    assert.match(interactiveMapSource, /setMapImpactHovered\(root, owner \?\? impact, Boolean\(owner\)\)/);
    assert.match(interactiveMapSource, /data-station-selection-foreground=\{station\.id\}/);
    assert.match(interactiveMapSource, /station-impact-hover-priority/);
    // One selected-station marker: no hidden underlay competing with it.
    assert.doesNotMatch(ttcMapRendererSource + globalCss, /station-selected-indicator|foreground-flash-active/);
    assert.doesNotMatch(regionalAssetSource, /regional-station-selected-indicator|regional-station-selection-source/);
    const impactRingsIndex = interactiveMapSource.indexOf('aria-label="Station impact rings"');
    const foregroundHighlightsIndex = interactiveMapSource.indexOf('aria-label="Station impact foreground highlights"');
    const directionGlyphsIndex = interactiveMapSource.indexOf('aria-label="Station impact direction glyphs"');
    assert.ok(impactRingsIndex < directionGlyphsIndex);
    assert.ok(directionGlyphsIndex < foregroundHighlightsIndex);
  });

  it("softens desktop map selection highlights when motion is reduced", () => {
    assert.match(
      globalCss,
      /@media \(min-width:\s*768px\) \{[\s\S]*?\.motion-paused \.asset-alert-path\.map-selection-flash[\s\S]*?opacity:\s*0\.55;/,
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
    assert.match(interactiveMapSource, /aria-label="Commute route preview"/);
    assert.match(interactiveMapSource, /<MapCommutePreviewRoute preview=\{commutePreview\} \/>/);
    assert.match(interactiveMapSource, /data-commute-path-preview/);
    assert.match(interactiveMapSource, /className="asset-alert-path-glow commute-path-preview-glow"/);
    assert.match(interactiveMapSource, /className="asset-alert-path commute-path-preview-path"/);
    assert.match(globalCss, /\.commute-path-preview-path/);
    assert.match(globalCss, /\.commute-path-preview-chip/);
    assert.match(
      globalCss,
      /\n\.commute-path-preview-path\s*\{(?=[^}]*--map-overlay-rail-width:\s*calc\(102px \* var\(--map-overlay-unit, 1\)\);)(?=[^}]*opacity:\s*0\.72;)(?=[^}]*animation:\s*map-overlay-rail-pulse var\(--map-overlay-pulse-half-cycle\) infinite alternate var\(--map-overlay-pulse-easing\);)[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\n\.commute-path-preview-glow\s*\{(?=[^}]*stroke-width:\s*calc\(155px \* var\(--map-overlay-unit, 1\)\);)(?=[^}]*animation:\s*aura-pulse var\(--map-overlay-pulse-half-cycle\) infinite alternate var\(--map-overlay-pulse-easing\);)[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.station-commute-green-flash\s*\{(?=[^}]*animation:\s*station-commute-green-flash-anim 1\.2s infinite alternate ease-in-out;)(?=[^}]*animation-delay:\s*var\(--map-pulse-offset\);)[^}]*\}/s,
    );
    assert.match(
      globalCss,
      /\.motion-paused \.commute-path-preview-path\s*\{[^}]*animation:\s*none\s*!important;[^}]*stroke-width:\s*var\(--map-overlay-rail-width\)[^}]*opacity:\s*0\.72 !important;/s,
    );
    assert.match(
      globalCss,
      /@media \(prefers-reduced-motion:\s*reduce\) \{[\s\S]*?\.commute-path-preview-path\s*\{[^}]*animation:\s*none\s*!important;[^}]*stroke-width:\s*var\(--map-overlay-rail-width\)[^}]*opacity:\s*0\.72 !important;/,
    );
    assert.match(
      globalCss,
      /@media \(prefers-reduced-motion:\s*reduce\) \{[\s\S]*?\.station-commute-green-flash[\s\S]*?animation:\s*none\s*!important;/,
    );
    assert.match(
      globalCss,
      /@media \(max-width:\s*767px\) \{[\s\S]*?\.station-commute-green-flash\s*\{(?=[^}]*fill:\s*#4ade80\s*!important;)(?=[^}]*stroke-width:\s*calc\(3\.5px \* var\(--map-overlay-unit, 1\)\)\s*!important;)(?=[^}]*transform:\s*scale\(1\.4\);)[^}]*\}/,
    );

    const impactLayerIndex = interactiveMapSource.indexOf("retainedImpactLayers.map");
    const previewGroupIndex = interactiveMapSource.indexOf('aria-label="Commute route preview"', impactLayerIndex);
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

  it("renders derivative-map attribution as a quiet manually positioned viewport overlay", () => {
    const attributionBlock = cssBlockFor(".map-attribution-notice");
    const desktopFontSize = attributionBlock.match(/font-size:\s*(\d+)px;/);

    assert.match(interactiveMapSource, /aria-label="TTC derivative map attribution"/);
    assert.match(interactiveMapSource, /Inkscape re-creation based on TTC map · Not to scale/);
    assert.match(interactiveRegionalMapSource, /aria-label="Metrolinx derivative map attribution"/);
    assert.match(interactiveRegionalMapSource, /Inkscape re-creation based on Metrolinx map · Not to scale/);
    assert.match(interactiveMapSource, /map-attribution-notice/);
    assert.match(attributionBlock, /position:\s*absolute;/);
    assert.match(attributionBlock, /right:\s*(?!;)[^;]+;/);
    assert.match(attributionBlock, /bottom:\s*(?!;)[^;]+;/);
    assert.match(attributionBlock, /border:\s*none;/);
    assert.match(attributionBlock, /text-wrap:\s*nowrap;/);
    assert.ok(desktopFontSize, "desktop map attribution should declare a pixel font size");
    assert.ok(Number(desktopFontSize[1]) >= 13, "desktop map attribution should stay larger than the old small caption");
    assert.doesNotMatch(globalCss, /\.dark \.map-attribution-notice\s*\{[^}]*border-color:/s);
    assert.doesNotMatch(globalCss, /\.linewatch-shell\.high-contrast \.map-attribution-notice\s*\{[^}]*border-color:/s);
    assert.match(globalCss, /@media \(max-width:\s*767px\)\s*\{\s*\.map-attribution-notice\s*\{\s*display:\s*none;/);
    assert.match(globalCss, /\.linewatch-shell\.high-contrast \.map-attribution-notice/);
  });

  it("renders Spadina as one station control over both its dots", () => {
    // The manifest's part suffixes fold station-spadina-1 and -2 into one station.
    assert.match(interactiveMapSource, /mapStationArtwork\(TTC_GEOMETRY, TTC_MANIFEST\.stationPartSuffixes\)/);
    assert.match(interactiveMapSource, /data-station-id=\{station\.id\}/);
    assert.match(interactiveMapSource, /data-station-anchor-id=\{mapStationShapeAnchorId\(shape\) \?\? undefined\}/);
    assert.match(interactiveMapSource, /data-station-hover-id=\{station\.id\}/);
    assert.match(interactiveMapSource, /role="button"\s*tabIndex=\{0\}/);
    assert.match(interactiveMapSource, /event\.pointerType === "mouse"/);
    assert.doesNotMatch(ttcMapRendererSource, /data-station-hover-capsule-id|data-station-primary-target/);
  });

  it("keeps estimated train markers opt-in and suppresses them while the selected rail network is closed", () => {
    const shellSource = readShellSource();
    const moreSheetSource = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");
    const visualPreferencesSource = readFileSync(new URL("../src/app/visual-preferences.ts", import.meta.url), "utf8");

    assert.match(visualPreferencesSource, /linewatch-estimated-trains-enabled-v1/);
    assert.match(shellSource, /readVisualPreferencesFromStorage/);
    assert.match(shellSource, /getEstimatedTrainMarkers/);
    assert.match(shellSource, /estimatedTrainMarkerRefreshMs/);
    assert.match(shellSource, /const trainNetworkOpen = selectedNetwork === "ttc"/);
    assert.match(shellSource, /const estimatedTrainMarkersVisible = estimatedTrainsEnabled && trainNetworkOpen && !viewingSnapshot;/);
    assert.match(shellSource, /viewingSnapshot: Boolean\(displayData\.snapshot\)/);
    assert.match(shellSource, /let trainMarkerRefreshInFlight = false;/);
    assert.match(shellSource, /if \(trainMarkerRefreshInFlight\) \{\s*return;\s*\}/);
    assert.match(shellSource, /trainMarkerRefreshInFlight = true;/);
    assert.match(shellSource, /trainMarkerRefreshInFlight = false;/);
    assert.match(shellSource, /if \(!estimatedTrainMarkersVisible \|\| document\.visibilityState !== "visible"\)/);
    assert.match(shellSource, /document\.addEventListener\("visibilitychange", refreshAfterResume\)/);
    assert.match(shellSource, /window\.addEventListener\("online", refreshAfterResume\)/);
    assert.match(shellSource, /estimatedTrainRequestState === "reconnecting"/);
    assert.match(shellSource, /mobile-train-pending-spinner/);
    assert.match(shellSource, /estimatedTrainsEnabled=\{estimatedTrainMarkersVisible\}/);
    assert.match(shellSource, /estimatedTrainMarkers=\{estimatedTrainMarkersVisible \? estimatedTrainSnapshot\.markers : \[\]\}/);
    assert.match(shellSource, /Live Train Markers/);
    assert.match(moreSheetSource, /Live Train Markers/);
    assert.doesNotMatch(shellSource, /Live Train Locations/);
    assert.doesNotMatch(moreSheetSource, /Live Train Locations/);
  });

  it("renders estimated train markers above station dots with directional high-contrast styling", () => {
    assert.match(interactiveMapSource, /aria-label="Estimated train markers"/);
    assert.match(ttcTrainMarkerLayerSource, /function EstimatedTrainMarkerLayer/);
    assert.match(ttcTrainMarkerLayerSource, /visualTravelDirection\(\{ \.\.\.segment, travelDirection: marker\.travelDirection \}\)/);
    assert.match(ttcTrainMarkerLayerSource, /pathFrameAtProgress/);
    assert.match(ttcTrainMarkerLayerSource, /estimatedTrainMarkerRenderKey\(marker\)/);
    assert.match(ttcTrainMarkerLayerSource, /data-train-marker-line-id=\{marker\.lineId\}/);
    assert.match(ttcTrainMarkerLayerSource, /data-train-marker-direction=\{marker\.direction\}/);
    assert.match(ttcTrainMarkerLayerSource, /estimated-train-marker-arrow/);
    assert.match(globalCss, /\.estimated-train-marker-core/);
    assert.match(globalCss, /\.estimated-train-marker-arrow/);
    assert.match(globalCss, /\.estimated-train-marker\s*\{[^}]*will-change:\s*transform;/s);
    // Markers stay at full strength while a station, alert, or commute is shown.
    assert.doesNotMatch(globalCss, /\.estimated-train-marker-layer\[data-muted/);
    assert.doesNotMatch(ttcMapRendererSource, /EstimatedTrainMarkerLayer[^>]*muted=/);
    assert.match(globalCss, /\.estimated-train-marker-layer\s*\{[^}]*pointer-events:\s*none\s*!important;/s);
    assert.match(globalCss, /\.estimated-train-marker-layer \*,[\s\S]*?\.estimated-train-marker\s*\{[^}]*pointer-events:\s*none\s*!important;/s);
    assert.match(ttcTrainMarkerLayerSource, /data-train-marker-travel-direction=\{visualDirection\}[\s\S]*?pointerEvents="none"/);
    assert.match(ttcTrainMarkerLayerSource, /pathMetricCache/);
    assert.match(interactiveMapSource, /animate=\{!mapEffectMotionPaused\}/);
    assert.match(interactiveMapSource, /mapEffectMotionPaused = reducedMotion \|\| !pageVisible/);
    assert.match(ttcTrainMarkerLayerSource, /scheduleEstimatedTrainMarkerAnimation\(update\)/);
    assert.doesNotMatch(ttcMapRendererSource, /estimatedTrainMarkerFrameIntervalMs|MOBILE_TRAIN_MARKER_FRAME_INTERVAL_MS/);
    assert.doesNotMatch(ttcMapRendererSource, /runtime\.animationFrame = window\.requestAnimationFrame\(update\)/);
    assert.doesNotMatch(ttcMapRendererSource, /estimated-train-marker-mobile-dot/);
    assert.match(ttcTrainMarkerLayerSource, /<TrainMarkerGlyph \/>/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-performance-mode \.estimated-train-marker-shadow\s*\{[^}]*display:\s*none;/s);
    assert.match(globalCss, /\.linewatch-shell\.mobile-performance-mode \.estimated-train-marker-outline\s*\{[^}]*stroke:\s*#090d16;[^}]*stroke-width:\s*7\.5;/s);
    assert.match(globalCss, /\.linewatch-shell\.mobile-performance-mode \.estimated-train-marker-core\s*\{[^}]*stroke:\s*#ffffff;[^}]*stroke-width:\s*4;/s);
    assert.doesNotMatch(globalCss, /\.linewatch-shell\.mobile-performance-mode \.estimated-train-marker-(?:arrow|window)\s*\{/);

    const overlayIndex = interactiveMapSource.indexOf('aria-label="Disruption overlays"');
    const trainIndex = interactiveMapSource.indexOf('aria-label="Estimated train markers"');
    const authoredLineBadgeIndex = interactiveMapSource.indexOf("svgParts?.badges");
    const stationLayerIndex = interactiveMapSource.indexOf("{/* Top Layer: custom-map station labels, dots, and connections */}");
    const badgeIndex = interactiveMapSource.indexOf('aria-label="Overlapping alert badges"');

    assert.ok(authoredLineBadgeIndex > -1 && authoredLineBadgeIndex < overlayIndex);
    assert.ok(overlayIndex > -1);
    assert.ok(stationLayerIndex > overlayIndex);
    assert.ok(trainIndex > stationLayerIndex);
    assert.ok(badgeIndex > trainIndex);

    const regionalTopPlaneIndex = interactiveRegionalMapSource.indexOf('className="raster-map-top-plane');
    const regionalTrainIndex = interactiveRegionalMapSource.indexOf('id={REGIONAL_TRAIN_MARKER_LAYER_ID}');
    assert.ok(regionalTopPlaneIndex > -1);
    assert.ok(regionalTrainIndex > regionalTopPlaneIndex);
  });
});
