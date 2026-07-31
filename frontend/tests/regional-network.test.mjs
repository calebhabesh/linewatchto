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

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const networkSelectorSource = readFileSync(new URL("../src/components/NetworkSelector.tsx", import.meta.url), "utf8");
const defaultMapModeSource = readFileSync(new URL("../src/components/DefaultMapModeControl.tsx", import.meta.url), "utf8");
const mobileMoreSource = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");
const mobileLegendSource = readFileSync(new URL("../src/components/MobileLegend.tsx", import.meta.url), "utf8");
const networkMapSource = readFileSync(new URL("../src/components/NetworkMap.tsx", import.meta.url), "utf8");
const networkMapLegendsSource = readFileSync(new URL("../src/components/NetworkMapLegends.tsx", import.meta.url), "utf8");
const regionalMapSource = readFileSync(new URL("../src/components/InteractiveRegionalMap.tsx", import.meta.url), "utf8");
const overlapIndicatorSource = readFileSync(new URL("../src/components/MapOverlapIndicator.tsx", import.meta.url), "utf8");
const overlapChooserSource = readFileSync(new URL("../src/components/MapOverlapChooser.tsx", import.meta.url), "utf8");
const regionalStationDetailSource = readFileSync(new URL("../src/components/RegionalStationDetailPanel.tsx", import.meta.url), "utf8");
const stationDetailHeaderSource = readFileSync(new URL("../src/components/StationDetailHeader.tsx", import.meta.url), "utf8");
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
      /\.linewatch-shell\[data-network="regional"\] \.mobile-train-toggle,[\s\S]*\.mobile-train-toggle--regional\s*\{[\s\S]*220px \+ 12px\)/,
    );
    assert.match(
      globalsCss,
      /\.linewatch-shell\[data-network="regional"\] \.mobile-train-toggle--announcement,[\s\S]*\.mobile-train-toggle--regional\.mobile-train-toggle--announcement\s*\{[\s\S]*var\(--mobile-regional-announcement-chip-height\)[\s\S]*220px \+ 12px\)/,
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
    assert.match(regionalMapSource, /setMapTransition\("none"\)/);
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
      delays: [],
      reducedSpeedZones: [],
      plannedClosures: [],
      performance: regionalDashboardData.ttcPerformance,
    });
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
    assert.equal(expectedSegmentCount, 75);
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
      REGIONAL_ROUTE_LINKS.LW.slice(-6),
      [
        ["aldershot", "west-harbour"],
        ["aldershot", "hamilton"],
        ["west-harbour", "hamilton"],
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
        ["west-harbour", "hamilton"],
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
    assert.match(regionalStationDetailSource, /transitLineBadgeColors\(route\.id\)/);
    assert.match(regionalStationDetailSource, /transitLineBadgeColors\(line\.id\)/);
    assert.match(regionalStationDetailSource, /data-station-header-line-details/);
    assert.match(regionalStationDetailSource, /data-station-section="arrivals"/);
    assert.match(regionalStationDetailSource, /Checking Metrolinx arrivals/);
    assert.match(regionalStationDetailSource, /Regional arrivals unavailable/);
    assert.match(regionalStationDetailSource, /Published regional schedule/);
    assert.match(regionalStationDetailSource, /"Mixed"/);
    assert.match(regionalStationDetailSource, /Arrival Data Unavailable/);
    assert.match(regionalStationDetailSource, /Upcoming regional train arrivals/);
    assert.match(regionalStationDetailSource, /groupRegionalStationArrivals/);
    assert.match(regionalStationDetailSource, /data-regional-arrival-direction/);
    assert.match(regionalStationDetailSource, /data-regional-arrival-platform/);
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
    assert.doesNotMatch(regionalStationDetailSource, /Accessibility and platform-condition details are unavailable/);
    assert.match(regionalStationDetailSource, /wheel-chair-symbol/);
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

  it("keeps network-specific closed-hours behavior and enables regional train markers", () => {
    assert.match(shellSource, /selectedNetwork === "ttc" && subwayOperatingState\.status/);
    assert.match(shellSource, /getEstimatedTrainMarkers\(\{ network: selectedNetwork \}\)/);
    assert.match(regionalMapSource, /Estimated regional train markers/);
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
    assert.match(regionalMapSource, /const stationOnlyImpactIds = new Set\(stationNodeImpacts\.map\(\(impact\) => impact\.cardId\)\)/);
    assert.match(regionalMapSource, /item\.affectedSegmentIds\.length === 0 && !stationOnlyImpactIds\.has\(item\.id\)/);
    assert.match(regionalMapSource, /segment\.guidePathId/);
    assert.match(regionalMapSource, /stationNodeImpacts/);
    assert.match(regionalMapSource, /corridorSegmentPath\(documentNode, segment\)/);
    assert.match(regionalMapSource, /regionalRoutePathIds\(segment\.lineId\)/);
    assert.match(regionalMapSource, /routeCode === "lw"[\s\S]*regional-route-lw-main-path[\s\S]*regional-route-lw-branch-path/);
    assert.match(regionalMapSource, /pointInSvgRootCoordinates\(source, point\)/);
    assert.match(regionalMapSource, /pointFromSvgRootCoordinates\([\s\S]*stationsLayer/);
    assert.doesNotMatch(regionalMapSource, /source\.getCTM\(\)/);
    assert.match(regionalMapSource, /connection\.gapSquared > 4/);
    assert.match(regionalMapSource, /resolvedRegionalSegmentPath\(documentNode, segment\)/);
    assert.match(regionalMapSource, /regionalOverlayRuns\(overlayPieces\)/);
    assert.match(regionalMapSource, /regionalSegmentsAreAdjacent/);
    assert.match(regionalMapSource, /componentPieces\.map\(\(piece\) => piece\.pathD\.trim\(\)\)\.join\(" "\)/);
    assert.match(regionalMapSource, /authoredRegionalCorridorPathData/);
    assert.match(regionalMapSource, /group\.dataset\.regionalImpactSegmentCount = String\(segmentCount\)/);
  });

  it("keeps the shared KI and UP corridor in geographic order through Mount Dennis", () => {
    assert.deepEqual(REGIONAL_ROUTE_STATIONS.KI.slice(0, 5), [
      "union", "bloor", "mount-dennis", "weston", "etobicoke-north",
    ]);
    assert.deepEqual(REGIONAL_ROUTE_STATIONS.UP, [
      "union", "bloor", "mount-dennis", "weston", "pearson-airport",
    ]);
    assert.match(regionalMapSource, /pointInRegionalStationsLayer/);
    assert.match(regionalMapSource, /anchor\.matches\("circle, ellipse"\)/);
    assert.match(regionalMapSource, /operation === "rotate"/);
    assert.match(regionalMapSource, /operation === "translate"/);
  });

  it("provides source-honest synthetic scenarios without changing the default fixture", () => {
    const scenario = regionalDashboardDataForScenario("all-impact-types");
    assert.equal(regionalDashboardData.activeAlerts.length, 0);
    assert.equal(scenario.activeAlerts.length, 5);
    assert.equal(scenario.delays.length, 4);
    assert.equal(scenario.plannedClosures.length, 1);
    assert.equal(scenario.stationNodeImpacts.length, 1);
    assert.equal(scenario.stationNodeImpacts[0].stationId, "bloor");
    assert.equal(scenario.stationNodeImpacts[0].cardId, "regional-demo-bloor-station-delay");
    assert.ok(scenario.networkSegments.some((segment) => (segment.impacts?.length ?? 0) > 0));
    const fullLwImpactSegmentIds = scenario.networkSegments
      .filter((segment) => segment.impacts?.some(
        (impact) => impact.cardId === "regional-demo-lw-corridor-delay"))
      .map((segment) => segment.id);
    assert.equal(fullLwImpactSegmentIds.length, 16);
    assert.ok(fullLwImpactSegmentIds.includes("segment-lw-aldershot-west-harbour"));
    assert.ok(fullLwImpactSegmentIds.includes("segment-lw-aldershot-hamilton"));
    assert.ok(fullLwImpactSegmentIds.includes("segment-lw-west-harbour-hamilton"));
    assert.ok(scenario.networkSegments
      .filter((segment) => segment.lineId === "regional-lw")
      .every((segment) => segment.impacts?.filter((impact) => impact.kind === "delay").length === 2));
    assert.ok(scenario.activeAlerts.every((alert) => /Synthetic regional fixture/.test(alert.source)));
  });

  it("adds visible hover, focus, and selection feedback to regional stations", () => {
    assert.match(globalsCss, /\.regional-station-hit-target:hover \+ \.regional-station-hover-indicator/);
    assert.match(globalsCss, /\.regional-station-hit-target:focus-visible \+ \.regional-station-hover-indicator/);
    assert.match(regionalMapSource, /"station-hover-indicator", "regional-station-hover-indicator"/);
    assert.match(regionalMapSource, /stationId === "union" \? 75/);
    assert.match(regionalMapSource, /"station-selected-indicator", "regional-station-selected-indicator"/);
    assert.match(regionalMapSource, /"map-segment-hit-target", "regional-impact-hit-target"/);
    assert.match(regionalMapSource, /"asset-alert-path-hover-boundary", visualState, "regional-impact-hover-boundary"/);
    assert.match(regionalMapSource, /setLinkedImpactHover/);
    assert.match(regionalMapSource, /data-regional-impact-hovered/);
    assert.match(regionalMapSource, /function regionalSegmentImpactAtClientPoint\(/);
    assert.match(regionalMapSource, /function regionalStationImpactAtClientPoint\(/);
    assert.match(regionalMapSource, /hitTarget\.isPointInStroke\(point\.matrixTransform\(screenMatrix\.inverse\(\)\)\)/);
    assert.match(regionalMapSource, /document\.addEventListener\("pointermove", handlePointerMove\)/);
    assert.doesNotMatch(regionalMapSource, /document\.addEventListener\("pointerover"/);
    assert.doesNotMatch(regionalMapSource, /document\.addEventListener\("pointerout"/);
    assert.doesNotMatch(regionalMapSource, /onLinkedImpactPointerOver/);
    assert.doesNotMatch(regionalMapSource, /onLinkedImpactPointerOut/);
    assert.match(globalsCss, /data-regional-impact-hovered="true"[^}]*regional-impact-hover-boundary/);
    assert.match(
      globalsCss,
      /#regional-station-labels-layer :is\(text, tspan\)\s*\{[^}]*pointer-events:\s*none/s,
    );
    assert.match(regionalMapSource, /createElementNS\(SVG_NAMESPACE, "title"\)/);
    assert.match(globalsCss, /\.map-selection-attention\s*\{[^}]*--selection-intro-name:\s*none/s);
    assert.match(regionalMapSource, /"map-selection-attention", "station-selected-indicator", "regional-station-selected-indicator"/);
  });

  it("uses TTC-derived disruption motion and selection emphasis at regional map scale", () => {
    assert.match(regionalMapSource, /function regionalImpactVisualState\(kind: ImpactKind\)/);
    assert.match(regionalMapSource, /return "delay-static"/);
    assert.match(regionalMapSource, /"regional-impact-aura"/);
    assert.match(regionalMapSource, /"regional-impact-interactive-glow"/);
    assert.match(regionalMapSource, /visiblePath\.classList\.add\("delay-static-base"\)/);
    assert.match(regionalMapSource, /regionalDelayGlyphLane\(documentNode, sourcePath, travelDirection, reducedMotion\)/);
    assert.match(regionalMapSource, /lane\.dataset\.regionalDelayDirection = travelDirection/);
    assert.match(regionalMapSource, /travelDirection === "bidirectional" \|\| index % 2 === 0/);
    assert.match(regionalMapSource, /REGIONAL_IMPACT_OVERLAY_WIDTH = 196/);
    assert.match(regionalMapSource, /REGIONAL_IMPACT_HIT_TARGET_WIDTH = REGIONAL_IMPACT_OVERLAY_WIDTH \+ 169/);
    assert.match(regionalMapSource, /REGIONAL_DELAY_GLYPH_SPACING = 96/);
    assert.match(regionalMapSource, /travelDirection === "bidirectional"[\s\S]*REGIONAL_DELAY_GLYPH_SPACING \* 1\.3[\s\S]*Math\.floor\(length \/ glyphSpacing\)/);
    assert.match(regionalMapSource, /REGIONAL_DELAY_TRAVEL_UNITS_PER_SECOND = \(160 \/ 12\) \* \(175 \/ 102\)/);
    assert.match(regionalMapSource, /travelDirection === "bidirectional" \|\| !pathD/);
    assert.match(regionalMapSource, /createElementNS\(SVG_NAMESPACE, "animateMotion"\)/);
    assert.match(regionalMapSource, /impact\.travelDirection/);
    assert.match(globalsCss, /data-regional-impact-kind="delay"[\s\S]*stroke:\s*#0ea5e9[\s\S]*stroke-width:\s*var\(--regional-impact-width\)/);
    assert.doesNotMatch(globalsCss, /regional-delay-static-shift/);
    assert.match(globalsCss, /data-regional-impact-kind="reduced-speed-zone"[\s\S]*regional-chevron-slide/);
    assert.match(globalsCss, /\.regional-impact-aura\s*\{[^}]*animation:\s*aura-pulse 1\.2s infinite alternate ease-in-out;[^}]*animation-delay:\s*var\(--map-pulse-offset\)/s);
    assert.match(globalsCss, /regional-overlay-segment-group:not\(\[data-regional-impact-selected="true"\]\)[^}]*regional-impact-interactive-glow\s*\{[^}]*animation:\s*none\s*!important/s);
    assert.match(globalsCss, /regional-overlay-segment-group:not\(\[data-regional-impact-selected="true"\]\)[^}]*regional-impact-interactive-glow\s*\{[^}]*opacity:\s*0\s*!important/s);
    assert.match(globalsCss, /data-regional-impact-kind="suspension"[\s\S]*regional-candy-pulse/);
    assert.match(globalsCss, /@keyframes regional-candy-pulse\s*\{[\s\S]*calc\(var\(--regional-impact-width\) \+ 23px\)/);
    assert.match(globalsCss, /regional-impact-hit-target:active[\s\S]*regional-impact-glow/);
    assert.match(globalsCss, /regional-impact-hit-target\s*\{[^}]*stroke-width:\s*var\(--regional-impact-hit-target-width\)/s);
    assert.match(globalsCss, /regional-impact-width\) \+ 169px/);
    assert.match(globalsCss, /data-regional-impact-kind="planned-closure"[\s\S]*regional-impact-aura[\s\S]*display:\s*none/);
    assert.match(globalsCss, /data-regional-impact-selected="true"[\s\S]*regional-impact-interactive-glow[\s\S]*regional-selection-path-intro/);
    assert.match(globalsCss, /regional-impact-interactive-glow\s*\{[^}]*filter:\s*drop-shadow\(0 0 12px/s);
    assert.doesNotMatch(globalsCss, /regional-impact-interactive-glow\s*\{[^}]*filter:\s*blur/s);
    assert.match(globalsCss, /\.motion-paused \.regional-impact-aura/);
    assert.match(globalsCss, /prefers-reduced-motion:\s*reduce[\s\S]*\.regional-impact-aura/);
    assert.match(regionalMapSource, /function appendRegionalSuspensionGlyph\([\s\S]*?const scale = 4\.2;/);
    assert.match(regionalMapSource, /const glyphSpacing = travelDirection === "bidirectional" \? 165 : 145;/);
    assert.match(regionalMapSource, /function appendRegionalPlannedClosureGlyph\([\s\S]*?const scale = 6;/);
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
    assert.match(regionalMapSource, /`regional-delay-glyph--\$\{kind\}`/);
    assert.match(regionalMapSource, /kind: "hourglass" \| "arrow"/);
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
    assert.match(regionalMapSource, /element\.after\(selectedIndicatorContainer \?\? selectedIndicator\)/);
    assert.match(regionalMapSource, /selectedIndicator\.removeAttribute\("transform"\)/);
    assert.match(regionalMapSource, /selectedIndicatorContainer\?\.setAttribute\("transform", authoredTransform\)/);
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
    assert.match(regionalMapSource, /const orderedOverlayRuns = regionalOverlayRuns\(overlayPieces\)\.sort/);
    assert.match(regionalMapSource, /function continuousRegionalOverlayRunPath\(/);
    assert.match(regionalMapSource, /continuousRegionalOverlayRunPath\(documentNode, run\) \?\? run\.pathD/);
    assert.match(regionalMapSource, /regionalImpactPriority\(left\.impact\.kind\) - regionalImpactPriority\(right\.impact\.kind\)/);
    assert.match(regionalMapSource, /case "delay":\s*return 0;[\s\S]*case "planned-closure":\s*return 2;[\s\S]*case "suspension":\s*return 3;/);
    assert.match(regionalMapSource, /`\$\{REGIONAL_IMPACT_OVERLAY_WIDTH\}px`/);
    assert.doesNotMatch(regionalMapSource, /REGIONAL_IMPACT_OVERLAY_WIDTH - layerIndex/);
  });

  it("repaints completed regional selections while hover uses a non-interactive foreground copy", () => {
    assert.match(regionalMapSource, /function bringRegionalImpactToFront\(/);
    assert.match(regionalMapSource, /element\.parentElement\?\.append\(element\)/);
    assert.match(regionalMapSource, /bringRegionalImpactToFront\(root, selection\.kind, selection\.id\)/);
    assert.match(regionalMapSource, /bringRegionalStationImpactToFront\(root, selection\.kind, selection\.id\)/);
    assert.match(regionalMapSource, /function setRegionalImpactHoverForeground\(/);
    assert.match(regionalMapSource, /regional-impact-hover-foreground-layer/);
    assert.match(regionalMapSource, /regionalSegmentHoverForeground\(source, index\)/);
    assert.doesNotMatch(regionalMapSource, /regionalStationHoverForeground\(source\)/);
    assert.match(regionalMapSource, /function setRegionalStationImpactHover\(/);
    assert.match(regionalMapSource, /indicator\.dataset\.regionalStationImpactHovered = "true"/);
    assert.match(globalsCss, /regional-station-hover-indicator\[data-regional-station-impact-hovered="true"\]/);
    assert.doesNotMatch(globalsCss, /regional-station-impact-ring\[data-regional-impact-hovered="true"\][\s\S]*regional-station-impact-width\) \+ 12px/);
    assert.match(regionalMapSource, /foreground\.dataset\.regionalImpactHovered = "true"/);
    assert.match(regionalMapSource, /if \(!element\.classList\.contains\("regional-impact-hover-boundary"\)\) element\.remove\(\)/);
    assert.match(regionalMapSource, /REGIONAL_HIGHLIGHT_OUTLINE_WIDTH = REGIONAL_IMPACT_OVERLAY_WIDTH \+ 38/);
    assert.match(regionalMapSource, /REGIONAL_HIGHLIGHT_INNER_WIDTH = REGIONAL_IMPACT_OVERLAY_WIDTH/);
    assert.match(regionalMapSource, /maskStroke\("white", REGIONAL_HIGHLIGHT_OUTLINE_WIDTH\)/);
    assert.match(regionalMapSource, /maskStroke\("black", REGIONAL_HIGHLIGHT_INNER_WIDTH\)/);
    assert.match(regionalMapSource, /function regionalHoverMaskBounds\(source: SVGElement\)/);
    assert.match(regionalMapSource, /pointFromSvgRootCoordinates\(source, point\)/);
    assert.match(regionalMapSource, /mask\.setAttribute\("x", String\(maskBounds\.x\)\)/);
    assert.match(regionalMapSource, /background\.setAttribute\("x", String\(maskBounds\.x\)\)/);
    assert.match(regionalMapSource, /boundary\.setAttribute\("mask", `url\(#\$\{maskId\}\)`\)/);
    assert.match(regionalMapSource, /regional-impact-interactive-glow"\)[\s\S]*setAttribute\("mask", `url\(#\$\{maskId\}\)`\)/);
    assert.match(globalsCss, /data-regional-impact-selected="true"\] \.regional-impact-interactive-glow\s*\{[^}]*stroke:\s*rgba\(248, 250, 252, 0\.98\)/s);
    assert.match(regionalMapSource, /foreground\.querySelectorAll\("title"\)/);
    assert.match(globalsCss, /regional-impact-hover-foreground\[data-regional-impact-hovered="true"\] \.regional-impact-hover-boundary/);
    assert.match(globalsCss, /not\(\.regional-impact-hover-foreground\):has\(\.regional-impact-hit-target:hover\) \.regional-impact-hover-boundary[\s\S]*opacity:\s*0\s*!important/s);
    assert.doesNotMatch(regionalMapSource, /foreground\.remove\(\)/);
    assert.doesNotMatch(regionalMapSource, /segmentLayer\.append\(foreground\)/);
  });

  it("keeps station-specific alert arrows and radar beacons inside station dots", () => {
    assert.match(regionalMapSource, /regional-station-impact-beacon-group/);
    assert.match(regionalMapSource, /station-impact-dot-red-glow/);
    assert.match(regionalMapSource, /station-impact-dot-red-ping/);
    assert.match(regionalMapSource, /station-impact-dot-red-beacon/);
    assert.match(regionalMapSource, /regional-station-impact-direction-glyph/);
    assert.match(regionalMapSource, /station-impact-direction-badge/);
    assert.match(regionalMapSource, /station-impact-direction-arrow/);
    assert.match(regionalMapSource, /REGIONAL_STATION_IMPACT_EFFECT_RADIUS_RATIO = 0\.9/);
    assert.match(regionalMapSource, /REGIONAL_STATION_IMPACT_BADGE_RADIUS_RATIO = 0\.72/);
    assert.match(regionalMapSource, /badgeRadius = stationDotRadius \* REGIONAL_STATION_IMPACT_BADGE_RADIUS_RATIO/);
    assert.match(globalsCss, /\.regional-station-impact-ring\s*\{[\s\S]*stroke:\s*transparent/);
    assert.match(regionalMapSource, /stationImpactBeaconLayer\.append\(beaconGroup\)/);
    assert.match(regionalMapSource, /stationImpactDirectionLayer\.append\(glyphGroup\)/);
    assert.match(regionalMapSource, /effectsLayer\.append\(stationImpactBeaconLayer, stationImpactDirectionLayer\)/);
    assert.match(regionalMapSource, /regionalStationImpactAnchors\(stationVisual, impactDirection\?\.lineId\)/);
    assert.match(regionalMapSource, /shape\.id\.endsWith\(`-\$\{routeCode\}`\)/);
    assert.match(regionalMapSource, /stationsLayer\.append\(effectsLayer\)/);
  });

  it("keeps every regional disruption pulse on one shared phase", () => {
    assert.match(regionalMapSource, /--regional-map-pulse-offset", "0s"/);
    assert.match(regionalMapSource, /--map-pulse-offset", "0s"/);
    assert.doesNotMatch(regionalMapSource, /layerIndex \* 0\.4/);
  });

  it("cycles pointer activation through overlapping regional segment and station impacts", () => {
    assert.match(regionalMapSource, /function nextRegionalPointerImpactSelection\(/);
    assert.match(regionalMapSource, /group\.dataset\.regionalImpactSegmentIds = segmentIds\.join\(","\)/);
    assert.match(regionalMapSource, /data-regional-station-impact-station-id/);
    assert.match(regionalMapSource, /regionalImpactPriority\(left\.kind\) - regionalImpactPriority\(right\.kind\)/);
    assert.match(regionalMapSource, /nextRegionalPointerImpactSelection\([\s\S]*event\.currentTarget,[\s\S]*impact,[\s\S]*selection/);
  });

  it("reuses the TTC overlap indicator for regional same-type and mixed impacts", () => {
    assert.match(regionalMapSource, /function regionalOverlapBadgeGroups\(segments: NetworkSegment\[\]\)/);
    assert.match(regionalMapSource, /hasOverlappingImpacts\(impacts\)/);
    assert.match(regionalMapSource, /overlapBadgeSignature\(impacts\)/);
    assert.match(regionalMapSource, /mapOverlapIndicatorSize\(group\.impacts\)/);
    assert.match(regionalMapSource, /aria-label="Overlapping alert badges"/);
    assert.match(regionalMapSource, /<MapOverlapIndicator/);
    assert.match(regionalMapSource, /visualScale=\{REGIONAL_OVERLAP_INDICATOR_SCALE\}/);
    assert.match(regionalMapSource, /isolatePointerDown/);
    assert.match(regionalMapSource, /openRegionalOverlapChooser\(badge\)/);
    assert.match(regionalMapSource, /candidate\.dataset\.overlapSegmentId === markerId/);
    assert.match(regionalMapSource, /function regionalOverlapChooserLayout\(/);
    assert.match(regionalMapSource, /const REGIONAL_OVERLAP_CHOOSER_GAP = 24/);
    assert.match(regionalMapSource, /markerCenter\.x - alertAnchor\.x/);
    assert.match(regionalMapSource, /function regionalReferencedAlertCollisionBoxes\(/);
    assert.match(regionalMapSource, /identityKeys\.has\(`\$\{kind\}:\$\{id\}`\)/);
    assert.match(regionalMapSource, /alertCollisionBoxes:\s*regionalReferencedAlertCollisionBoxes\(/);
    assert.match(regionalMapSource, /const preferredCenter = centerForDirection\(outward\)/);
    assert.match(regionalMapSource, /const angleOffsets = Array\.from\(\{ length: 24 \}/);
    assert.match(regionalMapSource, /const distanceScales = \[1, 1\.25, 1\.55, 1\.9, 2\.3\]/);
    assert.match(regionalMapSource, /alertOverlapArea \* 1_000_000[\s\S]*markerOverlapArea \* 1_000_000/);
    assert.match(regionalMapSource, /anchorPoint\.matrixTransform\(screenMatrix\)/);
    assert.match(regionalMapSource, /setRegionalOverlapImpactsHovered\(badge\.impacts, hovered\)/);
    assert.match(regionalMapSource, /<MapOverlapChooser/);
    assert.match(regionalMapSource, /onHoverImpact=\{hoverRegionalChooserImpact\}/);
    assert.match(regionalMapSource, /const rootAnchor = pointInSvgRootCoordinates\(stationsLayer, placement\.anchor\)/);
    assert.match(regionalMapSource, /const rootPosition = pointInSvgRootCoordinates\(stationsLayer, placement\.position\)/);
    assert.match(regionalMapSource, /anchor: rootAnchor/);
    assert.match(regionalMapSource, /position: rootPosition/);
    assert.match(regionalMapSource, /preferredVector:\s*\{[\s\S]*rootPosition\.x - rootAnchor\.x/);
    assert.doesNotMatch(regionalMapSource, /overlapLayerTransform/);
    assert.doesNotMatch(regionalMapSource, /clampedRootPosition/);
    assert.match(regionalMapSource, /const candidates = \[1, -1\]\.map/);
    assert.match(regionalMapSource, /squaredPointDistance\(leftRoot, mapCenter\) - squaredPointDistance\(rightRoot, mapCenter\)/);
    assert.match(regionalMapSource, /const REGIONAL_OVERLAP_INDICATOR_EDGE_GAP = 88/);
    assert.match(regionalMapSource, /const renderedBadgeHalfExtent = \(/);
    assert.match(regionalMapSource, /REGIONAL_IMPACT_OVERLAY_WIDTH \/ 2[\s\S]*renderedBadgeHalfExtent[\s\S]*REGIONAL_OVERLAP_INDICATOR_EDGE_GAP/);
    assert.match(regionalMapSource, /function regionalCollisionAdjustedOverlapBadges\(/);
    assert.match(regionalMapSource, /querySelectorAll<SVGGraphicsElement>\("text"\)/);
    assert.match(regionalMapSource, /\.regional-overlay-segment-group \.regional-impact-path/);
    assert.match(regionalMapSource, /#regional-lines-layer path\[id\^="regional-route-"\]/);
    assert.match(regionalMapSource, /function regionalPathCorridorCollisionBoxes\(/);
    assert.match(regionalMapSource, /regionalOverlapBadgePositionCandidates\(badge\)/);
    assert.match(regionalMapSource, /hardOverlapArea \* 1_000_000[\s\S]*transitLineOverlapArea \* 10_000[\s\S]*anchorDistance/);
    assert.match(regionalMapSource, /regionalCollisionAdjustedOverlapBadges\(svg, badges\)/);
    assert.match(regionalMapSource, /overlapBadgePositionsRef\.current\.get\(badge\.markerId\) \?\? badge\.position/);
    assert.doesNotMatch(regionalMapSource, /const animationFrame = window\.requestAnimationFrame/);
    assert.doesNotMatch(regionalMapSource, /badge\.position\.x \+ deltaX \* authoredUnitsPerPixel/);
    assert.match(overlapIndicatorSource, /const isSingleKindOverlap = kindCounts\.length === 1/);
    assert.match(overlapIndicatorSource, /<OverlapKindCountBadge count=\{count\} large=\{isSingleKindOverlap\}/);
    assert.match(overlapChooserSource, /<strong>Choose Alert<\/strong>/);
    assert.match(overlapChooserSource, /data-overlap-choice-id=\{impact\.cardId\}/);
  });

  it("supports pointer, wheel, fit-network, and keyboard map interactions", () => {
    assert.match(regionalMapSource, /onWheel=\{onWheel\}/);
    assert.match(regionalMapSource, /onPointerDown=\{onPointerDown\}/);
    assert.match(regionalMapSource, /event\.key !== "Enter" && event\.key !== " "/);
    assert.match(regionalMapSource, /aria-label="Fit regional network"/);
    assert.match(globalsCss, /\.regional-map-viewport\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;/s);
    assert.match(globalsCss, /\.regional-map-stage :is\(text, tspan\)[^{]*\{[^}]*user-select:\s*none;/s);
  });

  it("focuses the regional camera on station and impact selections from every UI entry point", () => {
    assert.match(networkMapSource, /desktopMenuPinned=\{props\.desktopMenuPinned\}/);
    assert.match(networkMapSource, /preserveCameraOnSelectionClear=\{props\.preserveCameraOnSelectionClear\}/);
    assert.match(regionalMapSource, /data-regional-station-selection-id/);
    assert.match(regionalMapSource, /data-regional-impact-kind/);
    assert.match(regionalMapSource, /selectedMapElements/);
    assert.match(regionalMapSource, /getBoundingClientRect\(\)/);
    assert.match(regionalMapSource, /preferredTargetScale = clampPanZoomScale\(fitScale \* \(isMobile \? 3\.8 : 1\.8\), fitScale\)/);
    assert.match(regionalMapSource, /if \(!isMobile\)[\s\S]*desktopMenuPinned[\s\S]*\.floating-panel-shell/);
    assert.match(regionalMapSource, /focusInsets\.left = Math\.max\(focusInsets\.left, insetLeft\)/);
    assert.match(regionalMapSource, /const selectionFit = computeBoundedMapFrame\(/);
    assert.match(regionalMapSource, /const targetScale = clampPanZoomScale\([\s\S]*Math\.min\(preferredTargetScale, selectionFit\.scale\)/);
    assert.match(regionalMapSource, /computeInsetViewportFocus\([\s\S]*focusInsets/);
    assert.match(regionalMapSource, /focusX - mapX \* targetScale/);
    assert.match(regionalMapSource, /focusY - mapY \* targetScale/);
    assert.match(regionalMapSource, /animateCameraTo\(snapCameraToDevicePixels/);
    assert.match(regionalMapSource, /if \(!preserveCameraOnSelectionClear\)[\s\S]*requestAnimationFrame\(fitNetwork\)/);
  });

  it("preserves station activation across viewport pointer capture", () => {
    assert.match(regionalMapSource, /pointerActivationRef/);
    assert.match(regionalMapSource, /event\.type === "pointerup" && !dragMovedRef\.current && activation/);
    assert.match(regionalMapSource, /onSelectStationId\(activation\.id\)/);
    assert.doesNotMatch(regionalMapSource, /onSelectStationId\(selectedStationId === activation\.id \? null : activation\.id\)/);
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

  it("keeps the regional camera imperative while preserving TTC camera math", () => {
    assert.match(regionalMapSource, /snapCameraToDevicePixels/);
    assert.match(regionalMapSource, /mapStageRef\.current\.style\.transform = `translate\(\$\{nextCamera\.x\}px, \$\{nextCamera\.y\}px\) scale\(\$\{nextCamera\.scale\}\)`/);
    assert.doesNotMatch(regionalMapSource, /transform: `translate\(\$\{camera\.x\}/);
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

  it("animates regional camera scale without compositor-layer churn", () => {
    assert.doesNotMatch(globalsCss, /\.regional-map-camera-moving \.regional-map-stage[^{]*\{[^}]*will-change:\s*transform/s);
    assert.doesNotMatch(globalsCss, /\.regional-map-camera-moving \.regional-map-stage[^{]*\{[^}]*backface-visibility:/s);
    const animationBlock = regionalMapSource.match(
      /const animateCameraTo = useCallback\([\s\S]*?\n  useEffect\(/,
    )?.[0] ?? "";
    assert.equal((animationBlock.match(/requestAnimationFrame/g) ?? []).length, 1);
    assert.match(animationBlock, /requestAnimationFrame\(\(\) => \{[\s\S]*?writeMapTransform\(targetCamera\)/s);
    assert.match(
      regionalMapSource,
      /writeMapTransform\(targetCamera\);[\s\S]*?animTimeoutRef\.current = window\.setTimeout/s,
    );
  });

  it("keeps animated regional alert artwork stable while the camera is moving", () => {
    assert.match(regionalMapSource, /const regionalMapRef = useRef<HTMLElement>\(null\)/);
    assert.match(regionalMapSource, /root\.classList\.toggle\("regional-map-camera-moving", active\)/);
    assert.doesNotMatch(regionalMapSource, /\.pauseAnimations\(\)/);
    assert.doesNotMatch(regionalMapSource, /\.unpauseAnimations\(\)/);
    assert.match(regionalMapSource, /beginCameraMotion\(\)/);
    assert.match(regionalMapSource, /endCameraMotion\(\)/);
    assert.match(regionalMapSource, /clearProgrammaticAnimation[\s\S]*wheelCommitTimeoutRef\.current = null/);
    assert.match(
      globalsCss,
      /\.regional-map-camera-moving \.regional-map-stage :is\([\s\S]*?\.regional-impact-path[\s\S]*?\)\s*,[\s\S]*?animation:\s*none\s*!important;[\s\S]*?filter:\s*none\s*!important;/s,
    );
    assert.match(globalsCss, /\.regional-map-camera-moving \.regional-map-stage :is\([\s\S]*?\.regional-delay-glyph-lane[\s\S]*?display:\s*none\s*!important;/s);
    assert.doesNotMatch(globalsCss, /\.regional-map-camera-moving \.regional-map-stage \*/);
    const cameraMotionSimplification = globalsCss.slice(
      globalsCss.indexOf(".regional-map-camera-moving .regional-map-stage :is("),
      globalsCss.indexOf("/* SMIL motion is not controlled by CSS animation state."),
    );
    assert.doesNotMatch(cameraMotionSimplification, /regional-station-selected-indicator/);
  });

  it("keeps the authored regional SVG mounted while refreshing isolated dynamic layers", () => {
    assert.equal((regionalMapSource.match(/setSvgMarkup\(/g) ?? []).length, 1);
    assert.match(regionalMapSource, /fetch\("\/assets\/linewatch\/regional-rail-map\.svg"\)[\s\S]*?\n  \}, \[\]\);/s);
    assert.match(regionalMapSource, /REGIONAL_DYNAMIC_SEGMENT_LAYER_ID = "regional-dynamic-segment-layer"/);
    assert.match(regionalMapSource, /REGIONAL_DYNAMIC_STATION_RING_LAYER_ID = "regional-dynamic-station-ring-layer"/);
    assert.match(regionalMapSource, /REGIONAL_DYNAMIC_COMMUTE_LAYER_ID = "regional-dynamic-commute-layer"/);
    assert.match(regionalMapSource, /REGIONAL_DYNAMIC_HOVER_LAYER_ID = "regional-dynamic-hover-layer"/);
    assert.match(regionalMapSource, /REGIONAL_DYNAMIC_EFFECTS_LAYER_ID = "regional-dynamic-effects-layer"/);
    assert.match(regionalMapSource, /segmentLayer\.replaceChildren\(\)/);
    assert.match(regionalMapSource, /stationRingLayer\.replaceChildren\(\)/);
    assert.match(regionalMapSource, /effectsLayer\.replaceChildren\(\)/);
    assert.doesNotMatch(regionalMapSource, /mapStageRef\.current\.replaceChildren/);
    assert.match(regionalMapSource, /element\.style\.removeProperty\("shape-rendering"\)/);
  });

  it("updates regional button zoom imperatively before its deferred React commit", () => {
    const zoomButtonBlock = regionalMapSource.match(
      /const zoomAtCenter = useCallback\([\s\S]*?\n  const zoomToScale/,
    )?.[0] ?? "";
    assert.match(zoomButtonBlock, /const current = cameraRef\.current/);
    assert.match(zoomButtonBlock, /writeMapTransform\(nextCamera\)/);
    assert.match(zoomButtonBlock, /scheduleCameraCommit\(\)/);
    assert.doesNotMatch(zoomButtonBlock, /setCamera\(\(current\)/);
  });

  it("keeps React from overwriting the imperative regional camera transform", () => {
    const stageBlock = regionalMapSource.match(
      /ref=\{mapStageRef\}[\s\S]*?<RegionalSvgMarkup markup=\{svgMarkup\}/,
    )?.[0] ?? "";
    assert.doesNotMatch(stageBlock, /transform:\s*`translate\(\$\{camera\.x\}/);
    assert.match(regionalMapSource, /writeMapTransform\(fitted\.camera\)/);
  });

  it("does not run regional SVG hover geometry hit-testing during drag or pinch", () => {
    assert.match(
      regionalMapSource,
      /const handlePointerMove = \(event: globalThis\.PointerEvent\) => \{\s*if \(activePointersRef\.current\.size > 0\) return;/s,
    );
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

  it("does not refit an initialized camera when refreshed dashboard data updates dynamic layers", () => {
    assert.match(regionalMapSource, /if \(cameraInitializedRef\.current \|\| !svgMarkup\) return/);
    assert.match(regionalMapSource, /cameraInitializedRef\.current = true/);
  });
});
