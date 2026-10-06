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

const shellSource = readFileSync(new URL("../src/components/LineWatchShell.tsx", import.meta.url), "utf8");
const networkSelectorSource = readFileSync(new URL("../src/components/NetworkSelector.tsx", import.meta.url), "utf8");
const defaultMapModeSource = readFileSync(new URL("../src/components/DefaultMapModeControl.tsx", import.meta.url), "utf8");
const mobileMoreSource = readFileSync(new URL("../src/components/MobileMoreSheet.tsx", import.meta.url), "utf8");
const mobileLegendSource = readFileSync(new URL("../src/components/MobileLegend.tsx", import.meta.url), "utf8");
const networkMapSource = readFileSync(new URL("../src/components/NetworkMap.tsx", import.meta.url), "utf8");
const networkMapLegendsSource = readFileSync(new URL("../src/components/NetworkMapLegends.tsx", import.meta.url), "utf8");
const regionalMapSource = readFileSync(new URL("../src/components/InteractiveRegionalMap.tsx", import.meta.url), "utf8");
const regionalGeometrySource = readFileSync(new URL("../src/app/regional-map-geometry.ts", import.meta.url), "utf8");
const regionalAssetSource = readFileSync(new URL("../src/app/regional-map-asset.ts", import.meta.url), "utf8");
const regionalOverlaysSource = readFileSync(new URL("../src/app/regional-map-overlays.ts", import.meta.url), "utf8");
const ttcMapSource = readFileSync(new URL("../src/components/InteractiveTtcMap.tsx", import.meta.url), "utf8");
const overlapIndicatorSource = readFileSync(new URL("../src/components/MapOverlapIndicator.tsx", import.meta.url), "utf8");
const overlapChooserSource = readFileSync(new URL("../src/components/MapOverlapChooser.tsx", import.meta.url), "utf8");
const regionalStationDetailSource = readFileSync(new URL("../src/components/RegionalStationDetailPanel.tsx", import.meta.url), "utf8");
const stationDetailHeaderSource = readFileSync(new URL("../src/components/StationDetailHeader.tsx", import.meta.url), "utf8");
const panZoomSource = readFileSync(new URL("../src/hooks/usePanZoom.ts", import.meta.url), "utf8");
const sidebarStateSource = readFileSync(new URL("../src/app/desktop-sidebar-state.ts", import.meta.url), "utf8");
const regionalSvg = readFileSync(new URL("../public/assets/linewatch/regional-rail-map.svg", import.meta.url), "utf8");
const globalsCss = readAppStylesheet();

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

  it("keeps unselected regional station indicators dormant in mobile performance modes", () => {
    assert.match(
      globalsCss,
      /\.linewatch-shell \.regional-station-selected-indicator:not\(\[data-regional-station-selected="true"\]\)\s*\{[\s\S]*opacity:\s*0\s*!important/,
    );
    assert.match(regionalAssetSource, /dataset\.regionalStationSelectionId = stationId/);
    assert.match(regionalAssetSource, /setAttribute\("data-regional-station-selected", "true"\)/);
  });

  it("keeps regional selections in an even mobile split in standard mode and supports rotated preview mode", () => {
    assert.match(globalsCss, /mobile-map-inspector\[data-network="regional"\][\s\S]*--mobile-inspector-total-height:\s*50dvh/);
    assert.match(shellSource, /rotatedSelectionVisible && !mobileInspectorOpen/);
    assert.match(networkMapSource, /layoutResetSignal=\{props\.layoutResetSignal\}/);
    assert.match(regionalMapSource, /`\$\{layoutResetSignal \?\? 0\}:\$\{desktopMenuPinned \? "pinned" : "free"\}[\s\S]*:\$\{viewportOrientation\}`/);
  });

  it("preserves the authored regional corridor overlay width in mobile performance mode", () => {
    assert.match(globalsCss, /mobile-performance-mode\[data-network="regional"\] \.regional-impact-path[\s\S]*stroke-width:\s*var\(--regional-impact-width\) !important/);
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

    assert.doesNotMatch(networkChangeBody, /setMapLayoutSignal/);
    assert.doesNotMatch(networkChangeBody, /setMapEntranceSignal/);
    assert.doesNotMatch(networkMapSource, /key=\{network\}/);
    assert.doesNotMatch(regionalMapSource, /startInitialFlyIn/);
    assert.equal((shellSource.match(/animateInitialEntrance=\{false\}/g) ?? []).length, 2);
    assert.match(regionalMapSource, /const initializeMapCamera = useCallback/);
    assert.match(regionalMapSource, /if \(animateInitialEntrance && shouldAnimateProgrammaticTransform\) \{[\s\S]*computeFittedCameraFlyInStart[\s\S]*animateCameraTo\(fitted\.camera, fitted\.scale\)/);
    assert.match(
      networkMapSource,
      /<InteractiveTtcMap[\s\S]*\{\.\.\.props\}[\s\S]*onReady=\{ready\}/,
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
    assert.match(regionalMapSource, /computeFittedCameraFlyInStart\(fitted\.camera, width, height, fitted\.focus\)/);
    assert.match(networkMapSource, /deferInitialEntrance=\{preparing \? false : props\.deferInitialEntrance\}/);
    assert.match(regionalMapSource, /const stageInitialEntrance = useCallback/);
    assert.match(regionalMapSource, /const completeStagedEntrance = useCallback/);
    assert.match(regionalMapSource, /const entryCamera = animateInitialEntrance[\s\S]*computeFittedCameraFlyInStart[\s\S]*: fitted\.camera/);
    assert.match(regionalMapSource, /if \(animateInitialEntrance && shouldAnimateProgrammaticTransform\)[\s\S]*animateCameraTo[\s\S]*snapCameraToNetwork/);
    assert.match(regionalMapSource, /useLayoutEffect\(\(\) => \{[\s\S]*?stageInitialEntrance\(\)[\s\S]*?initializeMapCamera\(\)/);
    assert.match(regionalMapSource, /visibility: svgMarkup && cameraReady \? "visible" : "hidden"/);
    assert.match(regionalMapSource, /setMapTransition\("none"\)/);
    assert.doesNotMatch(regionalMapSource, /transition: shouldAnimateProgrammaticTransform && !isGestureActive/);
    assert.match(shellSource, /selectedNetwork === "regional" && regionalRailOperatingState\.status === "closed" && !closedScreenAcknowledged/);
    assert.match(panZoomSource, /computeFittedCameraFlyInStart\(next, width, height\)/);
    assert.match(regionalMapSource, /setMapTransition\(`transform \$\{durationMs\}ms \$\{easing\}`\)/);
    assert.match(regionalMapSource, /setCamera\(entryCamera\);[\s\S]*?requestAnimationFrame[\s\S]*?animateCameraTo\(fitted\.camera, fitted\.scale\);/);
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
    assert.match(regionalOverlaysSource, /const stationOnlyImpactIds = new Set\((?:data\.)?stationNodeImpacts\.map\(\(impact\) => impact\.cardId\)\)/);
    assert.match(regionalOverlaysSource, /item\.affectedSegmentIds\.length === 0 && !stationOnlyImpactIds\.has\(item\.id\)/);
    assert.match(regionalGeometrySource, /segment\.guidePathId/);
    assert.match(regionalMapSource, /stationNodeImpacts/);
    assert.match(regionalGeometrySource, /corridorSegmentPath\(documentNode, segment/);
    assert.match(regionalGeometrySource, /regionalRoutePathIds\(segment\.lineId\)/);
    assert.match(regionalGeometrySource, /routeCode === "lw"[\s\S]*regional-route-lw-main-path[\s\S]*regional-route-lw-branch-path/);
    assert.match(regionalGeometrySource, /pointInSvgRootCoordinates\(source, point\)/);
    assert.match(regionalGeometrySource, /pointFromSvgRootCoordinates\([\s\S]*stationsLayer/);
    assert.doesNotMatch(regionalMapSource, /source\.getCTM\(\)/);
    assert.doesNotMatch(regionalGeometrySource, /source\.getCTM\(\)/);
    assert.match(regionalGeometrySource, /connection\.gapSquared > 4/);
    assert.match(regionalOverlaysSource, /resolvedRegionalSegmentPath\(documentNode, segment\)/);
    assert.match(regionalOverlaysSource, /regionalOverlayRuns\(overlayPieces\)/);
    assert.match(regionalOverlaysSource, /regionalSegmentsAreAdjacent/);
    assert.match(regionalOverlaysSource, /componentPieces\.map\(\(piece\) => piece\.pathD\.trim\(\)\)\.join\(" "\)/);
    assert.match(regionalOverlaysSource, /authoredRegionalCorridorPathData/);
    assert.match(regionalOverlaysSource, /group\.dataset\.regionalImpactSegmentCount = String\(segmentCount\)/);
  });

  it("keeps the shared KI and UP corridor in geographic order through Mount Dennis", () => {
    assert.deepEqual(REGIONAL_ROUTE_STATIONS.KI.slice(0, 5), [
      "union", "bloor", "mount-dennis", "weston", "etobicoke-north",
    ]);
    assert.deepEqual(REGIONAL_ROUTE_STATIONS.UP, [
      "union", "bloor", "mount-dennis", "weston", "pearson-airport",
    ]);
    assert.match(regionalGeometrySource, /pointInRegionalStationsLayer/);
    assert.match(regionalGeometrySource, /anchor\.matches\("circle, ellipse"\)/);
    assert.match(regionalGeometrySource, /operation === "rotate"/);
    assert.match(regionalGeometrySource, /operation === "translate"/);
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
    assert.match(globalsCss, /\.regional-station-hit-target:hover \+ \.regional-station-hover-indicator/);
    assert.match(globalsCss, /\.regional-station-hit-target:focus-visible \+ \.regional-station-hover-indicator/);
    assert.match(regionalAssetSource, /"station-hover-indicator", "regional-station-hover-indicator"/);
    assert.match(regionalAssetSource, /stationId === "union" \? 75/);
    assert.match(regionalAssetSource, /"station-selected-indicator",[\s\S]*?"regional-station-selected-indicator"/);
    assert.match(regionalOverlaysSource, /"map-segment-hit-target", "regional-impact-hit-target"/);
    assert.match(regionalOverlaysSource, /"asset-alert-path-hover-boundary", visualState, "regional-impact-hover-boundary"/);
    assert.match(regionalOverlaysSource, /setLinkedImpactHover/);
    assert.match(regionalOverlaysSource, /data-regional-impact-hovered/);
    assert.match(regionalOverlaysSource, /function regionalSegmentImpactAtClientPoint\(/);
    assert.match(regionalOverlaysSource, /function regionalStationImpactAtClientPoint\(/);
    assert.match(regionalOverlaysSource, /hitTarget\.isPointInStroke\(point\.matrixTransform\(screenMatrix\.inverse\(\)\)\)/);
    assert.match(regionalOverlaysSource, /document\.addEventListener\("pointermove", handlePointerMove\)/);
    assert.doesNotMatch(regionalOverlaysSource, /document\.addEventListener\("pointerover"/);
    assert.doesNotMatch(regionalOverlaysSource, /document\.addEventListener\("pointerout"/);
    assert.doesNotMatch(regionalOverlaysSource, /onLinkedImpactPointerOver/);
    assert.doesNotMatch(regionalOverlaysSource, /onLinkedImpactPointerOut/);
    assert.match(globalsCss, /data-regional-impact-hovered="true"[^}]*regional-impact-hover-boundary/);
    assert.match(
      globalsCss,
      /#regional-station-labels-layer :is\(text, tspan\)\s*\{[^}]*pointer-events:\s*none/s,
    );
    assert.match(regionalAssetSource, /createElementNS\(SVG_NAMESPACE, "title"\)/);
    assert.match(globalsCss, /\.map-selection-attention\s*\{[^}]*--selection-intro-name:\s*none/s);
    assert.match(
      regionalAssetSource,
      /"map-selection-attention",[\s\S]*?"station-selected-indicator",[\s\S]*?"regional-station-selected-indicator",[\s\S]*?"foreground-flash-active"/,
    );
    assert.match(regionalAssetSource, /selectionSource\.id = `regional-station-selection-source-\$\{stationId\}`/);
    assert.match(regionalAssetSource, /transformedAncestors\.reverse\(\)/);
    assert.match(regionalMapSource, /className="regional-station-top-selection map-selection-attention"/);
    assert.match(regionalMapSource, /href=\{`#regional-station-selection-source-\$\{selectedStationId\}`\}/);
  });

  it("uses TTC-derived disruption artwork and selection emphasis at regional map scale", () => {
    assert.match(regionalOverlaysSource, /function regionalImpactVisualState\(kind: ImpactKind\)/);
    assert.match(regionalOverlaysSource, /return "delay-static"/);
    assert.match(regionalOverlaysSource, /"regional-impact-aura"/);
    assert.match(regionalOverlaysSource, /"regional-impact-interactive-glow"/);
    assert.match(regionalOverlaysSource, /visiblePath\.classList\.add\("delay-static-base"\)/);
    assert.match(regionalOverlaysSource, /regionalDelayGlyphLane\(documentNode, sourcePath, travelDirection, reducedMotion\)/);
    assert.match(regionalOverlaysSource, /lane\.dataset\.regionalDelayDirection = travelDirection/);
    assert.match(regionalOverlaysSource, /travelDirection === "bidirectional" \|\| index % 2 === 0/);
    assert.match(regionalGeometrySource, /REGIONAL_IMPACT_OVERLAY_WIDTH = 196/);
    assert.match(
      regionalOverlaysSource,
      /--regional-impact-width",\s*`\$\{REGIONAL_IMPACT_OVERLAY_WIDTH\}px`/,
      "regional planned closures should retain the same full-coverage rail width as other disruption overlays",
    );
    assert.match(regionalOverlaysSource, /REGIONAL_IMPACT_HIT_TARGET_WIDTH = REGIONAL_IMPACT_OVERLAY_WIDTH \+ 169/);
    assert.match(regionalOverlaysSource, /REGIONAL_DELAY_GLYPH_SPACING = 96/);
    assert.match(regionalOverlaysSource, /travelDirection === "bidirectional"[\s\S]*REGIONAL_DELAY_GLYPH_SPACING \* 1\.3[\s\S]*Math\.floor\(length \/ glyphSpacing\)/);
    assert.match(regionalOverlaysSource, /REGIONAL_DELAY_TRAVEL_UNITS_PER_SECOND = \(160 \/ 12\) \* \(175 \/ 102\)/);
    assert.match(regionalOverlaysSource, /travelDirection === "bidirectional" \|\| !pathD/);
    assert.match(regionalOverlaysSource, /createElementNS\(SVG_NAMESPACE, "animateMotion"\)/);
    assert.match(regionalOverlaysSource, /impact\.travelDirection/);
    assert.match(globalsCss, /data-regional-impact-kind="delay"[\s\S]*stroke:\s*#0ea5e9[\s\S]*stroke-width:\s*var\(--regional-impact-width\)/);
    assert.doesNotMatch(globalsCss, /regional-delay-static-shift/);
    assert.doesNotMatch(globalsCss, /data-regional-impact-kind="reduced-speed-zone"[^}]*regional-impact-path\s*\{[^}]*map-overlay-rail-pulse/s);
    assert.match(globalsCss, /\.regional-impact-aura\s*\{[^}]*animation:\s*aura-pulse var\(--map-overlay-pulse-half-cycle\) infinite alternate var\(--map-overlay-pulse-easing\);[^}]*animation-delay:\s*var\(--map-pulse-offset\)/s);
    assert.match(globalsCss, /regional-overlay-segment-group:not\(\[data-regional-impact-selected="true"\]\)[^}]*regional-impact-interactive-glow\s*\{[^}]*animation:\s*none\s*!important/s);
    assert.match(globalsCss, /regional-overlay-segment-group:not\(\[data-regional-impact-selected="true"\]\)[^}]*regional-impact-interactive-glow\s*\{[^}]*opacity:\s*0\s*!important/s);
    assert.doesNotMatch(globalsCss, /data-regional-impact-kind="suspension"[^}]*regional-impact-path\s*\{[^}]*map-overlay-rail-pulse/s);
    assert.match(regionalOverlaysSource, /--map-overlay-rail-pulse-width/);
    assert.match(globalsCss, /regional-impact-hit-target:active[\s\S]*regional-impact-glow/);
    assert.match(
      globalsCss,
      /regional-overlay-segment-group:not\(\.regional-impact-hover-foreground\):not\(\[data-regional-impact-selected="true"\]\):has\(\.regional-impact-hit-target:hover\) \.regional-impact-interactive-glow/,
    );
    assert.match(globalsCss, /regional-impact-hit-target\s*\{[^}]*stroke-width:\s*var\(--regional-impact-hit-target-width\)/s);
    assert.match(globalsCss, /regional-impact-width\) \+ 169px/);
    assert.match(globalsCss, /data-regional-impact-kind="planned-closure"[\s\S]*regional-impact-aura[\s\S]*display:\s*none/);
    assert.doesNotMatch(
      globalsCss,
      /data-regional-impact-kind="planned-closure"[^}]*regional-impact-path\s*\{[^}]*animation:/s,
    );
    assert.match(globalsCss, /data-regional-impact-selected="true"[\s\S]*regional-impact-interactive-glow[\s\S]*regional-selection-path-intro/);
    assert.match(globalsCss, /regional-impact-interactive-glow\s*\{[^}]*filter:\s*drop-shadow\(0 0 12px/s);
    assert.doesNotMatch(globalsCss, /regional-impact-interactive-glow\s*\{[^}]*filter:\s*blur/s);
    assert.match(globalsCss, /\.motion-paused \.regional-impact-aura/);
    assert.match(globalsCss, /prefers-reduced-motion:\s*reduce[\s\S]*\.regional-impact-aura/);
    assert.match(regionalOverlaysSource, /function appendRegionalSuspensionGlyph\([\s\S]*?const scale = 5;/);
    assert.match(regionalOverlaysSource, /const glyphSpacing = travelDirection === "bidirectional" \? 176 : 148;/);
    assert.match(regionalOverlaysSource, /function appendRegionalPlannedClosureGlyph\([\s\S]*?const scale = 6\.2;/);
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
    assert.match(regionalOverlaysSource, /`regional-delay-glyph--\$\{kind\}`/);
    assert.match(regionalOverlaysSource, /kind: "hourglass" \| "arrow"/);
  });

  it("reuses the smooth attention-to-breathing lifecycle for every selected regional station and impact", () => {
    assert.doesNotMatch(regionalMapSource, /selectionPulsePhase|data-regional-selection-phase/);
    assert.match(
      regionalAssetSource,
      /"map-selection-attention",[\s\S]*?"station-selected-indicator",[\s\S]*?"regional-station-selected-indicator",[\s\S]*?"foreground-flash-active"/,
    );
    assert.match(regionalOverlaysSource, /"regional-impact-interactive-glow", "map-selection-attention"/);
    assert.doesNotMatch(
      regionalOverlaysSource,
      /interactiveGlow\.classList\.add\([^;]*"interactive-glow"/,
    );
    assert.match(regionalOverlaysSource, /"station-impact-ring", "regional-station-impact-ring", "map-selection-attention"/);
    assert.match(globalsCss, /\.map-selection-attention\s*\{[^}]*animation-delay:\s*0s,\s*var\(--selection-intro-duration\)/s);
    assert.match(globalsCss, /regional-station-selected-indicator\[data-regional-station-selected="true"\][\s\S]*--selection-intro-name:\s*map-selection-station-intro/);
    assert.match(globalsCss, /\.regional-station-top-selection\s*\{[^}]*--selection-intro-name:\s*map-selection-station-intro;[^}]*--selection-breathe-name:\s*map-selection-station-breathe;/s);
    assert.match(
      globalsCss,
      /regional-overlay-segment-group\[data-regional-impact-selected="true"\] \.regional-impact-interactive-glow\s*\{[^}]*--selection-intro-name:\s*regional-selection-path-intro;[^}]*animation-name:\s*var\(--selection-intro-name\),\s*var\(--selection-breathe-name\);[^}]*animation-duration:\s*var\(--selection-intro-duration\),\s*var\(--selection-breathe-duration\);[^}]*animation-delay:\s*0s,\s*var\(--selection-intro-duration\)/s,
    );
    assert.match(
      globalsCss,
      /\.asset-alert-path-glow:not\(\.map-selection-attention\):not\(\.interactive-glow\):not\(\.commute-path-preview-glow\)/,
    );
    assert.match(globalsCss, /\.interactive-glow:not\(\.map-selection-attention\)/);
    assert.match(globalsCss, /regional-station-impact-ring[\s\S]*--selection-intro-name:\s*regional-selection-ring-intro/);
    const selectedPathBlock = globalsCss.match(
      /\.regional-overlay-segment-group\[data-regional-impact-selected="true"\] \.regional-impact-interactive-glow\s*\{[^}]*\}/s,
    )?.[0] ?? "";
    assert.match(selectedPathBlock, /stroke:\s*#0284c7/);
    assert.match(selectedPathBlock, /transition:\s*none/);
    assert.doesNotMatch(selectedPathBlock, /opacity:[^;]*!important/);
    assert.match(
      globalsCss,
      /regional-overlay-segment-group\[data-regional-impact-selected="true"\] \.regional-impact-path\s*\{[^}]*filter:\s*none;/s,
    );
    assert.match(regionalOverlaysSource, /group\.append\(aura, boundary, visiblePath\)/);
    assert.match(regionalOverlaysSource, /group\.append\(interactiveGlow, hitTarget\)/);
    assert.match(
      regionalOverlaysSource,
      /const applyImpactSelection = \([\s\S]*?viewport\.querySelectorAll\("\[data-regional-impact-selected\]"\)/,
    );
    assert.doesNotMatch(
      regionalOverlaysSource,
      /regional-impact-interactive-glow"\)[\s\S]*setAttribute\("mask"/,
    );
  });

  it("fits terminal selections to their authored shape and slightly enlarges regular station dots", () => {
    assert.match(regionalAssetSource, /const selectedScaleFactor = isLarge \? 1 : 1\.2/);
    assert.doesNotMatch(regionalAssetSource, /stationId === "union" \? 104/);
    assert.match(regionalAssetSource, /element\.before\(hitTarget, hoverIndicator\)/);
    assert.match(regionalAssetSource, /element\.after\(selectedIndicatorContainer \?\? selectedIndicator\)/);
    assert.match(regionalAssetSource, /selectedIndicator\.removeAttribute\("transform"\)/);
    assert.match(regionalAssetSource, /selectedIndicatorContainer\?\.setAttribute\("transform", authoredTransform\)/);
    assert.match(
      globalsCss,
      /regional-impact-interactive-glow\s*\{[\s\S]*stroke:\s*var\(--station-selection-accent\)/,
    );
    assert.match(regionalAssetSource, /shape\.removeAttribute\("style"\)/);
    assert.match(regionalAssetSource, /shape\.setAttribute\("style", "fill:var\(--station-selection-accent\);stroke:none;"\)/);
    assert.match(
      globalsCss,
      /\.regional-station-selection-source-artwork\s*\{[^}]*fill:\s*var\(--station-selection-accent\)\s*!important;[^}]*stroke:\s*none\s*!important;/s,
    );
    assert.match(
      globalsCss,
      /\.linewatch-shell\.mobile-performance-mode \.regional-station-top-selection\s*\{[^}]*animation:\s*none\s*!important;[^}]*filter:\s*none\s*!important;[^}]*opacity:\s*0\.7;[^}]*\}/s,
    );
  });

  it("renders every layered segment impact instead of discarding overlaps", () => {
    assert.match(regionalOverlaysSource, /for \(const \[impactIndex, impact\] of \(segment\.impacts \?\? \[\]\)\.entries\(\)\)/);
    assert.doesNotMatch(regionalOverlaysSource, /const impact = segment\.impacts\?\.\[0\]/);
    assert.match(regionalOverlaysSource, /const orderedOverlayRuns = regionalOverlayRuns\(overlayPieces\)\.sort/);
    assert.match(regionalGeometrySource, /function continuousRegionalOverlayRunPath\(/);
    assert.match(regionalOverlaysSource, /continuousRegionalOverlayRunPath\(documentNode, run\) \?\? run\.pathD/);
    assert.match(regionalOverlaysSource, /regionalImpactPriority\(left\.impact\.kind\) - regionalImpactPriority\(right\.impact\.kind\)/);
    assert.match(regionalOverlaysSource, /case "planned-closure":\s*return 0;[\s\S]*case "reduced-speed-zone":\s*return 1;[\s\S]*case "delay":\s*return 2;[\s\S]*case "suspension":\s*return 3;/);
    assert.match(regionalOverlaysSource, /const corridorWideAlerts = (?:data\.)?activeAlerts[\s\S]*regionalImpactPriority\(leftKind\) - regionalImpactPriority\(rightKind\)/);
    assert.match(regionalOverlaysSource, /`\$\{REGIONAL_IMPACT_OVERLAY_WIDTH\}px`/);
    assert.doesNotMatch(regionalOverlaysSource, /REGIONAL_IMPACT_OVERLAY_WIDTH - layerIndex/);
  });

  it("repaints completed regional selections while hover uses a non-interactive foreground copy", () => {
    assert.match(regionalOverlaysSource, /function bringRegionalImpactToFront\(/);
    assert.match(regionalOverlaysSource, /element\.parentElement\?\.append\(element\)/);
    assert.match(regionalOverlaysSource, /bringRegionalImpactToFront\(viewport, selection\.kind, selection\.id/);
    assert.match(regionalOverlaysSource, /bringRegionalStationImpactToFront\(viewport, selection\.kind, selection\.id/);
    assert.match(regionalOverlaysSource, /function setRegionalImpactHoverForeground\(/);
    assert.match(regionalAssetSource, /regional-impact-hover-foreground-layer/);
    assert.match(regionalOverlaysSource, /regionalSegmentHoverForeground\(source, index\)/);
    assert.match(regionalOverlaysSource, /classList\.add\("regional-impact-segment-focus-target"\)/);
    assert.doesNotMatch(regionalOverlaysSource, /regionalStationHoverForeground\(source\)/);
    assert.match(regionalOverlaysSource, /function setRegionalStationImpactHover\(/);
    assert.match(regionalOverlaysSource, /indicator\.dataset\.regionalStationImpactHovered = "true"/);
    assert.match(globalsCss, /regional-station-hover-indicator\[data-regional-station-impact-hovered="true"\]/);
    assert.doesNotMatch(globalsCss, /regional-station-impact-ring\[data-regional-impact-hovered="true"\][\s\S]*regional-station-impact-width\) \+ 12px/);
    assert.match(regionalOverlaysSource, /foreground\.dataset\.regionalImpactHovered = "true"/);
    assert.match(regionalOverlaysSource, /foreground\.querySelectorAll\("\.regional-impact-interactive-glow, \.regional-impact-hit-target"\)/);
    assert.match(regionalOverlaysSource, /restoreRegionalOverlayOrder\(segmentLayer\)/);
    assert.match(regionalOverlaysSource, /REGIONAL_HIGHLIGHT_OUTLINE_WIDTH = REGIONAL_IMPACT_OVERLAY_WIDTH \+ 52/);
    assert.match(regionalOverlaysSource, /REGIONAL_HIGHLIGHT_DIVIDER_WIDTH = REGIONAL_IMPACT_OVERLAY_WIDTH \+ 30/);
    assert.match(regionalOverlaysSource, /REGIONAL_HIGHLIGHT_INNER_WIDTH = REGIONAL_IMPACT_OVERLAY_WIDTH - 12/);
    assert.match(regionalOverlaysSource, /REGIONAL_UNION_TOP_HOVER_CUTOUT_STROKE_WIDTH = 96/);
    assert.match(regionalOverlaysSource, /hoverMask\(coreMaskId, REGIONAL_HIGHLIGHT_INNER_WIDTH\)/);
    assert.match(regionalOverlaysSource, /hoverMask\(edgeMaskId, REGIONAL_HIGHLIGHT_DIVIDER_WIDTH\)/);
    assert.match(regionalOverlaysSource, /classList\.add\("regional-impact-hover-boundary-core"\)/);
    assert.match(regionalOverlaysSource, /classList\.add\("regional-impact-hover-boundary-edge"\)/);
    assert.match(regionalOverlaysSource, /drop-shadow\(0 0 7px rgba\(191, 219, 254, 0\.62\)\)/);
    assert.match(regionalGeometrySource, /export function regionalHoverMaskBounds\([\s\S]*source: SVGElement/);
    assert.match(regionalGeometrySource, /pointFromSvgRootCoordinates\(source, point\)/);
    assert.match(regionalOverlaysSource, /mask\.setAttribute\("x", String\(maskBounds\.x\)\)/);
    assert.match(regionalOverlaysSource, /background\.setAttribute\("x", String\(maskBounds\.x\)\)/);
    assert.match(regionalOverlaysSource, /boundary\.setAttribute\("mask", `url\(#\$\{coreMaskId\}\)`\)/);
    assert.match(regionalOverlaysSource, /edgeBoundary\.setAttribute\("mask", `url\(#\$\{edgeMaskId\}\)`\)/);
    assert.match(regionalOverlaysSource, /boundary\.after\(edgeBoundary\)/);
    assert.doesNotMatch(regionalOverlaysSource, /foreground\.append\(edgeBoundary\)/);
    assert.match(globalsCss, /\.regional-impact-hover-boundary-core\s*\{[^}]*rgba\(15,\s*23,\s*42,\s*0\.98\)/s);
    assert.match(globalsCss, /\.regional-impact-hover-boundary-edge\s*\{[^}]*rgba\(248,\s*250,\s*252,\s*0\.98\)[^}]*drop-shadow/s);
    assert.doesNotMatch(regionalOverlaysSource, /regional-impact-interactive-glow"\)[\s\S]*setAttribute\("mask"/);
    assert.match(globalsCss, /data-regional-impact-selected="true"\] \.regional-impact-interactive-glow\s*\{[^}]*stroke:\s*#0284c7/s);
    assert.match(regionalOverlaysSource, /foreground\.querySelectorAll\("title"\)/);
    assert.match(regionalOverlaysSource, /REGIONAL_TOP_HOVER_LAYER_ID = "regional-top-hover-layer"/);
    assert.match(regionalOverlaysSource, /function regionalTopHoverForeground\(/);
    assert.doesNotMatch(regionalOverlaysSource, /foreground\.getCTM\(\)/);
    assert.match(regionalOverlaysSource, /pointInSvgRootCoordinates\(source, \{ x: 0, y: 0 \}\)/);
    assert.match(regionalOverlaysSource, /documentNode\.getElementById\("station-union"\)/);
    assert.match(regionalOverlaysSource, /cutout\.dataset\.regionalTopHoverUnionCutout = "true"/);
    assert.match(regionalOverlaysSource, /cutout\.setAttribute\("stroke-width", String\(REGIONAL_UNION_TOP_HOVER_CUTOUT_STROKE_WIDTH\)\)/);
    assert.match(regionalOverlaysSource, /topHoverLayer\.append\(regionalTopHoverForeground\(sourceBoundary, index\)\)/);
    assert.match(regionalMapSource, /id=\{REGIONAL_TOP_HOVER_LAYER_ID\}/);
    assert.match(regionalAssetSource, /stationsLayer\.insertBefore\(hoverLayer, firstStationTarget\)/);
    assert.doesNotMatch(regionalAssetSource, /stationsLayer\.append\(hoverLayer, plannedStationLayer, effectsLayer\)/);
    assert.match(globalsCss, /regional-impact-hover-foreground\[data-regional-impact-hovered="true"\] \.regional-impact-hover-boundary/);
    assert.match(globalsCss, /not\(\.regional-impact-hover-foreground\):not\(\[data-regional-impact-selected="true"\]\):has\(\.regional-impact-hit-target:hover\) \.regional-impact-hover-boundary[\s\S]*opacity:\s*0\s*!important/s);
    assert.doesNotMatch(regionalOverlaysSource, /foreground\.remove\(\)/);
    assert.doesNotMatch(regionalOverlaysSource, /segmentLayer\.append\(foreground\)/);
  });

  it("keeps station-specific alert arrows and radar beacons inside station dots", () => {
    assert.match(regionalOverlaysSource, /regional-station-impact-beacon-group/);
    assert.match(regionalOverlaysSource, /station-impact-dot-red-glow/);
    assert.match(regionalOverlaysSource, /station-impact-dot-red-ping/);
    assert.match(regionalOverlaysSource, /regional-station-impact-fill/);
    assert.match(regionalOverlaysSource, /regional-station-impact-direction-glyph/);
    assert.match(regionalOverlaysSource, /station-impact-direction-badge/);
    assert.match(regionalOverlaysSource, /station-impact-direction-arrow/);
    assert.match(regionalGeometrySource, /REGIONAL_STATION_IMPACT_EFFECT_RADIUS_RATIO = 0\.9/);
    assert.match(regionalGeometrySource, /REGIONAL_STATION_IMPACT_BADGE_RADIUS_RATIO = 0\.72/);
    assert.match(regionalOverlaysSource, /foregroundBadgeRadius = foregroundAnchor\.radius \* REGIONAL_STATION_IMPACT_BADGE_RADIUS_RATIO/);
    assert.match(globalsCss, /\.regional-station-impact-ring\s*\{[\s\S]*stroke:\s*transparent/);
    assert.match(regionalOverlaysSource, /stationImpactBeaconLayer\.append\(beaconGroup\)/);
    assert.match(regionalOverlaysSource, /stationImpactDirectionLayer\.append\(glyphGroup\)/);
    assert.match(regionalOverlaysSource, /effectsLayer\.append\(stationImpactBeaconLayer\)/);
    assert.match(regionalOverlaysSource, /topStationImpactLayer\.append\(stationImpactFillLayer, stationImpactDirectionLayer\)/);
    assert.match(regionalOverlaysSource, /regionalStationImpactAnchors\(stationVisual, lineId\)/);
    assert.match(regionalOverlaysSource, /shape\.id\.endsWith\(`-\$\{routeCode\}`\)/);
    assert.match(regionalAssetSource, /stationsLayer\.append\(plannedStationLayer, effectsLayer\)/);
  });

  it("keeps regional disruption rails static while synchronizing remaining effects", () => {
    assert.match(regionalOverlaysSource, /--regional-map-pulse-offset", "0s"/);
    assert.match(regionalAssetSource, /--map-pulse-offset", "0s"/);
    assert.doesNotMatch(regionalOverlaysSource, /layerIndex \* 0\.4/);
    assert.match(regionalOverlaysSource, /REGIONAL_SYNCHRONIZED_OVERLAY_PULSE_NAMES/);
    assert.match(regionalOverlaysSource, /synchronizeRegionalOverlayPulses\(svg\)/);
    assert.match(regionalOverlaysSource, /animation\.currentTime = pulsePhaseMs/);
    assert.match(regionalOverlaysSource, /animation\.startTime = pulseCycleStartMs/);
    assert.match(regionalOverlaysSource, /requestAnimationFrame\(\(\) => synchronizeRegionalOverlayPulses\(svg\)\)/);
    assert.doesNotMatch(
      globalsCss,
      /data-regional-impact-kind="(?:delay|reduced-speed-zone|suspension|planned-closure)"[^}]*regional-impact-path\s*\{[^}]*map-overlay-rail-pulse/s,
    );
  });

  it("cycles pointer activation through overlapping regional segment and station impacts", () => {
    assert.match(regionalOverlaysSource, /function nextRegionalPointerImpactSelection\(/);
    assert.match(regionalOverlaysSource, /group\.dataset\.regionalImpactSegmentIds = segmentIds\.join\(","\)/);
    assert.match(regionalOverlaysSource, /data-regional-station-impact-station-id/);
    assert.match(regionalOverlaysSource, /regionalImpactPriority\(left\.kind\) - regionalImpactPriority\(right\.kind\)/);
    assert.match(regionalMapSource, /nextRegionalPointerImpactSelection\([\s\S]*event\.currentTarget,[\s\S]*impact,[\s\S]*selection/);
  });

  it("reuses the TTC overlap indicator for regional same-type and mixed impacts", () => {
    assert.match(regionalGeometrySource, /const REGIONAL_OVERLAP_INDICATOR_SCALE = 2;/);
    assert.match(regionalOverlaysSource, /function regionalOverlapBadgeGroups\(segments: NetworkSegment\[\]\)/);
    assert.match(regionalOverlaysSource, /hasOverlappingImpacts\(impacts\)/);
    assert.match(regionalOverlaysSource, /overlapBadgeSignature\(impacts\)/);
    assert.match(regionalOverlaysSource, /mapOverlapIndicatorSize\(group\.impacts\)/);
    assert.match(regionalMapSource, /aria-label="Overlapping alert badges"/);
    assert.match(regionalMapSource, /<MapOverlapIndicator/);
    assert.match(regionalMapSource, /visualScale=\{REGIONAL_OVERLAP_INDICATOR_SCALE\}/);
    assert.match(regionalMapSource, /isolatePointerDown/);
    assert.match(regionalMapSource, /openRegionalOverlapChooser\(badge\)/);
    assert.match(regionalOverlaysSource, /candidate\.dataset\.overlapSegmentId === markerId/);
    assert.match(regionalOverlaysSource, /function regionalOverlapChooserLayout\(/);
    assert.match(regionalOverlaysSource, /const REGIONAL_OVERLAP_CHOOSER_GAP = 24/);
    assert.match(regionalOverlaysSource, /markerCenter\.x - alertAnchor\.x/);
    assert.match(regionalOverlaysSource, /function regionalReferencedAlertCollisionBoxes\(/);
    assert.match(regionalOverlaysSource, /identityKeys\.has\(`\$\{kind\}:\$\{id\}`\)/);
    assert.match(regionalMapSource, /const alertCollisionBoxes = regionalReferencedAlertCollisionBoxes\(/);
    assert.match(regionalMapSource, /alertCollisionBoxes,\s*uiKeepoutBoxes,/);
    assert.match(regionalOverlaysSource, /const preferredCenter = centerForDirection\((?:normalizedOutward|outward), size\)/);
    assert.match(regionalOverlaysSource, /const angleOffsets = Array\.from\(\{ length: 24 \}/);
    assert.match(regionalOverlaysSource, /const distanceScales = \[1, 1\.25, 1\.55, 1\.9, 2\.3\]/);
    assert.match(regionalOverlaysSource, /alertOverlapArea \* 1_000_000[\s\S]*markerOverlapArea \* 1_000_000/);
    assert.match(regionalMapSource, /anchorPoint\.matrixTransform\(screenMatrix\)/);
    assert.match(regionalMapSource, /setRegionalOverlapImpactsHovered\(badge\.impacts, hovered\)/);
    assert.match(regionalMapSource, /<MapOverlapChooser/);
    assert.match(regionalMapSource, /onHoverImpact=\{hoverRegionalChooserImpact\}/);
    assert.match(regionalOverlaysSource, /const rootAnchor = pointInSvgRootCoordinates\(stationsLayer, placement\.anchor\)/);
    assert.match(regionalOverlaysSource, /const rootPosition = pointInSvgRootCoordinates\(stationsLayer, placement\.position\)/);
    assert.match(regionalOverlaysSource, /anchor: rootAnchor/);
    assert.match(regionalOverlaysSource, /position: rootPosition/);
    assert.match(regionalOverlaysSource, /preferredVector:\s*\{[\s\S]*rootPosition\.x - rootAnchor\.x/);
    assert.doesNotMatch(regionalOverlaysSource, /overlapLayerTransform/);
    assert.doesNotMatch(regionalOverlaysSource, /clampedRootPosition/);
    assert.match(regionalGeometrySource, /const candidates = \[1, -1\]\.map/);
    assert.match(regionalGeometrySource, /squaredPointDistance\(leftRoot, mapCenter\) - squaredPointDistance\(rightRoot, mapCenter\)/);
    assert.match(regionalGeometrySource, /const REGIONAL_OVERLAP_INDICATOR_EDGE_GAP = 88/);
    assert.match(regionalGeometrySource, /const renderedBadgeHalfExtent = \(/);
    assert.match(regionalGeometrySource, /REGIONAL_IMPACT_OVERLAY_WIDTH \/ 2[\s\S]*renderedBadgeHalfExtent[\s\S]*REGIONAL_OVERLAP_INDICATOR_EDGE_GAP/);
    assert.match(regionalOverlaysSource, /function regionalCollisionAdjustedOverlapBadges\(/);
    assert.match(regionalOverlaysSource, /querySelectorAll<SVGGraphicsElement>\("text"\)/);
    assert.match(regionalOverlaysSource, /\.regional-overlay-segment-group\[data-regional-impact-id\] \.regional-impact-path/);
    assert.match(regionalOverlaysSource, /#regional-lines-layer path\[id\^="regional-route-"\]/);
    assert.match(regionalGeometrySource, /function regionalPathCorridorCollisionBoxes\(/);
    assert.match(regionalOverlaysSource, /regionalOverlapBadgePositionCandidates\(badge\)/);
    // Collision priorities are exercised behaviorally in regional-overlap-placement.test.mjs.
    assert.match(regionalOverlaysSource, /regionalCollisionAdjustedOverlapBadges\(svg, badges\)/);
    assert.match(regionalOverlaysSource, /const stablePosition = overlapBadgePositions\.get\(badge\.markerId\)/);
    assert.match(regionalOverlaysSource, /hasStablePosition: Boolean\(stablePosition\)/);
    assert.match(regionalMapSource, /const animationFrame = window\.requestAnimationFrame\(\(\) => \{[\s\S]*positionRegionalOverlapChooser/);
    assert.doesNotMatch(regionalMapSource, /badge\.position\.x \+ deltaX \* authoredUnitsPerPixel/);
    assert.match(overlapIndicatorSource, /<OverlapKindCountBadge count=\{count\}/);
    assert.match(overlapChooserSource, /<strong>Choose Alert<\/strong>/);
    assert.match(overlapChooserSource, /data-overlap-choice-id=\{impact\.cardId\}/);
    assert.match(overlapChooserSource, /details\?\.closureDateLabel/);
    assert.match(overlapChooserSource, /overlap-chooser-choice-date/);
    assert.match(regionalMapSource, /mapOverlapChooserSize\(badge\.impacts\.length, logicalViewportSize\.width\)/);
    assert.match(regionalMapSource, /visibleMapChooserKeepouts\(\)/);
    assert.match(regionalMapSource, /observeMapChooserKeepouts/);
    assert.match(regionalMapSource, /uiKeepoutBoxes/);
    assert.match(regionalOverlaysSource, /entry\.uiOverlapArea === 0/);
    assert.match(regionalOverlaysSource, /if \(attempt\.clearsUiKeepouts\) break/);
    assert.match(regionalMapSource, /positionRegionalOverlapChooser\(expandedOverlapBadge\)/);
  });

  it("supports pointer, wheel, fit-network, and keyboard map interactions", () => {
    assert.match(regionalMapSource, /onWheel=\{onWheel\}/);
    assert.match(regionalMapSource, /onPointerDown=\{onPointerDown\}/);
    assert.match(regionalMapSource, /event\.key !== "Enter" && event\.key !== " "/);
    assert.match(regionalMapSource, /aria-label="(?:Center map view|Fit regional network)"/);
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
    assert.match(regionalMapSource, /readDesktopLeftOcclusion\(viewport, desktopMenuPinned/);
    assert.match(sidebarStateSource, /#linewatch-main-menu/);
    assert.match(sidebarStateSource, /\.floating-panel-shell/);
    assert.match(regionalMapSource, /focusInsets\.left = Math\.max\(focusInsets\.left, leftOcclusion\)/);
    assert.match(regionalMapSource, /const selectionFit = computeBoundedMapFrame\(/);
    assert.match(regionalMapSource, /REGIONAL_SELECTION_FIT_COMFORT_RATIO = 0\.82/);
    assert.match(regionalMapSource, /const targetScale = Math\.min\([\s\S]*clampPanZoomScale\(preferredTargetScale, effectiveFitScale\)[\s\S]*selectionFit\.scale \* REGIONAL_SELECTION_FIT_COMFORT_RATIO/);
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
    const pointerDownHandler = regionalMapSource.match(
      /const onPointerDown = useCallback\(\(event:[\s\S]*?\n  \}, \[[^\]]*\]\);/,
    )?.[0] ?? "";
    assert.match(pointerDownHandler, /endCameraMotion\(\)/);
    assert.doesNotMatch(pointerDownHandler, /beginCameraMotion\(\)/);
  });

  it("applies the TTC mobile performance contract to the regional camera and overlays", () => {
    assert.match(networkMapSource, /mobilePerformanceMode=\{props\.mobilePerformanceMode\}/);
    assert.match(regionalMapSource, /mobilePerformanceMode\?:\s*boolean/);
    assert.match(regionalMapSource, /const shouldAnimateProgrammaticTransform = !reducedMotion && !mobilePerformanceMode/);
    assert.doesNotMatch(regionalMapSource, /const \[isGestureActive, setIsGestureActive\] = useState/);
    assert.match(regionalMapSource, /root\.dataset\.mapGestureActive = active \? "true" : "false"/);
    assert.match(regionalMapSource, /data-map-gesture-active="false"/);
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

  it("centers the largest fitted default desktop network frame in the stable map workspace", () => {
    assert.match(regionalMapSource, /measureDesktopMapInsets/);
    assert.match(sidebarStateSource, /\.desktop-status-chip-row-container/);
    assert.match(regionalMapSource, /setDesktopMapTopInset/);
    assert.match(regionalMapSource, /setDesktopMapBottomInset/);
    assert.match(regionalMapSource, /computeDesktopMapFrame/);
    assert.match(regionalMapSource, /computeBoundedMapFrame/);
    assert.match(
      globalsCss,
      /\.regional-map-stage > div > svg\s*\{[^}]*display:\s*block;[^}]*width:\s*100%;[^}]*height:\s*100%;/s,
    );
    assert.match(regionalMapSource, /const REGIONAL_MAP_HORIZONTAL_INSET_RATIO = 0\.025/);
    assert.match(regionalMapSource, /const REGIONAL_MAP_DEFAULT_FRAME_SCALE = 0\.95/);
    assert.match(regionalMapSource, /const REGIONAL_MAP_DESKTOP_FRAME_SCALE = 1/);
    assert.doesNotMatch(regionalMapSource, /REGIONAL_MAP_DESKTOP_VERTICAL_OPTICAL_OFFSET_RATIO/);
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
    assert.match(regionalMapSource, /mapStageRef\.current\.style\.transform = orientedMapCameraTransform\(/);
    assert.match(regionalMapSource, /logicalViewportSizeForOrientation/);
    assert.doesNotMatch(regionalMapSource, /transform: `translate\(\$\{camera\.x\}/);
    assert.match(regionalMapSource, /transformOrigin: "0 0"/);
    assert.match(regionalAssetSource, /root\.setAttribute\("preserveAspectRatio", "xMidYMid meet"\)/);
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

  it("matches TTC's paint-only Center feedback without compositor fade layers", () => {
    assert.match(regionalMapSource, /setMapTransition\(`transform \$\{durationMs\}ms \$\{easing\}`\)/);
    assert.match(regionalMapSource, /const snapCameraToNetwork = useCallback[\s\S]*setMapTransition\("none"\)[\s\S]*writeMapTransform\(targetCamera\)/);
    assert.match(regionalMapSource, /snapCameraToNetwork\(fitted\.camera, fitted\.scale\)/);
    assert.match(regionalMapSource, /setCamera\(\(current\) => \([\s\S]*current\.x === targetCamera\.x[\s\S]*\? current[\s\S]*: targetCamera/);
    assert.doesNotMatch(regionalMapSource, /useMapRecenterFade|RECENTER_FADE_ANIMATION_ID|recenterVeilRef|playRecenterFade/);
    assert.doesNotMatch(regionalMapSource, /startViewTransition|regionalRecenterTransition|MapViewTransition/);
    assert.doesNotMatch(globalsCss, /regional-map-recenter-fade-in|data-regional-recenter-transition|view-transition-name:\s*regional-map-recenter/);
    assert.doesNotMatch(globalsCss, /map-recenter-veil|data-map-recenter-effect/);
    assert.match(regionalMapSource, /if \(resetNetworkCamera\(\) && !reducedMotion\)\s*\{\s*setRecenterFeedbackKey/);
    assert.match(regionalMapSource, /className="map-center-feedback"[\s\S]*data-map-center-feedback="regional"/);
    assert.match(globalsCss, /\.map-center-feedback\s*\{[^}]*background-color:\s*transparent;[^}]*animation:\s*map-center-feedback-fade/s);
    assert.doesNotMatch(globalsCss, /\.map-center-feedback\s*\{[^}]*(?:opacity|will-change):/s);
    assert.match(globalsCss, /mobile-performance-mode :is\(\.ttc-map-stage, \.regional-map-stage\)\s*\{[^}]*will-change:\s*auto/s);
    assert.doesNotMatch(globalsCss, /\.regional-map-stage\s*\{[^}]*will-change:\s*opacity/s);
    assert.doesNotMatch(regionalMapSource, /className="regional-map-scene"/);
    assert.doesNotMatch(regionalMapSource, /RECENTER_CAMERA_MOTION/);
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

  it("smooths coarse regional wheel notches while retaining direct camera writes", () => {
    const wheelHandler = regionalMapSource.match(
      /const onWheel = useCallback\(([\s\S]*?)\n  \}, \[[^\]]*\]\);/,
    )?.[1] ?? "";

    assert.match(wheelHandler, /setMapTransition\(shouldAnimateProgrammaticTransform \? "transform 0\.1s ease-out" : "none"\)/);
    assert.match(wheelHandler, /setUserZoomMotion\(true\)/);
    assert.doesNotMatch(wheelHandler, /beginCameraMotion\(\)/);
    assert.match(wheelHandler, /cameraRef\.current = nextCamera;[\s\S]*writeMapTransform\(nextCamera\)/);
    assert.match(wheelHandler, /window\.setTimeout\(\(\) => \{[\s\S]*setCamera\(\{ \.\.\.cameraRef\.current \}\)/);
  });

  it("preserves regional overlay glows while user zoom is active", () => {
    assert.match(regionalMapSource, /root\.dataset\.mapZoomActive = active \? "true" : "false"/);
    assert.match(regionalMapSource, /const setUserZoomMotion = useCallback/);
    assert.match(globalsCss, /\[data-map-zoom-active="true"\]/);
  });

  it("keeps animated regional alert artwork stable while the camera is moving", () => {
    assert.match(regionalMapSource, /const regionalMapRef = useRef<HTMLElement>\(null\)/);
    assert.doesNotMatch(regionalMapSource, /root\.classList\.toggle\("regional-map-camera-moving", active\)/);
    assert.match(regionalMapSource, /root\.dataset\.regionalMapCameraMoving = active \? "true" : "false"/);
    assert.doesNotMatch(regionalMapSource, /\.pauseAnimations\(\)/);
    assert.doesNotMatch(regionalMapSource, /\.unpauseAnimations\(\)/);
    assert.match(regionalMapSource, /beginCameraMotion\(\)/);
    assert.match(regionalMapSource, /endCameraMotion\(\)/);
    assert.match(regionalMapSource, /clearProgrammaticAnimation[\s\S]*wheelCommitTimeoutRef\.current = null/);
    assert.match(
      globalsCss,
      /\.regional-map\[data-regional-map-camera-moving="true"\] \.regional-map-stage :is\([\s\S]*?\.regional-impact-path[\s\S]*?animation-play-state:\s*paused\s*!important;[\s\S]*?transition:\s*none\s*!important;/s,
    );
    assert.doesNotMatch(globalsCss, /\.regional-map-camera-moving \.regional-map-stage \*/);
    const cameraMotionSimplification = globalsCss.slice(
      globalsCss.indexOf('.regional-map[data-regional-map-camera-moving="true"] .regional-map-stage :is('),
      globalsCss.indexOf(".regional-map-stage > svg,"),
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
    assert.equal((regionalMapSource.match(/setSvgMarkup\(/g) ?? []).length, 1);
    assert.match(regionalMapSource, /preloadRegionalMapMarkup\(\)[\s\S]*?setSvgMarkup\(markup\)[\s\S]*?\n  \}, \[\]\);/s);
    assert.match(regionalAssetSource, /const url = `\$\{source\}\$\{separator\}v=\$\{encodeURIComponent\(lineWatchBuildLabel\)\}`;/);
    assert.match(regionalAssetSource, /fetch\(url\)/);
    assert.match(regionalOverlaysSource, /REGIONAL_DYNAMIC_SEGMENT_LAYER_ID = "regional-dynamic-segment-layer"/);
    assert.match(regionalOverlaysSource, /REGIONAL_DYNAMIC_SELECTED_SEGMENT_LAYER_ID = "regional-dynamic-selected-segment-layer"/);
    assert.match(regionalOverlaysSource, /REGIONAL_DYNAMIC_STATION_RING_LAYER_ID = "regional-dynamic-station-ring-layer"/);
    assert.match(regionalOverlaysSource, /REGIONAL_DYNAMIC_COMMUTE_LAYER_ID = "regional-dynamic-commute-layer"/);
    assert.match(regionalOverlaysSource, /REGIONAL_DYNAMIC_HOVER_LAYER_ID = "regional-dynamic-hover-layer"/);
    assert.match(regionalOverlaysSource, /REGIONAL_DYNAMIC_EFFECTS_LAYER_ID = "regional-dynamic-effects-layer"/);
    assert.match(regionalOverlaysSource, /segmentLayer\.replaceChildren\(\)/);
    assert.match(regionalOverlaysSource, /selectedSegmentLayer\?\.replaceChildren\(\)|if \(selectedSegmentLayer\) selectedSegmentLayer\.replaceChildren\(\)/);
    assert.match(regionalOverlaysSource, /stationRingLayer\.replaceChildren\(\)/);
    assert.match(regionalOverlaysSource, /effectsLayer\.replaceChildren\(\)/);
    assert.doesNotMatch(regionalMapSource, /mapStageRef\.current\.replaceChildren/);
    assert.match(regionalAssetSource, /element\.style\.removeProperty\("shape-rendering"\)/);
    assert.match(regionalOverlaysSource, /bringRegionalImpactToFront\((?:root|viewport), selection\.kind, selection\.id, Boolean\((?:commutePathPreview|data\.commutePathPreview)\)\)/);
    assert.match(globalsCss, /\.regional-overlay-segment-group\[data-selected-commute-impact-overlay\] \.regional-impact-aura[\s\S]*?animation:\s*none\s*!important/s);
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
      /isPointerGestureActive:\s*\(\)\s*=>\s*activePointersRef\.current\.size\s*>\s*0/,
    );
    assert.match(
      regionalOverlaysSource,
      /const handlePointerMove = \(event: globalThis\.PointerEvent\) => \{\s*if \(options\?\.isPointerGestureActive\?\.\(\)\) return;/s,
    );
  });

  it("refits an untouched camera on resize and preserves a user-adjusted camera", () => {
    const resizeObserverBody = regionalMapSource.match(/const observer = new ResizeObserver\(\(\) => \{([\s\S]*?)\n    \}\);/)?.[1] ?? "";
    assert.match(resizeObserverBody, /if \(!cameraInitializedRef\.current\)/);
    assert.doesNotMatch(resizeObserverBody, /refitUntouchedNetwork\(\)/);
    assert.match(regionalMapSource, /const handleWindowResize = \(\) => \{\s*if \(automaticResizeRefitBlockedRef\.current\) return;\s*refitUntouchedNetwork\(\)/s);
    assert.match(regionalMapSource, /if \(!cameraInitializedRef\.current \|\| cameraAdjustedByUserRef\.current\) return/);
    assert.match(regionalMapSource, /cameraAdjustedByUserRef\.current = true/);
  });

  it("does not replay a stale recenter command after a remount or refresh", () => {
    assert.match(regionalMapSource, /const lastRecenterSignalRef = useRef\(recenterSignal\)/);
    assert.match(regionalMapSource, /recenterSignal === lastRecenterSignalRef\.current/);
    assert.match(ttcMapSource, /const lastRecenterSignalRef = useRef\(recenterSignal \?\? 0\)/);
    assert.match(ttcMapSource, /recenterSignal === lastRecenterSignalRef\.current/);
  });

  it("does not refit an initialized camera when refreshed dashboard data updates dynamic layers", () => {
    assert.match(regionalMapSource, /if \(cameraInitializedRef\.current \|\| !svgMarkup\) return/);
    assert.match(regionalMapSource, /cameraInitializedRef\.current = true/);
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
