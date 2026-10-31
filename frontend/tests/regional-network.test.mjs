import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DEFAULT_NETWORK_ID,
  REGIONAL_JUNCTION_ANCHORS,
  REGIONAL_ROUTE_CARDINAL_DIRECTIONS,
  REGIONAL_ROUTE_LINKS,
  REGIONAL_ROUTE_STATIONS,
  regionalDashboardData,
  regionalDashboardDataFromApi,
  regionalDashboardDataForScenario,
  regionalStationSummaries,
} from "../src/app/regional-data.ts";
import { defaultVisualPreferences } from "../src/app/visual-preferences.ts";
import { readAppStylesheet } from "./helpers/stylesheet-graph.mjs";
import { readShellSource } from "./helpers/shell-source.mjs";
import { readRegionalMapSource, readTtcMapSource } from "./helpers/map-source.mjs";

const shellSource = readShellSource();
const networkSelectorSource = readFileSync(new URL("../src/components/NetworkSelector.tsx", import.meta.url), "utf8");
const defaultMapModeSource = readFileSync(new URL("../src/components/DefaultMapModeControl.tsx", import.meta.url), "utf8");
const mobileMoreSource = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");
const mobileLegendSource = readFileSync(new URL("../src/components/MobileLegend.tsx", import.meta.url), "utf8");
const networkMapSource = readFileSync(new URL("../src/components/NetworkMap.tsx", import.meta.url), "utf8");
const networkMapLegendsSource = readFileSync(new URL("../src/components/NetworkMapLegends.tsx", import.meta.url), "utf8");
const regionalMapSource = readRegionalMapSource();
const overlayHoverSource = readFileSync(new URL("../src/components/map-overlays/overlay-hover.ts", import.meta.url), "utf8");
const framingSource = readFileSync(new URL("../src/components/map-camera/useMapFraming.ts", import.meta.url), "utf8");
const regionalGeometrySource = readFileSync(new URL("../src/app/regional-map-geometry.ts", import.meta.url), "utf8");
const regionalAssetSource = readFileSync(new URL("../src/app/regional-map-asset.ts", import.meta.url), "utf8");
const regionalOverlaysSource = readFileSync(new URL("../src/app/regional-map-overlays.ts", import.meta.url), "utf8");
const regionalLineAlertsSource = readFileSync(new URL("../src/app/regional-line-alerts.ts", import.meta.url), "utf8");
const stationLayersSource = readFileSync(new URL("../src/components/MapStationLayers.tsx", import.meta.url), "utf8");
const pulseSyncSource = readFileSync(new URL("../src/components/map-overlays/pulse-sync.ts", import.meta.url), "utf8");
const regionalContentSource = readFileSync(new URL("../src/app/regional-map-content.ts", import.meta.url), "utf8");
const tapsSource = readFileSync(new URL("../src/components/map-overlays/useMapTaps.ts", import.meta.url), "utf8");
const hoverControllerSource = readFileSync(new URL("../src/components/map-overlays/map-hover-controller.ts", import.meta.url), "utf8");
const regionalStationAlertsSource = readFileSync(new URL("../src/app/regional-station-alerts.ts", import.meta.url), "utf8");
// The shared overlay layer both maps draw line alerts with.
const sharedOverlaySource = ["LineAlertOverlays.tsx", "GlyphLanes.tsx", "line-alert-model.ts", "overlay-hover.ts", "overlay-plane.ts"]
  .map((name) => readFileSync(new URL(`../src/components/map-overlays/${name}`, import.meta.url), "utf8"))
  .join("\n");
const ttcMapSource = readTtcMapSource();
const overlapIndicatorSource = readFileSync(new URL("../src/components/MapOverlapIndicator.tsx", import.meta.url), "utf8");
const overlapChooserSource = readFileSync(new URL("../src/components/MapOverlapChooser.tsx", import.meta.url), "utf8");
const regionalStationDetailSource = readFileSync(new URL("../src/components/RegionalStationDetailPanel.tsx", import.meta.url), "utf8");
const stationDetailHeaderSource = readFileSync(new URL("../src/components/StationDetailHeader.tsx", import.meta.url), "utf8");
const panZoomSource = readFileSync(new URL("../src/hooks/usePanZoom.ts", import.meta.url), "utf8");
const sidebarStateSource = readFileSync(new URL("../src/app/desktop-sidebar-state.ts", import.meta.url), "utf8");
const regionalSvg = readFileSync(new URL("../public/assets/linewatch/regional-rail-map.svg", import.meta.url), "utf8");
const globalsCss = readAppStylesheet();

