import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DEFAULT_NETWORK_ID,
  REGIONAL_JUNCTION_ANCHORS,
  REGIONAL_ROUTE_CARDINAL_DIRECTIONS,
  REGIONAL_ROUTE_STATIONS,
  regionalDashboardData,
  regionalDashboardDataForScenario,
  regionalStationSummaries,
} from "../src/app/regional-data.ts";
import { defaultVisualPreferences } from "../src/app/visual-preferences.ts";

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const networkSelectorSource = readFileSync(new URL("../src/components/NetworkSelector.tsx", import.meta.url), "utf8");
const defaultMapModeSource = readFileSync(new URL("../src/components/DefaultMapModeControl.tsx", import.meta.url), "utf8");
const mobileMoreSource = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");
const mobileLegendSource = readFileSync(new URL("../src/components/MobileLegend.tsx", import.meta.url), "utf8");
const networkMapSource = readFileSync(new URL("../src/components/NetworkMap.tsx", import.meta.url), "utf8");
const networkMapLegendsSource = readFileSync(new URL("../src/components/NetworkMapLegends.tsx", import.meta.url), "utf8");
const regionalMapSource = readFileSync(new URL("../src/components/InteractiveRegionalMap.tsx", import.meta.url), "utf8");
const regionalStationDetailSource = readFileSync(new URL("../src/components/RegionalStationDetailPanel.tsx", import.meta.url), "utf8");
const panZoomSource = readFileSync(new URL("../src/hooks/usePanZoom.ts", import.meta.url), "utf8");
const regionalSvg = readFileSync(new URL("../public/assets/linewatch/regional-rail-map.svg", import.meta.url), "utf8");
const globalsCss = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

