import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const inspectorSource = readFileSync(new URL("../src/components/MobileImpactInspector.tsx", import.meta.url), "utf8");
const overlapRefsSource = readFileSync(new URL("../src/components/ImpactOverlapRefs.tsx", import.meta.url), "utf8");
const selectedCardScrollSource = readFileSync(new URL("../src/hooks/useScrollSelectedImpactCard.ts", import.meta.url), "utf8");
const mapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const globalCss = readAppStylesheet();

describe("mobile Show on Map inspector", () => {
  it("adds explicit mobile inspector state in the shell", () => {
    assert.match(shellSource, /MobileImpactInspector,\s*type MobileInspectorDetent/);
    assert.match(inspectorSource, /export type MobileInspectorDetent = "map-focus" \| "details-focus"/);
    assert.match(shellSource, /mobileInspectorDetent/);
    assert.match(shellSource, /setMobileInspectorDetent\("map-focus"\)/);
    assert.match(shellSource, /setMobileInspectorDetent\("details-focus"\)/);
    assert.match(shellSource, /mobileImpactInspectorOpen/);
    assert.match(shellSource, /mobileStationInspectorOpen/);
    assert.match(shellSource, /mobileInspectorOpen/);
    assert.match(shellSource, /mobile-map-inspector/);
    assert.match(shellSource, /mobile-map-inspector-impact/);
    assert.match(shellSource, /mobile-map-inspector-station/);
  });

  it("renders the selected impact in a mobile-only inspector instead of a tiny peek", () => {
    assert.match(shellSource, /MobileImpactInspector/);
    assert.match(shellSource, /onViewFullDetails=\{\(\) => navigateForward\(viewForImpactSelection\(selection\)\)\}/);
    assert.match(shellSource, /returningToSelectedMap = targetView === "map" && Boolean\(selectionRef\.current\)/);
    assert.match(inspectorSource, /data-mobile-impact-inspector/);
    assert.match(inspectorSource, /aria-label="Selected map impact details"/);
    assert.match(inspectorSource, /getSelectedImpactDetails/);
    assert.match(inspectorSource, /View in List/);
    assert.doesNotMatch(inspectorSource, /View Full Details/);
    assert.match(inspectorSource, /Show more details/);
    assert.match(inspectorSource, /Show more map/);
    assert.match(inspectorSource, /Overlap:/);
    assert.match(inspectorSource, /MetadataGrid/);
    assert.match(inspectorSource, /ImpactRouteHeader/);
  });

  it("shows one white icon-and-type heading for every selected impact", () => {
    assert.match(inspectorSource, /<h2 className="mobile-impact-inspector-title">/);
    assert.match(inspectorSource, /\{details\.icon\}/);
    assert.match(inspectorSource, /\{details\.categoryLabel\}/);
    assert.doesNotMatch(inspectorSource, /\{details\.title\}/);
    assert.match(globalCss, /\.mobile-impact-inspector-title\s*\{[^}]*color:\s*var\(--text\)/s);
  });

  it("keeps the selected route evenly spaced without an upper divider", () => {
    assert.doesNotMatch(globalCss, /\.mobile-impact-inspector-header\s*\{[^}]*border-bottom:/s);
    assert.doesNotMatch(globalCss, /\.mobile-impact-inspector-header\s*\{[^}]*padding-bottom:/s);
    assert.match(globalCss, /\.mobile-impact-inspector\s+\.impact-route\s*\{[^}]*margin-block:\s*0/s);
    assert.match(globalCss, /\.mobile-impact-inspector\s*\{[^}]*gap:\s*10px/s);
    assert.match(globalCss, /\.mobile-impact-inspector-scroll\s*\{[^}]*gap:\s*10px/s);
  });

  it("title-cases closure windows and shares compact mobile overlap layout with submenus", () => {
    assert.match(globalCss, /\.mobile-impact-inspector-window\s*\{[^}]*text-transform:\s*capitalize/s);
    assert.match(overlapRefsSource, /className="impact-overlap-refs/);
    assert.match(overlapRefsSource, /className="impact-overlap-ref-list/);
    assert.match(globalCss, /\n  \.impact-overlap-refs\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*max-content minmax\(0, 1fr\);[^}]*margin-left:\s*0;[^}]*margin-right:\s*0;[^}]*margin-inline:\s*0;[^}]*max-width:\s*100%;[^}]*width:\s*100%/s);
    assert.match(globalCss, /\n  \.impact-overlap-ref-list\s*\{[^}]*flex:\s*1 1 0;[^}]*min-width:\s*0/s);
    assert.match(globalCss, /\n  \.overlap-impact-ref\s*\{[^}]*font-size:\s*10px;[^}]*gap:\s*3px;[^}]*padding:\s*3px 4px/s);
    assert.doesNotMatch(globalCss, /\.impact-overlap-ref-list\s*\{[^}]*display:\s*contents/s);
  });

  it("keeps the lower metadata block out of the map-focused detent", () => {
    assert.match(inspectorSource, /const showDetailedMetadata = expanded/);
    assert.match(inspectorSource, /\{showDetailedMetadata \? \(\s*<MetadataGrid/);
    assert.match(inspectorSource, /cause=\{details\.cause\}/);
    assert.match(inspectorSource, /resolution=\{details\.resolution\}/);
    assert.match(inspectorSource, /targetRemoval=\{details\.targetRemoval\}/);
  });

  it("reuses the directional resolution breakdown for grouped reduced speed zones", () => {
    assert.match(inspectorSource, /ReducedSpeedZoneResolutionBreakdown/);
    assert.match(inspectorSource, /isGroupedZone \? null : zone\.resolution/);
  });

  it("gives extended directional timing fields the full mobile metadata width", () => {
    assert.match(globalCss, /\.alert-card,\s*\.mobile-impact-inspector\s*\{[^}]*container:\s*impact-details \/ inline-size/s);
    assert.match(globalCss, /@container impact-details \(max-width: 34rem\)[\s\S]*\.impact-metadata-grid > \.has-directional-timing\s*\{[^}]*grid-column:\s*1 \/ -1/s);
  });

  it("scrolls the selected card within its list without moving the mobile sheet header", () => {
    assert.match(selectedCardScrollSource, /closest<HTMLElement>\("\.alert-stack, \.closure-stack"\)/);
    assert.match(selectedCardScrollSource, /list\.scrollTo\(/);
    assert.doesNotMatch(selectedCardScrollSource, /scrollIntoView\(/);
  });

  it("sizes the map-focused inspector to its rendered content", () => {
    assert.match(inspectorSource, /ResizeObserver/);
    assert.match(inspectorSource, /closest\("[^"]*linewatch-shell[^"]*"\)/);
    assert.match(inspectorSource, /--mobile-impact-inspector-total-height/);
    assert.match(inspectorSource, /getBoundingClientRect\(\)\.height/);
    assert.match(inspectorSource, /removeProperty\(heightProperty\)/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-inspector-impact\.mobile-map-inspector-map-focus \{/);
    assert.match(globalCss, /--mobile-inspector-total-height: var\(--mobile-impact-inspector-total-height/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-inspector-impact\.mobile-map-inspector-map-focus \.mobile-impact-inspector \{/);
    assert.match(globalCss, /height: auto;/);
  });

  it("also sizes the expanded details detent to its rendered content", () => {
    assert.doesNotMatch(inspectorSource, /detent !== "map-focus"/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-inspector-impact\.mobile-map-inspector-details-focus \{/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-inspector-impact\.mobile-map-inspector-details-focus \{[\s\S]*--mobile-inspector-total-height: var\(--mobile-impact-inspector-total-height/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-inspector-impact:is\(\.mobile-map-inspector-map-focus, \.mobile-map-inspector-details-focus\) \.mobile-impact-inspector \{/);
  });

  it("resizes the actual mobile map viewport while preserving focused selection", () => {
    assert.match(shellSource, /mapLayoutSignal/);
    assert.match(shellSource, /layoutResetSignal=\{mapLayoutSignal\}/);
    assert.match(mapSource, /lastFocusLayoutKeyRef/);
    assert.match(mapSource, /layoutResetSignal \?\? 0/);
    assert.match(mapSource, /lastFocusLayoutKeyRef\.current === currentLayoutKey/);
    assert.match(mapSource, /focusTargetKey/);
  });

  it("routes an impact deep link through the details-first mobile map inspector", () => {
    const deepLinkHandling = shellSource.slice(
      shellSource.indexOf("const impactKind = params.get"),
      shellSource.indexOf("if (shouldReplaceUrl)"),
    );

    assert.match(deepLinkHandling, /const impactSelection = impactKind && impactId/);
    assert.match(deepLinkHandling, /if \(impactSelection\) \{/);
    assert.match(deepLinkHandling, /setSelection\(impactSelection\)/);
    assert.match(deepLinkHandling, /setMobileInspectorDetent\("details-focus"\)/);
    assert.match(deepLinkHandling, /setActiveView\("map"\)/);
    assert.match(deepLinkHandling, /else if \(panel && panelToView\[panel\]\)/);
  });

  it("opens selected map impacts with details shown and lets the user request more map", () => {
    const mapSelectionHandling = shellSource.slice(
      shellSource.indexOf("const handleMapSelectImpact"),
      shellSource.indexOf("const handleMapSelectOverlap"),
    );

    assert.match(mapSelectionHandling, /setMobileInspectorDetent\("details-focus"\)/);
    assert.match(inspectorSource, /const expanded = detent === "details-focus"/);
    assert.match(inspectorSource, /expanded \? "More Map" : "More Details"/);
  });

  it("defines mobile split-view CSS for impact and station inspectors", () => {
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-inspector/);
    assert.match(globalCss, /--mobile-inspector-height/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-inspector > main/);
    assert.match(globalCss, /\.mobile-impact-inspector/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-inspector-station \.station-detail-panel/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-inspector \.mobile-bottom-nav/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-inspector \.mobile-status-peek/);
    assert.match(globalCss, /\.linewatch-shell\.mobile-map-inspector \.mobile-legend-pill/);
  });

  it("animates inspector entry, content swaps, and metadata expansion with motion safety", () => {
    assert.match(globalCss, /\.mobile-impact-inspector\s*\{[^}]*animation:\s*mobile-impact-inspector-enter/s);
    assert.match(globalCss, /@keyframes mobile-impact-inspector-enter/);
    assert.match(globalCss, /\.mobile-impact-inspector-scroll\s*\{[^}]*animation:\s*mobile-impact-inspector-content-in/s);
    assert.match(globalCss, /@keyframes mobile-impact-inspector-content-in/);
    assert.match(globalCss, /\.mobile-impact-inspector-metadata\s*\{[^}]*animation:\s*mobile-impact-inspector-meta-enter/s);
    assert.match(globalCss, /@keyframes mobile-impact-inspector-meta-enter/);
    assert.match(inspectorSource, /key=\{selectedDetailKey\}/);
    assert.match(globalCss, /\.motion-paused \.mobile-impact-inspector/);
    assert.match(globalCss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.mobile-impact-inspector/);
  });
});