describe("network-scoped regional dashboard", () => {
  it("keeps TTC as the default and renders each network's registered map", () => {
    assert.equal(DEFAULT_NETWORK_ID, "ttc");
    assert.equal(defaultVisualPreferences.defaultNetwork, DEFAULT_NETWORK_ID);
    assert.match(shellSource, /useState<NetworkId>\(initialVisualPreferences\.defaultNetwork\)/);
    assert.match(networkMapSource, /<RegisteredSystemMap\s+mapId=\{NETWORK_MAPS\[diagramNetwork\]\}/);
    assert.doesNotMatch(networkMapSource, /diagramNetwork === "regional"/);
  });

  it("lets riders persist a default map below My Stations in the mobile More sheet", () => {
    assert.match(defaultMapModeSource, /Default Map/);
    assert.match(defaultMapModeSource, /TTC/);
    assert.match(defaultMapModeSource, /GO &amp; UP/);
    assert.match(defaultMapModeSource, /className="default-map-mode-glider"/);
    assert.match(globalsCss, /\.default-map-mode-glider/);
    assert.match(
      globalsCss,
      /\.default-map-mode-options\[data-network="regional"\] \.default-map-mode-glider\s*\{[^}]*transform:\s*translateX\(100%\)/s,
    );
    assert.match(mobileMoreSource, /<DefaultMapModeControl/);
    assert.ok(mobileMoreSource.indexOf("My Stations") < mobileMoreSource.indexOf("<DefaultMapModeControl"));
    assert.match(shellSource, /defaultNetwork:\s*defaultNetworkPreference/);
    const preferenceChangeBody = shellSource.match(
      /const handleDefaultNetworkChange = \(network: NetworkId\) => \{([\s\S]*?)\n  \};/,
    )?.[1] ?? "";
    assert.match(preferenceChangeBody, /setDefaultNetworkPreference\(network\)/);
    assert.doesNotMatch(preferenceChangeBody, /handleNetworkChange|setSelectedNetwork|setActiveView/);
  });

  it("isolates inactive diagrams from interaction and keeps their data network-scoped", () => {
    assert.match(networkMapSource, /inert=\{preparing\}/);
    assert.match(networkMapSource, /aria-hidden=\{preparing/);
    assert.match(networkMapSource, /data=\{diagramData\[diagramNetwork\]\}/);
    assert.match(networkMapSource, /reducedMotion=\{props\.reducedMotion\}/);
  });

  it("reuses a compact vertical network selector below the mobile site guide", () => {
    assert.match(shellSource, /className="site-guide-network-stack"[\s\S]*<SiteGuideDropdown[\s\S]*className="mobile-network-selector-slot"[\s\S]*<NetworkSelector[\s\S]*compactVertical/);
    assert.match(networkSelectorSource, /compactVertical = false/);
    assert.match(networkSelectorSource, /network-selector--compact-vertical/);
    assert.match(globalsCss, /\.network-selector--compact-vertical\s*\{[\s\S]*flex-direction:\s*column/);
    assert.match(globalsCss, /\.network-selector--compact-vertical\[data-network="regional"\] \.network-selector-glider\s*\{[\s\S]*translateY/);
    assert.match(globalsCss, /\.site-guide-network-stack\s*\{[\s\S]*width:\s*var\(--mobile-top-action-button-size\)/);
    assert.match(globalsCss, /\.network-selector--compact-vertical \.network-indicator-dot\s*\{[\s\S]*display:\s*none/);
    assert.match(globalsCss, /--compact-network-option-height:\s*40px[\s\S]*--compact-network-glider-height:\s*40px/);
    assert.match(globalsCss, /\.network-selector--compact-vertical \.network-selector-glider\s*\{[\s\S]*height:\s*var\(--compact-network-glider-height\)/);
  });

  it("draws a selection marker only for the selected regional station", () => {
    assert.match(regionalMapSource, /stationPlacements\.find\(\(\{ artwork: station \}\) => station\.id === selectedStationId\)/);
    assert.match(stationLayersSource, /if \(!station\) return null;/);
    assert.match(stationLayersSource, /data-map-selected-station-id=\{station\.id\}/);
    assert.doesNotMatch(regionalAssetSource, /regionalStationSelectionId|data-regional-station-selected/);
  });

  it("keeps regional selections in an even mobile split in standard mode and supports rotated preview mode", () => {
    assert.match(globalsCss, /mobile-map-inspector\[data-network="regional"\][\s\S]*--mobile-inspector-total-height:\s*50dvh/);
    assert.match(shellSource, /rotatedSelectionVisible && !mobileInspectorOpen/);
    assert.match(networkMapSource, /layoutResetSignal=\{props\.layoutResetSignal\}/);
    assert.match(regionalMapSource, /layoutResetSignal,\n    recenterSignal,/);
    assert.match(framingSource, /const layoutKey = \[\s*layoutResetSignal \?\? 0,\s*viewportOrientation,/);
  });

  it("preserves the authored regional corridor overlay width in mobile performance mode", () => {
    // Mobile simplification sizes overlays in overlay units, so GO/UP keeps its
    // full-width rails (unit 196 / 96).
    assert.match(globalsCss, /\.linewatch-shell\.mobile-performance-mode \.asset-alert-path-glow\s*\{[^}]*calc\(132px \* var\(--map-overlay-unit, 1\)\)/s);
    assert.match(regionalMapSource, /style=\{mapOverlayUnitStyle\(\{ unit: overlayPlane\.unit \}\)\}/);
    assert.match(regionalGeometrySource, /REGIONAL_OVERLAY_UNIT = REGIONAL_IMPACT_OVERLAY_WIDTH \/ 96/);
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
    assert.match(globalsCss, /\.subway-closing-soon-chip,[\s\S]*\.go-up-closing-soon-chip\s*\{[\s\S]*overflow:\s*hidden\s*!important/);
    assert.match(globalsCss, /\.subway-closing-soon-copy\s*\{[\s\S]*overflow:\s*hidden\s*!important/);
    assert.match(mobileLegendSource, /mobile-legend-pill--regional/);
    assert.match(mobileLegendSource, /mobile-legend-compact-row/);
    assert.match(mobileLegendSource, /mobile-legend-line-list/);
    assert.match(mobileLegendSource, /mobile-legend-route-badge--regional/);
    assert.match(mobileLegendSource, /<TransitLineBadge/);
    assert.match(mobileLegendSource, /size=\{24\}/);
    assert.match(mobileLegendSource, /name:\s*"UP Express"/);
    assert.match(globalsCss, /\.mobile-legend-pill--regional\s*\{[^}]*max-width:\s*44px/);
    assert.match(globalsCss, /\.mobile-legend-line-list\s*\{[^}]*position:\s*absolute/s);
    assert.match(
      shellSource,
      /data-network=\{selectedNetwork\}/,
    );
    assert.match(
      shellSource,
      /selectedNetwork === "regional"\s*\?\s*"mobile-train-toggle--regional"\s*:\s*""/,
    );
    assert.match(
      globalsCss,
      /\.mobile-train-toggle\s*\{[^}]*top:\s*auto\s*!important;[^}]*bottom:\s*calc\(var\(--mobile-bottom-nav-occupied-height\) \+ var\(--mobile-status-peek-actual-height, 108px\) \+ 24px\)/,
    );
  });

  it("shows the rotate-map action in regional mobile mode and preserves complete notice copy", () => {
    assert.doesNotMatch(
      shellSource,
      /selectedNetwork === "ttc"\s*\?\s*<button\s*[\s\S]{0,300}className="rotate-map-btn/,
    );
    assert.match(shellSource, /<button[\s\S]{0,400}className="rotate-map-btn/);
    assert.match(globalsCss, /--mobile-regional-announcement-chip-height:\s*var\(--mobile-top-action-button-size\)/);
    // Every map gets the shell's props, viewportOrientation among them.
    assert.match(networkMapSource, /<RegisteredSystemMap\s+mapId=\{NETWORK_MAPS\[diagramNetwork\]\}\s+\{\.\.\.props\}/);
    assert.match(regionalMapSource, /viewportOrientation = "standard"/);
    assert.match(regionalMapSource, /viewportOrientation,\n    disableProgrammaticMotion/);
    assert.match(regionalMapSource, /useMapViewportSize\(viewportRef, viewportOrientation\)/);
    assert.match(regionalMapSource, /data-map-viewport-orientation=\{viewportOrientation\}/);
  });

  it("switches map implementations without replaying a map camera entrance", () => {
    const networkChangeBody = shellSource.match(
      /const handleNetworkChange = \(network: NetworkId\) => \{([\s\S]*?)\n  \};/,
    )?.[1] ?? "";

    assert.doesNotMatch(networkChangeBody, /setMapLayoutSignal/);
    assert.doesNotMatch(networkChangeBody, /setMapEntranceSignal/);
    assert.doesNotMatch(networkMapSource, /key=\{network\}/);
    assert.doesNotMatch(regionalMapSource, /startInitialFlyIn/);
    assert.equal((shellSource.match(/animateInitialEntrance=\{false\}/g) ?? []).length, 2);
    assert.match(regionalMapSource, /if \(focusTargetKey\) moveToDefaultCamera\(false, false\);\s*else initializeCamera\(\);/);
    assert.match(
      networkMapSource,
      /<RegisteredSystemMap[\s\S]*\{\.\.\.props\}[\s\S]*onReady=\{readyCallbacks\[diagramNetwork\]\}/,
    );
  });

  it("starts the initially preferred diagram at its fitted camera", () => {
    assert.match(shellSource, /const \[initialMapReady, setInitialMapReady\] = useState\(false\)/);
    assert.match(
      shellSource,
      /animateInitialEntrance=\{false\}/,
    );
    assert.match(shellSource, /onMapReady=\{handleMapReady\}/);
    assert.match(
      networkMapSource,
      /onReady=\{onMapReady\}/g,
    );
    assert.match(
      panZoomSource,
      /const initializeCamera = useCallback\(\(\) => \{\s*if \(!restoreSavedCamera\(\)\) moveToDefaultCamera\(animateInitialEntrance, animateInitialEntrance\)/,
    );
    assert.match(networkMapSource, /deferInitialEntrance=\{preparing \? false : props\.deferInitialEntrance\}/);
    // One entrance for every map: staged while covered, then completed.
    assert.match(regionalMapSource, /const placeCamera = useCallback[\s\S]*?stageInitialEntrance\(\)[\s\S]*?completeStagedEntrance\(\)[\s\S]*?initializeCamera\(\)/);
    assert.match(regionalMapSource, /visibility: artwork && cameraPlaced \? "visible" : "hidden"/);
    assert.doesNotMatch(regionalMapSource, /transition: shouldAnimateProgrammaticTransform && !isGestureActive/);
    assert.match(shellSource, /selectedNetwork === "regional" && regionalRailOperatingState\.status === "closed" && !closedScreenAcknowledged/);
    assert.match(panZoomSource, /computeFittedCameraFlyInStart\(next, width, height\)/);
    assert.doesNotMatch(regionalMapSource, /useEffect\(\(\) => \{\s*cameraRef\.current = camera;\s*\}, \[camera\]\)/);
    assert.doesNotMatch(shellSource, /animate-map-center-fade/);
  });

  it("retains stable network-selector dimensions across selection states", () => {
    assert.doesNotMatch(networkSelectorSource, /ResizeObserver|offsetWidth|style\.setProperty/);
    assert.match(globalsCss, /grid-template-columns:\s*repeat\(2, var\(--network-option-width\)\)/);
    assert.doesNotMatch(
      globalsCss.match(/\.network-selector-glider\s*\{([\s\S]*?)\}/)?.[1] ?? "",
      /transition:[^;]*width/,
    );
  });

  it("keeps an acknowledged overnight screen dismissed across network swaps", () => {
    const networkChangeBody = shellSource.match(
      /const handleNetworkChange = \(network: NetworkId\) => \{([\s\S]*?)\n  \};/,
    )?.[1] ?? "";

    assert.doesNotMatch(networkChangeBody, /setClosedMapPeek\(false\)/);
    assert.match(shellSource, /closedScreenAcknowledged/);
    assert.match(shellSource, /desktopNotice/);
    assert.match(shellSource, /operatingNotice=\{mobileOperatingNotice\}/);
    assert.doesNotMatch(
      shellSource,
      /aria-label="Station Search"[\s\S]*subway-closed-peek-chip[\s\S]*Floating Dropdown Menu/,
    );
  });




  it("renders a Notices section attached to station-linked train notices in regional station submenus", () => {
    assert.match(regionalStationDetailSource, /FileText size=\{20\}/);
    assert.match(regionalStationDetailSource, /data-station-section="notices"/);
    assert.match(regionalStationDetailSource, /isNoticeLinkedToRegionalStation/);
    assert.match(regionalStationDetailSource, /getSurfaceNotices\(\{ networkId: "regional" \}\)/);
    assert.match(globalsCss, /\.station-notices-details/);
    assert.match(globalsCss, /\.station-notices-chevron/);
    assert.match(globalsCss, /\.station-notices-content-wrapper/);
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

  it("promotes only fresh regional API payloads to backend data", () => {
    const live = regionalDashboardDataFromApi({
      networkId: "regional",
      availability: "available",
      sourceSystems: ["metrolinx-go-service-alerts", "metrolinx-up-gtfs-alerts"],
      message: "Fresh regional data.",
      map: {
        stations: regionalDashboardData.stations,
        segments: regionalDashboardData.networkSegments,
        stationNodeImpacts: [],
      },
      status: {
        generatedAt: { time: "2:12 PM", date: "Jul 28, 2026", live: true, lastPoll: "latest poll" },
        lines: regionalDashboardData.lineStatuses.map((line) => ({ ...line, status: "normal", statusLabel: "Normal" })),
      },
      activeAlerts: [],
      delays: [{ id: "rider-details-test", lineId: "regional-ki", cause: "Signal Problems" }],
      incidentDetails: { "rider-details-test": { maximumDelayMinutes: 20, replacementService: "go-bus" } },
      reducedSpeedZones: [],
      plannedClosures: [],
      performance: regionalDashboardData.ttcPerformance,
    });
    assert.equal(live.delays[0].maximumDelayMinutes, 20);
    assert.equal(live.delays[0].replacementService, "go-bus");
    assert.equal(live.delays[0].cause, "Signal Problems");
    assert.equal(live.dataSource, "backend");
    assert.equal(live.generatedAt.live, true);
    assert.match(live.ingestionHealth[0].value, /Fresh regional data/);

    const unavailable = regionalDashboardDataFromApi({
      ...{
        networkId: "regional",
        availability: "unavailable",
        sourceSystems: [],
        message: "The latest successful regional ingestion is stale.",
        map: { stations: [], segments: [], stationNodeImpacts: [] },
        status: { generatedAt: { time: "Unavailable", date: "Unavailable", live: false, lastPoll: "stale" }, lines: [] },
        activeAlerts: [], delays: [], reducedSpeedZones: [], plannedClosures: [],
        performance: regionalDashboardData.ttcPerformance,
      },
    });
    assert.equal(unavailable.dataSource, "fallback");
    assert.equal(unavailable.generatedAt.live, false);
    assert.match(unavailable.ingestionHealth[0].value, /stale/i);
  });

  it("indexes every adjacent station pair with network-safe route topology", () => {
    const expectedSegmentCount = Object.values(REGIONAL_ROUTE_LINKS)
      .reduce((total, links) => total + links.length, 0);
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
    assert.deepEqual(
      REGIONAL_ROUTE_LINKS.LW.slice(-5),
      [
        ["aldershot", "west-harbour"],
        ["aldershot", "hamilton"],
        ["west-harbour", "confederation"],
        ["confederation", "st-catharines"],
        ["st-catharines", "niagara-falls"],
      ],
    );
    assert.deepEqual(
      regionalDashboardData.networkSegments
        .filter((segment) =>
          ["aldershot", "west-harbour", "hamilton"].includes(segment.stationAId)
          && ["aldershot", "west-harbour", "hamilton"].includes(segment.stationBId))
        .map((segment) => [segment.stationAId, segment.stationBId]),
      [
        ["aldershot", "west-harbour"],
        ["aldershot", "hamilton"],
      ],
    );
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

  it("uses the TTC station-detail layout with source-labeled regional arrivals", () => {
    assert.match(regionalStationDetailSource, /<StationDetailHeader/);
    assert.match(stationDetailHeaderSource, /station-detail-header-actions/);
    assert.match(stationDetailHeaderSource, /station-detail-save-control/);
    assert.match(regionalStationDetailSource, /<TransitLineBadge/);
    assert.match(regionalStationDetailSource, /<StationConnectionBadges/);
    assert.match(regionalStationDetailSource, /data-station-header-line-details/);
    assert.match(regionalStationDetailSource, /routes\.length > 2/);
    assert.match(regionalStationDetailSource, /Regional Corridors · \{routes\.length\} Lines/);
    assert.match(regionalStationDetailSource, /data-station-section="arrivals"/);
    assert.match(regionalStationDetailSource, /Checking Metrolinx arrivals/);
    assert.match(regionalStationDetailSource, /Regional arrivals unavailable/);
    assert.match(regionalStationDetailSource, /Published regional schedule/);
    assert.match(regionalStationDetailSource, /formatRegionalGroupSourceBadgeLabel/);
    assert.match(regionalStationDetailSource, /Arrival Data Unavailable/);
    assert.match(regionalStationDetailSource, /Upcoming regional train arrivals/);
    assert.match(regionalStationDetailSource, /groupRegionalStationArrivals/);
    assert.match(regionalStationDetailSource, /data-regional-arrival-direction/);
    assert.match(regionalStationDetailSource, /data-regional-arrival-platform/);
    assert.match(regionalStationDetailSource, /<RegionalArrivalDelayBadge arrival=\{arrival\}/);
    assert.match(regionalStationDetailSource, /regionalArrivalTimeDisplay/);
    assert.match(regionalStationDetailSource, /shouldUseDetailedRegionalArrivalCountdown/);
    assert.match(regionalStationDetailSource, /detailedCountdown/);
    assert.match(regionalStationDetailSource, /data-arrival-due/);
    assert.match(regionalStationDetailSource, /Realtime estimates can change/);
    assert.match(regionalStationDetailSource, />Station Impacts</);
    assert.doesNotMatch(regionalStationDetailSource, /Station Conditions/);
    assert.match(regionalStationDetailSource, /stationImpactCardClassName/);
    assert.match(regionalStationDetailSource, /View Details/);
    assert.match(regionalStationDetailSource, /data-station-section="accessibility"/);
    assert.match(regionalStationDetailSource, /Metrolinx Open API/);
    assert.match(regionalStationDetailSource, /station-accessibility-summary/);
    assert.match(regionalStationDetailSource, /accessibilityOutages\.length/);
    assert.doesNotMatch(regionalStationDetailSource, /open=\{accessibilityOutages\.length > 0\}/);
    assert.doesNotMatch(regionalStationDetailSource, /No active elevator or escalator outages/);
    assert.doesNotMatch(regionalStationDetailSource, /Regional accessibility outage data is disabled/);
    assert.match(regionalStationDetailSource, /data-station-section="services-and-amenities"/);
    assert.match(regionalStationDetailSource, /\/assets\/linewatch\/accessible\.svg/);
    assert.match(regionalStationDetailSource, /\/assets\/linewatch\/outages\/elevator\.svg/);
    assert.match(regionalStationDetailSource, /\/assets\/linewatch\/washroom\.svg/);
    assert.match(regionalStationDetailSource, /\/assets\/linewatch\/parking\.svg/);
    assert.match(regionalStationDetailSource, /\/assets\/linewatch\/bicycle-lockup\.svg/);
    assert.match(regionalStationDetailSource, /\/assets\/linewatch\/passenger-pick-up\.svg/);
    assert.match(regionalStationDetailSource, /Wi-Fi/);
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
    // A tap on a junction's dot or bar selects its one station.
    assert.match(tapsSource, /const stationId = mapStationIdAt\(target\);/);
    assert.doesNotMatch(regionalMapSource, /data-regional-station-id/);
  });

  it("keeps network-specific closed-hours behavior and enables regional train markers", () => {
    assert.match(shellSource, /selectedNetwork === "ttc" && subwayOperatingState\.status/);
    assert.match(shellSource, /getEstimatedTrainMarkers\(\{ network: selectedNetwork \}\)/);
    assert.match(regionalMapSource, /aria-label="Estimated train markers"/);
  });

  it("does not invent current disruptions in regional fallback mode", () => {
    assert.deepEqual(regionalDashboardData.activeAlerts, []);
    assert.deepEqual(regionalDashboardData.delays, []);
    assert.deepEqual(regionalDashboardData.plannedClosures, []);
    assert.deepEqual(regionalDashboardData.stationNodeImpacts, []);
    assert.ok(regionalDashboardData.networkSegments.every((segment) => segment.overlay === "clear"));
  });

  it("retains route-wide, station-node, and explicit segment overlay plumbing", () => {
    assert.match(regionalLineAlertsSource, /const stationOnlyImpactIds = new Set\(data\.stationNodeImpacts\.map\(\(impact\) => impact\.cardId\)\)/);
    assert.match(regionalLineAlertsSource, /alert\.affectedSegmentIds\.length > 0 \|\| stationOnlyImpactIds\.has\(alert\.id\)/);
    assert.match(regionalGeometrySource, /segment\.guidePathId/);
    assert.match(regionalMapSource, /stationNodeImpacts/);
    assert.match(regionalGeometrySource, /routePolylines\(geometry, segment\.lineId\)/);
    assert.match(regionalGeometrySource, /routeCode === "lw"[\s\S]*regional-route-lw-main-path[\s\S]*regional-route-lw-branch-path/);
    // Geometry is prepared data; no map code reads the live SVG's layout.
    assert.doesNotMatch(regionalMapSource, /getCTM\(\)|getBBox\(\)|getTotalLength\(\)|getPointAtLength\(/);
    assert.doesNotMatch(regionalGeometrySource, /getCTM\(\)|getScreenCTM\(\)|getBBox\(\)|getTotalLength\(\)|querySelector/);
    assert.match(regionalLineAlertsSource, /resolvedRegionalSegmentPath\(geometry, segment\)/);
    assert.match(regionalLineAlertsSource, /regionalOverlayRuns\(pieces\)/);
    assert.match(regionalOverlaysSource, /regionalSegmentsAreAdjacent/);
    assert.match(regionalOverlaysSource, /componentPieces\.map\(\(piece\) => piece\.pathD\.trim\(\)\)\.join\(" "\)/);
    assert.match(regionalLineAlertsSource, /authoredRegionalCorridorPathData/);
  });

  it("keeps the shared KI and UP corridor in geographic order through Mount Dennis", () => {
    assert.deepEqual(REGIONAL_ROUTE_STATIONS.KI.slice(0, 5), [
      "union", "bloor", "mount-dennis", "weston", "etobicoke-north",
    ]);
    assert.deepEqual(REGIONAL_ROUTE_STATIONS.UP, [
      "union", "bloor", "mount-dennis", "weston", "pearson-airport",
    ]);
  });

  it("provides source-honest synthetic scenarios without changing the default fixture", () => {
    const scenario = regionalDashboardDataForScenario("all-impact-types");
    assert.equal(regionalDashboardData.activeAlerts.length, 0);
    assert.equal(scenario.activeAlerts.length, 5);
    assert.equal(scenario.delays.length, 4);
    assert.equal(scenario.plannedClosures.length, 2);
    assert.deepEqual(
      scenario.plannedClosures.find((closure) => closure.id === "regional-station-only-planned")?.previewStationIds,
      ["pickering"],
    );
    assert.equal(scenario.stationNodeImpacts.length, 1);
    assert.equal(scenario.stationNodeImpacts[0].stationId, "bloor");
    assert.equal(scenario.stationNodeImpacts[0].cardId, "regional-demo-bloor-station-delay");
    assert.ok(scenario.networkSegments.some((segment) => (segment.impacts?.length ?? 0) > 0));
    const fullLwImpactSegmentIds = scenario.networkSegments
      .filter((segment) => segment.impacts?.some(
        (impact) => impact.cardId === "regional-demo-lw-corridor-delay"))
      .map((segment) => segment.id);
    assert.equal(fullLwImpactSegmentIds.length, 15);
    assert.ok(fullLwImpactSegmentIds.includes("segment-lw-aldershot-west-harbour"));
    assert.ok(fullLwImpactSegmentIds.includes("segment-lw-aldershot-hamilton"));
    assert.ok(scenario.networkSegments
      .filter((segment) => segment.lineId === "regional-lw")
      .every((segment) => segment.impacts?.filter((impact) => impact.kind === "delay").length === 2));
    assert.ok(scenario.activeAlerts.every((alert) => /Synthetic regional fixture/.test(alert.source)));
  });

  it("adds visible hover, focus, and selection feedback to regional stations", () => {
    // Station hover rings are written by the shared helper, as on TTC.
    assert.match(stationLayersSource, /onPointerEnter=\{\(event\) => \{\s*if \(event\.pointerType === "mouse"\) onHoverChange\(station\.id, true, "pointer"\);/);
    assert.match(stationLayersSource, /onFocus=\{\(\) => onHoverChange\(station\.id, true, "focus"\)\}/);
    assert.match(regionalMapSource, /setMapStationHovered\(rootRef\.current, stationId, hovered\)/);
    assert.match(globalsCss, /\.station-hover-indicator\.active:not\(\[data-station-hover-selected="true"\]\) :is\(circle, rect, ellipse\)/);
    assert.match(stationLayersSource, /className="station-hover-indicator"/);
    // Alert hover is the shared controller's, found by position on both maps:
    // a station ring first, else a line alert, even under a station target.
    assert.match(regionalMapSource, /installMapHoverController\(root, \{/);
    assert.match(hoverControllerSource, /mapStationAlertAtClientPoint\(root, clientX, clientY\) \?\? mapLineAlertAtClientPoint\(root, clientX, clientY\)/);
    assert.match(hoverControllerSource, /ring\.isPointInStroke\(point\.matrixTransform\(screenMatrix\.inverse\(\)\)\)/);
    assert.match(hoverControllerSource, /root\.ownerDocument\.addEventListener\("pointermove", handlePointerMove\)/);
    // Station-name hover comes from the station and name targets themselves.
    assert.match(regionalMapSource, /<MapStationLabelTargets labels=\{stationLabelTargets\} onHoverChange=\{onStationLabelHoverChange\} \/>/);
    assert.doesNotMatch(regionalOverlaysSource, /onLinkedImpactPointerOver/);
    assert.doesNotMatch(regionalOverlaysSource, /onLinkedImpactPointerOut/);
    assert.match(globalsCss, /\.map-impact-hover-foreground\[data-map-impact-hovered="true"\]\s*\{[^}]*display:\s*inline/s);
    assert.match(
      globalsCss,
      /#regional-station-labels-layer :is\(text, tspan\)\s*\{[^}]*pointer-events:\s*none/s,
    );
    assert.match(stationLayersSource, /aria-label=\{`\$\{name\} station details`\}/);
    assert.match(globalsCss, /\.map-selection-attention\s*\{[^}]*--selection-intro-name:\s*none/s);
    // The selected station's marker is a React element placed by its
    // station's prepared transform (junctions keep their authored rotation).
    assert.match(stationLayersSource, /className=\{`station-selection-flash map-selection-attention\$\{introComplete \? " selection-intro-complete" : ""\}`\}/);
    assert.match(stationLayersSource, /<g transform=\{station\.transform \|\| undefined\} pointerEvents="none">/);
    assert.match(regionalMapSource, /<MapStationSelection\s+key=\{selectedStationId \?\? "none"\}/);
  });

  it("uses TTC-derived disruption artwork and selection emphasis at regional map scale", () => {
    // GO/UP draws TTC's line-alert design through the shared layer, scaled by
    // its rail width; its planned-closure impacts draw as previews.
    for (const component of ["MapLineAlertLayer", "MapLineAlertSelection", "MapLineAlertTargets", "MapLineAlertHoverCopies"]) {
      assert.match(regionalMapSource, new RegExp(`<${component}\\b`));
    }
    assert.doesNotMatch(regionalMapSource, /createPortal/);
    assert.match(regionalMapSource, /<MapLineAlertHoverOutlines alerts=\{lineAlerts\} plane=\{overlayPlane\} \/>/);
    assert.match(regionalLineAlertsSource, /case "planned-closure":\s*return "planned-preview";/);
    assert.match(regionalLineAlertsSource, /case "delay":\s*default:\s*return "delay-static";/);
    assert.match(regionalLineAlertsSource, /unit: REGIONAL_OVERLAY_UNIT/);
    assert.match(regionalGeometrySource, /REGIONAL_IMPACT_OVERLAY_WIDTH = 196/);
    assert.doesNotMatch(regionalOverlaysSource, /function regionalImpactGroup|GlyphLane\(/);
    // Alert glyphs rest along the lane, as on TTC; nothing moves.
    assert.doesNotMatch(sharedOverlaySource, /animateMotion/);
    // The hover and selection glow stays out of rendering, and glows never
    // transition filter or stroke-width (a gesture's release would repaint
    // the whole map layer every frame).
    assert.match(globalsCss, /\.interactive-glow\s*\{\s*display:\s*none;/);
    assert.doesNotMatch(globalsCss, /\.asset-alert-path-glow\s*\{[^}]*transition:[^};]*(?:filter|stroke-width|\ball\b)/s);
    assert.doesNotMatch(globalsCss, /regional-impact-(?:aura|path|glow|interactive-glow)/);
  });

  it("exercises the unidirectional regional delay treatment in the authored scenario", () => {
    const scenario = regionalDashboardDataForScenario("all-impact-types");
    const delayImpact = scenario.networkSegments
      .flatMap((segment) => segment.impacts ?? [])
      .find((impact) => impact.kind === "delay");

    assert.equal(delayImpact?.travelDirection, "forward");
    assert.equal(
      scenario.networkSegments.filter((segment) =>
        segment.impacts?.some((impact) => impact.cardId === "regional-demo-delay")
      ).length,
      2,
    );
    // A one-way delay draws TTC's hourglass and arrow lane in its direction.
    assert.match(regionalLineAlertsSource, /travelDirection: run\.impact\.travelDirection/);
    assert.match(sharedOverlaySource, /renderForwardLane \? \(\s*<HourglassGlyphLane/);
  });

  it("reuses the smooth attention-to-breathing lifecycle for every selected regional station and impact", () => {
    assert.doesNotMatch(regionalMapSource, /selectionPulsePhase|data-regional-selection-phase/);
    assert.match(regionalMapSource, /<MapLineAlertSelection[\s\S]*?introComplete=\{selectionIntroComplete\}/);
    assert.match(regionalMapSource, /<MapStationAlertForeground[\s\S]*?introComplete=\{selectionIntroComplete\}/);
    assert.match(globalsCss, /\.map-selection-attention\s*\{[^}]*animation-delay:\s*0s,\s*var\(--selection-intro-duration\)/s);
    assert.match(globalsCss, /\.station-selection-flash\s*\{[^}]*--selection-intro-name:\s*map-selection-station-intro;[^}]*--selection-breathe-name:\s*map-selection-station-breathe;/s);
    assert.match(
      globalsCss,
      /\.asset-alert-path-glow:not\(\.map-selection-attention\):not\(\.interactive-glow\):not\(\.commute-path-preview-glow\)/,
    );
    assert.match(globalsCss, /\.interactive-glow:not\(\.map-selection-attention\)/);
    // Every alert's selection is drawn by the shared layer.
    assert.doesNotMatch(regionalOverlaysSource, /applyImpactSelection|data-regional-impact-selected/);
  });

  it("fits terminal selections to their authored shape and slightly enlarges regular station dots", () => {
    // Sizes: tests/map-station-artwork.test.mjs.
    assert.match(globalsCss, /\.station-selection-flash\s*\{[^}]*fill:\s*var\(--station-selection-accent\);[^}]*stroke:\s*none;/s);
    assert.match(
      globalsCss,
      /\.linewatch-shell\.mobile-performance-mode \.station-selection-flash\s*\{[^}]*animation:\s*none\s*!important;[^}]*filter:\s*none\s*!important;[^}]*opacity:\s*0\.7;[^}]*\}/s,
    );
  });

  it("renders every layered segment impact instead of discarding overlaps", () => {
    assert.match(regionalLineAlertsSource, /for \(const \[impactIndex, impact\] of segment\.impacts\.entries\(\)\)/);
    assert.doesNotMatch(regionalLineAlertsSource, /const impact = segment\.impacts\?\.\[0\]/);
    assert.match(regionalLineAlertsSource, /for \(const run of regionalOverlayRuns\(pieces\)\)/);
    assert.match(regionalGeometrySource, /function continuousRegionalOverlayRunPath\(/);
    assert.match(regionalLineAlertsSource, /continuousRegionalOverlayRunPath\(geometry, run\) \?\? run\.pathD/);
    assert.match(regionalLineAlertsSource, /regionalImpactPriority\(left\.kind\) - regionalImpactPriority\(right\.kind\)/);
    assert.match(regionalOverlaysSource, /case "planned-closure":\s*return 0;[\s\S]*case "reduced-speed-zone":\s*return 1;[\s\S]*case "delay":\s*return 2;[\s\S]*case "suspension":\s*return 3;/);
  });

  it("repaints completed regional selections while hover uses a non-interactive foreground copy", () => {
    // Line alerts draw their selection in the shared layer's emphasis portal;
    // station alerts flash in the shared station-alert foreground.
    assert.match(regionalMapSource, /<g id=\{layerId\("dynamic-selected-segment"\)\} aria-label="Selected disruption emphasis">\s*<MapLineAlertSelection/);
    // Hover copies are <use> references to the alert's artwork, under station
    // artwork; the outline is drawn in the top plane, stopping at Union's pill.
    // A hover copy names its alert; its <use> exists only while hovered (setMapImpactHovered).
    assert.match(sharedOverlaySource, /data-map-hover-copy-href=\{`#\$\{lineAlertVisualId\(plane, alert\)\}`\}/);
    assert.match(overlayHoverSource, /const use = element\.ownerDocument\.createElementNS\(SVG_NAMESPACE, "use"\);/);
    assert.match(overlayHoverSource, /setHoverCopy\(element, hovered\);/);
    assert.match(sharedOverlaySource, /className="map-impact-hover-foreground-layer" pointerEvents="none">/);
    assert.match(regionalLineAlertsSource, /regionalStationPillShape\(geometry, "station-union"\)/);
    // Hover copies sit in the overlay plane under the station artwork; targets
    // are in the interaction plane, line alerts under stations.
    assert.match(regionalMapSource, /className=\{`raster-map-dynamic-plane map-overlay-plane[\s\S]*?<MapLineAlertHoverCopies alerts=\{lineAlerts\} plane=\{overlayPlane\} \/>[\s\S]*?\{renderRasterPlane\("foreground"\)\}/);
    assert.match(regionalMapSource, /<MapLineAlertTargets alerts=\{lineAlerts\} \/>[\s\S]*?<MapStationTargets/);
    assert.match(regionalMapSource, /<g ref=\{previewOutlineLayerRef\} id=\{layerId\("top-hover"\)\} className="map-impact-preview-outline-layer" \/>/);
    // A station alert's hover lights its shared hover priority ring, as on TTC.
    assert.match(regionalMapSource, /hoverControllerRef\.current\?\.setGroupPreview\(/);
    assert.doesNotMatch(regionalOverlaysSource, /setRegionalStationImpactHover|setMapImpactHovered/);
  });

  it("shows and hides GO/UP hover copies without an opacity fade", () => {
    // A fading SVG element gets a GPU layer sized in GO/UP's large SVG units.
    // Chooser rows sliding under the cursor during a zoom would fade copies
    // repeatedly and overflow tile memory, flickering the whole page. Both
    // maps share the hover copies, so neither fades.
    const copyRule = [...globalsCss.matchAll(/(?<![-\w])\.map-impact-hover-foreground\s*\{[^}]*\}/g)]
      .map((match) => match[0])
      .find((rule) => /display:/.test(rule)) ?? "";
    assert.match(copyRule, /display:\s*none/);
    assert.doesNotMatch(copyRule, /transition|opacity/);
    assert.doesNotMatch(globalsCss, /@starting-style\s*\{[^{]*map-impact-hover-foreground/);
  });

  it("hides masked alert outlines in both maps while the map changes scale", () => {
    // Re-rastering corridor-length masks at every zoom step overflowed tile
    // memory on GO/UP. Drags keep the outlines because they do not rescale.
    // Both maps share the outlines and set data-map-camera-moving.
    const css = globalsCss.replace(/\s+/g, " ");
    assert.ok(css.includes(
      ':is([data-map-zoom-active="true"], [data-map-camera-moving="true"]) :is( .map-impact-preview-outline, .map-impact-hover-foreground g[mask] ) { display: none; }',
    ));
    assert.match(regionalMapSource, /flagRootRef: rootRef,/);
  });

  it("scales the existing map raster while zooming instead of re-rastering each step", () => {
    const css = globalsCss.replace(/\s+/g, " ");
    assert.ok(css.includes(
      '.linewatch-shell:not(.mobile-performance-mode) :is( [data-map-zoom-active="true"], [data-map-camera-moving="true"] ) .map-stage { will-change: transform; }',
    ));
    // Drags do not change scale and must not gain a transient layer.
    assert.doesNotMatch(css, /data-map-gesture-active="true"\][^{]*\{ will-change: transform/);
  });

  it("draws station alerts with the shared layer, sized from each station dot", () => {
    // TTC's design (map-overlays/StationAlertOverlays.tsx) in the top plane:
    // ring, beacon and core, then arrows, then selection and hover highlights.
    assert.match(regionalMapSource, /<MapStationAlertRings alerts=\{stationAlerts\}/);
    assert.match(regionalMapSource, /<MapStationDirectionGlyphs glyphs=\{stationDirectionGlyphs\}/);
    assert.match(regionalMapSource, /<MapStationAlertForeground/);
    // TTC's 26-unit core and 24-unit badge on its 32-unit dot.
    assert.match(regionalStationAlertsSource, /const CORE_RATIO = 26 \/ TTC_STATION_DOT_RADIUS;/);
    assert.match(regionalStationAlertsSource, /const DIRECTION_BADGE_RATIO = 24 \/ TTC_STATION_DOT_RADIUS;/);
    assert.match(regionalStationAlertsSource, /regionalStationImpactAnchors\(station, lineId\)/);
    // Union's pill keeps its filled outline in place of a ring and beacon.
    assert.match(regionalStationAlertsSource, /pill: regionalStationPill\(/);
    // Station-only planned closures are station alerts, by TTC's rule.
    assert.match(regionalContentSource, /plannedAdvisoryStationImpacts\(input\.plannedClosures, input\.activeAlerts, input\.delays, input\.selection\)/);
    assert.doesNotMatch(regionalOverlaysSource, /regional-station-impact-(?:beacon-group|fill|direction-glyph)/);
    assert.doesNotMatch(regionalAssetSource, /effectsLayer|stationRingLayer/);
  });

  it("keeps regional disruption rails static while synchronizing remaining effects", () => {
    assert.doesNotMatch(regionalOverlaysSource, /layerIndex \* 0\.4/);
    // GO/UP's remaining pulses run on TTC's shared clock.
    assert.match(regionalMapSource, /useMapPulseSync\(rootRef, \{/);
    assert.match(pulseSyncSource, /SYNCHRONIZED_OVERLAY_PULSE_NAMES/);
    assert.match(pulseSyncSource, /animation\.currentTime = pulsePhaseMs/);
    assert.match(pulseSyncSource, /animation\.startTime = pulseCycleStartMs/);
    assert.doesNotMatch(globalsCss, /\.asset-alert-path\.(?:delay-candy|suspension-candy|delay-static-base|planned-preview)\s*\{[^}]*animation:(?!\s*none)/s);
  });

  it("draws the shared commute preview, with Union's endpoints in its pill shape", () => {
    const regionalCommuteSource = readFileSync(new URL("../src/app/regional-commute-preview.ts", import.meta.url), "utf8");
    const commuteOverlaySource = readFileSync(new URL("../src/components/map-overlays/CommutePreviewOverlays.tsx", import.meta.url), "utf8");
    assert.match(regionalCommuteSource, /pill: regionalStationPill\(geometry, anchorId\)/);
    // A pill's flash swells its outline instead of scaling the whole pill.
    assert.match(commuteOverlaySource, /station-commute-green-flash station-commute-green-flash--pill/);
    assert.match(globalsCss, /@keyframes map-commute-pill-flash/);
  });

  it("selects the regional alert under the pointer", () => {
    // A press picks the station ring under the pointer, else the line alert
    // target it landed on (the topmost, most severe one; TTC's order).
    // The shared tap path (useMapTaps.ts), on both maps.
    assert.match(tapsSource, /export function mapTapTargetAt\(/);
    assert.match(tapsSource, /mapStationAlertAtClientPoint\(root, clientX, clientY\) \?\? mapImpactIdentityOf\(impact\)/);
    assert.match(hoverControllerSource, /if \(!hit \|\| !ring\.classList\.contains\("selected"\)\) return hit;/);
    assert.match(regionalMapSource, /useMapTaps\(\{/);
  });

  it("reuses the TTC overlap indicator for regional same-type and mixed impacts", () => {
    assert.match(regionalGeometrySource, /const REGIONAL_OVERLAP_INDICATOR_SCALE = 2;/);
    assert.match(regionalOverlaysSource, /function regionalOverlapBadgeGroups\(segments: NetworkSegment\[\]\)/);
    assert.match(regionalOverlaysSource, /hasOverlappingImpacts\(impacts\)/);
    assert.match(regionalOverlaysSource, /overlapBadgeSignature\(impacts\)/);
    assert.match(regionalOverlaysSource, /mapOverlapIndicatorSize\(group\.impacts\)/);
    assert.match(regionalMapSource, /aria-label="Overlapping alert badges"/);
    assert.match(regionalMapSource, /<MapOverlapIndicator/);
    assert.match(regionalMapSource, /visualScale=\{badgeScale\}/);
    assert.match(regionalMapSource, /isolatePointerDown/);
    assert.match(regionalMapSource, /setExpandedOverlapBadgeId\(badge\.markerId === expandedOverlapBadgeId \? null : badge\.markerId\)/);
    // The card is placed from data by the shared hook, as on TTC: no DOM measuring,
    // and it keeps the badge's alerts (their hover outlines) uncovered.
    assert.match(regionalMapSource, /useMapOverlapChooser\(\{[\s\S]*?affectedOutlines: expandedOverlapBadge\.affectedOutlines,[\s\S]*?stage,/);
    assert.doesNotMatch(regionalMapSource, /getScreenCTM|regionalOverlapMarkerRestingRect|solveWhenStill/);
    assert.match(regionalMapSource, /setGroupHovered\(badge\.impacts, hovered\)/);
    assert.match(regionalMapSource, /<MapOverlapChooser/);
    assert.match(regionalMapSource, /onHoverImpact=\{hoverChooserImpact\}/);
    assert.match(regionalOverlaysSource, /anchor: placement\.anchor/);
    assert.match(regionalOverlaysSource, /position: placement\.position/);
    assert.doesNotMatch(regionalOverlaysSource, /overlapLayerTransform/);
    assert.doesNotMatch(regionalOverlaysSource, /clampedRootPosition/);
    assert.match(regionalGeometrySource, /const REGIONAL_OVERLAP_INDICATOR_EDGE_GAP = 88/);
    assert.match(regionalGeometrySource, /const renderedBadgeHalfExtent = \(/);
    assert.match(regionalGeometrySource, /REGIONAL_IMPACT_OVERLAY_WIDTH \/ 2[\s\S]*renderedBadgeHalfExtent[\s\S]*REGIONAL_OVERLAP_INDICATOR_EDGE_GAP/);
    // Placement shares TTC's layout; behaviour is covered in regional-overlap-placement.test.mjs.
    assert.match(regionalOverlaysSource, /function regionalPlacedOverlapBadges\(/);
    assert.match(regionalOverlaysSource, /return placeMapOverlapBadges\(\{/);
    assert.doesNotMatch(regionalOverlaysSource, /overlapBadgePositions/);
    assert.doesNotMatch(regionalMapSource, /badge\.position\.x \+ deltaX \* authoredUnitsPerPixel/);
    assert.match(overlapIndicatorSource, /<OverlapKindCountBadge count=\{count\}/);
    assert.match(overlapChooserSource, /<strong>Choose Alert<\/strong>/);
    assert.match(overlapChooserSource, /data-overlap-choice-id=\{impact\.cardId\}/);
    assert.match(overlapChooserSource, /details\?\.closureDateLabel/);
    assert.match(overlapChooserSource, /overlap-chooser-choice-date/);
    // Size, keep-outs and the camera-settle rule come from the shared hook.
    assert.match(regionalMapSource, /impactCount: expandedOverlapBadge\.impacts\.length,/);
  });

  it("supports pointer, wheel, fit-network, and keyboard map interactions", () => {
    assert.match(regionalMapSource, /onWheel=\{onWheel\}/);
    assert.match(regionalMapSource, /\{\.\.\.tapHandlers\}/);
    assert.match(tapsSource, /event\.key !== "Enter" && event\.key !== " "/);
    assert.match(regionalMapSource, /aria-label="(?:Center map view|Fit regional network)"/);
    assert.match(globalsCss, /\.system-map-viewport\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;/s);
    assert.match(globalsCss, /\.map-stage :is\(text, tspan\)[^{]*\{[^}]*user-select:\s*none;/s);
  });

  it("focuses the regional camera on station and impact selections from every UI entry point", () => {
    // preserveCameraOnSelectionClear reaches every map through the shell's props.
    assert.match(networkMapSource, /<RegisteredSystemMap\s+mapId=\{NETWORK_MAPS\[diagramNetwork\]\}\s+\{\.\.\.props\}/);
    assert.doesNotMatch(networkMapSource, /preserveCameraOnSelectionClear=/);
    // GO/UP frames through the shared framing, as TTC does.
    assert.match(regionalMapSource, /useMapFraming\(\{/);
    assert.match(stationLayersSource, /data-map-selected-station-id=\{station\.id\}/);
    assert.match(framingSource, /selectedMapElements\(viewport,/);
    assert.match(framingSource, /getBoundingClientRect\(\)/);
    assert.match(sidebarStateSource, /\.floating-panel-shell/);
    assert.match(framingSource, /insets\.left = Math\.max\(insets\.left, readDesktopLeftOcclusion\(viewport, 24\)\)/);
    assert.match(framingSource, /const selectionFit = computeBoundedMapFrame\(/);
    assert.match(framingSource, /SELECTION_FIT_COMFORT_RATIO = 0\.82/);
    assert.match(framingSource, /computeInsetViewportFocus\(logicalWidth, logicalHeight, insets\)/);
    assert.match(framingSource, /animateTransformTo\(\{ x: focusX - mapX \* scale, y: focusY - mapY \* scale, scale \}, fitScale\)/);
    assert.match(framingSource, /if \(preserveCameraOnSelectionClear\) return;[\s\S]*moveToDefaultCamera\(true, false\)/);
  });

  it("preserves station activation across viewport pointer capture", () => {
    assert.match(tapsSource, /const pressRef = useRef/);
    assert.match(tapsSource, /if \(event\.type !== "pointerup" \|\| shouldSuppressMapClick\(\)\) return;\s*if \(pressed\)/);
    assert.match(tapsSource, /if \(target\.type === "station"\) onSelectStationId\(target\.id\);/);
    assert.doesNotMatch(tapsSource, /\? null : target\.id/);
  });

  it("applies the TTC mobile performance contract to the regional camera and overlays", () => {
    assert.match(networkMapSource, /mobilePerformanceMode=\{props\.mobilePerformanceMode\}/);
    assert.match(regionalMapSource, /mobilePerformanceMode\?:\s*boolean/);
    assert.match(regionalMapSource, /disableProgrammaticMotion: mobilePerformanceMode \|\| !pageVisible/);
    assert.doesNotMatch(regionalMapSource, /const \[isGestureActive, setIsGestureActive\] = useState/);
    assert.match(regionalMapSource, /flagRootRef: rootRef,/);
    assert.match(regionalMapSource, /data-map-gesture-active="false"/);
    assert.match(
      globalsCss,
      /\.linewatch-shell\.mobile-performance-mode \.station-selection-flash\s*\{[^}]*animation:\s*none\s*!important;[^}]*filter:\s*none\s*!important;[^}]*transition:\s*none\s*!important;/s,
    );
  });

  it("centers the largest fitted default desktop network frame in the stable map workspace", () => {
    assert.match(regionalMapSource, /useDesktopMapInsets\(viewportRef, railRef, mapChromeVisible\)/);
    assert.match(framingSource, /measureDesktopMapInsets\(viewport, rail\)/);
    assert.match(sidebarStateSource, /\.desktop-map-legend/);
    assert.match(regionalMapSource, /defaultFrame,/);
    assert.match(
      globalsCss,
      /\.map-stage > div > svg\s*\{[^}]*display:\s*block;[^}]*width:\s*100%;[^}]*height:\s*100%;/s,
    );
    assert.match(regionalMapSource, /mobileZoom: 0\.95 \* 1\.15,/);
    assert.doesNotMatch(regionalMapSource, /REGIONAL_MAP_DESKTOP_VERTICAL_OPTICAL_OFFSET_RATIO/);
  });

  it("matches the TTC map fitted zoom range and button increments", () => {
    // The shared slider spans the shared zoom range on both maps.
    assert.match(regionalMapSource, /<MapZoomSlider cameraStore=\{cameraStore\} fitScale=\{fitScale\} onZoomToScale=\{onZoomToScale\} \/>/);
    assert.match(regionalMapSource, /onClick=\{onZoomIn\}/);
    assert.match(regionalMapSource, /onClick=\{onZoomOut\}/);
  });

  // Plan 09 phase 1b: one camera for every System Map. GO/UP supplies its
  // framing as data; gestures, flights, resize, persistence and commits are
  // usePanZoom's, tested on its own and through TTC.
  it("drives the GO/UP camera with the shared System Map camera, not its own", () => {
    const options = regionalMapSource.match(/\} = usePanZoom\(\{([\s\S]*?)\n  \}\);/)?.[1] ?? "";
    for (const option of [
      "persistenceKey: manifest.id",
      "persistenceBlocked: cameraOwnedBySelection",
      "automaticRefitBlocked: cameraOwnedBySelection",
      "defaultFrame,",
      "cameraFollower: chooserFollower",
      "containerRef: viewportRef",
      "mapRef: stageRef",
    ]) assert.ok(options.includes(option), option);
    assert.match(regionalMapSource, /mobileCenterStationId: "union"/);
    // No second camera: no camera state, transform writer, wheel maths or pinch tracking.
    assert.doesNotMatch(regionalMapSource, /useState<Camera>|setCamera\(|const writeMapTransform|const animateCameraTo|pinchGestureRef|useMapCameraMotion/);
    assert.doesNotMatch(regionalMapSource, /data-regional-map-camera-moving|regionalMapCameraMoving/);
    assert.match(regionalMapSource, /\{\.\.\.tapHandlers\}[\s\S]*onPointerLeave=\{handlePointerLeave\}[\s\S]*onLostPointerCapture=\{handleLostPointerCapture\}/);
  });

  it("keeps the regional camera imperative while preserving TTC camera math", () => {
    assert.match(regionalMapSource, /logicalViewportSize,/);
    assert.doesNotMatch(regionalMapSource, /transform: `translate\(\$\{camera\.x\}/);
    assert.match(regionalMapSource, /transformOrigin: "0 0"/);
    assert.match(regionalAssetSource, /root\.setAttribute\("preserveAspectRatio", "xMidYMid meet"\)/);
    assert.doesNotMatch(regionalMapSource, /root\.setAttribute\("viewBox"/);
  });

  it("keeps the serialized regional SVG mounted while camera state commits", () => {
    assert.match(regionalMapSource, /const AuthoredArtwork = memo\(function AuthoredArtwork/);
    assert.match(regionalMapSource, /<AuthoredArtwork markup=\{artwork\} \/>/);
    assert.doesNotMatch(
      regionalMapSource,
      /<div dangerouslySetInnerHTML=\{\{ __html: svgMarkup \}\}/,
    );
  });

  it("matches TTC's paint-only Center feedback without compositor fade layers", () => {
    assert.doesNotMatch(regionalMapSource, /useMapRecenterFade|RECENTER_FADE_ANIMATION_ID|recenterVeilRef|playRecenterFade/);
    assert.doesNotMatch(regionalMapSource, /startViewTransition|regionalRecenterTransition|MapViewTransition/);
    assert.doesNotMatch(globalsCss, /regional-map-recenter-fade-in|data-regional-recenter-transition|view-transition-name:\s*regional-map-recenter/);
    assert.doesNotMatch(globalsCss, /map-recenter-veil|data-map-recenter-effect/);
    // Center is the shared camera's snap with feedback (usePanZoom recenterWithFeedback).
    assert.match(regionalMapSource, /onRecenter=\{recenterWithFeedback\}/);
    assert.match(panZoomSource, /if \(recenter\(\) && !reducedMotion\) \{\s*setRecenterFeedbackKey/);
    assert.match(regionalMapSource, /className="map-center-feedback"[\s\S]*data-map-center-feedback=\{manifest\.id\}/);
    assert.match(globalsCss, /\.map-center-feedback\s*\{[^}]*background-color:\s*transparent;[^}]*animation:\s*map-center-feedback-fade/s);
    assert.doesNotMatch(globalsCss, /\.map-center-feedback\s*\{[^}]*(?:opacity|will-change):/s);
    assert.match(globalsCss, /mobile-performance-mode \.map-stage\s*\{[^}]*will-change:\s*auto/s);
    assert.doesNotMatch(globalsCss, /\.regional-map-stage\s*\{[^}]*will-change:\s*opacity/s);
    assert.doesNotMatch(regionalMapSource, /className="regional-map-scene"/);
    assert.doesNotMatch(regionalMapSource, /RECENTER_CAMERA_MOTION/);
  });

  it("animates regional camera scale without compositor-layer churn", () => {
    assert.doesNotMatch(globalsCss, /\.regional-map-camera-moving \.regional-map-stage[^{]*\{[^}]*will-change:\s*transform/s);
    assert.doesNotMatch(globalsCss, /\.regional-map-camera-moving \.regional-map-stage[^{]*\{[^}]*backface-visibility:/s);
  });

  it("preserves regional overlay glows while user zoom is active", () => {
    assert.match(regionalMapSource, /flagRootRef: rootRef,/);
    assert.match(globalsCss, /\[data-map-zoom-active="true"\]/);
  });

  it("keeps animated regional alert artwork stable while the camera is moving", () => {
    assert.match(regionalMapSource, /const rootRef = useRef<HTMLElement>\(null\)/);
    assert.doesNotMatch(regionalMapSource, /root\.classList\.toggle\("regional-map-camera-moving", active\)/);
    assert.doesNotMatch(regionalMapSource, /\.pauseAnimations\(\)/);
    assert.doesNotMatch(regionalMapSource, /\.unpauseAnimations\(\)/);
    assert.match(
      globalsCss,
      /\[data-map-camera-moving="true"\] \.map-stage :is\([\s\S]*?\.station-impact-dot-red-glow[\s\S]*?animation-play-state:\s*paused\s*!important;[\s\S]*?transition:\s*none\s*!important;/s,
    );
    // Shared line alerts pause through the shared camera-moving flag.
    assert.match(regionalMapSource, /flagRootRef: rootRef,/);
    assert.match(globalsCss, /\[data-map-camera-moving="true"\] \.asset-alert-path\.delay-candy/);
    assert.doesNotMatch(globalsCss, /\.regional-map-camera-moving \.regional-map-stage \*/);
    const cameraMotionSimplification = globalsCss.slice(
      globalsCss.indexOf('[data-map-camera-moving="true"] .map-stage :is('),
      globalsCss.indexOf(".map-stage > svg,"),
    );
    assert.doesNotMatch(cameraMotionSimplification, /regional-impact-interactive-glow/);
    assert.doesNotMatch(
      cameraMotionSimplification,
      /regional-(?:delay|suspension|chevron|planned-closure)-glyph-lane/,
    );
    assert.doesNotMatch(cameraMotionSimplification, /display:\s*none\s*!important/);
    assert.doesNotMatch(cameraMotionSimplification, /filter:\s*none\s*!important/);
    assert.doesNotMatch(cameraMotionSimplification, /regional-station-selected-indicator/);
  });

  it("keeps the authored regional SVG mounted while refreshing isolated dynamic layers", () => {
    assert.equal((regionalMapSource.match(/setArtwork\(/g) ?? []).length, 1);
    // The artwork loads once (app/map-artwork.ts); overlays are React layers beside it.
    assert.match(regionalMapSource, /preloadMapArtwork\(map\.artwork\)\.then\(\(markup\) => \{\s*if \(!cancelled && markup\) setArtwork\(markup\);/);
    assert.match(regionalAssetSource, /preloadMapArtwork\(\{ url: source, prepare: prepareRegionalMapMarkup \}\)/);
    assert.doesNotMatch(regionalOverlaysSource, /Layer\.replaceChildren\(\)/);
    assert.doesNotMatch(regionalMapSource, /mapStageRef\.current\.replaceChildren/);
    assert.match(regionalAssetSource, /element\.style\.removeProperty\("shape-rendering"\)/);
    assert.match(sharedOverlaySource, /data-selected-commute-impact-overlay=\{alert\.impactId\}/);
    assert.match(globalsCss, /\[data-selected-commute-impact-overlay\] \.asset-alert-path-glow\s*\{\s*display:\s*none;/);
  });

  it("keeps React from overwriting the imperative regional camera transform", () => {
    const stageBlock = regionalMapSource.match(
      /ref=\{stageRef\}[\s\S]*?<AuthoredArtwork markup=\{artwork\}/,
    )?.[0] ?? "";
    assert.doesNotMatch(stageBlock, /transform:\s*`translate\(\$\{camera\.x\}/);
    assert.match(regionalMapSource, /mapRef: stageRef/);
  });

  it("does not run regional SVG hover geometry hit-testing during drag or pinch", () => {
    assert.match(regionalMapSource, /isPointerGestureActive: isGestureActive,/);
  });

  it("refits an untouched camera on resize and preserves a user-adjusted camera", () => {
    // The map's own observer only places the camera; usePanZoom reconciles
    // resizes, refitting only a camera no rider or selection has moved.
    const resizeObserverBody = regionalMapSource.match(/const observer = new ResizeObserver\(\(\) => \{([\s\S]*?)\n    \}\);/)?.[1] ?? "";
    assert.match(resizeObserverBody, /placeCamera\(\)/);
    assert.match(regionalMapSource, /automaticRefitBlocked: cameraOwnedBySelection/);
    assert.match(panZoomSource, /const isUntouched = !cameraAdjustedByUserRef\.current\s*&& !automaticRefitBlockedRef\.current/);
  });
  it("does not replay a stale recenter command after a remount or refresh", () => {
    // Both maps hand their toolbar signals to the shared, edge-triggered commands.
    assert.match(framingSource, /const lastSignalRef = useRef\(signal\);/);
    assert.match(framingSource, /signal === lastSignalRef\.current/);
    for (const mapSource of [regionalMapSource, ttcMapSource]) {
      assert.match(mapSource, /recenterSignal,\n    zoomInSignal,\n    zoomOutSignal,\n  \}\);/);
    }
  });

  it("does not refit an initialized camera when refreshed dashboard data updates dynamic layers", () => {
    assert.match(regionalMapSource, /if \(!artwork \|\| readyNotifiedRef\.current\) return;/);
    assert.match(regionalMapSource, /\} else if \(!isCameraInitialized\(\)\) \{/);
  });

  it("renders regional transit line colors across the top accent strip in GO/UP mode", () => {
    assert.match(globalsCss, /\.linewatch-transit-accent-strip--regional/);
    assert.match(globalsCss, /\.linewatch-shell\[data-network="regional"\] \.linewatch-transit-accent-strip/);
    assert.match(globalsCss, /grid-template-columns:\s*repeat\(8, 1fr\)/);
    // Barrie, Kitchener, Lakeshore East, Lakeshore West, Milton, Richmond Hill, Stouffville, UP Express
    assert.match(globalsCss, /#155ba0/);
    assert.match(globalsCss, /#138336/);
    assert.match(globalsCss, /#ee2722/);
    assert.match(globalsCss, /#8b0a31/);
    assert.match(globalsCss, /#f47216/);
    assert.match(globalsCss, /#27adea/);
    assert.match(globalsCss, /#774111/);
    assert.match(globalsCss, /#4084cd/);
    assert.match(shellSource, /selectedNetwork === "regional" \? " linewatch-transit-accent-strip--regional" : ""/);
    assert.match(globalsCss, /\.linewatch-shell\[data-network="regional"\] \.floating-panel-scroll::before\s*\{[\s\S]*?linear-gradient\([\s\S]*?#155ba0[\s\S]*?#4084cd/);
  });
});