describe("network-scoped regional dashboard", () => {
  it("keeps TTC as the default and dispatches to separate map implementations", () => {
    assert.equal(DEFAULT_NETWORK_ID, "ttc");
    assert.equal(defaultVisualPreferences.defaultNetwork, DEFAULT_NETWORK_ID);
    assert.match(shellSource, /useState<NetworkId>\(initialVisualPreferences\.defaultNetwork\)/);
    assert.match(networkMapSource, /<InteractiveRegionalMap/);
    assert.match(networkMapSource, /<InteractiveTtcMap/);
  });

  it("lets riders persist a default map below My Stations on desktop and mobile", () => {
    assert.match(defaultMapModeSource, /Default Map/);
    assert.match(defaultMapModeSource, /TTC/);
    assert.match(defaultMapModeSource, /GO &amp; UP/);
    assert.match(defaultMapModeSource, /className="default-map-mode-glider"/);
    assert.match(globalsCss, /\.default-map-mode-glider/);
    assert.match(
      globalsCss,
      /\.default-map-mode-options\[data-network="regional"\] \.default-map-mode-glider\s*\{[^}]*transform:\s*translateX\(100%\)/s,
    );
    assert.match(shellSource, /<DefaultMapModeControl/);
    assert.ok(shellSource.indexOf("My Stations") < shellSource.indexOf("<DefaultMapModeControl"));
    assert.match(mobileMoreSource, /<DefaultMapModeControl/);
    assert.ok(mobileMoreSource.indexOf("My Stations") < mobileMoreSource.indexOf("<DefaultMapModeControl"));
    assert.match(shellSource, /defaultNetwork:\s*defaultNetworkPreference/);
    const preferenceChangeBody = shellSource.match(
      /const handleDefaultNetworkChange = \(network: NetworkId\) => \{([\s\S]*?)\n  \};/,
    )?.[1] ?? "";
    assert.match(preferenceChangeBody, /setDefaultNetworkPreference\(network\)/);
    assert.doesNotMatch(preferenceChangeBody, /handleNetworkChange|setSelectedNetwork|setActiveView/);
  });

  it("keeps only the selected interactive map mounted in steady state", () => {
    assert.match(networkSelectorSource, /className="network-selector-glider"/);
    assert.match(globalsCss, /\.network-selector-glider/);
    assert.match(globalsCss, /\.network-accent-ridges/);
    assert.match(networkMapSource, /\{regionalSelected \? \([\s\S]*<InteractiveRegionalMap[\s\S]*\) : \([\s\S]*<InteractiveTtcMap/);
    assert.doesNotMatch(networkMapSource, /DataProvider|network-map-slide|settledNetwork/);
    assert.doesNotMatch(networkMapSource, /aria-hidden|inert=/);
    assert.doesNotMatch(shellSource, /ttcData=\{ttcData\}|regionalData=\{regionalDashboardData\}/);
  });

  it("reuses a compact vertical network selector below the mobile site guide", () => {
    assert.match(shellSource, /className="site-guide-network-stack"[\s\S]*<SiteGuideDropdown[\s\S]*className="mobile-network-selector-slot"[\s\S]*<NetworkSelector[\s\S]*compactVertical/);
    assert.match(networkSelectorSource, /compactVertical = false/);
    assert.match(networkSelectorSource, /network-selector--compact-vertical/);
    assert.match(globalsCss, /\.network-selector--compact-vertical\s*\{[\s\S]*flex-direction:\s*column/);
    assert.match(globalsCss, /\.network-selector--compact-vertical\[data-network="regional"\] \.network-selector-glider\s*\{[\s\S]*translateY/);
    assert.match(globalsCss, /\.site-guide-network-stack\s*\{[\s\S]*width:\s*var\(--mobile-top-action-button-size\)/);
    assert.match(globalsCss, /\.network-selector--compact-vertical \.network-indicator-dot\s*\{[\s\S]*display:\s*none/);
    assert.match(globalsCss, /--compact-network-option-height:\s*32px[\s\S]*--compact-network-glider-height:\s*32px/);
    assert.match(globalsCss, /\.network-selector--compact-vertical \.network-selector-glider\s*\{[\s\S]*height:\s*var\(--compact-network-glider-height\)/);
    assert.match(globalsCss, /\.network-selector--compact-vertical \.network-accent-ridges\s*\{[\s\S]*to bottom[\s\S]*transparent 1px 2px[\s\S]*height:\s*3px/);
  });

  it("keeps unselected regional station indicators dormant in mobile performance modes", () => {
    assert.match(
      globalsCss,
      /\.linewatch-shell \.regional-station-selected-indicator:not\(\[data-regional-station-selected="true"\]\)\s*\{[\s\S]*opacity:\s*0\s*!important/,
    );
    assert.match(regionalMapSource, /dataset\.regionalStationSelectionId = stationId/);
    assert.match(regionalMapSource, /setAttribute\("data-regional-station-selected", "true"\)/);
  });

  it("renders one legend for the selected map scene", () => {
    assert.match(networkMapSource, /<NetworkMapLegend[\s\S]*mode=\{network\}/);
    assert.match(networkMapSource, /closingSoon=\{mobileAnnouncementVisible\}/);
    assert.match(networkMapLegendsSource, /<LineLegend[\s\S]*mode=\{mode\}/);
    assert.match(networkMapLegendsSource, /<MobileLegend[\s\S]*mode=\{mode\}/);
    assert.doesNotMatch(networkMapLegendsSource, /hidden=/);
  });

  it("offsets the regional mobile legend below closing-soon and closed notices", () => {
    assert.match(
      shellSource,
      /mobileAnnouncementVisible=\{selectedNetwork === "ttc"[\s\S]*regionalRailOperatingState\.closingSoon[\s\S]*regionalRailOperatingState\.status === "closed" && closedMapPeek/,
    );
    assert.match(globalsCss, /\.subway-closing-soon-chip,[\s\S]*\.go-up-closed-peek-chip\s*\{[\s\S]*overflow:\s*hidden\s*!important/);
    assert.match(globalsCss, /\.subway-closed-peek-text\s*\{[\s\S]*overflow:\s*hidden\s*!important/);
    assert.match(mobileLegendSource, /mobile-legend-pill--regional/);
    assert.match(mobileLegendSource, /expanded \? "gap-2" : "w-full justify-center gap-0"/);
    assert.match(mobileLegendSource, /"w-0 opacity-0 -translate-x-2 pointer-events-none"/);
    assert.match(mobileLegendSource, /size=\{20\}/);
    assert.match(mobileLegendSource, /isRegional[\s\S]*?\?\s*"w-\[40px\]"/);
    assert.doesNotMatch(mobileLegendSource, /compactText/);
    assert.match(
      globalsCss,
      /\.mobile-legend-pill--regional\.mobile-legend-pill--announcement\s*\{[\s\S]*var\(--mobile-regional-announcement-chip-height\)/,
    );
  });

  it("shows the rotate-map action in regional mobile mode and preserves complete notice copy", () => {
    assert.doesNotMatch(
      shellSource,
      /selectedNetwork === "ttc"\s*\?\s*<button\s*[\s\S]{0,300}className="rotate-map-btn/,
    );
    assert.match(shellSource, /<button[\s\S]{0,400}className="rotate-map-btn/);
    assert.match(
      globalsCss,
      /\.go-up-closed-peek-chip \.subway-closed-peek-subtitle\s*\{[\s\S]*white-space:\s*normal\s*!important/,
    );
    assert.match(globalsCss, /--mobile-regional-announcement-chip-height:\s*48px/);
    assert.match(networkMapSource, /viewportOrientation=\{props\.viewportOrientation\}/);
    assert.match(regionalMapSource, /viewportOrientation = "standard"/);
    assert.match(regionalMapSource, /clientPointToLogicalViewportPoint/);
    assert.match(regionalMapSource, /clientRectToLogicalViewportBounds/);
    assert.match(regionalMapSource, /data-map-viewport-orientation=\{viewportOrientation\}/);
  });

  it("switches map implementations without replaying a map camera entrance", () => {
    const networkChangeBody = shellSource.match(
      /const handleNetworkChange = \(network: NetworkId\) => \{([\s\S]*?)\n  \};/,
    )?.[1] ?? "";

    assert.doesNotMatch(networkMapSource, /entranceSignal=/);
    assert.doesNotMatch(networkChangeBody, /setMapLayoutSignal/);
    assert.doesNotMatch(networkMapSource, /key=\{network\}/);
    assert.doesNotMatch(regionalMapSource, /startInitialFlyIn/);
    assert.match(shellSource, /animateInitialEntrance=\{!initialMapReady\}/);
    assert.match(regionalMapSource, /const initializeMapCamera = useCallback/);
    assert.match(regionalMapSource, /if \(animateInitialEntrance && shouldAnimateProgrammaticTransform\) \{[\s\S]*computeFittedCameraFlyInStart[\s\S]*animateCameraTo\(fitted\.camera, fitted\.scale\)/);
    assert.match(
      networkMapSource,
      /<InteractiveTtcMap[\s\S]*\{\.\.\.props\}[\s\S]*onReady=\{onInitialMapReady\}/,
    );
  });

  it("gives either initially preferred map the main-worktree camera fly-in", () => {
    assert.match(
      shellSource,
      /const \[initialMapReady, setInitialMapReady\] = useState\(false\)/,
    );
    assert.match(
      shellSource,
      /animateInitialEntrance=\{!initialMapReady\}/,
    );
    assert.match(
      shellSource,
      /onInitialMapReady=\{handleInitialMapReady\}/,
    );
    assert.match(
      networkMapSource,
      /onReady=\{onInitialMapReady\}/g,
    );
    assert.match(
      panZoomSource,
      /const initializeCamera = useCallback\(\(\) => \{\s*moveToDefaultCamera\(animateInitialEntrance, animateInitialEntrance\)/,
    );
    assert.match(regionalMapSource, /computeFittedCameraFlyInStart\(fitted\.camera, width, height, fitted\.focus\)/);
    assert.match(networkMapSource, /deferInitialEntrance=\{props\.deferInitialEntrance\}/);
    assert.match(regionalMapSource, /const stageInitialEntrance = useCallback/);
    assert.match(regionalMapSource, /const completeStagedEntrance = useCallback/);
    assert.match(regionalMapSource, /useLayoutEffect\(\(\) => \{[\s\S]*?stageInitialEntrance\(\)[\s\S]*?initializeMapCamera\(\)/);
    assert.match(regionalMapSource, /visibility: svgMarkup && cameraReady \? "visible" : "hidden"/);
    assert.match(regionalMapSource, /transition: "none"/);
    assert.doesNotMatch(regionalMapSource, /transition: shouldAnimateProgrammaticTransform && !isGestureActive/);
    assert.match(shellSource, /selectedNetwork === "regional" && regionalRailOperatingState\.status === "closed" && !closedScreenAcknowledged/);
    assert.match(panZoomSource, /computeFittedCameraFlyInStart\(next, width, height\)/);
    assert.match(regionalMapSource, /transform 0\.8s cubic-bezier\(0\.25, 1, 0\.5, 1\)/);
    assert.match(regionalMapSource, /setCamera\(entryCamera\);[\s\S]*?requestAnimationFrame[\s\S]*?animateCameraTo\(fitted\.camera, fitted\.scale\);/);
    assert.doesNotMatch(regionalMapSource, /useEffect\(\(\) => \{\s*cameraRef\.current = camera;\s*\}, \[camera\]\)/);
    assert.doesNotMatch(shellSource, /animate-map-center-fade/);
  });

  it("slides compositor snapshots while keeping inactive React maps unmounted", () => {
    assert.match(shellSource, /startViewTransition/);
    assert.match(shellSource, /flushSync\(applyNetworkChange\)/);
    assert.match(shellSource, /networkTransitionDirection/);
    assert.match(shellSource, /network-map-transition-surface/);
    assert.doesNotMatch(networkMapSource, /useState|useEffect|AnimationEvent|network-map-slide/);
    assert.doesNotMatch(shellSource, /<NetworkMapLegends/);
    assert.match(globalsCss, /view-transition-name:\s*network-map/);
    assert.match(globalsCss, /::view-transition-old\(network-map\)/);
    assert.match(globalsCss, /::view-transition-new\(network-map\)/);
    assert.match(globalsCss, /@keyframes network-map-slide-in-from-right/);
    assert.match(globalsCss, /@keyframes network-map-slide-out-to-left/);
    assert.match(globalsCss, /@keyframes network-map-slide-in-from-left/);
    assert.match(globalsCss, /@keyframes network-map-slide-out-to-right/);
    assert.doesNotMatch(
      globalsCss.match(/\.network-selector-glider\s*\{([\s\S]*?)\}/)?.[1] ?? "",
      /will-change/,
    );
    assert.match(regionalMapSource, /viewport\.clientWidth \|\| mapSurface\?\.clientWidth/);
    assert.match(regionalMapSource, /viewport\.getClientRects\(\)\.length > 0/);
  });

  it("keeps an acknowledged overnight screen dismissed across network swaps", () => {
    const networkChangeBody = shellSource.match(
      /const handleNetworkChange = \(network: NetworkId\) => \{([\s\S]*?)\n  \};/,
    )?.[1] ?? "";

    assert.doesNotMatch(networkChangeBody, /setClosedMapPeek\(false\)/);
    assert.match(shellSource, /closedScreenAcknowledged/);
    assert.doesNotMatch(shellSource, /if \(!selectedNetworkIsClosed && closedMapPeek\)/);
    assert.match(
      shellSource,
      /aria-label="Station Search"[\s\S]*subway-closed-peek-chip[\s\S]*Floating Dropdown Menu/,
    );
  });




  it("provides all eight corridors and all 72 logical stations as fallback demo data", () => {
    assert.deepEqual(regionalDashboardData.lineStatuses.map((line) => line.number), ["BR", "KI", "LE", "LW", "MI", "RH", "ST", "UP"]);
    assert.equal(regionalDashboardData.stations.length, 72);
    assert.equal(regionalStationSummaries.stations.length, 72);
    assert.equal(regionalDashboardData.dataSource, "fallback");
    assert.equal(regionalDashboardData.generatedAt.live, false);
    assert.match(regionalDashboardData.generatedAt.lastPoll, /fixture/i);
    const svgLogicalStationIds = [...regionalSvg.matchAll(/inkscape:label="station-([^"]+)"/g)]
      .map((match) => match[1])
      .filter((id) => id !== "text" && !id.endsWith("-ki") && !id.endsWith("-up"))
      .sort();
    assert.deepEqual(regionalDashboardData.stations.map((station) => station.id).sort(), svgLogicalStationIds);
  });

  it("indexes every adjacent station pair with network-safe route topology", () => {
    const expectedSegmentCount = Object.values(REGIONAL_ROUTE_STATIONS)
      .reduce((total, stationIds) => total + stationIds.length - 1, 0);
    assert.equal(expectedSegmentCount, 74);
    assert.equal(regionalDashboardData.networkSegments.length, expectedSegmentCount);
    assert.equal(
      new Set(regionalDashboardData.networkSegments.map((segment) => segment.id)).size,
      expectedSegmentCount,
    );
    assert.ok(regionalDashboardData.networkSegments.every((segment) =>
      segment.stationAId
      && segment.stationBId
      && segment.stationAAnchorId
      && segment.stationBAnchorId
      && segment.guidePathId
    ));
  });

  it("keeps map station data scoped while exposing both catalogs to global search", () => {
    const ids = new Set(regionalStationSummaries.stations.map((station) => station.id));
    assert.equal(ids.has("pearson-airport"), true);
    assert.equal(ids.has("finch"), false);
    assert.match(
      shellSource,
      /const stationCatalogs = useMemo\([\s\S]*ttc:\s*ttcStationSummaries[\s\S]*regional:\s*regionalStationSummaries\.stations/,
    );
    assert.match(shellSource, /const stationSummaries = stationCatalogs\[selectedNetwork\]/);
    assert.match(shellSource, /stationCatalogs=\{stationCatalogs\}/);
    assert.match(shellSource, /setTtcStationSummaries\(result\.data\.stations\)/);
  });

  it("uses the TTC station-detail layout while keeping regional data limitations explicit", () => {
    assert.match(regionalStationDetailSource, /station-detail-header-actions/);
    assert.match(regionalStationDetailSource, /station-detail-save-control/);
    assert.match(regionalStationDetailSource, /data-station-header-line-details/);
    assert.match(regionalStationDetailSource, /data-station-section="arrivals"/);
    assert.match(regionalStationDetailSource, /Regional realtime unavailable/);
    assert.match(regionalStationDetailSource, /Arrival Data Unavailable/);
    assert.match(regionalStationDetailSource, /Metrolinx realtime coverage has not been configured/);
    assert.match(regionalStationDetailSource, /Accessibility and platform-condition details are unavailable/);
    assert.doesNotMatch(regionalStationDetailSource, /wheel-chair-symbol|elevator-icon/);
  });

  it("uses cardinal directions consistently for every regional rail corridor", () => {
    assert.deepEqual(REGIONAL_ROUTE_CARDINAL_DIRECTIONS, {
      BR: "Northbound / Southbound",
      KI: "Eastbound / Westbound",
      LE: "Eastbound / Westbound",
      LW: "Eastbound / Westbound",
      MI: "Eastbound / Westbound",
      RH: "Northbound / Southbound",
      ST: "Northbound / Southbound",
      UP: "Eastbound / Westbound",
    });
    assert.match(regionalStationDetailSource, /REGIONAL_ROUTE_CARDINAL_DIRECTIONS\[route\.number(?:\s+as\s+[^\]]+)?\]/);
    assert.doesNotMatch(regionalStationDetailSource, /Toward/);
  });

  it("keeps grouped junction selection logical while exposing KI and UP route anchors", () => {
    for (const stationId of ["weston", "mount-dennis", "bloor"]) {
      assert.deepEqual(REGIONAL_JUNCTION_ANCHORS[stationId], {
        KI: `station-${stationId}-ki`,
        UP: `station-${stationId}-up`,
      });
    }
    assert.match(regionalMapSource, /closest\("\[data-regional-station-id\]"\)/);
    assert.match(regionalMapSource, /data-regional-station-id/);
  });

  it("gates TTC-only closed-hours and train-marker behavior", () => {
    assert.match(shellSource, /selectedNetwork === "ttc" && subwayOperatingState\.status/);
    assert.match(shellSource, /selectedNetwork === "ttc" && estimatedTrainsEnabled/);
  });

  it("docks desktop impact badges to the bottom-left corner across networks", () => {
    assert.match(
      shellSource,
      /desktop-status-chip-row-container fixed bottom-6 left-6/,
    );
  });

  it("does not invent current disruptions in regional fallback mode", () => {
    assert.deepEqual(regionalDashboardData.activeAlerts, []);
    assert.deepEqual(regionalDashboardData.delays, []);
    assert.deepEqual(regionalDashboardData.plannedClosures, []);
    assert.deepEqual(regionalDashboardData.stationNodeImpacts, []);
    assert.ok(regionalDashboardData.networkSegments.every((segment) => segment.overlay === "clear"));
  });

  it("retains route-wide, station-node, and explicit segment overlay plumbing", () => {
    assert.match(regionalMapSource, /item\.affectedSegmentIds\.length === 0/);
    assert.match(regionalMapSource, /segment\.guidePathId/);
    assert.match(regionalMapSource, /stationNodeImpacts/);
  });

  it("provides source-honest synthetic scenarios without changing the default fixture", () => {
    const scenario = regionalDashboardDataForScenario("all-impact-types");
    assert.equal(regionalDashboardData.activeAlerts.length, 0);
    assert.equal(scenario.activeAlerts.length, 2);
    assert.equal(scenario.delays.length, 1);
    assert.equal(scenario.plannedClosures.length, 1);
    assert.equal(scenario.stationNodeImpacts.length, 1);
    assert.ok(scenario.networkSegments.some((segment) => (segment.impacts?.length ?? 0) > 0));
    assert.ok(scenario.activeAlerts.every((alert) => /Synthetic regional fixture/.test(alert.source)));
  });

  it("adds visible hover, focus, and selection feedback to regional stations", () => {
    assert.match(globalsCss, /\.regional-station-hit-target:hover \+ \.regional-station-hover-indicator/);
    assert.match(globalsCss, /\.regional-station-hit-target:focus-visible \+ \.regional-station-hover-indicator/);
    assert.match(regionalMapSource, /"station-hover-indicator", "regional-station-hover-indicator"/);
    assert.match(regionalMapSource, /stationId === "union" \? 75/);
    assert.match(regionalMapSource, /"station-selected-indicator", "regional-station-selected-indicator"/);
    assert.match(regionalMapSource, /"map-segment-hit-target", "regional-impact-hit-target"/);
    assert.match(regionalMapSource, /"asset-alert-path-hover-boundary", "regional-impact-hover-boundary"/);
    assert.match(regionalMapSource, /createElementNS\(SVG_NAMESPACE, "title"\)/);
    assert.match(globalsCss, /\.map-selection-attention\s*\{[^}]*--selection-intro-name:\s*none/s);
    assert.match(regionalMapSource, /"map-selection-attention", "station-selected-indicator", "regional-station-selected-indicator"/);
  });

  it("uses TTC-derived disruption motion and selection emphasis at regional map scale", () => {
    assert.match(regionalMapSource, /"regional-impact-aura"/);
    assert.match(regionalMapSource, /"regional-impact-interactive-glow"/);
    assert.match(globalsCss, /data-regional-impact-kind="delay"[\s\S]*regional-delay-static-shift/);
    assert.match(globalsCss, /data-regional-impact-kind="reduced-speed-zone"[\s\S]*regional-chevron-slide/);
    assert.match(globalsCss, /data-regional-impact-kind="suspension"[\s\S]*regional-impact-width-pulse/);
    assert.match(globalsCss, /data-regional-impact-kind="planned-closure"[\s\S]*regional-impact-aura[\s\S]*display:\s*none/);
    assert.match(globalsCss, /data-regional-impact-selected="true"[\s\S]*regional-impact-interactive-glow[\s\S]*regional-selection-path-intro/);
    assert.match(globalsCss, /\.motion-paused \.regional-impact-aura/);
    assert.match(globalsCss, /prefers-reduced-motion:\s*reduce[\s\S]*\.regional-impact-aura/);
  });

  it("reuses the smooth attention-to-breathing lifecycle for every selected regional station and impact", () => {
    assert.doesNotMatch(regionalMapSource, /selectionPulsePhase|data-regional-selection-phase/);
    assert.match(regionalMapSource, /"map-selection-attention", "station-selected-indicator", "regional-station-selected-indicator"/);
    assert.match(regionalMapSource, /"regional-impact-interactive-glow", "map-selection-attention"/);
    assert.doesNotMatch(
      regionalMapSource,
      /interactiveGlow\.classList\.add\([^;]*"interactive-glow"/,
    );
    assert.match(regionalMapSource, /"station-impact-ring", "regional-station-impact-ring", "map-selection-attention"/);
    assert.match(globalsCss, /\.map-selection-attention\s*\{[^}]*animation-delay:\s*0s,\s*var\(--selection-intro-duration\)/s);
    assert.match(globalsCss, /regional-station-selected-indicator\[data-regional-station-selected="true"\][\s\S]*--selection-intro-name:\s*map-selection-station-intro/);
    assert.match(globalsCss, /regional-impact-interactive-glow[\s\S]*--selection-intro-name:\s*regional-selection-path-intro/);
    assert.match(globalsCss, /regional-station-impact-ring[\s\S]*--selection-intro-name:\s*regional-selection-ring-intro/);
  });

  it("fits terminal selections to their authored shape and slightly enlarges regular station dots", () => {
    assert.match(regionalMapSource, /const selectedScaleFactor = isLarge \? 1 : 1\.2/);
    assert.doesNotMatch(regionalMapSource, /stationId === "union" \? 104/);
    assert.match(regionalMapSource, /element\.before\(hitTarget, hoverIndicator\)/);
    assert.match(regionalMapSource, /element\.after\(selectedIndicator\)/);
    assert.match(
      globalsCss,
      /regional-impact-interactive-glow\s*\{[\s\S]*stroke:\s*var\(--station-selection-accent\)/,
    );
    assert.match(
      globalsCss,
      /regional-station-impact-ring\[data-regional-impact-selected="true"\][\s\S]*fill:\s*rgb\(var\(--station-selection-accent-rgb\)[^;]*!important[\s\S]*stroke:\s*var\(--station-selection-accent\)\s*!important/,
    );
  });

  it("renders every layered segment impact instead of discarding overlaps", () => {
    assert.match(regionalMapSource, /for \(const \[impactIndex, impact\] of \(segment\.impacts \?\? \[\]\)\.entries\(\)\)/);
    assert.doesNotMatch(regionalMapSource, /const impact = segment\.impacts\?\.\[0\]/);
  });

  it("supports pointer, wheel, fit-network, and keyboard map interactions", () => {
    assert.match(regionalMapSource, /onWheel=\{onWheel\}/);
    assert.match(regionalMapSource, /onPointerDown=\{onPointerDown\}/);
    assert.match(regionalMapSource, /event\.key !== "Enter" && event\.key !== " "/);
    assert.match(regionalMapSource, /aria-label="Fit regional network"/);
  });

  it("focuses the regional camera on station and impact selections from every UI entry point", () => {
    assert.match(networkMapSource, /desktopMenuPinned=\{props\.desktopMenuPinned\}/);
    assert.match(networkMapSource, /preserveCameraOnSelectionClear=\{props\.preserveCameraOnSelectionClear\}/);
    assert.match(regionalMapSource, /data-regional-station-selection-id/);
    assert.match(regionalMapSource, /data-regional-impact-kind/);
    assert.match(regionalMapSource, /selectedMapElements/);
    assert.match(regionalMapSource, /getBoundingClientRect\(\)/);
    assert.match(regionalMapSource, /fitScale \* \(isMobile \? 3\.8 : 1\.8\)/);
    assert.match(regionalMapSource, /focusX - mapX \* targetScale/);
    assert.match(regionalMapSource, /focusY - mapY \* targetScale/);
    assert.match(regionalMapSource, /animateCameraTo\(snapCameraToDevicePixels/);
    assert.match(regionalMapSource, /if \(!preserveCameraOnSelectionClear\)[\s\S]*requestAnimationFrame\(fitNetwork\)/);
  });

  it("preserves station activation across viewport pointer capture", () => {
    assert.match(regionalMapSource, /pointerActivationRef/);
    assert.match(regionalMapSource, /event\.type === "pointerup" && !dragMovedRef\.current && activation/);
    assert.match(regionalMapSource, /onSelectStationId\(selectedStationId === activation\.id \? null : activation\.id\)/);
  });

  it("batches regional drag transforms outside React renders", () => {
    assert.match(regionalMapSource, /memo\(InteractiveRegionalMapComponent\)/);
    assert.match(regionalMapSource, /dragAnimationFrameRef/);
    assert.match(regionalMapSource, /window\.requestAnimationFrame/);
    assert.match(regionalMapSource, /writeMapTransform\(nextCamera\)/);
    assert.doesNotMatch(
      regionalMapSource,
      /const onPointerMove[\s\S]*?setCamera\(snapCameraToDevicePixels/,
    );
  });

  it("applies the TTC mobile performance contract to the regional camera and overlays", () => {
    assert.match(networkMapSource, /mobilePerformanceMode=\{props\.mobilePerformanceMode\}/);
    assert.match(regionalMapSource, /mobilePerformanceMode\?:\s*boolean/);
    assert.match(regionalMapSource, /const shouldAnimateProgrammaticTransform = !reducedMotion && !mobilePerformanceMode/);
    assert.match(regionalMapSource, /isGestureActive \? "map-gesture-active" : ""/);
    assert.match(
      globalsCss,
      /\.linewatch-shell\.mobile-performance-mode \.regional-impact-aura,[\s\S]*?\.linewatch-shell\.mobile-performance-mode \.regional-station-impact-ring\s*\{[^}]*animation:\s*none\s*!important;[^}]*filter:\s*none\s*!important;[^}]*transition:\s*none\s*!important;/s,
    );
  });

  it("uses the TTC-style multi-pointer pinch pipeline for the regional map", () => {
    assert.match(regionalMapSource, /activePointersRef = useRef\(new Map<number, \{ x: number; y: number \}>\(\)\)/);
    assert.match(regionalMapSource, /pinchGestureRef/);
    assert.match(regionalMapSource, /distanceBetweenPoints/);
    assert.match(regionalMapSource, /midpointBetweenPoints/);
    assert.match(regionalMapSource, /transformForMapPointAtViewportPoint/);
    assert.match(regionalMapSource, /activePointersRef\.current\.size >= 2/);
  });

  it("centers the enlarged default desktop network frame between the upper console and regional impact badges", () => {
    assert.match(regionalMapSource, /\.desktop-status-capsule/);
    assert.match(regionalMapSource, /\.desktop-status-chip-row-container/);
    assert.match(regionalMapSource, /setDesktopMapTopInset/);
    assert.match(regionalMapSource, /setDesktopMapBottomInset/);
    assert.match(regionalMapSource, /computeBoundedMapFrame/);
    assert.match(regionalMapSource, /computeInsetViewportFocus/);
    assert.match(
      globalsCss,
      /\.regional-map-stage > div > svg\s*\{[^}]*display:\s*block;[^}]*width:\s*100%;[^}]*height:\s*100%;/s,
    );
    assert.match(regionalMapSource, /const REGIONAL_MAP_HORIZONTAL_INSET_RATIO = 0\.025/);
    assert.match(regionalMapSource, /const REGIONAL_MAP_DEFAULT_FRAME_SCALE = 1\.04/);
    assert.doesNotMatch(regionalMapSource, /REGIONAL_MAP_DESKTOP_VERTICAL_OPTICAL_OFFSET_RATIO/);
    assert.match(regionalMapSource, /Math\.min\(64, Math\.max\(32, width \* REGIONAL_MAP_HORIZONTAL_INSET_RATIO\)\)/);
    assert.match(regionalMapSource, /left:\s*horizontalInset/);
    assert.match(regionalMapSource, /right:\s*horizontalInset/);
    assert.match(regionalMapSource, /top:\s*desktopMapTopInset/);
    assert.match(regionalMapSource, /bottom:\s*desktopMapBottomInset/);
    assert.match(regionalMapSource, /x: focus\.focusX - \(focus\.focusX - frame\.x\) \* REGIONAL_MAP_DEFAULT_FRAME_SCALE/);
    assert.match(regionalMapSource, /y: focus\.focusY - \(focus\.focusY - frame\.y\) \* REGIONAL_MAP_DEFAULT_FRAME_SCALE/);
    assert.match(regionalMapSource, /scale: frame\.scale \* REGIONAL_MAP_DEFAULT_FRAME_SCALE/);
  });

  it("matches the TTC map fitted zoom range and button increments", () => {
    assert.match(regionalMapSource, /PAN_ZOOM_MIN_RELATIVE_SCALE/);
    assert.match(regionalMapSource, /PAN_ZOOM_MAX_RELATIVE_SCALE/);
    assert.match(regionalMapSource, /clampPanZoomScale\(current\.scale \* factor, fitScale\)/);
    assert.match(regionalMapSource, /clampPanZoomScale\(targetRelativeScale \* fitScale, fitScale\)/);
    assert.match(regionalMapSource, /value=\{relativeScale\}/);
    assert.match(regionalMapSource, /zoomAtCenter\(1\.25\)/);
    assert.match(regionalMapSource, /zoomAtCenter\(1 \/ 1\.25\)/);
  });

  it("uses the same React-owned CSS camera model as the stable TTC map", () => {
    assert.match(regionalMapSource, /snapCameraToDevicePixels/);
    assert.match(regionalMapSource, /transform: `translate\(\$\{camera\.x\}px, \$\{camera\.y\}px\) scale\(\$\{camera\.scale\}\)`/);
    assert.match(regionalMapSource, /transformOrigin: "0 0"/);
    assert.match(regionalMapSource, /root\.setAttribute\("preserveAspectRatio", "xMidYMid meet"\)/);
    assert.doesNotMatch(regionalMapSource, /root\.setAttribute\("viewBox"/);
  });

  it("keeps the serialized regional SVG mounted while camera state commits", () => {
    assert.match(regionalMapSource, /const RegionalSvgMarkup = memo\(function RegionalSvgMarkup/);
    assert.match(regionalMapSource, /<RegionalSvgMarkup markup=\{svgMarkup\}\s*\/>/);
    assert.doesNotMatch(
      regionalMapSource,
      /<div dangerouslySetInnerHTML=\{\{ __html: svgMarkup \}\}/,
    );
  });

  it("keeps the regional entrance and map controls on one camera animation pipeline", () => {
    assert.match(regionalMapSource, /setMapTransition\("transform 0\.8s cubic-bezier\(0\.25, 1, 0\.5, 1\)"\)/);
    assert.match(regionalMapSource, /programmaticAnimationFrameRef\.current = window\.requestAnimationFrame/);
    assert.match(regionalMapSource, /writeMapTransform\(targetCamera\)/);
    assert.match(regionalMapSource, /window\.setTimeout\(\(\) => \{[\s\S]*setCamera\(\{ \.\.\.cameraRef\.current \}\)/);
    assert.match(regionalMapSource, /cancelCameraAnimation\(\);[\s\S]*dragRef\.current/);
    assert.doesNotMatch(regionalMapSource, /setMapTransition\("transform 0\.8s[^\n]+\);\s*setCamera\(targetCamera\)/);
    assert.match(regionalMapSource, /if \(animateInitialEntrance && shouldAnimateProgrammaticTransform\) \{[\s\S]*entryCamera[\s\S]*animateCameraTo/);
  });

  it("does not move or zoom the initialized camera when the dashboard viewport resizes", () => {
    assert.doesNotMatch(regionalMapSource, /new ResizeObserver\(fitNetwork\)/);
    const resizeObserverBody = regionalMapSource.match(/const observer = new ResizeObserver\(\(\) => \{([\s\S]*?)\n    \}\);/)?.[1] ?? "";
    assert.match(resizeObserverBody, /if \(cameraInitializedRef\.current\) return/);
    assert.doesNotMatch(resizeObserverBody, /setCamera/);
    assert.doesNotMatch(resizeObserverBody, /setFitScale/);
  });

  it("does not replay a stale recenter command after a remount or refresh", () => {
    assert.match(regionalMapSource, /const lastRecenterSignalRef = useRef\(recenterSignal\)/);
    assert.match(regionalMapSource, /recenterSignal === lastRecenterSignalRef\.current/);
  });

  it("does not refit an initialized camera when refreshed dashboard data rebuilds the SVG", () => {
    assert.match(regionalMapSource, /if \(cameraInitializedRef\.current \|\| !svgMarkup\) return/);
    assert.match(regionalMapSource, /cameraInitializedRef\.current = true/);
  });
});
